/**
 * convex/ai/orchestrator/zodErrorFormatter.ts
 *
 * Converts a ZodError thrown by tool input validation into a string that
 * is *useful for the model*, not the raw `.errors[].path` array.
 *
 * Why this exists (PHASE-3-AI-AUDIT.md §1, row 4):
 *   The screenshot bug included this in the agent's reasoning trace:
 *
 *     ✗ ask_user_input failed: validation failed on: fields, fields. Empty message.
 *
 *   Root cause: when `ask_user_input.execute` got malformed args, the AI
 *   SDK propagated the ZodError verbatim. The model received a JSON blob
 *   that listed paths but no expected types, no working example, and no
 *   actionable suggestion. So it retried with the same args. Loop.
 *
 * Fix: wrap every tool's execute() with `wrapWithZodErrorFormatter()`. If
 * the call throws a ZodError (or anything that quacks like one — many
 * AI SDK validators rewrap), we catch it, build a structured hint, and
 * return a `tool-result` shape that says, in plain English:
 *
 *   "I couldn't run that. The argument `fields` is required and expects
 *   a non-empty array of strings. Here's a working example: { fields:
 *   ["name","email"] }. Please call again with valid args."
 *
 * The wrapped execute() never throws — every failure becomes a successful
 * tool-result the model can read on the next step.
 *
 * IMPORTANT: this only handles INPUT validation errors. Errors from the
 * underlying mutation (e.g. ConvexError "permission denied") still flow
 * through `runTool` in `tools/_shared.ts`.
 */

import { ZodError, type ZodIssue } from "zod";

// ─── Types ─────────────────────────────────────────────────────────────────

/**
 * Error shape we return to the model in place of a raw ZodError. The
 * structure intentionally mirrors what the model *would write* if it
 * could see its own mistake — paths, expected type, what we got, and a
 * runnable example.
 */
export type FormattedToolError = {
	ok: false;
	error: string;
	code: "TOOL_INPUT_VALIDATION";
	issues: Array<{
		path: string;
		expected: string;
		received: string;
		message: string;
	}>;
	example?: Record<string, unknown>;
	hint: string;
};

// ─── Public API ───────────────────────────────────────────────────────────

/**
 * Wrap a tool's execute() so any ZodError thrown during input parsing
 * becomes a structured `FormattedToolError` returned as the tool-result.
 *
 * Usage in toolRegistry / per-tool registration:
 *
 *   execute: wrapWithZodErrorFormatter("ask_user_input", originalExecute, {
 *     fields: ["What is your email?"],
 *   })
 *
 * The third argument is a static "working example" — used in the hint so
 * the model sees what valid args look like. If you don't supply one we
 * fall back to a generic "match the schema" instruction.
 */
export function wrapWithZodErrorFormatter<I, O>(
	toolName: string,
	execute: (input: I) => Promise<O>,
	example?: Record<string, unknown>,
): (input: I) => Promise<O | FormattedToolError> {
	return async (input: I) => {
		try {
			return await execute(input);
		} catch (err) {
			// `instanceof ZodError` works for Zod thrown directly; the AI
			// SDK sometimes wraps it. Detect both.
			const zerr = isZodLike(err) ? err : null;
			if (!zerr) throw err; // not our concern, rethrow
			const formatted = formatZodError(toolName, zerr, example);
			// Log for our own debugging — the model only sees the return value.
			console.warn(
				`[zodErrorFormatter] ${toolName} input validation failed:`,
				formatted.issues,
			);
			return formatted;
		}
	};
}

/**
 * Build the `FormattedToolError` payload from a ZodError. Exported for
 * tests; production code should use `wrapWithZodErrorFormatter`.
 */
export function formatZodError(
	toolName: string,
	err: ZodError | ZodLike,
	example?: Record<string, unknown>,
): FormattedToolError {
	const issues = (err.issues ?? []).map((issue) => ({
		path: pathToString(issue.path),
		expected: extractExpected(issue),
		received: extractReceived(issue),
		message: issue.message ?? "Invalid value.",
	}));

	const lines: string[] = [
		`The arguments you passed to \`${toolName}\` did not match its schema.`,
	];
	for (const i of issues) {
		const where = i.path ? `\`${i.path}\`` : "the input";
		const what = i.expected
			? `expected ${i.expected}${i.received && i.received !== "undefined" ? `, got ${i.received}` : ""}`
			: i.message;
		lines.push(`• ${where}: ${what}`);
	}
	if (example) {
		lines.push(`\nExample of valid args: ${JSON.stringify(example)}`);
	} else {
		lines.push("\nFix the listed fields and call the tool again.");
	}
	lines.push("Do NOT retry with identical arguments — the result will be the same.");

	return {
		ok: false,
		error: `Invalid arguments for ${toolName}.`,
		code: "TOOL_INPUT_VALIDATION",
		issues,
		example,
		hint: lines.join("\n"),
	};
}

// ─── Helpers ──────────────────────────────────────────────────────────────

/**
 * Minimal duck-typed ZodError shape. Some SDK code paths rewrap the
 * original ZodError, losing `instanceof`. We accept anything that has a
 * `.issues` array of ZodIssue-shaped objects.
 */
type ZodLike = { issues: ZodIssue[]; name?: string };

function isZodLike(err: unknown): err is ZodError | ZodLike {
	if (err instanceof ZodError) return true;
	if (typeof err !== "object" || err === null) return false;
	const maybe = err as { issues?: unknown; name?: unknown };
	if (!Array.isArray(maybe.issues)) return false;
	if (maybe.issues.length === 0) return false;
	const first = maybe.issues[0] as { code?: unknown; path?: unknown } | undefined;
	return !!first && typeof first.code === "string" && Array.isArray(first.path);
}

function pathToString(path: ReadonlyArray<PropertyKey>): string {
	if (!path || path.length === 0) return "";
	return path
		.map((segment, idx) => {
			if (typeof segment === "number") return `[${segment}]`;
			const text = String(segment);
			return idx === 0 ? text : `.${text}`;
		})
		.join("");
}

/**
 * Pull a human-readable "expected" type out of a ZodIssue. Different
 * issue codes carry the info in different fields, so we normalise.
 */
function extractExpected(issue: ZodIssue): string {
	const i = issue as ZodIssue & {
		expected?: string;
		options?: unknown[];
		values?: unknown[];
		minimum?: number;
		maximum?: number;
		type?: string;
		format?: string;
	};
	switch (i.code) {
		case "invalid_type":
			return i.expected ?? "(type)";
		case "invalid_value": {
			// Zod v4: covers what was invalid_enum_value / invalid_literal in v3.
			const choices = Array.isArray(i.values)
				? i.values
				: Array.isArray(i.options)
					? i.options
					: null;
			return choices
				? `one of [${choices.map((o: unknown) => JSON.stringify(o)).join(", ")}]`
				: "an allowed value";
		}
		case "too_small":
			return i.type === "array"
				? `array with at least ${i.minimum} item(s)`
				: i.type === "string"
					? `string of length ≥ ${i.minimum}`
					: `value ≥ ${i.minimum}`;
		case "too_big":
			return i.type === "array"
				? `array with at most ${i.maximum} item(s)`
				: i.type === "string"
					? `string of length ≤ ${i.maximum}`
					: `value ≤ ${i.maximum}`;
		case "invalid_format":
			// Zod v4: replaces invalid_string. `format` carries email/uuid/url/etc.
			return i.format ? `a valid ${i.format}` : "a valid string format";
		case "unrecognized_keys":
			return "no extra keys";
		case "custom":
			return ""; // message field carries the info
		default:
			return "";
	}
}

function extractReceived(issue: ZodIssue): string {
	const i = issue as ZodIssue & { received?: unknown };
	if (i.received === undefined) return "";
	if (i.received === null) return "null";
	if (typeof i.received === "string") return i.received;
	return JSON.stringify(i.received);
}

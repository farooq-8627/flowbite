/**
 * convex/ai/tools/_shared.ts
 *
 * RBAC helpers, error wrapping, and activity logging for AI tool handlers.
 * Every tool's execute() should call these at the appropriate points.
 *
 * Security model (4 layers):
 *   1. Auth: processChat verifies membership before any tool runs
 *   2. Tool filtering: toolRegistry filters by permission before exposing to model
 *   3. Per-tool RBAC: each execute() calls requirePermission() (defence-in-depth)
 *   4. DB layer: underlying org mutations enforce RBAC independently
 */
import { ConvexError } from "convex/values";
import type { Id } from "../../_generated/dataModel";
import type { ActionCtx } from "../../_generated/server";

// ─── Types ────────────────────────────────────────────────────────────────────

/** ctx typed as ActionCtx — tools always run inside processChat's internalAction. */
export type ToolContext = {
	ctx: ActionCtx;
	orgId: Id<"orgs">;
	userId: Id<"users">;
	permissions: string[];
	conversationId: Id<"aiConversations">;
};

/**
 * Rewrite a public path `"foo/bar/queries:baz"` into the internal twin
 * `"foo/bar/queries:bazForAI"`. The twin is defined next to the public
 * handler with the same body but takes `userId` as an arg and validates
 * via `requireOrgMemberByIds` instead of `getAuthUserId`.
 *
 * **Why this exists.** Tools run inside `processChat.run`, an
 * `internalAction` scheduled via `ctx.scheduler.runAfter`. Per the
 * Convex docs, scheduled actions DO NOT propagate auth identity:
 *
 * > The auth is not propagated from the scheduling to the scheduled
 * > function. If you want to authenticate or check authorization,
 * > you'll have to pass the requisite user information in as a parameter.
 * >    — https://docs.convex.dev/scheduling/scheduled-functions#auth
 *
 * The tool layer therefore can NEVER call public `orgQuery`/`orgMutation`
 * via `ctx.runQuery`/`ctx.runMutation`. Every AI-callable read/write must
 * have an internal twin that takes `userId` explicitly. This helper
 * rewrites the path automatically so individual tool files keep the
 * familiar public path strings.
 */
function aiPath(publicPath: string): string {
	const colon = publicPath.lastIndexOf(":");
	if (colon === -1) {
		throw new Error(
			`[ai/_shared] aiPath() got a path without a colon: "${publicPath}". Tools must use the public path string convention "module:export".`,
		);
	}
	// Paths under `convex/ai/*` are already internal-only — no twin needed.
	// (The orchestrator owns these and calls them via ctx.runMutation directly.)
	if (publicPath.startsWith("ai/")) return publicPath;
	const exported = publicPath.slice(colon + 1);
	if (exported.endsWith("ForAI")) return publicPath; // already migrated
	return `${publicPath.slice(0, colon)}:${exported}ForAI`;
}

/**
 * Run a mutation from inside a tool execute() function.
 *
 * Routes through the public path's internal twin (suffix `ForAI`) and
 * injects the trusted `userId` from the supplied `ToolContext`. The
 * twin validates membership via `requireOrgMemberByIds` and runs the
 * SAME implementation body as its public sibling.
 *
 * **Usage.** Pass the full `ToolContext` (the return value of `getCtx()`):
 *
 * ```ts
 * const tc = getCtx();
 * await toolMutation(tc, "crm/x/mutations:create", { orgId, ...args });
 * ```
 *
 * The helper rewrites the path to `crm/x/mutations:createForAI` and
 * forwards `{ ...args, userId: tc.userId }`.
 *
 * For paths already under `convex/ai/*` (orchestrator-owned internal
 * mutations like `patchContextBag`), the path is left unchanged and
 * `userId` is NOT auto-injected — those handlers manage their own
 * trusted-arg shape.
 */
export function toolMutation(
	tc: ToolContext,
	path: string,
	args: Record<string, unknown>,
): Promise<unknown> {
	const isInternalAi = path.startsWith("ai/");
	const finalArgs = isInternalAi ? args : { ...args, userId: tc.userId };
	return tc.ctx.runMutation(aiPath(path) as never, finalArgs as never);
}

/**
 * Run a query from inside a tool execute() function. See `toolMutation`
 * for the path-rewriting + userId-injection rationale.
 */
export function toolQuery(
	tc: ToolContext,
	path: string,
	args: Record<string, unknown>,
): Promise<unknown> {
	const isInternalAi = path.startsWith("ai/");
	const finalArgs = isInternalAi ? args : { ...args, userId: tc.userId };
	return tc.ctx.runQuery(aiPath(path) as never, finalArgs as never);
}

export type ToolResult<T = unknown> =
	| { ok: true; data: T; display?: string | ToolDisplay }
	| { ok: false; error: string; code?: string };

// ─── ToolDisplay — Sprint 3 doctrine ─────────────────────────────────────────
//
// Discriminated union that lets a tool declare HOW its result should render in
// chat. The frontend `ToolResultRenderer` reads `kind` and dispatches to the
// matching component. See `TOOL-RESULT-RENDERING.md` for the doctrine.
//
// Backwards compatibility: existing tools return `display: "<text>"` (a plain
// string). The renderer treats string `display` as `{ kind: "text", text }`.
//
// New tools should prefer the structured kinds — they let chat re-use the same
// entity cards the rest of the app already uses (LeadCard, DealCard, etc.) so
// the chat is a live view into the data, not a snapshot in markdown.
//
// Tool authors: pick the right kind for the result type. The model's prose
// reply still appears ABOVE the rendered card — e.g. "Here are 3 leads:" + 3
// LeadCards rendered live below.

export type ToolDisplay =
	| { kind: "text"; text: string }
	| {
			kind: "entity";
			entityType: "lead" | "contact" | "deal" | "company";
			entityId: string;
	  }
	| {
			kind: "entityList";
			entityType: "lead" | "contact" | "deal" | "company";
			entityIds: string[];
	  }
	/** Resolved client-side via getByPersonCode. */
	| { kind: "personCode"; personCode: string }
	/** Resolved client-side via getByDealCode. */
	| { kind: "dealCode"; dealCode: string }
	| { kind: "note"; noteId: string }
	| { kind: "reminder"; reminderId: string }
	| {
			kind: "diff";
			entityType: "lead" | "contact" | "deal" | "company";
			entityId: string;
			before: Record<string, unknown>;
			after: Record<string, unknown>;
	  }
	| { kind: "insight"; insightId: string }
	| { kind: "settings"; sectionId: string }
	/**
	 * Escape hatch. The componentKey must be registered in
	 * `core/ai/components/results/CustomResultRegistry.tsx`. Tool authors
	 * cannot inject keys that don't exist — adding a new key requires a code
	 * review for the matching component.
	 */
	| { kind: "custom"; componentKey: string; props: Record<string, unknown> };

// ─── RBAC enforcement ─────────────────────────────────────────────────────────

/**
 * Verify the calling user holds a specific permission.
 * Throws a user-friendly ConvexError if not.
 * Called inside every tool's execute() as defence-in-depth.
 */
export function requirePermission(permissions: string[], permission: string): void {
	if (!permissions.includes(permission)) {
		throw new ConvexError({
			code: "AI_TOOL_UNAUTHORIZED",
			message: `You don't have permission to perform this action (requires: ${permission}).`,
		});
	}
}

/**
 * Verify the user holds at least one of the supplied permissions.
 */
export function requireAnyPermission(permissions: string[], anyOf: string[]): void {
	if (!anyOf.some((p) => permissions.includes(p))) {
		throw new ConvexError({
			code: "AI_TOOL_UNAUTHORIZED",
			message: `You don't have permission to perform this action.`,
		});
	}
}

// ─── Two-step confirmation helpers ───────────────────────────────────────────

/**
 * Build a standardised "propose" response for two-step confirmation.
 * The AI returns this JSON; the frontend renders a ChatConfirmation card.
 */
export function propose<T extends Record<string, unknown>>(
	toolName: string,
	args: T,
	preview: { title: string; fields: Array<{ label: string; value: unknown }> },
): ToolResult<never> & { requiresConfirmation: true; confirmationPayload: unknown } {
	return {
		ok: false as const,
		error: `Awaiting user confirmation to ${toolName}.`,
		requiresConfirmation: true as const,
		confirmationPayload: { tool: toolName, args, preview },
	};
}

// ─── Error wrapping ───────────────────────────────────────────────────────────

/**
 * Wrap a tool handler so errors are caught and returned as ToolResult failures
 * rather than bubbling up as raw exceptions. Raw exceptions would be logged
 * by processChat but we want structured, user-friendly output.
 */
export async function runTool<T>(fn: () => Promise<ToolResult<T>>): Promise<ToolResult<T>> {
	try {
		return await fn();
	} catch (err) {
		if (err instanceof ConvexError) {
			return {
				ok: false,
				error: (err.data as { message?: string })?.message ?? "Action failed.",
				code: (err.data as { code?: string })?.code,
			};
		}
		// Log unexpected errors — don't expose stack to AI/user
		console.error("[AI tool error]", err);
		return {
			ok: false,
			error: "An unexpected error occurred. Please try again.",
		};
	}
}

// ─── Activity logging for AI actions ─────────────────────────────────────────

/**
 * Log an AI tool call to the org's activity log.
 * Must be called from within a processChat internalAction via ctx.runMutation.
 */
export { logActivity } from "../../activityLogs/helpers";

// ─── Schema coercion helpers ─────────────────────────────────────────────────
//
// LLMs (especially smaller ones like Llama-3.3-70B and Kimi) routinely emit
// `null` or empty strings for optional fields, even when instructed to omit
// them. Vanilla `z.optional(z.string())` rejects both, which triggers a Zod
// validation failure → the model sees a JSON error blob → it retries with
// the same args → infinite loop.
//
// These preprocess helpers normalise null/""/whitespace-only into `undefined`
// BEFORE the inner validator runs. The result: optional fields become truly
// optional, and required fields fail with a clean "expected string" message
// when missing instead of a confusing "received null".
//
// Use them in tool schemas:
//   email: optionalString(z.string().email())
//   name:  requiredString(z.string().min(1))
//   notes: optionalString()                  // any string
//   tags:  optionalArray(z.array(z.string()))

import { z } from "zod";

/** True if v is null, undefined, or a string that's empty/whitespace-only. */
function isEmptyish(v: unknown): boolean {
	if (v === null || v === undefined) return true;
	if (typeof v === "string" && v.trim().length === 0) return true;
	return false;
}

/**
 * Coerces null / "" / whitespace-only → undefined, then applies the inner
 * validator (defaults to plain `z.string()`). The returned schema is always
 * `.optional()`. Use for optional string-shaped fields.
 *
 * Example:
 *   email: optionalString(z.string().email())
 *   phone: optionalString()
 */
export function optionalString<T extends z.ZodTypeAny = z.ZodString>(
	inner?: T,
): z.ZodOptional<z.ZodTypeAny> {
	const schema = (inner ?? z.string()) as z.ZodTypeAny;
	return z.preprocess((v) => (isEmptyish(v) ? undefined : v), schema).optional() as never;
}

/**
 * Coerces null / "" / whitespace-only → undefined, then forwards to the inner
 * array validator. Defaults to `z.array(z.string())`. Returns optional.
 *
 * Example:
 *   tags: optionalArray()
 *   ids:  optionalArray(z.array(z.string().min(1)))
 */
export function optionalArray<T extends z.ZodTypeAny = z.ZodArray<z.ZodString>>(
	inner?: T,
): z.ZodOptional<z.ZodTypeAny> {
	const schema = (inner ?? z.array(z.string())) as z.ZodTypeAny;
	return z
		.preprocess(
			(v) => (isEmptyish(v) || (Array.isArray(v) && v.length === 0) ? undefined : v),
			schema,
		)
		.optional() as never;
}

/**
 * Coerces null / "" → undefined, then applies the inner number validator.
 * For LLMs that emit `0`, `null`, or `""` for "no value".
 */
export function optionalNumber<T extends z.ZodTypeAny = z.ZodNumber>(
	inner?: T,
): z.ZodOptional<z.ZodTypeAny> {
	const schema = (inner ?? z.number()) as z.ZodTypeAny;
	return z.preprocess((v) => (isEmptyish(v) ? undefined : v), schema).optional() as never;
}

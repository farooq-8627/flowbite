/**
 * Project a Capability into an AI SDK v6 Tool. The SDK input schema is
 * permissive (object passthrough); the strict parse runs INSIDE
 * `runCapability` so a bad arg becomes a `repair` envelope the model can
 * self-correct from on the next step — instead of an SDK-level
 * TypeValidationError that bypasses our formatter.
 *
 * The full spec is baked into the tool description so the model still
 * knows what to send.
 */
import { tool as aiTool, type Tool } from "ai";
import { z } from "zod";
import { resolveRef as defaultResolveRef } from "../resolveRef";
import type { Capability, CapabilityCtx, CapabilityResult } from "../types";
import { type RefResolver, runCapability } from "../wrapper";

/**
 * Permissive AI-SDK input schema: a passthrough object that accepts any
 * field shape. Used for every capability we project — the strict schema
 * runs INSIDE `runCapability` so a parse failure becomes `repair`, not a
 * SDK-level `TypeValidationError`.
 */
const PERMISSIVE_INPUT = z.object({}).passthrough();

/**
 * Build the description string the SDK exposes to the model. We bake the
 * capability's full spec into it so the loose `inputSchema` doesn't lose
 * information — the model reads the description and emits well-formed args
 * even though the SDK won't validate them.
 */
export function buildDescription(cap: Capability): string {
	const lines: string[] = [];
	lines.push(cap.spec.whenToCall.trim());

	if (cap.spec.whenNotToCall) {
		lines.push("", `Do NOT call when: ${cap.spec.whenNotToCall.trim()}`);
	}
	if (cap.spec.requiredClarifications && cap.spec.requiredClarifications.length > 0) {
		lines.push(
			"",
			`Required arguments: ${cap.spec.requiredClarifications.map((s) => `\`${s}\``).join(", ")}.`,
		);
	}
	if (cap.spec.synonyms && cap.spec.synonyms.length > 0) {
		lines.push("", `Common phrasings: ${cap.spec.synonyms.map((s) => `"${s}"`).join(", ")}.`);
	}
	lines.push(
		"",
		"Good example arguments:",
		"```json",
		JSON.stringify(cap.spec.goodExample, null, 2),
		"```",
	);
	if (cap.spec.badExample) {
		lines.push(
			"",
			"Anti-example (do NOT do this):",
			"```json",
			JSON.stringify(cap.spec.badExample.args, null, 2),
			"```",
			`Why bad: ${cap.spec.badExample.why}`,
		);
	}
	return lines.join("\n");
}

/**
 * The shape every projected execute() returns to the SDK — a JSON-able
 * subset of {@link CapabilityResult}. The full envelope flows through
 * verbatim so the model can read `status`, `repair`, etc.
 */
export type ProjectedToolOutput = CapabilityResult;

/** Resolve the per-call {@link CapabilityCtx} when the tool's execute fires. */
export type CapabilityCtxResolver = () => CapabilityCtx;

/**
 * Project one capability into an AI SDK v6 `Tool`. The host (`runtime/
 * host.ts`) calls {@link projectAll} to build the tools dict it hands to
 * `streamText`. The `getCtx` thunk supplies a fresh {@link CapabilityCtx}
 * per turn (channel, principal, conversationId, stepUpToken).
 *
 * `resolve` defaults to the real `resolveRef` (resolves `code`/`personCode`/
 * etc. against live `*ForAI` queries). Tests can inject a stub for
 * deterministic assertions without DB calls.
 */
export function projectCapability(
	cap: Capability,
	getCtx: CapabilityCtxResolver,
	resolve: RefResolver = defaultResolveRef,
): Tool {
	return aiTool({
		description: buildDescription(cap),
		inputSchema: PERMISSIVE_INPUT,
		// Carry the canonical good-shape example through. Providers that surface
		// examples in their tool definition get them; ones that don't ignore.
		inputExamples: [{ input: cap.spec.goodExample as Record<string, unknown> }],
		execute: async (rawArgs: unknown): Promise<ProjectedToolOutput> => {
			let envelope: CapabilityResult;
			try {
				envelope = await runCapability(cap, rawArgs, getCtx(), resolve);
			} catch (err) {
				// Belt-and-braces: runCapability is contractually never-throws
				// (see wrapper.test.ts), so this catch only fires when the
				// host runtime itself fails (e.g. ctx resolver throws). The
				// model still sees a typed envelope.
				const message = err instanceof Error ? err.message : String(err);
				envelope = {
					status: "business_error",
					headline: `The "${cap.name}" capability failed unexpectedly.`,
					errors: [{ item: cap.name, reason: truncate(message) }],
				};
			}
			return envelope;
		},
	});
}

/**
 * Project a list of capabilities into a {name → Tool} map suitable for
 * `streamText({ tools })`. Tool authors can use `cap.name` directly in
 * `prepareStep.activeTools` to enable/disable per step.
 */
export function projectAll(
	caps: Capability[],
	getCtx: CapabilityCtxResolver,
	resolve: RefResolver = defaultResolveRef,
): Record<string, Tool> {
	const tools: Record<string, Tool> = {};
	for (const cap of caps) {
		tools[cap.name] = projectCapability(cap, getCtx, resolve);
	}
	return tools;
}

function truncate(s: string, max = 200): string {
	return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

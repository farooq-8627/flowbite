/**
 * convex/ai/tools/contextBag.ts
 *
 * Week 3.2 — `PHASE-3-AI-AUDIT.md §6 Week 3` & §2.4 (Salesforce L4
 * variables).
 *
 * `set_context_var` lets the model persist user-supplied facts onto
 * `aiConversations.contextBag` so subsequent turns don't have to ask
 * again. Example:
 *
 *   Turn 1 — user: "my preferred currency is AED"
 *   Turn 1 — model calls set_context_var({ key: "preferred_currency", value: "AED" })
 *   Turn 5 — system prompt now includes:
 *           ## Facts already known
 *           - preferred_currency = AED
 *
 * Discipline:
 *   - Keys are snake_case [a-z][a-z0-9_]{0,63}. Anything else is rejected
 *     by Zod with a model-readable hint via the existing wrapper.
 *   - Values are JSON-serialisable primitives, plain objects, or arrays
 *     of primitives. NO Convex IDs (those belong in proper tables; the
 *     contextBag is for user prose facts, not foreign keys).
 *   - The whole bag is capped at ~4KB. Beyond that, the oldest keys are
 *     evicted FIFO. The cap protects the system-prompt cost: the bag is
 *     injected on EVERY turn, so growth there is real money.
 *   - `delete: true` removes the key. Useful when the user retracts a
 *     fact ("actually use USD, not AED").
 *   - Always-on, no permission check (every chat user can persist their
 *     own facts; the bag is per-conversation and per-user).
 */
import { z } from "zod";
import { registerTool } from "../toolRegistry";
import { runTool, type ToolContext, toolMutation } from "./_shared";

let _ctx: ToolContext | null = null;
export function setContextBagToolContext(c: ToolContext): void {
	_ctx = c;
}
function getCtx(): ToolContext {
	if (!_ctx) throw new Error("contextBag tool ctx not initialized");
	return _ctx;
}

const KEY_PATTERN = /^[a-z][a-z0-9_]{0,63}$/;

registerTool({
	name: "set_context_var",
	layer: "always",
	permission: null, // every ai.use member can write to their own conversation bag
	confirmation: "none",
	description: `
Persist or delete a typed fact in this conversation's context bag.
Use when the user STATES a fact you'll need later (preferred currency,
their role, the deal they care about, an industry-specific term).
The fact is auto-injected into your system prompt on every subsequent
turn under "Facts already known" so you never have to re-ask.

Key rules:
  - 'key' is snake_case, starts with a letter, max 64 chars.
  - 'value' is a string, number, boolean, or short JSON object.
  - Pass 'delete: true' (with no value) to remove a key.
  - Don't use this for transient context (search results, current cursor)
    — only for facts the user explicitly stated and that should outlive
    the next 3-4 turns.
	`.trim(),
	runbook: {
		onSuccess:
			"Acknowledge in one short sentence ('Got it, I'll remember that.'). The fact is now in your system prompt — don't dump the whole bag back to the user.",
		onValidationError:
			"Re-issue with key matching ^[a-z][a-z0-9_]{0,63}$ (snake_case). Don't ask the user about the format.",
	},
	example: { key: "preferred_currency", value: "AED" },
	schema: z
		.object({
			key: z
				.string()
				.regex(KEY_PATTERN, "snake_case [a-z][a-z0-9_]{0,63}")
				.describe("snake_case identifier."),
			value: z
				.union([
					z.string(),
					z.number(),
					z.boolean(),
					z.record(z.string(), z.unknown()),
					z.array(z.union([z.string(), z.number(), z.boolean()])),
				])
				.optional()
				.describe("Value to remember. Omit when delete=true."),
			delete: z.boolean().optional().describe("Pass true to remove the key."),
		})
		.refine(
			(v) => (v.delete === true ? true : v.value !== undefined),
			{ message: "value is required unless delete=true." },
		),
	execute: async ({ key, value, delete: del }) => {
		return runTool(async () => {
			const { ctx, orgId, conversationId } = getCtx();
			const result = (await toolMutation(getCtx(), "ai/conversations:patchContextBag",
				{
					orgId,
					conversationId,
					key,
					value: del ? undefined : value,
					delete: del === true,
				},)) as { ok: true; key: string; deleted: boolean };
			return {
				ok: true as const,
				data: result,
				display: {
					kind: "text" as const,
					text: del
						? `Forgot ${key}.`
						: `Remembered ${key}.`,
				},
			};
		});
	},
});

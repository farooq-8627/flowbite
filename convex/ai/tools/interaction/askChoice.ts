/**
 * convex/ai/tools/askChoice.ts
 *
 * `ask_user_choice` — a confirmation-gated tool that asks the user to pick
 * one of N options. Used when `search_crm` returns multiple candidates and
 * the next action depends on knowing exactly which one.
 *
 * Flow:
 *   1. Model calls `ask_user_choice` with a prompt + options.
 *   2. processChat treats it like any twoStep tool: inserts a tool message,
 *      sets confirmationState="pending", and the UI renders the choices.
 *   3. User clicks an option → frontend fires `confirmConfirmation` with
 *      `editedPayload: { value: <chosen.value> }`.
 *   4. processChat.resume reads the special `ask_user_choice` payload,
 *      synthesises a user message ("User picked: <label>"), and re-triggers
 *      the agent loop so the model continues with the disambiguation.
 *
 * Why no `commit_ask_user_choice`? — There's no DB write to commit; the
 * resume action treats `ask_user_choice` as a special branch that just
 * appends the synthesised user reply and re-runs `processChat.run`.
 */
import { z } from "zod";
import { registerTool } from "../../toolRegistry";
import { propose, requirePermission, runTool, type ToolContext } from "../_shared";

let _ctx: ToolContext | null = null;
export function setAskChoiceContext(c: ToolContext): void {
	_ctx = c;
}
function getCtx(): ToolContext {
	if (!_ctx) throw new Error("askChoice ctx not initialized");
	return _ctx;
}

registerTool({
	name: "ask_user_choice",
	layer: "always",
	permission: "ai.use",
	confirmation: "twoStep",
	description: `
Ask the user to pick one option when matches are ambiguous.
Use after search_crm returns 2+ candidates and the next action depends on
knowing which one. Wait for the user to pick — do NOT proceed until
confirmConfirmation arrives. Once the user picks, you'll receive a
follow-up user message saying "User picked: <label>".
	`.trim(),
	runbook: {
		onSuccess:
			"After the user picks, the next user turn will say 'User picked: ...'. Continue the original task with that pick — don't re-confirm the choice.",
		onValidationError:
			"You provided fewer than 2 options or more than 8. Re-issue with 2-8 distinct options.",
	},
	schema: z.object({
		prompt: z.string().describe("One short sentence framing the choice."),
		options: z
			.array(
				z.object({
					value: z.string().describe("Stable id (e.g. personCode P-001)."),
					label: z.string().describe("Human-readable label."),
					hint: z.optional(z.string()).describe("Optional secondary line."),
				}),
			)
			.min(2)
			.max(8),
	}),
	execute: async (args: {
		prompt: string;
		options: Array<{ value: string; label: string; hint?: string }>;
	}) => {
		return runTool(async () => {
			const { permissions } = getCtx();
			requirePermission(permissions, "ai.use");
			return propose("ask_user_choice", args, {
				title: args.prompt,
				fields: args.options.map((o, i) => ({
					label: `Option ${i + 1}`,
					value: o.hint ? `${o.label} — ${o.hint}` : o.label,
				})),
			});
		});
	},
});

/**
 * convex/ai/tools/askInput.ts
 *
 * `ask_user_input` — a confirmation-gated tool that asks the user to fill in
 * a small form (1–6 fields) BEFORE the agent commits to an action. The
 * canonical use case is "the user gave me a name but I need an email and
 * phone before I can create the lead".
 *
 * Why a dedicated tool (vs. just text-asking)?
 *   - Renders as a proper form, not chat prose → user can tab through fields.
 *   - Validates client-side before resuming the agent loop → no Zod retry hell.
 *   - The agent gets STRUCTURED input back, not free-form text it has to parse.
 *   - The user can press Cancel to abort the whole intent cleanly.
 *
 * Flow:
 *   1. Model calls `ask_user_input` with a prompt + field schema.
 *   2. processChat treats it like any twoStep tool: insert a tool message,
 *      set confirmationState="pending", UI renders ChatAskInput.
 *   3. User fills out the form, hits Submit → `confirmConfirmation` fires
 *      with `editedPayload: { values: { ... } }`.
 *   4. processChat.resume reads the special `ask_user_input` payload,
 *      synthesises a user message ("User provided: email=…, phone=…"),
 *      and re-triggers the agent loop so the model continues with the
 *      now-complete data.
 *
 * Why no commit_ask_user_input? Same reason as ask_user_choice — there's
 * no DB write to commit. The resume action treats it as a special branch
 * that just appends the synthesised user reply.
 */
import { z } from "zod";
import { registerTool } from "../../toolRegistry";
import { propose, requirePermission, runTool, type ToolContext } from "../_shared";

let _ctx: ToolContext | null = null;
export function setAskInputContext(c: ToolContext): void {
	_ctx = c;
}
function getCtx(): ToolContext {
	if (!_ctx) throw new Error("askInput ctx not initialized");
	return _ctx;
}

registerTool({
	name: "ask_user_input",
	layer: "always",
	permission: "ai.use",
	confirmation: "twoStep",
	description: `
Ask the user to fill in a small form to provide MISSING REQUIRED DATA.

Use this BEFORE attempting an action when:
  - The user gave you a name but you need an email/phone for create_contact.
  - The user said "create a deal" but didn't give a title or value.
  - Any tool you're about to call has REQUIRED fields the user hasn't supplied.

Do NOT use this for:
  - Disambiguating between matching records — use ask_user_choice instead.
  - Yes/no questions — just ask in plain text.
  - Optional fields — those default to empty; never block on optionals.

After the user submits, you'll receive a follow-up user message of the form
"User provided: <key>=<value>, …". Use those values to call the actual
create/update tool you intended to call. NEVER pass null or empty strings to
required fields. NEVER fabricate values.

Keep it short (1–6 fields). If you need more than 6 fields, reconsider — you
probably should propose with what you have and let the user fill in the rest
on the entity detail page after creation.
	`.trim(),
	runbook: {
		onSuccess:
			"After the user submits, the next user turn will say 'User provided: ...'. Continue with the original task using those values — don't ask again.",
		onValidationError:
			"You provided more than 6 fields or 0 fields. Re-issue with 1-6 fields scoped to the missing data only.",
	},
	schema: z.object({
		prompt: z
			.string()
			.min(1)
			.describe(
				"One short sentence framing what you need, e.g. 'I need a few more details to create the lead.'",
			),
		fields: z
			.array(
				z.object({
					key: z
						.string()
						.min(1)
						.describe(
							"Programmatic key, e.g. 'email'. Will be sent back to you in the user reply.",
						),
					label: z
						.string()
						.min(1)
						.describe("Human-readable label, e.g. 'Email address'."),
					type: z
						.enum(["text", "email", "tel", "url", "number", "textarea"])
						.default("text")
						.describe("Input type. Use 'tel' for phone numbers, 'textarea' for notes."),
					required: z.boolean().default(true),
					placeholder: z
						.string()
						.optional()
						.describe("Placeholder hint inside the input."),
					hint: z
						.string()
						.optional()
						.describe("Secondary line below the input explaining context."),
				}),
			)
			.min(1)
			.max(6),
	}),
	execute: async (args: {
		prompt: string;
		fields: Array<{
			key: string;
			label: string;
			type: "text" | "email" | "tel" | "url" | "number" | "textarea";
			required: boolean;
			placeholder?: string;
			hint?: string;
		}>;
	}) => {
		return runTool(async () => {
			const { permissions } = getCtx();
			requirePermission(permissions, "ai.use");
			return propose("ask_user_input", args, {
				title: args.prompt,
				fields: args.fields.map((f) => ({
					label: f.label,
					value: f.required ? "(required)" : "(optional)",
				})),
			});
		});
	},
});

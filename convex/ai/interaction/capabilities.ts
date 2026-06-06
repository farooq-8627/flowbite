/**
 * Interaction capabilities — structured-input prompts for the chat
 * surface. The CORE tool `ask_user` (in `runtime/coreTools.ts`)
 * handles ambiguity disambiguation; this module ships two MORE
 * structured forms the model can call when it needs:
 *
 *   ask_user_input    a single free-text response (e.g. "what's the budget?")
 *   ask_user_choice   a single selection from a closed list of options
 *
 * Both return an `ambiguous`-status envelope; the chat surface renders
 * the prompt as a form-style card, the user answers, and the host
 * resumes the turn with their answer in the next message.
 *
 * Group invariants:
 *
 *   1. NEVER use these for disambiguation that `ask_user` already
 *      covers — `ask_user` handles "two leads named Sara, which one?"
 *      with a `choices` array. These caps are for STRUCTURED data
 *      collection, not for resolving multi-row matches.
 *   2. The capability never WRITES to the DB — it returns a
 *      `CapabilityResult.status: "ambiguous"` that the host's stop
 *      condition honours. The next user turn lands in the prompt
 *      that produced this card.
 *   3. Risk: `safe`. No permission gate.
 *   4. The `display: { kind: "custom", componentKey: "askUserChoice" }`
 *      shape lets the chat surface render a structured form. The
 *      legacy V1 `ask_user_input` / `ask_user_choice` carried these
 *      same component keys; the FE renderer reuses them.
 */
import { z } from "zod";
import { defineCapability } from "../registry/define";
import { defineGroup } from "../registry/groups";
import { ask } from "../registry/result";

// ─── Group playbook ─────────────────────────────────────────────────────────

defineGroup({
	name: "interaction",
	playbook: `Use \`ask_user_input\` for a single free-text answer (e.g. "what's the budget for this deal?"). Use \`ask_user_choice\` when you need exactly one of N labelled options (e.g. "which contact should I attach? P-007 or P-014?").

For DISAMBIGUATION ("two leads match Sara, which one?") prefer the CORE \`ask_user\` tool — it ships unconditionally, no permission, no module gate. Reach for the interaction caps only when the chat needs a structured form (placeholder text, validation hint, default value).

Both caps return an \`ambiguous\` envelope; the host stops streaming, the chat UI renders the prompt, and the user's next message lands in the same turn slot as the answer.`,
});

// ─── ask_user_input ─────────────────────────────────────────────────────────

const askUserInput = defineCapability<{
	question: string;
	placeholder?: string;
	validation?: string;
	defaultValue?: string;
}>({
	name: "ask_user_input",
	module: "interaction",
	group: "interaction",
	permission: null,
	risk: "safe",
	channels: ["chat", "whatsapp", "mcp", "rest"],
	spec: {
		whenToCall:
			"Ask the user for ONE free-text input. Optional `placeholder` (greys out the input), `validation` hint (e.g. 'must be an email'), `defaultValue`. Stops the turn — the user's next message becomes the answer.",
		whenNotToCall:
			"the user has already provided the value in context — don't re-ask. The user has multiple matching records to disambiguate — call ask_user (core) with `choices`.",
		requiredClarifications: ["question"],
		synonyms: ["ask user", "prompt input", "request value"],
		goodExample: {
			question: "What's the deal value? (USD)",
			placeholder: "e.g. 25000",
			validation: "Numbers only — no currency symbol.",
		},
	},
	drive: {
		onSuccess:
			"After the user replies, the host resumes with their answer in the conversation transcript. Don't call ask_user_input twice in a row.",
	},
	input: z.object({
		question: z.string().min(1).max(500),
		placeholder: z.string().max(120).optional(),
		validation: z.string().max(200).optional(),
		defaultValue: z.string().max(500).optional(),
	}),
	run: async (_cap, args) => {
		// Build an `ambiguous` envelope; attach the structured-form
		// metadata via `display.props` so the chat surface can render
		// a custom card.
		const envelope = ask(args.question);
		return {
			...envelope,
			display: {
				kind: "custom" as const,
				componentKey: "askUserInput",
				props: {
					question: args.question,
					placeholder: args.placeholder,
					validation: args.validation,
					defaultValue: args.defaultValue,
				},
			},
		};
	},
});

// ─── ask_user_choice ────────────────────────────────────────────────────────

const askUserChoice = defineCapability<{
	question: string;
	choices: Array<{ label: string; value: string }>;
	allowMultiple?: boolean;
}>({
	name: "ask_user_choice",
	module: "interaction",
	group: "interaction",
	permission: null,
	risk: "safe",
	channels: ["chat", "whatsapp", "mcp", "rest"],
	spec: {
		whenToCall:
			"Ask the user to pick ONE (or more, with `allowMultiple:true`) of N labelled options. Each option carries a stable `value` the AI references on the next turn (e.g. P-007 / D-001). Stops the turn.",
		whenNotToCall:
			"only one option exists — just act on it. The choices are dynamic / unbounded — call ask_user (core) with a free-text prompt instead.",
		requiredClarifications: ["question", "choices"],
		synonyms: ["pick one", "choose option", "ask choice", "multi-select"],
		goodExample: {
			question: "Which contact should I attach this note to?",
			choices: [
				{ label: "Sarah Khan (P-007)", value: "P-007" },
				{ label: "Sarah Lee (P-014)", value: "P-014" },
			],
		},
	},
	drive: {
		onSuccess:
			"After the user picks, the host resumes the turn. Reference the chosen `value` (NOT the label) when calling subsequent tools.",
	},
	input: z.object({
		question: z.string().min(1).max(500),
		choices: z
			.array(
				z.object({
					label: z.string().min(1).max(120),
					value: z.string().min(1).max(500),
				}),
			)
			.min(2)
			.max(20),
		allowMultiple: z.boolean().optional().default(false),
	}),
	run: async (_cap, args) => {
		// Build an `ambiguous` envelope with the labels as
		// `suggestedNext` so the legacy chip surface still works
		// when the FE custom renderer isn't present.
		const envelope = ask(
			args.question,
			args.choices.map((c) => c.label),
		);
		return {
			...envelope,
			display: {
				kind: "custom" as const,
				componentKey: "askUserChoice",
				props: {
					question: args.question,
					choices: args.choices,
					allowMultiple: args.allowMultiple ?? false,
				},
			},
		};
	},
});

// ─── Public surface ─────────────────────────────────────────────────────────

export const INTERACTION_CAPABILITIES = [askUserInput, askUserChoice];

/**
 * convex/ai/tools/creative/draftProposal.ts
 *
 * Stage 9 of `/SPRINT-PLAN.md` — Creative layer.
 *
 * `draft_proposal` (twoStep): drafts a structured proposal Markdown
 * document for a deal — combining deal details + linked company/person
 * + the org's positioning persona into a 5-section template (Summary /
 * Pricing / Timeline / Next steps / Terms). Drafts are NEVER persisted
 * — the user copies the markdown into their preferred surface (doc /
 * email / send_message body) themselves.
 *
 * Cost class: `expensive`. Quota gated by `enforceCreativeQuota`.
 * Permission: `deals.view` — drafting reads deal context but never
 * writes to the deal.
 */

import { z } from "zod";
import { internal } from "../../../_generated/api";
import { registerTool } from "../../toolRegistry";
import { optionalString, propose, requirePermission, runTool, toolMutation } from "../_shared";
import { getCreativeCtx } from "./_context";

// ─── propose ─────────────────────────────────────────────────────────────

registerTool({
	name: "draft_proposal",
	layer: "creative",
	permission: "deals.view",
	confirmation: "twoStep",
	approvalCategory: "send_message",
	costClass: "expensive",
	description: "Stub — overridden by buildToolDescription via instruction.",
	instruction: {
		whenToCall:
			"Use when the user asks to DRAFT / WRITE / GENERATE a proposal, quote, or contract for a deal. Returns a structured Markdown proposal (title + 5 sections by default) the user can copy into their doc / email / save-as-note. Pulls deal + company + person + org persona for grounding.",
		whenNotToCall:
			"Don't use to draft a follow-up message (use draft_message). Don't use to log a private note (use add_note). Don't use to actually send the proposal (drafts NEVER autosend).",
		preflight: ["search_crm"],
		requiredClarifications: ["dealCode"],
		synonyms: [
			"draft a proposal",
			"write a quote",
			"generate a contract",
			"prepare a proposal",
			"draft pricing",
		],
		goodExample: {
			description:
				"User: 'Draft a proposal for the Acme deal (D-007). Include implementation timeline.'",
			args: { dealCode: "D-007", customInstructions: "Include implementation timeline" },
		},
		badExample: {
			description: "User: 'Draft a proposal for Sara.'",
			args: { dealCode: "P-014" },
			whyBad: "P-014 is a person code, not a deal code. Proposals attach to deals; ask the user which deal Sara is on, or use search_crm to find her open deals.",
		},
	},
	runbook: {
		onSuccess:
			"Surface the proposal title + a section preview. Offer suggestedNext chips ('Save as note', 'Send to deal contact via send_message', 'Edit + redraft'). Drafts are NEVER auto-sent or auto-saved.",
		onPermissionDenied:
			"Tell the user they need deals.view to draft proposals. Suggest contacting an admin.",
		onValidationError:
			"If dealCode is missing or malformed, ask the user once via ask_user_input.",
	},
	example: { dealCode: "D-007" },
	schema: z.object({
		dealCode: z
			.string()
			.min(2)
			.describe("Deal code (e.g. D-007). Must be a real deal in this org."),
		customInstructions: optionalString().describe(
			"Extra instructions for the proposal (e.g. 'include implementation timeline' / 'emphasise security').",
		),
	}),
	execute: async (args) =>
		runTool(async () => {
			const tc = getCreativeCtx();
			requirePermission(tc.permissions, "deals.view");

			return propose("draft_proposal", args, {
				title: `Draft a proposal for ${args.dealCode}`,
				fields: [
					{ label: "Deal", value: args.dealCode },
					...(args.customInstructions
						? [{ label: "Custom instructions", value: args.customInstructions }]
						: []),
					{ label: "Cost class", value: "expensive (LLM call, 5/min, 50/day)" },
					{
						label: "Disposition",
						value: "Draft only — nothing is saved or sent. You copy the Markdown wherever you need it.",
					},
				],
			});
		}),
});

// ─── commit_draft_proposal ───────────────────────────────────────────────

registerTool({
	name: "commit_draft_proposal",
	layer: "creative",
	permission: "deals.view",
	confirmation: "none",
	costClass: "expensive",
	description:
		"Internal: commit step for draft_proposal. Enforces the creative quota, runs the LLM, returns the structured proposal Markdown.",
	example: { dealCode: "D-007" },
	schema: z.object({
		dealCode: z.string().min(2),
		customInstructions: optionalString(),
	}),
	execute: async (args) =>
		runTool(async () => {
			const tc = getCreativeCtx();
			requirePermission(tc.permissions, "deals.view");

			await toolMutation(tc, "ai/creativeHelpers:enforceCreativeQuota", {
				orgId: tc.orgId,
				toolName: "commit_draft_proposal",
			});

			const result = (await tc.ctx.runAction(internal.ai.actions.draftProposal.run, {
				orgId: tc.orgId,
				userId: tc.userId,
				dealCode: args.dealCode,
				customInstructions: args.customInstructions,
			})) as {
				draft: {
					title: string;
					sections: Array<{ heading: string; body: string }>;
					bodyMarkdown: string;
				};
				modelUsed: string;
				dealCode: string;
				dealTitle: string;
				counterparty: string;
			};

			const sectionPreview = result.draft.sections
				.slice(0, 3)
				.map((s) => `**${s.heading}** — ${truncate(s.body, 140)}`)
				.join("\n\n");

			return {
				ok: true as const,
				data: {
					draft: result.draft,
					modelUsed: result.modelUsed,
					dealCode: result.dealCode,
					counterparty: result.counterparty,
				},
				summary: {
					headline: `Drafted proposal for ${result.dealTitle} (${result.dealCode})`,
					table: [
						{ label: "Deal", value: `${result.dealTitle} (${result.dealCode})` },
						{ label: "Counterparty", value: result.counterparty },
						{ label: "Title", value: result.draft.title },
						{ label: "Sections", value: `${result.draft.sections.length}` },
						{ label: "Preview", value: sectionPreview },
					],
					facts: [
						"This is a DRAFT — nothing has been saved. Use the chips below to save as a note, send to the deal contact, or refine.",
					],
					suggestedNext: [
						{
							label: "Save as note",
							intent: `Add a note to ${result.dealCode} containing this proposal Markdown so I can return to it later.`,
						},
						{
							label: "Send to deal contact",
							intent: `Send the summary section of this proposal as a message to the primary contact on ${result.dealCode}.`,
						},
						{
							label: "Edit + redraft",
							intent: `Redraft the proposal — keep it shorter and emphasise next steps.`,
						},
					],
				},
				display: {
					kind: "text" as const,
					text: result.draft.bodyMarkdown,
				},
			};
		}),
});

function truncate(s: string, n: number): string {
	const cleaned = s.replace(/\s+/g, " ").trim();
	return cleaned.length > n ? `${cleaned.slice(0, n - 1)}…` : cleaned;
}

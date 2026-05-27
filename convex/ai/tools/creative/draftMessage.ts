/**
 * convex/ai/tools/creative/draftMessage.ts
 *
 * Stage 9 of `/SPRINT-PLAN.md` — Creative layer.
 *
 * `draft_message` (twoStep): drafts a structured message (subject + body
 *  + suggested send_message args) for the user to review BEFORE
 *  dispatching. Drafts are NEVER auto-sent. Pairs with Stage 2's
 *  `send_message` via the `suggestedNext` chip.
 *
 *  Two-step gates so the user can confirm intent before we burn an LLM
 *  call. Mirrors the canonical `analyze_metric` shape:
 *    - `draft_message` propose: cheap preview; describes what we'd
 *      draft (target + intent) and quotes the budget cost.
 *    - `commit_draft_message`: enforces 5/min/user + 50/day/user via
 *      `creativeHelpers.enforceCreativeQuota`, runs the LLM action
 *      synchronously, returns the structured draft as a ToolSummary.
 *
 *  Targeting: exactly ONE of `personCode` / `dealCode` / `companyCode`
 *  must be set. The action resolves the matching record (`getByXForAI`)
 *  for grounding context and rejects on miss with a friendly error.
 *
 *  Permission: `messages.send` (so a viewer can't conjure draft
 *  outreach the org will later send). costClass: `expensive`.
 */

import { z } from "zod";
import { internal } from "../../../_generated/api";
import { registerTool } from "../../toolRegistry";
import { optionalString, propose, requirePermission, runTool, toolMutation } from "../_shared";
import { getCreativeCtx } from "./_context";

const INTENT_VALUES = ["follow-up", "thank-you", "custom"] as const;

// ─── propose ─────────────────────────────────────────────────────────────

registerTool({
	name: "draft_message",
	layer: "creative",
	permission: "messages.send",
	confirmation: "twoStep",
	approvalCategory: "send_message",
	costClass: "expensive",
	description: "Stub — overridden by buildToolDescription via instruction.",
	instruction: {
		whenToCall:
			"Use when the user asks to DRAFT / WRITE / COMPOSE a message, email, or follow-up note for a person, deal, or company. Returns a structured draft (subject + body + a pre-filled send_message payload) the user can approve, edit, or send via send_message themselves. Drafts are NEVER auto-sent.",
		whenNotToCall:
			"Don't use when the user explicitly says 'send' or 'message' (use send_message — the message goes out). Don't use to log a private note (use add_note). Don't use for proposals / quotes / contracts (use draft_proposal).",
		preflight: ["search_crm"],
		requiredClarifications: ["target", "intent"],
		synonyms: [
			"draft a message",
			"write a follow-up",
			"compose an email",
			"prepare a message",
			"draft a thank-you",
		],
		goodExample: {
			description:
				"User: 'Draft a follow-up to Sara (P-014) saying I'll call her back next week.'",
			args: {
				personCode: "P-014",
				intent: "follow-up",
				customPrompt: "Mention I'll call her back next week.",
			},
		},
		badExample: {
			description: "User: 'Send Sara a quick message.'",
			args: { personCode: "P-014", intent: "follow-up" },
			whyBad: "The user asked to SEND, not draft. Use send_message instead — it dispatches the message after approval.",
		},
	},
	runbook: {
		onSuccess:
			"Surface the subject + body. Offer the suggestedNext chips ('Send via send_message', 'Edit before sending', 'Save as note'). Do NOT pretend the message was sent — drafts NEVER autosend.",
		onPermissionDenied:
			"Tell the user they need messages.send to draft outreach. Suggest contacting an admin.",
		onValidationError:
			"Group all failed fields and call ask_user_input ONCE for ALL of them. Never retry with the same args.",
		suggestNext: "send_message",
	},
	example: { personCode: "P-014", intent: "follow-up" },
	schema: z
		.object({
			personCode: optionalString().describe(
				"Person code (e.g. P-014) for a lead or contact target.",
			),
			dealCode: optionalString().describe("Deal code (e.g. D-007) for a deal target."),
			companyCode: optionalString().describe(
				"Company code (e.g. C-003) for a company target.",
			),
			intent: z.enum(INTENT_VALUES).describe("follow-up | thank-you | custom"),
			customPrompt: optionalString().describe(
				"Extra instructions for the draft (e.g. 'mention pricing' / 'apologise for the delay').",
			),
		})
		.refine((v) => [v.personCode, v.dealCode, v.companyCode].filter(Boolean).length === 1, {
			message:
				"Exactly one of personCode / dealCode / companyCode must be set. Pick the canonical target for the message.",
		}),
	execute: async (args) =>
		runTool(async () => {
			const tc = getCreativeCtx();
			requirePermission(tc.permissions, "messages.send");

			const target = args.personCode
				? `Person ${args.personCode}`
				: args.dealCode
					? `Deal ${args.dealCode}`
					: `Company ${args.companyCode}`;

			return propose("draft_message", args, {
				title: `Draft a ${args.intent} message to ${target}`,
				fields: [
					{ label: "To", value: target },
					{ label: "Intent", value: args.intent },
					...(args.customPrompt ? [{ label: "Notes", value: args.customPrompt }] : []),
					{ label: "Cost class", value: "expensive (LLM call, 5/min, 50/day)" },
					{
						label: "Disposition",
						value: "Draft only — I will NOT send anything until you approve send_message.",
					},
				],
			});
		}),
});

// ─── commit_draft_message ────────────────────────────────────────────────

registerTool({
	name: "commit_draft_message",
	layer: "creative",
	permission: "messages.send",
	confirmation: "none",
	costClass: "expensive",
	description:
		"Internal: commit step for draft_message. Enforces the creative quota, runs the LLM, returns the structured draft.",
	example: { personCode: "P-014", intent: "follow-up" },
	schema: z
		.object({
			personCode: optionalString(),
			dealCode: optionalString(),
			companyCode: optionalString(),
			intent: z.enum(INTENT_VALUES),
			customPrompt: optionalString(),
		})
		.refine((v) => [v.personCode, v.dealCode, v.companyCode].filter(Boolean).length === 1, {
			message: "Exactly one of personCode / dealCode / companyCode must be set.",
		}),
	execute: async (args) =>
		runTool(async () => {
			const tc = getCreativeCtx();
			requirePermission(tc.permissions, "messages.send");

			// Enforce the 5/min + 50/day budget BEFORE invoking the LLM.
			// Throws ConvexError({code: "AI_QUOTA_EXHAUSTED"}) on overflow,
			// caught by runTool above and surfaced as a friendly error.
			await toolMutation(tc, "ai/creativeHelpers:enforceCreativeQuota", {
				orgId: tc.orgId,
				toolName: "commit_draft_message",
			});

			// Resolve the target's display name for grounding. The
			// `getByXForAI` queries are membership-gated.
			const targetKind = args.personCode
				? ("person" as const)
				: args.dealCode
					? ("deal" as const)
					: ("company" as const);
			const targetCode = (args.personCode ?? args.dealCode ?? args.companyCode)!;
			let displayName = targetCode;
			if (targetKind === "person") {
				const person = (await tc.ctx.runQuery(
					internal.crm.people.queries.getByPersonCodeForAI,
					{ orgId: tc.orgId, userId: tc.userId, personCode: targetCode },
				)) as { displayName?: string } | null;
				displayName = person?.displayName ?? targetCode;
			} else if (targetKind === "deal") {
				const deal = (await tc.ctx.runQuery(
					internal.crm.entities.deals.queries.getByDealCodeForAI,
					{ orgId: tc.orgId, userId: tc.userId, dealCode: targetCode },
				)) as { title?: string } | null;
				displayName = deal?.title ?? targetCode;
			} else {
				const company = (await tc.ctx.runQuery(
					internal.crm.entities.companies.queries.getByCompanyCodeForAI,
					{ orgId: tc.orgId, userId: tc.userId, companyCode: targetCode },
				)) as { name?: string } | null;
				displayName = company?.name ?? targetCode;
			}

			// Synchronously invoke the LLM action — drafts are an
			// interactive surface, not a fire-and-forget background job.
			const { draft, modelUsed } = (await tc.ctx.runAction(
				internal.ai.actions.draftMessage.run,
				{
					orgId: tc.orgId,
					userId: tc.userId,
					target: { kind: targetKind, code: targetCode, displayName },
					intent: args.intent,
					customPrompt: args.customPrompt,
				},
			)) as {
				draft: {
					subject?: string;
					body: string;
					channel: "message" | "email" | "whatsapp";
					suggestedSendMessageArgs: {
						personCode?: string;
						dealCode?: string;
						companyCode?: string;
						content: string;
					};
				};
				modelUsed: string;
			};

			const previewBody =
				draft.body.length > 600 ? `${draft.body.slice(0, 600)}…` : draft.body;

			return {
				ok: true as const,
				data: { draft, modelUsed, target: { kind: targetKind, code: targetCode } },
				summary: {
					headline: `Drafted a ${args.intent} message for ${displayName}`,
					table: [
						{ label: "To", value: `${displayName} (${targetCode})` },
						{ label: "Channel", value: draft.channel },
						...(draft.subject ? [{ label: "Subject", value: draft.subject }] : []),
						{ label: "Body", value: previewBody },
					],
					facts: [
						"This is a DRAFT — nothing has been sent. Click 'Send via send_message' to dispatch, or copy the body into your composer.",
					],
					suggestedNext: [
						{
							label: "Send via send_message",
							intent: `Send this draft to ${displayName}: "${truncateForChip(draft.body)}"`,
						},
						{
							label: "Save as note",
							intent: `Add a note to ${targetCode} with this draft body so I can come back to it.`,
						},
						{
							label: "Edit + redraft",
							intent: `Redraft the message — make it more concise.`,
						},
					],
				},
				display: {
					kind: "text" as const,
					text: `Draft ready (${draft.channel}). Review the preview card and send via send_message when you're ready.`,
				},
			};
		}),
});

function truncateForChip(s: string): string {
	const cleaned = s.replace(/\s+/g, " ").trim();
	return cleaned.length > 100 ? `${cleaned.slice(0, 100)}…` : cleaned;
}

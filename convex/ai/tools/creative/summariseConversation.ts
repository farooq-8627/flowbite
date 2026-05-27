/**
 * convex/ai/tools/creative/summariseConversation.ts
 *
 * Stage 9 of `/SPRINT-PLAN.md` — Creative layer.
 *
 * `summarise_conversation` (atomic, costClass `expensive`): condenses
 * a thread of messages into a 1-3 sentence summary + 3 bullets +
 * agreements + open questions + concrete action items the user can
 * one-click into `create_task`.
 *
 * Targeting: exactly ONE of `conversationId` / `personCode` / `dealCode`
 * / `companyCode`. Routes to the matching Stage-2 ForAI query
 * (`listForConversationForAI` / `listForPersonForAI` /
 * `listForEntityForAI`) — those queries enforce membership, so a
 * non-member caller gets an empty thread and a friendly "no messages"
 * reply.
 *
 * Range: optional `last_5` / `last_10` (default) / `last_24h` /
 * `last_7d` / `last_30d`. Time-windowed ranges filter the messages by
 * `createdAt` AFTER the take(50) cap so we always have <=50 rows in
 * the LLM call.
 *
 * Permission: `messages.view`. Quota gated by `enforceCreativeQuota`.
 */

import { z } from "zod";
import { internal } from "../../../_generated/api";
import type { Id } from "../../../_generated/dataModel";
import { registerTool } from "../../toolRegistry";
import { optionalString, requirePermission, runTool, toolMutation } from "../_shared";
import { getCreativeCtx } from "./_context";

const RANGE_VALUES = ["last_5", "last_10", "last_24h", "last_7d", "last_30d"] as const;
type Range = (typeof RANGE_VALUES)[number];

const RANGE_TO_MS: Record<Range, number | null> = {
	last_5: null,
	last_10: null,
	last_24h: 24 * 60 * 60 * 1000,
	last_7d: 7 * 24 * 60 * 60 * 1000,
	last_30d: 30 * 24 * 60 * 60 * 1000,
};
const RANGE_TO_COUNT: Record<Range, number | null> = {
	last_5: 5,
	last_10: 10,
	last_24h: null,
	last_7d: null,
	last_30d: null,
};

registerTool({
	name: "summarise_conversation",
	layer: "creative",
	permission: "messages.view",
	confirmation: "none",
	costClass: "expensive",
	description: "Stub — overridden by buildToolDescription via instruction.",
	instruction: {
		whenToCall:
			"Use when the user asks to SUMMARISE / RECAP / 'what did Sara and I agree on' / 'catch me up on the deal thread'. Returns a 3-bullet summary + agreements + open questions + actionable items the user can one-click into create_task.",
		whenNotToCall:
			"Don't use to read raw messages (use list_messages). Don't use to draft a reply (use draft_message). Don't use for non-message threads — this only summarises conversations / messages.",
		preflight: ["search_crm"],
		requiredClarifications: ["target"],
		synonyms: [
			"summarise",
			"summarize",
			"recap",
			"catch me up",
			"what did we agree",
			"thread summary",
		],
		goodExample: {
			description: "User: 'Summarise my last 10 messages with Sara (P-014).'",
			args: { personCode: "P-014", range: "last_10" },
		},
		badExample: {
			description: "User: 'Summarise the deal.'",
			args: { range: "last_10" },
			whyBad: "No target was supplied. Call ask_user_input first to learn which conversation / person / deal / company to summarise.",
		},
	},
	runbook: {
		onSuccess:
			"Lead with the headline summary. List the bullets / agreements / open questions concisely. Surface action items as suggestedNext chips so the user can one-click create_task. Don't dump JSON — paraphrase.",
		onEmpty:
			"Tell the user there are no messages in the supplied range. Offer to widen the range to last_30d or pick a different target.",
		onPermissionDenied:
			"Tell the user they need messages.view to read threads. Suggest contacting an admin.",
	},
	example: { personCode: "P-014", range: "last_10" },
	schema: z
		.object({
			conversationId: optionalString().describe(
				"Existing conversation id. Power-user escape hatch — prefer the codes below.",
			),
			personCode: optionalString().describe("Person code (e.g. P-014)."),
			dealCode: optionalString().describe("Deal code (e.g. D-007)."),
			companyCode: optionalString().describe("Company code (e.g. C-003)."),
			range: z.enum(RANGE_VALUES).default("last_10"),
		})
		.refine(
			(v) =>
				[v.conversationId, v.personCode, v.dealCode, v.companyCode].filter(Boolean)
					.length === 1,
			{
				message:
					"Exactly one of conversationId / personCode / dealCode / companyCode must be set.",
			},
		),
	execute: async (args) =>
		runTool<{
			summary: {
				summary: string;
				bullets: string[];
				agreements: string[];
				openQuestions: string[];
				actionItems: Array<{ body: string; suggestedDueDate?: string }>;
			} | null;
			range: Range;
			target: string;
			messageCount: number;
			modelUsed?: string;
		}>(async () => {
			const tc = getCreativeCtx();
			requirePermission(tc.permissions, "messages.view");

			// Quota gate FIRST so a runaway loop can't burn the LLM
			// budget on empty threads.
			await toolMutation(tc, "ai/creativeHelpers:enforceCreativeQuota", {
				orgId: tc.orgId,
				toolName: "summarise_conversation",
			});

			// Resolve target → fetch up to 50 newest messages via the
			// Stage-2 ForAI query that fits the targeting shape.
			const range = args.range as Range;
			const cap = 50;

			type MessageRow = {
				_creationTime: number;
				body?: string;
				content?: string;
				authorType?: string;
				authorName?: string;
				createdAt?: number;
			};

			let rawMessages: MessageRow[] = [];
			let targetLabel = "";

			if (args.conversationId) {
				targetLabel = `conversation ${args.conversationId}`;
				rawMessages = (await tc.ctx.runQuery(
					internal.crm.shared.messages.queries.listForConversationForAI,
					{
						orgId: tc.orgId,
						userId: tc.userId,
						conversationId: args.conversationId as Id<"conversations">,
						limit: cap,
					},
				)) as MessageRow[];
			} else if (args.personCode) {
				targetLabel = `person ${args.personCode}`;
				rawMessages = (await tc.ctx.runQuery(
					internal.crm.shared.messages.queries.listForPersonForAI,
					{
						orgId: tc.orgId,
						userId: tc.userId,
						personCode: args.personCode,
						limit: cap,
					},
				)) as MessageRow[];
			} else if (args.dealCode) {
				targetLabel = `deal ${args.dealCode}`;
				const result = (await tc.ctx.runQuery(
					internal.crm.shared.messages.queries.listForEntityForAI,
					{
						orgId: tc.orgId,
						userId: tc.userId,
						entityType: "deal",
						entityId: args.dealCode,
						limit: cap,
					},
				)) as { conversation: unknown; messages: MessageRow[] };
				rawMessages = result.messages ?? [];
			} else {
				targetLabel = `company ${args.companyCode}`;
				const result = (await tc.ctx.runQuery(
					internal.crm.shared.messages.queries.listForEntityForAI,
					{
						orgId: tc.orgId,
						userId: tc.userId,
						entityType: "company",
						entityId: args.companyCode!,
						limit: cap,
					},
				)) as { conversation: unknown; messages: MessageRow[] };
				rawMessages = result.messages ?? [];
			}

			// Apply range filter (count or time window).
			const countLimit = RANGE_TO_COUNT[range];
			const msSince = RANGE_TO_MS[range] ? Date.now() - (RANGE_TO_MS[range] as number) : null;

			let filtered = rawMessages.slice();
			if (msSince !== null) {
				filtered = filtered.filter((m) => {
					const ts = m.createdAt ?? m._creationTime ?? 0;
					return ts >= msSince;
				});
			}
			if (countLimit !== null) {
				filtered = filtered.slice(0, countLimit);
			}

			// The Stage-2 queries return newest-first. The summariser
			// expects oldest-first for chronological readability.
			filtered.reverse();

			if (filtered.length === 0) {
				return {
					ok: true as const,
					data: { summary: null, range, target: targetLabel, messageCount: 0 },
					summary: {
						headline: `No messages found for ${targetLabel} in range ${range}.`,
						suggestedNext: [
							{
								label: "Try a wider range",
								intent: `Summarise ${targetLabel} over the last 30 days.`,
							},
							{
								label: "List recent messages",
								intent: `Show me the recent messages with ${targetLabel}.`,
							},
						],
					},
					display: {
						kind: "text" as const,
						text: `No messages in ${targetLabel} for the supplied range.`,
					},
				};
			}

			const summaryResult = (await tc.ctx.runAction(
				internal.ai.actions.summariseConversation.run,
				{
					orgId: tc.orgId,
					userId: tc.userId,
					messages: filtered.map((m) => ({
						body: (m.body ?? m.content ?? "").trim(),
						authorType: m.authorType ?? "user",
						authorName: m.authorName,
						createdAt: m.createdAt ?? m._creationTime ?? 0,
					})),
				},
			)) as {
				summary: {
					summary: string;
					bullets: string[];
					agreements: string[];
					openQuestions: string[];
					actionItems: Array<{ body: string; suggestedDueDate?: string }>;
				};
				modelUsed: string;
				messageCount: number;
			};

			const sum = summaryResult.summary;
			const firstActionItem = sum.actionItems[0]?.body;
			const followupTarget =
				args.personCode ?? args.dealCode ?? args.companyCode ?? targetLabel;

			return {
				ok: true as const,
				data: {
					summary: sum,
					range,
					target: targetLabel,
					messageCount: summaryResult.messageCount,
					modelUsed: summaryResult.modelUsed,
				},
				summary: {
					headline: sum.summary,
					table: [
						{ label: "Target", value: targetLabel },
						{ label: "Range", value: range },
						{ label: "Messages summarised", value: `${summaryResult.messageCount}` },
						...(sum.bullets.length > 0
							? [{ label: "Bullets", value: sum.bullets.join("\n• ") }]
							: []),
						...(sum.agreements.length > 0
							? [{ label: "Agreements", value: sum.agreements.join("\n• ") }]
							: []),
						...(sum.openQuestions.length > 0
							? [{ label: "Open questions", value: sum.openQuestions.join("\n• ") }]
							: []),
						...(sum.actionItems.length > 0
							? [
									{
										label: "Action items",
										value: sum.actionItems
											.map(
												(a) =>
													`${a.body}${a.suggestedDueDate ? ` (by ${a.suggestedDueDate})` : ""}`,
											)
											.join("\n• "),
									},
								]
							: []),
					],
					suggestedNext: [
						...(firstActionItem
							? [
									{
										label: "Create followup for first action",
										intent: `Create a follow-up reminder for ${followupTarget}: ${firstActionItem}`,
									},
								]
							: []),
						{
							label: "Send recap via send_message",
							intent: `Send a recap message to ${followupTarget} summarising what we agreed: ${truncate(sum.summary, 200)}`,
						},
						{
							label: "Save as note",
							intent: `Add a note to ${followupTarget} with the recap: ${truncate(sum.summary, 200)}`,
						},
					],
				},
				display: {
					kind: "text" as const,
					text: sum.summary,
				},
			};
		}),
});

function truncate(s: string, n: number): string {
	const cleaned = s.replace(/\s+/g, " ").trim();
	return cleaned.length > n ? `${cleaned.slice(0, n - 1)}…` : cleaned;
}

"use node";
/**
 * convex/ai/actions/analyzeDealClose.ts
 *
 * Stage 7 of /SPRINT-PLAN.md — win/loss reasoning.
 *
 * Scheduled on every successful `closeAsDone` mutation (won OR lost).
 * Pulls the deal + a window of recent activity / notes, asks the LLM
 * for a structured retrospective (`InsightBodySchema`), and writes:
 *
 *   1. An `aiInsights` row with `kind: "deal_retrospective"` so the
 *      Settings → AI changelog + the deal detail page can render the
 *      narrative card.
 *   2. A `winLoss` note category note linked to the deal so users can
 *      find it in the deal's notes feed. The category is auto-created
 *      on first run (idempotent) — no migration required.
 *
 * The action is best-effort. Any failure logs + returns silently —
 * a missing retrospective should never block the close mutation
 * from being committed.
 *
 * Cost class: `expensive` on the producing tool. Currently triggered
 * 1× per deal close → bounded by close volume, not by free-form user
 * input.
 */

import { generateText } from "ai";
import { v } from "convex/values";
import { z } from "zod";
import { internal } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";
import { internalAction } from "../../_generated/server";
import type { ProviderId } from "../encryptionTypes";
import {
	buildLanguageModel,
	getPlatformKey,
	MODEL_REGISTRY,
	PLATFORM_BRIEFING_MODEL,
} from "../models";
import { type InsightBody, InsightBodySchema } from "../queries/insights";

// biome-ignore lint/suspicious/noExplicitAny: Convex pre-codegen forward ref pattern
const _ref = (path: string) => path as any;
// biome-ignore lint/suspicious/noExplicitAny: Convex pre-codegen forward ref pattern
const _anyArgs = (a: Record<string, unknown>) => a as any;

const ZOD_SCHEMA_FOR_LLM = z.object({
	summary: z.string().min(1),
	findings: z.array(z.string()).min(1).max(8),
	actionItems: z
		.array(
			z.object({
				label: z.string().min(1),
				intent: z.string().optional(),
			}),
		)
		.max(5)
		.default([]),
	confidence: z.union([z.literal("high"), z.literal("medium"), z.literal("low")]),
});

function buildDeterministicRetrospective(args: {
	finalType: "positive" | "negative" | "neutral";
	dealTitle: string;
	dealValue?: number;
	currency?: string;
	outcomeReason?: string;
	noteCount: number;
	activityCount: number;
}): InsightBody {
	const valueStr =
		typeof args.dealValue === "number"
			? `${args.currency ?? ""} ${args.dealValue.toLocaleString()}`.trim()
			: undefined;
	const outcomeText =
		args.finalType === "positive" ? "Won" : args.finalType === "negative" ? "Lost" : "Closed";
	const summary =
		args.finalType === "positive"
			? `Won "${args.dealTitle}"${valueStr ? ` (${valueStr})` : ""}.`
			: args.finalType === "negative"
				? `Lost "${args.dealTitle}"${valueStr ? ` (${valueStr})` : ""}.`
				: `Closed "${args.dealTitle}".`;

	const findings: string[] = [`Outcome: ${outcomeText}.`];
	if (args.outcomeReason) findings.push(`Reason recorded: ${args.outcomeReason}`);
	findings.push(`Notes captured during the deal: ${args.noteCount}.`);
	findings.push(`Activity entries on this deal: ${args.activityCount}.`);

	const actionItems =
		args.finalType === "positive"
			? [
					{
						label: "Find similar leads",
						intent: `Find leads similar to ${args.dealTitle} that we should prioritise.`,
					},
				]
			: args.finalType === "negative"
				? [
						{
							label: "Add objection to playbook",
							intent: `Capture the objection from ${args.dealTitle} so we can defend it next time.`,
						},
					]
				: [];

	return {
		summary,
		findings,
		actionItems,
		confidence: "low",
	};
}

const RETROSPECTIVE_PROMPT = (args: {
	finalType: string;
	dealTitle: string;
	dealValue?: number;
	currency?: string;
	outcomeReason?: string;
	notesPreview: string;
	activityPreview: string;
}): string => `You are a senior sales coach reviewing a deal that just closed.
Reply with ONLY a JSON object — no prose, no code fences.

DEAL
- Title: ${args.dealTitle}
- Outcome: ${args.finalType} (positive=won, negative=lost, neutral=other)
- Value: ${typeof args.dealValue === "number" ? `${args.currency ?? ""} ${args.dealValue}` : "unknown"}
- Reason recorded: ${args.outcomeReason ?? "(none)"}

CONTEXT
Recent notes (latest first, may be empty):
${args.notesPreview || "(no notes)"}

Recent activity (latest first, may be empty):
${args.activityPreview || "(no activity)"}

OUTPUT SHAPE
{
  "summary": "1-2 sentences naming the outcome and the headline reason",
  "findings": ["3-5 bullets — what worked, what didn't, what the data shows"],
  "actionItems": [{ "label": "≤5-word CTA", "intent": "≤300 char chat prompt" }],
  "confidence": "high" | "medium" | "low"
}

Rules: be specific (no platitudes), keep findings under 200 chars each, 1-3 actionItems max, JSON only.`;

export const run = internalAction({
	args: {
		orgId: v.id("orgs"),
		userId: v.id("users"),
		dealId: v.id("deals"),
		finalType: v.union(v.literal("positive"), v.literal("negative"), v.literal("neutral")),
	},
	handler: async (
		ctx,
		args,
	): Promise<{ insightId: Id<"aiInsights"> | null; noteId: Id<"notes"> | null }> => {
		// 1. Pull the deal + recent context. We use a dedicated internalQuery
		//    to read both deal + notes + activity in a single round-trip.
		const data = (await ctx.runQuery(
			_ref("ai/dealClose:collectDealContext"),
			_anyArgs({ orgId: args.orgId, dealId: args.dealId }),
		)) as {
			deal: {
				_id: Id<"deals">;
				dealCode: string;
				title: string;
				value?: number;
				currency?: string;
				outcomeReason?: string;
				personCode?: string;
			} | null;
			notes: Array<{ content: string; createdAt: number }>;
			activity: Array<{ action: string; description?: string; createdAt: number }>;
		};

		if (!data.deal) {
			return { insightId: null, noteId: null };
		}

		const notesPreview = data.notes
			.slice(0, 5)
			.map((n, i) => `(${i + 1}) ${n.content.slice(0, 200)}`)
			.join("\n");
		const activityPreview = data.activity
			.slice(0, 8)
			.map(
				(a, i) =>
					`(${i + 1}) ${a.action}${a.description ? `: ${a.description.slice(0, 120)}` : ""}`,
			)
			.join("\n");

		// 2. Build deterministic fallback first (always safe).
		const fallback = buildDeterministicRetrospective({
			finalType: args.finalType,
			dealTitle: data.deal.title,
			dealValue: data.deal.value,
			currency: data.deal.currency,
			outcomeReason: data.deal.outcomeReason,
			noteCount: data.notes.length,
			activityCount: data.activity.length,
		});

		// 3. LLM pass (best-effort).
		let body: InsightBody = fallback;
		let modelUsed = "deterministic:fallback";
		let inputTokens: number | undefined;
		let outputTokens: number | undefined;

		const modelKey = process.env.AI_DEFAULT_MODEL ?? PLATFORM_BRIEFING_MODEL;
		const info = MODEL_REGISTRY[modelKey] ?? MODEL_REGISTRY[PLATFORM_BRIEFING_MODEL];
		const apiKey = getPlatformKey(info.provider as ProviderId);
		if (apiKey) {
			try {
				const model = buildLanguageModel({
					provider: info.provider as ProviderId,
					modelId: info.modelId,
					apiKey,
				});
				const result = await generateText({
					model: model as Parameters<typeof generateText>[0]["model"],
					prompt: RETROSPECTIVE_PROMPT({
						finalType: args.finalType,
						dealTitle: data.deal.title,
						dealValue: data.deal.value,
						currency: data.deal.currency,
						outcomeReason: data.deal.outcomeReason,
						notesPreview,
						activityPreview,
					}),
					temperature: 0.4,
					maxOutputTokens: 700,
				});
				const cleaned = result.text
					.trim()
					.replace(/^```(?:json)?\s*/i, "")
					.replace(/```\s*$/i, "")
					.trim();
				const parsed = ZOD_SCHEMA_FOR_LLM.parse(JSON.parse(cleaned));
				body = InsightBodySchema.parse({
					summary: parsed.summary,
					findings: parsed.findings,
					actionItems: parsed.actionItems,
					confidence: parsed.confidence,
				});
				modelUsed = `${info.provider}:${modelKey}`;
				inputTokens = result.usage?.inputTokens;
				outputTokens = result.usage?.outputTokens;
			} catch (err) {
				console.warn("[analyzeDealClose] LLM pass failed — using deterministic", err);
			}
		}

		// 4. Persist insight.
		const insightId = (await ctx.runMutation(_ref("ai/queries/insights:writeInsight"), {
			orgId: args.orgId,
			userId: args.userId,
			kind: "deal_retrospective",
			recordRef: {
				entityType: "deal",
				entityId: data.deal._id as unknown as string,
				code: data.deal.dealCode,
			},
			body,
			modelUsed,
			inputTokens,
			outputTokens,
		} as never)) as Id<"aiInsights">;

		// 5. Persist a winLoss-category note linked to the deal so users
		//    surface it in the normal notes feed.
		let noteId: Id<"notes"> | null = null;
		try {
			noteId = (await ctx.runMutation(
				_ref("ai/dealClose:writeRetrospectiveNote"),
				_anyArgs({
					orgId: args.orgId,
					userId: args.userId,
					dealId: data.deal._id,
					personCode: data.deal.personCode,
					summary: body.summary,
					findings: body.findings,
				}),
			)) as Id<"notes">;
		} catch (err) {
			console.warn("[analyzeDealClose] note persist failed", err);
		}

		return { insightId, noteId };
	},
});

void internal;

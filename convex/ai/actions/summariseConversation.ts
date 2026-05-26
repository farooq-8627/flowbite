"use node";
/**
 * convex/ai/actions/summariseConversation.ts
 *
 * Stage 9 of `/SPRINT-PLAN.md` — Creative layer.
 *
 * Subagent that condenses a list of messages into 3 summary bullets +
 * agreements + open questions + concrete action items. Pure read tool —
 * never writes to the DB. Pairs with Stage 2's `list_messages` so a
 * user can ask "summarise my last 10 messages with Sara" without
 * scrolling.
 *
 * Input shape: `{messages: {body, authorType, createdAt, authorName?}[]}` —
 * the tool layer fetches the messages via the existing
 * `listForConversationForAI` / `listForPersonForAI` / `listForEntityForAI`
 * queries shipped in Stage 2 and passes them in.
 *
 * Output shape (Zod-validated):
 *   {
 *     summary:        string,           // single 1-3 sentence headline
 *     bullets:        string[],         // 3 short bullets, ≤200 chars each
 *     agreements:     string[],         // explicit "we'll do X" / "they agreed to Y"
 *     openQuestions:  string[],         // unresolved threads
 *     actionItems:    {body, suggestedDueDate?}[]  // pre-fillable for create_followup
 *   }
 *
 * Cost class: `expensive`. Quota gated upstream by enforceCreativeQuota.
 */

import { generateText } from "ai";
import { v } from "convex/values";
import { z } from "zod";
import { internalAction } from "../../_generated/server";
import type { ProviderId } from "../encryptionTypes";
import {
	buildLanguageModel,
	getPlatformKey,
	MODEL_REGISTRY,
	PLATFORM_BRIEFING_MODEL,
} from "../models";

// ─── Schemas ────────────────────────────────────────────────────────────

const ACTION_ITEM_SCHEMA = z.object({
	body: z.string().min(1).max(280),
	suggestedDueDate: z.string().optional(), // ISO yyyy-mm-dd or empty
});

export const ConversationSummarySchema = z.object({
	summary: z.string().min(1).max(600),
	bullets: z.array(z.string().min(1).max(220)).min(0).max(8),
	agreements: z.array(z.string().min(1).max(220)).max(8).default([]),
	openQuestions: z.array(z.string().min(1).max(220)).max(8).default([]),
	actionItems: z.array(ACTION_ITEM_SCHEMA).max(8).default([]),
});

export type ConversationSummary = z.infer<typeof ConversationSummarySchema>;

export type SummariseInputMessage = {
	body: string;
	authorType: "user" | "ai" | string;
	authorName?: string;
	createdAt: number;
};

// ─── Pure helpers (exported for tests) ──────────────────────────────────

/**
 * Deterministic fallback. Returns a useful skeleton even with no LLM
 * key — the bullets are last-3-messages excerpts, action items list a
 * single "review the thread" action so the propose-create-followup
 * chain still works.
 */
export function buildDeterministicSummary(args: {
	messages: SummariseInputMessage[];
}): ConversationSummary {
	const msgs = args.messages.filter((m) => m.body && m.body.trim().length > 0);
	if (msgs.length === 0) {
		return {
			summary: "No messages in the supplied range.",
			bullets: [],
			agreements: [],
			openQuestions: [],
			actionItems: [],
		};
	}

	const lastFew = msgs.slice(-3);
	const lead = msgs[msgs.length - 1];
	const summary = `${msgs.length} message(s) over the supplied range. Most recent from ${lead.authorName ?? lead.authorType}: "${truncate(lead.body, 140)}".`;
	const bullets = lastFew.map((m) => `${m.authorName ?? m.authorType}: ${truncate(m.body, 200)}`);
	return {
		summary,
		bullets,
		agreements: [],
		openQuestions: [],
		actionItems: [{ body: "Review the thread and decide on next steps." }],
	};
}

function truncate(s: string, n: number): string {
	const cleaned = s.replace(/\s+/g, " ").trim();
	return cleaned.length > n ? `${cleaned.slice(0, n - 1).trim()}…` : cleaned;
}

const SUMMARY_PROMPT = (msgs: SummariseInputMessage[]): string => {
	const transcript = msgs
		.map(
			(m) =>
				`[${new Date(m.createdAt).toISOString()}] ${m.authorName ?? m.authorType}: ${m.body.replace(/\s+/g, " ").trim()}`,
		)
		.join("\n");
	return `You are a senior CRM specialist summarising a thread of messages. Reply with ONLY a JSON object — no prose, no code fences.

THREAD
${transcript}

OUTPUT SHAPE (must match exactly):
{
  "summary": "1-3 sentence headline of what happened in this thread",
  "bullets": ["3 short bullets — the key beats, ≤200 chars each"],
  "agreements": ["explicit commitments — 'we'll send X by Friday'"],
  "openQuestions": ["unresolved threads — questions someone still needs to answer"],
  "actionItems": [
    { "body": "concrete action ≤280 chars", "suggestedDueDate": "YYYY-MM-DD" }
  ]
}

Rules:
- Lead with the most actionable insight in summary.
- 3 bullets is the target — no more than 5.
- Agreements only when concrete commitments exist; else empty array.
- openQuestions only for genuine unresolved items; else empty array.
- actionItems should be pre-fillable into create_followup tools — be specific.
- suggestedDueDate is OPTIONAL — omit when unclear; never guess.
- JSON only — nothing else.`;
};

// ─── Action ─────────────────────────────────────────────────────────────

export const run = internalAction({
	args: {
		orgId: v.id("orgs"),
		userId: v.id("users"),
		messages: v.array(
			v.object({
				body: v.string(),
				authorType: v.string(),
				authorName: v.optional(v.string()),
				createdAt: v.number(),
			}),
		),
	},
	handler: async (
		_ctx,
		args,
	): Promise<{
		summary: ConversationSummary;
		modelUsed: string;
		inputTokens?: number;
		outputTokens?: number;
		messageCount: number;
	}> => {
		// Cap at 50 — anything longer is a sign the caller didn't slice
		// the range. Truncation is a last-resort guardrail, not a
		// performance optimisation.
		const msgs = args.messages.slice(-50);
		const fallback = buildDeterministicSummary({ messages: msgs });

		if (msgs.length === 0) {
			return {
				summary: fallback,
				modelUsed: "deterministic:empty",
				messageCount: 0,
			};
		}

		const modelKey = process.env.AI_DEFAULT_MODEL ?? PLATFORM_BRIEFING_MODEL;
		const info = MODEL_REGISTRY[modelKey] ?? MODEL_REGISTRY[PLATFORM_BRIEFING_MODEL];
		const apiKey = getPlatformKey(info.provider as ProviderId);
		if (!apiKey) {
			return {
				summary: fallback,
				modelUsed: "deterministic:fallback",
				messageCount: msgs.length,
			};
		}

		try {
			const model = buildLanguageModel({
				provider: info.provider as ProviderId,
				modelId: info.modelId,
				apiKey,
			});
			const result = await generateText({
				model: model as Parameters<typeof generateText>[0]["model"],
				prompt: SUMMARY_PROMPT(msgs),
				temperature: 0.2,
				maxOutputTokens: 1200,
			});
			const cleaned = result.text
				.trim()
				.replace(/^```(?:json)?\s*/i, "")
				.replace(/```\s*$/i, "")
				.trim();
			const parsed = ConversationSummarySchema.parse(JSON.parse(cleaned));
			return {
				summary: parsed,
				modelUsed: `${info.provider}:${modelKey}`,
				inputTokens: result.usage?.inputTokens,
				outputTokens: result.usage?.outputTokens,
				messageCount: msgs.length,
			};
		} catch (err) {
			console.warn(
				"[summariseConversation] LLM pass failed — using deterministic fallback",
				err,
			);
			return {
				summary: fallback,
				modelUsed: "deterministic:fallback",
				messageCount: msgs.length,
			};
		}
	},
});

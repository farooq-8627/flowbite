"use node";
/**
 * convex/ai/actions/draftMessage.ts
 *
 * Stage 9 of `/SPRINT-PLAN.md` — Creative layer.
 *
 * Subagent that turns "draft a follow-up to Sara" into a structured
 * `{subject?, body, channel, suggestedSendMessageArgs}` envelope the
 * `commit_draft_message` tool wraps in a ToolSummary card. Drafts are
 * NEVER sent — the user reviews + clicks "Send via send_message" or
 * copies the body into another surface themselves.
 *
 * Pipeline:
 *
 *   1. **Resolve target context.** Loads the person / deal / company
 *      record by code via the existing `*ForAI` queries shipped in
 *      Stages 1–4. Pulls org persona (positioning / value-prop) +
 *      user persona (preferred tone / style facts) for grounding.
 *   2. **LLM narrative pass.** Only when a platform API key is
 *      configured. The model is asked for ONLY a JSON object matching
 *      `DraftMessageSchema`. We strip ```json fences, JSON.parse,
 *      then Zod-validate. ANY failure → deterministic fallback so
 *      tests pass without an API key.
 *   3. **Return** the structured draft. The caller (the tool layer)
 *      stamps `aiToolEvents` for budget accounting and surfaces the
 *      draft to the user via the propose/commit envelope.
 *
 * Cost class: `expensive`. The `commit_draft_message` tool enforces
 * the 5/min/user + 50/day/user gate via `creativeHelpers.enforceCreativeQuota`
 * BEFORE invoking this action.
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

// biome-ignore lint/suspicious/noExplicitAny: Convex pre-codegen forward ref pattern
const _ref = (path: string) => path as any;

// ─── Types & schemas ────────────────────────────────────────────────────

export const INTENT_VALUES = ["follow-up", "thank-you", "custom"] as const;
export type DraftIntent = (typeof INTENT_VALUES)[number];

export const TARGET_KIND = ["person", "deal", "company"] as const;
export type DraftTargetKind = (typeof TARGET_KIND)[number];

const SUGGESTED_ARGS_SCHEMA = z.object({
	personCode: z.string().optional(),
	dealCode: z.string().optional(),
	companyCode: z.string().optional(),
	conversationId: z.string().optional(),
	content: z.string().min(1),
});

/** Single source of truth for the LLM's required JSON shape. */
export const DraftMessageSchema = z.object({
	subject: z.string().min(1).max(140).optional(),
	body: z.string().min(1).max(2000),
	channel: z.union([z.literal("message"), z.literal("email"), z.literal("whatsapp")]),
	suggestedSendMessageArgs: SUGGESTED_ARGS_SCHEMA,
});

export type DraftMessage = z.infer<typeof DraftMessageSchema>;

// ─── Pure helpers (exported for unit tests) ─────────────────────────────

/**
 * Deterministic draft used both as the LLM prompt's grounding context
 * AND as the fallback when no API key is configured. Pure function — no
 * DB. Keeps the tool surface useful in dev / on free-tier deployments
 * AND makes the contract tests reproducible.
 */
export function buildDeterministicDraftMessage(args: {
	intent: DraftIntent;
	target: { kind: DraftTargetKind; code: string; displayName: string };
	customPrompt?: string;
	userFirstName?: string;
}): DraftMessage {
	const { intent, target, customPrompt, userFirstName } = args;
	const greeting = `Hi ${target.displayName.split(" ")[0] ?? target.displayName}`;
	const signoff = userFirstName ? `\n\nBest,\n${userFirstName}` : "\n\nBest";

	let bodyCore: string;
	let subject: string;
	switch (intent) {
		case "follow-up":
			subject = `Following up`;
			bodyCore = customPrompt
				? `${customPrompt.trim()}\n\nLet me know if you have a few minutes this week to chat.`
				: `Just wanted to circle back on our last conversation. Let me know if you have a few minutes this week to chat.`;
			break;
		case "thank-you":
			subject = `Thank you`;
			bodyCore = customPrompt
				? customPrompt.trim()
				: `Thanks again for taking the time. I really appreciated the conversation and look forward to next steps.`;
			break;
		default:
			subject = customPrompt ? customPrompt.slice(0, 80) : "Quick note";
			bodyCore =
				customPrompt?.trim() ??
				`Quick note — wanted to reach out and check in. Happy to chat whenever works.`;
	}

	const body = `${greeting},\n\n${bodyCore}${signoff}`;
	const channel: DraftMessage["channel"] = intent === "thank-you" ? "email" : "message";
	const suggested =
		target.kind === "person"
			? { personCode: target.code, content: body }
			: target.kind === "deal"
				? { dealCode: target.code, content: body }
				: { companyCode: target.code, content: body };

	return {
		subject,
		body,
		channel,
		suggestedSendMessageArgs: suggested,
	};
}

const DRAFT_PROMPT = (args: {
	intent: DraftIntent;
	target: { kind: DraftTargetKind; code: string; displayName: string };
	customPrompt?: string;
	orgPersona: string;
	userPersona: string;
	userFirstName?: string;
}): string => `You are a senior CRM specialist drafting a short outreach message on behalf of ${args.userFirstName ?? "the user"}. Reply with ONLY a JSON object — no prose, no code fences.

CONTEXT
- Org persona / positioning: ${args.orgPersona || "(no org persona configured)"}
- User preferences: ${args.userPersona || "(no user persona configured)"}
- Target: ${args.target.kind} "${args.target.displayName}" (${args.target.code})
- Intent: ${args.intent}
${args.customPrompt ? `- Custom instructions: ${args.customPrompt}` : ""}

OUTPUT SHAPE (must match exactly):
{
  "subject": "short subject line (≤80 chars)",
  "body": "the full message body — 3-6 sentences, friendly but professional, no marketing-speak",
  "channel": "message" | "email" | "whatsapp",
  "suggestedSendMessageArgs": {
    "${args.target.kind === "person" ? "personCode" : args.target.kind === "deal" ? "dealCode" : "companyCode"}": "${args.target.code}",
    "content": "(same as body)"
  }
}

Rules:
- Be concise. The user can edit before sending — leave room for personalisation.
- Address the target by their first name when natural.
- DO NOT include placeholder text like "[insert details]" — write a complete message.
- DO NOT autosend or imply the message has been sent. The user reviews + dispatches manually.
- For "thank-you" intents prefer channel="email"; for "follow-up" prefer "message".
- JSON only — nothing else.`;

// ─── Action ─────────────────────────────────────────────────────────────

export const run = internalAction({
	args: {
		orgId: v.id("orgs"),
		userId: v.id("users"),
		target: v.object({
			kind: v.union(v.literal("person"), v.literal("deal"), v.literal("company")),
			code: v.string(),
			displayName: v.string(),
		}),
		intent: v.union(v.literal("follow-up"), v.literal("thank-you"), v.literal("custom")),
		customPrompt: v.optional(v.string()),
	},
	handler: async (
		ctx,
		args,
	): Promise<{
		draft: DraftMessage;
		modelUsed: string;
		inputTokens?: number;
		outputTokens?: number;
	}> => {
		// Best-effort persona context — silently fall back to empty
		// strings if not configured.
		const orgPersona = (await ctx.runQuery(_ref("ai/personaContext:getOrgPersonaForAI"), {
			orgId: args.orgId,
		})) as { summary?: string; identity?: string; keyFacts?: string[] } | null;
		const userPersona = (await ctx.runQuery(_ref("ai/personaContext:getUserPersonaForAI"), {
			orgId: args.orgId,
			userId: args.userId,
		})) as { summary?: string; keyFacts?: string[] } | null;

		const orgPersonaText =
			[orgPersona?.identity, orgPersona?.summary, ...(orgPersona?.keyFacts ?? [])]
				.filter((s): s is string => Boolean(s?.trim()))
				.join(" • ") || "";
		const userPersonaText =
			[userPersona?.summary, ...(userPersona?.keyFacts ?? [])]
				.filter((s): s is string => Boolean(s?.trim()))
				.join(" • ") || "";

		const userFirstName = await getUserFirstName(ctx, args.userId);

		const fallback = buildDeterministicDraftMessage({
			intent: args.intent,
			target: args.target,
			customPrompt: args.customPrompt,
			userFirstName,
		});

		const modelKey = process.env.AI_DEFAULT_MODEL ?? PLATFORM_BRIEFING_MODEL;
		const info = MODEL_REGISTRY[modelKey] ?? MODEL_REGISTRY[PLATFORM_BRIEFING_MODEL];
		const apiKey = getPlatformKey(info.provider as ProviderId);
		if (!apiKey) {
			return {
				draft: fallback,
				modelUsed: "deterministic:fallback",
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
				prompt: DRAFT_PROMPT({
					intent: args.intent,
					target: args.target,
					customPrompt: args.customPrompt,
					orgPersona: orgPersonaText,
					userPersona: userPersonaText,
					userFirstName,
				}),
				temperature: 0.5,
				maxOutputTokens: 800,
			});
			const cleaned = result.text
				.trim()
				.replace(/^```(?:json)?\s*/i, "")
				.replace(/```\s*$/i, "")
				.trim();
			const parsed = DraftMessageSchema.parse(JSON.parse(cleaned));
			return {
				draft: parsed,
				modelUsed: `${info.provider}:${modelKey}`,
				inputTokens: result.usage?.inputTokens,
				outputTokens: result.usage?.outputTokens,
			};
		} catch (err) {
			console.warn("[draftMessage] LLM pass failed — using deterministic fallback", err);
			return {
				draft: fallback,
				modelUsed: "deterministic:fallback",
			};
		}
	},
});

// ─── Helpers ────────────────────────────────────────────────────────────

async function getUserFirstName(
	// biome-ignore lint/suspicious/noExplicitAny: action ctx is loosely typed at the helper boundary
	ctx: any,
	userId: string,
): Promise<string | undefined> {
	try {
		const user = (await ctx.runQuery(_ref("users/queries:getById"), {
			userId,
		})) as { name?: string } | null;
		const name = user?.name?.trim();
		if (!name) return undefined;
		return name.split(" ")[0];
	} catch {
		return undefined;
	}
}

"use node";
/**
 * convex/ai/briefingsActions.ts
 *
 * AI Morning Briefing — Node-runtime side (LLM calls).
 *
 * Internal Node surface:
 *   - generate                (internalAction) — single-user briefing generator.
 *   - generateForActiveUsers  (internalAction) — cron entrypoint; iterates users.
 *
 * Why split from briefings.ts:
 *   This file imports `./models` which loads `@ai-sdk/*` Node SDKs and
 *   uses `generateText` from the AI SDK — both require the Node runtime.
 *   Convex forbids queries/mutations in "use node" files, so the
 *   internal queries/mutations (`collectUserBriefingData`, `insertBriefing`,
 *   `listEligibleUsers`) live in `./briefings` (V8) and are invoked here
 *   via `ctx.runQuery`/`ctx.runMutation`.
 *
 * Schedulers / external callers reference these by string path:
 *   - convex/crons.ts           → "ai/briefingsActions:generateForActiveUsers"
 *   - convex/ai/briefingsPublic → "ai/briefingsActions:generate"
 */
import { generateText } from "ai";
import { v } from "convex/values";
import type { Id } from "../_generated/dataModel";
import { internalAction } from "../_generated/server";
import type { ProviderId } from "./encryptionTypes";
import {
	buildLanguageModel,
	getPlatformKey,
	MODEL_REGISTRY,
	PLATFORM_BRIEFING_MODEL,
} from "./models";

// String-path forward refs (resolved post-codegen)
// biome-ignore lint/suspicious/noExplicitAny: Convex pre-codegen forward ref pattern
const _ref = (path: string) => path as any;
// biome-ignore lint/suspicious/noExplicitAny: Convex pre-codegen forward ref pattern
const _anyArgs = (a: Record<string, unknown>) => a as any;

// ─── Generate briefing (action — calls LLM) ──────────────────────────────────

export const generate = internalAction({
	args: {
		orgId: v.id("orgs"),
		userId: v.id("users"),
		trigger: v.union(v.literal("cron"), v.literal("manual")),
	},
	handler: async (ctx, args) => {
		// 1. Collect data
		const data = (await ctx.runQuery(
			_ref("ai/briefings:collectUserBriefingData"),
			_anyArgs({
				orgId: args.orgId,
				userId: args.userId,
			}),
		)) as {
			user: { name: string };
			org: { name: string; currency: string };
			counts: { remindersDue: number; openDeals: number; activityCount: number };
			reminders: Array<{ id: string; title: string; dueAt: number; source: string }>;
			topDeals: Array<{ id: string; title: string; value?: number }>;
		};

		// 2. Build prompt
		const remindersList = data.reminders.length
			? data.reminders.map((r) => `- ${r.title} (${r.source ?? "manual"})`).join("\n")
			: "(none scheduled)";
		const dealsList = data.topDeals.length
			? data.topDeals
					.map(
						(d) =>
							`- ${d.title}${d.value ? ` (${data.org.currency} ${d.value.toLocaleString()})` : ""}`,
					)
					.join("\n")
			: "(no open deals)";

		const prompt = `Generate a concise morning briefing for ${data.user.name} at ${data.org.name}.
Today's data:
- Reminders due today: ${data.counts.remindersDue}
- Open deals: ${data.counts.openDeals}
- Recent activity (last 24h): ${data.counts.activityCount}

Top reminders:
${remindersList}

Top open deals:
${dealsList}

Write 2-3 short paragraphs in plain professional language. Highlight what needs attention today. Be specific with names and numbers. Do NOT use bullet points in the output. Do NOT use a greeting like "Good morning" — just dive into the substance.`;

		// 3. Resolve model (always platform-billed; briefings never use BYOK)
		const briefingModelKey = process.env.AI_BRIEFING_MODEL ?? PLATFORM_BRIEFING_MODEL;
		const info = MODEL_REGISTRY[briefingModelKey] ?? MODEL_REGISTRY[PLATFORM_BRIEFING_MODEL];
		const apiKey = getPlatformKey(info.provider as ProviderId);
		if (!apiKey) {
			console.warn("[briefings.generate] No platform API key for", info.provider);
			return;
		}
		const model = buildLanguageModel({
			provider: info.provider as ProviderId,
			modelId: info.modelId,
			apiKey,
		});

		// 4. Generate
		try {
			const result = await generateText({
				model: model as Parameters<typeof generateText>[0]["model"],
				prompt,
				temperature: 0.4,
				maxTokens: 400,
			});

			// 5. Build highlights
			const highlights: Array<{
				type: string;
				entityType?: string;
				entityId?: string;
				text: string;
			}> = [];
			for (const r of data.reminders.slice(0, 3)) {
				highlights.push({
					type: "due_today",
					entityType: "reminder",
					entityId: r.id,
					text: r.title,
				});
			}

			// 6. Persist
			await ctx.runMutation(
				_ref("ai/briefings:insertBriefing"),
				_anyArgs({
					orgId: args.orgId,
					userId: args.userId,
					summary: result.text,
					highlights,
					model: `${info.provider}:${briefingModelKey}`,
					inputTokens: result.usage?.promptTokens,
					outputTokens: result.usage?.completionTokens,
					trigger: args.trigger,
				}),
			);
		} catch (err) {
			console.error("[briefings.generate] failed:", err);
		}
	},
});

// ─── Cron entry: iterate active users for an org, generate briefings ─────────

export const generateForActiveUsers = internalAction({
	args: {},
	handler: async (ctx) => {
		const fourteenDaysAgo = Date.now() - 14 * 24 * 60 * 60 * 1000;
		// Get every active org member who has an opted-in user preference
		const orgs = (await ctx.runQuery(
			_ref("ai/briefings:listEligibleUsers"),
			_anyArgs({
				activeSince: fourteenDaysAgo,
			}),
		)) as Array<{ orgId: Id<"orgs">; userId: Id<"users"> }>;
		// Throttle: 1 req/sec to stay under provider rate limits
		for (const { orgId, userId } of orgs) {
			await ctx.runAction(
				_ref("ai/briefingsActions:generate"),
				_anyArgs({ orgId, userId, trigger: "cron" }),
			);
			await new Promise((r) => setTimeout(r, 1000));
		}
	},
});

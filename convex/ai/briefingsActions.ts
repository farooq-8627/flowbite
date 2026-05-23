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
				maxOutputTokens: 400, // v5: renamed from `maxTokens`
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
					inputTokens: result.usage?.inputTokens,
					outputTokens: result.usage?.outputTokens,
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

// ─── Sprint 5: weekly-org briefing generator ─────────────────────────────────
//
// Generates one briefing per org. Produces a structured payload with
// summary + 3-5 highlights + actionItems + trend. Uses the standard
// (non-Haiku) model tier — the prompt is heavier and the output more
// substantive than the daily briefing. Falls back to the briefing model
// if no standard key is configured (so single-key deployments still work).

export const generateWeeklyForOrg = internalAction({
	args: {
		orgId: v.id("orgs"),
		trigger: v.union(v.literal("cron"), v.literal("manual")),
	},
	handler: async (ctx, args) => {
		// 1. Collect data
		const data = (await ctx.runQuery(
			_ref("ai/briefings:collectOrgWeeklyData"),
			_anyArgs({ orgId: args.orgId }),
		)) as {
			org: { name: string; currency: string };
			window: { weekAgo: number; now: number };
			deals: {
				totalOpen: number;
				totalOpenValue: number;
				wonThisWeek: number;
				lostThisWeek: number;
				wonValueThisWeek: number;
				wonWoWChange: number;
			};
			leads: {
				newThisWeek: number;
				newWoWChange: number;
				convertedThisWeek: number;
				conversionRate: number;
			};
			reminders: {
				totalThisWeek: number;
				completed: number;
				overdue: number;
				completionRate: number;
			};
		};

		// 2. Build structured prompt — 1500-token budget; ask for patterns not just numbers.
		const trendDirection =
			data.deals.wonWoWChange > 0 ? "up" : data.deals.wonWoWChange < 0 ? "down" : "flat";

		const prompt = `You are writing a weekly insight for the workspace **${data.org.name}**.
The window is the last 7 days. Compare to the prior week where indicated.

DATA
- Open deals: ${data.deals.totalOpen} (total value ${data.org.currency} ${data.deals.totalOpenValue.toLocaleString()})
- Closed this week: ${data.deals.wonThisWeek} won, ${data.deals.lostThisWeek} lost. Won value: ${data.org.currency} ${data.deals.wonValueThisWeek.toLocaleString()}.
- Week-over-week wins: ${data.deals.wonWoWChange >= 0 ? "+" : ""}${data.deals.wonWoWChange}.
- New leads: ${data.leads.newThisWeek} (vs prior week change: ${data.leads.newWoWChange >= 0 ? "+" : ""}${data.leads.newWoWChange}).
- Leads converted to contacts: ${data.leads.convertedThisWeek} (conversion rate ${data.leads.conversionRate}%).
- Reminders due this week: ${data.reminders.totalThisWeek}. Completed: ${data.reminders.completed} (${data.reminders.completionRate}%). Overdue: ${data.reminders.overdue}.

TASK
Reply with ONLY a JSON object (no prose, no code fences) matching this shape exactly:
{
  "summary": "1-2 sentence headline focusing on the most important pattern",
  "highlights": ["3-5 plain-prose bullets, each one short sentence"],
  "actionItems": [{ "label": "Short call-to-action label, max 5 words" }]
}

Rules:
- Do NOT just restate the numbers; find the pattern (improving / declining / steady).
- Be specific (e.g. "wins are up 40% week-over-week") instead of generic ("things look good").
- Keep highlights under 15 words each.
- 1-3 actionItems max — only add when clearly useful.
- Output ONLY the JSON object, nothing else.`;

		// 3. Resolve model — prefer standard tier, fall back to briefing tier
		const standardModelKey = process.env.AI_DEFAULT_MODEL ?? PLATFORM_BRIEFING_MODEL;
		const info = MODEL_REGISTRY[standardModelKey] ?? MODEL_REGISTRY[PLATFORM_BRIEFING_MODEL];
		const apiKey = getPlatformKey(info.provider as ProviderId);
		if (!apiKey) {
			console.warn("[briefings.generateWeekly] no key for", info.provider);
			return;
		}
		const model = buildLanguageModel({
			provider: info.provider as ProviderId,
			modelId: info.modelId,
			apiKey,
		});

		try {
			const result = await generateText({
				model: model as Parameters<typeof generateText>[0]["model"],
				prompt,
				temperature: 0.4,
				maxOutputTokens: 700,
			});

			// 4. Parse JSON output. The prompt asks for a bare object,
			// but small models occasionally wrap in code fences. Strip
			// them defensively before JSON.parse.
			const cleaned = result.text
				.trim()
				.replace(/^```(?:json)?\s*/i, "")
				.replace(/```\s*$/i, "")
				.trim();
			let parsed: {
				summary?: string;
				highlights?: string[];
				actionItems?: Array<{ label: string; url?: string; toolCall?: string }>;
			};
			try {
				parsed = JSON.parse(cleaned);
			} catch {
				console.warn(
					"[briefings.generateWeekly] non-JSON output — falling back to plain summary",
				);
				parsed = { summary: cleaned, highlights: [], actionItems: [] };
			}

			// 5. Persist
			await ctx.runMutation(
				_ref("ai/briefings:insertWeeklyBriefing"),
				_anyArgs({
					orgId: args.orgId,
					summary: parsed.summary ?? "Weekly summary unavailable.",
					highlights: (parsed.highlights ?? []).slice(0, 5),
					actionItems: (parsed.actionItems ?? []).slice(0, 3),
					trend: trendDirection,
					model: `${info.provider}:${standardModelKey}`,
					inputTokens: result.usage?.inputTokens,
					outputTokens: result.usage?.outputTokens,
					trigger: args.trigger,
				}),
			);
		} catch (err) {
			console.error("[briefings.generateWeekly] failed:", err);
		}
	},
});

// ─── Cron entry: iterate every active org for the weekly insight ─────────────

export const generateForAllOrgs = internalAction({
	args: {},
	handler: async (ctx) => {
		const orgs = (await ctx.runQuery(
			_ref("ai/briefings:listActiveOrgs"),
			_anyArgs({}),
		)) as Array<{ orgId: Id<"orgs"> }>;
		for (const { orgId } of orgs) {
			await ctx.runAction(
				_ref("ai/briefingsActions:generateWeeklyForOrg"),
				_anyArgs({ orgId, trigger: "cron" }),
			);
			await new Promise((r) => setTimeout(r, 1500));
		}
	},
});

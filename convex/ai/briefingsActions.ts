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
 *
 * 2026-05-27 — provider key resolution rewritten to mirror
 * `titleGeneration.pickTitleModel`. Order: BYOK (user → org via
 * `ai/keys:resolveKey`) → DB platform key (`_platform/aiKeys:getEncryptedPlatformKey`)
 * → env platform key (`getPlatformKey`). When no key is found we now
 * persist an error briefing row so the dashboard surfaces the failure
 * instead of silently swallowing it.
 */
import { generateText } from "ai";
import { v } from "convex/values";
import type { Id } from "../_generated/dataModel";
import { type ActionCtx, internalAction } from "../_generated/server";
import { decryptApiKey } from "./encryption";
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
/**
 * Resolve a usable provider model for the briefing call. Mirrors
 * `titleGeneration.pickTitleModel` so behaviour is consistent across
 * every internal "platform-cost" LLM call.
 *
 * Resolution order:
 *   1. The configured briefing model's provider — try BYOK key for
 *      (org,user), then BYOK org-scope, then platform DB key, then
 *      platform env key.
 *   2. Fall back through the same hierarchy for two cheap alternatives
 *      (`gemini-2.5-flash-lite`, `gpt-4o-mini`) so deployments missing
 *      the briefing-model provider can still produce a briefing.
 *
/**
 * Shared model resolver for AI features that follow the briefing-style
 * preference: cheap small model first, fall back to platform alternatives.
 * Exported so other Stage 5+ "ask the AI a small thing" actions
 * (`explainDealScore`, etc.) reuse the same BYOK → platform fallback
 * order without duplicating the resolver.
 *
 * Returns the bound LanguageModel + the modelKey (for the audit row's
 * `model` field). Returns null when NO provider can be resolved — the
 * caller writes an error briefing in that case.
 */
export async function pickBriefingModel(
	ctx: ActionCtx,
	orgId: Id<"orgs">,
	userId: Id<"users">,
): Promise<{ model: unknown; modelKey: string; source: string } | null> {
	const briefingModelKey = process.env.AI_BRIEFING_MODEL ?? PLATFORM_BRIEFING_MODEL;
	const order = [briefingModelKey, "gemini-2.5-flash-lite", "gpt-4o-mini"].filter(
		(k, i, a) => a.indexOf(k) === i,
	);
	return pickModelInOrder(ctx, order, { orgId, userId });
}

/**
 * Org-scoped model resolver — used by `generateWeeklyForOrg` which has
 * no userId. Skips user-scope BYOK keys, otherwise identical to
 * `pickBriefingModel`. Caller passes the explicit modelKey order.
 */
async function pickOrgScopedModel(
	ctx: ActionCtx,
	orgId: Id<"orgs">,
	order: string[],
): Promise<{ model: unknown; modelKey: string; source: string } | null> {
	const dedup = order.filter((k, i, a) => a.indexOf(k) === i);
	return pickModelInOrder(ctx, dedup, { orgId });
}

/**
 * Shared resolver loop — walks `order` and returns the first usable
 * provider via BYOK (user → org) → platform DB → platform env.
 */
async function pickModelInOrder(
	ctx: ActionCtx,
	order: string[],
	scope: { orgId: Id<"orgs">; userId?: Id<"users"> },
): Promise<{ model: unknown; modelKey: string; source: string } | null> {
	for (const key of order) {
		const info = MODEL_REGISTRY[key];
		if (!info) continue;
		const provider = info.provider as ProviderId;

		// 1. BYOK (user → org). resolveKey already implements that
		// fallback when a userId is supplied.
		if (scope.userId) {
			const byok = (await ctx.runQuery(
				_ref("ai/keys:resolveKey"),
				_anyArgs({
					orgId: scope.orgId as string,
					userId: scope.userId as string,
					provider,
				}),
			)) as {
				encryptedKey: string;
				baseUrl: string | null;
				scope: "user" | "org";
			} | null;
			if (byok) {
				try {
					const decrypted = decryptApiKey(byok.encryptedKey);
					return {
						model: buildLanguageModel({
							provider,
							modelId: info.modelId,
							apiKey: decrypted,
							baseUrl: byok.baseUrl ?? undefined,
						}),
						modelKey: key,
						source: `byok:${byok.scope}`,
					};
				} catch {
					// Fall through to next source.
				}
			}
		} else {
			// Org-only path — query the org-scope BYOK row directly via
			// the same internal getter used by the orchestrator.
			const orgByok = (await ctx.runQuery(
				_ref("ai/keys:resolveOrgKeyForProvider"),
				_anyArgs({ orgId: scope.orgId as string, provider }),
			)) as { encryptedKey: string; baseUrl: string | null } | null;
			if (orgByok) {
				try {
					const decrypted = decryptApiKey(orgByok.encryptedKey);
					return {
						model: buildLanguageModel({
							provider,
							modelId: info.modelId,
							apiKey: decrypted,
							baseUrl: orgByok.baseUrl ?? undefined,
						}),
						modelKey: key,
						source: "byok:org",
					};
				} catch {
					// Fall through.
				}
			}
		}

		// 2. Platform DB key (managed via the Owner panel — see
		// `convex/_platform/aiKeys`). Ahead of env so operators can
		// rotate keys without a redeploy.
		const dbPlat = (await ctx.runQuery(
			_ref("_platform/aiKeys/queries:getEncryptedPlatformKey"),
			_anyArgs({ provider: provider as string }),
		)) as { encryptedKey: string; baseUrl: string | null } | null;
		if (dbPlat) {
			try {
				const decrypted = decryptApiKey(dbPlat.encryptedKey);
				return {
					model: buildLanguageModel({
						provider,
						modelId: info.modelId,
						apiKey: decrypted,
						baseUrl: dbPlat.baseUrl ?? undefined,
					}),
					modelKey: key,
					source: "platform:db",
				};
			} catch {
				// Fall through.
			}
		}

		// 3. Env platform key — legacy path, kept for backwards compat.
		const envPlat = getPlatformKey(provider);
		if (envPlat) {
			return {
				model: buildLanguageModel({
					provider,
					modelId: info.modelId,
					apiKey: envPlat,
				}),
				modelKey: key,
				source: "platform:env",
			};
		}
	}

	return null;
}

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
			reminders: Array<{ id: string; title: string; dueAt: number; type: string }>;
			topDeals: Array<{ id: string; title: string; value?: number }>;
		};

		// 2. Build prompt
		const remindersList = data.reminders.length
			? data.reminders.map((r) => `- ${r.title} (${r.type ?? "todo"})`).join("\n")
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

		// 3. Resolve a usable model — BYOK first, then platform DB, then
		//    platform env. Falls through to two cheaper alternatives if
		//    the configured briefing model can't be resolved.
		const choice = await pickBriefingModel(ctx, args.orgId, args.userId);
		if (!choice) {
			// Persist an error row so the DailyBriefingCard surfaces the
			// problem instead of going silent.
			await ctx.runMutation(
				_ref("ai/briefings:insertBriefing"),
				_anyArgs({
					orgId: args.orgId,
					userId: args.userId,
					summary:
						"Couldn't generate your briefing — no AI key is available. Add an API key in Settings → AI (per-user/per-org) or ask the platform owner to add one in the Owner panel → AI Keys.",
					highlights: [],
					model: "error:no_key",
					trigger: args.trigger,
				}),
			);
			return;
		}

		// 4. Generate
		try {
			const result = await generateText({
				model: choice.model as Parameters<typeof generateText>[0]["model"],
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
					entityType: "task",
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
					model: `${choice.source}:${choice.modelKey}`,
					inputTokens: result.usage?.inputTokens,
					outputTokens: result.usage?.outputTokens,
					trigger: args.trigger,
				}),
			);
		} catch (err) {
			console.error("[briefings.generate] failed:", err);
			// Surface the error in the UI so the user knows refresh failed.
			await ctx.runMutation(
				_ref("ai/briefings:insertBriefing"),
				_anyArgs({
					orgId: args.orgId,
					userId: args.userId,
					summary: `Couldn't generate your briefing — the AI provider returned an error. (${String(
						err,
					).slice(0, 200)})`,
					highlights: [],
					model: `error:${choice.modelKey}`,
					trigger: args.trigger,
				}),
			);
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

		// 3. Resolve model — prefer standard tier, fall back to briefing
		// tier and to two cheap alternatives if neither is configured.
		// Mirrors pickBriefingModel but org-scoped (no userId) so it
		// only consults org-scope BYOK + platform sources.
		const standardModelKey = process.env.AI_DEFAULT_MODEL ?? PLATFORM_BRIEFING_MODEL;
		const choice = await pickOrgScopedModel(ctx, args.orgId, [
			standardModelKey,
			PLATFORM_BRIEFING_MODEL,
			"gemini-2.5-flash-lite",
			"gpt-4o-mini",
		]);
		if (!choice) {
			console.warn(
				"[briefings.generateWeekly] no provider key available for org",
				args.orgId,
			);
			return;
		}

		try {
			const result = await generateText({
				model: choice.model as Parameters<typeof generateText>[0]["model"],
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
					model: `${choice.source}:${choice.modelKey}`,
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

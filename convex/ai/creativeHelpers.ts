/**
 * convex/ai/creativeHelpers.ts
 *
 * Stage 9 of `/SPRINT-PLAN.md` (2026-05-26). V8-runtime helpers for the
 * creative-layer tools (`draft_message`, `draft_proposal`,
 * `summarise_conversation`, `web_scrape`). The internal action
 * subagents in `convex/ai/actions/{draftMessage,draftProposal,
 * summariseConversation,webScrape}.ts` are `"use node"` and CANNOT
 * define `internalQuery` / `internalMutation` — so anything that
 * touches the DB on the action's behalf lives here.
 *
 * Two helpers:
 *
 *   - `enforceCreativeQuota` (internalMutation) — single gate the
 *     creative tools call BEFORE invoking the LLM. Validates
 *     membership via `requireOrgMemberByIds`, applies the 5/min/user
 *     `enforceRateLimit` (scope `"ai.creative"`), and counts
 *     `aiToolEvents` over the last 24h to enforce the 50/day/user
 *     soft cap. Throws `ConvexError({code: "AI_QUOTA_EXHAUSTED"})` on
 *     overflow so the tool's `runTool` wrapper surfaces a friendly
 *     "your daily creative budget is exhausted" message.
 *
 *   - `countRecentCreativeRunsForUser` (internalQuery) — read-only
 *     counter exposed for the daily-cap check; also used by the test
 *     harness to assert quota behaviour.
 *
 * Why a single mutation instead of two separate calls (rate-limit +
 * count) from the tool layer:
 *
 *   - Atomic per-turn enforcement. If the user fires draft_message
 *     twice in a 200ms window, both turns serialize through the same
 *     row in `rateLimits` and the second one fails the same way the
 *     first one would mid-window.
 *   - One round-trip from the action context. The tool can call
 *     `toolMutation(tc, "ai/creativeHelpers:enforceCreativeQuota",
 *     {toolName})` and either succeed (proceed to LLM) or throw
 *     (caught by `runTool` → friendly error).
 */

import { ConvexError, v } from "convex/values";
import { requireOrgMemberByIds } from "../_functions/authenticated";
import { internalMutation, internalQuery } from "../_generated/server";
import { enforceRateLimit } from "../_shared/rateLimit";

/** Per-user, per-minute bucket — protects against runaway tool loops. */
export const CREATIVE_PER_MINUTE = 5;
/** Per-user, per-day soft cap — enforced via `aiToolEvents` count. */
export const CREATIVE_PER_DAY = 50;
/** Window for the daily cap. */
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Validate org membership + apply the 5/min rate limit + check the
 * 50/day soft cap. Throws on any failure.
 *
 * Called from creative tools BEFORE invoking the LLM action so the
 * gate runs in a single transactional step.
 *
 * Counts only successful prior runs (`ok === true`) toward the daily
 * cap so a streak of LLM provider failures doesn't wedge the user
 * out of their budget.
 */
export const enforceCreativeQuota = internalMutation({
	args: {
		orgId: v.id("orgs"),
		userId: v.id("users"),
		toolName: v.string(),
	},
	handler: async (ctx, args): Promise<{ remainingMinute: number; remainingDay: number }> => {
		await requireOrgMemberByIds(ctx, args.orgId, args.userId);

		// 5/min/user — token bucket via shared `rateLimits` table.
		await enforceRateLimit(ctx, {
			scope: "ai.creative",
			key: `${args.userId}:${args.orgId}`,
			max: CREATIVE_PER_MINUTE,
			periodMs: 60_000,
			orgId: args.orgId,
		});

		// 50/day/user — soft cap counted from `aiToolEvents` over the last
		// 24h. The available index is `by_org_and_started` (no userId
		// dimension), so we filter the small slice in memory. With the
		// 5/min cap upstream, the worst-case slice for any single org is
		// 5 * 60 * 24 = 7200 rows — well within a single read budget.
		// We count across ALL creative tool names (single shared budget,
		// not per-tool) so a runaway loop that alternates between
		// draft_message / summarise_conversation can't sneak past.
		const since = Date.now() - ONE_DAY_MS;
		const recent = await ctx.db
			.query("aiToolEvents")
			.withIndex("by_org_and_started", (q) =>
				q.eq("orgId", args.orgId).gte("startedAt", since),
			)
			.collect();
		const successful = recent.filter(
			(r) =>
				r.ok &&
				String(r.userId) === String(args.userId) &&
				CREATIVE_TOOL_NAMES.includes(r.toolName),
		).length;
		if (successful >= CREATIVE_PER_DAY) {
			throw new ConvexError({
				code: "AI_QUOTA_EXHAUSTED",
				message: `Daily creative-tool budget exhausted (${CREATIVE_PER_DAY}/day). The window resets in 24h.`,
			});
		}

		void args.toolName; // reserved for per-tool dimensions in a future audit pass.
		return {
			remainingMinute: Math.max(0, CREATIVE_PER_MINUTE - 1),
			remainingDay: Math.max(0, CREATIVE_PER_DAY - successful - 1),
		};
	},
});

/**
 * Read-only daily counter for the creative-tool budget. Exposed so the
 * Settings UI / test harness can show "you've used N/50 today" without
 * incrementing the bucket.
 */
export const countRecentCreativeRunsForUser = internalQuery({
	args: { orgId: v.id("orgs"), userId: v.id("users") },
	handler: async (ctx, args): Promise<number> => {
		await requireOrgMemberByIds(ctx, args.orgId, args.userId);
		const since = Date.now() - ONE_DAY_MS;
		const recent = await ctx.db
			.query("aiToolEvents")
			.withIndex("by_org_and_started", (q) =>
				q.eq("orgId", args.orgId).gte("startedAt", since),
			)
			.collect();
		return recent.filter(
			(r) =>
				r.ok &&
				String(r.userId) === String(args.userId) &&
				CREATIVE_TOOL_NAMES.includes(r.toolName),
		).length;
	},
});

/** Single source of truth for which tool names count toward the creative budget. */
export const CREATIVE_TOOL_NAMES: readonly string[] = [
	"draft_message",
	"commit_draft_message",
	"draft_proposal",
	"commit_draft_proposal",
	"summarise_conversation",
	// `web_scrape` does NOT count toward the creative budget — it has
	// its own 30/min Firecrawl-scrape rate limit; the daily-token cost
	// comes from Firecrawl's pricing tier, not the LLM provider.
];

/**
 * Lighter-weight per-minute gate for `web_scrape`. Firecrawl pricing
 * tiers cap monthly volume server-side; the per-minute gate here is
 * the cheap pre-cap that stops a runaway loop from burning the
 * monthly budget in 90 seconds.
 *
 * 30/min/user — well above any sane chat cadence.
 */
export const enforceWebScrapeRateLimit = internalMutation({
	args: { orgId: v.id("orgs"), userId: v.id("users") },
	handler: async (ctx, args): Promise<void> => {
		await requireOrgMemberByIds(ctx, args.orgId, args.userId);
		await enforceRateLimit(ctx, {
			scope: "ai.creative.webScrape",
			key: `${args.userId}:${args.orgId}`,
			max: 30,
			periodMs: 60_000,
			orgId: args.orgId,
		});
	},
});

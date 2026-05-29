/**
 * convex/ai/briefingsPublic.ts
 *
 * Public-facing briefing queries + manual refresh mutation.
 * Split from briefings.ts because public functions cannot live in a "use node" file.
 */
import { v } from "convex/values";
import {
	orgMutation,
	orgQuery,
	requireOrgMember,
	requireOrgMemberByIds,
} from "../_functions/authenticated";
import { internalMutation, internalQuery } from "../_generated/server";
import { requireRole } from "../_shared/permissions/helpers";
import { enforceRateLimit } from "../_shared/rateLimit";

/** Get the latest briefing for the calling user. */
export const getLatest = orgQuery({
	args: { orgId: v.id("orgs") },
	handler: async (ctx, args) => {
		const { userId } = await requireOrgMember(ctx, args.orgId);
		const briefing = await ctx.db
			.query("aiBriefings")
			.withIndex("by_org_and_user_and_generated", (q) =>
				q.eq("orgId", args.orgId).eq("userId", userId),
			)
			.order("desc")
			.first();
		if (!briefing) return null;
		// Filter out expired briefings
		if (briefing.expiresAt < Date.now()) return null;
		return briefing;
	},
});

/**
 * Sprint 5 — daily briefing query, scope-aware.
 * Returns the calling user's latest unexpired `daily-user` briefing.
 * Identical signature to `getLatest` but filters by scope so a
 * future weekly-org row in the same indexes won't accidentally be
 * returned. Used by `DailyBriefingCard`.
 */
export const todayForUser = orgQuery({
	args: { orgId: v.id("orgs") },
	handler: async (ctx, args) => {
		const { userId } = await requireOrgMember(ctx, args.orgId);
		const all = await ctx.db
			.query("aiBriefings")
			.withIndex("by_org_and_user_and_generated", (q) =>
				q.eq("orgId", args.orgId).eq("userId", userId),
			)
			.order("desc")
			.take(5);
		const briefing = all.find((b) => (b.scope ?? "daily-user") === "daily-user");
		if (!briefing) return null;
		if (briefing.expiresAt < Date.now()) return null;
		return briefing;
	},
});

/**
 * Sprint 5 — weekly insight for the org. Returns the latest unexpired
 * `weekly-org` row. Visible to every member of the org. Used by
 * `WeeklyInsightCard`.
 */
export const thisWeekForOrg = orgQuery({
	args: { orgId: v.id("orgs") },
	handler: async (ctx, args) => {
		await requireOrgMember(ctx, args.orgId);
		const briefing = await ctx.db
			.query("aiBriefings")
			.withIndex("by_org_and_scope", (q) =>
				q.eq("orgId", args.orgId).eq("scope", "weekly-org"),
			)
			.order("desc")
			.first();
		if (!briefing) return null;
		if (briefing.expiresAt < Date.now()) return null;
		return briefing;
	},
});

/**
 * Manually trigger a fresh briefing generation.
 * Counts against the user's AI message quota when triggered manually.
 */
export const refreshNow = orgMutation({
	args: { orgId: v.id("orgs") },
	handler: async (ctx, args) => {
		const { member, userId } = await requireOrgMember(ctx, args.orgId);
		requireRole(member.permissions, "ai.briefingRefresh");

		await enforceRateLimit(ctx, {
			scope: "ai.briefing.refresh",
			key: `${userId}:${args.orgId}`,
			max: 5,
			periodMs: 60_000,
		});

		// Schedule the generate action — running it inline would deadlock the mutation
		// String-path forward ref because briefingsActions.generate is in a "use node" file
		await ctx.scheduler.runAfter(
			0,
			// biome-ignore lint/suspicious/noExplicitAny: Convex pre-codegen forward ref
			"ai/briefingsActions:generate" as any,
			{
				orgId: args.orgId,
				userId,
				trigger: "manual",
			} as never,
		);

		return { scheduled: true };
	},
});

/**
 * Stage 1 of DASHBOARD-V2-PLAN.md (2026-05-28). Manually trigger a
 * fresh weekly-org insight. Gates on `ai.briefingRefresh` (same
 * permission as the daily refresh — Owner / Admin by default per
 * `permissions/catalog.ts`). Rate-limited to **1 per day per org**
 * via a custom rate-limit shape (`max: 1, periodMs: 86_400_000`)
 * because each weekly insight calls a heavier model than the daily
 * (per `briefingsActions.generateWeeklyForOrg` — standard tier
 * with a 700-token output budget) and is org-scoped (every member
 * shares the result).
 *
 * Schedules `ai/briefingsActions:generateWeeklyForOrg` with
 * `trigger: "manual"`. The action handles model resolution
 * (BYOK → platform DB key → env), data collection, generation,
 * and persists a fresh `aiBriefings` row with `scope: "weekly-org"`
 * that supersedes the prior week's row. `WeeklyInsightCard`'s
 * `thisWeekForOrg` query reads that row.
 */
export const refreshWeeklyNow = orgMutation({
	args: { orgId: v.id("orgs") },
	handler: async (ctx, args) => {
		const { member } = await requireOrgMember(ctx, args.orgId);
		requireRole(member.permissions, "ai.briefingRefresh");

		// 1/day/org — keyed on orgId only so all members share the budget.
		// `enforceRateLimit` accepts any periodMs; the 5/min `RATE_LIMITS.ai`
		// preset is per-user and would let every member burn one
		// generation each. Scoping the key to `orgId` is the SSOT.
		await enforceRateLimit(ctx, {
			scope: "ai.briefing.refreshWeekly",
			key: `${args.orgId}`,
			max: 1,
			periodMs: 86_400_000,
		});

		await ctx.scheduler.runAfter(
			0,
			// biome-ignore lint/suspicious/noExplicitAny: Convex pre-codegen forward ref
			"ai/briefingsActions:generateWeeklyForOrg" as any,
			{
				orgId: args.orgId,
				trigger: "manual",
			} as never,
		);

		return { scheduled: true };
	},
});

// ─── Stage 7 (SPRINT-PLAN.md) — ForAI twins ─────────────────────────────
//
// Per AGENTS.md non-negotiable rule, every public query/mutation an AI
// tool calls has a same-file `*ForAI` internal twin that takes a trusted
// `userId` argument and bypasses `getAuthUserId` (which returns null
// inside scheduled actions). Mirrors the public versions exactly.

export const todayForUserForAI = internalQuery({
	args: { orgId: v.id("orgs"), userId: v.id("users") },
	handler: async (ctx, args) => {
		await requireOrgMemberByIds(ctx, args.orgId, args.userId);
		const all = await ctx.db
			.query("aiBriefings")
			.withIndex("by_org_and_user_and_generated", (q) =>
				q.eq("orgId", args.orgId).eq("userId", args.userId),
			)
			.order("desc")
			.take(5);
		const briefing = all.find((b) => (b.scope ?? "daily-user") === "daily-user");
		if (!briefing) return null;
		if (briefing.expiresAt < Date.now()) return null;
		return briefing;
	},
});

export const thisWeekForOrgForAI = internalQuery({
	args: { orgId: v.id("orgs"), userId: v.id("users") },
	handler: async (ctx, args) => {
		await requireOrgMemberByIds(ctx, args.orgId, args.userId);
		const briefing = await ctx.db
			.query("aiBriefings")
			.withIndex("by_org_and_scope", (q) =>
				q.eq("orgId", args.orgId).eq("scope", "weekly-org"),
			)
			.order("desc")
			.first();
		if (!briefing) return null;
		if (briefing.expiresAt < Date.now()) return null;
		return briefing;
	},
});

/**
 * AI-callable twin of `refreshNow`. Unchanged behaviour: rate-limit 5/min,
 * gate on `ai.briefingRefresh`, schedule `ai/briefingsActions:generate`.
 * The trusted `userId` is supplied by the AI tool layer so the scheduler
 * call can attribute the briefing to the right user.
 */
export const refreshNowForAI = internalMutation({
	args: { orgId: v.id("orgs"), userId: v.id("users") },
	handler: async (ctx, args) => {
		const { member } = await requireOrgMemberByIds(ctx, args.orgId, args.userId);
		requireRole(member.permissions, "ai.briefingRefresh");
		await enforceRateLimit(ctx, {
			scope: "ai.briefing.refresh",
			key: `${args.userId}:${args.orgId}`,
			max: 5,
			periodMs: 60_000,
		});
		await ctx.scheduler.runAfter(
			0,
			// biome-ignore lint/suspicious/noExplicitAny: Convex pre-codegen forward ref
			"ai/briefingsActions:generate" as any,
			{
				orgId: args.orgId,
				userId: args.userId,
				trigger: "manual",
			} as never,
		);
		return { scheduled: true };
	},
});

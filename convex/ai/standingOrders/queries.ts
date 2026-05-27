/**
 * convex/ai/standingOrders/queries.ts
 *
 * Stage 8 of /SPRINT-PLAN.md (Autonomous layer). Reads for the
 * `aiStandingOrders` table.
 *
 * Per AGENTS.md non-negotiable rule, every public query has a same-file
 * `*ForAI` internal twin so AI tools can list standing orders. The
 * runner uses an even more privileged internal query (`getEnabledForRun`)
 * that bypasses the `ai.automation.manage` gate — the cron evaluator has
 * already validated the row, and the runner's per-tool execution is
 * gated by the OWNER's permissions.
 */

import { v } from "convex/values";
import { orgQuery, requireOrgMember, requireOrgMemberByIds } from "../../_functions/authenticated";
import type { Id } from "../../_generated/dataModel";
import { internalQuery, type QueryCtx } from "../../_generated/server";
import { requireRole } from "../../_shared/permissions/helpers";
import { describeSchedule } from "./schedule";

async function listOwn(ctx: QueryCtx, orgId: Id<"orgs">, userId: Id<"users">) {
	const rows = await ctx.db
		.query("aiStandingOrders")
		.withIndex("by_org_and_user", (q) => q.eq("orgId", orgId).eq("userId", userId))
		.order("desc")
		.take(100);
	return rows.map((r) => ({
		id: r._id,
		name: r.name,
		prompt: r.prompt,
		allowedTools: r.allowedTools,
		schedule: r.schedule,
		scheduleLabel: describeSchedule(r.schedule),
		enabled: r.enabled,
		lastRunAt: r.lastRunAt,
		lastRunSummary: r.lastRunSummary,
		lastRunStatus: r.lastRunStatus,
		createdAt: r.createdAt,
		updatedAt: r.updatedAt,
	}));
}

async function listOrg(ctx: QueryCtx, orgId: Id<"orgs">) {
	const rows = await ctx.db
		.query("aiStandingOrders")
		.withIndex("by_org", (q) => q.eq("orgId", orgId))
		.order("desc")
		.take(500);
	return rows.map((r) => ({
		id: r._id,
		ownerUserId: r.userId,
		name: r.name,
		prompt: r.prompt,
		allowedTools: r.allowedTools,
		schedule: r.schedule,
		scheduleLabel: describeSchedule(r.schedule),
		enabled: r.enabled,
		lastRunAt: r.lastRunAt,
		lastRunSummary: r.lastRunSummary,
		lastRunStatus: r.lastRunStatus,
		createdAt: r.createdAt,
		updatedAt: r.updatedAt,
	}));
}

export const listForUser = orgQuery({
	args: { orgId: v.id("orgs") },
	handler: async (ctx, args) => {
		const { userId, member } = await requireOrgMember(ctx, args.orgId);
		requireRole(member.permissions, "ai.automation.manage");
		return listOwn(ctx, args.orgId, userId);
	},
});

export const listForOrg = orgQuery({
	args: { orgId: v.id("orgs") },
	handler: async (ctx, args) => {
		const { member } = await requireOrgMember(ctx, args.orgId);
		requireRole(member.permissions, "ai.automation.manage");
		return listOrg(ctx, args.orgId);
	},
});

// ─── ForAI twins ─────────────────────────────────────────────────────────

export const listForUserForAI = internalQuery({
	args: { orgId: v.id("orgs"), userId: v.id("users") },
	handler: async (ctx, args) => {
		const { member } = await requireOrgMemberByIds(ctx, args.orgId, args.userId);
		requireRole(member.permissions, "ai.automation.manage");
		return listOwn(ctx, args.orgId, args.userId);
	},
});

export const listForOrgForAI = internalQuery({
	args: { orgId: v.id("orgs"), userId: v.id("users") },
	handler: async (ctx, args) => {
		const { member } = await requireOrgMemberByIds(ctx, args.orgId, args.userId);
		requireRole(member.permissions, "ai.automation.manage");
		return listOrg(ctx, args.orgId);
	},
});

// ─── Cron-evaluator helpers (no permission check) ────────────────────────

/**
 * List enabled standing orders that are DUE to fire at `now`. Reads
 * `withIndex("by_enabled_and_first_fire", q => q.eq("enabled", true)
 * .lte("firstFireAt", now))` so the evaluator does ZERO work when no
 * rows are due — fixes the Stage 3-A.B.23 concurrency hotspot where
 * the every-minute cron used to scan every enabled row.
 *
 * `take(500)` caps the per-tick burst — at scale the evaluator
 * processes 500 rows per minute, which is well below the
 * action-runtime budget. Rows skipped on a tick will be picked up on
 * the next tick (their `firstFireAt` hasn't moved).
 *
 * Internal-only — never exposed to the public API.
 */
export const listDueForEvaluation = internalQuery({
	args: { now: v.number() },
	handler: async (ctx, args) => {
		const rows = await ctx.db
			.query("aiStandingOrders")
			.withIndex("by_enabled_and_first_fire", (q) =>
				q.eq("enabled", true).lte("firstFireAt", args.now),
			)
			.take(500);
		return rows.map((r) => ({
			id: r._id,
			orgId: r.orgId,
			userId: r.userId,
			schedule: r.schedule,
			lastRunAt: r.lastRunAt,
		}));
	},
});

/**
 * Hydrate a single row by id, enforcing org-scope. Used by the runner
 * just before it streams the prompt — re-reads instead of trusting the
 * cron evaluator's view, in case the row was disabled or removed in the
 * scheduling window.
 */
export const getForRun = internalQuery({
	args: { standingOrderId: v.id("aiStandingOrders") },
	handler: async (ctx, args) => {
		const row = await ctx.db.get(args.standingOrderId);
		if (!row) return null;
		return {
			id: row._id,
			orgId: row.orgId,
			userId: row.userId,
			name: row.name,
			prompt: row.prompt,
			allowedTools: row.allowedTools,
			schedule: row.schedule,
			enabled: row.enabled,
		};
	},
});

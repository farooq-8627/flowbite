/**
 * Tasks Queries — convex/crm/shared/tasks/queries.ts
 *
 * Read surface for the canonical scheduling table (replaces the legacy
 * `reminders/queries.ts` per TASKS-RENAME-PLAN.md, Stage 4A — 2026-05-27).
 *
 * Public surface (callable from authenticated UI clients):
 *   listForPerson / listAllForOrg / getDueToday / getDueAndOverdue
 *   getNextUpcoming / listOpen / getById / getByTaskCode
 *   listForOrg (status-filterable; mirrors the legacy listFollowupsForOrg)
 *   listForPerson (carries forward listFollowupsForPerson semantics on the
 *   `type === "followup"` slice when the caller passes `type: "followup"`)
 *
 * AI-callable internal twins:
 *   listForPersonForAI / listForOrgForAI / getByTaskCodeForAI
 *
 * Visibility rule (carries forward from reminders):
 *   Members without `tasks.manage` see ONLY their own assigned tasks.
 *   Members with `tasks.manage` see every task in the org.
 */
import { v } from "convex/values";
import {
	orgQuery,
	requireOrgMember,
	requireOrgMemberByIds,
} from "../../../_functions/authenticated";
import type { Id } from "../../../_generated/dataModel";
import { internalQuery, type QueryCtx } from "../../../_generated/server";
import { hasPermission, requireRole } from "../../../_shared/permissions";

const taskTypeValidator = v.string();
const taskStatusValidator = v.union(v.literal("pending"), v.literal("completed"));

// ─── listForPerson ───────────────────────────────────────────────────────────
//
// All tasks attached to a given personCode. Optionally filtered by `type` so
// the profile page can render a "Follow-ups" tab via `type: "followup"`,
// preserving the legacy listFollowupsForPerson semantics.

async function listForPersonImpl(
	ctx: QueryCtx,
	args: {
		orgId: Id<"orgs">;
		personCode: string;
		type?: string;
	},
) {
	const rows = await ctx.db
		.query("tasks")
		.withIndex("by_org_and_person", (q) =>
			q.eq("orgId", args.orgId).eq("personCode", args.personCode),
		)
		.collect();
	return args.type ? rows.filter((r) => r.type === args.type) : rows;
}

export const listForPerson = orgQuery({
	args: {
		orgId: v.id("orgs"),
		personCode: v.string(),
		type: v.optional(taskTypeValidator),
	},
	handler: async (ctx, args) => {
		const { member } = await requireOrgMember(ctx, args.orgId);
		requireRole(member.permissions, "tasks.view");
		return listForPersonImpl(ctx, args);
	},
});

/** AI-callable internal twin of `listForPerson`. */
export const listForPersonForAI = internalQuery({
	args: {
		orgId: v.id("orgs"),
		userId: v.id("users"),
		personCode: v.string(),
		type: v.optional(taskTypeValidator),
	},
	handler: async (ctx, args) => {
		const { member } = await requireOrgMemberByIds(ctx, args.orgId, args.userId);
		requireRole(member.permissions, "tasks.view");
		return listForPersonImpl(ctx, args);
	},
});

// ─── listAllForOrg ───────────────────────────────────────────────────────────
//
// Powers `TasksView` (Today / Open / Completed / All tabs). Returns ALL tasks
// regardless of status/dueAt so the client can bucket them. Members without
// `tasks.manage` see only their own assigned tasks.

export const listAllForOrg = orgQuery({
	args: { orgId: v.id("orgs") },
	handler: async (ctx, args) => {
		const { member, userId } = await requireOrgMember(ctx, args.orgId);
		requireRole(member.permissions, "tasks.view");

		const canSeeAll = hasPermission(member.permissions, "tasks.manage");

		const rows = await ctx.db
			.query("tasks")
			.withIndex("by_org_and_due", (q) => q.eq("orgId", args.orgId))
			.collect();

		return canSeeAll ? rows : rows.filter((r) => r.assignedTo === userId);
	},
});

// ─── listForOrg ──────────────────────────────────────────────────────────────
//
// Status-filterable variant. Mirrors the legacy `listFollowupsForOrg` when the
// caller passes `type: "followup"`; works without a type filter as a
// general-purpose status-only view.

async function listForOrgImpl(
	ctx: QueryCtx,
	args: {
		orgId: Id<"orgs">;
		userId: Id<"users">;
		permissions: readonly string[];
		type?: string;
		status?: "pending" | "completed";
	},
) {
	const canSeeAll = hasPermission(args.permissions, "tasks.manage");

	const rows = args.type
		? await ctx.db
				.query("tasks")
				.withIndex("by_org_and_type_and_due", (q) =>
					q.eq("orgId", args.orgId).eq("type", args.type as string),
				)
				.collect()
		: await ctx.db
				.query("tasks")
				.withIndex("by_org_and_due", (q) => q.eq("orgId", args.orgId))
				.collect();

	const filtered = canSeeAll ? rows : rows.filter((r) => r.assignedTo === args.userId);
	return args.status ? filtered.filter((r) => r.status === args.status) : filtered;
}

export const listForOrg = orgQuery({
	args: {
		orgId: v.id("orgs"),
		type: v.optional(taskTypeValidator),
		status: v.optional(taskStatusValidator),
	},
	handler: async (ctx, args) => {
		const { member, userId } = await requireOrgMember(ctx, args.orgId);
		requireRole(member.permissions, "tasks.view");
		return listForOrgImpl(ctx, {
			orgId: args.orgId,
			userId,
			permissions: member.permissions,
			type: args.type,
			status: args.status,
		});
	},
});

/** AI-callable internal twin. */
export const listForOrgForAI = internalQuery({
	args: {
		orgId: v.id("orgs"),
		userId: v.id("users"),
		type: v.optional(taskTypeValidator),
		status: v.optional(taskStatusValidator),
	},
	handler: async (ctx, args) => {
		const { member } = await requireOrgMemberByIds(ctx, args.orgId, args.userId);
		requireRole(member.permissions, "tasks.view");
		return listForOrgImpl(ctx, {
			orgId: args.orgId,
			userId: args.userId,
			permissions: member.permissions,
			type: args.type,
			status: args.status,
		});
	},
});

// ─── getDueToday ─────────────────────────────────────────────────────────────

export const getDueToday = orgQuery({
	args: { orgId: v.id("orgs") },
	handler: async (ctx, args) => {
		const { member, userId } = await requireOrgMember(ctx, args.orgId);
		requireRole(member.permissions, "tasks.view");

		const canSeeAll = hasPermission(member.permissions, "tasks.manage");
		const startOfDay = new Date();
		startOfDay.setHours(0, 0, 0, 0);
		const endOfDay = new Date();
		endOfDay.setHours(23, 59, 59, 999);

		const rows = await ctx.db
			.query("tasks")
			.withIndex("by_org_and_status_and_due", (q) =>
				q
					.eq("orgId", args.orgId)
					.eq("status", "pending")
					.gte("dueAt", startOfDay.getTime())
					.lte("dueAt", endOfDay.getTime()),
			)
			.collect();

		return canSeeAll ? rows : rows.filter((r) => r.assignedTo === userId);
	},
});

// ─── getDueAndOverdue ────────────────────────────────────────────────────────
//
// Pending tasks where `dueAt <= endOfDay(today)` AND `dueAt >= now -
// lookbackDays`. Powers the dashboard "Tasks" card and embedded panels.

export const getDueAndOverdue = orgQuery({
	args: {
		orgId: v.id("orgs"),
		/** Cap the lookback so we don't load an entire org's history. Defaults to 90 days. */
		lookbackDays: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
		const { member, userId } = await requireOrgMember(ctx, args.orgId);
		requireRole(member.permissions, "tasks.view");

		const canSeeAll = hasPermission(member.permissions, "tasks.manage");
		const lookbackDays = Math.min(Math.max(args.lookbackDays ?? 90, 1), 365);

		const endOfDay = new Date();
		endOfDay.setHours(23, 59, 59, 999);
		const lookbackStart = endOfDay.getTime() - lookbackDays * 24 * 60 * 60 * 1000;

		const rows = await ctx.db
			.query("tasks")
			.withIndex("by_org_and_status_and_due", (q) =>
				q
					.eq("orgId", args.orgId)
					.eq("status", "pending")
					.gte("dueAt", lookbackStart)
					.lte("dueAt", endOfDay.getTime()),
			)
			.collect();

		return canSeeAll ? rows : rows.filter((r) => r.assignedTo === userId);
	},
});

// ─── getNextUpcoming ─────────────────────────────────────────────────────────
//
// Next pending task strictly after now (regardless of when). Used by the
// dashboard "next task" fallback when the user has no overdue / today items.

export const getNextUpcoming = orgQuery({
	args: {
		orgId: v.id("orgs"),
		limit: v.optional(v.number()),
		/** How far ahead to look. Default 30 days. */
		horizonDays: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
		const { member, userId } = await requireOrgMember(ctx, args.orgId);
		requireRole(member.permissions, "tasks.view");

		const canSeeAll = hasPermission(member.permissions, "tasks.manage");
		const horizonDays = Math.min(Math.max(args.horizonDays ?? 30, 1), 365);
		const limit = Math.min(Math.max(args.limit ?? 3, 1), 20);

		const startTomorrow = new Date();
		startTomorrow.setHours(24, 0, 0, 0);
		const horizonEnd = startTomorrow.getTime() + horizonDays * 24 * 60 * 60 * 1000;

		const rows = await ctx.db
			.query("tasks")
			.withIndex("by_org_and_status_and_due", (q) =>
				q
					.eq("orgId", args.orgId)
					.eq("status", "pending")
					.gt("dueAt", startTomorrow.getTime() - 1)
					.lte("dueAt", horizonEnd),
			)
			.collect();

		const filtered = canSeeAll ? rows : rows.filter((r) => r.assignedTo === userId);
		filtered.sort((a, b) => a.dueAt - b.dueAt);
		return filtered.slice(0, limit);
	},
});

// ─── listOpen ────────────────────────────────────────────────────────────────

export const listOpen = orgQuery({
	args: { orgId: v.id("orgs"), personCode: v.string() },
	handler: async (ctx, args) => {
		const { member } = await requireOrgMember(ctx, args.orgId);
		requireRole(member.permissions, "tasks.view");

		return ctx.db
			.query("tasks")
			.withIndex("by_org_and_person", (q) =>
				q.eq("orgId", args.orgId).eq("personCode", args.personCode),
			)
			.filter((q) => q.eq(q.field("status"), "pending"))
			.collect();
	},
});

// ─── getById ─────────────────────────────────────────────────────────────────
//
// Single-task lookup — used by the calendar popover Edit action and by detail
// panels. Returns null when the task is missing or in a different org.

export const getById = orgQuery({
	args: { orgId: v.id("orgs"), taskId: v.id("tasks") },
	handler: async (ctx, args) => {
		const { member } = await requireOrgMember(ctx, args.orgId);
		requireRole(member.permissions, "tasks.view");

		const task = await ctx.db.get(args.taskId);
		if (!task || task.orgId !== args.orgId) return null;
		return task;
	},
});

// ─── getByTaskCode ───────────────────────────────────────────────────────────
//
// Public-facing code lookup ("T-003"). Carries forward the FU-004 fix from
// PHASE-3-AI-AUDIT.md §6 row 4 — `get_entity_detail` AI tool routes
// `entityType: "task"` queries here.

async function getByTaskCodeImpl(ctx: QueryCtx, args: { orgId: Id<"orgs">; taskCode: string }) {
	return ctx.db
		.query("tasks")
		.withIndex("by_org_and_taskCode", (q) =>
			q.eq("orgId", args.orgId).eq("taskCode", args.taskCode),
		)
		.first();
}

export const getByTaskCode = orgQuery({
	args: { orgId: v.id("orgs"), taskCode: v.string() },
	handler: async (ctx, args) => {
		const { member } = await requireOrgMember(ctx, args.orgId);
		requireRole(member.permissions, "tasks.view");
		return getByTaskCodeImpl(ctx, args);
	},
});

/** AI-callable internal twin. */
export const getByTaskCodeForAI = internalQuery({
	args: {
		orgId: v.id("orgs"),
		userId: v.id("users"),
		taskCode: v.string(),
	},
	handler: async (ctx, args) => {
		const { member } = await requireOrgMemberByIds(ctx, args.orgId, args.userId);
		requireRole(member.permissions, "tasks.view");
		return getByTaskCodeImpl(ctx, { orgId: args.orgId, taskCode: args.taskCode });
	},
});

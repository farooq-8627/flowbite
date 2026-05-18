/**
 * Reminders Queries — convex/crm/shared/reminders/queries.ts
 * STATUS: IMPLEMENTED
 */
import { v } from "convex/values";
import { orgQuery, requireOrgMember } from "../../../_functions/authenticated";
import { hasPermission, requireRole } from "../../../_shared/permissions";

export const listForPerson = orgQuery({
	args: { orgId: v.id("orgs"), personCode: v.string() },
	handler: async (ctx, args) => {
		const { member } = await requireOrgMember(ctx, args.orgId);
		requireRole(member.permissions, "reminders.view");

		return ctx.db
			.query("reminders")
			.withIndex("by_org_and_person", (q) =>
				q.eq("orgId", args.orgId).eq("personCode", args.personCode),
			)
			.collect();
	},
});

/**
 * All reminders for the org — powers RemindersView (Today/Open/Completed/All tabs).
 * Returns ALL reminders regardless of status/dueAt so the client can bucket them.
 * Members without `reminders.manage` only see their own assigned reminders.
 */
export const listAllForOrg = orgQuery({
	args: { orgId: v.id("orgs") },
	handler: async (ctx, args) => {
		const { member, userId } = await requireOrgMember(ctx, args.orgId);
		requireRole(member.permissions, "reminders.view");

		const canSeeAll = hasPermission(member.permissions, "reminders.manage");

		const reminders = await ctx.db
			.query("reminders")
			.withIndex("by_org_and_due", (q) => q.eq("orgId", args.orgId))
			.collect();

		return canSeeAll ? reminders : reminders.filter((r) => r.assignedTo === userId);
	},
});

export const getDueToday = orgQuery({
	args: { orgId: v.id("orgs") },
	handler: async (ctx, args) => {
		const { member, userId } = await requireOrgMember(ctx, args.orgId);
		requireRole(member.permissions, "reminders.view");

		const canSeeAllReminders = hasPermission(member.permissions, "reminders.manage");
		const startOfDay = new Date();
		startOfDay.setHours(0, 0, 0, 0);
		const endOfDay = new Date();
		endOfDay.setHours(23, 59, 59, 999);

		const reminders = await ctx.db
			.query("reminders")
			.withIndex("by_org_and_status_and_due", (q) =>
				q
					.eq("orgId", args.orgId)
					.eq("status", "pending")
					.gte("dueAt", startOfDay.getTime())
					.lte("dueAt", endOfDay.getTime()),
			)
			.collect();

		return canSeeAllReminders ? reminders : reminders.filter((r) => r.assignedTo === userId);
	},
});

/**
 * Reminders that are pending AND (overdue OR due today).
 *
 * The dashboard "Reminders" card and the embedded panels need overdue
 * reminders too — `getDueToday` only returned reminders within today's
 * 00:00–23:59 window, which silently dropped any reminder dragged to
 * yesterday or earlier. This query covers `dueAt <= endOfDay(today)`.
 *
 * Members without `reminders.manage` only see their own assigned items.
 */
export const getDueAndOverdue = orgQuery({
	args: {
		orgId: v.id("orgs"),
		/** Cap the lookback so we don't load an entire org's history. Defaults to 90 days. */
		lookbackDays: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
		const { member, userId } = await requireOrgMember(ctx, args.orgId);
		requireRole(member.permissions, "reminders.view");

		const canSeeAllReminders = hasPermission(member.permissions, "reminders.manage");
		const lookbackDays = Math.min(Math.max(args.lookbackDays ?? 90, 1), 365);

		const endOfDay = new Date();
		endOfDay.setHours(23, 59, 59, 999);
		const lookbackStart = endOfDay.getTime() - lookbackDays * 24 * 60 * 60 * 1000;

		const reminders = await ctx.db
			.query("reminders")
			.withIndex("by_org_and_status_and_due", (q) =>
				q
					.eq("orgId", args.orgId)
					.eq("status", "pending")
					.gte("dueAt", lookbackStart)
					.lte("dueAt", endOfDay.getTime()),
			)
			.collect();

		return canSeeAllReminders ? reminders : reminders.filter((r) => r.assignedTo === userId);
	},
});

/**
 * The next pending reminder strictly after now (regardless of when).
 *
 * Used by the dashboard "next reminder" fallback so when the user has no
 * overdue / today items we still show something useful ("Your next
 * reminder is in 3 days — Demo with Acme").
 *
 * Returns at most `limit` items (default 3) ordered by ascending dueAt,
 * filtered to `assignedTo = userId` for non-managers.
 */
export const getNextUpcoming = orgQuery({
	args: {
		orgId: v.id("orgs"),
		limit: v.optional(v.number()),
		/** How far ahead to look. Default 30 days. */
		horizonDays: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
		const { member, userId } = await requireOrgMember(ctx, args.orgId);
		requireRole(member.permissions, "reminders.view");

		const canSeeAllReminders = hasPermission(member.permissions, "reminders.manage");
		const horizonDays = Math.min(Math.max(args.horizonDays ?? 30, 1), 365);
		const limit = Math.min(Math.max(args.limit ?? 3, 1), 20);

		const startTomorrow = new Date();
		startTomorrow.setHours(24, 0, 0, 0);
		const horizonEnd = startTomorrow.getTime() + horizonDays * 24 * 60 * 60 * 1000;

		const reminders = await ctx.db
			.query("reminders")
			.withIndex("by_org_and_status_and_due", (q) =>
				q
					.eq("orgId", args.orgId)
					.eq("status", "pending")
					.gt("dueAt", startTomorrow.getTime() - 1)
					.lte("dueAt", horizonEnd),
			)
			.collect();

		const filtered = canSeeAllReminders
			? reminders
			: reminders.filter((r) => r.assignedTo === userId);
		filtered.sort((a, b) => a.dueAt - b.dueAt);
		return filtered.slice(0, limit);
	},
});

export const listOpen = orgQuery({
	args: { orgId: v.id("orgs"), personCode: v.string() },
	handler: async (ctx, args) => {
		const { member } = await requireOrgMember(ctx, args.orgId);
		requireRole(member.permissions, "reminders.view");

		return ctx.db
			.query("reminders")
			.withIndex("by_org_and_person", (q) =>
				q.eq("orgId", args.orgId).eq("personCode", args.personCode),
			)
			.filter((q) => q.eq(q.field("status"), "pending"))
			.collect();
	},
});

/** Get a single reminder by ID — used by calendar popover Edit action. */
export const getById = orgQuery({
	args: { orgId: v.id("orgs"), reminderId: v.id("reminders") },
	handler: async (ctx, args) => {
		const { member } = await requireOrgMember(ctx, args.orgId);
		requireRole(member.permissions, "reminders.view");

		const reminder = await ctx.db.get(args.reminderId);
		if (!reminder || reminder.orgId !== args.orgId) return null;
		return reminder;
	},
});

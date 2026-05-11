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
		requireRole(member.permissions, "notes.view");

		return ctx.db
			.query("reminders")
			.withIndex("by_org_and_person", (q) =>
				q.eq("orgId", args.orgId).eq("personCode", args.personCode),
			)
			.collect();
	},
});

export const getDueToday = orgQuery({
	args: { orgId: v.id("orgs") },
	handler: async (ctx, args) => {
		const { member, userId } = await requireOrgMember(ctx, args.orgId);
		requireRole(member.permissions, "notes.view");

		const isAdmin = hasPermission(member.permissions, "notes.viewInternal");
		const startOfDay = new Date();
		startOfDay.setHours(0, 0, 0, 0);
		const endOfDay = new Date();
		endOfDay.setHours(23, 59, 59, 999);

		const reminders = await ctx.db
			.query("reminders")
			.withIndex("by_org_and_due", (q) =>
				q.eq("orgId", args.orgId).gte("dueAt", startOfDay.getTime()),
			)
			.filter((q) => q.lte(q.field("dueAt"), endOfDay.getTime()))
			.filter((q) => q.eq(q.field("status"), "pending"))
			.collect();

		return isAdmin ? reminders : reminders.filter((r) => r.assignedTo === userId);
	},
});

export const listOpen = orgQuery({
	args: { orgId: v.id("orgs"), personCode: v.string() },
	handler: async (ctx, args) => {
		const { member } = await requireOrgMember(ctx, args.orgId);
		requireRole(member.permissions, "notes.view");

		return ctx.db
			.query("reminders")
			.withIndex("by_org_and_person", (q) =>
				q.eq("orgId", args.orgId).eq("personCode", args.personCode),
			)
			.filter((q) => q.eq(q.field("status"), "pending"))
			.collect();
	},
});

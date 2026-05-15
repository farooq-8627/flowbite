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

export const getDueToday = orgQuery({
	args: { orgId: v.id("orgs") },
	handler: async (ctx, args) => {
		const { member, userId } = await requireOrgMember(ctx, args.orgId);
		requireRole(member.permissions, "reminders.view");

		// `reminders.manage` is the moderator-level gate that lets a member see
		// every reminder in the org (not just their own). Fallbacks to assignee-only.
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

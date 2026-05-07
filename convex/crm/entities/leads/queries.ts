/**
 * Leads Queries — convex/crm/entities/leads/queries.ts
 * STATUS: IMPLEMENTED
 */
import { v } from "convex/values";
import { orgQuery } from "../../../_functions/authenticated";
import { requireOrgMember } from "../../../_functions/authenticated";
import { requireRole } from "../../../_shared/permissions";

export const list = orgQuery({
	args: {
		orgId: v.id("orgs"),
		status: v.optional(v.string()),
		assignedTo: v.optional(v.id("users")),
		source: v.optional(v.string()),
		limit: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
		const { member } = await requireOrgMember(ctx, args.orgId);
		requireRole(member.role ?? "viewer", "leads.view");

		const cap = args.limit ?? 100;

		// Use the most selective index available for the given filters
		let q;
		if (args.status) {
			q = ctx.db.query("leads").withIndex("by_org_and_status", (qi) =>
				qi.eq("orgId", args.orgId).eq("status", args.status!),
			);
		} else if (args.assignedTo) {
			q = ctx.db.query("leads").withIndex("by_org_and_assignee", (qi) =>
				qi.eq("orgId", args.orgId).eq("assignedTo", args.assignedTo!),
			);
		} else {
			q = ctx.db.query("leads").withIndex("by_org", (qi) => qi.eq("orgId", args.orgId));
		}

		// Over-fetch to account for soft-deleted + secondary filters, then trim
		const results = await q.take(cap * 3);

		return results
			.filter((l) => l.deletedAt === undefined && !l.convertedAt)
			.filter((l) => !args.assignedTo || l.assignedTo === args.assignedTo)
			.filter((l) => !args.source || l.source === args.source)
			.slice(0, cap);
	},
});

export const getById = orgQuery({
	args: { orgId: v.id("orgs"), leadId: v.id("leads") },
	handler: async (ctx, args) => {
		const { member } = await requireOrgMember(ctx, args.orgId);
		requireRole(member.role ?? "viewer", "leads.view");

		const lead = await ctx.db.get(args.leadId);
		if (!lead || lead.orgId !== args.orgId || lead.deletedAt !== undefined) return null;
		return lead;
	},
});

export const getByPersonCode = orgQuery({
	args: { orgId: v.id("orgs"), personCode: v.string() },
	handler: async (ctx, args) => {
		const { member } = await requireOrgMember(ctx, args.orgId);
		requireRole(member.role ?? "viewer", "leads.view");

		return ctx.db
			.query("leads")
			.withIndex("by_org_and_personCode", (q) =>
				q.eq("orgId", args.orgId).eq("personCode", args.personCode),
			)
			.first();
	},
});

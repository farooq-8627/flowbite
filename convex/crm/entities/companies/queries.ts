/**
 * Companies Queries — convex/crm/entities/companies/queries.ts
 * STATUS: IMPLEMENTED
 */
import { v } from "convex/values";
import { orgQuery, requireOrgMember } from "../../../_functions/authenticated";
import { requireRole } from "../../../_shared/permissions";

export const list = orgQuery({
	args: {
		orgId: v.id("orgs"),
		assignedTo: v.optional(v.id("users")),
		limit: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
		const { member } = await requireOrgMember(ctx, args.orgId);
		requireRole(member.role ?? "viewer", "companies.view");

		const cap = args.limit ?? 100;

		let q;
		if (args.assignedTo) {
			q = ctx.db.query("companies").withIndex("by_org_and_assignee", (qi) =>
				qi.eq("orgId", args.orgId).eq("assignedTo", args.assignedTo!),
			);
		} else {
			q = ctx.db.query("companies").withIndex("by_org", (qi) => qi.eq("orgId", args.orgId));
		}

		const results = await q.take(cap * 3);

		return results
			.filter((c) => c.deletedAt === undefined)
			.slice(0, cap);
	},
});

export const getById = orgQuery({
	args: { orgId: v.id("orgs"), companyId: v.id("companies") },
	handler: async (ctx, args) => {
		const { member } = await requireOrgMember(ctx, args.orgId);
		requireRole(member.role ?? "viewer", "companies.view");

		const company = await ctx.db.get(args.companyId);
		if (!company || company.orgId !== args.orgId || company.deletedAt !== undefined) return null;
		return company;
	},
});

export const getByCompanyCode = orgQuery({
	args: { orgId: v.id("orgs"), companyCode: v.string() },
	handler: async (ctx, args) => {
		const { member } = await requireOrgMember(ctx, args.orgId);
		requireRole(member.role ?? "viewer", "companies.view");

		return ctx.db
			.query("companies")
			.withIndex("by_org_and_companyCode", (q) =>
				q.eq("orgId", args.orgId).eq("companyCode", args.companyCode),
			)
			.first();
	},
});

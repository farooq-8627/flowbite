/**
 * Contacts Queries — convex/crm/entities/contacts/queries.ts
 * STATUS: IMPLEMENTED
 */
import { v } from "convex/values";
import { orgQuery, requireOrgMember } from "../../../_functions/authenticated";
import { requireRole } from "../../../_shared/permissions";

export const list = orgQuery({
	args: {
		orgId: v.id("orgs"),
		companyId: v.optional(v.id("companies")),
		assignedTo: v.optional(v.id("users")),
		limit: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
		const { member } = await requireOrgMember(ctx, args.orgId);
		requireRole(member.role ?? "viewer", "contacts.view");

		const cap = args.limit ?? 100;

		let q;
		if (args.companyId) {
			q = ctx.db.query("contacts").withIndex("by_org_and_company", (qi) =>
				qi.eq("orgId", args.orgId).eq("companyId", args.companyId!),
			);
		} else if (args.assignedTo) {
			q = ctx.db.query("contacts").withIndex("by_org_and_assignee", (qi) =>
				qi.eq("orgId", args.orgId).eq("assignedTo", args.assignedTo!),
			);
		} else {
			q = ctx.db.query("contacts").withIndex("by_org", (qi) => qi.eq("orgId", args.orgId));
		}

		const results = await q.take(cap * 3);

		return results
			.filter((c) => c.deletedAt === undefined)
			.filter((c) => !args.companyId || c.companyId === args.companyId)
			.filter((c) => !args.assignedTo || c.assignedTo === args.assignedTo)
			.slice(0, cap);
	},
});

export const getById = orgQuery({
	args: { orgId: v.id("orgs"), contactId: v.id("contacts") },
	handler: async (ctx, args) => {
		const { member } = await requireOrgMember(ctx, args.orgId);
		requireRole(member.role ?? "viewer", "contacts.view");

		const contact = await ctx.db.get(args.contactId);
		if (!contact || contact.orgId !== args.orgId || contact.deletedAt !== undefined) return null;
		return contact;
	},
});

export const getByPersonCode = orgQuery({
	args: { orgId: v.id("orgs"), personCode: v.string() },
	handler: async (ctx, args) => {
		const { member } = await requireOrgMember(ctx, args.orgId);
		requireRole(member.role ?? "viewer", "contacts.view");

		return ctx.db
			.query("contacts")
			.withIndex("by_org_and_personCode", (q) =>
				q.eq("orgId", args.orgId).eq("personCode", args.personCode),
			)
			.first();
	},
});

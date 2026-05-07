/**
 * Notes Queries — convex/crm/shared/notes/queries.ts
 * STATUS: IMPLEMENTED
 */
import { v } from "convex/values";
import { orgQuery, requireOrgMember } from "../../../_functions/authenticated";
import { requireRole, hasMinRole } from "../../../_shared/permissions";

export const listForEntity = orgQuery({
	args: {
		orgId: v.id("orgs"),
		entityType: v.string(),
		entityId: v.string(),
	},
	handler: async (ctx, args) => {
		const { member } = await requireOrgMember(ctx, args.orgId);
		requireRole(member.role ?? "viewer", "notes.view");

		const isAdmin = hasMinRole(member.role ?? "viewer", "admin");

		const notes = await ctx.db
			.query("notes")
			.withIndex("by_entity", (q) =>
				q
					.eq("orgId", args.orgId)
					.eq("entityType", args.entityType)
					.eq("entityId", args.entityId),
			)
			.collect();

		// Filter internal notes for non-admins
		return notes
			.filter((n) => isAdmin || !n.isInternal)
			.sort((a, b) => {
				// Pinned first, then by createdAt desc
				if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
				return b.createdAt - a.createdAt;
			});
	},
});

export const listForPerson = orgQuery({
	args: { orgId: v.id("orgs"), personCode: v.string() },
	handler: async (ctx, args) => {
		const { member } = await requireOrgMember(ctx, args.orgId);
		requireRole(member.role ?? "viewer", "notes.view");

		const isAdmin = hasMinRole(member.role ?? "viewer", "admin");

		const notes = await ctx.db
			.query("notes")
			.withIndex("by_org_and_created", (q) => q.eq("orgId", args.orgId))
			.filter((q) => q.eq(q.field("personCode"), args.personCode))
			.collect();

		return notes.filter((n) => isAdmin || !n.isInternal);
	},
});

/**
 * Note Categories — public queries.
 *
 * Read API:
 *   - listForOrg(orgId, includeArchived?) — every category in display order.
 *   - getDefault(orgId)                   — the org's default category (or null).
 *
 * Permission gate: `notes.categories.view` (granted to every system role
 * by default — it's just colour metadata).
 */

import { v } from "convex/values";
import { orgQuery, requireOrgMember } from "../../../_functions/authenticated";
import { hasPermission } from "../../../_shared/permissions";

export const listForOrg = orgQuery({
	args: {
		orgId: v.id("orgs"),
		includeArchived: v.optional(v.boolean()),
	},
	handler: async (ctx, args) => {
		const { member } = await requireOrgMember(ctx, args.orgId);
		// `notes.categories.view` is broad (everyone sees colours). If a role
		// somehow lacks it, allow `notes.view` as a fallback so reading a note
		// can still resolve its category.
		if (
			!hasPermission(member.permissions, "notes.categories.view") &&
			!hasPermission(member.permissions, "notes.view")
		) {
			return [];
		}

		const rows = await ctx.db
			.query("noteCategories")
			.withIndex("by_org_and_position", (q) => q.eq("orgId", args.orgId))
			.collect();

		const filtered = args.includeArchived ? rows : rows.filter((r) => !r.isArchived);
		return filtered.sort((a, b) => a.position - b.position);
	},
});

export const getDefault = orgQuery({
	args: { orgId: v.id("orgs") },
	handler: async (ctx, args) => {
		await requireOrgMember(ctx, args.orgId);
		const def = await ctx.db
			.query("noteCategories")
			.withIndex("by_org_and_default", (q) => q.eq("orgId", args.orgId).eq("isDefault", true))
			.first();
		if (def && !def.isArchived) return def;
		// Fallback: lowest-position non-archived category.
		const all = await ctx.db
			.query("noteCategories")
			.withIndex("by_org_and_position", (q) => q.eq("orgId", args.orgId))
			.collect();
		return all.find((c) => !c.isArchived) ?? null;
	},
});

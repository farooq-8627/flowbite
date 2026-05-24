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
import {
	orgQuery,
	requireOrgMember,
	requireOrgMemberByIds,
} from "../../../_functions/authenticated";
import type { Id } from "../../../_generated/dataModel";
import { internalQuery, type QueryCtx } from "../../../_generated/server";
import { hasPermission } from "../../../_shared/permissions";

async function listForOrgImpl(
	ctx: QueryCtx,
	args: { orgId: Id<"orgs">; permissions: string[]; includeArchived?: boolean },
) {
	if (
		!hasPermission(args.permissions, "notes.categories.view") &&
		!hasPermission(args.permissions, "notes.view")
	) {
		return [];
	}
	const rows = await ctx.db
		.query("noteCategories")
		.withIndex("by_org_and_position", (q) => q.eq("orgId", args.orgId))
		.collect();
	const filtered = args.includeArchived ? rows : rows.filter((r) => !r.isArchived);
	return filtered.sort((a, b) => a.position - b.position);
}

export const listForOrg = orgQuery({
	args: {
		orgId: v.id("orgs"),
		includeArchived: v.optional(v.boolean()),
	},
	handler: async (ctx, args) => {
		const { member } = await requireOrgMember(ctx, args.orgId);
		return listForOrgImpl(ctx, {
			orgId: args.orgId,
			permissions: member.permissions,
			includeArchived: args.includeArchived,
		});
	},
});

/** AI-callable internal twin. */
export const listForOrgForAI = internalQuery({
	args: {
		orgId: v.id("orgs"),
		userId: v.id("users"),
		includeArchived: v.optional(v.boolean()),
	},
	handler: async (ctx, args) => {
		const { member } = await requireOrgMemberByIds(ctx, args.orgId, args.userId);
		return listForOrgImpl(ctx, {
			orgId: args.orgId,
			permissions: member.permissions,
			includeArchived: args.includeArchived,
		});
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

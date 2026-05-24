/**
 * Leads Queries — convex/crm/entities/leads/queries.ts
 * STATUS: IMPLEMENTED
 */
import { v } from "convex/values";
import {
	orgQuery,
	requireOrgMember,
	requireOrgMemberByIds,
} from "../../../_functions/authenticated";
import type { Id } from "../../../_generated/dataModel";
import { internalQuery, type QueryCtx } from "../../../_generated/server";
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
		requireRole(member.permissions, "leads.view");

		const cap = args.limit ?? 100;

		// Use the most selective index available for the given filters
		// Initialize with the broad `by_org` index so `q`'s type is inferred
		// and then re-narrow with a more specific index when filters apply.
		let q = ctx.db.query("leads").withIndex("by_org", (qi) => qi.eq("orgId", args.orgId));
		if (args.status) {
			q = ctx.db
				.query("leads")
				.withIndex("by_org_and_status", (qi) =>
					qi.eq("orgId", args.orgId).eq("status", args.status!),
				);
		} else if (args.assignedTo) {
			q = ctx.db
				.query("leads")
				.withIndex("by_org_and_assignee", (qi) =>
					qi.eq("orgId", args.orgId).eq("assignedTo", args.assignedTo!),
				);
		}

		// Over-fetch to account for soft-deleted + secondary filters, then trim
		const results = await q.take(cap * 3);

		// Converted leads REMAIN in the list — they just have status="converted"
		// and show up in that kanban column / table row. This keeps the history
		// visible + lets the user revert a mistaken conversion from its row.
		return results
			.filter((l) => l.deletedAt === undefined)
			.filter((l) => !args.assignedTo || l.assignedTo === args.assignedTo)
			.filter((l) => !args.source || l.source === args.source)
			.slice(0, cap);
	},
});

export const getById = orgQuery({
	args: { orgId: v.id("orgs"), leadId: v.id("leads") },
	handler: async (ctx, args) => {
		const { member } = await requireOrgMember(ctx, args.orgId);
		requireRole(member.permissions, "leads.view");

		const lead = await ctx.db.get(args.leadId);
		if (!lead || lead.orgId !== args.orgId || lead.deletedAt !== undefined) return null;
		return lead;
	},
});

async function getByPersonCodeImpl(ctx: QueryCtx, args: { orgId: Id<"orgs">; personCode: string }) {
	return ctx.db
		.query("leads")
		.withIndex("by_org_and_personCode", (q) =>
			q.eq("orgId", args.orgId).eq("personCode", args.personCode),
		)
		.first();
}

export const getByPersonCode = orgQuery({
	args: { orgId: v.id("orgs"), personCode: v.string() },
	handler: async (ctx, args) => {
		const { member } = await requireOrgMember(ctx, args.orgId);
		requireRole(member.permissions, "leads.view");
		return getByPersonCodeImpl(ctx, args);
	},
});

/** AI-callable internal twin — see `convex/ai/tools/_shared.ts` for rationale. */
export const getByPersonCodeForAI = internalQuery({
	args: { orgId: v.id("orgs"), userId: v.id("users"), personCode: v.string() },
	handler: async (ctx, args) => {
		const { member } = await requireOrgMemberByIds(ctx, args.orgId, args.userId);
		requireRole(member.permissions, "leads.view");
		return getByPersonCodeImpl(ctx, args);
	},
});

/**
 * searchLeads — text search for the AI tools (and any future quick-find).
 *
 * Substring-matches `query` (case-insensitive) against displayName, email,
 * phone, source, and stage. Capped at `limit` (default 10) for the AI
 * surface. When `excludeFromAI` is `false` (the AI's call shape), rows
 * with `excludeFromAI === true` are filtered out. The default — `undefined`
 * — leaves all rows visible so a future human-search reuse doesn't
 * accidentally hide opted-out records from the owner.
 */
async function searchLeadsImpl(
	ctx: QueryCtx,
	args: { orgId: Id<"orgs">; query: string; limit?: number; excludeFromAI?: boolean },
) {
	const cap = args.limit ?? 10;
	const q = args.query.trim().toLowerCase();
	if (!q) return [];

	const rows = await ctx.db
		.query("leads")
		.withIndex("by_org", (qi) => qi.eq("orgId", args.orgId))
		.take(500);

	const matches: typeof rows = [];
	for (const r of rows) {
		if (r.deletedAt !== undefined) continue;
		if (args.excludeFromAI === false && r.excludeFromAI === true) continue;
		const haystack = [
			r.displayName,
			r.email ?? "",
			r.phone ?? "",
			r.source ?? "",
			r.status ?? "",
			r.personCode ?? "",
		]
			.join(" ")
			.toLowerCase();
		if (haystack.includes(q)) matches.push(r);
		if (matches.length >= cap) break;
	}
	return matches;
}

export const searchLeads = orgQuery({
	args: {
		orgId: v.id("orgs"),
		query: v.string(),
		limit: v.optional(v.number()),
		excludeFromAI: v.optional(v.boolean()),
	},
	handler: async (ctx, args) => {
		const { member } = await requireOrgMember(ctx, args.orgId);
		requireRole(member.permissions, "leads.view");
		return searchLeadsImpl(ctx, args);
	},
});

/** AI-callable internal twin — see `convex/ai/tools/_shared.ts` for rationale. */
export const searchLeadsForAI = internalQuery({
	args: {
		orgId: v.id("orgs"),
		userId: v.id("users"),
		query: v.string(),
		limit: v.optional(v.number()),
		excludeFromAI: v.optional(v.boolean()),
	},
	handler: async (ctx, args) => {
		const { member } = await requireOrgMemberByIds(ctx, args.orgId, args.userId);
		requireRole(member.permissions, "leads.view");
		return searchLeadsImpl(ctx, args);
	},
});

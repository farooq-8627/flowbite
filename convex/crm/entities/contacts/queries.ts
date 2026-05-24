/**
 * Contacts Queries — convex/crm/entities/contacts/queries.ts
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
		companyId: v.optional(v.id("companies")),
		assignedTo: v.optional(v.id("users")),
		limit: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
		const { member } = await requireOrgMember(ctx, args.orgId);
		requireRole(member.permissions, "contacts.view");

		const cap = args.limit ?? 100;

		// Init with the broad index so `q`'s type is inferred, then narrow.
		let q = ctx.db.query("contacts").withIndex("by_org", (qi) => qi.eq("orgId", args.orgId));
		if (args.companyId) {
			q = ctx.db
				.query("contacts")
				.withIndex("by_org_and_company", (qi) =>
					qi.eq("orgId", args.orgId).eq("companyId", args.companyId!),
				);
		} else if (args.assignedTo) {
			q = ctx.db
				.query("contacts")
				.withIndex("by_org_and_assignee", (qi) =>
					qi.eq("orgId", args.orgId).eq("assignedTo", args.assignedTo!),
				);
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
		requireRole(member.permissions, "contacts.view");

		const contact = await ctx.db.get(args.contactId);
		if (!contact || contact.orgId !== args.orgId || contact.deletedAt !== undefined)
			return null;
		return contact;
	},
});

async function getByPersonCodeImpl(ctx: QueryCtx, args: { orgId: Id<"orgs">; personCode: string }) {
	return ctx.db
		.query("contacts")
		.withIndex("by_org_and_personCode", (q) =>
			q.eq("orgId", args.orgId).eq("personCode", args.personCode),
		)
		.first();
}

export const getByPersonCode = orgQuery({
	args: { orgId: v.id("orgs"), personCode: v.string() },
	handler: async (ctx, args) => {
		const { member } = await requireOrgMember(ctx, args.orgId);
		requireRole(member.permissions, "contacts.view");
		return getByPersonCodeImpl(ctx, args);
	},
});

/** AI-callable internal twin — see `convex/ai/tools/_shared.ts` for rationale. */
export const getByPersonCodeForAI = internalQuery({
	args: { orgId: v.id("orgs"), userId: v.id("users"), personCode: v.string() },
	handler: async (ctx, args) => {
		const { member } = await requireOrgMemberByIds(ctx, args.orgId, args.userId);
		requireRole(member.permissions, "contacts.view");
		return getByPersonCodeImpl(ctx, args);
	},
});

/**
 * searchContacts — text search for the AI tools.
 *
 * Substring-matches `query` (case-insensitive) against displayName, email,
 * phone, jobTitle, and personCode. When `excludeFromAI: false` is passed
 * (the AI's call shape), rows opted out of AI exposure are skipped.
 */
async function searchContactsImpl(
	ctx: QueryCtx,
	args: { orgId: Id<"orgs">; query: string; limit?: number; excludeFromAI?: boolean },
) {
	const cap = args.limit ?? 10;
	const q = args.query.trim().toLowerCase();
	if (!q) return [];

	const rows = await ctx.db
		.query("contacts")
		.withIndex("by_org", (qi) => qi.eq("orgId", args.orgId))
		.take(500);

	const matches: typeof rows = [];
	for (const r of rows) {
		if (r.deletedAt !== undefined) continue;
		if (args.excludeFromAI === false && r.excludeFromAI === true) continue;
		const haystack = [r.displayName, r.email ?? "", r.phone ?? "", r.personCode ?? ""]
			.join(" ")
			.toLowerCase();
		if (haystack.includes(q)) matches.push(r);
		if (matches.length >= cap) break;
	}
	return matches;
}

export const searchContacts = orgQuery({
	args: {
		orgId: v.id("orgs"),
		query: v.string(),
		limit: v.optional(v.number()),
		excludeFromAI: v.optional(v.boolean()),
	},
	handler: async (ctx, args) => {
		const { member } = await requireOrgMember(ctx, args.orgId);
		requireRole(member.permissions, "contacts.view");
		return searchContactsImpl(ctx, args);
	},
});

/** AI-callable internal twin. */
export const searchContactsForAI = internalQuery({
	args: {
		orgId: v.id("orgs"),
		userId: v.id("users"),
		query: v.string(),
		limit: v.optional(v.number()),
		excludeFromAI: v.optional(v.boolean()),
	},
	handler: async (ctx, args) => {
		const { member } = await requireOrgMemberByIds(ctx, args.orgId, args.userId);
		requireRole(member.permissions, "contacts.view");
		return searchContactsImpl(ctx, args);
	},
});

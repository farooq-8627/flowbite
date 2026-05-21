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
		requireRole(member.permissions, "companies.view");

		const cap = args.limit ?? 100;

		// Init with the broad index so `q`'s type is inferred, then narrow.
		let q = ctx.db.query("companies").withIndex("by_org", (qi) => qi.eq("orgId", args.orgId));
		if (args.assignedTo) {
			q = ctx.db
				.query("companies")
				.withIndex("by_org_and_assignee", (qi) =>
					qi.eq("orgId", args.orgId).eq("assignedTo", args.assignedTo!),
				);
		}

		const results = await q.take(cap * 3);

		return results.filter((c) => c.deletedAt === undefined).slice(0, cap);
	},
});

export const getById = orgQuery({
	args: { orgId: v.id("orgs"), companyId: v.id("companies") },
	handler: async (ctx, args) => {
		const { member } = await requireOrgMember(ctx, args.orgId);
		requireRole(member.permissions, "companies.view");

		const company = await ctx.db.get(args.companyId);
		if (!company || company.orgId !== args.orgId || company.deletedAt !== undefined)
			return null;
		return company;
	},
});

export const getByCompanyCode = orgQuery({
	args: { orgId: v.id("orgs"), companyCode: v.string() },
	handler: async (ctx, args) => {
		const { member } = await requireOrgMember(ctx, args.orgId);
		requireRole(member.permissions, "companies.view");

		return ctx.db
			.query("companies")
			.withIndex("by_org_and_companyCode", (q) =>
				q.eq("orgId", args.orgId).eq("companyCode", args.companyCode),
			)
			.first();
	},
});

/**
 * Return the (first) company a personCode belongs to, via the indexed
 * `companyMembers` join table. O(1) lookup instead of O(N) array scan.
 */
export const getByPersonCode = orgQuery({
	args: { orgId: v.id("orgs"), personCode: v.string() },
	handler: async (ctx, args) => {
		const { member } = await requireOrgMember(ctx, args.orgId);
		requireRole(member.permissions, "companies.view");

		const link = await ctx.db
			.query("companyMembers")
			.withIndex("by_org_and_personCode", (q) =>
				q.eq("orgId", args.orgId).eq("personCode", args.personCode),
			)
			.first();
		if (!link) return null;

		const company = await ctx.db.get(link.companyId);
		if (!company || company.deletedAt !== undefined) return null;
		return company;
	},
});

/**
 * Persons (leads + contacts) that aren't yet attached to any company. Used
 * to populate the "persons without a company" multi-select inside the
 * Add/Edit Company drawers.
 *
 * Uses the `companyMembers` join table for O(1) membership checks instead
 * of loading all companies + all leads + all contacts into memory.
 */
export const listPersonsWithoutCompany = orgQuery({
	args: { orgId: v.id("orgs") },
	handler: async (ctx, args) => {
		const { member } = await requireOrgMember(ctx, args.orgId);
		requireRole(member.permissions, "leads.view");

		// Get all personCodes that already belong to a company.
		const memberLinks = await ctx.db
			.query("companyMembers")
			.withIndex("by_org_and_personCode", (q) => q.eq("orgId", args.orgId))
			.collect();
		const taken = new Set(memberLinks.map((l) => l.personCode));

		// Fetch leads + contacts (bounded per-org, acceptable).
		const [leads, contacts] = await Promise.all([
			ctx.db
				.query("leads")
				.withIndex("by_org", (q) => q.eq("orgId", args.orgId))
				.collect(),
			ctx.db
				.query("contacts")
				.withIndex("by_org", (q) => q.eq("orgId", args.orgId))
				.collect(),
		]);

		type Person = {
			personCode: string;
			displayName: string;
			email?: string;
			kind: "lead" | "contact";
		};
		const persons: Person[] = [];
		for (const l of leads) {
			if (l.deletedAt !== undefined || l.convertedAt) continue;
			if (taken.has(l.personCode)) continue;
			persons.push({
				personCode: l.personCode,
				displayName: l.displayName,
				email: l.email,
				kind: "lead",
			});
		}
		for (const c of contacts) {
			if (c.deletedAt !== undefined) continue;
			if (taken.has(c.personCode)) continue;
			persons.push({
				personCode: c.personCode,
				displayName: c.displayName,
				email: c.email,
				kind: "contact",
			});
		}
		return persons.sort((a, b) => a.displayName.localeCompare(b.displayName));
	},
});

/**
 * All persons in an org with their current company (if any). Useful for the
 * company column in lead/contact tables and for "show employees of company X"
 * popovers.
 */
export const listAllPersonsWithCompany = orgQuery({
	args: { orgId: v.id("orgs") },
	handler: async (ctx, args) => {
		const { member } = await requireOrgMember(ctx, args.orgId);
		requireRole(member.permissions, "leads.view");

		const companies = await ctx.db
			.query("companies")
			.withIndex("by_org", (q) => q.eq("orgId", args.orgId))
			.collect();
		const map = new Map<string, { companyId: string; name: string }>();
		for (const c of companies) {
			if (c.deletedAt !== undefined) continue;
			for (const pc of c.personCodes ?? []) {
				map.set(pc, { companyId: c._id as string, name: c.name });
			}
		}
		return Array.from(map.entries()).map(([personCode, company]) => ({
			personCode,
			...company,
		}));
	},
});

// ─── Batched company lookup by personCodes (eliminates N+1 in table views) ──

/**
 * For a list of personCodes, return `Record<personCode, { companyId, name, companyCode }>`.
 * Used by leads/contacts table views so `CompanyCell` doesn't fire one
 * `getByPersonCode` subscription per row.
 *
 * Capped at 200 personCodes.
 */
export const listCompaniesByPersonCodes = orgQuery({
	args: {
		orgId: v.id("orgs"),
		personCodes: v.array(v.string()),
	},
	handler: async (ctx, args) => {
		const { member } = await requireOrgMember(ctx, args.orgId);
		requireRole(member.permissions, "companies.view");

		const codes = [...new Set(args.personCodes)].slice(0, 200);
		const result: Record<string, { companyId: string; name: string; companyCode: string }> = {};

		for (const personCode of codes) {
			const link = await ctx.db
				.query("companyMembers")
				.withIndex("by_org_and_personCode", (q) =>
					q.eq("orgId", args.orgId).eq("personCode", personCode),
				)
				.first();
			if (!link) continue;
			const company = await ctx.db.get(link.companyId);
			if (!company || company.deletedAt !== undefined) continue;
			result[personCode] = {
				companyId: company._id as string,
				name: company.name,
				companyCode: company.companyCode,
			};
		}

		return result;
	},
});

/**
 * Persons (lead/contact) attached to a single company — the rows that
 * power the "Users" / "People" table on the company detail page.
 *
 * Resolves the personCode → person doc lookup once, returning a flat
 * array sorted by displayName. Falls back to the personCode when a
 * person row can't be loaded (orphan join) so the UI can still show
 * the row instead of silently dropping it.
 */
export const listPersonsForCompany = orgQuery({
	args: { orgId: v.id("orgs"), companyId: v.id("companies") },
	handler: async (ctx, args) => {
		const { member } = await requireOrgMember(ctx, args.orgId);
		requireRole(member.permissions, "companies.view");

		const company = await ctx.db.get(args.companyId);
		if (!company || company.orgId !== args.orgId || company.deletedAt !== undefined) {
			return [];
		}

		const links = await ctx.db
			.query("companyMembers")
			.withIndex("by_org_and_company", (q) =>
				q.eq("orgId", args.orgId).eq("companyId", args.companyId),
			)
			.collect();

		type PersonRow = {
			personCode: string;
			displayName: string;
			email?: string;
			phone?: string;
			kind: "lead" | "contact" | "unknown";
			assignedTo?: string;
		};

		const rows: PersonRow[] = [];
		for (const link of links) {
			// Try contacts first (most company-affiliated people are contacts).
			const contact = await ctx.db
				.query("contacts")
				.withIndex("by_org_and_personCode", (q) =>
					q.eq("orgId", args.orgId).eq("personCode", link.personCode),
				)
				.first();
			if (contact && contact.deletedAt === undefined) {
				rows.push({
					personCode: contact.personCode,
					displayName: contact.displayName,
					email: contact.email,
					phone: contact.phone,
					kind: "contact",
					assignedTo: contact.assignedTo ? String(contact.assignedTo) : undefined,
				});
				continue;
			}

			const lead = await ctx.db
				.query("leads")
				.withIndex("by_org_and_personCode", (q) =>
					q.eq("orgId", args.orgId).eq("personCode", link.personCode),
				)
				.first();
			if (lead && lead.deletedAt === undefined) {
				rows.push({
					personCode: lead.personCode,
					displayName: lead.displayName,
					email: lead.email,
					phone: lead.phone,
					kind: "lead",
					assignedTo: lead.assignedTo ? String(lead.assignedTo) : undefined,
				});
				continue;
			}

			// Orphan join — keep the row visible so the user can detach it.
			rows.push({
				personCode: link.personCode,
				displayName: link.personCode,
				kind: "unknown",
			});
		}

		return rows.sort((a, b) => a.displayName.localeCompare(b.displayName));
	},
});

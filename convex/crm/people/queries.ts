/**
 * People queries — convex/crm/people/queries.ts
 *
 * Resolves a personCode to either a lead or contact.
 * personCode is the stable identity — same code on both tables.
 * The frontend never needs to know which table — it just gets the person.
 */
import { v } from "convex/values";
import { orgQuery } from "../../_functions/authenticated";
import { requireOrgMember } from "../../_functions/authenticated";

/**
 * Resolve a personCode to a lead or contact.
 * Checks contacts first (converted leads are contacts — more current state).
 * Falls back to leads (unconverted leads).
 * Returns null if not found in either table.
 */
export const getByPersonCode = orgQuery({
	args: {
		orgId: v.id("orgs"),
		personCode: v.string(),
	},
	handler: async (ctx, args) => {
		await requireOrgMember(ctx, args.orgId);

		// Check contacts first — converted person lives here
		const contact = await ctx.db
			.query("contacts")
			.withIndex("by_org_and_personCode", (q) =>
				q.eq("orgId", args.orgId).eq("personCode", args.personCode),
			)
			.first();

		if (contact && !contact.deletedAt) {
			return { entity: contact, type: "contact" as const };
		}

		// Fall back to leads — unconverted person
		const lead = await ctx.db
			.query("leads")
			.withIndex("by_org_and_personCode", (q) =>
				q.eq("orgId", args.orgId).eq("personCode", args.personCode),
			)
			.first();

		if (lead && !lead.deletedAt) {
			return { entity: lead, type: "lead" as const };
		}

		return null;
	},
});

/**
 * List all people (leads + contacts combined) for an org.
 * Used by the /profile list page with ?type=lead|contact filter.
 * Returns unified shape: { personCode, displayName, email, type, assignedTo, ... }
 */
export const listAll = orgQuery({
	args: {
		orgId: v.id("orgs"),
		type: v.optional(v.union(v.literal("lead"), v.literal("contact"))),
		assignedTo: v.optional(v.id("users")),
		limit: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
		await requireOrgMember(ctx, args.orgId);

		const cap = args.limit ?? 100;

		const [leads, contacts] = await Promise.all([
			args.type === "contact"
				? []
				: ctx.db
						.query("leads")
						.withIndex("by_org", (q) => q.eq("orgId", args.orgId))
						.take(cap)
						.then((rows) =>
							rows
								.filter((r) => !r.deletedAt && !r.convertedAt)
								.filter((r) => !args.assignedTo || r.assignedTo === args.assignedTo)
								.map((r) => ({ ...r, type: "lead" as const })),
						),
			args.type === "lead"
				? []
				: ctx.db
						.query("contacts")
						.withIndex("by_org", (q) => q.eq("orgId", args.orgId))
						.take(cap)
						.then((rows) =>
							rows
								.filter((r) => !r.deletedAt)
								.filter((r) => !args.assignedTo || r.assignedTo === args.assignedTo)
								.map((r) => ({ ...r, type: "contact" as const })),
						),
		]);

		return [...leads, ...contacts].sort((a, b) => b.createdAt - a.createdAt).slice(0, cap);
	},
});

/**
 * Universal code resolver — given any entity code (P-001, D-042, CO-007, FU-003),
 * returns the entity with its type. Used by Phase 3 AI when user says "update P-001".
 *
 * Code prefix mapping:
 *   P-  → person (lead or contact)
 *   D-  → deal
 *   CO- → company
 *   FU- → reminder/follow-up
 */
export const searchByCode = orgQuery({
	args: {
		orgId: v.id("orgs"),
		code: v.string(),
	},
	handler: async (ctx, args) => {
		await requireOrgMember(ctx, args.orgId);

		const code = args.code.trim().toUpperCase();
		const prefix = code.split("-")[0];

		if (prefix === "P") {
			// Person — check contacts first, then leads
			const contact = await ctx.db
				.query("contacts")
				.withIndex("by_org_and_personCode", (q) => q.eq("orgId", args.orgId).eq("personCode", code))
				.first();
			if (contact && !contact.deletedAt) return { entity: contact, entityType: "contact" as const };

			const lead = await ctx.db
				.query("leads")
				.withIndex("by_org_and_personCode", (q) => q.eq("orgId", args.orgId).eq("personCode", code))
				.first();
			if (lead && !lead.deletedAt) return { entity: lead, entityType: "lead" as const };
		}

		if (prefix === "D") {
			const deal = await ctx.db
				.query("deals")
				.withIndex("by_org_and_dealCode", (q) => q.eq("orgId", args.orgId).eq("dealCode", code))
				.first();
			if (deal && !deal.deletedAt) return { entity: deal, entityType: "deal" as const };
		}

		if (prefix === "CO") {
			const company = await ctx.db
				.query("companies")
				.withIndex("by_org_and_companyCode", (q) => q.eq("orgId", args.orgId).eq("companyCode", code))
				.first();
			if (company && !company.deletedAt) return { entity: company, entityType: "company" as const };
		}

		if (prefix === "FU") {
			const reminder = await ctx.db
				.query("reminders")
				.withIndex("by_org_and_person", (q) => q.eq("orgId", args.orgId))
				.take(200)
				.then((rows) => rows.find((r) => r.followUpCode === code));
			if (reminder) return { entity: reminder, entityType: "reminder" as const };
		}

		return null;
	},
});

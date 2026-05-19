/**
 * People queries — convex/crm/people/queries.ts
 *
 * Resolves a personCode to either a lead or contact.
 * personCode is the stable identity — same code on both tables.
 * The frontend never needs to know which table — it just gets the person.
 */
import { v } from "convex/values";
import { orgQuery, requireOrgMember } from "../../_functions/authenticated";

/**
 * Resolve a personCode to a lead or contact.
 * Checks contacts first (converted leads are contacts — more current state).
 * Falls back to leads (unconverted leads).
 * Returns null if not found in either table.
 *
 * Also resolves the *creator* of the row by reading the `created` activity
 * log entry for this person (cheap — bounded `take(20)` on the personCode
 * index, then linear filter for `action === "created"`). Returned as
 * `createdBy: { userId, name, email, avatarUrl }` so the profile overview
 * card can render a "created by" pill without a second round-trip. Falls
 * back to `null` when the activity log was pruned (legacy rows, archive).
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

		// Resolve the creator from activity logs (shared by both branches).
		// We read newest-first then linearly find the oldest "created" entry.
		// `take(50)` is a hard cap — far more than any single person should
		// need, and still O(log n) thanks to the `by_org_and_personCode`
		// index. No `.collect()` (per AGENTS.md backend rules).
		const logs = await ctx.db
			.query("activityLogs")
			.withIndex("by_org_and_personCode", (q) =>
				q.eq("orgId", args.orgId).eq("personCode", args.personCode),
			)
			.order("asc")
			.take(50);
		const createdLog = logs.find((l) => l.action === "created");
		let createdBy: {
			userId: string;
			name?: string;
			email?: string;
			avatarUrl?: string;
		} | null = null;
		if (createdLog) {
			const creator = await ctx.db.get(createdLog.userId);
			if (creator) {
				createdBy = {
					userId: creator._id as string,
					name: creator.name,
					email: creator.email,
					avatarUrl: creator.avatarUrl,
				};
			}
		}

		if (contact && !contact.deletedAt) {
			return { entity: contact, type: "contact" as const, createdBy };
		}

		// Fall back to leads — unconverted person
		const lead = await ctx.db
			.query("leads")
			.withIndex("by_org_and_personCode", (q) =>
				q.eq("orgId", args.orgId).eq("personCode", args.personCode),
			)
			.first();

		if (lead && !lead.deletedAt) {
			return { entity: lead, type: "lead" as const, createdBy };
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
				.withIndex("by_org_and_personCode", (q) =>
					q.eq("orgId", args.orgId).eq("personCode", code),
				)
				.first();
			if (contact && !contact.deletedAt)
				return { entity: contact, entityType: "contact" as const };

			const lead = await ctx.db
				.query("leads")
				.withIndex("by_org_and_personCode", (q) =>
					q.eq("orgId", args.orgId).eq("personCode", code),
				)
				.first();
			if (lead && !lead.deletedAt) return { entity: lead, entityType: "lead" as const };
		}

		if (prefix === "D") {
			const deal = await ctx.db
				.query("deals")
				.withIndex("by_org_and_dealCode", (q) =>
					q.eq("orgId", args.orgId).eq("dealCode", code),
				)
				.first();
			if (deal && !deal.deletedAt) return { entity: deal, entityType: "deal" as const };
		}

		if (prefix === "CO") {
			const company = await ctx.db
				.query("companies")
				.withIndex("by_org_and_companyCode", (q) =>
					q.eq("orgId", args.orgId).eq("companyCode", code),
				)
				.first();
			if (company && !company.deletedAt)
				return { entity: company, entityType: "company" as const };
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

/**
 * Conversation-picker payload — one network round-trip that returns the
 * minimal set of rows needed to render the "Start a new conversation"
 * dialog. Replaces three separate subscriptions
 * (`people.listAll` + `deals.list` + `companies.list`) when the dialog
 * opens, dropping the messages page from 4 list subscriptions to 2 (this
 * + the inbox query).
 *
 * Returns:
 *   - people:    leads + contacts merged into the unified
 *                `{ personCode, displayName, email?, phone?, type }` shape
 *   - deals:     `{ dealCode, title }`
 *   - companies: `{ companyCode, name }`
 *
 * Bounded — capped at 100 rows per type to keep the payload small. The
 * dialog's `cmdk` already filters on the client; the cap matches the
 * Convex Rule R5 default.
 */
export const listForConversationPicker = orgQuery({
	args: { orgId: v.id("orgs") },
	handler: async (ctx, args) => {
		await requireOrgMember(ctx, args.orgId);

		const cap = 100;

		const [leads, contacts, deals, companies] = await Promise.all([
			ctx.db
				.query("leads")
				.withIndex("by_org", (q) => q.eq("orgId", args.orgId))
				.take(cap),
			ctx.db
				.query("contacts")
				.withIndex("by_org", (q) => q.eq("orgId", args.orgId))
				.take(cap),
			ctx.db
				.query("deals")
				.withIndex("by_org", (q) => q.eq("orgId", args.orgId))
				.take(cap),
			ctx.db
				.query("companies")
				.withIndex("by_org", (q) => q.eq("orgId", args.orgId))
				.take(cap),
		]);

		const people = [
			...leads
				.filter((l) => !l.deletedAt && !l.convertedAt)
				.map((l) => ({
					type: "lead" as const,
					personCode: l.personCode,
					displayName: l.displayName,
					email: l.email,
					phone: l.phone,
				})),
			...contacts
				.filter((c) => !c.deletedAt)
				.map((c) => ({
					type: "contact" as const,
					personCode: c.personCode,
					displayName: c.displayName,
					email: c.email,
					phone: c.phone,
				})),
		];

		return {
			people,
			deals: deals
				.filter((d) => !d.deletedAt)
				.map((d) => ({ dealCode: d.dealCode, title: d.title })),
			companies: companies
				.filter((c) => !c.deletedAt)
				.map((c) => ({ companyCode: c.companyCode, name: c.name })),
		};
	},
});

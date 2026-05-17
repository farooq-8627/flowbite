/**
 * Notes Queries — convex/crm/shared/notes/queries.ts
 *
 * Read API:
 *   - listForEntity   — every note on a single entity (used by panels/profile tabs)
 *   - listForPerson   — every note tied to a personCode (cross-entity)
 *   - listForOrg      — org-wide board with optional filters (categoryId, author,
 *                       isPinned, entityType). Used by `NotesView`.
 *   - listAuthors     — distinct author list for the filter chip.
 *
 * Privacy: any reader without `notes.viewInternal` only sees `isInternal=false` rows.
 *
 * Sort order (2026-05-17 free-drag update)
 * ────────────────────────────────────────
 * Notes are now ordered by `sortOrder asc` so users can drag-drop a card to
 * any position and have it persist. Rows with no `sortOrder` (pre-migration
 * leftovers) fall back to `-_creationTime` so newest still floats to the
 * top — matches the day-one behaviour. Pinned-first is no longer an
 * ordering signal; the pin chip stays as a visual flag and the user moves
 * pinned cards to the top by dragging them.
 */
import { v } from "convex/values";
import { orgQuery, requireOrgMember } from "../../../_functions/authenticated";
import type { Doc } from "../../../_generated/dataModel";
import { hasPermission, requireRole } from "../../../_shared/permissions";

/**
 * Stable sort-order resolver. When `sortOrder` is set we use it as-is;
 * otherwise we fall back to `-_creationTime` so the day-one order
 * (post-migration) matches the legacy "newest first" behaviour. Lower
 * values are top-of-column.
 */
function noteSortKey(n: Doc<"notes">): number {
	return n.sortOrder ?? -n._creationTime;
}

function sortNotesByOrder(a: Doc<"notes">, b: Doc<"notes">): number {
	return noteSortKey(a) - noteSortKey(b);
}

// ─── listForEntity ───────────────────────────────────────────────────────────

export const listForEntity = orgQuery({
	args: {
		orgId: v.id("orgs"),
		entityType: v.string(),
		entityId: v.string(),
	},
	handler: async (ctx, args) => {
		const { member } = await requireOrgMember(ctx, args.orgId);
		requireRole(member.permissions, "notes.view");

		const isAdmin = hasPermission(member.permissions, "notes.viewInternal");

		const notes = await ctx.db
			.query("notes")
			.withIndex("by_entity", (q) =>
				q
					.eq("orgId", args.orgId)
					.eq("entityType", args.entityType)
					.eq("entityId", args.entityId),
			)
			.collect();

		// sortOrder asc — user drags a card to any position. Privacy filter
		// drops `isInternal` rows for non-admin readers.
		return notes.filter((n) => isAdmin || !n.isInternal).sort(sortNotesByOrder);
	},
});

// ─── listForPerson ───────────────────────────────────────────────────────────

export const listForPerson = orgQuery({
	args: { orgId: v.id("orgs"), personCode: v.string() },
	handler: async (ctx, args) => {
		const { member } = await requireOrgMember(ctx, args.orgId);
		requireRole(member.permissions, "notes.view");

		const isAdmin = hasPermission(member.permissions, "notes.viewInternal");

		const notes = await ctx.db
			.query("notes")
			.withIndex("by_org_and_personCode", (q) =>
				q.eq("orgId", args.orgId).eq("personCode", args.personCode),
			)
			.collect();

		return notes.filter((n) => isAdmin || !n.isInternal).sort(sortNotesByOrder);
	},
});

// ─── listForOrg (the org-wide board feed) ────────────────────────────────────

/**
 * Org-wide notes feed with optional filters. The query picks the cheapest
 * index based on which filter is set:
 *
 *   categoryId set → by_org_and_category
 *   author set     → by_org_and_author
 *   none           → by_org_and_created (newest first)
 *
 * Other filters are applied in-memory after the index pull. We cap the
 * scan at 1,000 rows.
 */
export const listForOrg = orgQuery({
	args: {
		orgId: v.id("orgs"),
		categoryId: v.optional(v.id("noteCategories")),
		authorId: v.optional(v.id("users")),
		entityType: v.optional(v.string()),
		isPinned: v.optional(v.boolean()),
		limit: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
		const { member } = await requireOrgMember(ctx, args.orgId);
		requireRole(member.permissions, "notes.view");
		const isAdmin = hasPermission(member.permissions, "notes.viewInternal");
		const limit = Math.min(args.limit ?? 500, 1000);

		// Pick the most selective index available.
		let candidates: Doc<"notes">[];
		if (args.categoryId !== undefined) {
			candidates = await ctx.db
				.query("notes")
				.withIndex("by_org_and_category", (q) =>
					q.eq("orgId", args.orgId).eq("categoryId", args.categoryId),
				)
				.order("desc")
				.take(limit);
		} else if (args.authorId !== undefined) {
			candidates = await ctx.db
				.query("notes")
				.withIndex("by_org_and_author", (q) =>
					q.eq("orgId", args.orgId).eq("authorId", args.authorId!),
				)
				.order("desc")
				.take(limit);
		} else {
			candidates = await ctx.db
				.query("notes")
				.withIndex("by_org_and_created", (q) => q.eq("orgId", args.orgId))
				.order("desc")
				.take(limit);
		}

		// Post-filter remaining predicates + privacy filter.
		const filtered = candidates.filter((n) => {
			if (!isAdmin && n.isInternal) return false;
			if (args.entityType !== undefined && n.entityType !== args.entityType) return false;
			if (args.isPinned !== undefined && n.isPinned !== args.isPinned) return false;
			if (args.authorId !== undefined && n.authorId !== args.authorId) return false;
			if (args.categoryId !== undefined && n.categoryId !== args.categoryId) return false;
			return true;
		});

		// Pinned first, then newest.
		return filtered.sort(sortNotesByOrder);
	},
});

// ─── listAuthors (filter chip data) ──────────────────────────────────────────

/**
 * Distinct author list for the "by author" filter chip. Returns up to 50
 * authors who have created at least one note in this org.
 */
export const listAuthors = orgQuery({
	args: { orgId: v.id("orgs") },
	handler: async (ctx, args) => {
		const { member } = await requireOrgMember(ctx, args.orgId);
		requireRole(member.permissions, "notes.view");

		const recent = await ctx.db
			.query("notes")
			.withIndex("by_org_and_created", (q) => q.eq("orgId", args.orgId))
			.order("desc")
			.take(500);

		const seen = new Set<string>();
		const authors: { authorId: string; name: string; avatarUrl?: string }[] = [];
		for (const note of recent) {
			const id = note.authorId;
			if (seen.has(id)) continue;
			seen.add(id);
			const user = await ctx.db.get(note.authorId);
			if (!user) continue;
			authors.push({
				authorId: id,
				name: user.name ?? user.email ?? "Unknown",
				avatarUrl: user.avatarUrl,
			});
			if (authors.length >= 50) break;
		}
		return authors;
	},
});

// ─── searchEntities (typeahead for the per-card +-button popover) ───────────

/**
 * Typeahead index for the per-card entity-attach `+` popover.
 *
 * Returns up to ~50 candidates per type (lead, contact, deal, company)
 * matching the supplied prefix on display name OR record code (P-001,
 * D-042, CO-001). The result is union-shaped so the frontend can render a
 * grouped list with the entity type clearly labelled.
 *
 * NOT a full-text search — for v1 this is a server-side LIKE-on-name +
 * exact-prefix-on-code. Good enough for typeahead, doesn't require a
 * separate search index. We can swap to a vector search later.
 */
export const searchEntities = orgQuery({
	args: {
		orgId: v.id("orgs"),
		query: v.string(),
		limitPerType: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
		const { member } = await requireOrgMember(ctx, args.orgId);
		// Reuse `notes.view` — the user has to be able to read notes to
		// attach them; this picker is part of the same UX.
		requireRole(member.permissions, "notes.view");

		const limit = Math.min(args.limitPerType ?? 8, 25);
		const q = args.query.trim().toLowerCase();

		// Defensive: empty query returns the most recent records of each kind.
		const matches = (haystack: string | undefined): boolean => {
			if (!haystack) return false;
			if (q.length === 0) return true;
			return haystack.toLowerCase().includes(q);
		};

		// Leads — exclude converted leads. They're surfaced as Contacts via the
		// same personCode, so showing both would duplicate the row in the
		// "Profiles" group on the popover.
		const leads = await ctx.db
			.query("leads")
			.withIndex("by_org", (qb) => qb.eq("orgId", args.orgId))
			.order("desc")
			.take(200);
		const leadHits = leads
			.filter((l) => !l.deletedAt && !l.convertedAt && l.status !== "converted")
			.filter(
				(l) =>
					matches(l.displayName) ||
					matches(l.email) ||
					matches(l.personCode) ||
					matches(l.phone),
			)
			.slice(0, limit)
			.map((l) => ({
				kind: "lead" as const,
				id: l._id,
				code: l.personCode,
				displayName: l.displayName ?? l.personCode,
				secondary: l.email ?? l.phone ?? undefined,
				personCode: l.personCode,
			}));

		// Contacts
		const contacts = await ctx.db
			.query("contacts")
			.withIndex("by_org", (qb) => qb.eq("orgId", args.orgId))
			.order("desc")
			.take(200);
		const contactHits = contacts
			.filter(
				(c) =>
					matches(c.displayName) ||
					matches(c.email) ||
					matches(c.personCode) ||
					matches(c.phone),
			)
			.slice(0, limit)
			.map((c) => ({
				kind: "contact" as const,
				id: c._id,
				code: c.personCode,
				displayName: c.displayName ?? c.personCode,
				secondary: c.email ?? c.phone ?? undefined,
				personCode: c.personCode,
			}));

		// Deals
		const deals = await ctx.db
			.query("deals")
			.withIndex("by_org", (qb) => qb.eq("orgId", args.orgId))
			.order("desc")
			.take(200);
		const dealHits = deals
			.filter((d) => matches(d.title) || matches(d.dealCode))
			.slice(0, limit)
			.map((d) => ({
				kind: "deal" as const,
				id: d._id,
				code: d.dealCode,
				displayName: d.title ?? d.dealCode,
				secondary: undefined as string | undefined,
				personCode: d.personCode,
			}));

		// Companies
		const companies = await ctx.db
			.query("companies")
			.withIndex("by_org", (qb) => qb.eq("orgId", args.orgId))
			.order("desc")
			.take(200);
		const companyHits = companies
			.filter((co) => matches(co.name) || matches(co.companyCode))
			.slice(0, limit)
			.map((co) => ({
				kind: "company" as const,
				id: co._id,
				code: co.companyCode,
				displayName: co.name,
				secondary: undefined as string | undefined,
				personCode: undefined as string | undefined,
			}));

		return {
			leads: leadHits,
			contacts: contactHits,
			deals: dealHits,
			companies: companyHits,
		};
	},
});


// ─── getAttachmentDisplay (single-entity lookup for the attached avatar) ─────

/**
 * Resolve a note's attachment to a displayable record so the per-card avatar
 * trigger can show the correct initials + name.
 *
 * People are unified: leads + contacts share a personCode, so we resolve via
 * the same "contact-first, lead-fallback" order as `crm.people.getByPersonCode`.
 * Deals and companies are looked up by their Convex `_id` (the picker stores
 * `hit.id` for those, not the code).
 *
 * Permission: `notes.view` — same gate as the picker that consumes it.
 */
export const getAttachmentDisplay = orgQuery({
	args: {
		orgId: v.id("orgs"),
		entityType: v.string(),
		entityId: v.string(),
	},
	handler: async (ctx, args) => {
		const { member } = await requireOrgMember(ctx, args.orgId);
		requireRole(member.permissions, "notes.view");

		// Persons (lead OR contact) — entityId is the personCode.
		if (args.entityType === "lead" || args.entityType === "contact") {
			const contact = await ctx.db
				.query("contacts")
				.withIndex("by_org_and_personCode", (q) =>
					q.eq("orgId", args.orgId).eq("personCode", args.entityId),
				)
				.first();
			if (contact && !contact.deletedAt) {
				return {
					kind: "contact" as const,
					code: contact.personCode,
					displayName: contact.displayName,
					secondary: contact.email ?? contact.phone ?? undefined,
				};
			}
			const lead = await ctx.db
				.query("leads")
				.withIndex("by_org_and_personCode", (q) =>
					q.eq("orgId", args.orgId).eq("personCode", args.entityId),
				)
				.first();
			if (lead && !lead.deletedAt) {
				return {
					kind: "lead" as const,
					code: lead.personCode,
					displayName: lead.displayName,
					secondary: lead.email ?? lead.phone ?? undefined,
				};
			}
			return null;
		}

		// Deals — entityId is a Convex Id<"deals">.
		if (args.entityType === "deal") {
			try {
				const deal = await ctx.db.get(args.entityId as Doc<"deals">["_id"]);
				if (!deal || deal.deletedAt || deal.orgId !== args.orgId) return null;
				return {
					kind: "deal" as const,
					code: deal.dealCode,
					displayName: deal.title ?? deal.dealCode,
					secondary: undefined as string | undefined,
				};
			} catch {
				return null;
			}
		}

		// Companies — entityId is a Convex Id<"companies">.
		if (args.entityType === "company") {
			try {
				const company = await ctx.db.get(args.entityId as Doc<"companies">["_id"]);
				if (!company || company.deletedAt || company.orgId !== args.orgId) return null;
				return {
					kind: "company" as const,
					code: company.companyCode,
					displayName: company.name,
					secondary: undefined as string | undefined,
				};
			} catch {
				return null;
			}
		}

		return null;
	},
});

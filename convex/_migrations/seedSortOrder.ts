/**
 * One-shot migration (created 2026-05-17) — backfill `sortOrder` on every
 * row of the kanban-bearing tables: `notes`, `leads`, `contacts`,
 * `companies`, `deals`.
 *
 * Why this is needed
 * ──────────────────
 * The kanban primitive is moving from "render in query order" to "render
 * in `sortOrder` order so users can drag-drop cards to ANY position and
 * have it persist". Existing rows have no `sortOrder`, so we backfill
 * with `-_creationTime` so the visible order on day one matches the old
 * "newest first" behaviour.
 *
 * Strategy
 * ────────
 *   `sortOrder = -_creationTime`
 *
 * `_creationTime` is a millisecond timestamp from Convex. Negating gives
 * newest-first when sorted ascending — exactly the order the queries used
 * before. Subsequent moves replace the value with a midpoint between
 * neighbours; the original timestamp relationship is irrelevant after the
 * first drag.
 *
 * Idempotent. Safe to run twice. Skips rows that already have `sortOrder`.
 *
 * Usage
 * ─────
 *   npx convex run _migrations/seedSortOrder:run
 *   npx convex run _migrations/seedSortOrder:runDryRun
 */

import { v } from "convex/values";
import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import { internalAction, internalMutation, internalQuery } from "../_generated/server";

const PAGE_SIZE = 200;

type SortableTable = "notes" | "leads" | "contacts" | "companies" | "deals";

// ─── Per-table page queries (5 — one per table) ──────────────────────────────

export const listNotesPage = internalQuery({
	args: { afterId: v.optional(v.id("notes")), limit: v.number() },
	handler: async (ctx, args) => {
		const all = await ctx.db
			.query("notes")
			.order("asc")
			.take(args.limit + (args.afterId ? 200 : 0));
		const startIdx = args.afterId ? all.findIndex((n) => n._id === args.afterId) + 1 : 0;
		return all.slice(startIdx, startIdx + args.limit);
	},
});

export const listLeadsPage = internalQuery({
	args: { afterId: v.optional(v.id("leads")), limit: v.number() },
	handler: async (ctx, args) => {
		const all = await ctx.db
			.query("leads")
			.order("asc")
			.take(args.limit + (args.afterId ? 200 : 0));
		const startIdx = args.afterId ? all.findIndex((n) => n._id === args.afterId) + 1 : 0;
		return all.slice(startIdx, startIdx + args.limit);
	},
});

export const listContactsPage = internalQuery({
	args: { afterId: v.optional(v.id("contacts")), limit: v.number() },
	handler: async (ctx, args) => {
		const all = await ctx.db
			.query("contacts")
			.order("asc")
			.take(args.limit + (args.afterId ? 200 : 0));
		const startIdx = args.afterId ? all.findIndex((n) => n._id === args.afterId) + 1 : 0;
		return all.slice(startIdx, startIdx + args.limit);
	},
});

export const listCompaniesPage = internalQuery({
	args: { afterId: v.optional(v.id("companies")), limit: v.number() },
	handler: async (ctx, args) => {
		const all = await ctx.db
			.query("companies")
			.order("asc")
			.take(args.limit + (args.afterId ? 200 : 0));
		const startIdx = args.afterId ? all.findIndex((n) => n._id === args.afterId) + 1 : 0;
		return all.slice(startIdx, startIdx + args.limit);
	},
});

export const listDealsPage = internalQuery({
	args: { afterId: v.optional(v.id("deals")), limit: v.number() },
	handler: async (ctx, args) => {
		const all = await ctx.db
			.query("deals")
			.order("asc")
			.take(args.limit + (args.afterId ? 200 : 0));
		const startIdx = args.afterId ? all.findIndex((n) => n._id === args.afterId) + 1 : 0;
		return all.slice(startIdx, startIdx + args.limit);
	},
});

// ─── Per-table single-row patch (5 — one per table) ─────────────────────────

export const patchNote = internalMutation({
	args: { id: v.id("notes") },
	handler: async (ctx, args) => {
		const row = await ctx.db.get(args.id);
		if (!row) return false;
		if (row.sortOrder !== undefined) return false;
		await ctx.db.patch(args.id, { sortOrder: -row._creationTime });
		return true;
	},
});

export const patchLead = internalMutation({
	args: { id: v.id("leads") },
	handler: async (ctx, args) => {
		const row = await ctx.db.get(args.id);
		if (!row) return false;
		if (row.sortOrder !== undefined) return false;
		await ctx.db.patch(args.id, { sortOrder: -row._creationTime });
		return true;
	},
});

export const patchContact = internalMutation({
	args: { id: v.id("contacts") },
	handler: async (ctx, args) => {
		const row = await ctx.db.get(args.id);
		if (!row) return false;
		if (row.sortOrder !== undefined) return false;
		await ctx.db.patch(args.id, { sortOrder: -row._creationTime });
		return true;
	},
});

export const patchCompany = internalMutation({
	args: { id: v.id("companies") },
	handler: async (ctx, args) => {
		const row = await ctx.db.get(args.id);
		if (!row) return false;
		if (row.sortOrder !== undefined) return false;
		await ctx.db.patch(args.id, { sortOrder: -row._creationTime });
		return true;
	},
});

export const patchDeal = internalMutation({
	args: { id: v.id("deals") },
	handler: async (ctx, args) => {
		const row = await ctx.db.get(args.id);
		if (!row) return false;
		if (row.sortOrder !== undefined) return false;
		await ctx.db.patch(args.id, { sortOrder: -row._creationTime });
		return true;
	},
});

// ─── Action: orchestrate backfill across the 5 tables ───────────────────────

type RunResult = {
	tablesScanned: number;
	rowsScanned: number;
	rowsPatched: number;
	rowsAlreadyMigrated: number;
	perTable: Record<SortableTable, { scanned: number; patched: number; skipped: number }>;
};

export const run = internalAction({
	args: {},
	handler: async (ctx): Promise<RunResult> => {
		const perTable: RunResult["perTable"] = {
			notes: { scanned: 0, patched: 0, skipped: 0 },
			leads: { scanned: 0, patched: 0, skipped: 0 },
			contacts: { scanned: 0, patched: 0, skipped: 0 },
			companies: { scanned: 0, patched: 0, skipped: 0 },
			deals: { scanned: 0, patched: 0, skipped: 0 },
		};

		// Notes
		{
			let cursor: Id<"notes"> | undefined;
			while (true) {
				const page: Doc<"notes">[] = await ctx.runQuery(
					internal._migrations.seedSortOrder.listNotesPage,
					{ afterId: cursor, limit: PAGE_SIZE },
				);
				if (page.length === 0) break;
				for (const row of page) {
					perTable.notes.scanned += 1;
					const changed: boolean = await ctx.runMutation(
						internal._migrations.seedSortOrder.patchNote,
						{ id: row._id },
					);
					if (changed) perTable.notes.patched += 1;
					else perTable.notes.skipped += 1;
				}
				cursor = page[page.length - 1]._id;
				if (page.length < PAGE_SIZE) break;
			}
		}

		// Leads
		{
			let cursor: Id<"leads"> | undefined;
			while (true) {
				const page: Doc<"leads">[] = await ctx.runQuery(
					internal._migrations.seedSortOrder.listLeadsPage,
					{ afterId: cursor, limit: PAGE_SIZE },
				);
				if (page.length === 0) break;
				for (const row of page) {
					perTable.leads.scanned += 1;
					const changed: boolean = await ctx.runMutation(
						internal._migrations.seedSortOrder.patchLead,
						{ id: row._id },
					);
					if (changed) perTable.leads.patched += 1;
					else perTable.leads.skipped += 1;
				}
				cursor = page[page.length - 1]._id;
				if (page.length < PAGE_SIZE) break;
			}
		}

		// Contacts
		{
			let cursor: Id<"contacts"> | undefined;
			while (true) {
				const page: Doc<"contacts">[] = await ctx.runQuery(
					internal._migrations.seedSortOrder.listContactsPage,
					{ afterId: cursor, limit: PAGE_SIZE },
				);
				if (page.length === 0) break;
				for (const row of page) {
					perTable.contacts.scanned += 1;
					const changed: boolean = await ctx.runMutation(
						internal._migrations.seedSortOrder.patchContact,
						{ id: row._id },
					);
					if (changed) perTable.contacts.patched += 1;
					else perTable.contacts.skipped += 1;
				}
				cursor = page[page.length - 1]._id;
				if (page.length < PAGE_SIZE) break;
			}
		}

		// Companies
		{
			let cursor: Id<"companies"> | undefined;
			while (true) {
				const page: Doc<"companies">[] = await ctx.runQuery(
					internal._migrations.seedSortOrder.listCompaniesPage,
					{ afterId: cursor, limit: PAGE_SIZE },
				);
				if (page.length === 0) break;
				for (const row of page) {
					perTable.companies.scanned += 1;
					const changed: boolean = await ctx.runMutation(
						internal._migrations.seedSortOrder.patchCompany,
						{ id: row._id },
					);
					if (changed) perTable.companies.patched += 1;
					else perTable.companies.skipped += 1;
				}
				cursor = page[page.length - 1]._id;
				if (page.length < PAGE_SIZE) break;
			}
		}

		// Deals
		{
			let cursor: Id<"deals"> | undefined;
			while (true) {
				const page: Doc<"deals">[] = await ctx.runQuery(
					internal._migrations.seedSortOrder.listDealsPage,
					{ afterId: cursor, limit: PAGE_SIZE },
				);
				if (page.length === 0) break;
				for (const row of page) {
					perTable.deals.scanned += 1;
					const changed: boolean = await ctx.runMutation(
						internal._migrations.seedSortOrder.patchDeal,
						{ id: row._id },
					);
					if (changed) perTable.deals.patched += 1;
					else perTable.deals.skipped += 1;
				}
				cursor = page[page.length - 1]._id;
				if (page.length < PAGE_SIZE) break;
			}
		}

		const totals = Object.values(perTable).reduce(
			(acc, t) => {
				acc.scanned += t.scanned;
				acc.patched += t.patched;
				acc.skipped += t.skipped;
				return acc;
			},
			{ scanned: 0, patched: 0, skipped: 0 },
		);

		return {
			tablesScanned: 5,
			rowsScanned: totals.scanned,
			rowsPatched: totals.patched,
			rowsAlreadyMigrated: totals.skipped,
			perTable,
		};
	},
});

export const runDryRun = internalAction({
	args: {},
	handler: async (
		ctx,
	): Promise<{
		rowsScanned: number;
		rowsWouldPatch: number;
		perTable: Record<SortableTable, { scanned: number; wouldPatch: number }>;
	}> => {
		const perTable: Record<SortableTable, { scanned: number; wouldPatch: number }> = {
			notes: { scanned: 0, wouldPatch: 0 },
			leads: { scanned: 0, wouldPatch: 0 },
			contacts: { scanned: 0, wouldPatch: 0 },
			companies: { scanned: 0, wouldPatch: 0 },
			deals: { scanned: 0, wouldPatch: 0 },
		};

		// Use the same per-table page queries, just count instead of patch.
		const tables = [
			["notes", internal._migrations.seedSortOrder.listNotesPage] as const,
			["leads", internal._migrations.seedSortOrder.listLeadsPage] as const,
			["contacts", internal._migrations.seedSortOrder.listContactsPage] as const,
			["companies", internal._migrations.seedSortOrder.listCompaniesPage] as const,
			["deals", internal._migrations.seedSortOrder.listDealsPage] as const,
		];

		for (const [name, queryRef] of tables) {
			// biome-ignore lint/suspicious/noExplicitAny: cursor type narrows per table; runtime carries the right Id
			let cursor: any | undefined;
			while (true) {
				// biome-ignore lint/suspicious/noExplicitAny: runQuery generic is parameterised per-table; we treat results uniformly
				const page: any[] = await ctx.runQuery(queryRef, {
					afterId: cursor,
					limit: PAGE_SIZE,
				});
				if (page.length === 0) break;
				for (const row of page) {
					perTable[name].scanned += 1;
					if (row.sortOrder === undefined) perTable[name].wouldPatch += 1;
				}
				cursor = page[page.length - 1]._id;
				if (page.length < PAGE_SIZE) break;
			}
		}

		const totals = Object.values(perTable).reduce(
			(acc, t) => {
				acc.scanned += t.scanned;
				acc.wouldPatch += t.wouldPatch;
				return acc;
			},
			{ scanned: 0, wouldPatch: 0 },
		);

		return {
			rowsScanned: totals.scanned,
			rowsWouldPatch: totals.wouldPatch,
			perTable,
		};
	},
});

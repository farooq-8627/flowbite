/**
 * One-shot migration (created 2026-05-17) — seed default note categories
 * per org and backfill `notes.categoryId` from the legacy `notes.color`
 * enum.
 *
 * Why this is needed
 * ──────────────────
 * The notes UI is moving from a fixed 6-color enum to a user-managed
 * `noteCategories` table. Existing rows have `color` (e.g. "yellow") but
 * no `categoryId` — the new UI reads only `categoryId`, so we backfill
 * before the UI flip.
 *
 * What this does
 * ──────────────
 *   1. For every org without any noteCategories rows: seed the 6 defaults
 *      (Yellow / Blue / Green / Pink / Purple / Gray, Yellow as default).
 *   2. For every note without `categoryId`: look up the matching category
 *      by the row's old `color`, set `categoryId`. If no match (impossible
 *      after step 1, but defensive), fall back to the org's default.
 *   3. Optionally clears the legacy `color` and `type` fields on each note
 *      after backfill — these are deprecated. The schema keeps them
 *      optional so legacy rows still validate during the rollout window.
 *
 * Idempotent. Safe to run multiple times. Pages on `_id`.
 *
 * Usage
 * ─────
 *   npx convex run _migrations/seedNoteCategories:run
 *   npx convex run _migrations/seedNoteCategories:runDryRun
 *
 * Schema reference: convex/schema/crmShared.ts::noteCategories, ::notes
 */

import { v } from "convex/values";
import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import { internalAction, internalMutation, internalQuery } from "../_generated/server";
import {
	getDefaultCategoryForOrg,
	lookupCategoryByLegacyColor,
	seedNoteCategoriesForOrg,
} from "../crm/shared/noteCategories/internal";

const PAGE_SIZE = 200;

type NoteDoc = Doc<"notes">;
type OrgDoc = Doc<"orgs">;

// ─── Step 1: list every org so the action can iterate them ───────────────────

export const listOrgs = internalQuery({
	args: { afterId: v.optional(v.id("orgs")), limit: v.number() },
	handler: async (ctx, args) => {
		const all = await ctx.db
			.query("orgs")
			.order("asc")
			.take(args.limit + (args.afterId ? 200 : 0));
		const startIdx = args.afterId ? all.findIndex((o) => o._id === args.afterId) + 1 : 0;
		return all.slice(startIdx, startIdx + args.limit);
	},
});

export const seedCategoriesForOrg = internalMutation({
	args: { orgId: v.id("orgs") },
	handler: async (ctx, args) => {
		const inserted = await seedNoteCategoriesForOrg(ctx, args.orgId);
		return { inserted };
	},
});

// ─── Step 2: page through every note and backfill categoryId ─────────────────

export const listNotesPage = internalQuery({
	args: {
		afterId: v.optional(v.id("notes")),
		limit: v.number(),
	},
	handler: async (ctx, args) => {
		const all = await ctx.db
			.query("notes")
			.order("asc")
			.take(args.limit + (args.afterId ? 200 : 0));
		const startIdx = args.afterId ? all.findIndex((n) => n._id === args.afterId) + 1 : 0;
		return all.slice(startIdx, startIdx + args.limit);
	},
});

export const patchOne = internalMutation({
	args: { noteId: v.id("notes"), clearLegacyFields: v.optional(v.boolean()) },
	handler: async (ctx, args) => {
		const note = (await ctx.db.get(args.noteId)) as NoteDoc | null;
		if (!note) return { changed: false as const, reason: "not-found" };

		// biome-ignore lint/suspicious/noExplicitAny: legacy fields removed from public type
		const legacy = note as any;
		const hasCategoryId = note.categoryId !== undefined;
		const hasLegacyFields = legacy.color !== undefined || legacy.type !== undefined;

		if (hasCategoryId && (!args.clearLegacyFields || !hasLegacyFields)) {
			return { changed: false as const, reason: "already-up-to-date" };
		}

		// biome-ignore lint/suspicious/noExplicitAny: schema patch with newly-introduced field
		const patch: any = { updatedAt: Date.now() };

		if (!hasCategoryId) {
			let categoryId: Id<"noteCategories"> | null = null;
			if (legacy.color) {
				categoryId = await lookupCategoryByLegacyColor(ctx, note.orgId, legacy.color);
			}
			if (!categoryId) {
				categoryId = await getDefaultCategoryForOrg(ctx, note.orgId);
			}
			if (categoryId) {
				patch.categoryId = categoryId;
			}
		}

		if (args.clearLegacyFields && hasLegacyFields) {
			patch.color = undefined;
			patch.type = undefined;
		}

		// Skip the write if nothing actually changes (e.g. no default category
		// existed yet — defensive; should never happen after step 1).
		if (Object.keys(patch).length === 1 /* just updatedAt */) {
			return { changed: false as const, reason: "no-default-category" };
		}

		await ctx.db.patch(args.noteId, patch);
		return { changed: true as const };
	},
});

// ─── Action: orchestrate seed-then-backfill across the whole DB ─────────────

export const run = internalAction({
	args: { clearLegacyFields: v.optional(v.boolean()) },
	handler: async (
		ctx,
		args,
	): Promise<{
		orgsScanned: number;
		categoriesInserted: number;
		notesScanned: number;
		notesPatched: number;
		notesAlreadyOk: number;
	}> => {
		// Step 1: seed categories for every org.
		let orgCursor: Id<"orgs"> | undefined;
		let orgsScanned = 0;
		let categoriesInserted = 0;
		while (true) {
			const orgs: OrgDoc[] = await ctx.runQuery(
				internal._migrations.seedNoteCategories.listOrgs,
				{ afterId: orgCursor, limit: PAGE_SIZE },
			);
			if (orgs.length === 0) break;

			for (const org of orgs) {
				orgsScanned += 1;
				const { inserted } = await ctx.runMutation(
					internal._migrations.seedNoteCategories.seedCategoriesForOrg,
					{ orgId: org._id },
				);
				categoriesInserted += inserted;
			}

			orgCursor = orgs[orgs.length - 1]._id;
			if (orgs.length < PAGE_SIZE) break;
		}

		// Step 2: backfill every note.
		let noteCursor: Id<"notes"> | undefined;
		let notesScanned = 0;
		let notesPatched = 0;
		let notesAlreadyOk = 0;
		while (true) {
			const notes: NoteDoc[] = await ctx.runQuery(
				internal._migrations.seedNoteCategories.listNotesPage,
				{ afterId: noteCursor, limit: PAGE_SIZE },
			);
			if (notes.length === 0) break;

			for (const note of notes) {
				notesScanned += 1;
				const result = await ctx.runMutation(
					internal._migrations.seedNoteCategories.patchOne,
					{
						noteId: note._id,
						clearLegacyFields: args.clearLegacyFields ?? false,
					},
				);
				if (result.changed) notesPatched += 1;
				else notesAlreadyOk += 1;
			}

			noteCursor = notes[notes.length - 1]._id;
			if (notes.length < PAGE_SIZE) break;
		}

		return {
			orgsScanned,
			categoriesInserted,
			notesScanned,
			notesPatched,
			notesAlreadyOk,
		};
	},
});

export const runDryRun = internalAction({
	args: {},
	handler: async (
		ctx,
	): Promise<{
		orgsScanned: number;
		categoriesWouldInsert: number;
		notesScanned: number;
		notesWouldPatch: number;
	}> => {
		// Counts without writes. Walks the same pages.
		let orgCursor: Id<"orgs"> | undefined;
		let orgsScanned = 0;
		let categoriesWouldInsert = 0;
		while (true) {
			const orgs: OrgDoc[] = await ctx.runQuery(
				internal._migrations.seedNoteCategories.listOrgs,
				{ afterId: orgCursor, limit: PAGE_SIZE },
			);
			if (orgs.length === 0) break;
			for (const org of orgs) {
				orgsScanned += 1;
				const existingCount = await ctx.runQuery(
					internal._migrations.seedNoteCategories.countCategoriesForOrg,
					{ orgId: org._id },
				);
				categoriesWouldInsert += Math.max(0, 6 - existingCount);
			}
			orgCursor = orgs[orgs.length - 1]._id;
			if (orgs.length < PAGE_SIZE) break;
		}

		let noteCursor: Id<"notes"> | undefined;
		let notesScanned = 0;
		let notesWouldPatch = 0;
		while (true) {
			const notes: NoteDoc[] = await ctx.runQuery(
				internal._migrations.seedNoteCategories.listNotesPage,
				{ afterId: noteCursor, limit: PAGE_SIZE },
			);
			if (notes.length === 0) break;
			for (const note of notes) {
				notesScanned += 1;
				if (note.categoryId === undefined) notesWouldPatch += 1;
			}
			noteCursor = notes[notes.length - 1]._id;
			if (notes.length < PAGE_SIZE) break;
		}

		return { orgsScanned, categoriesWouldInsert, notesScanned, notesWouldPatch };
	},
});

export const countCategoriesForOrg = internalQuery({
	args: { orgId: v.id("orgs") },
	handler: async (ctx, args) => {
		const rows = await ctx.db
			.query("noteCategories")
			.withIndex("by_org", (q) => q.eq("orgId", args.orgId))
			.collect();
		return rows.length;
	},
});

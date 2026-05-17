/**
 * One-shot migration (created 2026-05-17) — backfill `color` and `type` on
 * existing notes rows so the new schema validators accept every legacy row.
 *
 * Why this is needed
 * ──────────────────
 * The notes schema gained two REQUIRED fields (`color`, `type`) when we
 * shipped the sticky-note board UI. Existing rows (created before
 * 2026-05-17) don't have them — Convex's schema validator will reject them
 * on the next read/write until they're patched.
 *
 * What this does
 * ──────────────
 * Walks every note in every org and patches:
 *   - `color: "yellow"` if missing
 *   - `type:  "general"` if missing
 * Idempotent — rows that already have the fields are skipped without
 * a write.
 *
 * Usage
 * ─────
 *   npx convex run _migrations/addNotesColorAndType:run
 *   npx convex run _migrations/addNotesColorAndType:runDryRun
 *
 * Schema reference: convex/schema/crmShared.ts::notes
 */

import { v } from "convex/values";
import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import { internalAction, internalMutation, internalQuery } from "../_generated/server";

const DEFAULT_COLOR = "yellow" as const;
const DEFAULT_TYPE = "general" as const;
const PAGE_SIZE = 200;

type NoteDoc = Doc<"notes">;

/**
 * Page through notes in createdAt order. Returns the slice + the cursor
 * (last `_id` seen) so the action can resume.
 *
 * We page on `_id` rather than `createdAt` to avoid skipping rows that
 * share a millisecond timestamp.
 */
export const listPage = internalQuery({
	args: {
		afterId: v.optional(v.id("notes")),
		limit: v.number(),
	},
	handler: async (ctx, args) => {
		const all = await ctx.db
			.query("notes")
			.order("asc")
			.take(args.limit + (args.afterId ? 200 : 0)); // small fudge so we can skip past cursor

		const startIdx = args.afterId ? all.findIndex((n) => n._id === args.afterId) + 1 : 0;
		const slice = all.slice(startIdx, startIdx + args.limit);
		return slice;
	},
});

/**
 * Patch a single note. Returns whether anything changed so the action can
 * tally an honest summary.
 */
export const patchOne = internalMutation({
	args: { noteId: v.id("notes") },
	handler: async (ctx, args) => {
		const note = (await ctx.db.get(args.noteId)) as NoteDoc | null;
		if (!note) return { changed: false as const, reason: "not-found" };

		// Cast to any so we can probe legacy fields the type doesn't include.
		// biome-ignore lint/suspicious/noExplicitAny: legacy field probe
		const legacy = note as any;
		const needsColor = legacy.color === undefined;
		const needsType = legacy.type === undefined;
		if (!needsColor && !needsType) {
			return { changed: false as const, reason: "already-up-to-date" };
		}

		// biome-ignore lint/suspicious/noExplicitAny: schema patch with new required fields not yet in generated types until next dev push
		const patch: any = {};
		if (needsColor) patch.color = DEFAULT_COLOR;
		if (needsType) patch.type = DEFAULT_TYPE;
		await ctx.db.patch(args.noteId, patch);

		return {
			changed: true as const,
			added: { color: needsColor, type: needsType },
		};
	},
});

/**
 * Idempotent: walk every note in every org, patch missing fields. Returns a
 * summary so you can verify in the Convex dashboard.
 */
export const run = internalAction({
	args: {},
	handler: async (
		ctx,
	): Promise<{
		totalScanned: number;
		patched: number;
		alreadyOk: number;
	}> => {
		let cursor: Id<"notes"> | undefined;
		let totalScanned = 0;
		let patched = 0;
		let alreadyOk = 0;

		while (true) {
			const page: NoteDoc[] = await ctx.runQuery(
				internal._migrations.addNotesColorAndType.listPage,
				{ afterId: cursor, limit: PAGE_SIZE },
			);
			if (page.length === 0) break;

			for (const note of page) {
				totalScanned += 1;
				const result = await ctx.runMutation(
					internal._migrations.addNotesColorAndType.patchOne,
					{ noteId: note._id },
				);
				if (result.changed) patched += 1;
				else alreadyOk += 1;
			}

			cursor = page[page.length - 1]._id;
			if (page.length < PAGE_SIZE) break;
		}

		return { totalScanned, patched, alreadyOk };
	},
});

/**
 * Dry-run: identical scan, no writes. Returns the count of rows that WOULD
 * be patched.
 */
export const runDryRun = internalAction({
	args: {},
	handler: async (
		ctx,
	): Promise<{
		totalScanned: number;
		wouldPatch: number;
		alreadyOk: number;
	}> => {
		let cursor: Id<"notes"> | undefined;
		let totalScanned = 0;
		let wouldPatch = 0;
		let alreadyOk = 0;

		while (true) {
			const page: NoteDoc[] = await ctx.runQuery(
				internal._migrations.addNotesColorAndType.listPage,
				{ afterId: cursor, limit: PAGE_SIZE },
			);
			if (page.length === 0) break;

			for (const note of page) {
				totalScanned += 1;
				// biome-ignore lint/suspicious/noExplicitAny: legacy field probe
				const legacy = note as any;
				if (legacy.color === undefined || legacy.type === undefined) wouldPatch += 1;
				else alreadyOk += 1;
			}

			cursor = page[page.length - 1]._id;
			if (page.length < PAGE_SIZE) break;
		}

		return { totalScanned, wouldPatch, alreadyOk };
	},
});

/**
 * Migration: dedupe `fieldDefinitions` by `(orgId, entityType, name)`.
 *
 * Why
 * ───
 * Before 2026-05-24, the public `fieldDefinitions.create` mutation (and
 * its AI twin) didn't enforce uniqueness on `(orgId, entityType, name)`.
 * The lazy seeder DID enforce it, but the AI's `create_field` tool
 * could call `create` multiple times for the same field name and end up
 * inserting two rows with the SAME name. This breaks the entity
 * DataTable: `useEntityColumns` derives the column id from `field.name`,
 * so the table tries to render two `<th key="records">` headers and
 * React warns "Encountered two children with the same key, `records`."
 *
 * What this does
 * ──────────────
 *  1. Walk every `fieldDefinitions` row in batches.
 *  2. Group by `(orgId, entityType, name)`.
 *  3. Keep the OLDEST row in each group (lowest `_creationTime`) — any
 *     `fieldValues` already pointing at it stay attached.
 *  4. For each duplicate row about to be deleted, re-attach its
 *     `fieldValues` to the keeper by patching `fieldId`.
 *  5. Delete the duplicate.
 *
 * Idempotent: runs again will be no-ops once duplicates are gone.
 *
 * Triggered manually via:
 *   npx convex run --component _migrations._2026_05_24_dedupeFieldDefinitions:run
 *
 * The 2026-05-24 incident affected at least one dev org with two
 * `lead::records` rows. We don't auto-run on deploy — admins kick this
 * off intentionally so the change is auditable.
 */

import { v } from "convex/values";
import { internalMutation } from "../_generated/server";

export const run = internalMutation({
	args: {
		// When supplied, only operates on this org; otherwise scans every
		// `fieldDefinitions` row across the deployment. Useful while testing.
		orgId: v.optional(v.id("orgs")),
		dryRun: v.optional(v.boolean()),
	},
	handler: async (ctx, args) => {
		const dryRun = args.dryRun ?? false;
		const all = args.orgId
			? await ctx.db
					.query("fieldDefinitions")
					.withIndex("by_org_and_entity", (q) => q.eq("orgId", args.orgId!))
					.collect()
			: await ctx.db.query("fieldDefinitions").collect();

		const groups = new Map<string, typeof all>();
		for (const row of all) {
			const key = `${row.orgId}::${row.entityType}::${row.name}`;
			const arr = groups.get(key) ?? [];
			arr.push(row);
			groups.set(key, arr);
		}

		let groupsWithDupes = 0;
		let rowsRemoved = 0;
		let valuesReattached = 0;

		for (const [_, rows] of groups) {
			if (rows.length <= 1) continue;
			groupsWithDupes++;
			// Keep the oldest row — _creationTime ascending.
			rows.sort((a, b) => a._creationTime - b._creationTime);
			const [keeper, ...duplicates] = rows;

			for (const dup of duplicates) {
				// Re-attach any `fieldValues` rows that point at the dup.
				const valuesPointingAtDup = await ctx.db
					.query("fieldValues")
					.withIndex("by_field_and_entity", (q) =>
						q.eq("orgId", dup.orgId).eq("fieldId", dup._id),
					)
					.collect();
				for (const val of valuesPointingAtDup) {
					if (dryRun) continue;
					// Check whether the keeper already has a value for this
					// (entityId). If yes, prefer the keeper's value and
					// drop the dup's; otherwise re-point the dup's value
					// at the keeper.
					const existing = await ctx.db
						.query("fieldValues")
						.withIndex("by_field_and_entity", (q) =>
							q
								.eq("orgId", val.orgId)
								.eq("fieldId", keeper._id)
								.eq("entityId", val.entityId),
						)
						.first();
					if (existing) {
						await ctx.db.delete(val._id);
					} else {
						await ctx.db.patch(val._id, {
							fieldId: keeper._id,
							fieldName: keeper.name,
							updatedAt: Date.now(),
						});
						valuesReattached++;
					}
				}

				if (!dryRun) await ctx.db.delete(dup._id);
				rowsRemoved++;
			}
		}

		return {
			scanned: all.length,
			groupsWithDupes,
			rowsRemoved,
			valuesReattached,
			dryRun,
		};
	},
});

/**
 * 2026-05-21 — Fix company "assignedTo" fieldDefinition.columnKey.
 *
 * Why
 * ───
 * The seed previously set `columnKey: "assignees"` (an array column) for
 * the company `assignedTo` field. EntityFieldForm reads `entity[columnKey]`
 * to populate column values — for the assignee input that expects a single
 * userId, reading the `assignees: Id<"users">[]` array and casting it to a
 * string broke the picker (it would either show `undefined` or coerce the
 * array to `"id1,id2"`). The "assignee" input renderer expects a single
 * user id pulled from the `assignedTo` column, mirroring the lead/contact
 * forms.
 *
 * Fix
 * ───
 *   - For every existing company `assignedTo` field row whose `columnKey`
 *     is `"assignees"`, patch it to `"assignedTo"`.
 *   - Idempotent: rows that already have `columnKey: "assignedTo"` are
 *     skipped.
 *
 * Run via:
 *     npx convex run _migrations/fixCompanyAssignedToColumnKey:run '{}'
 */

import { v } from "convex/values";
import { internalMutation } from "../_generated/server";

export const run = internalMutation({
	args: { dryRun: v.optional(v.boolean()) },
	handler: async (ctx, args) => {
		const dryRun = args.dryRun ?? false;

		const orgs = await ctx.db.query("orgs").collect();

		let patched = 0;
		let alreadyOk = 0;

		for (const org of orgs) {
			const fields = await ctx.db
				.query("fieldDefinitions")
				.withIndex("by_org_and_entity", (q) =>
					q.eq("orgId", org._id).eq("entityType", "company"),
				)
				.collect();

			for (const f of fields) {
				if (f.name !== "assignedTo") continue;
				if (f.columnKey === "assignedTo") {
					alreadyOk += 1;
					continue;
				}
				if (!dryRun) {
					await ctx.db.patch(f._id, {
						columnKey: "assignedTo",
						updatedAt: Date.now(),
					});
				}
				patched += 1;
			}
		}

		return { dryRun, orgsScanned: orgs.length, patched, alreadyOk };
	},
});

/**
 * 2026-05-20 — Pin every deal field with empty showInStages to its
 * pipelines' Default stages.
 *
 * Why
 * ───
 * Locked decision (2026-05-20 evening): "empty showInStages" no longer
 * means "show on every stage". Every field MUST be pinned to at least
 * one stage to appear anywhere. The Default stage of every pipeline now
 * holds the deal's "always-on" fields (dealCode, title, assignee, tags,
 * value, currentStageId, etc.) — so we backfill those onto the Default
 * stage of EVERY pipeline this org has.
 *
 * Strategy
 * ────────
 *   - For every org, find every pipeline of `entityType: "deal"`.
 *   - Gather the list of Default-stage ids across those pipelines.
 *   - For every `entityType: "deal"` field in that org with empty /
 *     missing showInStages, set showInStages = [those default stage ids].
 *   - Idempotent: skip rows that already have a non-empty showInStages.
 *
 * Run via:
 *     npx convex run _migrations/pinDealFieldsToDefaultStage:run '{}'
 */

import { v } from "convex/values";
import { internalMutation } from "../_generated/server";

export const run = internalMutation({
	args: { dryRun: v.optional(v.boolean()) },
	handler: async (ctx, args) => {
		const dryRun = args.dryRun ?? false;

		// Per-org: find the org's deal pipelines, take their Default stage ids,
		// then pin every empty-showInStages deal field onto those ids.
		const orgs = await ctx.db.query("orgs").collect();

		let pinned = 0;
		let alreadyOk = 0;
		let skippedNoDefault = 0;

		for (const org of orgs) {
			const pipelines = await ctx.db
				.query("pipelines")
				.withIndex("by_org_and_entity", (q) =>
					q.eq("orgId", org._id).eq("entityType", "deal"),
				)
				.collect();
			const defaultStageIds: string[] = [];
			for (const p of pipelines) {
				const def = p.stages.find((s) => s.isDefaultStage === true);
				if (def) defaultStageIds.push(def.id);
			}
			if (defaultStageIds.length === 0) {
				continue;
			}

			const fields = await ctx.db
				.query("fieldDefinitions")
				.withIndex("by_org_and_entity", (q) =>
					q.eq("orgId", org._id).eq("entityType", "deal"),
				)
				.collect();

			for (const f of fields) {
				if (f.showInStages && f.showInStages.length > 0) {
					alreadyOk += 1;
					continue;
				}
				if (defaultStageIds.length === 0) {
					skippedNoDefault += 1;
					continue;
				}
				if (!dryRun) {
					await ctx.db.patch(f._id, {
						showInStages: defaultStageIds,
						updatedAt: Date.now(),
					});
				}
				pinned += 1;
			}
		}

		return {
			dryRun,
			orgsScanned: orgs.length,
			pinned,
			alreadyOk,
			skippedNoDefault,
		};
	},
});

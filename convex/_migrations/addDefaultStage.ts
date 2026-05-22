/**
 * 2026-05-20 — Add `isDefaultStage` to every existing pipeline.
 *
 * Why
 * ───
 * The schema now requires every pipeline to carry exactly ONE stage with
 * `isDefaultStage: true`. New pipelines auto-create one in
 * `pipelines.create`. This migration backfills the flag onto existing
 * pipelines so the existing dev/prod data matches the new shape.
 *
 * Strategy
 * ────────
 *   - Idempotent: skips pipelines that already have a stage with
 *     `isDefaultStage === true`.
 *   - For pipelines where no stage carries the flag:
 *       1. Pick the existing stage at `order: 0` IF it's non-final.
 *          Promote it to `isDefaultStage: true` and rename it to
 *          "Default" only if it has no admin-typed name yet (the
 *          common case is users have stages named "New" / "Discovery"
 *          / etc — we leave those names alone but flip the flag).
 *       2. If the order-0 stage is final OR the pipeline is empty,
 *          insert a fresh "Default" stage at order 0 and renumber the
 *          rest.
 *   - Returns a summary of how many pipelines were updated.
 *
 * Run via:
 *     npx convex run _migrations/2026-05-20-add-default-stage:run '{}'
 */

import { v } from "convex/values";
import { internalMutation } from "../_generated/server";

function nanoid12(): string {
	return Math.random().toString(36).slice(2, 14).padEnd(12, "0");
}

export const run = internalMutation({
	args: { dryRun: v.optional(v.boolean()) },
	handler: async (ctx, args) => {
		const dryRun = args.dryRun ?? false;
		const pipelines = await ctx.db.query("pipelines").collect();

		let promotedExisting = 0;
		let injectedNew = 0;
		let alreadyOk = 0;

		for (const p of pipelines) {
			const existing = p.stages.find((s) => s.isDefaultStage === true);
			if (existing) {
				alreadyOk += 1;
				continue;
			}

			const sorted = [...p.stages].sort((a, b) => a.order - b.order);
			const firstNonFinal = sorted.find((s) => !s.isFinal);

			if (firstNonFinal) {
				// Promote the existing first-non-final stage in place.
				const next = p.stages.map((s) => {
					if (s.id !== firstNonFinal.id) return s;
					return { ...s, isDefaultStage: true };
				});
				if (!dryRun) {
					await ctx.db.patch(p._id, { stages: next, updatedAt: Date.now() });
				}
				promotedExisting += 1;
				continue;
			}

			// No non-final stage exists (pipeline is empty or only final).
			// Inject a fresh Default stage at order 0 and renumber the rest.
			const codeUsed = new Set(p.stages.map((s) => s.code));
			let code = "DEFAULT";
			let n = 2;
			while (codeUsed.has(code)) {
				code = `DEFAULT${n}`;
				n += 1;
			}
			const fresh = {
				id: `stage_${nanoid12()}`,
				name: "Default",
				code,
				order: 0,
				color: "#94a3b8",
				isDefaultStage: true,
			};
			const renumbered = [fresh, ...sorted.map((s, i) => ({ ...s, order: i + 1 }))];
			if (!dryRun) {
				await ctx.db.patch(p._id, { stages: renumbered, updatedAt: Date.now() });
			}
			injectedNew += 1;
		}

		return {
			dryRun,
			pipelinesScanned: pipelines.length,
			alreadyOk,
			promotedExisting,
			injectedNew,
		};
	},
});

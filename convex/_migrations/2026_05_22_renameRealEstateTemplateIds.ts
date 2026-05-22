/**
 * Migration: rename real-estate template ids on existing orgs.
 *
 * Phase 3A (2026-05-22) — see CODE-ARCHITECTURE-PHASE-3A.md §5.1.
 *
 * Two id renames:
 *   "dubai-real-estate"  →  "real-estate-dubai"
 *   "real-estate"        →  "real-estate-global"
 *
 * Idempotent — running it twice is safe (the second run finds zero rows
 * matching the OLD ids because the first run already patched them).
 *
 * Note: even without this migration the workspace continues to work,
 * because `INDUSTRY_ID_ALIASES` in registry.ts maps the old ids onto the
 * new ones. This migration just makes `org.industry` consistent with
 * the canonical id set so the WorkspaceTemplateSection UI shows the
 * right "Current" badge and Phase 3B AI tools see the canonical id.
 *
 * Run via:
 *   npx convex run _migrations/2026_05_22_renameRealEstateTemplateIds:run
 */
import { internalMutation } from "../_generated/server";

const ID_RENAMES: Record<string, string> = {
	"dubai-real-estate": "real-estate-dubai",
	"real-estate": "real-estate-global",
};

export const run = internalMutation({
	args: {},
	handler: async (ctx) => {
		const orgs = await ctx.db.query("orgs").collect();
		let renamed = 0;
		const summary: Record<string, number> = {};

		for (const org of orgs) {
			if (!org.industry) continue;
			const newId = ID_RENAMES[org.industry];
			if (!newId) continue;

			await ctx.db.patch(org._id, {
				industry: newId,
				updatedAt: Date.now(),
			});
			renamed += 1;
			summary[`${org.industry} → ${newId}`] =
				(summary[`${org.industry} → ${newId}`] ?? 0) + 1;
		}

		return { renamed, summary };
	},
});

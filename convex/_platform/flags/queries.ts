/**
 * Owner-panel feature-flag queries — convex/_platform/flags/queries.ts
 *
 * Read-only access to the existing `featureFlags` table. The owner panel
 * uses these to drive the flags-list view + per-org override surface.
 *
 * Spec: PLATFORM-OWNER-PANEL.md §5 row 5, §10 stage 6.
 */
import { v } from "convex/values";
import { query } from "../../_generated/server";
import { requirePlatformOwner } from "../ownerAuth";

/**
 * Return every feature flag with its base config and overrides as-is.
 * Sorted by key for stable rendering.
 */
export const listFlags = query({
	args: {},
	handler: async (ctx) => {
		await requirePlatformOwner(ctx);
		const rows = await ctx.db.query("featureFlags").collect();
		return rows
			.map((r) => ({
				_id: r._id,
				key: r.key,
				enabled: r.enabled,
				rolloutPercent: r.rolloutPercent ?? null,
				orgOverrides: r.orgOverrides ?? {},
				description: r.description ?? null,
				updatedAt: r.updatedAt,
			}))
			.sort((a, b) => a.key.localeCompare(b.key));
	},
});

export const getFlag = query({
	args: { key: v.string() },
	handler: async (ctx, args) => {
		await requirePlatformOwner(ctx);
		return ctx.db
			.query("featureFlags")
			.withIndex("by_key", (q) => q.eq("key", args.key))
			.unique();
	},
});

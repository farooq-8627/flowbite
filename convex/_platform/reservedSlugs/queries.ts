/**
 * Reserved-slug queries — convex/_platform/reservedSlugs/queries.ts
 *
 * DB-backed SSOT for every reserved name across the platform (locked
 * decision L9, 2026-05-27). Replaces the static `RESERVED_SLUGS` Set
 * in `convex/_shared/reservedSlugs.ts`.
 *
 * See `convex/schema/platform.ts::platformReservedSlugs` for the table
 * shape + categories. See `convex/_shared/reservedSlugs.ts` for the
 * runtime helpers (`isSlugReserved` etc.) every mutation calls.
 *
 * Spec: INDUSTRY-TEMPLATES-DB-MIGRATION.md §3.2.
 */

import { v } from "convex/values";
import { query } from "../../_generated/server";
import { requirePlatformOwner } from "../ownerAuth";

const categoryValidator = v.union(
	v.literal("org"),
	v.literal("template"),
	v.literal("industryGroup"),
	v.literal("entitySlug"),
	v.literal("route"),
);

/**
 * Owner-panel admin list. Optional category filter. Sorted by
 * (category, slug).
 */
export const listAllForAdmin = query({
	args: { category: v.optional(categoryValidator) },
	handler: async (ctx, args) => {
		await requirePlatformOwner(ctx);
		const all = await ctx.db.query("platformReservedSlugs").collect();
		const filtered = args.category ? all.filter((r) => r.category === args.category) : all;
		return filtered.sort((a, b) => {
			if (a.category !== b.category) return a.category.localeCompare(b.category);
			return a.slug.localeCompare(b.slug);
		});
	},
});

/**
 * Single-slug lookup for the admin "edit reason" dialog.
 */
export const get = query({
	args: { slug: v.string(), category: categoryValidator },
	handler: async (ctx, args) => {
		await requirePlatformOwner(ctx);
		return ctx.db
			.query("platformReservedSlugs")
			.withIndex("by_category_slug", (q) =>
				q.eq("category", args.category).eq("slug", args.slug.toLowerCase()),
			)
			.unique();
	},
});

/**
 * Aggregate counts per category — drives the admin sidebar tabs.
 */
export const countsByCategory = query({
	args: {},
	handler: async (ctx) => {
		await requirePlatformOwner(ctx);
		const all = await ctx.db.query("platformReservedSlugs").collect();
		const counts: Record<string, number> = {
			org: 0,
			template: 0,
			industryGroup: 0,
			entitySlug: 0,
			route: 0,
		};
		for (const row of all) {
			counts[row.category] = (counts[row.category] ?? 0) + 1;
		}
		return counts;
	},
});

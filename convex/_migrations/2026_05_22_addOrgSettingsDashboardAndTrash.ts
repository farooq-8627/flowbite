/**
 * Migration: backfill `org.settings.dashboardMetrics` + standardize note categories.
 *
 * Phase 3A (2026-05-22) — see CODE-ARCHITECTURE-PHASE-3A.md §3.2 + §6.
 *
 * Two passes, both idempotent:
 *
 * Pass 1: dashboardMetrics backfill.
 *   For every org that has `industry` set, look up the template and copy
 *   its `dashboardMetrics` onto `org.settings.dashboardMetrics` IF the
 *   field is currently undefined or empty. We don't overwrite — owners
 *   who reordered widgets in their settings keep their order.
 *
 * Pass 2: note-category cleanup.
 *   For every org that still has all-six legacy color categories (Yellow,
 *   Blue, Green, Pink, Purple, Gray) that are unreferenced by any note,
 *   delete them. Categories with notes attached are kept as-is — owners
 *   can rename or archive via Settings → CRM → Note Categories.
 *
 * Run via:
 *   npx convex run _migrations/2026_05_22_addOrgSettingsDashboardAndTrash:run
 */
import { internalMutation } from "../_generated/server";
import { getTemplate } from "../crm/fields/templates/registry";

const LEGACY_COLOR_NAMES = new Set(["Yellow", "Blue", "Green", "Pink", "Purple", "Gray"]);

export const run = internalMutation({
	args: {},
	handler: async (ctx) => {
		const orgs = await ctx.db.query("orgs").collect();
		const now = Date.now();
		let metricsBackfilled = 0;
		let colorCategoriesDeleted = 0;
		let colorCategoriesKept = 0;

		for (const org of orgs) {
			// ── Pass 1: dashboardMetrics ───────────────────────────────
			const existingMetrics = org.settings?.dashboardMetrics;
			if (org.industry && (!existingMetrics || existingMetrics.length === 0)) {
				const tpl = getTemplate(org.industry);
				if (tpl?.dashboardMetrics && tpl.dashboardMetrics.length > 0) {
					await ctx.db.patch(org._id, {
						settings: {
							...(org.settings ?? {}),
							dashboardMetrics: [...tpl.dashboardMetrics],
						},
						updatedAt: now,
					});
					metricsBackfilled += 1;
				}
			}

			// ── Pass 2: cleanup unreferenced legacy color categories ──
			const cats = await ctx.db
				.query("noteCategories")
				.withIndex("by_org_and_position", (q) => q.eq("orgId", org._id))
				.collect();
			const legacyCats = cats.filter((c) => LEGACY_COLOR_NAMES.has(c.name));
			for (const cat of legacyCats) {
				const referencingNote = await ctx.db
					.query("notes")
					.withIndex("by_org_and_category", (q) =>
						q.eq("orgId", org._id).eq("categoryId", cat._id),
					)
					.first();
				if (referencingNote) {
					colorCategoriesKept += 1;
					continue;
				}
				// Don't delete the only remaining default category — that
				// breaks new-note creation. If a default color category is
				// the last one standing, archive it instead.
				if (cat.isDefault) {
					const otherDefaults = cats.filter(
						(c) => c.isDefault && !c.isArchived && c._id !== cat._id,
					);
					if (otherDefaults.length === 0) {
						await ctx.db.patch(cat._id, {
							isArchived: true,
							updatedAt: now,
						});
						colorCategoriesKept += 1;
						continue;
					}
				}
				await ctx.db.delete(cat._id);
				colorCategoriesDeleted += 1;
			}
		}

		return {
			metricsBackfilled,
			colorCategoriesDeleted,
			colorCategoriesKept,
			orgsScanned: orgs.length,
		};
	},
});

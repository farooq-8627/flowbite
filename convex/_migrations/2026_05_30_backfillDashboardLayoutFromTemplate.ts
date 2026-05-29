/**
 * convex/_migrations/2026_05_30_backfillDashboardLayoutFromTemplate.ts
 *
 * Backfill `org.settings.dashboardLayout` for every org whose
 * industry-template carries (today) a `dashboardLayout` blob but whose
 * org row was seeded BEFORE Stage 4 of `/DASHBOARD-V2-PLAN.md`
 * (2026-05-29) shipped the layout-aware renderer.
 *
 * Why this migration exists
 * ─────────────────────────
 * Stage 4 added a hero + per-panel-span layout descriptor to every
 * built-in template that ships with one (B2B SaaS, Real Estate
 * (Global), Freelancer, Productivity). Templates were updated in
 * lockstep, so brand-new orgs onboarded after that date pick the
 * layout up via `setupWorkspaceFromTemplate` automatically.
 *
 * Two layers of drift block the legacy orgs from seeing the layout:
 *
 *   1. **`org.settings.dashboardLayout` is undefined.** The original
 *      onboarding seeder (pre-Stage-4) didn't copy the template's
 *      `dashboardLayout` slot onto `org.settings`. The
 *      `<DashboardHomeView>` 3-tier resolver therefore falls back to
 *      the legacy fixed-grid path for them.
 *
 *   2. **The DB `platformTemplates` row's `definition.dashboardLayout`
 *      is also undefined.** The seed migration
 *      `_migrations/2026_05_27_seedIndustryTemplatesIntoDB.ts` ran two
 *      days BEFORE Stage 4 added `dashboardLayout` to the TS
 *      templates. The seed migration is idempotent (skips existing
 *      rows by `templateKey`), so the new layout never reflowed into
 *      the seeded rows. This affects BOTH canonical built-in rows
 *      (`b2b-saas`, `productivity`, etc.) AND the 5 visible / 6
 *      invisible alias rows that were cloned from those parents at
 *      seed time.
 *
 *   3. **`org.industry` may already be an alias key** (e.g.
 *      `b2b-saas-enterprise`, `productivity-solo`, `dubai-real-estate`)
 *      that resolves to a canonical parent. The DB row exists for the
 *      alias, but it inherited the parent's drifted definition.
 *
 * Resolution strategy (3-tier per source, first hit wins)
 * ───────────────────────────────────────────────────────
 *
 *   1. **DB row of `org.industry` carries `dashboardLayout`** → use it.
 *      Covers: future canonical rows that get re-seeded; custom
 *      owner-created templates (`isBuiltIn: false`) that opt in.
 *
 *   2. **`org.industry` is a known canonical built-in key** → use
 *      `BUILT_IN_TEMPLATES[<key>].dashboardLayout`. Covers: orgs whose
 *      industry is the canonical key but whose DB row is drifted.
 *
 *   3. **`org.industry` is a known alias key** → resolve to the parent
 *      via the same alias map the seed migration shipped, then use
 *      `BUILT_IN_TEMPLATES[<parentKey>].dashboardLayout`. Covers:
 *      orgs onboarded onto a sub-niche / legacy id (e.g.
 *      `b2b-saas-enterprise`, `productivity-solo`,
 *      `dubai-real-estate`).
 *
 * The TS templates (`BUILT_IN_TEMPLATES`) are the deployment-time
 * source of truth — preferring them over potentially-stale DB rows
 * means the migration "just works" even when the seed migration is
 * out of date. Owner-customised DB rows still win (path 1) because
 * they reflect deliberate post-seed edits.
 *
 * Idempotency
 * ───────────
 * Re-runnable: a second pass finds every targeted slot already filled
 * and reports `patched: 0`. Safe to run after each release.
 *
 * Defence-in-depth
 * ────────────────
 * Each candidate `dashboardLayout` blob is re-validated through
 * `validateDashboardLayoutShape` (the SSOT validator used by the
 * runtime renderer + the AI's `update_dashboard_layout` tool). Any
 * blob that references a widget key that's been removed since the
 * template was authored is reported under `skipped` (reason
 * `layout-invalid`) so the user can triage in the owner panel.
 *
 * Trigger
 * ───────
 *   Dry-run preview (no writes):
 *     npx convex run _migrations/2026_05_30_backfillDashboardLayoutFromTemplate:run '{"dryRun": true}'
 *
 *   Real run (writes):
 *     npx convex run _migrations/2026_05_30_backfillDashboardLayoutFromTemplate:run '{}'
 *
 *   Limit to a single org (handy for staged rollouts):
 *     npx convex run _migrations/2026_05_30_backfillDashboardLayoutFromTemplate:run '{"orgId":"<id>"}'
 */

import { v } from "convex/values";
import { internalMutation } from "../_generated/server";
import { BUILT_IN_TEMPLATES } from "../_platform/industries/builtIns";
import { validateDashboardLayoutShape } from "../_shared/widgetRegistry";

/**
 * Alias-key → canonical-built-in-key map.
 *
 * Mirrors the `VISIBLE_ALIAS_SEEDS` + `INVISIBLE_ALIAS_SEEDS` arrays in
 * `_migrations/2026_05_27_seedIndustryTemplatesIntoDB.ts`. Kept as a
 * literal here (rather than imported) because the seed migration's
 * arrays are local consts not exported, and re-deriving them via DB
 * lookups would re-introduce the staleness this migration is trying
 * to bypass.
 *
 * Whenever a new alias row is added in the seed migration, append the
 * matching entry here too.
 */
const ALIAS_TO_PARENT: Record<string, string> = {
	// Visible sub-niche aliases.
	"b2b-saas-early-stage": "b2b-saas",
	"b2b-saas-enterprise": "b2b-saas",
	solo: "productivity",
	student: "productivity",
	"side-project": "productivity",
	// Invisible back-compat aliases (legacy `org.industry` strings).
	"dubai-real-estate": "real-estate-dubai",
	"real-estate": "real-estate-global",
	"productivity-solo": "productivity",
	"productivity-student": "productivity",
	"productivity-side-project": "productivity",
	other: "generic",
};

type LayoutSource = "db-row" | "builtin-canonical" | "builtin-via-alias";

type Sample = {
	orgSlug: string;
	industry: string;
	resolvedTemplateKey: string;
	source: LayoutSource;
	hero?: string;
	panelCount: number;
	rejectedKeys: string[];
};

type Skip = {
	orgSlug: string;
	industry: string | null;
	reason:
		| "no-industry"
		| "soft-deleted"
		| "template-not-found"
		| "template-archived"
		| "no-layout-anywhere"
		| "layout-already-set"
		| "layout-invalid";
	detail?: string;
};

export const run = internalMutation({
	args: {
		dryRun: v.optional(v.boolean()),
		orgId: v.optional(v.id("orgs")),
	},
	handler: async (ctx, args) => {
		const dryRun = args.dryRun === true;
		const now = Date.now();

		const orgs = args.orgId
			? [await ctx.db.get(args.orgId)].filter((o): o is NonNullable<typeof o> => !!o)
			: await ctx.db.query("orgs").collect();

		let scanned = 0;
		let patched = 0;
		let unchanged = 0;
		const samples: Sample[] = [];
		const skipped: Skip[] = [];

		for (const org of orgs) {
			scanned += 1;

			if (org.deletedAt !== undefined) {
				skipped.push({
					orgSlug: org.slug,
					industry: org.industry ?? null,
					reason: "soft-deleted",
				});
				continue;
			}

			// Owner already customised — never overwrite. Idempotency lives here.
			if (org.settings?.dashboardLayout !== undefined) {
				unchanged += 1;
				skipped.push({
					orgSlug: org.slug,
					industry: org.industry ?? null,
					reason: "layout-already-set",
				});
				continue;
			}

			if (!org.industry) {
				skipped.push({
					orgSlug: org.slug,
					industry: null,
					reason: "no-industry",
				});
				continue;
			}

			const templateRow = await ctx.db
				.query("platformTemplates")
				.withIndex("by_templateKey", (q) => q.eq("templateKey", org.industry as string))
				.unique();
			if (!templateRow) {
				skipped.push({
					orgSlug: org.slug,
					industry: org.industry,
					reason: "template-not-found",
				});
				continue;
			}
			if (templateRow.isArchived) {
				skipped.push({
					orgSlug: org.slug,
					industry: org.industry,
					reason: "template-archived",
				});
				continue;
			}

			// ── 3-tier layout resolution per source ───────────────────────
			//   1. DB row carries dashboardLayout (custom templates, re-seeded canonical rows).
			//   2. industry is a canonical built-in key → use BUILT_IN_TEMPLATES.
			//   3. industry is an alias → resolve parent → use BUILT_IN_TEMPLATES.
			let candidate: unknown;
			let source: LayoutSource | undefined;
			let resolvedTemplateKey = templateRow.templateKey;

			const dbLayout = (templateRow.definition as { dashboardLayout?: unknown })
				.dashboardLayout;
			if (dbLayout !== undefined) {
				candidate = dbLayout;
				source = "db-row";
			} else if (BUILT_IN_TEMPLATES[templateRow.templateKey]?.dashboardLayout !== undefined) {
				candidate = BUILT_IN_TEMPLATES[templateRow.templateKey]?.dashboardLayout;
				source = "builtin-canonical";
			} else {
				const parentKey = ALIAS_TO_PARENT[templateRow.templateKey];
				if (parentKey && BUILT_IN_TEMPLATES[parentKey]?.dashboardLayout !== undefined) {
					candidate = BUILT_IN_TEMPLATES[parentKey]?.dashboardLayout;
					source = "builtin-via-alias";
					resolvedTemplateKey = parentKey;
				}
			}

			if (candidate === undefined || source === undefined) {
				skipped.push({
					orgSlug: org.slug,
					industry: org.industry,
					reason: "no-layout-anywhere",
				});
				continue;
			}

			// Validate via the SSOT shape checker — drops unknown widget
			// keys (reported via `rejected`) and rejects structural errors.
			const validation = validateDashboardLayoutShape(candidate);
			if (!validation.valid) {
				const first = validation.errors[0];
				skipped.push({
					orgSlug: org.slug,
					industry: org.industry,
					reason: "layout-invalid",
					detail: first ? `${first.path}: ${first.message}` : "shape validation failed",
				});
				continue;
			}

			if (samples.length < 10) {
				samples.push({
					orgSlug: org.slug,
					industry: org.industry,
					resolvedTemplateKey,
					source,
					...(validation.layout.hero !== undefined && { hero: validation.layout.hero }),
					panelCount: validation.layout.panels.length,
					rejectedKeys: validation.rejected,
				});
			}

			if (!dryRun) {
				await ctx.db.patch(org._id, {
					settings: {
						...(org.settings ?? {}),
						dashboardLayout: validation.layout,
					},
					updatedAt: now,
				});
			}
			patched += 1;
		}

		return {
			dryRun,
			scanned,
			patched,
			unchanged,
			skippedCount: skipped.length,
			samples,
			skipped: skipped.slice(0, 20),
		};
	},
});

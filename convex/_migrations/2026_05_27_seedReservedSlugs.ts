/**
 * Seed migration: reserved slugs → DB.
 *
 * Stage 1 of INDUSTRY-TEMPLATES-DB-MIGRATION.md (locked decision L9).
 *
 * Ports every entry of the static `RESERVED_SLUGS` Set in
 * `convex/_shared/reservedSlugs.ts` into the new
 * `platformReservedSlugs` table as `{ category: "org", isBuiltIn: true }`.
 * Also seeds the 9 built-in templateKeys (category "template") and 7
 * built-in groupKeys (category "industryGroup") so admin-created
 * templates can never collide with the canonical set.
 *
 * Idempotent: re-running inserts 0 (skip-if-exists by `(category, slug)`).
 *
 * Usage:
 *   npx convex run _migrations/2026_05_27_seedReservedSlugs:run '{}'
 */

import { v } from "convex/values";
import { internalMutation } from "../_generated/server";
import { RESERVED_SLUGS } from "../_shared/reservedSlugs";

// Built-in template + group keys — kept in sync with §6.1 of the spec.
// If a new built-in template is added, extend both arrays here AND
// `_migrations/2026_05_27_seedIndustryTemplatesIntoDB.ts`.

const BUILT_IN_TEMPLATE_KEYS = [
	"real-estate-dubai",
	"real-estate-saudi",
	"real-estate-global",
	"b2b-saas",
	"productivity",
	"freelancer",
	"agency-freelance",
	"recruiting",
	"generic",
	// Visible sub-niche aliases (also reserved so admin can't re-use).
	"b2b-saas-early-stage",
	"b2b-saas-enterprise",
	"solo",
	"student",
	"side-project",
	// Invisible back-compat aliases.
	"dubai-real-estate",
	"real-estate",
	"productivity-solo",
	"productivity-student",
	"productivity-side-project",
	"other",
];

const BUILT_IN_GROUP_KEYS = [
	"real-estate",
	"b2b-saas",
	"productivity",
	"freelancer",
	"agency",
	"recruiting",
	"generic",
];

type Category = "org" | "template" | "industryGroup" | "entitySlug" | "route";

export const run = internalMutation({
	args: {
		dryRun: v.optional(v.boolean()),
	},
	handler: async (ctx, args) => {
		const now = Date.now();
		const dryRun = args.dryRun === true;
		const report = {
			orgInserted: 0,
			orgSkipped: 0,
			templateInserted: 0,
			templateSkipped: 0,
			groupInserted: 0,
			groupSkipped: 0,
		};

		// ── Pass 1: every static org slug ──────────────────────────
		for (const raw of RESERVED_SLUGS) {
			const slug = raw.toLowerCase();
			const dup = await findExisting(ctx, "org", slug);
			if (dup) {
				report.orgSkipped += 1;
				continue;
			}
			if (!dryRun) {
				await insertReserved(ctx, slug, "org", now, "Built-in static reservation");
			}
			report.orgInserted += 1;
		}

		// ── Pass 2: built-in templateKeys ──────────────────────────
		for (const key of BUILT_IN_TEMPLATE_KEYS) {
			const slug = key.toLowerCase();
			const dup = await findExisting(ctx, "template", slug);
			if (dup) {
				report.templateSkipped += 1;
				continue;
			}
			if (!dryRun) {
				await insertReserved(ctx, slug, "template", now, "Built-in industry template");
			}
			report.templateInserted += 1;
		}

		// ── Pass 3: built-in groupKeys ─────────────────────────────
		for (const key of BUILT_IN_GROUP_KEYS) {
			const slug = key.toLowerCase();
			const dup = await findExisting(ctx, "industryGroup", slug);
			if (dup) {
				report.groupSkipped += 1;
				continue;
			}
			if (!dryRun) {
				await insertReserved(ctx, slug, "industryGroup", now, "Built-in industry group");
			}
			report.groupInserted += 1;
		}

		return report;
	},
});

async function findExisting(
	// biome-ignore lint/suspicious/noExplicitAny: MutationCtx db; loosened to keep the seed file portable.
	ctx: { db: any },
	category: Category,
	slug: string,
): Promise<boolean> {
	const existing = await ctx.db
		.query("platformReservedSlugs")
		// biome-ignore lint/suspicious/noExplicitAny: index callback q is loose-typed under the same shim.
		.withIndex("by_category_slug", (q: any) => q.eq("category", category).eq("slug", slug))
		.unique();
	return existing !== null;
}

async function insertReserved(
	// biome-ignore lint/suspicious/noExplicitAny: MutationCtx db; loosened to keep the seed file portable.
	ctx: { db: any },
	slug: string,
	category: Category,
	now: number,
	reason: string,
): Promise<void> {
	await ctx.db.insert("platformReservedSlugs", {
		slug,
		category,
		reason,
		isBuiltIn: true,
		createdAt: now,
		updatedAt: now,
	});
}

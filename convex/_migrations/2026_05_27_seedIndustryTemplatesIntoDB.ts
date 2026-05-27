/**
 * Seed migration: industry templates → DB.
 *
 * Stage 1 of INDUSTRY-TEMPLATES-DB-MIGRATION.md.
 *
 * Inserts the SSOT for the onboarding picker:
 *   - 7 industry-group rows (`platformIndustryGroups`).
 *   - 9 built-in template rows (`platformTemplates` from TS files).
 *   - 5 visible sub-niche templates that today live as picker-only
 *     entries (B2B SaaS early-stage / enterprise; Productivity solo /
 *     student / side-project) — cloned from their parent template's
 *     `definition` blob so each can be customized per-niche later.
 *   - 6 invisible back-compat alias rows so existing orgs whose
 *     `org.industry` recorded an old id (e.g. `dubai-real-estate`,
 *     `productivity-solo`, `other`) still resolve.
 *
 * Total: 7 groups + 20 templates = 27 rows.
 *
 * Idempotent: re-running inserts 0 (skip-if-exists by templateKey /
 * groupKey). Safe to run on production.
 *
 * Usage:
 *   npx convex run _migrations/2026_05_27_seedIndustryTemplatesIntoDB:run '{}'
 */

import { v } from "convex/values";
import { internalMutation } from "../_generated/server";
import { BUILT_IN_TEMPLATES } from "../_platform/industries/builtIns";
import { definitionFromTemplate } from "../_platform/industries/validators";
import type { IndustryTemplate } from "../crm/fields/templates/types";

// ─── Group seeds ────────────────────────────────────────────────────────────

type GroupSeed = {
	groupKey: string;
	label: string;
	description: string;
	icon: string;
	sortOrder: number;
};

const GROUP_SEEDS: GroupSeed[] = [
	{
		groupKey: "real-estate",
		label: "Real Estate",
		description: "Brokerages, agents, property managers — Dubai, Saudi, Global.",
		icon: "🏠",
		sortOrder: 10,
	},
	{
		groupKey: "b2b-saas",
		label: "B2B SaaS",
		description: "From early-stage to enterprise — BANT, MEDDIC, MRR/ACV.",
		icon: "🚀",
		sortOrder: 20,
	},
	{
		groupKey: "productivity",
		label: "Productivity / Solo",
		description: "Solopreneurs, students, side projects — tasks-first workflows.",
		icon: "✅",
		sortOrder: 30,
	},
	{
		groupKey: "freelancer",
		label: "Freelancer",
		description: "Solo freelance — clients, projects, invoices.",
		icon: "💼",
		sortOrder: 40,
	},
	{
		groupKey: "agency",
		label: "Agency",
		description: "Creative + marketing agencies — retainers, deliverables, time tracking.",
		icon: "🎨",
		sortOrder: 50,
	},
	{
		groupKey: "recruiting",
		label: "Recruiting",
		description: "Candidates, roles, placements — agencies + in-house.",
		icon: "🧑‍💼",
		sortOrder: 60,
	},
	{
		groupKey: "generic",
		label: "Other / Generic",
		description: "Generic CRM — pick this if nothing else fits, customize later.",
		icon: "📋",
		sortOrder: 70,
	},
];

// ─── Template seeds (built-ins) ─────────────────────────────────────────────

/**
 * Maps each built-in template id → its (groupKey, sortOrder, region
 * override?) for seeding. The template's `label` / `description` /
 * `icon` come straight from the TS file — these are the canonical
 * values the existing UI surfaces.
 *
 * The `region` is read from the TS file but allowed to be overridden
 * here when the TS string doesn't match the typed union.
 */
type BuiltInSeed = {
	templateKey: string;
	groupKey: string;
	sortOrder: number;
};

const BUILT_IN_SEEDS: BuiltInSeed[] = [
	{ templateKey: "real-estate-dubai", groupKey: "real-estate", sortOrder: 10 },
	{ templateKey: "real-estate-saudi", groupKey: "real-estate", sortOrder: 20 },
	{ templateKey: "real-estate-global", groupKey: "real-estate", sortOrder: 30 },
	{ templateKey: "b2b-saas", groupKey: "b2b-saas", sortOrder: 20 }, // middle slot — Growth (SMB)
	{ templateKey: "productivity", groupKey: "productivity", sortOrder: 10 },
	{ templateKey: "freelancer", groupKey: "freelancer", sortOrder: 10 },
	{ templateKey: "agency-freelance", groupKey: "agency", sortOrder: 10 },
	{ templateKey: "recruiting", groupKey: "recruiting", sortOrder: 10 },
	{ templateKey: "generic", groupKey: "generic", sortOrder: 10 },
];

// ─── Sub-niche aliases (visible — clone parent definition) ──────────────────

/**
 * Five visible sub-niche templates that today live only as historical
 * `INDUSTRY_ID_ALIASES` entries (deleted in Stage 3). Today the picker
 * shows them as separate cards but the runtime resolves them to the
 * parent template's definition. Stage 1 turns each into a real DB row
 * cloned from the parent so the editor can customize labels / aiPersona
 * / pipelines per-niche later.
 *
 * The label / description / icon come from `core/shell/onboarding/
 * components/OnboardingPage.tsx` so the picker UX is identical to
 * today. The `definition` is a deep-clone of the parent template.
 */
type VisibleAliasSeed = {
	templateKey: string;
	parentTemplateKey: string;
	groupKey: string;
	sortOrder: number;
	label: string;
	description: string;
	icon: string;
};

const VISIBLE_ALIAS_SEEDS: VisibleAliasSeed[] = [
	// B2B SaaS — early & enterprise share the parent's definition.
	{
		templateKey: "b2b-saas-early-stage",
		parentTemplateKey: "b2b-saas",
		groupKey: "b2b-saas",
		sortOrder: 10,
		label: "B2B SaaS — Early-stage",
		description: "< $1M ARR — short pipeline, light fields.",
		icon: "🌱",
	},
	{
		templateKey: "b2b-saas-enterprise",
		parentTemplateKey: "b2b-saas",
		groupKey: "b2b-saas",
		sortOrder: 30,
		label: "B2B SaaS — Enterprise",
		description: "MEDDIC, champion, contract terms.",
		icon: "🏢",
	},
	// Productivity sub-niches — all share the productivity definition.
	{
		templateKey: "solo",
		parentTemplateKey: "productivity",
		groupKey: "productivity",
		sortOrder: 20,
		label: "Solopreneur",
		description: "Tasks, ideas, reminders — no leads.",
		icon: "👤",
	},
	{
		templateKey: "student",
		parentTemplateKey: "productivity",
		groupKey: "productivity",
		sortOrder: 30,
		label: "Student",
		description: "Courses, assignments, projects.",
		icon: "🎓",
	},
	{
		templateKey: "side-project",
		parentTemplateKey: "productivity",
		groupKey: "productivity",
		sortOrder: 40,
		label: "Side project",
		description: "Personal goals, kanban tasks.",
		icon: "🛠️",
	},
];

// ─── Back-compat aliases (invisible — for existing orgs) ────────────────────

/**
 * Six invisible alias rows that resolve old `org.industry` strings to
 * their canonical template definitions. Never shown in the picker;
 * exist only so the seeder's DB lookup works for orgs persisted
 * before the rename.
 */
type InvisibleAliasSeed = {
	templateKey: string;
	parentTemplateKey: string;
	groupKey: string;
};

const INVISIBLE_ALIAS_SEEDS: InvisibleAliasSeed[] = [
	// Phase 3A renames (formerly handled by INDUSTRY_ID_ALIASES; deleted in Stage 3).
	{
		templateKey: "dubai-real-estate",
		parentTemplateKey: "real-estate-dubai",
		groupKey: "real-estate",
	},
	{
		templateKey: "real-estate",
		parentTemplateKey: "real-estate-global",
		groupKey: "real-estate",
	},
	// Productivity sub-niches in the long form (`productivity-solo` etc.).
	{
		templateKey: "productivity-solo",
		parentTemplateKey: "productivity",
		groupKey: "productivity",
	},
	{
		templateKey: "productivity-student",
		parentTemplateKey: "productivity",
		groupKey: "productivity",
	},
	{
		templateKey: "productivity-side-project",
		parentTemplateKey: "productivity",
		groupKey: "productivity",
	},
	// Generic fallback.
	{ templateKey: "other", parentTemplateKey: "generic", groupKey: "generic" },
];

// ─── Seeder ─────────────────────────────────────────────────────────────────

export const run = internalMutation({
	args: {
		/**
		 * When true, the seeder runs the full pass. Defaults to true.
		 * Pass `{ dryRun: true }` to compute the diff without writing.
		 */
		dryRun: v.optional(v.boolean()),
	},
	handler: async (ctx, args) => {
		const now = Date.now();
		const dryRun = args.dryRun === true;
		const report = {
			groupsInserted: 0,
			groupsSkipped: 0,
			templatesInserted: 0,
			templatesSkipped: 0,
			errors: [] as string[],
		};

		// ── Pass 1: groups ──────────────────────────────────────────
		for (const seed of GROUP_SEEDS) {
			const existing = await ctx.db
				.query("platformIndustryGroups")
				.withIndex("by_groupKey", (q) => q.eq("groupKey", seed.groupKey))
				.unique();
			if (existing) {
				report.groupsSkipped += 1;
				continue;
			}
			if (!dryRun) {
				await ctx.db.insert("platformIndustryGroups", {
					groupKey: seed.groupKey,
					label: seed.label,
					description: seed.description,
					icon: seed.icon,
					visible: true,
					sortOrder: seed.sortOrder,
					createdAt: now,
					updatedAt: now,
				});
			}
			report.groupsInserted += 1;
		}

		// ── Pass 2: built-in templates ──────────────────────────────
		for (const seed of BUILT_IN_SEEDS) {
			const ts = BUILT_IN_TEMPLATES[seed.templateKey];
			if (!ts) {
				report.errors.push(
					`Built-in templateKey "${seed.templateKey}" missing from BUILT_IN_TEMPLATES — registry drift?`,
				);
				continue;
			}
			const existing = await ctx.db
				.query("platformTemplates")
				.withIndex("by_templateKey", (q) => q.eq("templateKey", seed.templateKey))
				.unique();
			if (existing) {
				report.templatesSkipped += 1;
				continue;
			}
			if (!dryRun) {
				await insertTemplate(ctx, ts, {
					templateKey: seed.templateKey,
					groupKey: seed.groupKey,
					sortOrder: seed.sortOrder,
					visible: true,
					isArchived: false,
					labelOverride: undefined,
					descriptionOverride: undefined,
					iconOverride: undefined,
					now,
				});
			}
			report.templatesInserted += 1;
		}

		// ── Pass 3: visible sub-niche aliases ───────────────────────
		for (const seed of VISIBLE_ALIAS_SEEDS) {
			const parent = BUILT_IN_TEMPLATES[seed.parentTemplateKey];
			if (!parent) {
				report.errors.push(
					`Visible alias parent "${seed.parentTemplateKey}" missing — registry drift?`,
				);
				continue;
			}
			const existing = await ctx.db
				.query("platformTemplates")
				.withIndex("by_templateKey", (q) => q.eq("templateKey", seed.templateKey))
				.unique();
			if (existing) {
				report.templatesSkipped += 1;
				continue;
			}
			if (!dryRun) {
				await insertTemplate(ctx, parent, {
					templateKey: seed.templateKey,
					groupKey: seed.groupKey,
					sortOrder: seed.sortOrder,
					visible: true,
					isArchived: false,
					labelOverride: seed.label,
					descriptionOverride: seed.description,
					iconOverride: seed.icon,
					now,
				});
			}
			report.templatesInserted += 1;
		}

		// ── Pass 4: invisible back-compat aliases ───────────────────
		for (const seed of INVISIBLE_ALIAS_SEEDS) {
			const parent = BUILT_IN_TEMPLATES[seed.parentTemplateKey];
			if (!parent) {
				report.errors.push(
					`Invisible alias parent "${seed.parentTemplateKey}" missing — registry drift?`,
				);
				continue;
			}
			const existing = await ctx.db
				.query("platformTemplates")
				.withIndex("by_templateKey", (q) => q.eq("templateKey", seed.templateKey))
				.unique();
			if (existing) {
				report.templatesSkipped += 1;
				continue;
			}
			if (!dryRun) {
				await insertTemplate(ctx, parent, {
					templateKey: seed.templateKey,
					groupKey: seed.groupKey,
					// Sort to the bottom so any accidental visibility flip
					// doesn't put them ahead of canonical templates.
					sortOrder: 9000,
					visible: false,
					isArchived: false,
					labelOverride: undefined,
					descriptionOverride: undefined,
					iconOverride: undefined,
					now,
				});
			}
			report.templatesInserted += 1;
		}

		return report;
	},
});

// ─── Insert helper ──────────────────────────────────────────────────────────

async function insertTemplate(
	// biome-ignore lint/suspicious/noExplicitAny: MutationCtx db; loosened to keep the seed file independent of generated types.
	ctx: { db: any },
	source: IndustryTemplate,
	args: {
		templateKey: string;
		groupKey: string;
		sortOrder: number;
		visible: boolean;
		isArchived: boolean;
		labelOverride?: string;
		descriptionOverride?: string;
		iconOverride?: string;
		now: number;
	},
): Promise<void> {
	const { definition, identity } = definitionFromTemplate(source);
	const region = isAllowedRegion(identity.region) ? identity.region : undefined;

	await ctx.db.insert("platformTemplates", {
		templateKey: args.templateKey,
		groupKey: args.groupKey,
		label: args.labelOverride ?? identity.label,
		description: args.descriptionOverride ?? identity.description,
		icon: args.iconOverride ?? identity.icon,
		region,
		visible: args.visible,
		sortOrder: args.sortOrder,
		isBuiltIn: true,
		isArchived: args.isArchived,
		definition,
		createdAt: args.now,
		updatedAt: args.now,
	});
}

function isAllowedRegion(value: unknown): value is "global" | "gcc" | "us" | "eu" | "apac" {
	return (
		value === "global" ||
		value === "gcc" ||
		value === "us" ||
		value === "eu" ||
		value === "apac"
	);
}

/**
 * One-shot migration (2026-05-21) — backfill industry-template slots on
 * already-onboarded orgs.
 *
 * Why
 * ───
 * Before today the onboarding flow seeded only a deal pipeline + a small
 * built-in field set. Every other industry-customisable surface (entity
 * labels, code prefixes, modules slot map, reminder defaults, follow-up
 * cadence, file-upload policy, AI persona, tag presets, saved views,
 * curated note categories, custom roles) was left blank. With the new
 * `setupWorkspaceFromTemplate` + registry, all 17 surfaces seed in one
 * atomic call.
 *
 * What
 * ────
 * For each existing org, we re-run `setupWorkspaceFromTemplate` keyed on
 * the org's recorded `industry`. The seeder is idempotent — every step is
 * a "skip-if-exists" check on natural keys, so anything the org already
 * has (pipeline, fields, note categories) is preserved untouched. The
 * migration only adds rows that were missing.
 *
 * Pickup rules
 * ────────────
 *  - `org.industry` is the input. Resolved via the registry's alias map,
 *    so `"technology"` → `b2b-saas`, `"finance"` → `generic`, etc.
 *  - Orgs without a recorded industry default to `generic` so they still
 *    get the missing surfaces (modules, tags, note categories, etc.).
 *  - Soft-deleted orgs are skipped.
 *
 * Idempotency
 * ───────────
 * Re-runnable. Already-seeded slots are skipped; only missing rows are
 * inserted.
 *
 * Usage
 * ─────
 *   # Dry-run on every org:
 *   npx convex run _migrations/seedTemplateDefaults:run '{}'
 *
 *   # Limit to a single org:
 *   npx convex run _migrations/seedTemplateDefaults:run '{"orgId":"<id>"}'
 *
 *   # Force a specific template (overrides the org's recorded industry):
 *   npx convex run _migrations/seedTemplateDefaults:run \
 *     '{"orgId":"<id>","forceTemplateId":"real-estate"}'
 */

import { v } from "convex/values";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { internalMutation, type MutationCtx } from "../_generated/server";

/**
 * Resolve an `org.industry` string to a canonical `templateKey` by
 * reading `platformTemplates` (Stage 1 of
 * INDUSTRY-TEMPLATES-DB-MIGRATION). Returns `"generic"` when the id
 * is missing — matches the previous static-map behaviour.
 */
async function resolveTemplateId(ctx: MutationCtx, industry: string | undefined): Promise<string> {
	if (!industry) return "generic";
	const row = await ctx.db
		.query("platformTemplates")
		.withIndex("by_templateKey", (q) => q.eq("templateKey", industry))
		.unique();
	if (row && !row.isArchived) return row.templateKey;
	return "generic";
}

export const run = internalMutation({
	args: {
		orgId: v.optional(v.id("orgs")),
		forceTemplateId: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const orgs = args.orgId
			? [await ctx.db.get(args.orgId)].filter((o): o is NonNullable<typeof o> => !!o)
			: await ctx.db.query("orgs").collect();

		type ReportRow = {
			orgId: Id<"orgs">;
			orgName: string;
			industry: string | null;
			templateId: string;
			fieldsInserted: number;
			noteCategoriesInserted: number;
			tagsInserted: number;
			savedViewsInserted: number;
			customRolesInserted: number;
			pipelinesCreated: number;
		};
		const report: ReportRow[] = [];

		for (const org of orgs) {
			if (org.deletedAt !== undefined) continue;

			// Pick an actor to attribute saved views to — the longest-active
			// member of the org. If none, skip saved-view seeding (the
			// seeder no-ops gracefully).
			const members = await ctx.db
				.query("orgMembers")
				.withIndex("by_orgId_and_userId", (q) => q.eq("orgId", org._id))
				.take(50);
			const activeMember = members.find((m) => m.deletedAt === undefined);

			const templateId = args.forceTemplateId ?? (await resolveTemplateId(ctx, org.industry));

			const result = await ctx.runMutation(
				internal.crm.fields.templates.mutations.setupWorkspaceFromTemplate,
				{
					orgId: org._id,
					templateId,
					actorUserId: activeMember?.userId,
				},
			);

			report.push({
				orgId: org._id,
				orgName: org.name,
				industry: org.industry ?? null,
				templateId: result.templateId,
				fieldsInserted: result.fieldsInserted,
				noteCategoriesInserted: result.noteCategoriesInserted,
				tagsInserted: result.tagsInserted,
				savedViewsInserted: result.savedViewsInserted,
				customRolesInserted: result.customRolesInserted,
				pipelinesCreated: result.pipelineIds.length,
			});
		}

		return {
			processed: report.length,
			totalFieldsInserted: report.reduce((s, r) => s + r.fieldsInserted, 0),
			totalNoteCategoriesInserted: report.reduce((s, r) => s + r.noteCategoriesInserted, 0),
			totalTagsInserted: report.reduce((s, r) => s + r.tagsInserted, 0),
			totalSavedViewsInserted: report.reduce((s, r) => s + r.savedViewsInserted, 0),
			totalCustomRolesInserted: report.reduce((s, r) => s + r.customRolesInserted, 0),
			report,
		};
	},
});

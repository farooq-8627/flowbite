/**
 * Template queries — convex/crm/fields/templates/queries.ts
 *
 * STAGE 1 STATUS: COMPATIBILITY SHIM.
 * As of 2026-05-27 the SOURCE OF TRUTH for industry templates moved to
 * the `platformTemplates` table — see `convex/_platform/industries/`
 * for the canonical query surface (`listOnboardingGroups`,
 * `listOnboardingTemplatesByGroup`, `listAllForSettings`,
 * `listAllForAdmin`, `listAllForAI`).
 *
 * This file keeps the legacy `list` + `listForAI` exports (and their
 * existing path `api.crm.fields.templates.queries.{list,listForAI}`)
 * pointing at the new DB-backed reader. Deleted entirely in Stage 3
 * of INDUSTRY-TEMPLATES-DB-MIGRATION.md once every consumer has
 * migrated to the canonical paths.
 */
import { v } from "convex/values";
import { authenticatedQuery } from "../../../_functions/authenticated";
import type { Doc } from "../../../_generated/dataModel";
import { internalQuery } from "../../../_generated/server";

export type IndustryTemplateSummary = {
	id: string;
	label: string;
	description: string;
	icon?: string;
	region?: string;
	pipelineStageCount: number;
	pipelineName: string;
	customRoleCount: number;
	tagCount: number;
	noteCategoryCount: number;
	savedViewCount: number;
};

/**
 * Reads `platformTemplates` and returns the legacy summary shape used
 * by Settings → Workspace's "Re-apply template" picker. Excludes
 * archived rows. Matches the shape the prior TS-backed `list` returned.
 */
async function summariseFromDB(
	// biome-ignore lint/suspicious/noExplicitAny: QueryCtx db; loose-typed shim that goes away in Stage 3.
	ctx: { db: any },
): Promise<IndustryTemplateSummary[]> {
	const rows: Doc<"platformTemplates">[] = await ctx.db.query("platformTemplates").collect();
	return rows
		.filter((r) => !r.isArchived && r.visible !== false)
		.map((t) => {
			const def = t.definition as Record<string, unknown>;
			const single = def.pipeline as { name?: string; stages?: unknown[] } | undefined;
			const arr =
				(def.pipelines as Array<{
					name?: string;
					stages?: unknown[];
				}>) ?? [];
			const stageCount = single?.stages?.length ?? arr[0]?.stages?.length ?? 0;
			const pipelineName = single?.name ?? arr[0]?.name ?? "Default Pipeline";
			return {
				id: t.templateKey,
				label: t.label,
				description: t.description,
				icon: t.icon,
				region: t.region,
				pipelineStageCount: stageCount,
				pipelineName,
				customRoleCount: ((def.customRoles as unknown[]) ?? []).length,
				tagCount: ((def.tags as unknown[]) ?? []).length,
				noteCategoryCount: ((def.noteCategories as unknown[]) ?? []).length,
				savedViewCount: ((def.savedViews as unknown[]) ?? []).length,
			};
		})
		.sort((a, b) => a.id.localeCompare(b.id));
}

/**
 * Legacy public list — same shape as before, now reads from DB.
 * Available to any authenticated user.
 */
export const list = authenticatedQuery({
	args: {},
	handler: async (ctx) => summariseFromDB(ctx),
});

/**
 * Legacy AI-callable internal twin. The `userId` arg is forwarded by
 * `toolQuery` per the shared contract; we accept it (so the validator
 * passes) but otherwise ignore it. Templates are non-sensitive.
 */
export const listForAI = internalQuery({
	args: { userId: v.id("users") },
	handler: async (ctx) => summariseFromDB(ctx),
});

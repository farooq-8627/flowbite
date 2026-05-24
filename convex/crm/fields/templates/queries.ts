/**
 * Template queries — convex/crm/fields/templates/queries.ts
 *
 * Public query exposing the registered industry templates to the client
 * (settings UI + onboarding picker). Returns only display-safe metadata —
 * field definitions, pipeline internals, AI persona text are NOT returned
 * here (they're applied via the seeder, never read by the client).
 */
import { v } from "convex/values";
import { authenticatedQuery } from "../../../_functions/authenticated";
import { internalQuery } from "../../../_generated/server";
import { listTemplates } from "./registry";

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

function listImpl(): IndustryTemplateSummary[] {
	return listTemplates().map((t) => {
		const stageCount =
			t.pipeline?.stages.length ??
			(t.pipelines && t.pipelines.length > 0 ? t.pipelines[0]!.stages.length : 0);
		return {
			id: t.id,
			label: t.label,
			description: t.description,
			icon: t.icon,
			region: t.region,
			pipelineStageCount: stageCount,
			pipelineName: t.pipeline?.name ?? t.pipelines?.[0]?.name ?? "Default Pipeline",
			customRoleCount: t.customRoles?.length ?? 0,
			tagCount: t.tags?.length ?? 0,
			noteCategoryCount: t.noteCategories?.length ?? 0,
			savedViewCount: t.savedViews?.length ?? 0,
		};
	});
}

/**
 * List every registered template as a display-friendly summary. Used by:
 *   - Settings → Workspace → Template section (re-apply / switch)
 *   - Future: AI tool descriptions
 *
 * Available to any authenticated user — the data is non-sensitive.
 */
export const list = authenticatedQuery({
	args: {},
	handler: async () => listImpl(),
});

/**
 * AI-callable internal twin. Templates are non-sensitive (purely
 * static data shipped with the codebase), so the twin doesn't even need
 * to validate org membership — it simply returns the list. The `userId`
 * arg is forwarded by `toolQuery` per the shared contract; we accept it
 * (so the validator passes) but otherwise ignore it.
 */
export const listForAI = internalQuery({
	args: { userId: v.id("users") },
	handler: async () => listImpl(),
});

/**
 * Template queries — convex/crm/fields/templates/queries.ts
 *
 * Public query exposing the registered industry templates to the client
 * (settings UI + onboarding picker). Returns only display-safe metadata —
 * field definitions, pipeline internals, AI persona text are NOT returned
 * here (they're applied via the seeder, never read by the client).
 */
import { authenticatedQuery } from "../../../_functions/authenticated";
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

/**
 * List every registered template as a display-friendly summary. Used by:
 *   - Settings → Workspace → Template section (re-apply / switch)
 *   - Future: AI tool descriptions
 *
 * Available to any authenticated user — the data is non-sensitive.
 */
export const list = authenticatedQuery({
	args: {},
	handler: async () => {
		const summaries: IndustryTemplateSummary[] = listTemplates().map((t) => {
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
		return summaries;
	},
});

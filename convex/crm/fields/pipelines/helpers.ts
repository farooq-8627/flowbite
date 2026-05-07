// @ts-nocheck — ctx.db is typed as any; index callback params are implicitly any
/**
 * Pipeline Helpers — convex/crm/fields/pipelines/helpers.ts
 *
 * Internal utilities used by pipelines mutations and deals mutations.
 * Not exported as Convex functions — pure helpers called from other functions.
 */
import type { Id } from "../../../_generated/dataModel";

/**
 * Get the first stage ID of a pipeline (used as default when creating a deal).
 * Returns undefined if pipeline has no stages.
 */
export async function getDefaultStageId(
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	ctx: { db: any },
	pipelineId: Id<"pipelines">,
): Promise<string | undefined> {
	const pipeline = await ctx.db.get(pipelineId);
	if (!pipeline || pipeline.stages.length === 0) return undefined;
	// Stages are ordered by their `order` field
	const sorted = [...pipeline.stages].sort((a: { order: number }, b: { order: number }) => a.order - b.order);
	return sorted[0].id;
}

/**
 * Validate that a stage transition is allowed.
 * Blocks final→final transitions (e.g., Won→Lost).
 * Returns an error message string, or null if transition is valid.
 */
export async function validateStageTransition(
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	ctx: { db: any },
	pipelineId: Id<"pipelines">,
	fromStageId: string,
	toStageId: string,
): Promise<string | null> {
	const pipeline = await ctx.db.get(pipelineId);
	if (!pipeline) return "Pipeline not found";

	const fromStage = pipeline.stages.find((s) => s.id === fromStageId);
	const toStage = pipeline.stages.find((s) => s.id === toStageId);

	if (!toStage) return "Target stage not found in pipeline";
	if (fromStage?.isFinal && toStage.isFinal) {
		return "Cannot move between final stages";
	}
	return null;
}

/**
 * Industry pipeline templates — used by onboarding to seed default pipelines.
 * Each template returns a pipeline name + stages array ready for insertion.
 */
export type PipelineTemplate = {
	name: string;
	entityType: string;
	stages: Array<{
		name: string;
		color: string;
		order: number;
		probability?: number;
		isFinal: boolean;
		finalType?: "positive" | "negative" | "neutral";
		staleAfterDays?: number;
	}>;
};

export const PIPELINE_TEMPLATES: Record<string, PipelineTemplate> = {
	b2b_sales: {
		name: "Sales Pipeline",
		entityType: "deal",
		stages: [
			{ name: "Prospecting", color: "#6366f1", order: 0, probability: 10, isFinal: false, staleAfterDays: 14 },
			{ name: "Qualified", color: "#8b5cf6", order: 1, probability: 25, isFinal: false, staleAfterDays: 14 },
			{ name: "Proposal Sent", color: "#a855f7", order: 2, probability: 50, isFinal: false, staleAfterDays: 7 },
			{ name: "Negotiation", color: "#d946ef", order: 3, probability: 75, isFinal: false, staleAfterDays: 7 },
			{ name: "Won", color: "#22c55e", order: 4, probability: 100, isFinal: true, finalType: "positive" },
			{ name: "Lost", color: "#ef4444", order: 5, probability: 0, isFinal: true, finalType: "negative" },
		],
	},
	freelancer: {
		name: "Client Pipeline",
		entityType: "deal",
		stages: [
			{ name: "Inquiry", color: "#6366f1", order: 0, isFinal: false, staleAfterDays: 7 },
			{ name: "Quote Sent", color: "#8b5cf6", order: 1, isFinal: false, staleAfterDays: 5 },
			{ name: "Accepted", color: "#a855f7", order: 2, isFinal: false, staleAfterDays: 14 },
			{ name: "Working", color: "#f59e0b", order: 3, isFinal: false, staleAfterDays: 21 },
			{ name: "Invoiced", color: "#3b82f6", order: 4, isFinal: false, staleAfterDays: 7 },
			{ name: "Complete", color: "#22c55e", order: 5, isFinal: true, finalType: "positive" },
			{ name: "Cancelled", color: "#ef4444", order: 6, isFinal: true, finalType: "negative" },
		],
	},
	productivity: {
		name: "Task Pipeline",
		entityType: "deal",
		stages: [
			{ name: "Todo", color: "#6366f1", order: 0, isFinal: false },
			{ name: "In Progress", color: "#f59e0b", order: 1, isFinal: false, staleAfterDays: 7 },
			{ name: "Review", color: "#8b5cf6", order: 2, isFinal: false, staleAfterDays: 3 },
			{ name: "Done", color: "#22c55e", order: 3, isFinal: true, finalType: "positive" },
			{ name: "Blocked", color: "#ef4444", order: 4, isFinal: true, finalType: "negative" },
		],
	},
};

/**
 * Seed a pipeline from a template.
 * Called during onboarding when an industry is selected.
 * Returns the stages array ready for ctx.db.insert("pipelines", { stages }).
 */
export function seedFromTemplate(
	templateKey: string,
): PipelineTemplate | undefined {
	return PIPELINE_TEMPLATES[templateKey];
}

/**
 * convex/ai/tools/layers/pipelines.ts
 *
 * Pipelines layer — expand_tools("pipelines") activates these.
 * Tools: move_deal_stage, close_deal, mark_deal_lost, change_deal_pipeline,
 *        create_pipeline, add_stage, reorder_stages, archive_pipeline.
 */
import { z } from "zod";
import { registerTool } from "../../toolRegistry";
import { propose, requirePermission, runTool, type ToolContext, toolMutation } from "../_shared";

let _ctx: ToolContext | null = null;
export function setPipelinesContext(c: ToolContext): void {
	_ctx = c;
}
function getCtx(): ToolContext {
	if (!_ctx) throw new Error("pipelines tool context not initialized");
	return _ctx;
}

registerTool({
	name: "move_deal_stage",
	layer: "pipelines",
	permission: "deals.changeStage",
	confirmation: "none",
	description:
		"Move a deal to a different pipeline stage. Use the stage code (e.g. 'NEG', 'WON').",
	runbook: {
		onSuccess: "Confirm in one short sentence with the new stage name.",
		onValidationError:
			"If the stageId doesn't exist on this pipeline, list the valid stages back to the user. Don't retry with the same id.",
		onPermissionDenied:
			"Tell the user they need deals.changeStage permission. Suggest contacting an admin.",
	},
	schema: z.object({
		dealId: z.string(),
		stageId: z.string().describe("Pipeline stage id."),
	}),
	execute: async (args) =>
		runTool(async () => {
			const { orgId, permissions } = getCtx();
			requirePermission(permissions, "deals.changeStage");
			const result = await toolMutation(
				getCtx(),
				"crm/entities/deals/mutations:moveToStage",
				{
					orgId,
					...args,
				},
			);
			return {
				ok: true as const,
				data: result,
				display: {
					kind: "entity" as const,
					entityType: "deal" as const,
					entityId: args.dealId,
				},
			};
		}),
});

registerTool({
	name: "close_deal",
	layer: "pipelines",
	permission: "deals.close",
	confirmation: "twoStep",
	description: "Close a deal as Won or Lost.",
	runbook: {
		onSuccess: "Confirm with the outcome and the deal's title in one short sentence.",
		onValidationError:
			"If outcome is missing, ask the user 'won or lost?' in plain text — don't use ask_user_choice for a 2-option question.",
	},
	schema: z.object({
		dealId: z.string(),
		outcome: z.enum(["won", "lost"]),
		reason: z.optional(z.string()),
	}),
	execute: async (args) => {
		const { permissions } = getCtx();
		requirePermission(permissions, "deals.close");
		return propose("close_deal", args, {
			title: `Close deal as ${args.outcome.toUpperCase()}`,
			fields: [
				{ label: "Deal", value: args.dealId },
				{ label: "Outcome", value: args.outcome },
				{ label: "Reason", value: args.reason ?? "—" },
			],
		});
	},
});

registerTool({
	name: "commit_close_deal",
	layer: "pipelines",
	permission: "deals.close",
	confirmation: "none",
	description: "Internal: commit pre-approved deal close.",
	schema: z.object({
		dealId: z.string(),
		outcome: z.enum(["won", "lost"]),
		reason: z.optional(z.string()),
	}),
	execute: async (args) =>
		runTool(async () => {
			const { orgId, permissions } = getCtx();
			requirePermission(permissions, "deals.close");
			const mutation =
				args.outcome === "won"
					? "crm/entities/deals/mutations:closeAsDone"
					: "crm/entities/deals/mutations:markAsLost";
			const result = await toolMutation(getCtx(), mutation, {
				orgId,
				dealId: args.dealId,
				reason: args.reason,
			});
			return {
				ok: true as const,
				data: result,
				display: {
					kind: "entity" as const,
					entityType: "deal" as const,
					entityId: args.dealId,
				},
			};
		}),
});

registerTool({
	name: "create_pipeline",
	layer: "pipelines",
	permission: "pipelines.manage",
	requiredCapability: "premium",
	confirmation: "twoStep",
	description: "Create a new pipeline with stages.",
	runbook: {
		onSuccess: "Confirm with the new pipeline's name and stage chain in one short sentence.",
		onValidationError:
			"Pipelines need 2-15 stages. If fewer/more were given, ask the user to refine.",
		onPermissionDenied:
			"Tell the user they need pipelines.manage permission. Suggest contacting an admin.",
	},
	schema: z.object({
		name: z.string(),
		entityType: z.enum(["lead", "deal"]).default("deal"),
		stages: z
			.array(z.object({ name: z.string(), code: z.string() }))
			.min(2)
			.max(15),
	}),
	execute: async (args) => {
		const { permissions } = getCtx();
		requirePermission(permissions, "pipelines.manage");
		return propose("create_pipeline", args, {
			title: `Create pipeline: ${args.name}`,
			fields: [
				{ label: "Name", value: args.name },
				{
					label: "Stages",
					value: args.stages.map((s: { name: string }) => s.name).join(" → "),
				},
			],
		});
	},
});

registerTool({
	name: "commit_create_pipeline",
	layer: "pipelines",
	permission: "pipelines.manage",
	confirmation: "none",
	description: "Internal: commit pipeline creation.",
	schema: z.object({
		name: z.string(),
		entityType: z.enum(["lead", "deal"]).default("deal"),
		stages: z.array(z.object({ name: z.string(), code: z.string() })),
	}),
	execute: async (args) =>
		runTool(async () => {
			const { orgId, permissions } = getCtx();
			requirePermission(permissions, "pipelines.manage");
			const result = await toolMutation(getCtx(), "crm/fields/pipelines/mutations:create", {
				orgId,
				...args,
			});
			return {
				ok: true as const,
				data: result,
				display: `✅ Pipeline "${args.name}" created.`,
			};
		}),
});

registerTool({
	name: "add_pipeline_stage",
	layer: "pipelines",
	permission: "pipelines.manage",
	confirmation: "twoStep",
	description: "Add a new stage to an existing pipeline.",
	runbook: {
		onSuccess: "Confirm with the new stage name and where it lives in the chain.",
		onValidationError:
			"If `code` collides with an existing stage code, ask the user for a different code.",
	},
	schema: z.object({
		pipelineId: z.string(),
		name: z.string(),
		code: z.string(),
		afterStageCode: z.optional(z.string()).describe("Insert after this stage."),
	}),
	execute: async (args) => {
		const { permissions } = getCtx();
		requirePermission(permissions, "pipelines.manage");
		return propose("add_pipeline_stage", args, {
			title: `Add stage: ${args.name}`,
			fields: [
				{ label: "Stage", value: args.name },
				{ label: "Code", value: args.code },
				{ label: "After", value: args.afterStageCode ?? "(end)" },
			],
		});
	},
});

registerTool({
	name: "commit_add_pipeline_stage",
	layer: "pipelines",
	permission: "pipelines.manage",
	confirmation: "none",
	description: "Internal: commit add-stage.",
	schema: z.object({
		pipelineId: z.string(),
		name: z.string(),
		code: z.string(),
		afterStageCode: z.optional(z.string()),
	}),
	execute: async (args) =>
		runTool(async () => {
			const { orgId, permissions } = getCtx();
			requirePermission(permissions, "pipelines.manage");
			const result = await toolMutation(getCtx(), "crm/fields/pipelines/mutations:addStage", {
				orgId,
				...args,
			});
			return { ok: true as const, data: result, display: `✅ Stage "${args.name}" added.` };
		}),
});

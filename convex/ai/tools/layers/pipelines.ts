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

// ─── Stage 4 additions (2026-05-26) ──────────────────────────────────────────

const stagePatchSchema = z.object({
	pipelineId: z.string().describe("Convex pipelines _id."),
	stageId: z
		.string()
		.describe("Internal stage id (e.g. 'stage_abc123'). Use list_pipelines to resolve."),
	name: z.optional(z.string().min(1)).describe("New display name."),
	code: z
		.optional(z.string().min(1))
		.describe(
			"New stage code (uppercase short identifier; must be unique within the pipeline).",
		),
	color: z.optional(z.string()).describe("New colour (hex string e.g. #3b82f6)."),
	staleAfterDays: z
		.optional(z.number().min(0).max(365))
		.describe("Days before a record in this stage is considered stale (0 = never)."),
});

registerTool({
	name: "update_pipeline_stage",
	layer: "pipelines",
	permission: "pipelines.manage",
	confirmation: "twoStep",
	description:
		"Rename / recolour / change-code on a pipeline stage. Two-step — surfaces deal count in the propose card so the user knows the impact.",
	instruction: {
		whenToCall:
			"User asks to rename / recolour / change-code on a pipeline stage. Always show the propose card first.",
		whenNotToCall:
			"the user wants to delete the stage (use remove_pipeline_stage) OR move a deal to it (use move_deal_stage) OR reorder stages (use reorder_pipeline_stages).",
		preflight: ["list_pipelines"],
		requiredClarifications: ["pipelineId", "stageId"],
		synonyms: [
			"rename stage",
			"change stage colour",
			"update pipeline stage",
			"set stage stale days",
		],
		goodExample: {
			description: "User: 'Rename the Negotiation stage in the Sales pipeline to Pricing.'",
			args: {
				pipelineId: "abc123",
				stageId: "stage_neg",
				name: "Pricing",
			},
		},
	},
	runbook: {
		onSuccess:
			"Confirm in one short sentence with the new label and any side effect ('also affected N deals').",
		onValidationError:
			"If stageId doesn't exist, list the available stages via list_pipelines.",
		onPermissionDenied:
			"Tell the user they need pipelines.manage permission. Suggest contacting an admin.",
	},
	schema: stagePatchSchema,
	execute: async (args) => {
		const { permissions } = getCtx();
		requirePermission(permissions, "pipelines.manage");

		const patchFields: Array<{ label: string; value: unknown }> = [];
		if (args.name !== undefined) patchFields.push({ label: "Name", value: args.name });
		if (args.code !== undefined) patchFields.push({ label: "Code", value: args.code });
		if (args.color !== undefined) patchFields.push({ label: "Color", value: args.color });
		if (args.staleAfterDays !== undefined)
			patchFields.push({ label: "Stale after (days)", value: args.staleAfterDays });
		if (patchFields.length === 0) {
			return {
				ok: false as const,
				error: "Provide at least one of name / code / color / staleAfterDays.",
			};
		}

		// Best-effort impact preview — count deals currently in this stage. The
		// query wraps the index hit and is cheap. Failures are silently ignored
		// so the propose card still surfaces; the underlying mutation will
		// reject if the stage is gone.
		let dealsCount: number | null = null;
		try {
			const tc = getCtx();
			const dealsList = (await tc.ctx.runQuery(
				"crm/entities/deals/queries:listGroupedByStage" as never,
				{ orgId: tc.orgId, userId: tc.userId, pipelineId: args.pipelineId } as never,
			)) as Array<{ stageId: string; count: number }> | null;
			if (Array.isArray(dealsList)) {
				const match = dealsList.find((g) => g.stageId === args.stageId);
				dealsCount = match?.count ?? 0;
			}
		} catch {
			// Non-fatal — deal preview is best-effort.
		}

		return propose("update_pipeline_stage", args, {
			title: "Update pipeline stage",
			fields: [
				{ label: "Stage", value: args.stageId },
				...patchFields,
				...(dealsCount !== null
					? [{ label: "Deals affected", value: String(dealsCount) }]
					: []),
			],
		});
	},
});

registerTool({
	name: "commit_update_pipeline_stage",
	layer: "pipelines",
	permission: "pipelines.manage",
	confirmation: "none",
	description: "Internal: commit a pre-approved stage update.",
	schema: stagePatchSchema,
	execute: async (args) =>
		runTool(async () => {
			const { orgId, permissions } = getCtx();
			requirePermission(permissions, "pipelines.manage");
			await toolMutation(getCtx(), "crm/fields/pipelines/mutations:updateStage", {
				orgId,
				...args,
			});
			return {
				ok: true as const,
				data: { pipelineId: args.pipelineId, stageId: args.stageId },
				summary: {
					headline: "Pipeline stage updated.",
					table: [
						{ label: "Stage", value: args.stageId },
						...(args.name !== undefined ? [{ label: "Name", value: args.name }] : []),
						...(args.code !== undefined ? [{ label: "Code", value: args.code }] : []),
						...(args.color !== undefined
							? [{ label: "Color", value: args.color }]
							: []),
						...(args.staleAfterDays !== undefined
							? [{ label: "Stale after (days)", value: String(args.staleAfterDays) }]
							: []),
					],
					suggestedNext: [
						{
							label: "List pipelines",
							intent: "Show me the current pipeline configuration",
						},
					],
				},
			};
		}),
});

const stageRefSchema = z.object({
	pipelineId: z.string().describe("Convex pipelines _id."),
	stageId: z.string().describe("Internal stage id."),
	stageName: z.string().optional().describe("Stage label (for the propose card)."),
});

registerTool({
	name: "remove_pipeline_stage",
	layer: "pipelines",
	permission: "pipelines.manage",
	confirmation: "twoStep",
	description:
		"Remove a pipeline stage. Refuses if any deals are currently in the stage (move them first). The Default stage cannot be removed.",
	instruction: {
		whenToCall: "User asks to delete / remove a pipeline stage.",
		whenNotToCall: "the user wants to rename or recolour (use update_pipeline_stage).",
		preflight: ["list_pipelines"],
		requiredClarifications: ["pipelineId", "stageId"],
		synonyms: ["delete stage", "remove pipeline stage"],
		goodExample: {
			description: "User: 'Remove the obsolete Cold-Call stage.'",
			args: { pipelineId: "abc123", stageId: "stage_cold", stageName: "Cold-Call" },
		},
	},
	runbook: {
		onSuccess: "Confirm in one short sentence.",
		onValidationError:
			"If the mutation throws STAGE_HAS_DEALS, tell the user to move deals out first via move_deal_stage. If DEFAULT_STAGE_PROTECTED, refuse with the explanation.",
	},
	schema: stageRefSchema,
	execute: async (args) => {
		const { permissions } = getCtx();
		requirePermission(permissions, "pipelines.manage");
		return propose("remove_pipeline_stage", args, {
			title: `Remove stage ${args.stageName ?? args.stageId}`,
			fields: [
				{ label: "Pipeline", value: args.pipelineId },
				{ label: "Stage", value: args.stageName ?? args.stageId },
			],
		});
	},
});

registerTool({
	name: "commit_remove_pipeline_stage",
	layer: "pipelines",
	permission: "pipelines.manage",
	confirmation: "none",
	description: "Internal: commit a pre-approved stage removal.",
	schema: stageRefSchema,
	execute: async (args) =>
		runTool(async () => {
			const { orgId, permissions } = getCtx();
			requirePermission(permissions, "pipelines.manage");
			await toolMutation(getCtx(), "crm/fields/pipelines/mutations:removeStage", {
				orgId,
				pipelineId: args.pipelineId,
				stageId: args.stageId,
			});
			return {
				ok: true as const,
				data: { pipelineId: args.pipelineId, stageId: args.stageId },
				display: `✅ Stage "${args.stageName ?? args.stageId}" removed.`,
			};
		}),
});

const reorderSchema = z.object({
	pipelineId: z.string().describe("Convex pipelines _id."),
	stageIds: z
		.array(z.string().min(1))
		.min(1)
		.describe(
			"Full ordered list of stage ids EXCLUDING the Default stage (which is pinned at order 0). Pass every non-default stage id in the new order.",
		),
});

registerTool({
	name: "reorder_pipeline_stages",
	layer: "pipelines",
	permission: "pipelines.manage",
	confirmation: "twoStep",
	description:
		"Reorder all non-default stages in a pipeline. The Default stage stays pinned at position 0 regardless.",
	instruction: {
		whenToCall:
			"User asks to reorder / rearrange pipeline stages. The model must compute the FULL desired order (omit the Default stage from the list).",
		whenNotToCall:
			"the user just wants to swap two stages — same tool, but pre-compute the full ordered list.",
		preflight: ["list_pipelines"],
		requiredClarifications: ["pipelineId", "stageIds"],
		synonyms: ["reorder stages", "rearrange pipeline", "move stage up"],
	},
	runbook: {
		onSuccess: "Confirm in one short sentence with the new chain.",
	},
	schema: reorderSchema,
	execute: async (args) => {
		const { permissions } = getCtx();
		requirePermission(permissions, "pipelines.manage");
		return propose("reorder_pipeline_stages", args, {
			title: "Reorder pipeline stages",
			fields: [
				{ label: "Pipeline", value: args.pipelineId },
				{ label: "New order", value: args.stageIds.join(" → ") },
			],
		});
	},
});

registerTool({
	name: "commit_reorder_pipeline_stages",
	layer: "pipelines",
	permission: "pipelines.manage",
	confirmation: "none",
	description: "Internal: commit a pre-approved stage reorder.",
	schema: reorderSchema,
	execute: async (args) =>
		runTool(async () => {
			const { orgId, permissions } = getCtx();
			requirePermission(permissions, "pipelines.manage");
			await toolMutation(getCtx(), "crm/fields/pipelines/mutations:reorderStages", {
				orgId,
				pipelineId: args.pipelineId,
				stageIds: args.stageIds,
			});
			return {
				ok: true as const,
				data: args,
				display: `✅ Stages reordered (${args.stageIds.length} stages).`,
			};
		}),
});

const setDefaultSchema = z.object({
	pipelineId: z.string().describe("Convex pipelines _id."),
	stageId: z
		.string()
		.describe(
			"Stage id to set as default. NOTE: the Default stage is FIXED in this build — this tool refuses unless the supplied stageId IS already the default (idempotent path).",
		),
});

registerTool({
	name: "set_default_pipeline",
	layer: "pipelines",
	permission: "pipelines.manage",
	confirmation: "twoStep",
	description:
		"Promote a stage to be the pipeline's Default stage. NOTE: the Default stage is fixed per pipeline in this build — this tool no-ops when the target IS the current default and refuses otherwise.",
	instruction: {
		whenToCall: "User asks to make a stage the default / first stage of a pipeline.",
		whenNotToCall:
			"the user wants to rename the Default stage (use update_pipeline_stage on the existing default).",
		synonyms: ["set default stage", "make default", "promote stage"],
	},
	runbook: {
		onSuccess: "Confirm in one short sentence.",
		onValidationError:
			"If the mutation throws DEFAULT_STAGE_FIXED, tell the user the Default stage is fixed and they should rename the existing one instead via update_pipeline_stage.",
	},
	schema: setDefaultSchema,
	execute: async (args) => {
		const { permissions } = getCtx();
		requirePermission(permissions, "pipelines.manage");
		return propose("set_default_pipeline", args, {
			title: "Set default pipeline stage",
			fields: [
				{ label: "Pipeline", value: args.pipelineId },
				{ label: "Stage", value: args.stageId },
			],
		});
	},
});

registerTool({
	name: "commit_set_default_pipeline",
	layer: "pipelines",
	permission: "pipelines.manage",
	confirmation: "none",
	description: "Internal: commit a pre-approved default-stage change.",
	schema: setDefaultSchema,
	execute: async (args) =>
		runTool(async () => {
			const { orgId, permissions } = getCtx();
			requirePermission(permissions, "pipelines.manage");
			await toolMutation(getCtx(), "crm/fields/pipelines/mutations:setDefaultStage", {
				orgId,
				pipelineId: args.pipelineId,
				stageId: args.stageId,
			});
			return {
				ok: true as const,
				data: args,
				display: `✅ Default stage set.`,
			};
		}),
});

// ─── move_lead_status — atomic semantic shortcut ─────────────────────────────
//
// Lead status is a free-text-from-enum field on `leads.status`. The Kanban UI
// drag fires `leads/mutations:update` with `{status: "<new>"}`. Mirrors
// `move_deal_stage` for the verb shape ("move", "set status", "qualify").

registerTool({
	name: "move_lead_status",
	layer: "pipelines",
	permission: "leads.update",
	confirmation: "none",
	description:
		"Change a lead's status (new / contacted / qualified / unqualified / converted). Atomic — no propose card.",
	instruction: {
		whenToCall:
			"User asks to move / set / change a lead's status (e.g. 'qualify L-007', 'mark new lead as contacted'). Atomic shortcut around update_entity for the status field.",
		whenNotToCall:
			"the user wants to convert a lead to a contact (use convert_lead) OR delete it (use delete_entity).",
		preflight: ["search_crm"],
		requiredClarifications: ["leadId", "status"],
		synonyms: ["qualify lead", "set lead status", "mark lead contacted", "lead stage change"],
		goodExample: {
			description: "User: 'Qualify L-007.'",
			args: { leadId: "abc123", status: "qualified" },
		},
		badExample: {
			description: "User: 'Move L-007 to Pricing.' — that's a deal-stage move.",
			args: { leadId: "abc123", status: "qualified" },
			whyBad: "Pricing is a deal-pipeline stage. For deal stages use move_deal_stage with a dealCode.",
		},
	},
	runbook: {
		onSuccess: "Confirm in one short sentence with the new status.",
		onPermissionDenied: "Tell the user they need leads.update permission.",
	},
	schema: z.object({
		leadId: z.string().describe("Convex leads _id."),
		status: z
			.enum(["new", "contacted", "qualified", "unqualified", "converted"])
			.describe("New status."),
	}),
	execute: async (args) =>
		runTool(async () => {
			const { orgId, permissions } = getCtx();
			requirePermission(permissions, "leads.update");
			if (args.status === "converted") {
				return {
					ok: false as const,
					error: "To convert a lead to a contact, use the convert_lead tool — not move_lead_status.",
				};
			}
			await toolMutation(getCtx(), "crm/entities/leads/mutations:update", {
				orgId,
				leadId: args.leadId,
				status: args.status,
			});
			return {
				ok: true as const,
				data: args,
				display: {
					kind: "entity" as const,
					entityType: "lead" as const,
					entityId: args.leadId,
				},
			};
		}),
});

// ─── reopen_deal — twoStep ───────────────────────────────────────────────────

const reopenDealSchema = z.object({
	dealId: z.string().describe("Convex deals _id."),
	dealTitle: z.string().optional().describe("Deal title (for the propose card)."),
});

registerTool({
	name: "reopen_deal",
	layer: "pipelines",
	permission: "deals.close",
	confirmation: "twoStep",
	description:
		"Reopen a closed (won or lost) deal — clears wonAt/lostAt and restores the deal to the pipeline's Default stage. Two-step.",
	instruction: {
		whenToCall:
			"User asks to reopen / restart / un-close / un-win / un-lose a deal. Two-step so the rebalanced counters (deals.open, deals.won, deals.lost) are visible up front.",
		whenNotToCall:
			"the deal is still open (the mutation will throw DEAL_ALREADY_OPEN) OR the user wants to bring back a soft-deleted deal (use restore_entity).",
		preflight: ["search_crm"],
		requiredClarifications: ["dealId"],
		synonyms: ["reopen deal", "restart deal", "un-close deal", "uncancel deal"],
		goodExample: {
			description: "User: 'Reopen the Acme deal.'",
			args: { dealId: "abc123", dealTitle: "Acme Renewal" },
		},
	},
	runbook: {
		onSuccess: "Confirm in one short sentence — deal reopened, ready to work again.",
		onValidationError:
			"If the mutation throws DEAL_ALREADY_OPEN, tell the user the deal is already in the funnel and offer to move its stage instead.",
	},
	schema: reopenDealSchema,
	execute: async (args) => {
		const { permissions } = getCtx();
		requirePermission(permissions, "deals.close");
		return propose("reopen_deal", args, {
			title: `Reopen deal: ${args.dealTitle ?? args.dealId}`,
			fields: [
				{ label: "Deal", value: args.dealTitle ?? args.dealId },
				{ label: "Effect", value: "Restore to default stage; rebalance counters." },
			],
		});
	},
});

registerTool({
	name: "commit_reopen_deal",
	layer: "pipelines",
	permission: "deals.close",
	confirmation: "none",
	description: "Internal: commit a pre-approved deal reopen.",
	schema: reopenDealSchema,
	execute: async (args) =>
		runTool(async () => {
			const { orgId, permissions } = getCtx();
			requirePermission(permissions, "deals.close");
			await toolMutation(getCtx(), "crm/entities/deals/mutations:reopen", {
				orgId,
				dealId: args.dealId,
			});
			return {
				ok: true as const,
				data: args,
				summary: {
					headline: `Reopened ${args.dealTitle ?? args.dealId}`,
					table: [
						{ label: "Deal", value: args.dealTitle ?? args.dealId },
						{ label: "Status", value: "Open" },
					],
					suggestedNext: [
						{
							label: "Move stage",
							intent: `Move the ${args.dealTitle ?? args.dealId} deal to the next stage`,
						},
						{
							label: "Add follow-up",
							intent: `Schedule a follow-up on ${args.dealTitle ?? args.dealId}`,
						},
					],
				},
				display: {
					kind: "entity" as const,
					entityType: "deal" as const,
					entityId: args.dealId,
				},
			};
		}),
});

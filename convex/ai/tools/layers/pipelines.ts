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
	approvalCategory: "update_record",
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
	approvalCategory: "settings",
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
	approvalCategory: "settings",
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
	approvalCategory: "settings",
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
	approvalCategory: "settings",
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
	approvalCategory: "settings",
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
	approvalCategory: "settings",
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
	approvalCategory: "update_record",
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

// ─── change_pipeline (P1.3 G-1) ─────────────────────────────────────────────
//
// Move a deal to a different pipeline. The deal lands at the first
// non-final stage of the target pipeline; the pipeline-change is logged
// as `deal_pipeline_changed` and the assignee is notified. twoStep
// because a pipeline change is a structural reassignment that shouldn't
// happen without user confirmation.

registerTool({
	name: "change_pipeline",
	layer: "pipelines",
	permission: "deals.changePipeline",
	confirmation: "twoStep",
	approvalCategory: "update_record",
	description:
		"Move a deal between pipelines (e.g. Sales → Renewals). Lands at the first non-final stage. Closed deals must be reopened first.",
	instruction: {
		whenToCall:
			"User says 'move D-007 to Renewals', 'switch pipeline', 'put this deal in the X pipeline', or describes moving a deal between named pipelines.",
		whenNotToCall:
			"the user wants to move between STAGES of the same pipeline (use move_deal_stage). Closed deals can't change pipeline — say so and offer reopen_deal.",
		preflight: ["list_pipelines"],
		requiredClarifications: ["dealId", "toPipelineId"],
		synonyms: ["change pipeline", "switch pipeline", "move to pipeline", "transfer pipeline"],
		goodExample: {
			description: "User: 'Move D-007 to the Renewals pipeline.'",
			args: { dealId: "k123abc...", toPipelineId: "k456def...", dealTitle: "Acme renewal" },
		},
	},
	runbook: {
		onSuccess:
			"Confirm in one short sentence: deal title + new pipeline name. The deal entity card shows the new state.",
		onValidationError:
			"If the toPipelineId doesn't resolve, list pipelines via list_pipelines first. SAME_PIPELINE means the deal already lives there. DEAL_CLOSED means it's won/lost — offer reopen_deal.",
	},
	schema: z.object({
		dealId: z.string().min(1).describe("Convex deal _id."),
		toPipelineId: z.string().min(1).describe("Destination pipeline _id."),
		dealTitle: z.string().optional().describe("Deal title for the propose card."),
		toPipelineName: z.string().optional().describe("Target pipeline name for the card."),
	}),
	execute: async (args) => {
		const { permissions } = getCtx();
		requirePermission(permissions, "deals.changePipeline");
		return propose("change_pipeline", args, {
			title: `Move deal to ${args.toPipelineName ?? "another pipeline"}`,
			fields: [
				{ label: "Deal", value: args.dealTitle ?? args.dealId },
				{ label: "New pipeline", value: args.toPipelineName ?? args.toPipelineId },
			],
		});
	},
});

registerTool({
	name: "commit_change_pipeline",
	layer: "pipelines",
	permission: "deals.changePipeline",
	confirmation: "none",
	description: "Internal: commit pre-approved change_pipeline.",
	schema: z.object({
		dealId: z.string(),
		toPipelineId: z.string(),
		dealTitle: z.string().optional(),
		toPipelineName: z.string().optional(),
	}),
	execute: async (args) =>
		runTool(async () => {
			const { orgId, permissions } = getCtx();
			requirePermission(permissions, "deals.changePipeline");
			await toolMutation(getCtx(), "crm/entities/deals/mutations:changePipeline", {
				orgId,
				dealId: args.dealId,
				toPipelineId: args.toPipelineId,
			});
			return {
				ok: true as const,
				data: { dealId: args.dealId, toPipelineId: args.toPipelineId },
				display: {
					kind: "entity" as const,
					entityType: "deal" as const,
					entityId: args.dealId,
				},
				summary: {
					headline: `Deal moved to ${args.toPipelineName ?? "the target pipeline"}`,
					table: [
						{ label: "Deal", value: args.dealTitle ?? args.dealId },
						{ label: "New pipeline", value: args.toPipelineName ?? args.toPipelineId },
					],
				},
			};
		}),
});

// ─── apply_stage_template (D-5) ─────────────────────────────────────────────
//
// Curated stage-template catalog. Each entry is a *named, opinionated* stage
// chain derived from the equivalent template in
// `convex/_platform/industries/builtIns/`. The tool exposes 4 starter
// templates so the AI can spin up a pipeline that reflects how that
// industry actually operates — without users having to enumerate every
// stage by hand. Curated to keep the surface tight; full per-industry
// templates ship via the onboarding flow / owner panel, not the AI.
//
// Why a curated subset (4) instead of the full 9 builtIns?
//   - The AI's job is to LOWER the activation cost for "I want a
//     pipeline like X" prompts, not replicate the full onboarding UX.
//   - Each template here is hand-verified: stage codes don't collide,
//     final stages carry `isFinal: true`, sane stale-after defaults.
//   - Adding a new template is a one-record append below + a release
//     note. Cheap. The list intentionally errs small.
//
// Naming convention: lowercase-snake-case key matches the source
// industry slug where possible (`b2b_saas` → `b2b-saas`).

interface StageTemplateStage {
	name: string;
	code: string;
	color?: string;
	staleAfterDays?: number;
	isFinal?: boolean;
	finalType?: "positive" | "negative" | "neutral";
}

interface StageTemplate {
	key: string;
	label: string;
	description: string;
	suggestedPipelineName: string;
	stages: readonly StageTemplateStage[];
}

const STAGE_TEMPLATES: readonly StageTemplate[] = [
	{
		key: "b2b-saas",
		label: "B2B SaaS",
		description:
			"Discovery → Demo → Proposal → Negotiation → Won/Lost. Mirrors the b2b_saas industry template.",
		suggestedPipelineName: "Sales Pipeline",
		stages: [
			{ name: "Discovery", code: "DISC", color: "#6366f1", staleAfterDays: 5 },
			{ name: "Demo Scheduled", code: "DEMO", color: "#8b5cf6", staleAfterDays: 7 },
			{ name: "Proposal Sent", code: "PROP", color: "#a855f7", staleAfterDays: 7 },
			{ name: "Negotiation", code: "NEG", color: "#d946ef", staleAfterDays: 10 },
			{
				name: "Closed Won",
				code: "WON",
				color: "#22c55e",
				isFinal: true,
				finalType: "positive",
			},
			{
				name: "Closed Lost",
				code: "LOST",
				color: "#ef4444",
				isFinal: true,
				finalType: "negative",
			},
		],
	},
	{
		key: "real-estate",
		label: "Real Estate",
		description:
			"Inquiry → Viewing → Offer → Under Contract → Closed/Lost. Mirrors the real_estate industry template.",
		suggestedPipelineName: "Listings Pipeline",
		stages: [
			{ name: "Inquiry", code: "INQ", color: "#0ea5e9", staleAfterDays: 3 },
			{ name: "Viewing Scheduled", code: "VIEW", color: "#06b6d4", staleAfterDays: 5 },
			{ name: "Offer Made", code: "OFFER", color: "#f59e0b", staleAfterDays: 5 },
			{ name: "Under Contract", code: "CTRCT", color: "#a855f7", staleAfterDays: 14 },
			{
				name: "Closed",
				code: "CLOSED",
				color: "#22c55e",
				isFinal: true,
				finalType: "positive",
			},
			{ name: "Lost", code: "LOST", color: "#ef4444", isFinal: true, finalType: "negative" },
		],
	},
	{
		key: "productivity",
		label: "Productivity / Solopreneur",
		description:
			"Inbox → Doing → Waiting → Done/Cancelled. A lightweight task-style flow for solo operators who want a status board, not a sales funnel.",
		suggestedPipelineName: "Workflow",
		stages: [
			{ name: "Inbox", code: "INBOX", color: "#94a3b8", staleAfterDays: 2 },
			{ name: "Doing", code: "DOING", color: "#3b82f6", staleAfterDays: 3 },
			{ name: "Waiting", code: "WAIT", color: "#f59e0b", staleAfterDays: 7 },
			{ name: "Done", code: "DONE", color: "#22c55e", isFinal: true, finalType: "positive" },
			{
				name: "Cancelled",
				code: "CANCEL",
				color: "#ef4444",
				isFinal: true,
				finalType: "neutral",
			},
		],
	},
	{
		key: "agency-services",
		label: "Agency / Services",
		description:
			"Lead → Discovery Call → Proposal → Engaged → Delivered/Lost. Mirrors the agency_freelance industry template — service businesses with a discovery → scope → contract motion.",
		suggestedPipelineName: "Client Pipeline",
		stages: [
			{ name: "Lead", code: "LEAD", color: "#6366f1", staleAfterDays: 3 },
			{ name: "Discovery Call", code: "DISC", color: "#8b5cf6", staleAfterDays: 5 },
			{ name: "Proposal Sent", code: "PROP", color: "#a855f7", staleAfterDays: 7 },
			{ name: "Engaged", code: "ENG", color: "#22c55e", staleAfterDays: 30 },
			{
				name: "Delivered",
				code: "DELIV",
				color: "#10b981",
				isFinal: true,
				finalType: "positive",
			},
			{ name: "Lost", code: "LOST", color: "#ef4444", isFinal: true, finalType: "negative" },
		],
	},
];

const TEMPLATE_KEYS = STAGE_TEMPLATES.map((t) => t.key) as [string, ...string[]];

function nanoid12(): string {
	// Same shape the pipelines mutation uses for stage ids — 12-char base36
	// segment, padded to keep widths constant. Math.random is fine here:
	// the id is opaque + scoped to a pipeline, and the `code` field is the
	// real semantic key.
	return Math.random().toString(36).slice(2, 14).padEnd(12, "0");
}

registerTool({
	name: "apply_stage_template",
	layer: "pipelines",
	permission: "pipelines.manage",
	requiredCapability: "premium",
	confirmation: "twoStep",
	approvalCategory: "settings",
	description: "",
	instruction: {
		whenToCall:
			"User says 'set up a sales pipeline like a SaaS company', 'spin up a real-estate pipeline', 'I want a workflow board', 'use the agency template', 'apply the X starter template'. Routes to a curated catalogue of 4 hand-verified templates so the user doesn't have to enumerate stages.",
		whenNotToCall:
			"the user wants a CUSTOM stage chain (call create_pipeline with explicit stages); OR the user is renaming an existing pipeline (use update_pipeline); OR they want to copy stages from another existing pipeline (not supported yet).",
		preflight: ["list_pipelines"],
		requiredClarifications: ["templateKey"],
		synonyms: [
			"apply template",
			"use starter template",
			"setup pipeline like",
			"spin up template pipeline",
			"create from template",
		],
		goodExample: {
			description: "User: 'Spin up a B2B SaaS sales pipeline.'",
			args: { templateKey: "b2b-saas", pipelineName: "Q3 Sales", entityType: "deal" },
		},
		badExample: {
			description:
				"User wants a brand-new custom 7-stage chain — should call create_pipeline directly.",
			args: { templateKey: "b2b-saas", pipelineName: "Custom 7-stage" },
		},
	},
	runbook: {
		onSuccess:
			"Confirm with the new pipeline name + the stage chain ('Discovery → Demo Scheduled → …'). Don't dump the colour codes.",
		onValidationError:
			"UNKNOWN_TEMPLATE → tell the user which keys exist (b2b-saas, real-estate, productivity, agency-services). PLAN_LIMIT_EXCEEDED → suggest archiving an unused pipeline first.",
		onPermissionDenied: "Tell the user they need pipelines.manage permission.",
	},
	schema: z.object({
		templateKey: z
			.enum(TEMPLATE_KEYS)
			.describe(
				"Curated template id: 'b2b-saas' | 'real-estate' | 'productivity' | 'agency-services'.",
			),
		pipelineName: z
			.string()
			.min(1)
			.max(60)
			.describe("Display name for the new pipeline (the template only provides defaults)."),
		entityType: z
			.enum(["deal", "lead"])
			.default("deal")
			.describe(
				"Entity the pipeline tracks. Default 'deal'; pick 'lead' only when the user explicitly wants a lead pipeline.",
			),
		isDefault: z
			.optional(z.boolean())
			.describe("Mark this new pipeline as the default for its entity type."),
	}),
	execute: async (args) => {
		const { permissions } = getCtx();
		requirePermission(permissions, "pipelines.manage");
		const tpl = STAGE_TEMPLATES.find((t) => t.key === args.templateKey);
		if (!tpl) {
			return {
				ok: false as const,
				code: "UNKNOWN_TEMPLATE",
				error: `Template '${args.templateKey}' is not in the curated catalogue. Known: ${STAGE_TEMPLATES.map((t) => t.key).join(", ")}.`,
			};
		}
		const stageChain = tpl.stages.map((s) => s.name).join(" → ");
		return propose("apply_stage_template", args, {
			title: `Apply template: ${tpl.label}`,
			fields: [
				{ label: "Template", value: tpl.label },
				{ label: "Pipeline name", value: args.pipelineName },
				{ label: "Tracks", value: args.entityType ?? "deal" },
				{ label: "Stages", value: stageChain },
				...(args.isDefault ? [{ label: "Default", value: "Yes" }] : []),
			],
		});
	},
});

registerTool({
	name: "commit_apply_stage_template",
	layer: "pipelines",
	permission: "pipelines.manage",
	confirmation: "none",
	description: "Internal: commit pre-approved stage-template apply.",
	schema: z.object({
		templateKey: z.enum(TEMPLATE_KEYS),
		pipelineName: z.string().min(1).max(60),
		entityType: z.enum(["deal", "lead"]).default("deal"),
		isDefault: z.optional(z.boolean()),
	}),
	execute: async (args) =>
		runTool(async () => {
			const { orgId, permissions } = getCtx();
			requirePermission(permissions, "pipelines.manage");

			const tpl = STAGE_TEMPLATES.find((t) => t.key === args.templateKey);
			if (!tpl) {
				return {
					ok: false as const,
					code: "UNKNOWN_TEMPLATE",
					error: `Template '${args.templateKey}' is not in the curated catalogue.`,
				};
			}

			// Build the StageInput[] the pipelines mutation expects:
			// `id` + `order` + per-stage flags. The first stage is wired
			// as the default-stage so the pipelines.create flow attaches
			// the customary "Default" sentinel cleanly.
			const stages = tpl.stages.map((s, i) => ({
				id: `stage_${nanoid12()}`,
				name: s.name,
				code: s.code,
				order: i,
				color: s.color,
				isDefaultStage: i === 0,
				isFinal: s.isFinal,
				finalType: s.finalType,
				staleAfterDays: s.staleAfterDays,
			}));

			const result = (await toolMutation(getCtx(), "crm/fields/pipelines/mutations:create", {
				orgId,
				name: args.pipelineName,
				entityType: args.entityType,
				stages,
				...(args.isDefault === true ? { isDefault: true } : {}),
			})) as { pipelineId?: string; _id?: string };

			return {
				ok: true as const,
				data: {
					pipelineId: result.pipelineId ?? result._id,
					templateKey: tpl.key,
					stageCount: stages.length,
				},
				display: {
					kind: "text" as const,
					text: `✅ Pipeline "${args.pipelineName}" created from template "${tpl.label}" with ${stages.length} stages.`,
				},
				summary: {
					headline: `Created "${args.pipelineName}" from ${tpl.label}`,
					table: [
						{ label: "Template", value: tpl.label },
						{ label: "Tracks", value: args.entityType },
						{
							label: "Stages",
							value: tpl.stages.map((s) => s.name).join(" → "),
						},
					],
				},
			};
		}),
});

/**
 * Read-only catalogue tool. Lets the model surface the available
 * curated templates when the user asks "what templates can I apply?"
 * before committing to an `apply_stage_template` call.
 */
registerTool({
	name: "list_stage_templates",
	layer: "pipelines",
	permission: null,
	confirmation: "none",
	description: `Read-only: list the curated stage templates that \`apply_stage_template\` accepts.
Returns each template's \`key\`, \`label\`, \`description\`, suggested
\`pipelineName\`, and the ordered stage chain. Use this BEFORE calling
\`apply_stage_template\` when the user asks "what templates are
available?" or to confirm the right \`templateKey\`.`,
	runbook: {
		onSuccess:
			"List the 4 templates with one-line summaries. Don't dump every stage chain unless the user asked.",
	},
	example: {},
	schema: z.object({}),
	execute: async () =>
		runTool(async () => {
			return {
				ok: true as const,
				data: {
					count: STAGE_TEMPLATES.length,
					templates: STAGE_TEMPLATES.map((t) => ({
						key: t.key,
						label: t.label,
						description: t.description,
						suggestedPipelineName: t.suggestedPipelineName,
						stageCount: t.stages.length,
						stageChain: t.stages.map((s) => s.name).join(" → "),
					})),
				},
				display: {
					kind: "text" as const,
					text: `${STAGE_TEMPLATES.length} curated stage template(s) available.`,
				},
			};
		}),
});

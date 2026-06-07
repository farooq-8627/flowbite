/**
 * Pipelines capabilities — the AI-callable surface for the pipelines domain.
 * Wraps the existing `*ForAI` internal twins in `mutations.ts` + `queries.ts`;
 * never re-implements business logic.
 *
 * Surface (8 caps in the `pipelines` group):
 *
 *   list_pipelines        org-wide list of pipelines + their stages
 *   create_pipeline       new pipeline (Default stage auto-created at order 0)
 *   update_pipeline       rename + transition policies (no stage edits here)
 *   add_stage             append a stage to an existing pipeline
 *   update_stage          patch one stage's name / code / colour / final flag
 *   remove_stage          delete a stage iff zero deals reference it
 *   reorder_stages        full reorder by stageIds[] (Default stays pinned at 0)
 *   delete_pipeline       hard-delete iff non-default + zero deals (irreversible)
 *
 * Group invariants (also baked into the playbook below — keep both in sync):
 *
 *   1. The Default stage is auto-created at order 0 on every pipeline. It
 *      CANNOT be removed (`DEFAULT_STAGE_PROTECTED`) or promoted via
 *      setDefaultStage — that mutation is deprecated. To "rename the default
 *      stage" call `update_stage` against the existing Default stage's id.
 *   2. Stages have BOTH an internal `id` (stage_<nanoid>) and a human `code`
 *      (e.g. `NEG`, `WON`). The model's natural language references "Negotiation"
 *      → use the code, not the id. Stage codes are unique per pipeline.
 *   3. `delete_pipeline` and `remove_stage` are blocked while ANY deal still
 *      references the stage. Move/close deals first, or surface the constraint
 *      to the user. The mutation throws `STAGE_HAS_DEALS` / `PIPELINE_HAS_DEALS`
 *      with a human-readable reason; the wrapper maps it to `business_error`.
 *   4. Risk classification: `delete_pipeline` is irreversible (no soft-delete
 *      on the pipelines table — the row is gone). Everything else is reversible
 *      (rename + reorder + add/remove stage). S10 will fence the irreversible
 *      ops with 2FA step-up.
 *   5. Channels: writes exclude `whatsapp` because pipeline edits are admin
 *      work that doesn't belong on a phone-keyboard surface. Reads
 *      (`list_pipelines`) include all channels.
 */
import { z } from "zod";
import { internal } from "../../../_generated/api";
import type { Id } from "../../../_generated/dataModel";
import {
	CORE_ENTITY_TYPES,
	entityTypeSchema,
	isEntityTypeError,
	validateEntityType,
} from "../../../_shared/entityTypes";
import { defineCapability } from "../../../ai/registry/define";
import { defineGroup } from "../../../ai/registry/groups";
import { ok } from "../../../ai/registry/result";

const FINAL_TYPE = z.enum(["positive", "negative", "neutral"]);
const TRANSITION_POLICY = z.enum(["block", "warn", "off"]);

// ─── Group playbook ─────────────────────────────────────────────────────────

defineGroup({
	name: "pipelines",
	playbook: `Read first → \`list_pipelines\` returns every pipeline (with inline stages array) for the org. Stages have BOTH an internal \`id\` and a human \`code\`; the model speaks in codes (e.g. NEG / WON), the mutation needs ids — list_pipelines surfaces both so you can map.

Create → \`create_pipeline\` for a new pipeline. The Default stage is created automatically at order 0 — you only need to pass NON-default stages (or omit \`stages\` entirely for a single-stage workflow). Pass \`isDefault:true\` to make it the org's default for the entity type; the previous default is demoted automatically.

Update vs add/remove/reorder stage — pick the right verb:
  · \`update_pipeline\` for the pipeline-level metadata (name, stageTransitionPolicy, allowSkipStages, markDoneRequiresAllFields).
  · \`add_stage\` to APPEND a new stage. Code auto-derived from the name when omitted.
  · \`update_stage\` to rename/recolour/relabel ONE stage (including renaming the Default stage — the role is fixed but the label is editable).
  · \`remove_stage\` is blocked while deals reference the stage; move them first.
  · \`reorder_stages\` takes the full ordered list of NON-default stage ids; the Default stage stays pinned at order 0 regardless.

Delete → \`delete_pipeline\` is HARD-delete (no soft-delete on this table) — irreversible. Blocked when the pipeline is the org default OR when ANY deal references any of its stages. Surface the constraint plainly; offer to soft-delete the deals first.

Permission: every write needs \`pipelines.manage\` (Owner / Admin). Reads need \`pipelines.view\`.`,
});

// ─── list_pipelines ─────────────────────────────────────────────────────────

const listPipelines = defineCapability<Record<string, never>>({
	name: "list_pipelines",
	module: "pipelines",
	group: "pipelines",
	permission: "pipelines.view",
	risk: "safe",
	channels: ["chat", "whatsapp", "mcp", "rest"],
	spec: {
		whenToCall:
			"Read every pipeline in the org. Returns the full row including the inline `stages[]` array (with each stage's id, code, name, colour, isDefaultStage / isFinal / finalType flags). Use BEFORE every pipeline write so you have current ids/codes — never guess them.",
		whenNotToCall:
			"the user wants the workspace shape (entity labels + active modules) — that's `describe_workspace`. The user wants to see fields on a deal — that's `describe_entity('deal')`.",
		synonyms: ["pipelines", "stages", "deal stages", "workflow", "kanban columns"],
		goodExample: {},
	},
	drive: {
		onSuccess:
			"Narrate the pipeline count + the default pipeline's name. The result card carries the full stages list — don't re-list every stage in prose.",
		onEmpty: "If 0 pipelines, suggest `create_pipeline` to seed the workspace.",
	},
	input: z.object({}),
	run: async (cap) => {
		const { ctx, principal } = cap;
		const rows = (await ctx.runQuery(internal.crm.fields.pipelines.queries.listByOrgForAI, {
			orgId: principal.orgId,
			userId: principal.userId,
		})) as Array<{
			_id: string;
			name: string;
			entityType: string;
			isDefault?: boolean;
			stages: Array<{
				id: string;
				code: string;
				name: string;
				order: number;
				color?: string;
				isDefaultStage?: boolean;
				isFinal?: boolean;
				finalType?: "positive" | "negative" | "neutral";
			}>;
		}>;
		if (rows.length === 0) {
			return ok({
				headline: "No pipelines yet.",
				facts: ["Use `create_pipeline` to seed one (the Default stage is auto-created)."],
				data: { pipelines: [] as unknown[] },
			});
		}
		const def = rows.find((p) => p.isDefault) ?? rows[0];
		return ok({
			headline: `${rows.length} pipeline${rows.length === 1 ? "" : "s"}.`,
			changes: rows.map((p) => ({
				label: p.name,
				value: `${p.entityType} · ${p.stages.length} stage${p.stages.length === 1 ? "" : "s"}${p.isDefault ? " · default" : ""}`,
				emphasis: "unchanged" as const,
			})),
			facts: [`Default for the org: ${def.name} (${def.entityType}).`],
			data: { pipelines: rows },
		});
	},
});

// ─── create_pipeline ────────────────────────────────────────────────────────

const createPipeline = defineCapability<{
	name: string;
	entityType: string;
	stages?: Array<{
		name: string;
		code?: string;
		color?: string;
		isFinal?: boolean;
		finalType?: "positive" | "negative" | "neutral";
		staleAfterDays?: number;
	}>;
	isDefault?: boolean;
}>({
	name: "create_pipeline",
	module: "pipelines",
	group: "pipelines",
	permission: "pipelines.manage",
	risk: "reversible",
	channels: ["chat", "mcp", "rest"],
	spec: {
		whenToCall:
			"Create a new pipeline for an entity type. The Default stage is created automatically at order 0 — only pass NON-default stages. Pass `isDefault:true` to make this the org's default pipeline for the entity type (demotes the previous default).",
		whenNotToCall:
			"the user wants to add a stage to an EXISTING pipeline — use `add_stage`. The user wants to rename a pipeline — use `update_pipeline`.",
		requiredClarifications: ["name", "entityType"],
		synonyms: ["create pipeline", "new pipeline", "new workflow", "add pipeline"],
		goodExample: {
			name: "Sales — Enterprise",
			entityType: "deal",
			stages: [
				{ name: "Qualified", code: "QUAL", color: "#3b82f6" },
				{
					name: "Negotiation",
					code: "NEG",
					color: "#f59e0b",
					staleAfterDays: 14,
				},
				{
					name: "Won",
					code: "WON",
					color: "#10b981",
					isFinal: true,
					finalType: "positive",
				},
				{
					name: "Lost",
					code: "LOST",
					color: "#ef4444",
					isFinal: true,
					finalType: "negative",
				},
			],
			isDefault: false,
		},
		badExample: {
			args: { name: "Sales", entityType: "deal", stages: [{ name: "Default" }] },
			why: "The Default stage is auto-created — passing it again creates a duplicate logical role. Pass only non-default stages.",
		},
	},
	drive: {
		onSuccess:
			"Confirm in one short sentence with the pipeline's name + how many stages were added (Default + the user's). Mention if it's the new org default.",
		onValidationError:
			"If `INVALID_STAGE_CODE` came back, the code violated the format (uppercase letters/digits, ≤8 chars) or collided with another stage in the same pipeline. Fix the code and retry.",
	},
	input: z.object({
		name: z.string().min(1).describe("Pipeline display name."),
		entityType: entityTypeSchema().describe(
			"Which entity owns this pipeline. Usually `deal`. Accepts canonical type or org-relabelled alias.",
		),
		stages: z
			.array(
				z.object({
					name: z.string().min(1),
					code: z.string().optional(),
					color: z.string().optional(),
					isFinal: z.boolean().optional(),
					finalType: FINAL_TYPE.optional(),
					staleAfterDays: z.number().int().min(1).max(365).optional(),
				}),
			)
			.optional()
			.describe(
				"Optional non-default stages. The Default stage is auto-created at order 0 and should NOT be in this list.",
			),
		isDefault: z
			.boolean()
			.optional()
			.describe(
				"If true, demote the current default for this entityType and make this one default.",
			),
	}),
	run: async (cap, args) => {
		const { ctx, principal } = cap;
		const validated = await validateEntityType(cap, args.entityType, {
			restrictTo: CORE_ENTITY_TYPES,
		});
		if (isEntityTypeError(validated)) return validated;
		const entityType = validated.entityType;
		const stageInputs = (args.stages ?? []).map((s, i) => ({
			id: `stage_pending_${i}`,
			name: s.name,
			code: s.code ?? deriveCodeFromName(s.name),
			order: i + 1, // Default sits at 0; non-defaults start at 1
			color: s.color,
			isDefaultStage: false,
			isFinal: s.isFinal,
			finalType: s.finalType,
			staleAfterDays: s.staleAfterDays,
		}));
		const pipelineId = (await ctx.runMutation(
			internal.crm.fields.pipelines.mutations.createForAI,
			{
				orgId: principal.orgId,
				userId: principal.userId,
				name: args.name,
				entityType,
				stages: stageInputs.length > 0 ? stageInputs : undefined,
				isDefault: args.isDefault,
			},
		)) as Id<"pipelines">;
		const stageCount = stageInputs.length + 1; // + 1 for Default
		return ok({
			headline: `Created pipeline "${args.name}" with ${stageCount} stage${stageCount === 1 ? "" : "s"}.`,
			changes: [
				{ label: "Pipeline", value: args.name, emphasis: "added" },
				{ label: "Entity", value: entityType, emphasis: "added" },
				{
					label: "Stages",
					value: `${stageCount} (Default + ${stageInputs.length} custom)`,
					emphasis: "added",
				},
				...(args.isDefault
					? [{ label: "Org default", value: "yes", emphasis: "added" as const }]
					: []),
			],
			data: { pipelineId, entityType: args.entityType, isDefault: args.isDefault ?? false },
			suggestedNext: [
				{
					label: "Add another stage",
					intent: `Add a stage to the new ${args.name} pipeline`,
				},
			],
		});
	},
});

// ─── update_pipeline ────────────────────────────────────────────────────────

const updatePipeline = defineCapability<{
	pipelineId: string;
	name?: string;
	stageTransitionPolicy?: "block" | "warn" | "off";
	allowSkipStages?: boolean;
	markDoneRequiresAllFields?: boolean;
}>({
	name: "update_pipeline",
	module: "pipelines",
	group: "pipelines",
	permission: "pipelines.manage",
	risk: "reversible",
	channels: ["chat", "mcp", "rest"],
	spec: {
		whenToCall:
			"Rename a pipeline OR change its top-level policies (stageTransitionPolicy: block/warn/off, allowSkipStages, markDoneRequiresAllFields). Stage edits go through `add_stage` / `update_stage` / `remove_stage` / `reorder_stages` — this verb does NOT touch the stages array.",
		whenNotToCall:
			"the user wants to rename a stage inside a pipeline (use `update_stage`) OR add/remove a stage (use `add_stage` / `remove_stage`).",
		requiredClarifications: ["pipelineId"],
		synonyms: ["rename pipeline", "update pipeline policy", "change pipeline settings"],
		goodExample: {
			pipelineId: "k123abc",
			name: "Sales — Enterprise (revised)",
			stageTransitionPolicy: "warn",
		},
		badExample: {
			args: { pipelineId: "k123abc" },
			why: "At least one of name / stageTransitionPolicy / allowSkipStages / markDoneRequiresAllFields must be supplied.",
		},
	},
	drive: {
		onSuccess: "Confirm in one short sentence — list only the fields that actually changed.",
	},
	input: z
		.object({
			pipelineId: z
				.string()
				.min(1)
				.describe("The pipeline's Convex _id (from list_pipelines)."),
			name: z.string().min(1).optional().describe("New pipeline display name."),
			stageTransitionPolicy: TRANSITION_POLICY.optional().describe(
				"`block` = forbid skipping stages; `warn` = surface a confirm; `off` = silent.",
			),
			allowSkipStages: z
				.boolean()
				.optional()
				.describe("If true, deals can jump non-adjacent stages without warning."),
			markDoneRequiresAllFields: z
				.boolean()
				.optional()
				.describe("If true, marking a deal won/lost requires every required field set."),
		})
		.refine(
			(v) =>
				v.name !== undefined ||
				v.stageTransitionPolicy !== undefined ||
				v.allowSkipStages !== undefined ||
				v.markDoneRequiresAllFields !== undefined,
			{ message: "At least one editable field must be supplied." },
		),
	run: async (cap, args) => {
		const { ctx, principal } = cap;
		await ctx.runMutation(internal.crm.fields.pipelines.mutations.updateForAI, {
			orgId: principal.orgId,
			userId: principal.userId,
			pipelineId: args.pipelineId as Id<"pipelines">,
			...(args.name !== undefined ? { name: args.name } : {}),
			...(args.stageTransitionPolicy !== undefined
				? { stageTransitionPolicy: args.stageTransitionPolicy }
				: {}),
			...(args.allowSkipStages !== undefined
				? { allowSkipStages: args.allowSkipStages }
				: {}),
			...(args.markDoneRequiresAllFields !== undefined
				? { markDoneRequiresAllFields: args.markDoneRequiresAllFields }
				: {}),
		});
		const changes: { label: string; value: string; emphasis: "changed" }[] = [];
		if (args.name !== undefined)
			changes.push({ label: "Name", value: args.name, emphasis: "changed" });
		if (args.stageTransitionPolicy !== undefined)
			changes.push({
				label: "Stage transition policy",
				value: args.stageTransitionPolicy,
				emphasis: "changed",
			});
		if (args.allowSkipStages !== undefined)
			changes.push({
				label: "Allow skip stages",
				value: String(args.allowSkipStages),
				emphasis: "changed",
			});
		if (args.markDoneRequiresAllFields !== undefined)
			changes.push({
				label: "Mark-done requires all fields",
				value: String(args.markDoneRequiresAllFields),
				emphasis: "changed",
			});
		return ok({
			headline: "Pipeline updated.",
			changes,
			data: { pipelineId: args.pipelineId },
		});
	},
});

// ─── add_stage ──────────────────────────────────────────────────────────────

const addStage = defineCapability<{
	pipelineId: string;
	name: string;
	code?: string;
	color?: string;
	isFinal?: boolean;
	finalType?: "positive" | "negative" | "neutral";
	staleAfterDays?: number;
}>({
	name: "add_stage",
	module: "pipelines",
	group: "pipelines",
	permission: "pipelines.manage",
	risk: "reversible",
	channels: ["chat", "mcp", "rest"],
	spec: {
		whenToCall:
			"Append a new stage to an existing pipeline. The stage lands at the end of the order. Code is auto-derived from the name (uppercase, alphanumeric, ≤8 chars) when omitted; pass an explicit code when the auto-derived would collide.",
		whenNotToCall:
			"the user wants to rename / recolour an existing stage (use `update_stage`) OR move a stage's position (use `reorder_stages`).",
		requiredClarifications: ["pipelineId", "name"],
		synonyms: ["add stage", "new stage", "append stage"],
		goodExample: {
			pipelineId: "k123abc",
			name: "Negotiation",
			code: "NEG",
			color: "#f59e0b",
			staleAfterDays: 14,
		},
	},
	drive: {
		onSuccess:
			"Confirm with the new stage's name + code. Mention `staleAfterDays` if set so the user knows the alert window.",
		onValidationError:
			"`INVALID_STAGE_CODE` → the code is malformed (uppercase letters/digits, ≤8 chars) or collides with another stage. Fix the code and retry.",
	},
	input: z.object({
		pipelineId: z.string().min(1).describe("The pipeline's Convex _id."),
		name: z.string().min(1).describe("Stage display name (e.g. 'Negotiation')."),
		code: z
			.string()
			.optional()
			.describe(
				"Optional explicit stage code (uppercase letters/digits, ≤8 chars). Derived from `name` when omitted.",
			),
		color: z.string().optional().describe("Optional stage colour (CSS hex)."),
		isFinal: z
			.boolean()
			.optional()
			.describe("If true, deals reaching this stage are considered closed."),
		finalType: FINAL_TYPE.optional().describe(
			"Required when isFinal is true: positive (won) / negative (lost) / neutral (cancelled).",
		),
		staleAfterDays: z
			.number()
			.int()
			.min(1)
			.max(365)
			.optional()
			.describe("If set, deals sitting in this stage longer than N days surface as stale."),
	}),
	run: async (cap, args) => {
		const { ctx, principal } = cap;
		const stageId = (await ctx.runMutation(
			internal.crm.fields.pipelines.mutations.addStageForAI,
			{
				orgId: principal.orgId,
				userId: principal.userId,
				pipelineId: args.pipelineId as Id<"pipelines">,
				stage: {
					name: args.name,
					code: args.code,
					color: args.color,
					isFinal: args.isFinal,
					finalType: args.finalType,
					staleAfterDays: args.staleAfterDays,
				},
			},
		)) as string;
		return ok({
			headline: `Added stage "${args.name}".`,
			changes: [
				{ label: "Pipeline", value: args.pipelineId, emphasis: "unchanged" },
				{ label: "Stage", value: args.name, emphasis: "added" },
				...(args.code
					? [{ label: "Code", value: args.code, emphasis: "added" as const }]
					: []),
				...(args.staleAfterDays
					? [
							{
								label: "Stale after",
								value: `${args.staleAfterDays}d`,
								emphasis: "added" as const,
							},
						]
					: []),
			],
			data: { pipelineId: args.pipelineId, stageId },
		});
	},
});

// ─── update_stage ───────────────────────────────────────────────────────────

const updateStage = defineCapability<{
	pipelineId: string;
	stageId: string;
	name?: string;
	code?: string;
	color?: string;
	staleAfterDays?: number;
	warningAfterDays?: number;
	isFinal?: boolean;
	finalType?: "positive" | "negative" | "neutral";
}>({
	name: "update_stage",
	module: "pipelines",
	group: "pipelines",
	permission: "pipelines.manage",
	risk: "reversible",
	channels: ["chat", "mcp", "rest"],
	spec: {
		whenToCall:
			"Patch one stage's attributes — name, code, colour, stale/warning timeouts, isFinal/finalType. Use this to RENAME the Default stage's label too (the role itself is fixed; the label is editable).",
		whenNotToCall:
			"the user wants to delete the stage (use `remove_stage`) OR move its position (use `reorder_stages`).",
		requiredClarifications: ["pipelineId", "stageId"],
		synonyms: ["edit stage", "rename stage", "recolour stage", "stage settings"],
		goodExample: { pipelineId: "k123abc", stageId: "stage_abc123", color: "#0ea5e9" },
		badExample: {
			args: { pipelineId: "k123abc", stageId: "stage_abc123" },
			why: "At least one editable field (name/code/color/...) must be supplied — otherwise the call is a no-op.",
		},
	},
	drive: {
		onSuccess:
			"Confirm with only the fields that actually changed. Mention if `isFinal=false` cleared the `finalType` automatically.",
	},
	input: z
		.object({
			pipelineId: z.string().min(1).describe("The pipeline's Convex _id."),
			stageId: z
				.string()
				.min(1)
				.describe("The stage's internal id (`stage_<nanoid>` from list_pipelines)."),
			name: z.string().min(1).optional().describe("New stage display name."),
			code: z
				.string()
				.optional()
				.describe(
					"New stage code (uppercase letters/digits, ≤8 chars, unique per pipeline).",
				),
			color: z.string().optional().describe("New CSS hex colour."),
			staleAfterDays: z.number().int().min(1).max(365).optional(),
			warningAfterDays: z.number().int().min(1).max(365).optional(),
			isFinal: z.boolean().optional(),
			finalType: FINAL_TYPE.optional(),
		})
		.refine(
			(v) =>
				v.name !== undefined ||
				v.code !== undefined ||
				v.color !== undefined ||
				v.staleAfterDays !== undefined ||
				v.warningAfterDays !== undefined ||
				v.isFinal !== undefined ||
				v.finalType !== undefined,
			{ message: "At least one editable field must be supplied." },
		),
	run: async (cap, args) => {
		const { ctx, principal } = cap;
		await ctx.runMutation(internal.crm.fields.pipelines.mutations.updateStageForAI, {
			orgId: principal.orgId,
			userId: principal.userId,
			pipelineId: args.pipelineId as Id<"pipelines">,
			stageId: args.stageId,
			...(args.name !== undefined ? { name: args.name } : {}),
			...(args.code !== undefined ? { code: args.code } : {}),
			...(args.color !== undefined ? { color: args.color } : {}),
			...(args.staleAfterDays !== undefined ? { staleAfterDays: args.staleAfterDays } : {}),
			...(args.warningAfterDays !== undefined
				? { warningAfterDays: args.warningAfterDays }
				: {}),
			...(args.isFinal !== undefined ? { isFinal: args.isFinal } : {}),
			...(args.finalType !== undefined ? { finalType: args.finalType } : {}),
		});
		const changes: { label: string; value: string; emphasis: "changed" }[] = [];
		if (args.name !== undefined)
			changes.push({ label: "Name", value: args.name, emphasis: "changed" });
		if (args.code !== undefined)
			changes.push({ label: "Code", value: args.code, emphasis: "changed" });
		if (args.color !== undefined)
			changes.push({ label: "Colour", value: args.color, emphasis: "changed" });
		if (args.staleAfterDays !== undefined)
			changes.push({
				label: "Stale after",
				value: `${args.staleAfterDays}d`,
				emphasis: "changed",
			});
		if (args.warningAfterDays !== undefined)
			changes.push({
				label: "Warning after",
				value: `${args.warningAfterDays}d`,
				emphasis: "changed",
			});
		if (args.isFinal !== undefined)
			changes.push({ label: "Is final", value: String(args.isFinal), emphasis: "changed" });
		if (args.finalType !== undefined)
			changes.push({ label: "Final type", value: args.finalType, emphasis: "changed" });
		return ok({
			headline: "Stage updated.",
			changes,
			data: { pipelineId: args.pipelineId, stageId: args.stageId },
		});
	},
});

// ─── remove_stage ───────────────────────────────────────────────────────────

const removeStage = defineCapability<{
	pipelineId: string;
	stageId: string;
}>({
	name: "remove_stage",
	module: "pipelines",
	group: "pipelines",
	permission: "pipelines.manage",
	risk: "reversible",
	channels: ["chat", "mcp", "rest"],
	spec: {
		whenToCall:
			"Delete one stage from a pipeline. Blocked when ANY deal references the stage (`STAGE_HAS_DEALS`) — move the deals first. The Default stage cannot be removed (`DEFAULT_STAGE_PROTECTED`).",
		whenNotToCall:
			"the stage still has deals — call `move_stage` (deals group) on each one first, OR ask the user how to relocate them.",
		requiredClarifications: ["pipelineId", "stageId"],
		synonyms: ["remove stage", "delete stage", "drop stage"],
		goodExample: { pipelineId: "k123abc", stageId: "stage_abc123" },
	},
	drive: {
		onSuccess:
			"Confirm with the deleted stage's name. The remaining stages get re-numbered automatically.",
		onValidationError:
			"`STAGE_HAS_DEALS` → list the deals that block (call `search_crm` filtered by stage) and offer to move them. `DEFAULT_STAGE_PROTECTED` → tell the user the Default stage is fixed and offer `update_stage` to rename it instead.",
	},
	input: z.object({
		pipelineId: z.string().min(1).describe("The pipeline's Convex _id."),
		stageId: z
			.string()
			.min(1)
			.describe("The stage's internal id (`stage_<nanoid>` from list_pipelines)."),
	}),
	run: async (cap, args) => {
		const { ctx, principal } = cap;
		await ctx.runMutation(internal.crm.fields.pipelines.mutations.removeStageForAI, {
			orgId: principal.orgId,
			userId: principal.userId,
			pipelineId: args.pipelineId as Id<"pipelines">,
			stageId: args.stageId,
		});
		return ok({
			headline: "Stage removed.",
			changes: [
				{ label: "Pipeline", value: args.pipelineId, emphasis: "unchanged" },
				{ label: "Stage", value: args.stageId, emphasis: "changed" },
			],
			data: { pipelineId: args.pipelineId, stageId: args.stageId },
		});
	},
});

// ─── reorder_stages ─────────────────────────────────────────────────────────

const reorderStages = defineCapability<{
	pipelineId: string;
	stageIds: string[];
}>({
	name: "reorder_stages",
	module: "pipelines",
	group: "pipelines",
	permission: "pipelines.manage",
	risk: "reversible",
	channels: ["chat", "mcp", "rest"],
	spec: {
		whenToCall:
			"Reorder ALL non-default stages of a pipeline by stage id. The Default stage stays pinned at order 0 regardless of the input — pass only the non-default stage ids in the desired order. Pass every non-default stage; partial lists silently keep the omitted stages at their current positions.",
		whenNotToCall:
			"the user wants to add or remove a stage (use `add_stage` / `remove_stage`).",
		requiredClarifications: ["pipelineId", "stageIds"],
		synonyms: ["reorder stages", "rearrange stages", "sort stages"],
		goodExample: {
			pipelineId: "k123abc",
			stageIds: ["stage_qual", "stage_neg", "stage_won", "stage_lost"],
		},
	},
	drive: {
		onSuccess: "Confirm with the new ordered list (Default first, then the user's ordering).",
	},
	input: z.object({
		pipelineId: z.string().min(1).describe("The pipeline's Convex _id."),
		stageIds: z
			.array(z.string().min(1))
			.min(1)
			.describe(
				"Non-default stage ids in the desired order. The Default stage stays at order 0.",
			),
	}),
	run: async (cap, args) => {
		const { ctx, principal } = cap;
		await ctx.runMutation(internal.crm.fields.pipelines.mutations.reorderStagesForAI, {
			orgId: principal.orgId,
			userId: principal.userId,
			pipelineId: args.pipelineId as Id<"pipelines">,
			stageIds: args.stageIds,
		});
		return ok({
			headline: `Reordered ${args.stageIds.length} stage${args.stageIds.length === 1 ? "" : "s"}.`,
			changes: args.stageIds.map((id, i) => ({
				label: `Position ${i + 1}`,
				value: id,
				emphasis: "changed" as const,
			})),
			data: { pipelineId: args.pipelineId, stageIds: args.stageIds },
		});
	},
});

// ─── delete_pipeline ────────────────────────────────────────────────────────

const deletePipeline = defineCapability<{
	pipelineId: string;
}>({
	name: "delete_pipeline",
	module: "pipelines",
	group: "pipelines",
	permission: "pipelines.manage",
	// HARD-delete on the pipelines table (no soft-delete column). We classify
	// `irreversible` so S10's 2FA fence will cover it. The mutation already
	// blocks deletion when the pipeline is the org default OR any stage has
	// deals — those guards layer underneath the autonomy gate.
	risk: "irreversible",
	channels: ["chat", "mcp", "rest"],
	spec: {
		whenToCall:
			"Hard-delete a pipeline. Blocked when this is the org default for its entityType (demote first via `update_pipeline` against another pipeline with `isDefault:true`) OR when ANY deal references any of its stages.",
		whenNotToCall:
			"the pipeline still has deals — surface the constraint and ask the user how to relocate them. The user wants to disable a pipeline temporarily — there's no archive flag; the only options are delete or rename.",
		requiredClarifications: ["pipelineId"],
		synonyms: ["delete pipeline", "remove pipeline", "drop pipeline"],
		goodExample: { pipelineId: "k123abc" },
	},
	drive: {
		onSuccess: "Confirm in one short sentence. Mention deletion is permanent.",
		onValidationError:
			"`DEFAULT_PIPELINE` → tell the user another pipeline must be promoted to default first. `PIPELINE_HAS_DEALS` → list the blocking stages by name; offer `move_stage` on the deals or soft-delete them first.",
	},
	input: z.object({
		pipelineId: z.string().min(1).describe("The pipeline's Convex _id."),
	}),
	run: async (cap, args) => {
		const { ctx, principal } = cap;
		await ctx.runMutation(internal.crm.fields.pipelines.mutations.deletePipelineForAI, {
			orgId: principal.orgId,
			userId: principal.userId,
			pipelineId: args.pipelineId as Id<"pipelines">,
		});
		return ok({
			headline: "Pipeline deleted (permanent).",
			changes: [
				{ label: "Pipeline", value: args.pipelineId, emphasis: "unchanged" },
				{ label: "State", value: "deleted", emphasis: "changed" },
			],
			facts: ["The activity log preserves the audit trail."],
			data: { pipelineId: args.pipelineId },
		});
	},
});

// ─── Internals ──────────────────────────────────────────────────────────────

/**
 * Mirror of `helpers.ts:deriveStageCode` — keeps the AI's stage codes in line
 * with the UI's auto-derive rule (uppercase alphanumerics, max 8 chars). The
 * mutation re-validates the resulting code, so any drift here surfaces as an
 * `INVALID_STAGE_CODE` repair (not a silent corruption).
 */
function deriveCodeFromName(name: string): string {
	const cleaned = name
		.toUpperCase()
		.replace(/[^A-Z0-9]+/g, "")
		.slice(0, 8);
	return cleaned.length > 0 ? cleaned : "STAGE";
}

// ─── Public surface ─────────────────────────────────────────────────────────

export const PIPELINES_CAPABILITIES = [
	listPipelines,
	createPipeline,
	updatePipeline,
	addStage,
	updateStage,
	removeStage,
	reorderStages,
	deletePipeline,
];

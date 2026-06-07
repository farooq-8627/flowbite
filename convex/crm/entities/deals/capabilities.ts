/**
 * Deals capabilities — the AI-callable surface for the deals domain.
 * Wraps the existing `*ForAI` internal twins in `mutations.ts` + `queries.ts`;
 * never re-implements business logic.
 *
 * Surface (7 caps in the `deals` group):
 *
 *   create_deal            new deal in the org's default pipeline + stage
 *   move_stage             advance a deal by stage code/name (resolves → stageId)
 *   close_deal             positive / negative / neutral final-stage close
 *   reopen_deal            restore a closed (won/lost) deal to the pipeline
 *   change_pipeline        move an open deal to a different pipeline
 *   soft_delete_deal       trash a deal (reversible — sets `deletedAt`)
 *   get_deal_detail        fetch one deal by D-NNN code
 *
 * Group invariants (also baked into the playbook below — keep both in sync):
 *
 *   1. STAGE MOVES go through `move_stage`, NEVER `update_entity`. The
 *      mutation layer enforces required-field gates per the pipeline's
 *      `stageTransitionPolicy`; bypassing it via a column patch silently
 *      skips the gate.
 *   2. CLOSE goes through `close_deal` (sets wonAt / lostAt + the right
 *      final stage); never patch `wonAt` directly.
 *   3. The "irreversible" feel of a deal close is mitigated by `reopen_deal`
 *      — so close is `risk: "reversible"`. Hard-delete is NOT in this layer
 *      (handled by the trash drawer + S10 destructive ops); `soft_delete_deal`
 *      is reversible (the trash drawer restores it).
 *   4. `update_entity` (registered in the leads file) handles lead/contact/
 *      deal/company column + custom-field patches uniformly. The deals
 *      playbook tells the model when to use it vs `move_stage` / `close_deal`.
 */
import { z } from "zod";
import { internal } from "../../../_generated/api";
import type { Id } from "../../../_generated/dataModel";
import { defineCapability } from "../../../ai/registry/define";
import { defineGroup } from "../../../ai/registry/groups";
import { failed, ok } from "../../../ai/registry/result";
import { dispatchSingleRecordFields } from "../../shared/dynamicFieldDispatch";

// ─── Group playbook ─────────────────────────────────────────────────────────

defineGroup({
	name: "deals",
	playbook: `Read first → \`search_crm\` (entityType:"deal") to resolve the dealCode (D-NNN); \`get_deal_detail\` confirms a single deal before any stage / close action. \`describe_workspace\` returns the live pipelines + stages, \`describe_entity\` (entityType:"deal") returns the live custom fields — call them BEFORE writing anything you're not 100% sure of.

Create → \`create_deal\`. Required: \`title\`. By default the deal lands in the org's default deal pipeline + default stage. To target a SPECIFIC pipeline (when the org runs multiple), pass \`pipelineName\` (case-insensitive substring match against \`describe_workspace\` output). To start on a non-default stage, pass \`stageName\` (code OR name). Optional fields: \`value\`, \`personCode\`, \`expectedCloseDate\`. \`personCode\` must come from a prior \`search_crm\` — never invent a code. NEVER fabricate \`pipelineId\` / \`currentStageId\` — use the name args.

Update → \`update_entity\` (entityType:"deal", code:"D-NNN") for column / custom field patches (title, value, currency, expectedCloseDate, custom fields). NEVER patch \`currentStageId\`, \`wonAt\`, \`lostAt\` here — those have dedicated verbs.

Stage moves → \`move_stage\` ONLY. The arg is \`stage\` (the user's words: a stage code like "NEG" OR a stage name like "Negotiation"). Server resolves it to the pipeline's \`stageId\`. The mutation enforces required-field gates per the pipeline's \`stageTransitionPolicy\` — if it returns \`MISSING_REQUIRED_FIELDS\`, surface the field list so the user can fill them.

Close / reopen → \`close_deal\` for "deal won" / "deal lost" / "no decision (neutral)". \`reopen_deal\` for "actually we're not done — put it back in the funnel". Closed deals can't change pipeline; reopen first.

Change pipeline → \`change_pipeline\` ONLY for open deals. Resets \`currentStageId\` to the destination pipeline's default stage.

Delete → \`soft_delete_deal\` is reversible (trash). Hard-delete is not in this layer — surface "deletion is permanent — use the trash drawer to restore" if the user pushes for it.`,
});

// ─── create_deal ────────────────────────────────────────────────────────────

const createDeal = defineCapability<{
	fields: Record<string, unknown>;
	pipelineName?: string;
	stageName?: string;
}>({
	name: "create_deal",
	module: "deals",
	group: "deals",
	permission: "deals.create",
	risk: "reversible",
	channels: ["chat", "whatsapp", "mcp", "rest"],
	spec: {
		whenToCall:
			"Open a new sales opportunity. By default the deal lands in the org's default deal pipeline + default stage. Pass `pipelineName` (case-insensitive substring match) to target a SPECIFIC pipeline — useful when the org runs multiple pipelines like 'Enterprise Sales' / 'SMB' / 'Renewals'. Pass `stageName` (code or name, case-insensitive) to target a non-default stage on the chosen pipeline. ALWAYS run search_crm first when the user named a person without a P-NNN code. Call describe_workspace to see live pipelines + stage codes.",
		whenNotToCall:
			"the deal already exists — call update_entity to edit it, or move_stage to advance it. The user wants to MOVE an existing deal to a different pipeline — use change_pipeline.",
		requiredClarifications: ["fields"],
		synonyms: ["new opportunity", "open a deal", "start a sale", "pipeline entry"],
		goodExample: {
			fields: {
				title: "Acme Corp — Enterprise Expansion",
				value: 25000,
				currency: "USD",
				personCode: "P-007",
				expectedCloseDate: 1717372800000,
			},
			pipelineName: "Enterprise Sales",
			stageName: "Qualified",
		},
		badExample: {
			args: { fields: {}, pipelineName: "won" },
			why: "fields must include at least the required field(s) (call describe_entity first). 'won' is a stage, not a pipeline — pass it via stageName, or use close_deal({outcome:'won'}) on an existing deal.",
		},
	},
	drive: {
		onSuccess:
			"Reply with one short sentence naming the dealCode (D-NNN) + title. When the deal landed in a non-default pipeline OR non-default stage, mention the pipeline + stage. Surface unknownFields if any so the user can fix the slug.",
		onValidationError:
			"If `pipelineId` came back NO_DEAL_PIPELINE, tell the user no deal pipeline exists and point them to Settings → Modules → Deals → Pipelines. If `pipelineName` didn't resolve, list available deal pipelines back to the user. If `stageName` didn't resolve, list the chosen pipeline's stages. Don't loop.",
		suggestNext: "Add the next-touch task and a context note.",
	},
	input: z.object({
		fields: z
			.record(z.string(), z.unknown())
			.refine((r) => Object.keys(r).length > 0, {
				message: "fields must contain at least one key/value pair.",
			})
			.describe(
				"FLAT field map — pass EVERY field at the top level keyed by canonical name OR user-facing label. The runner reads live `fieldDefinitions` for `deal` and dispatches each entry: column-backed → row args, fieldValues-backed → custom-field slot. Numeric values may be passed as numbers OR numeric strings (coerced server-side). Call `describe_entity` first to see what fields the org accepts; stage-required fields are enforced at move_stage time, not here.",
			),
		pipelineName: z
			.string()
			.optional()
			.describe(
				"Optional destination pipeline name (case-insensitive substring match against the org's deal pipelines). Omit to use the org default. Example: 'Enterprise Sales'.",
			),
		stageName: z
			.string()
			.optional()
			.describe(
				"Optional initial stage on the chosen pipeline — accepts the stage CODE (e.g. 'QUAL') or the NAME (e.g. 'Qualified'). Omit to use the pipeline's default stage. Server resolves it case-insensitively.",
			),
	}),
	run: async (cap, args) => {
		const { ctx, principal } = cap;

		// Locked 2026-06-06 evening — fully `fieldDefinitions`-driven.
		// NO hardcoded field knowledge in this capability.
		const dispatched = await dispatchSingleRecordFields(cap, "deal", {
			fields: args.fields,
		});

		const title = dispatched.columnArgs.title;
		if (typeof title !== "string" || title.trim().length === 0) {
			return failed(
				"needs_repair",
				"`title` is required to create a deal. Call describe_entity to confirm the field name.",
			);
		}

		// Coerce common numeric-string values that small/free models
		// emit. The dispatcher's columnArgs map carries unknown values;
		// the mutation validator expects `number` for these.
		const numericKeys = ["value", "expectedCloseDate"];
		for (const key of numericKeys) {
			const v = dispatched.columnArgs[key];
			if (typeof v === "string" && v.length > 0) {
				const n = Number(v);
				if (Number.isFinite(n)) dispatched.columnArgs[key] = n;
			}
		}

		// Multi-pipeline + multi-stage targeting at create time. Resolve
		// pipelineName / stageName SERVER-side against the org's live
		// pipelines so the AI never invents a pipelineId or stageId.
		// Both args optional — when absent, `createForAI` falls back to
		// the org default pipeline + its default stage.
		let resolvedPipelineId: Id<"pipelines"> | undefined;
		let resolvedStageId: string | undefined;
		if (args.pipelineName || args.stageName) {
			const allPipelines = (await ctx.runQuery(
				internal.crm.fields.pipelines.queries.listByOrgForAI,
				{ orgId: principal.orgId, userId: principal.userId },
			)) as Array<{
				_id: Id<"pipelines">;
				name: string;
				entityType: string;
				isDefault?: boolean;
				stages: Array<{ id: string; name: string; code: string }>;
			}>;
			const dealPipelines = allPipelines.filter((p) => p.entityType === "deal");
			if (dealPipelines.length === 0) {
				return failed(
					"not_found",
					"No deal pipeline exists. Create one in Settings → Modules → Deals → Pipelines, then retry.",
				);
			}

			// Resolve pipeline first (when named) — case-insensitive
			// match: exact > substring. Default fallback when no
			// pipelineName supplied but stageName is.
			let chosenPipeline:
				| {
						_id: Id<"pipelines">;
						name: string;
						stages: Array<{ id: string; name: string; code: string }>;
				  }
				| undefined;
			if (args.pipelineName) {
				const norm = args.pipelineName.trim().toLowerCase();
				const exact = dealPipelines.filter((p) => p.name.toLowerCase() === norm);
				const partial = dealPipelines.filter((p) => p.name.toLowerCase().includes(norm));
				const candidate =
					exact.length === 1 ? exact[0] : partial.length === 1 ? partial[0] : null;
				if (!candidate) {
					if (partial.length > 1) {
						return failed(
							"ambiguous",
							`"${args.pipelineName}" matches multiple deal pipelines. Pick one: ${dealPipelines.map((p) => `"${p.name}"`).join(", ")}.`,
						);
					}
					return failed(
						"not_found",
						`No deal pipeline matches "${args.pipelineName}". Available: ${dealPipelines.map((p) => `"${p.name}"`).join(", ")}.`,
					);
				}
				chosenPipeline = candidate;
				resolvedPipelineId = candidate._id;
			} else {
				// stageName supplied without pipelineName → fall back to
				// the org's default deal pipeline so the stage resolver
				// has somewhere to look.
				chosenPipeline = dealPipelines.find((p) => p.isDefault) ?? dealPipelines[0];
				resolvedPipelineId = chosenPipeline._id;
			}

			// Resolve stage on the chosen pipeline.
			if (args.stageName && chosenPipeline) {
				const stageNorm = args.stageName.trim().toLowerCase();
				const exactCode = chosenPipeline.stages.filter(
					(s) => s.code.toLowerCase() === stageNorm,
				);
				const exactName = chosenPipeline.stages.filter(
					(s) => s.name.toLowerCase() === stageNorm,
				);
				const partial = chosenPipeline.stages.filter(
					(s) =>
						s.name.toLowerCase().includes(stageNorm) ||
						s.code.toLowerCase().includes(stageNorm),
				);
				const stageCandidate =
					exactCode.length === 1
						? exactCode[0]
						: exactName.length === 1
							? exactName[0]
							: partial.length === 1
								? partial[0]
								: null;
				if (!stageCandidate) {
					if (partial.length > 1) {
						return failed(
							"ambiguous",
							`"${args.stageName}" matches multiple stages on "${chosenPipeline.name}". Pick a code: ${chosenPipeline.stages.map((s) => s.code).join(", ")}.`,
						);
					}
					return failed(
						"not_found",
						`No stage "${args.stageName}" on pipeline "${chosenPipeline.name}". Stages: ${chosenPipeline.stages.map((s) => `${s.name} (${s.code})`).join(", ")}.`,
					);
				}
				resolvedStageId = stageCandidate.id;
			}
		}

		const created = (await ctx.runMutation(internal.crm.entities.deals.mutations.createForAI, {
			orgId: principal.orgId,
			userId: principal.userId,
			...dispatched.columnArgs,
			...(resolvedPipelineId ? { pipelineId: resolvedPipelineId } : {}),
			...(resolvedStageId ? { currentStageId: resolvedStageId } : {}),
		} as never)) as { dealId: Id<"deals">; dealCode: string };

		// Apply custom fields.
		let appliedCustomFields: string[] = [];
		let unknownFields: string[] = [...dispatched.dropped];
		if (dispatched.customFields) {
			const result = (await ctx.runMutation(
				internal.ai.aiEntityPatch.applyCustomFieldsForRecord,
				{
					orgId: principal.orgId,
					userId: principal.userId,
					entityType: "deal",
					entityId: created.dealId as unknown as string,
					customFields: dispatched.customFields,
				},
			)) as { applied: Array<{ name: string; value: unknown }>; unknown: string[] };
			appliedCustomFields = result.applied.map((f) => f.name);
			unknownFields = [...unknownFields, ...result.unknown];
		}

		const changes = [
			{ label: "Code", value: created.dealCode, emphasis: "added" as const },
			...Object.entries(dispatched.columnArgs).map(([key, value]) => ({
				label: key,
				value: Array.isArray(value) ? value.join(", ") : String(value ?? ""),
				emphasis: "added" as const,
			})),
			...(args.pipelineName
				? [
						{
							label: "Pipeline",
							value: args.pipelineName,
							emphasis: "added" as const,
						},
					]
				: []),
			...(args.stageName
				? [
						{
							label: "Stage",
							value: args.stageName,
							emphasis: "added" as const,
						},
					]
				: []),
			...appliedCustomFields.map((cfName) => ({
				label: cfName,
				value: String(dispatched.customFields?.[cfName] ?? ""),
				emphasis: "added" as const,
			})),
		];
		const facts: string[] = [];
		if (unknownFields.length > 0) {
			facts.push(
				`Skipped (no field definition): ${unknownFields.join(", ")}. Create them in the workspace fields UI first.`,
			);
		}
		return ok({
			headline: `Created deal ${created.dealCode}: ${title}`,
			changes,
			facts: facts.length > 0 ? facts : undefined,
			data: {
				dealId: created.dealId,
				dealCode: created.dealCode,
				appliedCustomFields,
				unknownFields,
				...(resolvedPipelineId ? { pipelineId: resolvedPipelineId } : {}),
				...(resolvedStageId ? { stageId: resolvedStageId } : {}),
			},
			display: {
				kind: "entity",
				entityType: "deal",
				entityId: created.dealId as unknown as string,
			},
			suggestedNext: [
				{
					label: "Schedule next touch",
					intent: `Schedule a follow-up for ${created.dealCode}`,
				},
				{
					label: "Add note",
					intent: `Add a note to ${created.dealCode}`,
				},
				{
					label: "Move stage",
					intent: `Move ${created.dealCode} to the next pipeline stage`,
				},
			],
		});
	},
});

// ─── move_stage ─────────────────────────────────────────────────────────────

/**
 * Resolve a user-supplied stage descriptor (code OR name, case-insensitive)
 * against the deal's current pipeline. Stage `id` is internal — never
 * exposed to the model. We accept `stage` as the natural label and resolve
 * it server-side; ambiguous matches return null (caller surfaces an
 * `ambiguous` envelope).
 */
function resolveStageDescriptor(
	pipeline: { stages: Array<{ id: string; name: string; code: string }> },
	descriptor: string,
): { id: string; name: string; code: string } | null | "ambiguous" {
	const norm = descriptor.trim().toLowerCase();
	const exactCode = pipeline.stages.filter((s) => s.code.toLowerCase() === norm);
	if (exactCode.length === 1) return exactCode[0];
	const exactName = pipeline.stages.filter((s) => s.name.toLowerCase() === norm);
	if (exactName.length === 1) return exactName[0];
	const partial = pipeline.stages.filter(
		(s) => s.name.toLowerCase().includes(norm) || s.code.toLowerCase().includes(norm),
	);
	if (partial.length === 1) return partial[0];
	if (partial.length > 1) return "ambiguous";
	return null;
}

const moveStage = defineCapability<{
	dealCode: string;
	stage: string;
}>({
	name: "move_stage",
	module: "deals",
	group: "deals",
	permission: "deals.changeStage",
	risk: "reversible",
	channels: ["chat", "whatsapp", "mcp", "rest"],
	spec: {
		whenToCall:
			"Advance a deal to a different stage in its current pipeline. The `stage` arg accepts the pipeline's stage CODE (e.g. 'NEG') or NAME (e.g. 'Negotiation') — the server resolves it. The mutation enforces required-field gates per the pipeline's `stageTransitionPolicy`; if it returns MISSING_REQUIRED_FIELDS surface the field list to the user.",
		whenNotToCall:
			"the user wants to mark a deal won/lost — call close_deal (it picks the right final stage AND sets wonAt/lostAt). The user wants a different pipeline — call change_pipeline.",
		requiredClarifications: ["dealCode", "stage"],
		synonyms: [
			"move stage",
			"advance stage",
			"set stage",
			"push to next stage",
			"to qualified",
			"to negotiation",
		],
		goodExample: { dealCode: "D-007", stage: "NEG" },
		badExample: {
			args: { dealCode: "D-007", stage: "won" },
			why: "Closing as won goes through close_deal — it picks the right final stage + sets wonAt.",
		},
	},
	drive: {
		onSuccess:
			"Reply with one short sentence naming the new stage and the dealCode. If the policy was 'warn' and required fields were missing, mention which (the mutation included them in the activity log metadata).",
		onValidationError:
			"If MISSING_REQUIRED_FIELDS came back, list the missing field labels and ask the user to fill them. Don't retry the move silently.",
	},
	input: z.object({
		dealCode: z.string().min(1).describe("Deal code (D-NNN)."),
		stage: z
			.string()
			.min(1)
			.describe("Destination stage — code (e.g. 'NEG') or name (e.g. 'Negotiation')."),
	}),
	run: async (cap, rawArgs) => {
		const { ctx, principal } = cap;
		// Resolver-injected: dealId + canonicalCode under args.dealCode.
		const dealId = (rawArgs as unknown as { dealId?: string }).dealId as
			| Id<"deals">
			| undefined;
		if (!dealId) {
			return failed("not_found", `Could not resolve deal ${rawArgs.dealCode}.`);
		}

		const deal = (await ctx.runQuery(internal.crm.entities.deals.queries.getByDealCodeForAI, {
			orgId: principal.orgId,
			userId: principal.userId,
			dealCode: rawArgs.dealCode,
		})) as null | { _id: Id<"deals">; pipelineId: Id<"pipelines">; dealCode: string };
		if (!deal) {
			return failed("not_found", `No deal found with code ${rawArgs.dealCode}.`);
		}

		const pipelines = (await ctx.runQuery(
			internal.crm.fields.pipelines.queries.listByOrgForAI,
			{ orgId: principal.orgId, userId: principal.userId },
		)) as Array<{
			_id: Id<"pipelines">;
			entityType: string;
			stages: Array<{ id: string; name: string; code: string }>;
		}>;
		const pipeline = pipelines.find((p) => p._id === deal.pipelineId);
		if (!pipeline) {
			return failed("not_found", `Pipeline for deal ${rawArgs.dealCode} no longer exists.`);
		}

		const resolved = resolveStageDescriptor(pipeline, rawArgs.stage);
		if (resolved === null) {
			return failed(
				"not_found",
				`No stage "${rawArgs.stage}" on this pipeline. Stages: ${pipeline.stages
					.map((s) => `${s.name} (${s.code})`)
					.join(", ")}.`,
			);
		}
		if (resolved === "ambiguous") {
			return failed(
				"ambiguous",
				`"${rawArgs.stage}" matches multiple stages. Pick a stage CODE: ${pipeline.stages
					.map((s) => s.code)
					.join(", ")}.`,
			);
		}

		await ctx.runMutation(internal.crm.entities.deals.mutations.moveToStageForAI, {
			orgId: principal.orgId,
			userId: principal.userId,
			dealId,
			stageId: resolved.id,
		});
		return ok({
			headline: `Moved ${deal.dealCode} to ${resolved.name}.`,
			changes: [
				{ label: "Code", value: deal.dealCode, emphasis: "unchanged" },
				{ label: "Stage", value: resolved.name, emphasis: "changed" },
			],
			data: {
				dealId,
				dealCode: deal.dealCode,
				stageId: resolved.id,
				stageCode: resolved.code,
			},
			display: {
				kind: "entity",
				entityType: "deal",
				entityId: dealId as unknown as string,
			},
		});
	},
});

// ─── close_deal ─────────────────────────────────────────────────────────────

const closeDeal = defineCapability<{
	dealCode: string;
	outcome: "won" | "lost" | "neutral";
	reason?: string;
}>({
	name: "close_deal",
	module: "deals",
	group: "deals",
	permission: "deals.close",
	risk: "reversible", // reopen_deal undoes it.
	channels: ["chat", "mcp", "rest"], // not whatsapp — the close is admin-ish.
	spec: {
		whenToCall:
			"Mark a deal as won / lost / neutral. The mutation moves the deal into the matching final stage AND sets wonAt / lostAt. ALWAYS prefer this over update_entity when the user says 'won', 'lost', 'closed', 'no-go'.",
		whenNotToCall:
			"the user wants to advance to a non-final stage — call move_stage. The user wants to delete the deal — call soft_delete_deal.",
		requiredClarifications: ["dealCode", "outcome"],
		synonyms: [
			"close deal",
			"won",
			"lost",
			"deal closed",
			"mark won",
			"mark lost",
			"no decision",
		],
		goodExample: { dealCode: "D-007", outcome: "won", reason: "Selected over competitors" },
		badExample: {
			args: { dealCode: "D-007", outcome: "won" },
			why: "no reason — fine. But if the user said 'we lost' do NOT pass outcome:'won'.",
		},
	},
	drive: {
		onSuccess:
			"Reply with one short sentence naming the dealCode + outcome. Mention the reason if supplied. Surface MISSING_REQUIRED_FIELDS_FOR_DONE if it returned that.",
		onValidationError:
			"If MISSING_REQUIRED_FIELDS_FOR_DONE came back (positive/neutral close), list the missing fields. Don't retry silently.",
	},
	input: z.object({
		dealCode: z.string().min(1).describe("Deal code (D-NNN)."),
		outcome: z
			.enum(["won", "lost", "neutral"])
			.describe("Final outcome. won → positive, lost → negative, neutral → neutral."),
		reason: z.string().optional().describe("Outcome reason, free-form."),
	}),
	run: async (cap, rawArgs) => {
		const { ctx, principal } = cap;
		const dealId = (rawArgs as unknown as { dealId?: string }).dealId as
			| Id<"deals">
			| undefined;
		if (!dealId) {
			return failed("not_found", `Could not resolve deal ${rawArgs.dealCode}.`);
		}
		const finalType =
			rawArgs.outcome === "won"
				? ("positive" as const)
				: rawArgs.outcome === "lost"
					? ("negative" as const)
					: ("neutral" as const);
		await ctx.runMutation(internal.crm.entities.deals.mutations.closeAsDoneForAI, {
			orgId: principal.orgId,
			userId: principal.userId,
			dealId,
			finalType,
			outcomeReason: rawArgs.reason,
		});
		return ok({
			headline: `Closed ${rawArgs.dealCode} as ${rawArgs.outcome}.`,
			changes: [
				{ label: "Code", value: rawArgs.dealCode, emphasis: "unchanged" },
				{ label: "Outcome", value: rawArgs.outcome, emphasis: "changed" },
				...(rawArgs.reason
					? [{ label: "Reason", value: rawArgs.reason, emphasis: "added" as const }]
					: []),
			],
			data: { dealId, outcome: rawArgs.outcome, finalType },
			display: {
				kind: "entity",
				entityType: "deal",
				entityId: dealId as unknown as string,
			},
			suggestedNext: [{ label: "Reopen if needed", intent: `Reopen ${rawArgs.dealCode}` }],
		});
	},
});

// ─── reopen_deal ────────────────────────────────────────────────────────────

const reopenDeal = defineCapability<{ dealCode: string }>({
	name: "reopen_deal",
	module: "deals",
	group: "deals",
	permission: "deals.close",
	risk: "reversible",
	channels: ["chat", "mcp", "rest"],
	spec: {
		whenToCall:
			"Restore a CLOSED (won OR lost) deal back into the pipeline. Resets the stage to the pipeline's default and clears wonAt/lostAt.",
		whenNotToCall:
			"the deal is already open (the mutation throws DEAL_ALREADY_OPEN). For changing a still-open deal's stage, use move_stage.",
		requiredClarifications: ["dealCode"],
		synonyms: ["reopen", "uncancel", "unclose", "back in the funnel"],
		goodExample: { dealCode: "D-007" },
	},
	drive: {
		onSuccess:
			"Reply with one short sentence naming the dealCode + the destination stage (the pipeline's default).",
	},
	input: z.object({
		dealCode: z.string().min(1).describe("Deal code (D-NNN)."),
	}),
	run: async (cap, rawArgs) => {
		const { ctx, principal } = cap;
		const dealId = (rawArgs as unknown as { dealId?: string }).dealId as
			| Id<"deals">
			| undefined;
		if (!dealId) {
			return failed("not_found", `Could not resolve deal ${rawArgs.dealCode}.`);
		}
		await ctx.runMutation(internal.crm.entities.deals.mutations.reopenForAI, {
			orgId: principal.orgId,
			userId: principal.userId,
			dealId,
		});
		return ok({
			headline: `Reopened ${rawArgs.dealCode}.`,
			changes: [
				{ label: "Code", value: rawArgs.dealCode, emphasis: "unchanged" },
				{ label: "Status", value: "open", emphasis: "changed" },
			],
			data: { dealId, dealCode: rawArgs.dealCode },
			display: {
				kind: "entity",
				entityType: "deal",
				entityId: dealId as unknown as string,
			},
		});
	},
});

// ─── change_pipeline ────────────────────────────────────────────────────────

const changePipeline = defineCapability<{
	dealCode: string;
	pipelineName: string;
}>({
	name: "change_pipeline",
	module: "deals",
	group: "deals",
	permission: "deals.changePipeline",
	risk: "reversible",
	channels: ["chat", "mcp", "rest"],
	spec: {
		whenToCall:
			"Move an OPEN deal to a different pipeline. Resolves the destination pipeline by name (case-insensitive substring); resets `currentStageId` to the destination's default stage.",
		whenNotToCall:
			"the deal is closed (mutation throws DEAL_CLOSED — reopen first). The user wants a different stage in the SAME pipeline — use move_stage.",
		requiredClarifications: ["dealCode", "pipelineName"],
		synonyms: ["change pipeline", "switch pipeline", "move to <pipeline>"],
		goodExample: { dealCode: "D-007", pipelineName: "Enterprise Sales" },
		badExample: {
			args: { dealCode: "D-007", pipelineName: "Won" },
			why: "Won is a stage, not a pipeline. Use close_deal({outcome:'won'}).",
		},
	},
	drive: {
		onSuccess:
			"Confirm in one short sentence with the destination pipeline name. The deal is back at its default stage — mention that.",
		onValidationError:
			"If pipeline didn't resolve, list available deal pipelines back to the user. Don't loop.",
	},
	input: z.object({
		dealCode: z.string().min(1).describe("Deal code (D-NNN)."),
		pipelineName: z.string().min(1).describe("Destination pipeline name (case-insensitive)."),
	}),
	run: async (cap, rawArgs) => {
		const { ctx, principal } = cap;
		const dealId = (rawArgs as unknown as { dealId?: string }).dealId as
			| Id<"deals">
			| undefined;
		if (!dealId) {
			return failed("not_found", `Could not resolve deal ${rawArgs.dealCode}.`);
		}

		const allPipelines = (await ctx.runQuery(
			internal.crm.fields.pipelines.queries.listByOrgForAI,
			{ orgId: principal.orgId, userId: principal.userId },
		)) as Array<{ _id: Id<"pipelines">; name: string; entityType: string }>;
		const pipelines = allPipelines.filter((p) => p.entityType === "deal");

		const norm = rawArgs.pipelineName.trim().toLowerCase();
		const exact = pipelines.filter((p) => p.name.toLowerCase() === norm);
		const partial = pipelines.filter((p) => p.name.toLowerCase().includes(norm));
		const candidate = exact.length === 1 ? exact[0] : partial.length === 1 ? partial[0] : null;
		if (!candidate) {
			if (partial.length > 1) {
				return failed(
					"ambiguous",
					`"${rawArgs.pipelineName}" matches multiple pipelines. Pick one: ${pipelines.map((p) => p.name).join(", ")}.`,
				);
			}
			return failed(
				"not_found",
				`No pipeline matches "${rawArgs.pipelineName}". Available: ${pipelines.map((p) => p.name).join(", ")}.`,
			);
		}

		await ctx.runMutation(internal.crm.entities.deals.mutations.changePipelineForAI, {
			orgId: principal.orgId,
			userId: principal.userId,
			dealId,
			toPipelineId: candidate._id,
		});
		return ok({
			headline: `Moved ${rawArgs.dealCode} to pipeline "${candidate.name}".`,
			changes: [
				{ label: "Code", value: rawArgs.dealCode, emphasis: "unchanged" },
				{ label: "Pipeline", value: candidate.name, emphasis: "changed" },
			],
			data: { dealId, toPipelineId: candidate._id, toPipelineName: candidate.name },
			display: {
				kind: "entity",
				entityType: "deal",
				entityId: dealId as unknown as string,
			},
		});
	},
});

// ─── soft_delete_deal ───────────────────────────────────────────────────────

const softDeleteDeal = defineCapability<{ dealCode: string }>({
	name: "soft_delete_deal",
	module: "deals",
	group: "deals",
	permission: "deals.delete",
	risk: "reversible", // sets `deletedAt`; trash drawer restores.
	channels: ["chat", "mcp", "rest"],
	spec: {
		whenToCall:
			"Trash a deal — sets `deletedAt`. The trash drawer restores it; the row is NOT hard-deleted by this layer.",
		whenNotToCall:
			"the user actually wants to mark the deal lost — call close_deal({outcome:'lost'}). Hard-delete is not in this layer; surface 'use the trash drawer' if the user pushes for permanent removal.",
		requiredClarifications: ["dealCode"],
		synonyms: ["delete deal", "remove deal", "trash deal", "drop deal"],
		goodExample: { dealCode: "D-007" },
	},
	drive: {
		onSuccess:
			"Confirm in one short sentence. Mention the deal is recoverable from the trash drawer.",
	},
	input: z.object({
		dealCode: z.string().min(1).describe("Deal code (D-NNN)."),
	}),
	run: async (cap, rawArgs) => {
		const { ctx, principal } = cap;
		const dealId = (rawArgs as unknown as { dealId?: string }).dealId as
			| Id<"deals">
			| undefined;
		if (!dealId) {
			return failed("not_found", `Could not resolve deal ${rawArgs.dealCode}.`);
		}
		await ctx.runMutation(internal.crm.entities.deals.mutations.softDeleteForAI, {
			orgId: principal.orgId,
			userId: principal.userId,
			dealId,
		});
		return ok({
			headline: `Trashed ${rawArgs.dealCode}.`,
			changes: [
				{ label: "Code", value: rawArgs.dealCode, emphasis: "unchanged" },
				{ label: "Status", value: "trashed (recoverable)", emphasis: "changed" },
			],
			facts: ["Recoverable from the trash drawer — soft-delete only."],
			data: { dealId, dealCode: rawArgs.dealCode },
			// Audit §2 fix — soft-delete is reversible; the row still
			// exists (with `deletedAt` set) so the entity card renders
			// in trash state. Lets the user click through to restore.
			display: {
				kind: "entity",
				entityType: "deal",
				entityId: dealId as unknown as string,
			},
		});
	},
});

// ─── get_deal_detail ────────────────────────────────────────────────────────

const getDealDetail = defineCapability<{ dealCode: string }>({
	name: "get_deal_detail",
	module: "deals",
	group: "deals",
	permission: "deals.view",
	risk: "safe",
	channels: ["chat", "whatsapp", "mcp", "rest"],
	spec: {
		whenToCall:
			"Read one deal's full column data when the user gave a D-NNN code. Use BEFORE move_stage / close_deal / change_pipeline so you confirm what you're acting on.",
		whenNotToCall: "the user mentioned a name or company — search_crm first.",
		requiredClarifications: ["dealCode"],
		synonyms: ["show deal", "open D-", "look up deal"],
		goodExample: { dealCode: "D-007" },
	},
	drive: {
		onSuccess:
			"Reply with one short sentence naming the title + value + current stage. The card carries the full table.",
		onEmpty: "Surface the not-found plainly. Suggest search_crm if the user used a name.",
	},
	input: z.object({
		dealCode: z.string().min(1).describe("Deal code (D-NNN)."),
	}),
	run: async (cap, args) => {
		const { ctx, principal } = cap;
		const row = (await ctx.runQuery(internal.crm.entities.deals.queries.getByDealCodeForAI, {
			orgId: principal.orgId,
			userId: principal.userId,
			dealCode: args.dealCode,
		})) as null | Record<string, unknown>;
		if (!row) {
			return failed("not_found", `No deal with code ${args.dealCode}.`);
		}
		const facts: string[] = [];
		if (row.title) facts.push(`Title: ${row.title}`);
		if (row.value !== undefined && row.value !== null)
			facts.push(`Value: ${row.value}${row.currency ? ` ${row.currency}` : ""}`);
		if (row.wonAt) facts.push("Status: won");
		else if (row.lostAt) facts.push("Status: lost");
		else facts.push("Status: open");
		if (row.personCode) facts.push(`Person: ${row.personCode}`);
		if (row.companyCode) facts.push(`Company: ${row.companyCode}`);
		return ok({
			headline: `${row.dealCode}: ${row.title ?? "(no title)"}.`,
			facts,
			data: row,
			display: {
				kind: "entity",
				entityType: "deal",
				entityId: String(row._id),
			},
		});
	},
});

// ─── Public surface ─────────────────────────────────────────────────────────

export const DEALS_CAPABILITIES = [
	createDeal,
	moveStage,
	closeDeal,
	reopenDeal,
	changePipeline,
	softDeleteDeal,
	getDealDetail,
];

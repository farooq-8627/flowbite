/**
 * convex/ai/tools/introspect.ts
 *
 * Always-on, read-only introspection tools. These give the model a way
 * to ASK what's in the workspace before trying to mutate it — fixing
 * the audit's "screenshot bug" recovery path (PHASE-3-AI-AUDIT.md §1).
 *
 * Without these tools, when the user asks "what fields are on leads?",
 * a small model has no way to answer. It guesses by trying `create_field`
 * (a write tool!), which fails for several reasons, and the agent loop
 * exhausts its step budget.
 *
 * Tools (all `layer: "always"`, `permission: null`, `confirmation: "none"`):
 *   - list_entity_fields
 *   - list_pipelines
 *   - list_my_permissions
 *   - list_active_layers
 *
 * Each runs as a read-only Convex query — no DB writes, no rate limit.
 */
import { z } from "zod";
import type { Id } from "../../_generated/dataModel";
import { getActiveRequestContext, registerTool } from "../toolRegistry";
import { runTool, type ToolContext, toolQuery } from "./_shared";

let _ctx: ToolContext | null = null;
export function setIntrospectContext(c: ToolContext): void {
	_ctx = c;
}
function getCtx(): ToolContext {
	if (!_ctx) throw new Error("introspect ctx not bound");
	return _ctx;
}

// ─── list_entity_fields ──────────────────────────────────────────────────────

registerTool({
	name: "list_entity_fields",
	layer: "always",
	permission: null,
	confirmation: "none",
	description: `
Read-only: list every field defined on a CRM entity (lead / contact / deal / company).
Use this BEFORE update_entity or create_* when you don't know the field schema.
Returns the field's name, label, type, and whether it's required.
  `.trim(),
	runbook: {
		onSuccess:
			"Summarise the field list for the user — group by required vs optional, mention any select-type fields' allowed values. Don't dump raw JSON.",
		onEmpty:
			"Tell the user the entity has no custom fields configured yet, only the system fields. Suggest opening Settings → Fields to add some.",
	},
	example: { entityType: "lead" },
	schema: z.object({
		entityType: z.enum(["lead", "contact", "deal", "company"]),
	}),
	execute: async ({ entityType }) =>
		runTool(async () => {
			const { ctx, orgId } = getCtx();
			const fields = (await toolQuery(getCtx(), "crm/fields/fieldDefinitions/queries:listByEntity",
				{ orgId, entityType },)) as Array<{
				_id: Id<"fieldDefinitions">;
				name: string;
				label: string;
				labelAr?: string;
				type?: string;
				kind?: string;
				required?: boolean;
				options?: string[] | null;
				groupName?: string | null;
				system?: boolean;
				hidden?: boolean;
			}>;

			const visible = fields.filter((f) => !f.hidden);
			const summary = visible.map((f) => ({
				name: f.name,
				label: f.label,
				type: f.type ?? f.kind ?? "text",
				required: f.required === true,
				system: f.system === true,
				options: f.options ?? undefined,
				group: f.groupName ?? undefined,
			}));
			return {
				ok: true as const,
				data: {
					entityType,
					fieldCount: summary.length,
					fields: summary,
				},
				display: {
					kind: "text" as const,
					text: `Found ${summary.length} field(s) on ${entityType}.`,
				},
			};
		}),
});

// ─── list_pipelines ──────────────────────────────────────────────────────────

registerTool({
	name: "list_pipelines",
	layer: "always",
	permission: "pipelines.view",
	confirmation: "none",
	description: `
Read-only: list every pipeline configured for the workspace.
Returns each pipeline's name, the entity type it tracks (default: deal),
and the ordered stages with their codes and whether each is final
(won / lost). Use BEFORE move_deal_stage so you know the stage codes.
  `.trim(),
	runbook: {
		onSuccess:
			"Show the pipeline name and stage chain (e.g. 'Sales: New → Qualified → Proposal → Won/Lost'). When the user asks to move a deal, reference the stage code, not the human label.",
		onEmpty: "Tell the user no pipeline exists yet and offer to create one (requires the pipelines layer + admin permission).",
	},
	example: {},
	schema: z.object({}),
	execute: async () =>
		runTool(async () => {
			const { ctx, orgId } = getCtx();
			const pipelines = (await toolQuery(getCtx(), "crm/fields/pipelines/queries:listByOrg",
				{ orgId },)) as Array<{
				_id: Id<"pipelines">;
				name: string;
				entityType: string;
				isDefault?: boolean;
				stages: Array<{
					id: string;
					name: string;
					code: string;
					isFinal?: boolean;
					finalType?: "won" | "lost";
					isDefaultStage?: boolean;
				}>;
			}>;

			const summary = pipelines.map((p) => ({
				name: p.name,
				entityType: p.entityType,
				isDefault: p.isDefault === true,
				stages: p.stages.map((s) => ({
					name: s.name,
					code: s.code,
					isFinal: s.isFinal === true,
					finalType: s.finalType,
					isDefault: s.isDefaultStage === true,
				})),
			}));
			return {
				ok: true as const,
				data: { pipelineCount: summary.length, pipelines: summary },
				display: {
					kind: "text" as const,
					text:
						summary.length === 0
							? "No pipelines configured yet."
							: `Found ${summary.length} pipeline(s).`,
				},
			};
		}),
});

// ─── list_my_permissions ─────────────────────────────────────────────────────

registerTool({
	name: "list_my_permissions",
	layer: "always",
	permission: null,
	confirmation: "none",
	description: `
Read-only: list every permission the current user holds in this workspace.
Use this when the user asks "can I do X?" or when you're about to attempt
an action that might be permission-denied — checking first lets you give
a polite, specific refusal instead of failing.
  `.trim(),
	runbook: {
		onSuccess:
			"If the user asked a yes/no permission question, answer in one sentence. Don't list every permission unless asked.",
	},
	example: {},
	schema: z.object({}),
	execute: async () =>
		runTool(async () => {
			const { permissions } = getCtx();
			// Group permissions by domain prefix for readability.
			const grouped: Record<string, string[]> = {};
			for (const p of permissions) {
				const dot = p.indexOf(".");
				const key = dot === -1 ? "(other)" : p.slice(0, dot);
				if (!grouped[key]) grouped[key] = [];
				grouped[key].push(p);
			}
			return {
				ok: true as const,
				data: {
					count: permissions.length,
					grouped,
					permissions: [...permissions].sort(),
				},
				display: {
					kind: "text" as const,
					text: `You hold ${permissions.length} permission(s) across ${Object.keys(grouped).length} area(s).`,
				},
			};
		}),
});

// ─── list_active_layers ──────────────────────────────────────────────────────

registerTool({
	name: "list_active_layers",
	layer: "always",
	permission: null,
	confirmation: "none",
	description: `
Read-only: list which tool layers are currently active for this turn.
Always-on layer is implicit. Layers like 'pipelines', 'fields', 'settings',
'bulk', 'templates', 'data', 'tags', 'views', 'categories', 'members' are
loaded only after a successful expand_tools call. Use this BEFORE calling
expand_tools so you don't redundantly request a layer that's already on.
  `.trim(),
	runbook: {
		onSuccess:
			"Tell the user which layers are active and which are inactive. Don't pre-emptively expand inactive ones — wait for an action that needs them.",
	},
	example: {},
	schema: z.object({}),
	execute: async () =>
		runTool(async () => {
			// expand_tools writes activated layers into the per-request context
			// stamped onto toolRegistry's module-level holder. Read it via the
			// public getter — we never reach into private state.
			const active = getActiveRequestContext();
			const expandedLayers: string[] = active?.expandedLayers ?? [];
			const allLayers = [
				"pipelines",
				"fields",
				"tags",
				"views",
				"categories",
				"members",
				"settings",
				"bulk",
				"templates",
				"data",
			];
			return {
				ok: true as const,
				data: {
					alwaysOn: true,
					expanded: expandedLayers,
					inactive: allLayers.filter((l) => !expandedLayers.includes(l)),
				},
				display: {
					kind: "text" as const,
					text:
						expandedLayers.length === 0
							? "Only the always-on layer is active. Call expand_tools to load more."
							: `Active layers: always-on, ${expandedLayers.join(", ")}.`,
				},
			};
		}),
});

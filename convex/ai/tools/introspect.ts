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
import {
	PERMISSION_CATALOG,
	PERMISSION_MODULE_LABELS,
	PERMISSION_MODULE_ORDER,
} from "../../_shared/permissions/catalog";
import { entityTypeEnum } from "../../_shared/synonyms";
import { WIDGET_KEYS, WIDGETS } from "../../_shared/widgetRegistry";
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
		entityType: entityTypeEnum(),
	}),
	execute: async ({ entityType }) =>
		runTool(async () => {
			const { orgId } = getCtx();
			const fields = (await toolQuery(
				getCtx(),
				"crm/fields/fieldDefinitions/queries:listByEntity",
				{ orgId, entityType },
			)) as Array<{
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
		onEmpty:
			"Tell the user no pipeline exists yet and offer to create one (requires the pipelines layer + admin permission).",
	},
	example: {},
	schema: z.object({}),
	execute: async () =>
		runTool(async () => {
			const { orgId } = getCtx();
			const pipelines = (await toolQuery(getCtx(), "crm/fields/pipelines/queries:listByOrg", {
				orgId,
			})) as Array<{
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
'bulk', 'templates', 'data', 'tags', 'views', 'categories', 'members',
'messaging', 'files', 'timeline', 'notifications', 'analytics', 'creative', 'dashboard' are loaded only after a
successful expand_tools call. Use this BEFORE calling expand_tools so you
don't redundantly request a layer that's already on.
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
				"messaging",
				"files",
				"timeline",
				"notifications",
				"analytics",
				"creative",
				"dashboard",
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

// ─── list_tags ──────────────────────────────────────────────────────────────

registerTool({
	name: "list_tags",
	layer: "always",
	permission: null,
	confirmation: "none",
	description: `
Read-only: list every tag in the workspace. The system prompt only
includes the top 30 tags by recent activity — call this when the user
asks about tags past that cap, or when you need to verify a tag exists
before calling attach_tag / create_tag.
	`.trim(),
	runbook: {
		onSuccess:
			"Render as a comma-separated list. If the user asked about a specific tag, confirm whether it exists.",
		onEmpty: "Tell the user no tags exist and offer to create one (requires the tags layer).",
	},
	example: {},
	schema: z.object({}),
	execute: async () =>
		runTool(async () => {
			const tc = getCtx();
			const tags = (await toolQuery(tc, "crm/shared/tags/queries:listByOrg", {
				orgId: tc.orgId,
			})) as Array<{
				_id: string;
				name: string;
				color?: string;
			}>;
			return {
				ok: true as const,
				data: {
					count: tags.length,
					tags: tags.map((t) => ({ id: t._id, name: t.name, color: t.color })),
				},
				display: {
					kind: "text" as const,
					text:
						tags.length === 0
							? "No tags configured yet."
							: `${tags.length} tag(s) in this workspace.`,
				},
			};
		}),
});

// ─── list_categories ────────────────────────────────────────────────────────

registerTool({
	name: "list_categories",
	layer: "always",
	permission: null,
	confirmation: "none",
	description: `
Read-only: list note categories (active and archived). Use before
add_note when the user mentions a category by name to verify it exists.
	`.trim(),
	runbook: {
		onSuccess:
			"Mention category counts; enumerate names only when the user asked for the full list.",
		onEmpty: "Tell the user no categories exist yet.",
	},
	example: {},
	schema: z.object({}),
	execute: async () =>
		runTool(async () => {
			const tc = getCtx();
			const cats = (await toolQuery(tc, "crm/shared/noteCategories/queries:listForOrg", {
				orgId: tc.orgId,
			})) as Array<{
				_id: string;
				name: string;
				color?: string;
				icon?: string;
				isArchived?: boolean;
			}>;
			const active = cats.filter((c) => !c.isArchived);
			const archived = cats.filter((c) => c.isArchived);
			return {
				ok: true as const,
				data: {
					activeCount: active.length,
					archivedCount: archived.length,
					active: active.map((c) => ({ id: c._id, name: c.name, color: c.color })),
					archived: archived.map((c) => ({ id: c._id, name: c.name })),
				},
				display: {
					kind: "text" as const,
					text:
						cats.length === 0
							? "No note categories configured yet."
							: `${active.length} active, ${archived.length} archived note categor(ies).`,
				},
			};
		}),
});

// ─── list_members ───────────────────────────────────────────────────────────

registerTool({
	name: "list_members",
	layer: "always",
	permission: "members.view",
	confirmation: "none",
	description: `
Read-only: list every active member in the workspace with name, email,
and role. Use when the user asks about teammates or before
change_member_role / invite_member.
	`.trim(),
	runbook: {
		onSuccess: "List names + roles in one short response. Don't dump emails unless asked.",
		onPermissionDenied: "Tell the user they need members.view permission.",
	},
	example: {},
	schema: z.object({}),
	execute: async () =>
		runTool(async () => {
			const tc = getCtx();
			const rows = (await toolQuery(tc, "orgs/queries:listMembers", {
				orgId: tc.orgId,
			})) as Array<{
				userId: string;
				name?: string;
				email?: string;
				roleId?: string;
				deletedAt?: number;
			}>;
			const live = rows.filter((m) => !m.deletedAt);
			return {
				ok: true as const,
				data: {
					count: live.length,
					members: live.map((m) => ({
						userId: m.userId,
						name: m.name ?? "Unnamed",
						email: m.email,
						roleId: m.roleId,
					})),
				},
				display: {
					kind: "text" as const,
					text: `${live.length} active member(s).`,
				},
			};
		}),
});

// ─── list_saved_views ───────────────────────────────────────────────────────

registerTool({
	name: "list_saved_views",
	layer: "always",
	permission: null,
	confirmation: "none",
	description: `
Read-only: list saved filter presets ("views") for the current user.
Use when the user mentions a view by name, or to suggest "open your
'Hot leads' view" when relevant.
	`.trim(),
	runbook: {
		onSuccess:
			"Show view name + entity type + scope (user/org). If empty, suggest creating one.",
		onEmpty: "Tell the user they have no saved views yet.",
	},
	example: {},
	schema: z.object({
		entityType: z.optional(z.enum(["lead", "contact", "deal", "company"])),
	}),
	execute: async (args) =>
		runTool(async () => {
			const tc = getCtx();
			const views = (await toolQuery(tc, "crm/shared/savedViews/queries:listForUser", {
				orgId: tc.orgId,
				...(args.entityType ? { entityType: args.entityType } : {}),
			})) as Array<{
				_id: string;
				name: string;
				entityType: string;
				scope: string;
				isPinned?: boolean;
			}>;
			return {
				ok: true as const,
				data: {
					count: views.length,
					views: views.map((v) => ({
						id: v._id,
						name: v.name,
						entityType: v.entityType,
						scope: v.scope,
						pinned: v.isPinned === true,
					})),
				},
				display: {
					kind: "text" as const,
					text:
						views.length === 0
							? "No saved views yet."
							: `${views.length} saved view(s).`,
				},
			};
		}),
});

// ─── list_field_options ─────────────────────────────────────────────────────

registerTool({
	name: "list_field_options",
	layer: "always",
	permission: null,
	confirmation: "none",
	description: `
Read-only: list every option for a select / multi-select field. The
system prompt caps options at 20 per field — call this when the field
has more than 20 options or when you need to verify an option exists
before calling update_entity / create_*.
	`.trim(),
	runbook: {
		onSuccess:
			"Confirm whether the option the user mentioned is in the list. Don't dump every option unless asked.",
		onEmpty:
			"Tell the user the field exists but has no options configured. They may need update_field to add some.",
	},
	example: { entityType: "lead", fieldName: "industry_vertical" },
	schema: z.object({
		entityType: z.enum(["lead", "contact", "deal", "company"]),
		fieldName: z.string().describe("Machine name of the field, e.g. 'industry_vertical'."),
	}),
	execute: async ({ entityType, fieldName }) =>
		runTool(async () => {
			const tc = getCtx();
			const fields = (await toolQuery(
				tc,
				"crm/fields/fieldDefinitions/queries:listByEntity",
				{ orgId: tc.orgId, entityType },
			)) as Array<{
				name: string;
				label: string;
				type?: string;
				options?: string[] | null;
			}>;
			const match = fields.find((f) => f.name === fieldName);
			if (!match) {
				return {
					ok: false as const,
					error: `Field '${fieldName}' not found on ${entityType}. Call list_entity_fields('${entityType}') to see available fields.`,
					code: "FIELD_NOT_FOUND",
				};
			}
			const options = match.options ?? [];
			return {
				ok: true as const,
				data: {
					entityType,
					fieldName: match.name,
					label: match.label,
					type: match.type,
					optionCount: options.length,
					options,
				},
				display: {
					kind: "text" as const,
					text:
						options.length === 0
							? `Field '${match.label}' has no configured options.`
							: `Field '${match.label}' has ${options.length} option(s).`,
				},
			};
		}),
});

// ─── list_widgets ───────────────────────────────────────────────────────────

registerTool({
	name: "list_widgets",
	layer: "always",
	permission: null,
	confirmation: "none",
	description: `
Read-only: list every dashboard widget the platform supports + the
current org's layout order. Returns each widget's key, label,
description, category (crm / scheduling / productivity / ai), size
(kpi / half / full), and a placeholder flag. Use this BEFORE
update_dashboard_layout when the user wants to add, remove, or
reorder dashboard widgets.
	`.trim(),
	runbook: {
		onSuccess:
			"Group widgets by category in your reply. Don't dump every key — surface the ones the user needs and reference list_widgets again only if the next step requires it.",
		onEmpty:
			"Should never be empty (the registry is a static catalogue) — if it returns empty, surface the issue.",
	},
	example: {},
	schema: z.object({}),
	execute: async () =>
		runTool(async () => {
			const tc = getCtx();
			const org = await tc.ctx.runQuery(
				"orgs/queries:getInternal" as never,
				{ orgId: tc.orgId } as never,
			);
			const settings = (org as { settings?: { dashboardMetrics?: string[] } } | null)
				?.settings;
			const currentLayout = settings?.dashboardMetrics ?? [];

			const widgets = WIDGET_KEYS.map((key) => ({
				key,
				label: WIDGETS[key].label,
				description: WIDGETS[key].description,
				category: WIDGETS[key].category,
				size: WIDGETS[key].size,
				placeholder: WIDGETS[key].placeholder === true,
				inLayout: currentLayout.includes(key),
				layoutPosition: currentLayout.indexOf(key) >= 0 ? currentLayout.indexOf(key) : null,
			}));

			return {
				ok: true as const,
				data: {
					widgetCount: widgets.length,
					currentLayout,
					widgets,
				},
				display: {
					kind: "text" as const,
					text:
						currentLayout.length === 0
							? `${widgets.length} widget(s) supported. The dashboard is using the default layout.`
							: `${widgets.length} widget(s) supported; ${currentLayout.length} active on the dashboard.`,
				},
			};
		}),
});

// ─── list_permission_catalog ────────────────────────────────────────────────

registerTool({
	name: "list_permission_catalog",
	layer: "always",
	permission: null,
	confirmation: "none",
	description: `
Read-only: list every permission key defined by the platform, grouped by
module (org / members / leads / contacts / deals / companies / notes /
messages / tasks / tags / savedViews / pipelines / fields / ai /
activityLogs / notifications / files / data). Each row carries the
machine \`key\`, human \`label\`, \`description\`, the \`module\` it sits
under, and the \`defaultRoles\` it ships in (Owner / Admin / Member /
Viewer).

Use this when an admin asks "what permissions exist?", or before
\`change_member_role\` / role-editor work, to ground the conversation
in real keys instead of guessed names. To see what permissions the
CURRENT user holds, call \`list_my_permissions\` (different tool).
	`.trim(),
	runbook: {
		onSuccess:
			"Group keys by module in your reply. If the user asked about one module (e.g. 'tasks'), filter your answer to that bucket — don't dump every permission.",
		onEmpty:
			"Should never be empty (the catalog is a static SSOT) — if it returns 0, surface the issue.",
	},
	example: {},
	schema: z.object({
		module: z
			.optional(z.string())
			.describe(
				"Optional module filter (e.g. 'tasks', 'leads', 'ai'). When omitted, returns the full catalog grouped by module.",
			),
	}),
	execute: async ({ module }) =>
		runTool(async () => {
			const filterModule = typeof module === "string" ? module.trim() : "";
			const filtered = filterModule
				? PERMISSION_CATALOG.filter((p) => p.module === filterModule)
				: PERMISSION_CATALOG;

			if (filterModule && filtered.length === 0) {
				const known = [...new Set(PERMISSION_CATALOG.map((p) => p.module))].sort();
				return {
					ok: false as const,
					error: `Unknown permission module '${filterModule}'. Known modules: ${known.join(", ")}.`,
					code: "UNKNOWN_MODULE",
				};
			}

			// Group by module preserving the canonical render order.
			const grouped: Record<
				string,
				Array<{
					key: string;
					label: string;
					description: string | undefined;
					defaultRoles: string[];
				}>
			> = {};
			for (const entry of filtered) {
				if (!grouped[entry.module]) grouped[entry.module] = [];
				grouped[entry.module].push({
					key: entry.key,
					label: entry.label,
					description: entry.description,
					defaultRoles: [...entry.defaultRoles],
				});
			}

			const moduleOrder = filterModule
				? [filterModule]
				: PERMISSION_MODULE_ORDER.filter((m) => grouped[m]);
			const modules = moduleOrder.map((id) => ({
				id,
				// Note: PERMISSION_MODULE_LABELS for renamable entities carries
				// `{Leads}`-style placeholders. We surface them verbatim so the
				// model knows these are entity-label slots; chat callers that
				// render this back to the user should interpolate via the
				// frontend's `useEntityLabels()` hook.
				label: PERMISSION_MODULE_LABELS[id]?.label ?? id,
				moduleDescription: PERMISSION_MODULE_LABELS[id]?.description,
				permissions: grouped[id] ?? [],
			}));

			return {
				ok: true as const,
				data: {
					totalKeys: filtered.length,
					moduleCount: modules.length,
					modules,
				},
				display: {
					kind: "text" as const,
					text: filterModule
						? `${filtered.length} permission key(s) in module '${filterModule}'.`
						: `${filtered.length} permission key(s) across ${modules.length} module(s).`,
				},
			};
		}),
});

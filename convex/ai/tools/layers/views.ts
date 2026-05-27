/**
 * convex/ai/tools/layers/views.ts — Saved view management tools.
 */
import { z } from "zod";
import { entityTypeEnum } from "../../../_shared/synonyms";
import { registerTool } from "../../toolRegistry";
import { propose, requirePermission, runTool, type ToolContext, toolMutation } from "../_shared";

let _ctx: ToolContext | null = null;
export function setViewsContext(c: ToolContext): void {
	_ctx = c;
}
function getCtx(): ToolContext {
	if (!_ctx) throw new Error("views ctx");
	return _ctx;
}

registerTool({
	name: "create_saved_view",
	layer: "views",
	permission: "savedViews.createPersonal",
	confirmation: "twoStep",
	approvalCategory: "settings",
	description: "Create a new saved view (filter preset).",
	runbook: {
		onSuccess: "Confirm with the view's name and offer to pin it to the sidebar.",
		suggestNext: "pin_saved_view",
	},
	schema: z.object({
		name: z.string(),
		entityType: entityTypeEnum(),
		scope: z.enum(["user", "org"]).default("user"),
		filters: z.optional(z.record(z.string(), z.unknown())),
		columns: z.optional(z.array(z.string())),
	}),
	execute: async (args) => {
		const { permissions } = getCtx();
		requirePermission(
			permissions,
			args.scope === "org" ? "savedViews.createOrg" : "savedViews.createPersonal",
		);
		return propose("create_saved_view", args, {
			title: `Save view: ${args.name}`,
			fields: [
				{ label: "Name", value: args.name },
				{ label: "Entity", value: args.entityType },
				{ label: "Scope", value: args.scope },
			],
		});
	},
});

registerTool({
	name: "commit_create_saved_view",
	layer: "views",
	permission: "savedViews.createPersonal",
	confirmation: "none",
	description: "Internal: commit saved view creation.",
	schema: z.object({
		name: z.string(),
		entityType: entityTypeEnum(),
		scope: z.enum(["user", "org"]).default("user"),
		filters: z.optional(z.record(z.string(), z.unknown())),
		columns: z.optional(z.array(z.string())),
	}),
	execute: async (args) =>
		runTool(async () => {
			const { orgId, permissions } = getCtx();
			requirePermission(permissions, "savedViews.createPersonal");
			const result = await toolMutation(getCtx(), "crm/shared/savedViews/mutations:create", {
				orgId,
				...args,
			});
			return { ok: true as const, data: result, display: `✅ View "${args.name}" saved.` };
		}),
});

registerTool({
	name: "pin_saved_view",
	layer: "views",
	permission: "savedViews.createPersonal",
	confirmation: "none",
	description: "Pin or unpin a saved view to the sidebar.",
	runbook: {
		onSuccess: "Confirm in one short sentence.",
	},
	schema: z.object({ viewId: z.string() }),
	execute: async (args) =>
		runTool(async () => {
			const { orgId, permissions } = getCtx();
			requirePermission(permissions, "savedViews.createPersonal");
			await toolMutation(getCtx(), "crm/shared/savedViews/mutations:togglePin", {
				orgId,
				...args,
			});
			return { ok: true as const, data: args, display: `📌 View pin toggled.` };
		}),
});

registerTool({
	name: "delete_saved_view",
	layer: "views",
	permission: "savedViews.delete",
	confirmation: "twoStep",
	approvalCategory: "delete_record",
	description: "Delete a saved view.",
	runbook: {
		onSuccess: "Confirm in one short sentence.",
		onValidationError: "If viewId doesn't resolve, list the user's saved views.",
	},
	schema: z.object({ viewId: z.string(), name: z.string().describe("For preview") }),
	execute: async (args) => {
		const { permissions } = getCtx();
		requirePermission(permissions, "savedViews.delete");
		return propose("delete_saved_view", args, {
			title: `Delete view: ${args.name}`,
			fields: [{ label: "View", value: args.name }],
		});
	},
});

registerTool({
	name: "commit_delete_saved_view",
	layer: "views",
	permission: "savedViews.delete",
	confirmation: "none",
	description: "Internal: commit view deletion.",
	schema: z.object({ viewId: z.string() }),
	execute: async (args) =>
		runTool(async () => {
			const { orgId, permissions } = getCtx();
			requirePermission(permissions, "savedViews.delete");
			await toolMutation(getCtx(), "crm/shared/savedViews/mutations:remove", {
				orgId,
				...args,
			});
			return { ok: true as const, data: args, display: `✅ View deleted.` };
		}),
});

// ─── Stage 4 — update_saved_view (atomic) ────────────────────────────────────

registerTool({
	name: "update_saved_view",
	layer: "views",
	permission: "savedViews.createPersonal",
	confirmation: "none",
	description:
		"Rename a saved view, change its filters, sort, or columns. Atomic — small change, no propose card.",
	instruction: {
		whenToCall:
			"User asks to rename / re-filter / re-sort / re-column an existing saved view. The mutation only writes the fields you supply.",
		whenNotToCall:
			"the user wants to pin/unpin the view (use pin_saved_view) OR delete it (use delete_saved_view).",
		preflight: ["list_saved_views"],
		requiredClarifications: ["viewId"],
		synonyms: ["rename view", "edit saved view", "update view filters"],
		goodExample: {
			description: "User: 'Rename my Hot Leads view to Q4 Pipeline.'",
			args: { viewId: "abc123", name: "Q4 Pipeline" },
		},
	},
	runbook: {
		onSuccess: "Confirm in one short sentence.",
		onValidationError:
			"If viewId doesn't resolve, list available saved views via list_saved_views.",
		onPermissionDenied:
			"If the view is org-scoped and the user lacks savedViews.createOrg, tell them an admin must edit it.",
	},
	schema: z
		.object({
			viewId: z.string().describe("Convex savedViews _id."),
			name: z.optional(z.string().min(1)).describe("New name."),
			filters: z
				.optional(z.string())
				.describe("New filters (JSON-encoded string). Validated server-side."),
			sortBy: z.optional(z.string()).describe("New sort column."),
			sortOrder: z.optional(z.enum(["asc", "desc"])).describe("New sort direction."),
			columns: z.optional(z.array(z.string())).describe("New column list."),
		})
		.refine(
			(v) =>
				v.name !== undefined ||
				v.filters !== undefined ||
				v.sortBy !== undefined ||
				v.sortOrder !== undefined ||
				v.columns !== undefined,
			{
				message:
					"At least one of name / filters / sortBy / sortOrder / columns must be set.",
			},
		),
	execute: async (args) =>
		runTool(async () => {
			const { orgId, permissions } = getCtx();
			// Permission check: weakest gate — the public mutation re-checks
			// `savedViews.createOrg` for org-scoped views.
			requirePermission(permissions, "savedViews.createPersonal");
			await toolMutation(getCtx(), "crm/shared/savedViews/mutations:update", {
				orgId,
				viewId: args.viewId,
				name: args.name,
				filters: args.filters,
				sortBy: args.sortBy,
				sortOrder: args.sortOrder,
				columns: args.columns,
			});
			return { ok: true as const, data: args, display: `✏️ Saved view updated.` };
		}),
});

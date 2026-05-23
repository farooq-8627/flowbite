/**
 * convex/ai/tools/layers/views.ts — Saved view management tools.
 */
import { z } from "zod";
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
	description: "Create a new saved view (filter preset).",
	runbook: {
		onSuccess: "Confirm with the view's name and offer to pin it to the sidebar.",
		suggestNext: "pin_saved_view",
	},
	schema: z.object({
		name: z.string(),
		entityType: z.enum(["lead", "contact", "deal", "company"]),
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
		entityType: z.enum(["lead", "contact", "deal", "company"]),
		scope: z.enum(["user", "org"]).default("user"),
		filters: z.optional(z.record(z.string(), z.unknown())),
		columns: z.optional(z.array(z.string())),
	}),
	execute: async (args) =>
		runTool(async () => {
			const { ctx, orgId, permissions } = getCtx();
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
			const { ctx, orgId, permissions } = getCtx();
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
			const { ctx, orgId, permissions } = getCtx();
			requirePermission(permissions, "savedViews.delete");
			await toolMutation(getCtx(), "crm/shared/savedViews/mutations:remove", { orgId, ...args });
			return { ok: true as const, data: args, display: `✅ View deleted.` };
		}),
});

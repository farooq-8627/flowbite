/**
 * convex/ai/tools/layers/data.ts — Trash and restore tools.
 */
import { z } from "zod";
import { registerTool } from "../../toolRegistry";
import {
	propose,
	requirePermission,
	runTool,
	type ToolContext,
	toolMutation,
	toolQuery,
} from "../_shared";

let _ctx: ToolContext | null = null;
export function setDataContext(c: ToolContext): void {
	_ctx = c;
}
function getCtx(): ToolContext {
	if (!_ctx) throw new Error("data ctx");
	return _ctx;
}

registerTool({
	name: "view_trash",
	layer: "data",
	permission: "data.viewTrash",
	confirmation: "none",
	description: "List soft-deleted records still in trash, by entity type.",
	runbook: {
		onSuccess: "Show the trashed list. Offer to restore one when the user picks.",
		onEmpty: "Tell the user the trash is empty for that entity type.",
		suggestNext: "restore_entity",
	},
	schema: z.object({
		entityType: z.enum(["lead", "contact", "deal", "company"]),
		limit: z.number().min(1).max(50).default(20),
	}),
	execute: async (args) =>
		runTool(async () => {
			const { ctx, orgId, permissions } = getCtx();
			requirePermission(permissions, "data.viewTrash");
			const result = await toolQuery(getCtx(), "trash/queries:list", { orgId, ...args });
			return { ok: true as const, data: result };
		}),
});

registerTool({
	name: "restore_entity",
	layer: "data",
	permission: "data.restore",
	confirmation: "twoStep",
	description: "Restore a soft-deleted entity from trash.",
	runbook: {
		onSuccess: "Confirm with the entity's display name.",
		onPermissionDenied:
			"Tell the user they need data.restore permission. Suggest contacting an admin.",
	},
	schema: z.object({
		entityType: z.enum(["lead", "contact", "deal", "company"]),
		entityId: z.string(),
		name: z.string().describe("For preview"),
	}),
	execute: async (args) => {
		const { permissions } = getCtx();
		requirePermission(permissions, "data.restore");
		return propose("restore_entity", args, {
			title: `Restore ${args.entityType}: ${args.name}`,
			fields: [
				{ label: "Type", value: args.entityType },
				{ label: "Record", value: args.name },
			],
		});
	},
});

registerTool({
	name: "commit_restore_entity",
	layer: "data",
	permission: "data.restore",
	confirmation: "none",
	description: "Internal: commit restore.",
	schema: z.object({
		entityType: z.enum(["lead", "contact", "deal", "company"]),
		entityId: z.string(),
	}),
	execute: async (args) =>
		runTool(async () => {
			const { ctx, orgId, permissions } = getCtx();
			requirePermission(permissions, "data.restore");
			await toolMutation(getCtx(), "trash/mutations:restore", { orgId, ...args });
			return {
				ok: true as const,
				data: args,
				display: {
					kind: "entity" as const,
					entityType: args.entityType,
					entityId: args.entityId,
				},
			};
		}),
});

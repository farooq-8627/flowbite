/**
 * convex/ai/tools/layers/tags.ts — Tag management tools.
 */
import { z } from "zod";
import { registerTool } from "../../toolRegistry";
import { propose, requirePermission, runTool, type ToolContext, toolMutation } from "../_shared";

let _ctx: ToolContext | null = null;
export function setTagsContext(c: ToolContext): void {
	_ctx = c;
}
function getCtx(): ToolContext {
	if (!_ctx) throw new Error("tags ctx");
	return _ctx;
}

registerTool({
	name: "create_tag",
	layer: "tags",
	permission: "tags.manage",
	confirmation: "none",
	description: "Create a new org-wide tag.",
	schema: z.object({ name: z.string(), color: z.optional(z.string()) }),
	execute: async (args) =>
		runTool(async () => {
			const { ctx, orgId, permissions } = getCtx();
			requirePermission(permissions, "tags.manage");
			const result = await toolMutation(ctx, "crm/shared/tags/mutations:create", {
				orgId,
				...args,
			});
			return { ok: true as const, data: result, display: `🏷️ Tag "${args.name}" created.` };
		}),
});

registerTool({
	name: "attach_tag",
	layer: "tags",
	permission: "tags.attach",
	confirmation: "none",
	description: "Attach a tag to a lead, contact, deal, or company.",
	schema: z.object({
		tagId: z.string(),
		entityType: z.enum(["lead", "contact", "deal", "company"]),
		entityId: z.string(),
	}),
	execute: async (args) =>
		runTool(async () => {
			const { ctx, orgId, permissions } = getCtx();
			requirePermission(permissions, "tags.attach");
			await toolMutation(ctx, "crm/shared/tags/mutations:attachToEntity", { orgId, ...args });
			return { ok: true as const, data: args, display: `🏷️ Tag attached.` };
		}),
});

registerTool({
	name: "detach_tag",
	layer: "tags",
	permission: "tags.attach",
	confirmation: "none",
	description: "Remove a tag from an entity.",
	schema: z.object({
		tagId: z.string(),
		entityType: z.enum(["lead", "contact", "deal", "company"]),
		entityId: z.string(),
	}),
	execute: async (args) =>
		runTool(async () => {
			const { ctx, orgId, permissions } = getCtx();
			requirePermission(permissions, "tags.attach");
			await toolMutation(ctx, "crm/shared/tags/mutations:detachFromEntity", {
				orgId,
				...args,
			});
			return { ok: true as const, data: args, display: `🏷️ Tag removed.` };
		}),
});

registerTool({
	name: "delete_tag",
	layer: "tags",
	permission: "tags.manage",
	confirmation: "twoStep",
	description: "Delete a tag from the org. Detaches from all entities.",
	schema: z.object({ tagId: z.string(), name: z.string().describe("For preview only") }),
	execute: async (args) => {
		const { permissions } = getCtx();
		requirePermission(permissions, "tags.manage");
		return propose("delete_tag", args, {
			title: `Delete tag: ${args.name}`,
			fields: [{ label: "Tag", value: args.name }],
		});
	},
});

registerTool({
	name: "commit_delete_tag",
	layer: "tags",
	permission: "tags.manage",
	confirmation: "none",
	description: "Internal: commit tag deletion.",
	schema: z.object({ tagId: z.string() }),
	execute: async (args) =>
		runTool(async () => {
			const { ctx, orgId, permissions } = getCtx();
			requirePermission(permissions, "tags.manage");
			await toolMutation(ctx, "crm/shared/tags/mutations:remove", { orgId, ...args });
			return { ok: true as const, data: args, display: `✅ Tag deleted.` };
		}),
});

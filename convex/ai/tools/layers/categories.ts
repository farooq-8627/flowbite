/**
 * convex/ai/tools/layers/categories.ts — Note category management tools.
 */
import { z } from "zod";
import { registerTool } from "../../toolRegistry";
import { propose, requirePermission, runTool, type ToolContext, toolMutation } from "../_shared";

let _ctx: ToolContext | null = null;
export function setCategoriesContext(c: ToolContext): void {
	_ctx = c;
}
function getCtx(): ToolContext {
	if (!_ctx) throw new Error("categories ctx");
	return _ctx;
}

registerTool({
	name: "create_note_category",
	layer: "categories",
	permission: "notes.categories.manage",
	confirmation: "none",
	description: "Create a new note category.",
	runbook: {
		onSuccess: "Confirm with the new category name.",
	},
	schema: z.object({
		name: z.string(),
		color: z.optional(z.string()),
		icon: z.optional(z.string()),
	}),
	execute: async (args) =>
		runTool(async () => {
			const { orgId, permissions } = getCtx();
			requirePermission(permissions, "notes.categories.manage");
			const result = await toolMutation(
				getCtx(),
				"crm/shared/noteCategories/mutations:create",
				{
					orgId,
					...args,
				},
			);
			return {
				ok: true as const,
				data: result,
				display: `✅ Category "${args.name}" created.`,
			};
		}),
});

registerTool({
	name: "rename_note_category",
	layer: "categories",
	permission: "notes.categories.manage",
	confirmation: "none",
	description: "Rename or update a note category.",
	runbook: {
		onSuccess: "Confirm in one short sentence.",
	},
	schema: z.object({
		categoryId: z.string(),
		name: z.optional(z.string()),
		color: z.optional(z.string()),
		icon: z.optional(z.string()),
	}),
	execute: async (args) =>
		runTool(async () => {
			const { orgId, permissions } = getCtx();
			requirePermission(permissions, "notes.categories.manage");
			await toolMutation(getCtx(), "crm/shared/noteCategories/mutations:update", {
				orgId,
				...args,
			});
			return { ok: true as const, data: args, display: `✅ Category updated.` };
		}),
});

registerTool({
	name: "archive_note_category",
	layer: "categories",
	permission: "notes.categories.manage",
	confirmation: "twoStep",
	approvalCategory: "settings",
	description: "Archive a note category. Existing notes keep their assignment.",
	runbook: {
		onSuccess: "Confirm in one short sentence.",
	},
	schema: z.object({ categoryId: z.string(), name: z.string().describe("For preview") }),
	execute: async (args) => {
		const { permissions } = getCtx();
		requirePermission(permissions, "notes.categories.manage");
		return propose("archive_note_category", args, {
			title: `Archive category: ${args.name}`,
			fields: [{ label: "Category", value: args.name }],
		});
	},
});

registerTool({
	name: "commit_archive_note_category",
	layer: "categories",
	permission: "notes.categories.manage",
	confirmation: "none",
	description: "Internal: commit category archive.",
	schema: z.object({ categoryId: z.string() }),
	execute: async (args) =>
		runTool(async () => {
			const { orgId, permissions } = getCtx();
			requirePermission(permissions, "notes.categories.manage");
			await toolMutation(getCtx(), "crm/shared/noteCategories/mutations:setArchived", {
				orgId,
				categoryId: args.categoryId,
				archived: true,
			});
			return { ok: true as const, data: args, display: `✅ Category archived.` };
		}),
});

registerTool({
	name: "reorder_note_categories",
	layer: "categories",
	permission: "notes.categories.manage",
	confirmation: "none",
	description: "Reorder note categories. Provide the new ordered list of categoryIds.",
	runbook: {
		onSuccess: "Confirm in one short sentence.",
	},
	schema: z.object({ orderedIds: z.array(z.string()) }),
	execute: async (args) =>
		runTool(async () => {
			const { orgId, permissions } = getCtx();
			requirePermission(permissions, "notes.categories.manage");
			await toolMutation(getCtx(), "crm/shared/noteCategories/mutations:reorder", {
				orgId,
				...args,
			});
			return { ok: true as const, data: args, display: `✅ Categories reordered.` };
		}),
});

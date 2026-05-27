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

// ─── delete_note_category (P1.3 G-5) ────────────────────────────────────────
//
// Hard delete — only succeeds when zero notes reference the category.
// The mutation refuses with `IN_USE` otherwise; the AI should fall back
// to `archive_note_category` in that case. We use `delete_record`
// approval category so user-level approval prefs apply (categories
// can't be undeleted, so a human-in-the-loop check is appropriate even
// when the destructive blast radius is bounded by the IN_USE guard).

registerTool({
	name: "delete_note_category",
	layer: "categories",
	permission: "notes.categories.manage",
	confirmation: "twoStep",
	approvalCategory: "delete_record",
	description:
		"Hard delete a note category. Refuses if any notes still reference it (move them or archive instead). The default category cannot be deleted.",
	instruction: {
		whenToCall:
			"User says 'delete the X category', 'remove the empty X category', 'get rid of <category>'. Always run list_categories first to confirm the category has zero notes — if it has notes, propose archive_note_category instead.",
		whenNotToCall:
			"the category still has notes (offer archive_note_category) OR the user wants to make it the default (use set_default_note_category).",
		preflight: ["list_categories"],
		requiredClarifications: ["categoryId"],
		synonyms: ["delete category", "remove category", "hard delete category", "trash category"],
		goodExample: {
			description: "User: 'Delete the empty Old-Imports category.'",
			args: { categoryId: "k_oldimports_id", name: "Old-Imports" },
		},
	},
	runbook: {
		onSuccess: "Confirm in one short sentence with the deleted category name.",
		onValidationError:
			"IN_USE → tell the user the category still has notes; suggest archive_note_category. DEFAULT_REQUIRED → ask them to mark a different category as default first via set_default_note_category.",
	},
	schema: z.object({
		categoryId: z.string().min(1),
		name: z.string().describe("Category name — for the propose card."),
	}),
	execute: async (args) => {
		const { permissions } = getCtx();
		requirePermission(permissions, "notes.categories.manage");
		return propose("delete_note_category", args, {
			title: `Delete category: ${args.name}`,
			fields: [
				{ label: "Category", value: args.name },
				{
					label: "Note",
					value: "Hard delete. Refuses if any notes still use this category.",
				},
			],
		});
	},
});

registerTool({
	name: "commit_delete_note_category",
	layer: "categories",
	permission: "notes.categories.manage",
	confirmation: "none",
	description: "Internal: commit pre-approved category delete.",
	schema: z.object({ categoryId: z.string(), name: z.string() }),
	execute: async (args) =>
		runTool(async () => {
			const { orgId, permissions } = getCtx();
			requirePermission(permissions, "notes.categories.manage");
			await toolMutation(getCtx(), "crm/shared/noteCategories/mutations:remove", {
				orgId,
				categoryId: args.categoryId,
			});
			return {
				ok: true as const,
				data: args,
				display: { kind: "text" as const, text: `✅ Category "${args.name}" deleted.` },
			};
		}),
});

// ─── set_default_note_category (P1.4) ───────────────────────────────────────
//
// Atomic: marks a category as the org-wide default. There is exactly one
// default per org (enforced by the `setDefault` mutation which clears any
// previously-flagged defaults via the `by_org_and_default` index). Reversible
// by re-marking a different category, so no twoStep gate is needed; the
// approval category is `update_record` so user-level prefs still apply.

registerTool({
	name: "set_default_note_category",
	layer: "categories",
	permission: "notes.categories.manage",
	confirmation: "none",
	approvalCategory: "update_record",
	description:
		"Mark a note category as the workspace default. New notes (and AI-created notes) without an explicit category fall back to the default. There is exactly one default per workspace; setting a new one clears the previous flag automatically.",
	instruction: {
		whenToCall:
			"User says 'make X the default category', 'set <category> as default', 'use X for new notes by default'. Always run list_categories first to confirm the category exists and isn't archived.",
		whenNotToCall:
			"the category is archived (restore it first via update_note_category) OR the user wants to delete a category (use delete_note_category).",
		preflight: ["list_categories"],
		requiredClarifications: ["categoryId"],
		synonyms: [
			"make default category",
			"set default category",
			"default note category",
			"use category as default",
		],
		goodExample: {
			description: "User: 'Make the Calls category the default for new notes.'",
			args: { categoryId: "k_calls_id", name: "Calls" },
		},
	},
	runbook: {
		onSuccess: "Confirm in one short sentence with the new default's name.",
		onValidationError:
			"ARCHIVED → ask the user to restore the category first via update_note_category. NOT_FOUND → re-run list_categories; the id is wrong.",
		onPermissionDenied: "Tell the user they need notes.categories.manage permission.",
	},
	schema: z.object({
		categoryId: z.string().min(1),
		name: z
			.string()
			.optional()
			.describe(
				"Category display name — included in the success line. Optional (the mutation doesn't need it).",
			),
	}),
	execute: async (args) =>
		runTool(async () => {
			const { orgId, permissions } = getCtx();
			requirePermission(permissions, "notes.categories.manage");
			await toolMutation(getCtx(), "crm/shared/noteCategories/mutations:setDefault", {
				orgId,
				categoryId: args.categoryId,
			});
			const label = args.name ? `"${args.name}"` : "category";
			return {
				ok: true as const,
				data: args,
				display: { kind: "text" as const, text: `✅ ${label} is now the default.` },
			};
		}),
});

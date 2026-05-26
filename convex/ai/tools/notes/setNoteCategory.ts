/**
 * convex/ai/tools/notes/setNoteCategory.ts
 *
 * Stage 3 of /SPRINT-PLAN.md (2026-05-26). Atomic move a note into a
 * different category (column on the kanban board). Single round-trip,
 * no confirmation — the user already picked a category by name.
 *
 *   set_note_category → calls notes/mutations:setCategoryForAI
 *
 * Permission: owner with `notes.updateOwn` OR admin with `notes.deleteAny`.
 *
 * Note ordering: the underlying mutation auto-stamps a "top of column"
 * sortOrder when no explicit `sortOrder` is supplied. Since the AI is
 * never doing kanban-drag-style positioning (it doesn't know the
 * neighbour ids), we deliberately omit `sortOrder` from this tool's
 * surface — the new note lands at the top of the destination column
 * which matches user intent ("move it to Decisions" → user expects to
 * see it surface immediately).
 */
import { z } from "zod";
import { registerTool } from "../../toolRegistry";
import { requirePermission, runTool, toolMutation } from "../_shared";
import { getNotesCtx } from "./_context";

registerTool({
	name: "set_note_category",
	layer: "always",
	permission: "notes.updateOwn",
	confirmation: "none",
	description: "Move a note into a different category column. Lands at the top of the column.",
	instruction: {
		whenToCall:
			"User asks to recategorize / move / reclassify / re-tag a note into a different category column. Run list_categories first if you don't already know the categoryId.",
		whenNotToCall:
			"the user wants to PIN the note (use pin_note) OR EDIT its content (use update_note) OR change the entity it's attached to (use update_note's setEntity flow — coming Stage 4).",
		preflight: ["list_categories"],
		requiredClarifications: ["noteId", "categoryId"],
		synonyms: [
			"move category",
			"recategorize note",
			"change category",
			"reclassify",
			"move column",
		],
		goodExample: {
			description: "User: 'Move that note about Sara to the Decisions category.'",
			args: { noteId: "k123...", categoryId: "k456..." },
		},
		badExample: {
			description: "User: 'Move it to Decisions.'",
			args: { noteId: "k123...", categoryId: "Decisions" },
			whyBad: "categoryId must be the Convex _id, not the human-readable name. Resolve via list_categories first.",
		},
	},
	runbook: {
		onSuccess: "Confirm in one short sentence with the destination category name.",
		onValidationError:
			"If the categoryId doesn't resolve, call list_categories first. Don't retry with the same id.",
		onPermissionDenied:
			"Tell the user they need notes.updateOwn (own note) or notes.deleteAny (admin override).",
	},
	schema: z.object({
		noteId: z.string().min(1).describe("The note's Convex _id."),
		categoryId: z.string().min(1).describe("The destination category's _id."),
	}),
	execute: async (args) =>
		runTool(async () => {
			const tc = getNotesCtx();
			requirePermission(tc.permissions, "notes.updateOwn");

			await toolMutation(tc, "crm/shared/notes/mutations:setCategory", {
				orgId: tc.orgId,
				noteId: args.noteId,
				categoryId: args.categoryId,
			});

			return {
				ok: true as const,
				data: { noteId: args.noteId, categoryId: args.categoryId },
				display: {
					kind: "note" as const,
					noteId: args.noteId,
				},
				summary: {
					headline: "Note category updated",
					table: [
						{ label: "Note", value: args.noteId },
						{ label: "New category", value: args.categoryId },
					],
				},
			};
		}),
});

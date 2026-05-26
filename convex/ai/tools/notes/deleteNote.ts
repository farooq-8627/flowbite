/**
 * convex/ai/tools/notes/deleteNote.ts
 *
 * Stage 3 of /SPRINT-PLAN.md (2026-05-26). Two-step note delete:
 *
 *   delete_note (propose) → confirmation card with the note preview
 *      ↓ user approves
 *   commit_delete_note    → calls notes/mutations:removeForAI
 *
 * Notes are HARD-deleted (the underlying mutation calls `ctx.db.delete`)
 * — there's no `deletedAt` flag on the notes table. This matches the
 * public mutation; restoring a note is not supported by design (notes
 * are low-value, ephemeral by nature; the activity log already preserves
 * the fact that the note existed).
 *
 * Permission: owner with `notes.deleteOwn` OR admin with `notes.deleteAny`.
 *
 * NOTE: For symmetry with the universal `delete_entity` tool, the model
 * may also call `delete_entity({ entityType: "note", noteId })` — that
 * route is preferred for free-form "delete this thing" prompts. The
 * dedicated `delete_note` tool is registered alongside so both surfaces
 * work; the runbook in the system prompt steers the model toward the
 * universal tool when in doubt.
 */
import { z } from "zod";
import { registerTool } from "../../toolRegistry";
import { propose, requirePermission, runTool, toolMutation } from "../_shared";
import { getNotesCtx } from "./_context";

const schema = z.object({
	noteId: z.string().min(1).describe("The note's Convex _id (notes have no public code)."),
});

registerTool({
	name: "delete_note",
	layer: "always",
	permission: "notes.deleteOwn",
	confirmation: "twoStep",
	description: "Delete a single note (hard-delete; no undo).",
	instruction: {
		whenToCall:
			"User asks to delete a specific note by id. Show the confirmation card so the user can verify before write.",
		whenNotToCall:
			"the user wants to delete a different entity type (use delete_entity instead — universal). For ambiguous 'delete this' requests, prefer delete_entity which routes by entityType.",
		requiredClarifications: ["noteId"],
		synonyms: ["delete note", "remove note", "trash note"],
		goodExample: {
			description: "User: 'Delete that last note I just wrote on Sara.'",
			args: { noteId: "k123..." },
		},
	},
	runbook: {
		onSuccess: "Confirm in one short sentence. The entity timeline reflects the deletion.",
		onPermissionDenied:
			"Tell the user they need notes.deleteOwn (own note) or notes.deleteAny (admin override).",
	},
	schema,
	execute: async (args) => {
		const tc = getNotesCtx();
		requirePermission(tc.permissions, "notes.deleteOwn");
		return propose("delete_note", args, {
			title: "Delete note",
			fields: [
				{ label: "Note", value: args.noteId },
				{ label: "Recoverable", value: "No — notes are hard-deleted" },
			],
		});
	},
});

registerTool({
	name: "commit_delete_note",
	layer: "always",
	permission: "notes.deleteOwn",
	confirmation: "none",
	description: "Internal: commit a pre-approved delete_note call.",
	schema,
	execute: async (args) =>
		runTool(async () => {
			const tc = getNotesCtx();
			requirePermission(tc.permissions, "notes.deleteOwn");

			await toolMutation(tc, "crm/shared/notes/mutations:remove", {
				orgId: tc.orgId,
				noteId: args.noteId,
			});

			return {
				ok: true as const,
				data: { noteId: args.noteId },
				display: {
					kind: "text" as const,
					text: `🗑 Note deleted.`,
				},
				summary: {
					headline: "Note deleted",
					table: [{ label: "Status", value: "Permanently removed" }],
					suggestedNext: [
						{
							label: "Add a replacement note",
							intent: "Add a note to the same record",
						},
					],
				},
			};
		}),
});

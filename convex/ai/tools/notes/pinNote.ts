/**
 * convex/ai/tools/notes/pinNote.ts
 *
 * Stage 3 of /SPRINT-PLAN.md (2026-05-26). Atomic note pin/unpin —
 * single round-trip, no confirmation needed (low-stakes UI gesture).
 *
 *   pin_note → calls notes/mutations:togglePinForAI
 *
 * Toggles `isPinned` boolean. Returns the new state so the model can
 * confirm "Pinned." vs "Unpinned." correctly.
 *
 * Permission: `notes.pin`.
 */
import { z } from "zod";
import { registerTool } from "../../toolRegistry";
import { requirePermission, runTool, toolMutation } from "../_shared";
import { getNotesCtx } from "./_context";

registerTool({
	name: "pin_note",
	layer: "always",
	permission: "notes.pin",
	confirmation: "none",
	description: "Pin or unpin a note (toggles the pinned state).",
	instruction: {
		whenToCall:
			"User asks to pin / unpin / star / highlight a note so it surfaces at the top of the entity's note list. Single-step — no confirmation needed.",
		whenNotToCall:
			"the user wants to set a category (use set_note_category) or edit the note's content (use update_note).",
		requiredClarifications: ["noteId"],
		synonyms: ["pin", "unpin", "star", "highlight", "feature"],
		goodExample: {
			description: "User: 'Pin that meeting recap note on Sara.'",
			args: { noteId: "k123..." },
		},
	},
	runbook: {
		onSuccess:
			"Tell the user the new state — pinned vs unpinned. The note card already shows the pin icon.",
		onPermissionDenied: "Tell the user they need the notes.pin permission.",
	},
	schema: z.object({
		noteId: z.string().min(1).describe("The note's Convex _id."),
	}),
	execute: async (args) =>
		runTool(async () => {
			const tc = getNotesCtx();
			requirePermission(tc.permissions, "notes.pin");

			const result = (await toolMutation(tc, "crm/shared/notes/mutations:togglePin", {
				orgId: tc.orgId,
				noteId: args.noteId,
			})) as { isPinned: boolean };

			return {
				ok: true as const,
				data: { noteId: args.noteId, isPinned: result.isPinned },
				display: {
					kind: "note" as const,
					noteId: args.noteId,
				},
				summary: {
					headline: result.isPinned ? "Note pinned" : "Note unpinned",
					table: [
						{ label: "Note", value: args.noteId },
						{ label: "State", value: result.isPinned ? "Pinned" : "Unpinned" },
					],
				},
			};
		}),
});

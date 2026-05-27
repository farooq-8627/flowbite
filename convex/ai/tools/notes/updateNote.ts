/**
 * convex/ai/tools/notes/updateNote.ts
 *
 * Stage 3 of /SPRINT-PLAN.md (2026-05-26). Two-step note edit:
 *
 *   update_note (propose) → confirmation card with before/after preview
 *      ↓ user approves
 *   commit_update_note    → calls notes/mutations:updateForAI
 *
 * The underlying mutation gates on owner with `notes.updateOwn` OR admin
 * with `notes.deleteAny`. The tool surface filter uses `notes.updateOwn`
 * because it's the most-permissive seed-default; the mutation re-checks
 * ownership at commit time so non-owners without `notes.deleteAny` can't
 * sneak through.
 *
 * Schema:
 *   - `noteId` is the raw Convex id (notes have no public code).
 *   - `title`, `content`, `categoryId`, `isInternal` are all optional —
 *     the user can patch any subset.
 *   - At least ONE field besides `noteId` must be supplied (refine).
 */
import { z } from "zod";
import { registerTool } from "../../toolRegistry";
import { optionalString, propose, requirePermission, runTool, toolMutation } from "../_shared";
import { getNotesCtx } from "./_context";

const updateSchema = z
	.object({
		noteId: z.string().min(1).describe("The note's Convex _id (notes have no public code)."),
		title: optionalString().describe("New note title (max 80 chars)."),
		content: optionalString().describe("New note body. Markdown supported."),
		categoryId: optionalString().describe(
			"New category id. Look up via list_categories first.",
		),
		isInternal: z.optional(z.boolean()).describe("If true, hide from client/partner portals."),
	})
	.refine(
		(v) =>
			v.title !== undefined ||
			v.content !== undefined ||
			v.categoryId !== undefined ||
			v.isInternal !== undefined,
		{ message: "At least one of title / content / categoryId / isInternal must be supplied." },
	);

registerTool({
	name: "update_note",
	layer: "always",
	permission: "notes.updateOwn",
	confirmation: "twoStep",
	approvalCategory: "update_record",
	description:
		"Edit an existing note's title, content, category, or internal flag. Owner-only by default; admins with notes.deleteAny can edit any.",
	instruction: {
		whenToCall:
			"User asks to edit / fix / amend / correct a typo in / rewrite a note. Always show the before/after card before writing — note edits are user-visible and the user should confirm.",
		whenNotToCall:
			"the user wants to add a NEW note (use add_note) OR delete the note (use delete_note) OR pin/unpin (use pin_note) OR change category (use set_note_category — atomic, no confirmation).",
		preflight: ["search_crm"],
		requiredClarifications: ["noteId"],
		synonyms: ["edit note", "fix note", "amend note", "rewrite note", "correct note"],
		goodExample: {
			description: "User: 'Fix the typo in my last note on P-014.' (model resolved noteId)",
			args: {
				noteId: "k123abc...",
				content: "Had a great call. Wants Q3 numbers next week.",
			},
		},
		badExample: {
			description: "User: 'Edit my note.'",
			args: { noteId: "" },
			whyBad: "noteId is required. Resolve via search_crm or get_entity_detail first.",
		},
	},
	runbook: {
		onSuccess: "Confirm with one short sentence — the entity timeline already shows the edit.",
		onValidationError:
			"If the noteId doesn't resolve OR the caller isn't the note's owner, surface the error to the user. Don't retry blindly.",
		onPermissionDenied:
			"Tell the user they need notes.updateOwn (own note) or notes.deleteAny (admin override).",
	},
	schema: updateSchema,
	execute: async (args) => {
		const tc = getNotesCtx();
		requirePermission(tc.permissions, "notes.updateOwn");
		const previewParts: string[] = [];
		if (args.title !== undefined) previewParts.push(`title=${args.title}`);
		if (args.content !== undefined) {
			const preview =
				args.content.length > 80 ? `${args.content.slice(0, 80)}…` : args.content;
			previewParts.push(`content=${preview}`);
		}
		if (args.categoryId !== undefined) previewParts.push(`category=${args.categoryId}`);
		if (args.isInternal !== undefined) previewParts.push(`internal=${args.isInternal}`);

		return propose("update_note", args, {
			title: "Update note",
			fields: [
				{ label: "Note", value: args.noteId },
				{ label: "Patch", value: previewParts.join(" · ") },
			],
		});
	},
});

registerTool({
	name: "commit_update_note",
	layer: "always",
	permission: "notes.updateOwn",
	confirmation: "none",
	description:
		"Internal: commit a pre-approved update_note call. Do not call without prior update_note approval.",
	schema: updateSchema,
	execute: async (args) =>
		runTool(async () => {
			const tc = getNotesCtx();
			requirePermission(tc.permissions, "notes.updateOwn");

			await toolMutation(tc, "crm/shared/notes/mutations:update", {
				orgId: tc.orgId,
				noteId: args.noteId,
				...(args.title !== undefined ? { title: args.title } : {}),
				...(args.content !== undefined ? { content: args.content } : {}),
				...(args.categoryId !== undefined ? { categoryId: args.categoryId } : {}),
				...(args.isInternal !== undefined ? { isInternal: args.isInternal } : {}),
			});

			return {
				ok: true as const,
				data: { noteId: args.noteId },
				display: {
					kind: "note" as const,
					noteId: args.noteId,
				},
				summary: {
					headline: "Note updated",
					table: [{ label: "Note", value: args.noteId }],
					suggestedNext: [
						{
							label: "Pin this note",
							intent: `Pin note ${args.noteId}`,
						},
						{
							label: "Move to a different category",
							intent: `Change the category for note ${args.noteId}`,
						},
					],
				},
			};
		}),
});

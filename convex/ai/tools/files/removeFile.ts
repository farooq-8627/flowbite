/**
 * convex/ai/tools/files/removeFile.ts
 *
 * Stage 4 of /SPRINT-PLAN.md (2026-05-26). Two-step file removal:
 *
 *   remove_file (propose) → confirmation card with file name + scope
 *      ↓ user approves
 *   commit_remove_file    → calls files/mutations:removeForAI
 *
 * Soft-delete only — the public mutation sets `deletedAt` and best-effort
 * deletes the underlying storage bytes.
 *
 * Permission: `files.delete` (own files) or `files.deleteAny` (moderators).
 * The propose tool gates on the weaker `files.delete` so any user with
 * file-delete rights can see the proposal; the underlying mutation does
 * the per-file owner check.
 */
import { z } from "zod";
import { registerTool } from "../../toolRegistry";
import { propose, requirePermission, runTool, toolMutation } from "../_shared";
import { getFilesCtx } from "./_context";

const schema = z.object({
	fileId: z.string().describe("Convex file _id."),
	displayName: z
		.string()
		.optional()
		.describe("File name for the propose card. Look up via list_files first."),
});

registerTool({
	name: "remove_file",
	layer: "files",
	permission: "files.delete",
	confirmation: "twoStep",
	description: "Soft-delete a file. Two-step — shows the file name before writing.",
	instruction: {
		whenToCall:
			"User asks to delete / remove / discard a file or attachment. Show the propose card first.",
		whenNotToCall:
			"the user wants to update the file's tags (use update_file_tags) OR they're asking how to upload a new file (UI-only).",
		preflight: ["list_files"],
		requiredClarifications: ["fileId"],
		synonyms: ["delete file", "remove attachment", "discard document", "trash this file"],
		goodExample: {
			description: "User: 'Delete the old proposal pdf.' (after list_files surfaced it).",
			args: { fileId: "abc123def456", displayName: "Proposal v1.pdf" },
		},
		badExample: {
			description: "User: 'Delete a file.' — no fileId.",
			args: { fileId: "?" },
			whyBad: "Resolve via list_files first; never guess a Convex _id.",
		},
	},
	runbook: {
		onSuccess: "Confirm in one short sentence — file deleted.",
		onValidationError: "If fileId doesn't resolve, surface list_files results.",
		onPermissionDenied:
			"Tell the user they can only delete their own uploads (files.delete) unless they're a moderator (files.deleteAny). Suggest contacting an admin for someone else's file.",
	},
	schema,
	execute: async (args) => {
		const { permissions } = getFilesCtx();
		requirePermission(permissions, "files.delete");
		return propose("remove_file", args, {
			title: `Delete ${args.displayName ?? "file"}`,
			fields: [{ label: "File", value: args.displayName ?? args.fileId }],
		});
	},
});

registerTool({
	name: "commit_remove_file",
	layer: "files",
	permission: "files.delete",
	confirmation: "none",
	description: "Internal: commit a pre-approved file removal.",
	schema,
	execute: async (args) =>
		runTool(async () => {
			const tc = getFilesCtx();
			requirePermission(tc.permissions, "files.delete");
			await toolMutation(tc, "files/mutations:remove", {
				orgId: tc.orgId,
				fileId: args.fileId,
			});
			return {
				ok: true as const,
				data: { fileId: args.fileId },
				summary: {
					headline: `Deleted ${args.displayName ?? "file"}`,
					table: [{ label: "File", value: args.displayName ?? args.fileId }],
					suggestedNext: [
						{
							label: "List remaining files",
							intent: `Show me the files still attached`,
						},
					],
				},
			};
		}),
});

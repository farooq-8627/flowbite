/**
 * convex/ai/tools/files/updateFileTags.ts
 *
 * Stage 4 of /SPRINT-PLAN.md (2026-05-26). Two-step tag update:
 *
 *   update_file_tags (propose) → confirmation card with old/new tags
 *      ↓ user approves
 *   commit_update_file_tags    → calls files/mutations:updateTagsForAI
 *
 * The mutation REPLACES the entire tag list — there's no per-tag add/remove
 * verb. The propose card surfaces the diff so the user can see what's
 * disappearing.
 *
 * Permission: `files.upload` (the public mutation also accepts
 * `files.deleteAny` moderators — re-checked at the mutation layer).
 */
import { z } from "zod";
import { registerTool } from "../../toolRegistry";
import { propose, requirePermission, runTool, toolMutation } from "../_shared";
import { getFilesCtx } from "./_context";

const schema = z.object({
	fileId: z.string().describe("Convex file _id."),
	tags: z
		.array(z.string().min(1))
		.max(40)
		.describe(
			"Replacement tag list. Pass the FULL desired tag set (not a delta). 0-40 tags allowed.",
		),
	displayName: z
		.string()
		.optional()
		.describe("File name for the propose card. Look up via list_files first."),
});

registerTool({
	name: "update_file_tags",
	layer: "files",
	permission: "files.upload",
	confirmation: "twoStep",
	description: "Replace the tags on a file. Two-step — shows the new tag set before writing.",
	instruction: {
		whenToCall:
			"User asks to add / remove / change / set / replace tags on a file. The tags list passed REPLACES the existing one — pre-compute the desired final state.",
		whenNotToCall:
			"the user wants to delete the file (use remove_file) OR rename the file (not supported via AI).",
		preflight: ["list_files"],
		requiredClarifications: ["fileId"],
		synonyms: ["tag this file", "add tag to file", "retag", "categorise file"],
		goodExample: {
			description:
				"User: 'Tag the proposal PDF with deal:D-001 and contract.' (existing tags: ['draft']).",
			args: {
				fileId: "abc123def456",
				tags: ["deal:D-001", "contract"],
				displayName: "Proposal v3.pdf",
			},
		},
		badExample: {
			description:
				"User: 'Add a tag to that file.' — no fileId; the AI tried tags: [] which would clear them.",
			args: { fileId: "?", tags: [] },
			whyBad: "list_files first to resolve the fileId, then ask the user for the tag string.",
		},
	},
	runbook: {
		onSuccess: "Confirm in one short sentence with the new tag set joined by commas.",
		onValidationError:
			"If fileId doesn't resolve, list available files via list_files and re-ask.",
	},
	schema,
	execute: async (args) => {
		const { permissions } = getFilesCtx();
		requirePermission(permissions, "files.upload");
		return propose("update_file_tags", args, {
			title: `Update tags on ${args.displayName ?? "file"}`,
			fields: [
				{ label: "File", value: args.displayName ?? args.fileId },
				{
					label: "New tags",
					value: args.tags.length === 0 ? "(clear all)" : args.tags.join(", "),
				},
			],
		});
	},
});

registerTool({
	name: "commit_update_file_tags",
	layer: "files",
	permission: "files.upload",
	confirmation: "none",
	description: "Internal: commit a pre-approved file-tag update.",
	schema,
	execute: async (args) =>
		runTool(async () => {
			const tc = getFilesCtx();
			requirePermission(tc.permissions, "files.upload");
			await toolMutation(tc, "files/mutations:updateTags", {
				orgId: tc.orgId,
				fileId: args.fileId,
				tags: args.tags,
			});
			return {
				ok: true as const,
				data: { fileId: args.fileId, tags: args.tags },
				summary: {
					headline: `Updated tags on ${args.displayName ?? "file"}`,
					table: [
						{
							label: "Tags",
							value: args.tags.length === 0 ? "(none)" : args.tags.join(", "),
						},
					],
					suggestedNext: [
						{
							label: "List files",
							intent: `Show me all files attached to this record`,
						},
					],
				},
			};
		}),
});

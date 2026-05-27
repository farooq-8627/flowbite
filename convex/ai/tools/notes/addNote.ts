/**
 * convex/ai/tools/notes/addNote.ts
 *
 * Always-on add_note tool. Moved from the legacy `notesReminders.ts`
 * per TASKS-RENAME-PLAN.md (Stage 4C, 2026-05-27) so all note-related
 * tools live in one folder with one shared ToolContext setter.
 */

import { z } from "zod";
import { entityTypeEnum } from "../../../_shared/synonyms";
import { registerTool } from "../../toolRegistry";
import { requirePermission, runTool, toolMutation } from "../_shared";
import { getNotesCtx } from "./_context";

registerTool({
	name: "add_note",
	layer: "always",
	permission: "notes.create",
	confirmation: "none",
	description: "Attach a text note to a lead, contact, deal, or company.",
	instruction: {
		whenToCall:
			"Use any time the user wants to capture context about a record — meeting recap, call summary, internal observation. Notes are visible to all team members with notes.view.",
		whenNotToCall:
			"the content is a task with a due date (call create_task with the right type) OR is sensitive customer data covered by RBAC (use the relevant entity field).",
		preflight: ["search_crm"],
		requiredClarifications: ["entityCode", "content"],
		synonyms: ["log", "annotation", "remark", "comment"],
		goodExample: {
			description:
				"User: 'Add a note to P-001: had a great call, they want to see Q3 numbers next week.'",
			args: {
				entityType: "lead",
				entityCode: "P-001",
				content: "Had a great call. Wants Q3 numbers next week.",
				isInternal: false,
			},
		},
		badExample: {
			description: "User: 'Add a note.'",
			args: { entityType: "lead", entityCode: "", content: "" },
			whyBad: "Both entityCode and content are required. Resolve the entity via search_crm; ask the user for the note text.",
		},
	},
	runbook: {
		onSuccess:
			"The note card renders below — say one short sentence confirming the note attached. Don't restate the content.",
		onValidationError:
			"If the entityCode doesn't resolve, call search_crm first. Don't retry with the same code.",
		onPermissionDenied:
			"Tell the user they need notes.create permission. Suggest contacting an admin.",
	},
	schema: z.object({
		entityType: entityTypeEnum(),
		entityCode: z.string().describe("Entity code (P-XXX, D-XXX, C-XXX)."),
		content: z.string().describe("The note text. Markdown supported."),
		isInternal: z
			.boolean()
			.default(false)
			.describe("If true, hidden from client/partner portals."),
	}),
	execute: async ({ entityType, entityCode, content, isInternal }) => {
		return runTool(async () => {
			const tc = getNotesCtx();
			requirePermission(tc.permissions, "notes.create");
			const result = (await toolMutation(tc, "crm/shared/notes/mutations:create", {
				orgId: tc.orgId,
				entityType,
				entityCode,
				content,
				isInternal,
				authorType: "ai",
			})) as string;
			const preview = content.length > 80 ? `${content.slice(0, 77)}…` : content;
			return {
				ok: true as const,
				data: { noteId: result },
				display: { kind: "note" as const, noteId: result },
				summary: {
					headline: `Added note to ${entityCode}`,
					table: [
						{ label: "Attached to", value: entityCode },
						{ label: "Visibility", value: isInternal ? "Internal" : "Shared" },
						{ label: "Excerpt", value: preview },
					],
					suggestedNext: [
						{
							label: "Schedule follow-up",
							intent: `Schedule a follow-up call with ${entityCode} for next week`,
						},
					],
				},
			};
		});
	},
});

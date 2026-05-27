/**
 * convex/ai/tools/notes/moveNoteToEntity.ts
 *
 * P1.3 G-6 — `move_note_to_entity` atomic tool. Re-attaches a note to a
 * different CRM entity (e.g. when the AI mis-attributes a note, or the
 * user decides a note about a person is really about their company).
 *
 * Permission: owner with `notes.updateOwn` OR admin with `notes.deleteAny`.
 *
 * The mutation is idempotent — patching to the same target is a no-op.
 * Atomic, no propose/commit: fully reversible by another move call,
 * and the user explicitly named the destination entity.
 */
import { z } from "zod";
import { registerTool } from "../../toolRegistry";
import { optionalString, requirePermission, runTool, toolMutation } from "../_shared";
import { getNotesCtx } from "./_context";

const moveSchema = z.object({
	noteId: z.string().min(1).describe("Convex note _id."),
	entityType: z
		.enum(["lead", "contact", "company", "deal", "org"])
		.describe(
			"Target entity type. Use 'org' (with the orgSlug as entityId) to detach the note back to the org-wide bucket.",
		),
	entityId: z
		.string()
		.min(1)
		.describe(
			"Target entity id. For lead/contact/deal/company this is the Convex _id (resolve via search_crm). For 'org' this is the orgSlug.",
		),
	personCode: optionalString().describe(
		"Optional personCode override — set when re-attaching to a deal/company that already has a known associated person.",
	),
});

registerTool({
	name: "move_note_to_entity",
	layer: "always",
	permission: "notes.updateOwn",
	confirmation: "none",
	approvalCategory: "update_record",
	description:
		"Re-attach a note to a different CRM record (lead / contact / company / deal), or detach to the org-wide bucket via entityType='org'.",
	instruction: {
		whenToCall:
			"User asks to 'move that note to <entity>', 'reattach the note to D-007', 'put that note under Acme instead'. Always run search_crm first to resolve the destination entity's id.",
		whenNotToCall:
			"the user wants to change the note's CATEGORY (use set_note_category) OR edit the note's content (use update_note) OR delete the note (use delete_note).",
		preflight: ["search_crm"],
		requiredClarifications: ["noteId", "entityType", "entityId"],
		synonyms: [
			"move note",
			"reattach note",
			"reassign note",
			"relink note",
			"attach note to",
			"transfer note",
		],
		goodExample: {
			description:
				"User: 'Move that note about Sara to the Acme deal.' (model resolved noteId via search_crm and dealId via get_entity_detail)",
			args: {
				noteId: "k_note_id",
				entityType: "deal",
				entityId: "k_deal_id",
				personCode: "P-014",
			},
		},
		badExample: {
			description: "User: 'Move it to Acme.'",
			args: { noteId: "k_note_id", entityType: "company", entityId: "Acme" },
			whyBad: "entityId must be the Convex _id, not the human name. Resolve via search_crm first.",
		},
	},
	runbook: {
		onSuccess:
			"Confirm in one short sentence — the entity timeline already reflects the re-attachment.",
		onValidationError:
			"NOT_FOUND = note doesn't resolve. FORBIDDEN = caller isn't the note's owner and lacks notes.deleteAny.",
		onPermissionDenied:
			"Tell the user they need notes.updateOwn (own note) or notes.deleteAny (admin).",
	},
	schema: moveSchema,
	execute: async (args) =>
		runTool(async () => {
			const tc = getNotesCtx();
			requirePermission(tc.permissions, "notes.updateOwn");
			await toolMutation(tc, "crm/shared/notes/mutations:setEntity", {
				orgId: tc.orgId,
				noteId: args.noteId,
				entityType: args.entityType,
				entityId: args.entityId,
				personCode: args.personCode,
			});
			return {
				ok: true as const,
				data: { noteId: args.noteId, entityType: args.entityType, entityId: args.entityId },
				display: { kind: "note" as const, noteId: args.noteId },
				summary: {
					headline: `Note moved to ${args.entityType} ${args.entityId}`,
					table: [
						{ label: "Note", value: args.noteId },
						{ label: "New target", value: `${args.entityType} ${args.entityId}` },
					],
				},
			};
		}),
});

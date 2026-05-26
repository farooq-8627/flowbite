/**
 * convex/ai/tools/crud/deleteEntity.ts
 *
 * Stage 3 of /SPRINT-PLAN.md (2026-05-26). Universal soft-delete tool:
 *
 *   delete_entity (propose) → confirmation card with cascade summary
 *      ↓ user approves
 *   commit_delete_entity     → calls the matching softDeleteForAI
 *
 * Soft-delete only — every backing mutation sets `deletedAt = Date.now()`
 * and the row goes to trash. The trash drawer + `restore_entity` AI tool
 * recover items if the user changes their mind. There is no hard-delete
 * path through this tool; that's by design (see AGENTS.md "no backward-
 * compat" + the cascade-trash semantics from `trash/mutations:restore`).
 *
 * Schema design:
 *   - `entityType` is a closed union of the six trash-aware entities.
 *   - `entityCode` covers lead/contact/deal/company (P-XXX, D-XXX, C-XXX
 *     prefixes — interpreted via `_shared/recordCodes.ts`).
 *   - `followUpCode` covers reminder (FU-XXX).
 *   - `noteId` covers note (raw Convex id — notes have no public code).
 *
 * The propose path resolves the lookup via
 * `getEntityCascadeImpact` (read-only), surfaces the cascade summary
 * ("this will trash 3 deals + 2 notes + 1 reminder"), and returns a
 * confirmation payload. The commit path calls the matching
 * `softDeleteForAI` mutation. We deliberately re-resolve at commit time
 * (instead of forwarding the resolved id from propose) so the soft-
 * delete is robust against parallel edits between propose and commit
 * approval.
 *
 * Permissions:
 *   - lead     → leads.delete
 *   - contact  → contacts.delete
 *   - deal     → deals.delete
 *   - company  → companies.delete
 *   - note     → notes.deleteOwn (own) OR notes.deleteAny (admin)
 *   - reminder → assignee OR reminders.manage
 *
 * Per-tool rate limit is the same one the underlying mutation enforces;
 * a separate `entity.delete` budget would just shadow it without adding
 * any guarantee, so we don't double-gate here.
 */

import { z } from "zod";
import { internal } from "../../../_generated/api";
import type { CascadeImpactResult } from "../../queries/cascadeImpact";
import { registerTool } from "../../toolRegistry";
import { optionalString, propose, requirePermission, runTool, toolMutation } from "../_shared";
import { getCrudCtx } from "./_context";

const ENTITY_TYPE_ENUM = z.enum(["lead", "contact", "deal", "company", "note", "reminder"]);

type DeletableEntityType = z.infer<typeof ENTITY_TYPE_ENUM>;

const PERMISSION_FOR_TYPE: Record<DeletableEntityType, string> = {
	lead: "leads.delete",
	contact: "contacts.delete",
	deal: "deals.delete",
	company: "companies.delete",
	// Notes are gated by the underlying mutation — owner with notes.deleteOwn
	// or admin with notes.deleteAny. The expand_tools surface still wants a
	// single permission key to filter on; `notes.deleteOwn` is the
	// most-permissive seed-default that any note-creator already holds.
	note: "notes.deleteOwn",
	// Reminders: the underlying mutation accepts the assignee OR a member
	// with `reminders.manage`. Same logic — `reminders.manage` is the
	// admin-grant; surfacing the tool to assignees too would require a
	// runtime member check, so we filter on the strongest gate at the
	// tool level. The mutation still permits the assignee path at
	// execute time.
	reminder: "reminders.manage",
};

function describeCascade(cascade: CascadeImpactResult & { kind: "found" }): string {
	const c = cascade.cascade;
	const parts: string[] = [];
	if (c.deals && c.deals > 0) parts.push(`${c.deals} open deal${c.deals === 1 ? "" : "s"}`);
	if (c.notes && c.notes > 0) parts.push(`${c.notes} note${c.notes === 1 ? "" : "s"}`);
	if (c.reminders && c.reminders > 0)
		parts.push(`${c.reminders} reminder${c.reminders === 1 ? "" : "s"}`);
	if (c.memberLinks && c.memberLinks > 0)
		parts.push(`${c.memberLinks} person link${c.memberLinks === 1 ? "" : "s"}`);
	if (parts.length === 0) return "Nothing else will be affected.";
	return `Cascade impact: ${parts.join(" + ")} attached to this record.`;
}

registerTool({
	name: "delete_entity",
	layer: "always",
	permission: null, // per-entity permission checked inside execute (see PERMISSION_FOR_TYPE)
	confirmation: "twoStep",
	description:
		"Soft-delete any entity (lead, contact, deal, company, note, or reminder). Shows a confirmation card with cascade impact before any write.",
	instruction: {
		whenToCall:
			"User asks to delete / remove / trash any entity. Always call this — never the bulk-update workaround. Soft-delete only; the row goes to trash and can be restored via restore_entity.",
		whenNotToCall:
			"the user wants to permanently purge data (not supported — trash auto-purges via the org's retention setting) OR wants to convert/archive instead of delete (use the convert / archive flow for the relevant entity).",
		preflight: ["search_crm", "list_followups_for_person"],
		requiredClarifications: ["entityType"],
		synonyms: ["delete", "remove", "trash", "throw away", "drop", "kill", "scrap"],
		goodExample: {
			description:
				"User: 'Delete the lead Sarah Khan.' (Sarah resolved via search_crm to P-014.)",
			args: { entityType: "lead", entityCode: "P-014" },
		},
		badExample: {
			description: "User: 'Delete some stuff.'",
			args: { entityType: "lead" },
			whyBad: "No code/id supplied. Call search_crm first to identify the exact record. Never delete by guess.",
		},
	},
	runbook: {
		onSuccess:
			"Reply with ONE concise sentence ('Deleted L-014 (Sara Khan). 2 notes + 1 reminder went to trash too.'). Mention the cascade only if non-zero. Don't restate the propose card.",
		onValidationError:
			"If the code/id doesn't resolve, do NOT retry — call search_crm to find the right record first.",
		onPermissionDenied:
			"Tell the user which permission they need (e.g. 'leads.delete') and suggest contacting an admin.",
		suggestNext: "view_trash",
	},
	schema: z
		.object({
			entityType: ENTITY_TYPE_ENUM,
			entityCode: optionalString().describe(
				"Public code for lead/contact/deal/company (P-XXX / D-XXX / C-XXX).",
			),
			followUpCode: optionalString().describe("FU-XXX code for entityType=reminder."),
			noteId: optionalString().describe("Raw Convex id for entityType=note."),
		})
		.refine(
			(v) =>
				(["lead", "contact", "deal", "company"].includes(v.entityType) && !!v.entityCode) ||
				(v.entityType === "reminder" && !!v.followUpCode) ||
				(v.entityType === "note" && !!v.noteId),
			{
				message:
					"Pass entityCode for lead/contact/deal/company, followUpCode for reminder, or noteId for note.",
			},
		),
	execute: async (args) => {
		return runTool(async () => {
			const tc = getCrudCtx();
			const entityType = args.entityType as DeletableEntityType;
			requirePermission(tc.permissions, PERMISSION_FOR_TYPE[entityType]);

			// Resolve + count via the read-only internal query (it
			// validates orgMember by ids per AGENTS.md ForAI rule).
			const impact = (await tc.ctx.runQuery(
				internal.ai.queries.cascadeImpact.getEntityCascadeImpact,
				{
					orgId: tc.orgId,
					userId: tc.userId,
					entityType,
					...(args.entityCode ? { entityCode: args.entityCode } : {}),
					...(args.followUpCode ? { followUpCode: args.followUpCode } : {}),
					...(args.noteId
						? {
								noteId: args.noteId as never, // narrowed by schema refine
							}
						: {}),
				},
			)) as CascadeImpactResult;

			if (impact.kind === "not_found") {
				return {
					ok: false as const,
					code: "NOT_FOUND",
					error: `No ${impact.entityType} found for ${impact.lookup}. Call search_crm to find the right record first.`,
				};
			}

			const targetLabel = impact.canonicalCode
				? `${impact.canonicalCode} (${impact.displayName})`
				: impact.displayName;

			return propose("delete_entity", args, {
				title: `Delete ${impact.entityType}: ${targetLabel}`,
				fields: [
					{ label: "Type", value: impact.entityType },
					{ label: "Target", value: targetLabel },
					{ label: "Impact", value: describeCascade(impact) },
					{
						label: "Recoverable",
						value: "Yes — soft-deleted to trash; restore via restore_entity.",
					},
				],
			});
		});
	},
});

registerTool({
	name: "commit_delete_entity",
	layer: "always",
	permission: null,
	confirmation: "none",
	description:
		"Internal: commit a pre-approved delete_entity call. Do not call without prior delete_entity approval.",
	schema: z.object({
		entityType: ENTITY_TYPE_ENUM,
		entityCode: optionalString(),
		followUpCode: optionalString(),
		noteId: optionalString(),
	}),
	execute: async (args) =>
		runTool(async () => {
			const tc = getCrudCtx();
			const entityType = args.entityType as DeletableEntityType;
			requirePermission(tc.permissions, PERMISSION_FOR_TYPE[entityType]);

			// Re-resolve at commit so a parallel edit (e.g. another user
			// already trashed this row between propose + approval) surfaces
			// as a clean NOT_FOUND rather than a silent duplicate-trash.
			const impact = (await tc.ctx.runQuery(
				internal.ai.queries.cascadeImpact.getEntityCascadeImpact,
				{
					orgId: tc.orgId,
					userId: tc.userId,
					entityType,
					...(args.entityCode ? { entityCode: args.entityCode } : {}),
					...(args.followUpCode ? { followUpCode: args.followUpCode } : {}),
					...(args.noteId ? { noteId: args.noteId as never } : {}),
				},
			)) as CascadeImpactResult;

			if (impact.kind === "not_found") {
				return {
					ok: false as const,
					code: "NOT_FOUND",
					error: `No ${impact.entityType} found for ${impact.lookup}.`,
				};
			}

			const targetLabel = impact.canonicalCode
				? `${impact.canonicalCode} (${impact.displayName})`
				: impact.displayName;

			// Dispatch to the right `softDeleteForAI` mutation. Each
			// underlying ForAI twin already validates org membership,
			// permission, and produces the canonical activity-log entry.
			switch (entityType) {
				case "lead":
					await toolMutation(tc, "crm/entities/leads/mutations:softDelete", {
						orgId: tc.orgId,
						leadId: impact.entityId,
					});
					break;
				case "contact":
					await toolMutation(tc, "crm/entities/contacts/mutations:softDelete", {
						orgId: tc.orgId,
						contactId: impact.entityId,
					});
					break;
				case "deal":
					await toolMutation(tc, "crm/entities/deals/mutations:softDelete", {
						orgId: tc.orgId,
						dealId: impact.entityId,
					});
					break;
				case "company":
					await toolMutation(tc, "crm/entities/companies/mutations:softDelete", {
						orgId: tc.orgId,
						companyId: impact.entityId,
					});
					break;
				case "note":
					await toolMutation(tc, "crm/shared/notes/mutations:remove", {
						orgId: tc.orgId,
						noteId: impact.entityId,
					});
					break;
				case "reminder":
					await toolMutation(tc, "crm/shared/reminders/mutations:remove", {
						orgId: tc.orgId,
						reminderId: impact.entityId,
					});
					break;
			}

			const cascadeText = describeCascade(impact);

			return {
				ok: true as const,
				data: {
					entityType: impact.entityType,
					entityId: impact.entityId,
					canonicalCode: impact.canonicalCode,
				},
				display: {
					kind: "text" as const,
					text: `🗑 Deleted ${targetLabel}. ${cascadeText}`,
				},
				summary: {
					headline: `Deleted ${impact.entityType}: ${targetLabel}`,
					table: [
						{ label: "Type", value: impact.entityType },
						{ label: "Target", value: targetLabel },
						{ label: "Status", value: "Soft-deleted (in trash)" },
					],
					facts: [cascadeText],
					suggestedNext: [
						{
							label: "Open trash",
							intent: "Show me what's in the trash",
						},
						{
							label: "Restore it",
							intent: impact.canonicalCode
								? `Restore ${impact.canonicalCode}`
								: `Restore the ${impact.entityType} I just deleted`,
						},
					],
				},
			};
		}),
});

/**
 * convex/ai/tools/updateEntity.ts
 *
 * Universal update tool (always-on, two-step):
 *   update_entity         — propose the patch (preview)
 *   commit_update_entity  — apply after user approval
 *
 * The commit step routes through the shared
 * `aiEntityPatch.applyEntityPatchByCode` mutation which:
 *   • resolves the human-readable code (P-001 / D-042 / CO-007) into the
 *     internal row id;
 *   • splits the patch into canonical column fields (displayName, email, …)
 *     vs custom fields stored in `fieldValues` (company_size,
 *     industry_vertical, …);
 *   • patches the row + upserts custom fields;
 *   • returns a before/after snapshot for the diff card.
 *
 * Before this rewrite (PHASE-3-AI-AUDIT.md §6.5 incident-class B), the
 * commit step passed `code: "P-001"` plus `...patch` directly to the
 * underlying entity-update mutation, which only accepts an internal id
 * (`leadId`, `contactId`, …) and a fixed set of column fields. Every
 * twoStep update therefore failed with the dreaded `ArgumentValidationError`
 * surfaced as "❌ The tool tried to save with an unexpected field." The
 * helper above is the structural fix.
 */
import { z } from "zod";
import { internal } from "../../_generated/api";
import { codeString, entityTypeEnum } from "../../_shared/synonyms";
import { registerTool } from "../toolRegistry";
import { propose, requirePermission, runTool, type ToolContext, toolMutation } from "./_shared";

let _toolCtx: ToolContext | null = null;
export function setUpdateEntityContext(ctx: ToolContext): void {
	_toolCtx = ctx;
}
function getCtx(): ToolContext {
	if (!_toolCtx) throw new Error("Tool context not initialized");
	return _toolCtx;
}

const ENTITY_UPDATE_PERM: Record<string, string> = {
	lead: "leads.update",
	contact: "contacts.update",
	deal: "deals.update",
	company: "companies.update",
};

registerTool({
	name: "update_entity",
	layer: "always",
	permission: null, // checked per entityType inside execute
	confirmation: "twoStep",
	approvalCategory: "update_record",
	description: `
Update fields on a lead, contact, deal, or company.

Provide the entity code (P-001, D-042, CO-007) and a patch object with
the fields to change. The patch can mix CANONICAL fields (displayName,
email, phone, status, source, assignedTo, title, value, currency,
expectedCloseDate, name, industry, website, size, companyId) and
ORG-DEFINED CUSTOM FIELDS (anything you saw on a previous
get_entity_detail / list_entity_fields call — e.g. company_size,
industry_vertical, lead_source_detail).

PRE-FLIGHT FIRST: if the user mentions a custom field name you haven't
seen, call list_entity_fields(entityType) to confirm the exact slug
and accepted options. Pass the option's exact value (e.g.
"11-50", not "small business").

Shows a diff preview and asks for confirmation before writing.
DO NOT update deal stage with this tool — use move_deal_stage from the
pipelines layer instead.
  `.trim(),
	runbook: {
		onSuccess:
			"The diff card already shows what changed — keep your prose to one short sentence. Don't repeat the field-by-field diff in text. If `unknownFields` is non-empty in the result, mention them so the user knows they were skipped.",
		onValidationError:
			'If the patch contains stage fields, suggest expand_tools("pipelines") and use move_deal_stage instead. Otherwise call ask_user_input for the missing/invalid fields.',
		onPermissionDenied:
			"Tell the user they need <entity>.update permission. Suggest contacting an admin.",
	},
	schema: z.object({
		entityType: entityTypeEnum(),
		code: codeString().describe(
			"Entity code: personCode (P-XXX), dealCode (D-XXX), or companyCode (CO-XXX). Case-insensitive; missing dashes auto-corrected.",
		),
		patch: z
			.record(z.string(), z.unknown())
			.describe(
				"Fields to update. Keys are the canonical field names. Both column fields and custom fields are accepted.",
			),
	}),
	execute: async ({ entityType, code, patch }) => {
		const { permissions } = getCtx();
		requirePermission(permissions, ENTITY_UPDATE_PERM[entityType] ?? "leads.update");
		// Bug guard 2026-05-24: AI used to call update_entity with
		// {status:"converted"} on leads, which only patched the lead's
		// status field and never created the contact row. The user saw
		// "lead converted" but the new contact was missing. Redirect to
		// convert_lead so the proper cross-entity conversion runs.
		if (
			entityType === "lead" &&
			typeof (patch as Record<string, unknown>).status === "string" &&
			((patch as Record<string, unknown>).status as string).toLowerCase() === "converted"
		) {
			return {
				ok: false as const,
				error: "To convert a lead to a contact, call `convert_lead` (NOT update_entity). update_entity would only patch the lead's status field — it does not create the new contact row. Re-issue your request as convert_lead({ leadCode }).",
				code: "WRONG_TOOL_USE_CONVERT_LEAD",
			};
		}
		// Reverse direction: when the model tries to "demote" a contact back
		// to a lead via update_entity (e.g. patch={leadId: null} or
		// status: "lead" / "new"), it needs revert_contact instead — that
		// tool soft-deletes the contact AND reopens the original lead atomically.
		if (entityType === "contact") {
			const p = patch as Record<string, unknown>;
			const status =
				typeof p.status === "string" ? (p.status as string).toLowerCase() : undefined;
			const wantsRevert =
				status === "lead" || status === "new" || p.leadId === null || p.leadId === "";
			if (wantsRevert) {
				return {
					ok: false as const,
					error: "To revert a contact back to a lead, call `revert_contact` (NOT update_entity). update_entity cannot soft-delete the contact and reopen the original lead atomically. Re-issue your request as revert_contact({ personCode }).",
					code: "WRONG_TOOL_USE_REVERT_CONTACT",
				};
			}
		}
		return propose(
			"update_entity",
			{ entityType, code, patch },
			{
				title: `Update ${entityType}: ${code}`,
				fields: Object.entries(patch).map(([k, v]) => ({ label: k, value: String(v) })),
			},
		);
	},
});

registerTool({
	name: "commit_update_entity",
	layer: "always",
	permission: null,
	confirmation: "none",
	description: "Internal: commit a pre-approved entity update.",
	schema: z.object({
		entityType: entityTypeEnum(),
		code: codeString(),
		patch: z.record(z.string(), z.unknown()),
	}),
	execute: async ({ entityType, code, patch }) => {
		return runTool(async () => {
			const tc = getCtx();
			requirePermission(tc.permissions, ENTITY_UPDATE_PERM[entityType] ?? "leads.update");

			// Belt-and-braces: same guard as the propose side. If we
			// reach commit time with a lead status=converted patch the
			// caller bypassed propose. Refuse here too.
			if (
				entityType === "lead" &&
				typeof (patch as Record<string, unknown>).status === "string" &&
				((patch as Record<string, unknown>).status as string).toLowerCase() === "converted"
			) {
				return {
					ok: false as const,
					error: "Refused: lead conversion must go through convert_lead, not update_entity. update_entity only patches the status field — it does NOT create the contact row.",
					code: "WRONG_TOOL_USE_CONVERT_LEAD",
				};
			}

			// One round-trip through the shared helper. Auth + rate-limit
			// + RBAC live in the helper's mutation handler.
			const result = (await tc.ctx.runMutation(
				internal.ai.aiEntityPatch.applyEntityPatchByCode,
				{
					orgId: tc.orgId,
					userId: tc.userId,
					entityType,
					code,
					patch,
				},
			)) as {
				entityType: "lead" | "contact" | "deal" | "company";
				entityId: string;
				canonicalCode: string;
				before: Record<string, unknown>;
				after: Record<string, unknown>;
				columnsApplied: string[];
				customFieldsApplied: Array<{ name: string; value: unknown }>;
				unknownFields: string[];
			};

			const display =
				result.before && result.entityId
					? {
							kind: "diff" as const,
							entityType: result.entityType,
							entityId: result.entityId,
							before: result.before,
							after: result.after,
						}
					: undefined;

			const lines: string[] = [];
			if (result.columnsApplied.length > 0) {
				lines.push(`columns: ${result.columnsApplied.join(", ")}`);
			}
			if (result.customFieldsApplied.length > 0) {
				lines.push(
					`custom fields: ${result.customFieldsApplied.map((f) => f.name).join(", ")}`,
				);
			}
			if (result.unknownFields.length > 0) {
				lines.push(`skipped (unknown): ${result.unknownFields.join(", ")}`);
			}

			// P1.9 — rich summary so the chat shows a structured headline
			// + per-field diff above the live diff card.
			const summaryRows: Array<{
				label: string;
				value: string;
				emphasis?: "added" | "changed" | "unchanged";
			}> = [];
			for (const k of result.columnsApplied) {
				const before = result.before[k];
				const after = result.after[k];
				summaryRows.push({
					label: k,
					value:
						before == null
							? `→ ${after == null ? "—" : String(after)}`
							: `${String(before)} → ${after == null ? "—" : String(after)}`,
					emphasis: before == null ? "added" : "changed",
				});
			}
			for (const cf of result.customFieldsApplied) {
				summaryRows.push({
					label: cf.name,
					value: cf.value == null ? "—" : String(cf.value),
					emphasis: "added",
				});
			}

			const facts: string[] = [];
			if (result.unknownFields.length > 0) {
				facts.push(
					`These keys aren't fields on ${entityType}: ${result.unknownFields.join(", ")}. Create them via \`create_field\` first if you'd like to capture them.`,
				);
			}

			const richSummary =
				summaryRows.length > 0
					? {
							headline: `Updated ${entityType} ${result.canonicalCode}`,
							table: summaryRows,
							facts: facts.length > 0 ? facts : undefined,
							suggestedNext: [
								{
									label: "Add note",
									intent: `Add a note to ${result.canonicalCode} explaining this change`,
								},
								{
									label: "Schedule follow-up",
									intent: `Schedule a follow-up with ${result.canonicalCode}`,
								},
							],
						}
					: undefined;

			return {
				ok: true as const,
				data: result,
				...(display
					? { display }
					: {
							display: `✅ ${entityType} ${result.canonicalCode} updated. ${lines.join(" · ")}`,
						}),
				...(richSummary ? { summary: richSummary } : {}),
			};
		});
	},
});

// `toolMutation` import retained for any future extension that wants to
// fan-out additional public mutations (e.g. notification triggers).
void toolMutation;

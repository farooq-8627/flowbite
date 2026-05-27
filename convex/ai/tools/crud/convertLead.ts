/**
 * convex/ai/tools/crud/convertLead.ts
 *
 * Two-step lead → contact conversion:
 *   - `convert_lead`           proposes the write (preview card in chat)
 *   - `commit_convert_lead`    runs `leads/mutations:convertToContact` after approval
 *
 * Why this tool exists (regression 2026-05-24):
 *   The model previously had NO conversion tool. When asked to "convert
 *   this lead to a contact", it fell back to `update_entity` with
 *   `{status: "converted"}`. That patch satisfied the lead row but
 *   never created the contact row — the user saw "lead converted" but
 *   the new contact was missing from the contacts list. Surfaced in the
 *   2026-05-24 incident report.
 *
 * Permission: `leads.convert`. Confirmation: twoStep (destructive +
 * cross-entity).
 */
import { z } from "zod";
import { registerTool } from "../../toolRegistry";
import { optionalString, propose, requirePermission, runTool, toolMutation } from "../_shared";
import { getCrudCtx } from "./_context";

registerTool({
	name: "convert_lead",
	layer: "always",
	permission: "leads.convert",
	confirmation: "twoStep",
	approvalCategory: "convert_record",
	description:
		"Convert a lead into a contact. Creates a new contact row carrying the same personCode, displayName, email, phone, tags, and aiContext from the lead, and marks the lead status='converted'. Use this — NOT update_entity — when the user asks to convert / promote a lead.",
	instruction: {
		whenToCall:
			"User asks to convert a lead to a contact / promote a lead / mark a lead as a customer. The lead must exist and be in a non-converted state.",
		whenNotToCall:
			"the entity is already a contact (no-op), the lead is in 'lost' status (call update_entity to reopen first if needed), or the user wants to MERGE with an existing contact (different operation, not yet supported — surface this).",
		preflight: ["search_crm"],
		requiredClarifications: ["leadCode"],
		synonyms: ["promote lead", "mark as contact", "convert to customer", "qualify lead"],
		goodExample: {
			description: "User: 'Convert lead P-007 (Sarah Khan) to a contact.'",
			args: {
				leadCode: "P-007",
			},
		},
		badExample: {
			description:
				"Calling update_entity on a lead with {status: 'converted'} when the user asked to convert.",
			args: { entityType: "lead", code: "P-007", patch: { status: "converted" } },
			whyBad: "That only patches the lead's status field — it does NOT create the contact row, so the new contact never appears in the contacts list. ALWAYS call convert_lead instead.",
		},
	},
	runbook: {
		onSuccess:
			"Confirm in one sentence with the new contact's personCode (it's the same as the lead's). The structured summary card auto-renders. Suggest creating a deal next if the user mentioned a sales opportunity.",
		onValidationError:
			"If the leadCode wasn't provided, call ask_user_input ONCE asking which lead.",
		onPermissionDenied:
			"Tell the user this requires the leads.convert permission. Suggest contacting an admin.",
		suggestNext: "create_deal",
	},
	schema: z.object({
		leadCode: z.string().min(1).describe("The lead's personCode (P-XXX). Required."),
		companyCode: optionalString().describe(
			"Optional company code (C-XXX) to associate with the new contact.",
		),
	}),
	execute: async (args) => {
		const { permissions } = getCrudCtx();
		requirePermission(permissions, "leads.convert");
		return propose("convert_lead", args, {
			title: `Convert lead ${args.leadCode} to contact`,
			fields: [
				{ label: "Lead", value: args.leadCode },
				{ label: "Company", value: args.companyCode ?? "—" },
				{
					label: "Effect",
					value: "Creates a contact row, copies personCode + tags, marks lead status=converted",
				},
			],
		});
	},
});

registerTool({
	name: "commit_convert_lead",
	layer: "always",
	permission: "leads.convert",
	confirmation: "none",
	description:
		"Internal: commit a pre-approved lead-to-contact conversion. Do not call without prior convert_lead approval.",
	schema: z.object({
		leadCode: z.string(),
		companyCode: optionalString(),
	}),
	execute: async (args) =>
		runTool(async () => {
			const { ctx, orgId, userId, permissions } = getCrudCtx();
			requirePermission(permissions, "leads.convert");

			// Resolve leadCode → leadId (and optionally companyCode → companyId).
			// We re-use the canonical resolver from _shared/aiEntityPatch via
			// the AI internal helper so permissions + dedup are consistent.
			const lead = (await ctx.runMutation(
				// biome-ignore lint/suspicious/noExplicitAny: pre-codegen ref
				"ai/aiEntityPatch:resolveEntityCode" as any,
				{
					orgId,
					userId,
					entityType: "lead" as const,
					code: args.leadCode,
				},
			)) as { entityId: string; canonicalCode: string; displayName: string };

			let companyId: string | undefined;
			if (args.companyCode && args.companyCode.length > 0) {
				const company = (await ctx.runMutation(
					// biome-ignore lint/suspicious/noExplicitAny: pre-codegen ref
					"ai/aiEntityPatch:resolveEntityCode" as any,
					{
						orgId,
						userId,
						entityType: "company" as const,
						code: args.companyCode,
					},
				)) as { entityId: string };
				companyId = company.entityId;
			}

			const result = (await toolMutation(
				getCrudCtx(),
				"crm/entities/leads/mutations:convertToContact",
				{
					orgId,
					leadId: lead.entityId,
					...(companyId ? { companyId } : {}),
				},
			)) as { contactId: string; personCode: string };

			return {
				ok: true as const,
				data: result,
				display: {
					kind: "entity" as const,
					entityType: "contact" as const,
					entityId: result.contactId,
					orgId,
				},
				summary: {
					headline: `Converted lead ${lead.canonicalCode} → contact (${lead.displayName})`,
					table: [
						{ label: "Contact", value: result.personCode },
						{ label: "Lead status", value: "converted" },
						{
							label: "Carried over",
							value: "personCode, tags, aiContext",
						},
					],
					suggestedNext: [
						{
							label: "Create a deal",
							intent: `Create a deal for ${result.personCode}`,
						},
						{
							label: "Open contact",
							intent: `Show contact ${result.personCode}`,
						},
					],
				},
			};
		}),
});

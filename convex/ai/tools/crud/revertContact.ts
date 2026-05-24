/**
 * convex/ai/tools/crud/revertContact.ts
 *
 * Two-step contact → lead reversion (the inverse of `convert_lead`):
 *   - `revert_contact`           proposes the write (preview card in chat)
 *   - `commit_revert_contact`    runs `contacts/mutations:revertToLead` after approval
 *
 * Why this tool exists (regression 2026-05-24):
 *   The model had `convert_lead` (forward) but no inverse. When asked to
 *   "revert / un-convert / move this contact back to a lead", it had no tool
 *   to call and either gave up or hallucinated `update_entity` patches that
 *   would not soft-delete the contact + reopen the lead atomically.
 *
 * Permission: `leads.convert` (same key that did the original conversion).
 * Confirmation: twoStep — destructive (soft-deletes the contact, mutates two
 * rows). The structured summary returns the original lead's personCode so
 * the user can immediately open it.
 */
import { z } from "zod";
import { registerTool } from "../../toolRegistry";
import { propose, requirePermission, runTool, toolMutation } from "../_shared";
import { getCrudCtx } from "./_context";

registerTool({
	name: "revert_contact",
	layer: "always",
	permission: "leads.convert",
	confirmation: "twoStep",
	description:
		"Revert a contact back to a lead. Soft-deletes the contact row and reopens the original lead (status='new'). Use this — NOT update_entity — when the user asks to un-convert / revert / take a contact back to lead status. Only works when the contact was originally created from a lead (carries the `leadId` link).",
	instruction: {
		whenToCall:
			"User asks to revert / un-convert / move a contact back to a lead, OR says the conversion was a mistake. The contact must have been created via convert_lead (so it has a backing lead row). Shows a preview card and waits for approval before writing.",
		whenNotToCall:
			"the contact was created directly (no origin lead — surface 'NO_ORIGIN_LEAD' error and offer delete instead), the user wants to delete the contact entirely (call delete_entity), or the user wants to update fields (call update_entity).",
		preflight: ["search_crm"],
		requiredClarifications: ["personCode"],
		synonyms: [
			"revert contact",
			"un-convert contact",
			"move contact back to lead",
			"undo conversion",
			"contact to lead",
			"convert contact to lead",
		],
		goodExample: {
			description: "User: 'Move contact P-014 (Sarah Khan) back to a lead.'",
			args: { personCode: "P-014" },
		},
		badExample: {
			description:
				"Calling update_entity on a contact with {leadId: null} or trying to set status='lead'.",
			args: { entityType: "contact", code: "P-014", patch: { status: "lead" } },
			whyBad: "That doesn't reopen the original lead row, doesn't soft-delete the contact, and doesn't rebalance the lead.open / contact.active counters. ALWAYS call revert_contact instead.",
		},
	},
	runbook: {
		onSuccess:
			"Confirm in one sentence with the original lead's personCode (it's the same as the contact's). The structured summary card auto-renders. Suggest opening the lead next.",
		onValidationError:
			"If the personCode wasn't provided, call ask_user_input ONCE asking which contact.",
		onPermissionDenied:
			"Tell the user this requires the leads.convert permission. Suggest contacting an admin.",
		suggestNext: "search_crm",
	},
	schema: z.object({
		personCode: z
			.string()
			.min(1)
			.describe(
				"The contact's personCode (P-XXX). Required. The same code is preserved on the lead after revert.",
			),
	}),
	execute: async (args) => {
		const { permissions } = getCrudCtx();
		requirePermission(permissions, "leads.convert");
		return propose("revert_contact", args, {
			title: `Revert contact ${args.personCode} back to lead`,
			fields: [
				{ label: "Contact", value: args.personCode },
				{
					label: "Effect",
					value: "Reopens the original lead (status=new), soft-deletes the contact",
				},
			],
		});
	},
});

registerTool({
	name: "commit_revert_contact",
	layer: "always",
	permission: "leads.convert",
	confirmation: "none",
	description:
		"Internal: commit a pre-approved contact-to-lead reversion. Do not call without prior revert_contact approval.",
	schema: z.object({
		personCode: z.string(),
	}),
	execute: async (args) =>
		runTool(async () => {
			const { ctx, orgId, userId, permissions } = getCrudCtx();
			requirePermission(permissions, "leads.convert");

			// Resolve personCode → contactId via the canonical AI resolver so
			// permissions + dedup stay consistent across all entity-targeted
			// tools.
			const contact = (await ctx.runMutation(
				// biome-ignore lint/suspicious/noExplicitAny: pre-codegen ref
				"ai/aiEntityPatch:resolveEntityCode" as any,
				{
					orgId,
					userId,
					entityType: "contact" as const,
					code: args.personCode,
				},
			)) as { entityId: string; canonicalCode: string; displayName: string };

			const result = (await toolMutation(
				getCrudCtx(),
				"crm/entities/contacts/mutations:revertToLead",
				{
					orgId,
					contactId: contact.entityId,
				},
			)) as { leadId: string; personCode: string; displayName: string };

			return {
				ok: true as const,
				data: result,
				display: {
					kind: "entity" as const,
					entityType: "lead" as const,
					entityId: result.leadId,
					orgId,
				},
				summary: {
					headline: `Reverted contact ${result.personCode} → lead (${result.displayName})`,
					table: [
						{ label: "Lead", value: result.personCode },
						{ label: "Lead status", value: "new" },
						{
							label: "Contact",
							value: "soft-deleted (no longer in contacts list)",
						},
					],
					suggestedNext: [
						{
							label: "Open lead",
							intent: `Show lead ${result.personCode}`,
						},
						{
							label: "Update lead",
							intent: `Update lead ${result.personCode}`,
						},
					],
				},
			};
		}),
});

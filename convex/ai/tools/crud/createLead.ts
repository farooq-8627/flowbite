/**
 * convex/ai/tools/crud/createLead.ts
 *
 * Two-step lead creation:
 *   - `create_lead` proposes the write (rendered in chat as a LeadPreviewCard)
 *   - `commit_create_lead` runs the actual mutation after approval
 *
 * Schema design:
 *   - `displayName` is required; everything else is optional.
 *   - Optional fields use `optionalString()` which coerces null/""/whitespace
 *     to `undefined` BEFORE the inner validator runs — this stops LLMs that
 *     emit `null` for "no value" from triggering Zod retry loops.
 *   - The model is told (via the description) to call `ask_user_input` when
 *     it needs more data, and to NEVER pass null to optional fields.
 *
 * Permission: `leads.create`. Confirmation: twoStep.
 */
import { z } from "zod";
import { registerTool } from "../../toolRegistry";
import { optionalString, propose, requirePermission, runTool, toolMutation } from "../_shared";
import { getCrudCtx } from "./_context";

registerTool({
	name: "create_lead",
	layer: "always",
	permission: "leads.create",
	confirmation: "twoStep",
	description: `
Create a new lead (prospective customer). ALWAYS search_crm first to check for duplicates.
Shows a preview and asks for user confirmation before writing.

If the user only gives a name, that's enough — propose the lead with just the name and offer to
collect more details after creation. NEVER pass null or "" to optional fields. If the user wants
the optional fields filled in BEFORE creation, call ask_user_input to collect them first.
	`.trim(),
	runbook: {
		onSuccess:
			"Confirm with the new lead's personCode in one short sentence. Then offer to set a follow-up reminder.",
		onValidationError:
			"Group failed fields and call ask_user_input ONCE for ALL of them. Never retry with the same args.",
		onPermissionDenied:
			"Tell the user they need leads.create permission. Suggest contacting an admin.",
		suggestNext: "create_followup",
	},
	schema: z.object({
		displayName: z.string().min(1).describe("Full name of the lead. Required."),
		email: optionalString(z.string().email()),
		phone: optionalString(),
		source: z.string().default("manual").describe("Lead source: manual, referral, web, etc."),
		assignedTo: optionalString().describe("userId to assign this lead to."),
		notes: optionalString().describe("Initial note to attach."),
	}),
	execute: async (args) => {
		const { permissions } = getCrudCtx();
		requirePermission(permissions, "leads.create");
		return propose("create_lead", args, {
			title: `Create lead: ${args.displayName}`,
			fields: [
				{ label: "Name", value: args.displayName },
				{ label: "Email", value: args.email ?? "—" },
				{ label: "Phone", value: args.phone ?? "—" },
				{ label: "Source", value: args.source },
				{ label: "Notes", value: args.notes ?? "—" },
			],
		});
	},
});

registerTool({
	name: "commit_create_lead",
	layer: "always",
	permission: "leads.create",
	confirmation: "none",
	description:
		"Internal: commit a pre-approved lead creation. Do not call without prior create_lead approval.",
	schema: z.object({
		displayName: z.string(),
		email: optionalString(),
		phone: optionalString(),
		source: z.string().default("manual"),
		assignedTo: optionalString(),
	}),
	execute: async (args) => {
		return runTool(async () => {
			const { ctx, orgId, permissions } = getCrudCtx();
			requirePermission(permissions, "leads.create");
			const result = (await toolMutation(getCrudCtx(), "crm/entities/leads/mutations:create", {
				orgId,
				...args,
			})) as { leadId: string; personCode: string };
			return {
				ok: true as const,
				data: result,
				display: {
					kind: "entity" as const,
					entityType: "lead" as const,
					entityId: result.leadId,
				},
			};
		});
	},
});

/**
 * convex/ai/tools/crud/createContact.ts
 *
 * Two-step contact creation. Email is REQUIRED for contacts (unlike leads
 * where email is optional) — a contact without a contact method is a lead.
 *
 * If the user hasn't given an email, the model is told to call
 * `ask_user_input` to collect it. Never fabricate.
 *
 * Permission: `contacts.create`. Confirmation: twoStep.
 */
import { z } from "zod";
import { registerTool } from "../../toolRegistry";
import { optionalString, propose, requirePermission, runTool, toolMutation } from "../_shared";
import { getCrudCtx } from "./_context";

registerTool({
	name: "create_contact",
	layer: "always",
	permission: "contacts.create",
	confirmation: "twoStep",
	description: `
Create a new contact (qualified person already in a relationship with the business).
Shows a preview and asks for confirmation before writing.

Email is required. If the user hasn't given an email, call ask_user_input to collect it.
NEVER fabricate email addresses. NEVER pass null or "" to optional fields.
	`.trim(),
	runbook: {
		onSuccess:
			"Confirm with the contact's personCode in one short sentence. Offer to attach the contact to a company or open a new deal.",
		onValidationError:
			"If email is missing/invalid, call ask_user_input for it. Never fabricate.",
		onPermissionDenied:
			"Tell the user they need contacts.create permission. Suggest contacting an admin.",
		suggestNext: "create_deal",
	},
	schema: z.object({
		firstName: z.string().min(1),
		lastName: z.string().min(1),
		email: z.string().email(),
		phone: optionalString(),
		jobTitle: optionalString(),
		companyId: optionalString(),
	}),
	execute: async (args) => {
		const { permissions } = getCrudCtx();
		requirePermission(permissions, "contacts.create");
		return propose("create_contact", args, {
			title: `Create contact: ${args.firstName} ${args.lastName}`,
			fields: [
				{ label: "Name", value: `${args.firstName} ${args.lastName}` },
				{ label: "Email", value: args.email },
				{ label: "Phone", value: args.phone ?? "—" },
				{ label: "Job Title", value: args.jobTitle ?? "—" },
			],
		});
	},
});

registerTool({
	name: "commit_create_contact",
	layer: "always",
	permission: "contacts.create",
	confirmation: "none",
	description: "Internal: commit a pre-approved contact creation.",
	schema: z.object({
		firstName: z.string(),
		lastName: z.string(),
		email: z.string(),
		phone: optionalString(),
		jobTitle: optionalString(),
		companyId: optionalString(),
	}),
	execute: async (args) => {
		return runTool(async () => {
			const { ctx, orgId, permissions } = getCrudCtx();
			requirePermission(permissions, "contacts.create");
			const result = (await toolMutation(getCrudCtx(), "crm/entities/contacts/mutations:create", {
				orgId,
				...args,
			})) as { contactId: string; personCode: string };
			return {
				ok: true as const,
				data: result,
				display: {
					kind: "entity" as const,
					entityType: "contact" as const,
					entityId: result.contactId,
				},
			};
		});
	},
});

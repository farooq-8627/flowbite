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
	description:
		"Create a new contact (qualified person). Run search_crm first to avoid duplicates.",
	instruction: {
		whenToCall:
			"Use when the user asks to add someone they already work with — the person is past the lead stage, has an email, and represents an active relationship. Shows a preview card and waits for approval.",
		whenNotToCall:
			"the person is a fresh prospect (call create_lead) OR is already in the CRM (call update_entity).",
		preflight: ["search_crm"],
		requiredClarifications: ["firstName", "lastName", "email"],
		synonyms: ["customer", "client", "qualified person"],
		goodExample: {
			description: "User: 'Add Bob Lee, Director of Marketing at Acme, bob@acme.io.'",
			args: {
				firstName: "Bob",
				lastName: "Lee",
				email: "bob@acme.io",
				jobTitle: "Director of Marketing",
			},
		},
		badExample: {
			description: "User: 'Add Bob' (no email).",
			args: { firstName: "Bob", lastName: "", email: "" },
			whyBad: "Contacts require email. Call ask_user_input for email + last name first.",
		},
	},
	runbook: {
		onSuccess:
			"PRE-FLIGHT FIRST: ALWAYS call `search_crm` with email (and name as fallback) before this tool. If a contact with the same email exists, do NOT create — surface the existing record. After success: write ONE concise sentence ('Bob Lee is now a contact — code C-007'). The structured summary card auto-renders fields + suggested follow-ups.",
		onValidationError: "If email is missing/invalid, call ask_user_input. Never fabricate.",
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
			const { orgId, permissions } = getCrudCtx();
			requirePermission(permissions, "contacts.create");
			const result = (await toolMutation(
				getCrudCtx(),
				"crm/entities/contacts/mutations:create",
				{
					orgId,
					...args,
				},
			)) as { contactId: string; personCode: string };

			// P1.9 — structured summary so the chat shows headline + table
			// + suggested-next chips above the EntityCard.
			const fullName = `${args.firstName} ${args.lastName}`;
			const summaryRows: Array<{ label: string; value: string }> = [
				{ label: "Name", value: fullName },
				{ label: "Email", value: args.email },
			];
			if (args.phone) summaryRows.push({ label: "Phone", value: args.phone });
			if (args.jobTitle) summaryRows.push({ label: "Job title", value: args.jobTitle });

			return {
				ok: true as const,
				data: result,
				display: {
					kind: "entity" as const,
					entityType: "contact" as const,
					entityId: result.contactId,
				},
				summary: {
					headline: `Created contact ${result.personCode}: ${fullName}`,
					table: summaryRows,
					suggestedNext: [
						{
							label: "Open a deal",
							intent: `Create a deal for ${result.personCode}`,
						},
						{
							label: "Schedule a follow-up",
							intent: `Schedule a follow-up call with ${result.personCode} for next week`,
						},
						{
							label: "Attach to a company",
							intent: `Link contact ${result.personCode} to a company`,
						},
					],
					cardFields: [
						"firstName",
						"lastName",
						"email",
						"phone",
						"jobTitle",
						"companyId",
						"personCode",
						"tags",
					],
				},
			};
		});
	},
});

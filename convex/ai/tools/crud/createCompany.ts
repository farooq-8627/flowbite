/**
 * convex/ai/tools/crud/createCompany.ts
 *
 * Two-step company / account creation. Only `name` is required.
 *
 * Permission: `companies.create`. Confirmation: twoStep.
 */
import { z } from "zod";
import { registerTool } from "../../toolRegistry";
import { optionalString, propose, requirePermission, runTool, toolMutation } from "../_shared";
import { getCrudCtx } from "./_context";

registerTool({
	name: "create_company",
	layer: "always",
	permission: "companies.create",
	confirmation: "twoStep",
	approvalCategory: "create_record",
	description: "Create a new company/account. Run search_crm first.",
	instruction: {
		whenToCall:
			"Use when the user asks to add a new company / account / organisation that owns one or more contacts. Shows a preview card and waits for approval.",
		whenNotToCall: "the company already exists (call update_entity to edit it).",
		preflight: ["search_crm"],
		requiredClarifications: ["name"],
		synonyms: ["account", "organisation", "business"],
		goodExample: {
			description: "User: 'Add Acme Corp, https://acme.io, healthcare.'",
			args: {
				name: "Acme Corp",
				website: "https://acme.io",
				industry: "Healthcare",
			},
		},
		badExample: {
			description: "User: 'Add a company.'",
			args: { name: "" },
			whyBad: "name is required. Call ask_user_input for the company name.",
		},
	},
	runbook: {
		onSuccess:
			"PRE-FLIGHT FIRST: ALWAYS call `search_crm` with the company name (and website domain if known). Companies frequently get duplicated under slight name variations ('Acme Corp' vs 'Acme Corporation'). If a likely match is found, ask the user before creating. After success: write ONE concise sentence — the structured summary card auto-renders fields + suggested next steps.",
		onValidationError:
			"Re-collect missing fields via ask_user_input. Don't retry with the same args.",
		onPermissionDenied:
			"Tell the user they need companies.create permission. Suggest contacting an admin.",
		suggestNext: "create_contact",
	},
	schema: z.object({
		name: z.string().min(1),
		website: optionalString(),
		industry: optionalString(),
	}),
	execute: async (args) => {
		const { permissions } = getCrudCtx();
		requirePermission(permissions, "companies.create");
		return propose("create_company", args, {
			title: `Create company: ${args.name}`,
			fields: [
				{ label: "Name", value: args.name },
				{ label: "Website", value: args.website ?? "—" },
				{ label: "Industry", value: args.industry ?? "—" },
			],
		});
	},
});

registerTool({
	name: "commit_create_company",
	layer: "always",
	permission: "companies.create",
	confirmation: "none",
	description: "Internal: commit a pre-approved company creation.",
	schema: z.object({
		name: z.string(),
		website: optionalString(),
		industry: optionalString(),
	}),
	execute: async (args) => {
		return runTool(async () => {
			const { orgId, permissions } = getCrudCtx();
			requirePermission(permissions, "companies.create");
			const result = (await toolMutation(
				getCrudCtx(),
				"crm/entities/companies/mutations:create",
				{
					orgId,
					...args,
				},
			)) as { companyId: string; companyCode: string };

			// P1.9 — structured summary.
			const summaryRows: Array<{ label: string; value: string }> = [
				{ label: "Name", value: args.name },
			];
			if (args.website) summaryRows.push({ label: "Website", value: args.website });
			if (args.industry) summaryRows.push({ label: "Industry", value: args.industry });

			return {
				ok: true as const,
				data: result,
				display: {
					kind: "entity" as const,
					entityType: "company" as const,
					entityId: result.companyId,
				},
				summary: {
					headline: `Created company ${result.companyCode}: ${args.name}`,
					table: summaryRows,
					suggestedNext: [
						{
							label: "Add primary contact",
							intent: `Create a contact at ${result.companyCode}`,
						},
						{
							label: "Open a deal",
							intent: `Create a deal for ${result.companyCode}`,
						},
						{
							label: "Add note",
							intent: `Add a note to ${result.companyCode} summarising the relationship`,
						},
					],
					cardFields: ["name", "website", "industry", "companyCode", "tags"],
				},
			};
		});
	},
});

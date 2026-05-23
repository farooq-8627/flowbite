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
	description:
		"Create a new company/account. Shows preview before writing. NEVER pass null or empty strings to optional fields.",
	runbook: {
		onSuccess:
			"Confirm with the company's companyCode. Offer to add a primary contact at this company.",
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
			const { ctx, orgId, permissions } = getCrudCtx();
			requirePermission(permissions, "companies.create");
			const result = (await toolMutation(getCrudCtx(), "crm/entities/companies/mutations:create", {
				orgId,
				...args,
			})) as { companyId: string; companyCode: string };
			return {
				ok: true as const,
				data: result,
				display: {
					kind: "entity" as const,
					entityType: "company" as const,
					entityId: result.companyId,
				},
			};
		});
	},
});

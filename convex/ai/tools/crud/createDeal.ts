/**
 * convex/ai/tools/crud/createDeal.ts
 *
 * Two-step deal creation. Only `title` is required.
 *
 * `personCode` is the canonical link to a person (lead/contact). When the
 * model has only a name, it should call search_crm to resolve to a personCode
 * before passing it here — never fabricate codes.
 *
 * Permission: `deals.create`. Confirmation: twoStep.
 */
import { z } from "zod";
import { registerTool } from "../../toolRegistry";
import {
	optionalNumber,
	optionalString,
	propose,
	requirePermission,
	runTool,
	toolMutation,
} from "../_shared";
import { getCrudCtx } from "./_context";

registerTool({
	name: "create_deal",
	layer: "always",
	permission: "deals.create",
	confirmation: "twoStep",
	description:
		"Create a new deal. Shows preview before writing. NEVER pass null or empty strings to optional fields. Resolve `personCode` via search_crm — never fabricate codes.",
	runbook: {
		onSuccess:
			"Confirm with the deal's dealCode. Offer to set an expected-close-date reminder.",
		onValidationError:
			"If personCode is missing or fabricated, call search_crm to resolve. Don't retry with the same args.",
		onPermissionDenied:
			"Tell the user they need deals.create permission. Suggest contacting an admin.",
		suggestNext: "create_followup",
	},
	schema: z.object({
		title: z.string().min(1),
		value: optionalNumber(),
		pipelineId: optionalString(),
		personCode: optionalString().describe("Associated person (P-XXX code)."),
		expectedCloseDate: optionalNumber(),
	}),
	execute: async (args) => {
		const { permissions } = getCrudCtx();
		requirePermission(permissions, "deals.create");
		return propose("create_deal", args, {
			title: `Create deal: ${args.title}`,
			fields: [
				{ label: "Title", value: args.title },
				{ label: "Value", value: args.value ?? "—" },
				{ label: "Person", value: args.personCode ?? "—" },
			],
		});
	},
});

registerTool({
	name: "commit_create_deal",
	layer: "always",
	permission: "deals.create",
	confirmation: "none",
	description: "Internal: commit a pre-approved deal creation.",
	schema: z.object({
		title: z.string(),
		value: optionalNumber(),
		pipelineId: optionalString(),
		personCode: optionalString(),
		expectedCloseDate: optionalNumber(),
	}),
	execute: async (args) => {
		return runTool(async () => {
			const { ctx, orgId, permissions } = getCrudCtx();
			requirePermission(permissions, "deals.create");
			const result = (await toolMutation(getCrudCtx(), "crm/entities/deals/mutations:create", {
				orgId,
				...args,
			})) as { dealId: string; dealCode: string };
			return {
				ok: true as const,
				data: result,
				display: {
					kind: "entity" as const,
					entityType: "deal" as const,
					entityId: result.dealId,
				},
			};
		});
	},
});

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
	approvalCategory: "create_record",
	description: "Create a new deal. Resolve personCode via search_crm — never fabricate codes.",
	instruction: {
		whenToCall:
			"Use when the user asks to open / start a new sales opportunity for an existing person. Shows a preview card and waits for approval.",
		whenNotToCall:
			"the deal already exists (call update_entity to change stage/value) OR the person isn't in the CRM yet (call create_lead or create_contact first).",
		preflight: ["search_crm"],
		requiredClarifications: ["title"],
		synonyms: ["opportunity", "sale", "pipeline entry"],
		goodExample: {
			description: "User: 'Open a $25k deal for P-001 — Q3 contract renewal.'",
			args: {
				title: "Q3 contract renewal",
				value: 25000,
				personCode: "P-001",
			},
		},
		badExample: {
			description: "User: 'Make a deal' (no person).",
			args: { title: "" },
			whyBad: "title is required. Call ask_user_input for the deal title; resolve personCode via search_crm if a person is mentioned.",
		},
	},
	runbook: {
		onSuccess:
			"PRE-FLIGHT FIRST: ALWAYS call `search_crm` with the deal title (and personCode if known) before this tool. If a parallel open deal exists for the same person, ask before creating. After success: write ONE concise sentence — the structured summary card auto-renders fields + suggested next steps.",
		onValidationError:
			"If personCode is missing or fabricated, call search_crm to resolve. Don't retry with the same args.",
		onPermissionDenied:
			"Tell the user they need deals.create permission. Suggest contacting an admin.",
		suggestNext: "create_task",
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
			const { orgId, permissions } = getCrudCtx();
			requirePermission(permissions, "deals.create");
			const result = (await toolMutation(
				getCrudCtx(),
				"crm/entities/deals/mutations:create",
				{
					orgId,
					...args,
				},
			)) as { dealId: string; dealCode: string };

			// P1.9 — structured summary.
			const summaryRows: Array<{ label: string; value: string }> = [
				{ label: "Title", value: args.title },
			];
			if (args.value != null) summaryRows.push({ label: "Value", value: String(args.value) });
			if (args.personCode) summaryRows.push({ label: "Person", value: args.personCode });
			if (args.expectedCloseDate)
				summaryRows.push({
					label: "Expected close",
					value: new Date(args.expectedCloseDate).toLocaleDateString(),
				});

			return {
				ok: true as const,
				data: result,
				display: {
					kind: "entity" as const,
					entityType: "deal" as const,
					entityId: result.dealId,
				},
				summary: {
					headline: `Created deal ${result.dealCode}: ${args.title}`,
					table: summaryRows,
					suggestedNext: [
						{
							label: "Set close-date reminder",
							intent: `Schedule a reminder for ${result.dealCode} ahead of its expected close date`,
						},
						{
							label: "Add note",
							intent: `Add a note to ${result.dealCode} summarising the deal context`,
						},
						{
							label: "Move stage",
							intent: `Move ${result.dealCode} to the next pipeline stage`,
						},
					],
					cardFields: [
						"title",
						"value",
						"pipelineId",
						"stage",
						"personCode",
						"dealCode",
						"expectedCloseDate",
					],
				},
			};
		});
	},
});

/**
 * convex/ai/tools/companies/removePerson.ts
 *
 * Stage 3 of /SPRINT-PLAN.md (2026-05-26). Two-step company-person unlink.
 *
 *   remove_person_from_company (propose) → confirmation card
 *      ↓ user approves
 *   commit_remove_person_from_company    → calls
 *                                          companies/mutations:removePersonForAI
 *
 * Permission: `companies.update`. Idempotent — calling twice with the
 * same personCode is a no-op (returns `wasMember: false`).
 *
 * UX safety: this is destructive UX (the user is breaking a relationship
 * row that may have downstream consequences — deals can keep their
 * `companyId` foreign key, but the user-facing "people at Acme" list
 * shrinks). Hence twoStep, not atomic.
 */
import { z } from "zod";
import { internal } from "../../../_generated/api";
import type { CascadeImpactResult } from "../../queries/cascadeImpact";
import { registerTool } from "../../toolRegistry";
import { propose, requirePermission, runTool, toolMutation } from "../_shared";
import { getCompaniesCtx } from "./_context";

const schema = z.object({
	companyCode: z.string().min(1).describe("Company code (C-XXX / CO-XXX)."),
	personCode: z
		.string()
		.min(1)
		.describe("Person code to unlink (P-XXX). Lead OR contact — both are people."),
});

registerTool({
	name: "remove_person_from_company",
	layer: "always",
	permission: "companies.update",
	confirmation: "twoStep",
	description: "Unlink a person from a company by code. Idempotent — safe to call twice.",
	instruction: {
		whenToCall:
			"User asks to unlink / remove / disassociate a person from a company ('Remove Sara from Acme', 'Sara left Acme').",
		whenNotToCall:
			"the user wants to delete the company entirely (use delete_entity with entityType='company') OR delete the person (use delete_entity with entityType='lead'/'contact'). Removing a link is reversible via add_person_to_company; deleting an entity sends it to trash.",
		preflight: ["search_crm"],
		requiredClarifications: ["companyCode", "personCode"],
		synonyms: ["remove from company", "unlink from company", "disassociate", "detach"],
		goodExample: {
			description: "User: 'Sara left Acme — remove her.'",
			args: { companyCode: "C-003", personCode: "P-014" },
		},
	},
	runbook: {
		onSuccess:
			"Reply with one short sentence. If wasMember: false, mention the link didn't exist ('Sara wasn't linked to Acme to begin with — nothing changed.').",
		onPermissionDenied: "Tell the user they need companies.update permission.",
	},
	schema,
	execute: async (args) => {
		return runTool(async () => {
			const tc = getCompaniesCtx();
			requirePermission(tc.permissions, "companies.update");

			const impact = (await tc.ctx.runQuery(
				internal.ai.queries.cascadeImpact.getEntityCascadeImpact,
				{
					orgId: tc.orgId,
					userId: tc.userId,
					entityType: "company" as const,
					entityCode: args.companyCode,
				},
			)) as CascadeImpactResult;
			if (impact.kind === "not_found") {
				return {
					ok: false as const,
					code: "NOT_FOUND",
					error: `No company found with code ${args.companyCode}. Call search_crm first.`,
				};
			}

			return propose("remove_person_from_company", args, {
				title: `Unlink ${args.personCode} from ${impact.displayName}`,
				fields: [
					{ label: "Company", value: `${impact.canonicalCode} (${impact.displayName})` },
					{ label: "Person", value: args.personCode },
					{
						label: "Reversible",
						value: "Yes — re-link via add_person_to_company.",
					},
				],
			});
		});
	},
});

registerTool({
	name: "commit_remove_person_from_company",
	layer: "always",
	permission: "companies.update",
	confirmation: "none",
	description:
		"Internal: commit a pre-approved remove_person_from_company call. Do not call without prior remove_person_from_company approval.",
	schema,
	execute: async (args) =>
		runTool(async () => {
			const tc = getCompaniesCtx();
			requirePermission(tc.permissions, "companies.update");

			const impact = (await tc.ctx.runQuery(
				internal.ai.queries.cascadeImpact.getEntityCascadeImpact,
				{
					orgId: tc.orgId,
					userId: tc.userId,
					entityType: "company" as const,
					entityCode: args.companyCode,
				},
			)) as CascadeImpactResult;
			if (impact.kind === "not_found") {
				return {
					ok: false as const,
					code: "NOT_FOUND",
					error: `No company found with code ${args.companyCode}.`,
				};
			}

			const result = (await toolMutation(
				tc,
				"crm/entities/companies/mutations:removePerson",
				{
					orgId: tc.orgId,
					companyId: impact.entityId,
					personCode: args.personCode,
				},
			)) as { wasMember: boolean; companyName: string; companyCode: string };

			return {
				ok: true as const,
				data: result,
				display: {
					kind: "entity" as const,
					entityType: "company" as const,
					entityId: impact.entityId,
				},
				summary: {
					headline: result.wasMember
						? `Unlinked ${args.personCode} from ${result.companyCode}`
						: `${args.personCode} was not linked to ${result.companyCode}`,
					table: [
						{
							label: "Company",
							value: `${result.companyCode} (${result.companyName})`,
						},
						{ label: "Person", value: args.personCode },
						{
							label: "Status",
							value: result.wasMember ? "Unlinked" : "Was not linked (no-op)",
						},
					],
					suggestedNext: [
						{
							label: "Re-link",
							intent: `Add ${args.personCode} back to ${result.companyCode}`,
						},
						{
							label: "Add to a different company",
							intent: `Add ${args.personCode} to a different company`,
						},
					],
				},
			};
		}),
});

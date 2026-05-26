/**
 * convex/ai/tools/companies/addPerson.ts
 *
 * Stage 3 of /SPRINT-PLAN.md (2026-05-26). Two-step company-person link:
 *
 *   add_person_to_company (propose) → confirmation card
 *      ↓ user approves
 *   commit_add_person_to_company    → calls companies/mutations:addPersonForAI
 *
 * Schema:
 *   - `companyCode` (C-XXX / CO-XXX) is the public code; resolved to
 *     companyId via the cascade-impact internal query (which also
 *     returns the company's display name for the propose card).
 *   - `personCode` (P-XXX) is the link target. We don't pre-resolve it
 *     to a person row at propose time — the underlying mutation
 *     idempotently appends to `personCodes[]` regardless.
 *
 * Permission: `companies.update`.
 *
 * Idempotency: the underlying mutation is idempotent — calling it twice
 * with the same personCode is a no-op. The propose card shows that the
 * caller's intent is to add the link; if the link already exists the
 * commit returns `{ alreadyMember: true }`.
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
		.describe("Person code to link (P-XXX). Lead OR contact — both are people."),
});

registerTool({
	name: "add_person_to_company",
	layer: "always",
	permission: "companies.update",
	confirmation: "twoStep",
	description:
		"Link a person (lead or contact) to a company by code. Idempotent — safe to call twice.",
	instruction: {
		whenToCall:
			"User asks to add / attach / link a person to a company ('Add Sara to Acme Corp', 'Sara works at Acme', 'Move P-014 under Acme').",
		whenNotToCall:
			"the user wants to CHANGE the contact's primary employer (different — that's contacts.update with companyId) OR remove someone (use remove_person_from_company).",
		preflight: ["search_crm"],
		requiredClarifications: ["companyCode", "personCode"],
		synonyms: ["add to company", "link to company", "attach person", "associate"],
		goodExample: {
			description: "User: 'Add Sara (P-014) to Acme Corp (C-003).'",
			args: { companyCode: "C-003", personCode: "P-014" },
		},
		badExample: {
			description: "User: 'Add Sara to Acme.'",
			args: { companyCode: "Acme", personCode: "Sara" },
			whyBad: "Both must be canonical codes (P-XXX, C-XXX). Resolve via search_crm first.",
		},
	},
	runbook: {
		onSuccess:
			"Reply with one short sentence ('Sara is now linked to Acme.'). If alreadyMember: true, mention it ('Sara was already a member of Acme.').",
		onValidationError:
			"If the companyCode doesn't resolve, call search_crm first. Don't retry blindly.",
		onPermissionDenied: "Tell the user they need companies.update permission.",
	},
	schema,
	execute: async (args) => {
		return runTool(async () => {
			const tc = getCompaniesCtx();
			requirePermission(tc.permissions, "companies.update");

			// Resolve the company so the propose card can show the name.
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

			return propose("add_person_to_company", args, {
				title: `Link ${args.personCode} to ${impact.displayName}`,
				fields: [
					{ label: "Company", value: `${impact.canonicalCode} (${impact.displayName})` },
					{ label: "Person", value: args.personCode },
					{ label: "Idempotent", value: "Yes — safe to retry" },
				],
			});
		});
	},
});

registerTool({
	name: "commit_add_person_to_company",
	layer: "always",
	permission: "companies.update",
	confirmation: "none",
	description:
		"Internal: commit a pre-approved add_person_to_company call. Do not call without prior add_person_to_company approval.",
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

			const result = (await toolMutation(tc, "crm/entities/companies/mutations:addPerson", {
				orgId: tc.orgId,
				companyId: impact.entityId,
				personCode: args.personCode,
			})) as { alreadyMember: boolean; companyName: string; companyCode: string };

			return {
				ok: true as const,
				data: result,
				display: {
					kind: "entity" as const,
					entityType: "company" as const,
					entityId: impact.entityId,
				},
				summary: {
					headline: result.alreadyMember
						? `${args.personCode} was already linked to ${result.companyCode}`
						: `Linked ${args.personCode} to ${result.companyCode}`,
					table: [
						{
							label: "Company",
							value: `${result.companyCode} (${result.companyName})`,
						},
						{ label: "Person", value: args.personCode },
						{
							label: "Status",
							value: result.alreadyMember ? "Already linked (no-op)" : "Linked",
						},
					],
					suggestedNext: [
						{
							label: "Add a note to the company",
							intent: `Add a note to ${result.companyCode}`,
						},
						{
							label: "Schedule a follow-up",
							intent: `Schedule a follow-up with ${args.personCode} for next week`,
						},
					],
				},
			};
		}),
});

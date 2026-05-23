/**
 * convex/ai/tools/updateEntity.ts
 *
 * Universal update tool (always-on, two-step):
 *   update_entity — patch any entity field by code
 *   commit_update_entity — apply after user approval
 */
import { z } from "zod";
import { registerTool } from "../toolRegistry";
import {
	propose,
	requirePermission,
	runTool,
	type ToolContext,
	toolMutation,
	toolQuery,
} from "./_shared";

let _toolCtx: ToolContext | null = null;
export function setUpdateEntityContext(ctx: ToolContext): void {
	_toolCtx = ctx;
}
function getCtx(): ToolContext {
	if (!_toolCtx) throw new Error("Tool context not initialized");
	return _toolCtx;
}

const ENTITY_UPDATE_PERM: Record<string, string> = {
	lead: "leads.update",
	contact: "contacts.update",
	deal: "deals.update",
	company: "companies.update",
};

const ENTITY_UPDATE_MUTATION: Record<string, string> = {
	lead: "crm/entities/leads/mutations:update",
	contact: "crm/entities/contacts/mutations:update",
	deal: "crm/entities/deals/mutations:update",
	company: "crm/entities/companies/mutations:update",
};

const ENTITY_GET_BY_CODE: Record<string, string> = {
	lead: "crm/entities/leads/queries:getByPersonCode",
	contact: "crm/entities/contacts/queries:getByPersonCode",
	deal: "crm/entities/deals/queries:getByDealCode",
	company: "crm/entities/companies/queries:getByCompanyCode",
};

const ENTITY_CODE_ARG: Record<string, string> = {
	lead: "personCode",
	contact: "personCode",
	deal: "dealCode",
	company: "companyCode",
};

registerTool({
	name: "update_entity",
	layer: "always",
	permission: null, // checked per entityType inside execute
	confirmation: "twoStep",
	description: `
Update fields on a lead, contact, deal, or company.
Provide the entity code (P-001, D-042, C-007) and a patch object with the fields to change.
Shows a diff preview and asks for confirmation before writing.
DO NOT update deal stage with this tool — use move_deal_stage from the pipelines layer instead.
  `.trim(),
	runbook: {
		onSuccess:
			"The diff card already shows what changed — keep your prose to one short sentence. Don't repeat the field-by-field diff in text.",
		onValidationError:
			'If the patch contains stage fields, suggest expand_tools("pipelines") and use move_deal_stage instead. Otherwise call ask_user_input for the missing/invalid fields.',
		onPermissionDenied:
			"Tell the user they need <entity>.update permission. Suggest contacting an admin.",
	},
	schema: z.object({
		entityType: z.enum(["lead", "contact", "deal", "company"]),
		code: z
			.string()
			.describe("Entity code: personCode (P-XXX), dealCode (D-XXX), or companyCode (C-XXX)."),
		patch: z
			.record(z.string(), z.unknown())
			.describe("Fields to update. Keys are field names; values are new values."),
	}),
	execute: async ({ entityType, code, patch }) => {
		const { permissions } = getCtx();
		requirePermission(permissions, ENTITY_UPDATE_PERM[entityType] ?? "leads.update");
		return propose(
			"update_entity",
			{ entityType, code, patch },
			{
				title: `Update ${entityType}: ${code}`,
				fields: Object.entries(patch).map(([k, v]) => ({ label: k, value: String(v) })),
			},
		);
	},
});

registerTool({
	name: "commit_update_entity",
	layer: "always",
	permission: null,
	confirmation: "none",
	description: "Internal: commit a pre-approved entity update.",
	schema: z.object({
		entityType: z.enum(["lead", "contact", "deal", "company"]),
		code: z.string(),
		patch: z.record(z.string(), z.unknown()),
	}),
	execute: async ({ entityType, code, patch }) => {
		return runTool(async () => {
			const { ctx, orgId, permissions } = getCtx();
			requirePermission(permissions, ENTITY_UPDATE_PERM[entityType] ?? "leads.update");
			const mutation = ENTITY_UPDATE_MUTATION[entityType];
			if (!mutation)
				return { ok: false as const, error: `Unknown entity type: ${entityType}` };

			// Sprint 3 doctrine: capture the BEFORE snapshot so the chat
			// can render a `kind: "diff"` card showing what changed.
			// We pull a fresh row from the entity's getByCode query —
			// running this AFTER the mutation would just re-fetch the
			// new state, missing the contrast.
			const lookupQuery = ENTITY_GET_BY_CODE[entityType];
			const codeArg = ENTITY_CODE_ARG[entityType];
			const before =
				lookupQuery && codeArg
					? ((await toolQuery(getCtx(), lookupQuery, {
							orgId,
							[codeArg]: code,
						}).catch(() => null)) as Record<string, unknown> | null)
					: null;

			const result = await toolMutation(getCtx(), mutation, { orgId, code, ...patch });

			// Build the after-snapshot from before + patch keys. We
			// deliberately don't re-fetch — fewer DB round-trips, and
			// the patch's keys ARE the diff so any extra unchanged
			// fields (computed by the mutation) wouldn't be visible
			// in the diff card anyway.
			const after: Record<string, unknown> = before ? { ...before } : {};
			for (const [k, v] of Object.entries(patch)) {
				after[k] = v;
			}

			const entityId = (before as { _id?: string } | null)?._id;

			const display =
				before && entityId
					? {
							kind: "diff" as const,
							entityType,
							entityId,
							before,
							after,
						}
					: undefined;

			return {
				ok: true as const,
				data: result,
				...(display ? { display } : { display: `✅ ${entityType} ${code} updated.` }),
			};
		});
	},
});

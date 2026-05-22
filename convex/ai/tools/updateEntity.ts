/**
 * convex/ai/tools/updateEntity.ts
 *
 * Universal update tool (always-on, two-step):
 *   update_entity — patch any entity field by code
 *   commit_update_entity — apply after user approval
 */
import { z } from "zod";
import { registerTool } from "../toolRegistry";
import { propose, requirePermission, runTool, type ToolContext, toolMutation } from "./_shared";

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
			const result = await toolMutation(ctx, mutation, { orgId, code, ...patch });
			return {
				ok: true as const,
				data: result,
				display: `✅ ${entityType} ${code} updated.`,
			};
		});
	},
});

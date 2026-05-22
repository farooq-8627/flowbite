/**
 * convex/ai/tools/search.ts
 *
 * Always-on read tools:
 *   search_crm            — full-text search across entities
 *   get_entity_detail     — get one record by code/id
 *   get_dashboard_summary — stats overview for the org
 */
import { z } from "zod";
import { registerTool } from "../toolRegistry";
import { requirePermission, runTool, type ToolContext, toolQuery } from "./_shared";

let _toolCtx: ToolContext | null = null;
export function setSearchToolContext(ctx: ToolContext): void {
	_toolCtx = ctx;
}
function getCtx(): ToolContext {
	if (!_toolCtx) throw new Error("Tool context not initialized");
	return _toolCtx;
}

registerTool({
	name: "search_crm",
	layer: "always",
	permission: null,
	confirmation: "none",
	description: `
Search across CRM records (leads, contacts, deals, companies).
Always search before creating to avoid duplicates.
Returns up to 10 matching records with key fields.
  `.trim(),
	schema: z.object({
		query: z.string().describe("Search term — name, email, company, deal title, etc."),
		entityType: z.enum(["lead", "contact", "deal", "company", "all"]).default("all"),
		limit: z.number().min(1).max(20).default(10),
	}),
	execute: async ({ query, entityType, limit }) => {
		return runTool(async () => {
			const { ctx, orgId, permissions } = getCtx();
			const results: Record<string, unknown[]> = {};
			const q = query.toLowerCase().trim();

			if (
				(entityType === "lead" || entityType === "all") &&
				permissions.includes("leads.view")
			) {
				const r = await toolQuery(ctx, "crm/entities/leads/queries:searchLeads", {
					orgId,
					query: q,
					limit,
				}).catch(() => []);
				results.leads = r as unknown[];
			}
			if (
				(entityType === "contact" || entityType === "all") &&
				permissions.includes("contacts.view")
			) {
				const r = await toolQuery(ctx, "crm/entities/contacts/queries:searchContacts", {
					orgId,
					query: q,
					limit,
				}).catch(() => []);
				results.contacts = r as unknown[];
			}
			if (
				(entityType === "deal" || entityType === "all") &&
				permissions.includes("deals.view")
			) {
				const r = await toolQuery(ctx, "crm/entities/deals/queries:searchDeals", {
					orgId,
					query: q,
					limit,
				}).catch(() => []);
				results.deals = r as unknown[];
			}
			if (
				(entityType === "company" || entityType === "all") &&
				permissions.includes("companies.view")
			) {
				const r = await toolQuery(ctx, "crm/entities/companies/queries:searchCompanies", {
					orgId,
					query: q,
					limit,
				}).catch(() => []);
				results.companies = r as unknown[];
			}

			const total = Object.values(results).reduce((s, a) => s + a.length, 0);
			return { ok: true as const, data: { ...results, total, query } };
		});
	},
});

registerTool({
	name: "get_entity_detail",
	layer: "always",
	permission: null,
	confirmation: "none",
	description: `
Get full details for a specific CRM record by code (P-001, D-042, C-007).
Returns all fields, recent notes, linked records, and AI context summary.
  `.trim(),
	schema: z.object({
		entityType: z.enum(["lead", "contact", "deal", "company"]),
		code: z
			.string()
			.describe("Entity code: personCode (P-XXX), dealCode (D-XXX), or companyCode (C-XXX)."),
	}),
	execute: async ({ entityType, code }) => {
		return runTool(async () => {
			const { ctx, orgId, permissions } = getCtx();
			const permMap: Record<string, string> = {
				lead: "leads.view",
				contact: "contacts.view",
				deal: "deals.view",
				company: "companies.view",
			};
			requirePermission(permissions, permMap[entityType] ?? "leads.view");

			let record: unknown = null;
			if (entityType === "lead" || entityType === "contact") {
				record = await toolQuery(ctx, "crm/people/queries:getByPersonCode", {
					orgId,
					personCode: code,
				}).catch(() => null);
			} else if (entityType === "deal") {
				record = await toolQuery(ctx, "crm/entities/deals/queries:getByCode", {
					orgId,
					dealCode: code,
				}).catch(() => null);
			} else if (entityType === "company") {
				record = await toolQuery(ctx, "crm/entities/companies/queries:getByCode", {
					orgId,
					code,
				}).catch(() => null);
			}

			if (!record)
				return { ok: false as const, error: `No ${entityType} found with code ${code}.` };
			return { ok: true as const, data: record };
		});
	},
});

registerTool({
	name: "get_dashboard_summary",
	layer: "always",
	permission: "ai.use",
	confirmation: "none",
	description: `
Get a summary of the workspace: lead counts, open deals, pipeline value, reminders due today.
Use this to answer "how are we doing?" or "what should I focus on today?"
  `.trim(),
	schema: z.object({}),
	execute: async () => {
		return runTool(async () => {
			const { ctx, orgId } = getCtx();
			const stats = await toolQuery(ctx, "orgs/queries:getDashboardStats", { orgId });
			return { ok: true as const, data: stats };
		});
	},
});

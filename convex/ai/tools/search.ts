/**
 * convex/ai/tools/search.ts
 *
 * Always-on read tools:
 *   search_crm            — full-text search across entities
 *   get_entity_detail     — get one record by code/id
 *   get_dashboard_summary — stats overview for the org
 */
import { z } from "zod";
import { entityTypeEnum } from "../../_shared/synonyms";
import { registerTool } from "../toolRegistry";
import { coerceInt, requirePermission, runTool, type ToolContext, toolQuery } from "./_shared";

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
	description:
		"Full-text search across leads, contacts, deals, and companies. Always run before creating to avoid duplicates.",
	instruction: {
		whenToCall:
			"PRE-FLIGHT for every create_* tool. Also use whenever the user mentions a person/company by NAME (not by code) — resolve to a personCode/companyCode before calling any code-keyed tool.",
		whenNotToCall:
			"the user just gave a code (P-001 / D-001 / C-001) — call get_entity_detail instead.",
		requiredClarifications: ["query"],
		synonyms: ["find", "look up", "search", "is X in the CRM"],
		goodExample: {
			description: "User: 'Do we have Sarah Khan?'",
			args: { query: "Sarah Khan", entityType: "all", limit: 10 },
		},
		badExample: {
			description: "User: 'Show me P-001.'",
			args: { query: "P-001", entityType: "all" },
			whyBad: "That's a code lookup, not a search. Use get_entity_detail for codes.",
		},
	},
	runbook: {
		onSuccess:
			"Render the result list (already a live entity-list card). If exactly one match: confirm in one short sentence. If 2-8 matches and the next action depends on knowing which: call ask_user_choice.",
		onEmpty:
			"Tell the user nothing matched and offer to broaden the search (try a partial name, or remove the entity-type filter).",
		onValidationError:
			"Re-issue the call with a stricter, shorter query string. Do not retry with the same arguments.",
	},
	schema: z.object({
		query: z.string().describe("Search term — name, email, company, deal title, etc."),
		// Day 2 T1.4 — synonym preprocess: "leads"→"lead", etc. "all" stays
		// canonical. Implemented inline because `entityTypeEnum()` doesn't
		// include "all".
		entityType: z
			.preprocess(
				(v) => {
					if (typeof v !== "string") return v;
					const k = v.trim().toLowerCase();
					if (k === "all" || k === "*" || k === "any") return "all";
					const map: Record<string, string> = {
						leads: "lead",
						contacts: "contact",
						deals: "deal",
						opportunities: "deal",
						companies: "company",
						accounts: "company",
					};
					return map[k] ?? k;
				},
				z.enum(["lead", "contact", "deal", "company", "all"]),
			)
			.default("all"),
		// Smaller open models (NVIDIA NIM Llama-3.3, OpenRouter free Llama,
		// Mistral Small) routinely emit `limit: "100"` (string instead of
		// number) AND ignore the documented max. `coerceInt` converts
		// strings → numbers before validation; `.catch(...)` clamps any
		// out-of-range / NaN value to the design max instead of failing
		// the whole tool call. Production logs 2026-05-24 show this
		// firing every search on Llama-class models.
		limit: coerceInt((n) => n.min(1).max(20).default(10).catch(20)),
	}),
	execute: async ({ query, entityType, limit }) => {
		return runTool(async () => {
			const { orgId, permissions } = getCtx();
			const results: Record<string, unknown[]> = {};
			const q = query.toLowerCase().trim();

			if (
				(entityType === "lead" || entityType === "all") &&
				permissions.includes("leads.view")
			) {
				const r = await toolQuery(getCtx(), "crm/entities/leads/queries:searchLeads", {
					orgId,
					query: q,
					limit,
					excludeFromAI: false, // hide rows opted out of AI exposure
				}).catch(() => []);
				results.leads = r as unknown[];
			}
			if (
				(entityType === "contact" || entityType === "all") &&
				permissions.includes("contacts.view")
			) {
				const r = await toolQuery(
					getCtx(),
					"crm/entities/contacts/queries:searchContacts",
					{
						orgId,
						query: q,
						limit,
						excludeFromAI: false,
					},
				).catch(() => []);
				results.contacts = r as unknown[];
			}
			if (
				(entityType === "deal" || entityType === "all") &&
				permissions.includes("deals.view")
			) {
				const r = await toolQuery(getCtx(), "crm/entities/deals/queries:searchDeals", {
					orgId,
					query: q,
					limit,
					excludeFromAI: false,
				}).catch(() => []);
				results.deals = r as unknown[];
			}
			if (
				(entityType === "company" || entityType === "all") &&
				permissions.includes("companies.view")
			) {
				const r = await toolQuery(
					getCtx(),
					"crm/entities/companies/queries:searchCompanies",
					{
						orgId,
						query: q,
						limit,
						excludeFromAI: false,
					},
				).catch(() => []);
				results.companies = r as unknown[];
			}

			const total = Object.values(results).reduce((s, a) => s + a.length, 0);

			// Sprint 3 doctrine: when the search was scoped to one entity
			// type, surface the matches as a live <EntityListResultCard>
			// stack. The user gets click-to-navigate cards instead of an
			// AI-paraphrased prose list. When the search was multi-type
			// ("all"), we leave `display` unset so the AI's prose answer
			// takes over — the renderer can't dispatch on multiple types
			// at once and a multi-type custom card hasn't been registered
			// yet.
			let display:
				| {
						kind: "entityList";
						entityType: "lead" | "contact" | "deal" | "company";
						entityIds: string[];
				  }
				| undefined;
			if (entityType !== "all") {
				const bucket =
					entityType === "lead"
						? results.leads
						: entityType === "contact"
							? results.contacts
							: entityType === "deal"
								? results.deals
								: results.companies;
				if (bucket && bucket.length > 0) {
					display = {
						kind: "entityList" as const,
						entityType,
						entityIds: (bucket as Array<{ _id: string }>).map((r) => r._id),
					};
				}
			}

			return {
				ok: true as const,
				data: { ...results, total, query },
				...(display ? { display } : {}),
			};
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
	runbook: {
		onSuccess:
			"The entity card renders below — keep your prose short, just summarise the most relevant 1-2 facts. Don't restate every field.",
		onEmpty:
			"Tell the user no record was found for that code. Offer to search by name via search_crm.",
		onPermissionDenied:
			"Tell the user they need <entity>.view permission. Suggest contacting an admin.",
	},
	schema: z.object({
		entityType: entityTypeEnum(),
		code: z
			.string()
			.describe("Entity code: personCode (P-XXX), dealCode (D-XXX), or companyCode (C-XXX)."),
	}),
	execute: async ({ entityType, code }) => {
		return runTool(async () => {
			const { orgId, permissions } = getCtx();
			const permMap: Record<string, string> = {
				lead: "leads.view",
				contact: "contacts.view",
				deal: "deals.view",
				company: "companies.view",
			};
			requirePermission(permissions, permMap[entityType] ?? "leads.view");

			let record: { excludeFromAI?: boolean } | null = null;
			if (entityType === "lead" || entityType === "contact") {
				record = (await toolQuery(getCtx(), "crm/people/queries:getByPersonCode", {
					orgId,
					personCode: code,
				}).catch(() => null)) as { excludeFromAI?: boolean } | null;
			} else if (entityType === "deal") {
				record = (await toolQuery(getCtx(), "crm/entities/deals/queries:getByDealCode", {
					orgId,
					dealCode: code,
				}).catch(() => null)) as { excludeFromAI?: boolean } | null;
			} else if (entityType === "company") {
				record = (await toolQuery(
					getCtx(),
					"crm/entities/companies/queries:getByCompanyCode",
					{
						orgId,
						companyCode: code,
					},
				).catch(() => null)) as { excludeFromAI?: boolean } | null;
			}

			if (!record)
				return { ok: false as const, error: `No ${entityType} found with code ${code}.` };

			// Respect the user's "exclude this record from AI" opt-out. The
			// human-facing detail page still shows the record (different
			// codepath); the AI must not.
			if (record.excludeFromAI === true) {
				return {
					ok: false as const,
					error: `This ${entityType} is excluded from AI assistance. Ask the user to toggle "Include in AI" on the record if they want help with it.`,
				};
			}

			// Sprint 3 doctrine: surface the record as a live entity card
			// instead of letting the AI re-paraphrase its fields in prose.
			// `_id` always exists because every Convex doc has one.
			const recordId = (record as { _id?: string })._id;
			const display = recordId
				? {
						kind: "entity" as const,
						entityType,
						entityId: recordId,
					}
				: undefined;

			return {
				ok: true as const,
				data: record,
				...(display ? { display } : {}),
			};
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
	runbook: {
		onSuccess:
			"Pick the 2-3 most actionable numbers. Highlight overdue items and high-value open deals first. Don't dump every stat.",
		suggestNext: "search_crm",
	},
	schema: z.object({}),
	execute: async () => {
		return runTool(async () => {
			const { orgId } = getCtx();
			const stats = await toolQuery(getCtx(), "orgs/queries:getDashboardStats", { orgId });
			return { ok: true as const, data: stats };
		});
	},
});

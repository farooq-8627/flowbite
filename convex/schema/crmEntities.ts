/**
 * Schema — CRM entities domain.
 *
 * Tables: leads, contacts, companies, deals.
 *
 * The 4 canonical CRM person/account types. Every record carries a
 * personCode (people) or companyCode/dealCode auto-generated on create.
 */

import { defineTable } from "convex/server";
import { v } from "convex/values";
import { aiContextValidator, orgScoped, softDelete, timestamps } from "../_shared/validators";

export const leads = defineTable({
	...orgScoped,
	personCode: v.string(), // "P-001" — generated on create, never regenerated
	displayName: v.string(),
	email: v.optional(v.string()),
	phone: v.optional(v.string()),
	normalizedPhone: v.optional(v.string()),
	status: v.string(),
	source: v.string(),
	assignedTo: v.optional(v.id("users")),
	convertedAt: v.optional(v.number()),
	contactId: v.optional(v.id("contacts")),
	companyId: v.optional(v.id("companies")),
	aiContext: aiContextValidator,
	...timestamps,
	...softDelete,
})
	.index("by_org", ["orgId"])
	.index("by_org_and_status", ["orgId", "status"])
	.index("by_org_and_assignee", ["orgId", "assignedTo"])
	.index("by_org_and_personCode", ["orgId", "personCode"])
	.index("by_org_and_email", ["orgId", "email"])
	.index("by_org_and_normalizedPhone", ["orgId", "normalizedPhone"])
	.searchIndex("search_leads_displayName", {
		searchField: "displayName",
		filterFields: ["orgId"],
	});

export const contacts = defineTable({
	...orgScoped,
	personCode: v.string(),
	displayName: v.string(),
	email: v.optional(v.string()),
	phone: v.optional(v.string()),
	normalizedPhone: v.optional(v.string()),
	leadId: v.optional(v.id("leads")),
	companyId: v.optional(v.id("companies")),
	companyCode: v.optional(v.string()),
	assignedTo: v.optional(v.id("users")),
	aiContext: aiContextValidator,
	...timestamps,
	...softDelete,
})
	.index("by_org", ["orgId"])
	.index("by_org_and_personCode", ["orgId", "personCode"])
	.index("by_org_and_company", ["orgId", "companyId"])
	.index("by_org_and_assignee", ["orgId", "assignedTo"])
	.index("by_org_and_email", ["orgId", "email"])
	.index("by_org_and_normalizedPhone", ["orgId", "normalizedPhone"])
	.searchIndex("search_contacts_displayName", {
		searchField: "displayName",
		filterFields: ["orgId"],
	});

/**
 * B2B company entity. companyCode auto-generated (CO-001).
 *
 * People belong to a company via `companies.personCodes[]` — a single source
 * of truth that works for both leads and contacts (both share a personCode).
 * Multi-assignee team via `assignees[]`; `assignedTo` is the primary
 * assignee for notification routing.
 */
export const companies = defineTable({
	...orgScoped,
	companyCode: v.string(),
	name: v.string(),
	industry: v.optional(v.string()),
	website: v.optional(v.string()),
	size: v.optional(v.string()),
	assignedTo: v.optional(v.id("users")),
	assignees: v.optional(v.array(v.id("users"))),
	personCodes: v.optional(v.array(v.string())),
	aiContext: aiContextValidator,
	...timestamps,
	...softDelete,
})
	.index("by_org", ["orgId"])
	.index("by_org_and_companyCode", ["orgId", "companyCode"])
	.index("by_org_and_assignee", ["orgId", "assignedTo"])
	.searchIndex("search_companies_name", {
		searchField: "name",
		filterFields: ["orgId"],
	});

export const deals = defineTable({
	...orgScoped,
	dealCode: v.string(),
	personCode: v.optional(v.string()),
	companyCode: v.optional(v.string()),
	title: v.string(),
	value: v.optional(v.number()),
	currency: v.optional(v.string()),
	pipelineId: v.id("pipelines"),
	currentStageId: v.string(),
	stageEnteredAt: v.number(),
	contactId: v.optional(v.id("contacts")),
	companyId: v.optional(v.id("companies")),
	assignedTo: v.optional(v.id("users")),
	source: v.string(),
	wonAt: v.optional(v.number()),
	lostAt: v.optional(v.number()),
	outcomeReason: v.optional(v.string()),
	expectedCloseDate: v.optional(v.number()),
	aiContext: aiContextValidator,
	...timestamps,
	...softDelete,
})
	.index("by_org", ["orgId"])
	.index("by_org_and_pipeline", ["orgId", "pipelineId"])
	.index("by_org_and_stage", ["orgId", "currentStageId"])
	.index("by_org_and_personCode", ["orgId", "personCode"])
	.index("by_org_and_dealCode", ["orgId", "dealCode"])
	.index("by_org_and_assignee", ["orgId", "assignedTo"])
	.searchIndex("search_deals_title", {
		searchField: "title",
		filterFields: ["orgId"],
	});

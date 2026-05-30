/**
 * Generic / fallback industry template.
 *
 * Purpose
 * ───────
 * Every industry id from the onboarding picker MUST have a registry entry —
 * otherwise the seeder throws TEMPLATE_NOT_FOUND on signup. This template is
 * the safe default for industries we haven't curated yet (Finance, Retail,
 * Healthcare, Construction, Hospitality, Other, …).
 *
 * It seeds:
 *   - A neutral 5-stage Sales Pipeline (New → Contacted → Proposal → Won/Lost)
 *   - The same built-in field definitions every entity has, no industry overlays
 *   - Default note categories matching the legacy 6-color seed (Yellow / Blue / …)
 *   - A small starter tag set ("Hot", "Cold", "VIP", "Follow up")
 *   - Sensible reminder + follow-up defaults
 *   - File upload allow-list (images, PDFs, documents, spreadsheets — most common)
 *   - The "Sales Generalist" AI persona overlay
 *
 * Industry-specific templates (b2b-saas, freelancer, real-estate-gulf, …)
 * override what they need; everything else falls through to these defaults.
 */
import type { IndustryTemplate } from "../../../crm/fields/templates/types";
import { genericMockData } from "../mockData/generic";

export const genericTemplate: IndustryTemplate = {
	id: "generic",
	label: "General CRM",
	description: "A balanced CRM setup for any business — customise as you grow.",
	icon: "📋",
	region: "global",

	defaults: {
		currency: "USD",
		timezone: "UTC",
		leadStaleAfterDays: 14,
		locale: "en",
	},

	codePrefixes: {
		person: "P",
		deal: "D",
		company: "C",
	},

	pipeline: {
		name: "Sales Pipeline",
		stages: [
			{ name: "New", code: "NEW", color: "#3b82f6" },
			{ name: "Contacted", code: "CONT", color: "#8b5cf6", staleAfterDays: 7 },
			{ name: "Proposal", code: "PROP", color: "#f59e0b", staleAfterDays: 5 },
			{ name: "Negotiation", code: "NEG", color: "#10b981", staleAfterDays: 7 },
			{
				name: "Won",
				code: "WON",
				color: "#22c55e",
				isFinal: true,
				finalType: "positive",
			},
			{
				name: "Lost",
				code: "LOST",
				color: "#ef4444",
				isFinal: true,
				finalType: "negative",
			},
		],
	},

	// ─── Modules slot map (default view = "board" for every visible slot,
	//     locked 2026-05-30: every fresh workspace lands on the board so
	//     drag-and-drop pipeline progression is the first interaction). ──
	modules: [
		{
			slot: "lead",
			order: 0,
			defaultView: "board",
			cardFields: ["displayName", "email", "phone", "status", "assignedTo"],
			listColumns: ["displayName", "personCode", "email", "phone", "assignedTo", "status"],
			boardGroupBy: "status",
		},
		{
			slot: "contact",
			order: 1,
			defaultView: "board",
			cardFields: ["displayName", "email", "phone", "assignedTo"],
			listColumns: ["displayName", "personCode", "email", "phone", "companyId", "assignedTo"],
			boardGroupBy: "assignedTo",
		},
		{
			slot: "deal",
			order: 2,
			defaultView: "board",
			cardFields: ["title", "value", "currentStageId", "assignedTo", "expectedCloseDate"],
			listColumns: [
				"dealCode",
				"title",
				"companyId",
				"value",
				"currentStageId",
				"assignedTo",
				"expectedCloseDate",
			],
			boardGroupBy: "currentStageId",
		},
		{
			slot: "company",
			order: 3,
			defaultView: "board",
			cardFields: ["name", "industry", "assignedTo"],
			listColumns: ["name", "companyCode", "industry", "website", "assignedTo"],
			boardGroupBy: "assignedTo",
		},
	],

	noteCategories: [
		{ name: "Urgent", bgColor: "#fecaca", isDefault: false, position: 0 },
		{ name: "Today", bgColor: "#fde68a", isDefault: true, position: 1 },
		{ name: "In Progress", bgColor: "#bae6fd", isDefault: false, position: 2 },
		{ name: "Done", bgColor: "#a7f3d0", isDefault: false, position: 3 },
		{ name: "Idea", bgColor: "#ddd6fe", isDefault: false, position: 4 },
	],

	tags: [
		{ name: "Hot", color: "#ef4444" },
		{ name: "Warm", color: "#f59e0b" },
		{ name: "Cold", color: "#3b82f6" },
		{ name: "VIP", color: "#a855f7" },
		{ name: "Follow up", color: "#10b981" },
	],

	briefingDefaults: {
		morningBriefingEnabled: false,
		morningBriefingTime: "08:30",
	},

	taskDefaults: {
		defaultDueOffsetDays: 3,
		defaultPriority: "normal",
		notifyAssignee: true,
		requireDealCode: false,
		reminderBeforeHours: 1,
	},

	fileUpload: {
		allowedMimeCategories: ["image", "pdf", "document", "spreadsheet"],
		maxSizeMb: 25,
	},

	dashboardMetrics: [
		"ai.morningBriefing",
		"ai.pulseRibbon",
		"ai.quickComposer",
		"leads.open",
		"contacts.active",
		"deals.open",
		"deals.pipelineValue",
		"tasks.list",
		"deals.pipeline",
		"today.focus",
		"messages.recent",
		"activity.recent",
		"pipeline.salesPanel",
	],

	aiPersona:
		"You are a CRM assistant. Help the user track leads, qualify them into contacts, and progress deals through the pipeline. Use the org's defined entity labels, custom fields, and pipeline stages — never invent new ones. Always confirm before destructive actions.",

	// ─── Mock data (Phase 3A — deletable sample records) ──────────────
	// Lives in ../mockData/generic.ts so this file stays focused on
	// the structural template (pipelines, fields, modules, etc.).
	mockData: genericMockData,
};

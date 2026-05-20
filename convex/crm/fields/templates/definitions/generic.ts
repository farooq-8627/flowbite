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
import type { IndustryTemplate } from "../types";

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
		followup: "FU",
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

	noteCategories: [
		{ name: "Yellow", bgColor: "#fde68a", isDefault: true },
		{ name: "Blue", bgColor: "#bae6fd" },
		{ name: "Green", bgColor: "#a7f3d0" },
		{ name: "Pink", bgColor: "#fbcfe8" },
		{ name: "Purple", bgColor: "#ddd6fe" },
		{ name: "Gray", bgColor: "#e2e8f0" },
	],

	tags: [
		{ name: "Hot", color: "#ef4444" },
		{ name: "Warm", color: "#f59e0b" },
		{ name: "Cold", color: "#3b82f6" },
		{ name: "VIP", color: "#a855f7" },
		{ name: "Follow up", color: "#10b981" },
	],

	reminderDefaults: {
		followUpWindowHours: 24,
		staleAlertDays: 7,
		morningBriefingEnabled: false,
		morningBriefingTime: "08:30",
	},

	followupDefaults: {
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
		"leads.open",
		"contacts.active",
		"deals.open",
		"deals.pipelineValue",
		"deals.won",
		"deals.lost",
	],

	aiPersona:
		"You are a CRM assistant. Help the user track leads, qualify them into contacts, and progress deals through the pipeline. Use the org's defined entity labels, custom fields, and pipeline stages — never invent new ones. Always confirm before destructive actions.",
};

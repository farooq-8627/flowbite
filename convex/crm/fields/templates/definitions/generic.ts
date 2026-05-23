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
		"ai.morningBriefing",
		"leads.open",
		"contacts.active",
		"deals.open",
		"deals.pipelineValue",
		"reminders.list",
		"deals.pipeline",
		"today.focus",
		"messages.recent",
		"activity.recent",
	],

	aiPersona:
		"You are a CRM assistant. Help the user track leads, qualify them into contacts, and progress deals through the pipeline. Use the org's defined entity labels, custom fields, and pipeline stages — never invent new ones. Always confirm before destructive actions.",

	// ─── Mock data (Phase 3A — minimal, generic feel) ────────────────────
	mockData: {
		companies: [
			{
				key: "sample-co",
				name: "Sample Co.",
				industry: "Professional Services",
				website: "https://sampleco.example.com",
			},
		],
		leads: [
			{
				displayName: "Alex Park",
				email: "alex.p@example.com",
				phone: "+1 555 010 0001",
				status: "new",
				tags: ["Hot", "Follow up"],
			},
			{
				displayName: "Jamie Carter",
				email: "jamie.c@example.com",
				phone: "+1 555 010 0003",
				status: "contacted",
				tags: ["Warm"],
			},
		],
		contacts: [
			{
				displayName: "Sam Lee",
				email: "sam.lee@example.com",
				phone: "+1 555 010 0002",
				companyKey: "sample-co",
				tags: ["VIP"],
			},
			{
				displayName: "Jordan Rivera",
				email: "jordan.r@example.com",
				phone: "+1 555 010 0004",
				tags: ["Follow up"],
			},
		],
		deals: [
			{
				title: "Sample Co. — Q3 contract",
				stageCode: "PROP",
				value: 8500,
				contactDisplayName: "Sam Lee",
				companyKey: "sample-co",
				tags: ["Hot"],
			},
			{
				title: "Jordan — initial outreach",
				stageCode: "CONT",
				value: 3000,
				contactDisplayName: "Jordan Rivera",
				tags: ["Warm"],
			},
		],
		notes: [
			{
				content:
					"Welcome! This is sample data — explore the CRM then clear it from Settings → Workspace → Template when you're ready.",
				categoryName: "Today",
			},
			{
				content:
					"Sam Lee at Sample Co. is expecting a revised proposal by Friday. Adjust the deal value and move to Negotiation when sent.",
				categoryName: "In Progress",
				anchorTo: { kind: "deal", title: "Sample Co. — Q3 contract" },
			},
			{
				content: "Idea: set up a saved view for all open deals closing this month.",
				categoryName: "Idea",
			},
		],
		reminders: [
			{
				title: "Send revised proposal to Sam Lee",
				dueOffsetDays: 2,
				priority: "high",
				source: "manual",
				anchorTo: { kind: "deal", title: "Sample Co. — Q3 contract" },
			},
			{
				title: "Follow up with Jamie Carter",
				dueOffsetDays: 1,
				priority: "normal",
				source: "followup",
				anchorTo: { kind: "lead", displayName: "Jamie Carter" },
			},
			{
				title: "Clear sample data once explored — Settings → Workspace",
				dueOffsetDays: 0,
				priority: "normal",
				source: "manual",
			},
		],
	},
};

/**
 * Freelancer / Solo industry template — Phase 3A full rebuild.
 *
 * Replaces the 60-line shim with a complete lean solo template per
 * `CODE-ARCHITECTURE-PHASE-3A.md` §5.3. Two distinct templates going
 * forward:
 *   - `freelancer` (this file): solo operator, Companies hidden, 5-stage
 *     project lifecycle, no retainer/milestone fields.
 *   - `agency-freelance` (sibling file): full agency setup with retainer
 *     + milestone + multi-role.
 *
 * Research finding (PHASE-3-PLAN.md §3.3): freelancers' #1 complaint about
 * existing CRMs is feature bloat. The agency template (450 lines, 8 stages,
 * retainer/milestone/deposit) is right for agencies but wrong for solo
 * operators. This template is intentionally lean.
 *
 * Pipeline:
 *   Inquiry → Quote Sent → In Progress → Invoiced → Paid (positive-final) | Lost
 *
 * Entity renames:
 *   Lead    → Inquiry
 *   Contact → Client
 *   Deal    → Project
 *   Company → hidden (`entityVisibility.company: false`)
 */
import type { IndustryTemplate } from "../../../crm/fields/templates/types";

export const freelancerTemplate: IndustryTemplate = {
	id: "freelancer",
	label: "Freelancer / Solo",
	description:
		"Solo project workflow — inquiry, quote, deliver, invoice, paid. No retainer/milestone bloat.",
	icon: "🧑‍💻",
	region: "global",

	defaults: {
		leadStaleAfterDays: 7,
		locale: "en",
	},

	entityLabels: {
		lead: { singular: "Inquiry", plural: "Inquiries", slug: "inquiries" },
		contact: { singular: "Client", plural: "Clients", slug: "clients" },
		deal: { singular: "Project", plural: "Projects", slug: "projects" },
		company: { singular: "Company", plural: "Companies", slug: "companies" },
	},

	// Solo operators don't track companies — hide it. The user can re-enable
	// in Settings → Modules if they grow into agency mode.
	entityVisibility: {
		lead: true,
		contact: true,
		deal: true,
		company: false,
	},

	codePrefixes: { person: "INQ", deal: "PRJ" },

	pipeline: {
		name: "Project Pipeline",
		stages: [
			{ name: "Inquiry", code: "INQ", color: "#6366f1", staleAfterDays: 5 },
			{ name: "Quote Sent", code: "QUOTE", color: "#8b5cf6", staleAfterDays: 5 },
			{ name: "In Progress", code: "WIP", color: "#f59e0b", staleAfterDays: 21 },
			{ name: "Invoiced", code: "INV", color: "#06b6d4", staleAfterDays: 14 },
			{
				name: "Paid",
				code: "PAID",
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

	fieldDefinitions: {
		lead: [
			{
				entityType: "lead",
				name: "project_type",
				label: "Project Type",
				type: "select",
				kind: "select",
				storage: "fieldValues",
				groupName: "Brief",
				options: ["Design", "Development", "Writing", "Consulting", "Other"],
			},
			{
				entityType: "lead",
				name: "deadline",
				label: "Desired Deadline",
				type: "date",
				kind: "date",
				storage: "fieldValues",
				groupName: "Brief",
			},
		],
		deal: [
			{
				entityType: "deal",
				name: "project_type",
				label: "Project Type",
				type: "select",
				kind: "select",
				storage: "fieldValues",
				groupName: "Scope",
				options: ["Design", "Development", "Writing", "Consulting", "Other"],
			},
			{
				entityType: "deal",
				name: "scope",
				label: "Scope",
				type: "text",
				kind: "text",
				storage: "fieldValues",
				groupName: "Scope",
			},
			{
				entityType: "deal",
				name: "quoted_amount",
				label: "Quoted Amount",
				type: "currency",
				kind: "currency",
				storage: "fieldValues",
				groupName: "Financial",
			},
			{
				entityType: "deal",
				name: "deadline",
				label: "Deadline",
				type: "date",
				kind: "date",
				storage: "fieldValues",
				groupName: "Scope",
			},
			{
				entityType: "deal",
				name: "hourly_rate",
				label: "Hourly Rate",
				type: "currency",
				kind: "currency",
				storage: "fieldValues",
				groupName: "Financial",
			},
			{
				entityType: "deal",
				name: "invoice_paid_date",
				label: "Invoice Paid Date",
				type: "date",
				kind: "date",
				storage: "fieldValues",
				groupName: "Financial",
				showInStages: ["PAID"],
			},
		],
	},

	modules: [
		{
			slot: "lead",
			order: 0,
			defaultView: "list",
			cardFields: ["displayName", "project_type", "deadline"],
			listColumns: [
				"displayName",
				"personCode",
				"email",
				"project_type",
				"deadline",
				"status",
			],
			boardGroupBy: "status",
		},
		{
			slot: "contact",
			order: 1,
			defaultView: "list",
			cardFields: ["displayName", "email", "phone"],
			listColumns: ["displayName", "personCode", "email", "phone"],
			boardGroupBy: "assignedTo",
		},
		{
			slot: "deal",
			order: 2,
			defaultView: "board",
			cardFields: ["title", "quoted_amount", "deadline"],
			listColumns: ["dealCode", "title", "quoted_amount", "deadline", "currentStageId"],
			boardGroupBy: "currentStageId",
		},
		// company hidden via entityVisibility above.
	],

	noteCategories: [
		{ name: "Urgent", bgColor: "#fecaca", isDefault: false, position: 0 },
		{ name: "Today", bgColor: "#fde68a", isDefault: true, position: 1 },
		{ name: "Idea", bgColor: "#ddd6fe", isDefault: false, position: 2 },
		{ name: "Done", bgColor: "#a7f3d0", isDefault: false, position: 3 },
	],

	tags: [
		{ name: "Rush", color: "#ef4444" },
		{ name: "Repeat client", color: "#22c55e" },
		{ name: "Referral", color: "#06b6d4" },
		{ name: "Late payment", color: "#f59e0b" },
	],

	briefingDefaults: {
		morningBriefingEnabled: true,
		morningBriefingTime: "09:00",
	},

	taskDefaults: {
		defaultDueOffsetDays: 3,
		defaultPriority: "normal",
		notifyAssignee: true,
		requireDealCode: false,
		reminderBeforeHours: 2,
	},

	fileUpload: {
		allowedMimeCategories: ["image", "pdf", "document", "video", "archive"],
		maxSizeMb: 50,
	},

	aiPersona:
		"You work with a solo freelancer. Keep responses short. Prioritise follow-up and invoice reminders. When a project is stuck in Invoiced for >14 days, flag it as overdue payment. Don't suggest hiring or team workflows. Refer to leads as 'inquiries', contacts as 'clients', deals as 'projects'.",

	dashboardMetrics: [
		"ai.morningBriefing",
		"ai.pulseRibbon",
		"ai.quickComposer",
		"deals.invoiced.unpaid",
		"tasks.dueToday",
		"deals.open",
		"deals.pipelineValue",
		"tasks.list",
		"today.focus",
		"messages.recent",
		"calendar.mini",
		"pipeline.salesPanel",
	],

	// ─── Dashboard layout (Stage 4 of DASHBOARD-V2-PLAN.md) ────────────────
	// Solo freelancers' #1 pain is "did I get paid?" — the layout leads
	// with the live tasks queue (deliverables) as the hero and pairs the
	// invoice-aging widget with today's focus card so unpaid invoices
	// stay one glance away. Coverage bands tightened to {2, 1} — short
	// project cycles + small operator → 2:1 is healthy, 1:1 is the
	// danger line.
	dashboardLayout: {
		hero: "tasks.list",
		panels: [
			{ id: "freelancer-aging", span: 2, widget: "invoices.aging" },
			{ id: "freelancer-today", span: 1, widget: "today.focus" },
			{ id: "freelancer-pipeline", span: 2, widget: "pipeline.salesPanel" },
			{ id: "freelancer-calendar", span: 1, widget: "calendar.mini" },
			{ id: "freelancer-messages", span: 3, widget: "messages.recent" },
		],
		forecast: {
			coverageBands: { healthy: 2, warning: 1 },
		},
	},

	customRoles: [],

	savedViews: [
		{
			entityType: "deal",
			name: "Awaiting payment",
			scope: "user",
			isPinned: true,
			filters: JSON.stringify({ stage: "INV" }),
			sortBy: "stageEnteredAt",
			sortOrder: "asc",
		},
		{
			entityType: "deal",
			name: "Active projects",
			scope: "user",
			isPinned: true,
			filters: JSON.stringify({ stage: "WIP" }),
			sortBy: "deadline",
			sortOrder: "asc",
		},
		{
			entityType: "lead",
			name: "Stale inquiries (>5d)",
			scope: "user",
			isPinned: true,
			filters: JSON.stringify({ staleAfterDays: 5 }),
			sortBy: "updatedAt",
			sortOrder: "asc",
		},
		{
			entityType: "deal",
			name: "Paid (last 30d)",
			scope: "user",
			isPinned: false,
			filters: JSON.stringify({ stage: "PAID", wonWithin: "30d" }),
			sortBy: "wonAt",
			sortOrder: "desc",
		},
	],

	mockData: {
		leads: [
			{
				displayName: "Nina Patel",
				email: "nina.p@example.com",
				phone: "+1 415 555 0100",
				status: "new",
				fieldValues: {
					project_type: "Design",
					deadline: Date.now() + 14 * 86_400_000,
				},
				tags: ["Referral"],
			},
			{
				displayName: "Lukas Weber",
				email: "lukas.w@example.com",
				status: "contacted",
				fieldValues: {
					project_type: "Development",
					deadline: Date.now() + 30 * 86_400_000,
				},
			},
		],
		contacts: [
			{
				displayName: "Aisha Bakr",
				email: "aisha@example.com",
				phone: "+1 213 555 0150",
				tags: ["Repeat client"],
			},
			{
				displayName: "Hiroshi Tanaka",
				email: "hiroshi@example.com",
			},
		],
		deals: [
			{
				title: "Logo redesign — Aisha",
				stageCode: "WIP",
				value: 1500,
				contactDisplayName: "Aisha Bakr",
				fieldValues: {
					project_type: "Design",
					scope: "Logo + brand mark variations + style guide.",
					quoted_amount: 1500,
					deadline: Date.now() + 7 * 86_400_000,
					hourly_rate: 75,
				},
				tags: ["Repeat client"],
			},
			{
				title: "Marketing site copy — Hiroshi",
				stageCode: "QUOTE",
				value: 800,
				contactDisplayName: "Hiroshi Tanaka",
				fieldValues: {
					project_type: "Writing",
					scope: "Homepage + 4 product pages.",
					quoted_amount: 800,
					deadline: Date.now() + 14 * 86_400_000,
				},
			},
		],
		notes: [
			{
				content: "Aisha approved sketches — proceed with vector + color exploration.",
				categoryName: "Today",
				anchorTo: { kind: "deal", title: "Logo redesign — Aisha" },
			},
			{
				content: "Send Hiroshi a revised quote — he wants 2 product pages added.",
				categoryName: "Urgent",
				anchorTo: { kind: "deal", title: "Marketing site copy — Hiroshi" },
			},
			{
				content:
					"Idea: package logo + brand-guide + landing-page copy as a 'starter kit' offer.",
				categoryName: "Idea",
			},
		],
		tasks: [
			{
				title: "Send logo v2 to Aisha",
				dueOffsetDays: 0,
				priority: "high",
				source: "manual",
				anchorTo: { kind: "deal", title: "Logo redesign — Aisha" },
			},
			{
				title: "Follow up on Hiroshi's revised quote",
				dueOffsetDays: 2,
				priority: "high",
				source: "followup",
				anchorTo: { kind: "deal", title: "Marketing site copy — Hiroshi" },
			},
		],
	},
};

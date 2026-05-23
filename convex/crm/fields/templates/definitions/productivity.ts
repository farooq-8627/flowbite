/**
 * Productivity / Individual industry template — Phase 3A.
 *
 * Solopreneurs, side-projects, students. Hides Leads + Companies entirely
 * via `entityVisibility`. The CRM is reframed as a task tracker:
 *   Lead    → "Idea" (hidden by default but reachable via Settings → Modules)
 *   Contact → "Person"
 *   Deal    → "Task"
 *   Company → hidden
 *
 * Pipeline: Todo → In Progress → Review → Done (positive-final) | Blocked.
 *
 * Research finding (folded in from PHASE-3-PLAN.md §3.4): 49% of small
 * businesses pay $100+/month on CRM features they never use. Productivity
 * users want task tracking + notes + reminders with a CRM-shaped wrapper —
 * lead scoring and marketing automation are actively unwanted.
 *
 * Per Q3 (2026-05-22): productivity sub-niches (Solo / Student / Side
 * project) all alias to this template id. AI persona will swap the
 * flavour text by reading the recorded `org.industry` value (e.g.
 * "productivity-student") in Phase 3B.
 *
 * Streak widget (Q9 deferred): the registry key `tasks.streak` reserves a
 * dashboard slot but Phase 3A renders a "Coming soon" placeholder. See §22.3
 * of CODE-ARCHITECTURE-PHASE-3A.md for the full Phase 4 specification.
 */
import type { IndustryTemplate } from "../types";

export const productivityTemplate: IndustryTemplate = {
	id: "productivity",
	label: "Productivity / Individual",
	description:
		"Solo task tracking with notes + reminders. No leads, no companies — just what's on your plate.",
	icon: "🎯",
	region: "global",

	defaults: {
		// Leads aren't used by productivity users — set the stale-after very
		// high so the cron never flags an "Idea" as stale.
		leadStaleAfterDays: 999,
		locale: "en",
	},

	entityLabels: {
		lead: { singular: "Idea", plural: "Ideas", slug: "ideas" },
		contact: { singular: "Person", plural: "People", slug: "people" },
		deal: { singular: "Task", plural: "Tasks", slug: "tasks" },
		company: { singular: "Group", plural: "Groups", slug: "groups" },
	},

	entityVisibility: {
		lead: false,
		contact: true,
		deal: true,
		company: false,
	},

	codePrefixes: { person: "C", deal: "T" },

	pipeline: {
		name: "Tasks",
		stages: [
			{ name: "Todo", code: "TODO", color: "#94a3b8" },
			{ name: "In Progress", code: "DOING", color: "#3b82f6", staleAfterDays: 7 },
			{ name: "Review", code: "REV", color: "#f59e0b", staleAfterDays: 3 },
			{
				name: "Done",
				code: "DONE",
				color: "#22c55e",
				isFinal: true,
				finalType: "positive",
			},
			{
				name: "Blocked",
				code: "BLK",
				color: "#ef4444",
				isFinal: true,
				finalType: "negative",
			},
		],
	},

	fieldDefinitions: {
		deal: [
			{
				entityType: "deal",
				name: "priority",
				label: "Priority",
				type: "select",
				kind: "select",
				storage: "fieldValues",
				groupName: "Task",
				options: ["Urgent", "High", "Normal", "Low"],
				required: false,
			},
			{
				entityType: "deal",
				name: "due_date",
				label: "Due Date",
				type: "date",
				kind: "date",
				storage: "fieldValues",
				groupName: "Task",
			},
			{
				entityType: "deal",
				name: "estimated_hours",
				label: "Estimated Hours",
				type: "number",
				kind: "number",
				storage: "fieldValues",
				groupName: "Task",
			},
			{
				entityType: "deal",
				name: "project",
				label: "Project / Tag",
				type: "text",
				kind: "text",
				storage: "fieldValues",
				groupName: "Task",
			},
		],
	},

	modules: [
		// Lead module is hidden via entityVisibility above; no module entry needed
		// (the seeder builds an entry from entityVisibility for hidden slots so
		// AppSidebar can read the hidden flag).
		{
			slot: "contact",
			order: 0,
			defaultView: "list",
			cardFields: ["displayName", "email"],
			listColumns: ["displayName", "personCode", "email", "phone"],
			boardGroupBy: "assignedTo",
		},
		{
			slot: "deal",
			order: 1,
			defaultView: "board",
			cardFields: ["title", "priority", "due_date", "project"],
			listColumns: [
				"dealCode",
				"title",
				"priority",
				"due_date",
				"estimated_hours",
				"currentStageId",
			],
			boardGroupBy: "currentStageId",
		},
		// company hidden via entityVisibility.
	],

	// ─── Note categories (productivity workflow) ──────────────────────────
	noteCategories: [
		{ name: "Today", bgColor: "#fde68a", isDefault: true, position: 0 },
		{ name: "This Week", bgColor: "#bae6fd", isDefault: false, position: 1 },
		{ name: "Idea", bgColor: "#ddd6fe", isDefault: false, position: 2 },
		{ name: "Reference", bgColor: "#e2e8f0", isDefault: false, position: 3 },
		{ name: "Done", bgColor: "#a7f3d0", isDefault: false, position: 4 },
	],

	tags: [
		{ name: "#work", color: "#3b82f6" },
		{ name: "#personal", color: "#22c55e" },
		{ name: "#side-project", color: "#a855f7" },
		{ name: "#waiting", color: "#f59e0b" },
	],

	reminderDefaults: {
		followUpWindowHours: 24,
		staleAlertDays: 999,
		morningBriefingEnabled: true,
		morningBriefingTime: "08:30",
	},

	followupDefaults: {
		defaultDueOffsetDays: 1,
		defaultPriority: "high",
		notifyAssignee: true,
		requireDealCode: false,
		reminderBeforeHours: 1,
	},

	fileUpload: {
		allowedMimeCategories: ["image", "pdf", "document"],
		maxSizeMb: 25,
	},

	aiPersona:
		"You are a productivity coach. Help the user prioritise tasks using the Eisenhower matrix (urgent/important). Surface what is overdue. Break big tasks into smaller ones. Refer to leads as 'ideas', contacts as 'people', deals as 'tasks'. Never suggest sales tactics, hiring, or team workflows — this user works solo. Keep responses short and action-oriented.",

	// ─── Dashboard widgets (ranked, productivity-shape) ───────────────────
	dashboardMetrics: [
		"ai.morningBriefing",
		"tasks.dueToday",
		"tasks.overdue",
		"tasks.thisWeek",
		"tasks.recentlyCompleted",
		"today.focus",
		"calendar.miniWidget",
		"calendar.weekAhead",
		"activity.recent",
		// Streak deferred to Phase 4 — registry slot reserved, renders "Coming soon" card.
		"tasks.streak",
	],

	customRoles: [],

	savedViews: [
		{
			entityType: "deal",
			name: "Due today",
			scope: "user",
			isPinned: true,
			filters: JSON.stringify({ dueWithin: "1d", excludeFinal: true }),
			sortBy: "due_date",
			sortOrder: "asc",
		},
		{
			entityType: "deal",
			name: "Overdue",
			scope: "user",
			isPinned: true,
			filters: JSON.stringify({ overdue: true, excludeFinal: true }),
			sortBy: "due_date",
			sortOrder: "asc",
		},
		{
			entityType: "deal",
			name: "This week",
			scope: "user",
			isPinned: true,
			filters: JSON.stringify({ dueWithin: "7d", excludeFinal: true }),
			sortBy: "due_date",
			sortOrder: "asc",
		},
		{
			entityType: "deal",
			name: "Done this week",
			scope: "user",
			isPinned: false,
			filters: JSON.stringify({ stage: "DONE", wonWithin: "7d" }),
			sortBy: "wonAt",
			sortOrder: "desc",
		},
	],

	// ─── Mock data (4 tasks, 2 ideas in notes — minimal on purpose) ───────
	mockData: {
		deals: [
			{
				title: "Finish quarterly report",
				stageCode: "DOING",
				fieldValues: {
					priority: "High",
					due_date: Date.now() + 2 * 86_400_000,
					estimated_hours: 4,
					project: "Q3-2026",
				},
				tags: ["#work"],
			},
			{
				title: "Reply to client emails",
				stageCode: "TODO",
				fieldValues: {
					priority: "Urgent",
					due_date: Date.now() - 1 * 86_400_000, // overdue
					estimated_hours: 1,
					project: "Inbox-zero",
				},
				tags: ["#work", "#waiting"],
			},
			{
				title: "Draft side-project landing page",
				stageCode: "REV",
				fieldValues: {
					priority: "Normal",
					due_date: Date.now() + 3 * 86_400_000,
					estimated_hours: 6,
					project: "Side-project",
				},
				tags: ["#side-project"],
			},
			{
				title: "Pick up groceries",
				stageCode: "DONE",
				fieldValues: {
					priority: "Low",
					due_date: Date.now() - 1 * 86_400_000,
					estimated_hours: 1,
					project: "Personal",
				},
				tags: ["#personal"],
			},
		],
		notes: [
			{
				content:
					"Idea: build a tiny CLI that surfaces today's overdue tasks as a daily morning email. Could ship in a weekend.",
				categoryName: "Idea",
			},
			{
				content:
					"Reference: prefer focused 90-min blocks for deep work; protect the 10am-12pm window from meetings.",
				categoryName: "Reference",
			},
		],
		reminders: [
			{
				title: "Quarterly report due — start drafting",
				dueOffsetDays: 0,
				priority: "high",
				source: "manual",
				anchorTo: { kind: "deal", title: "Finish quarterly report" },
			},
			{
				title: "Inbox zero — clear by EOD",
				dueOffsetDays: 0,
				priority: "urgent",
				source: "manual",
				anchorTo: { kind: "deal", title: "Reply to client emails" },
			},
		],
	},
};

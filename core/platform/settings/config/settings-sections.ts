/**
 * Flat section registry — the single source of truth for:
 *   1. The dynamic sub-navigation pills inside each settings group
 *   2. The full-text Fuse.js search index
 *
 * Every <SettingsSection id="x"> card on-screen must have a matching entry here.
 * Conversely, every entry here implies a rendered section with that DOM id.
 *
 * WHY A FACTORY (not a static const):
 *   Entity names are renameable per org (Lead → Inquiry, Company → Venue, …).
 *   Descriptions + keywords that mention entities must track those names so
 *   (a) the search still finds "inquiries" after a rename and
 *   (b) the labels in tooltips and search results match what's in the UI.
 *
 *   `getSettingsSections(labels)` builds the array at render-time from the
 *   current `useEntityLabels()` output. The static `SETTINGS_SECTIONS` export
 *   below is kept as the English-default fallback for non-reactive callers
 *   (and so existing imports keep compiling).
 *
 * Sources:
 *   - core/shared/hooks/useEntityLabels.ts (label shape + defaults)
 *   - SettingsView.tsx (consumer — calls `getSettingsSections(labels)`)
 */
import {
	ENTITY_LABEL_DEFAULTS,
	type EntityLabels,
} from "@/core/shell/shared/hooks/useEntityLabels";
import type { SettingsGroupId } from "./settings-nav";

export type SettingsSectionEntry = {
	/** DOM id of the rendered <SettingsSection id={id}> card */
	id: string;
	/** Which top-level settings group this section belongs to */
	groupId: SettingsGroupId;
	/** Short label used in the sub-nav rail */
	label: string;
	/** Longer description — shown in search results, fed into Fuse */
	description: string;
	/** Extra search terms that don't appear in the UI but should match */
	keywords: string[];
	/** If set, user must have this permission OR be owner to see this section */
	permission?: string;
	/** If true, only org owners can see this section */
	ownerOnly?: boolean;
};

/**
 * Build the settings-section registry using the given entity labels.
 *
 * Pass the output of `useEntityLabels()` so the list is reactive to admin
 * renames. Called without arguments → returns a catalog using English defaults
 * (fine for SSR or non-reactive callers like tests).
 */
export function getSettingsSections(
	labels: EntityLabels = ENTITY_LABEL_DEFAULTS,
): SettingsSectionEntry[] {
	const lead = labels.lead;
	const contact = labels.contact;
	const deal = labels.deal;
	const company = labels.company;

	// Everything here gets the workspace's renamed entities applied — but we
	// also seed the default English terms into keywords so muscle memory still
	// works (a user whose workspace is "Inquiry"-named can still search "lead"
	// and land on the Entity Labels editor).
	const entityKeywords = [
		lead.singular,
		lead.plural,
		lead.slug,
		contact.singular,
		contact.plural,
		contact.slug,
		deal.singular,
		deal.plural,
		deal.slug,
		company.singular,
		company.plural,
		company.slug,
		"lead",
		"leads",
		"contact",
		"contacts",
		"deal",
		"deals",
		"company",
		"companies",
	].map((s) => s.toLowerCase());

	// Sentence-ready lowercase lists (e.g. "leads, contacts, and deals").
	const pluralTriplet = `${lead.plural.toLowerCase()}, ${contact.plural.toLowerCase()}, and ${deal.plural.toLowerCase()}`;
	const pluralQuad = `${lead.plural.toLowerCase()}, ${contact.plural.toLowerCase()}, ${deal.plural.toLowerCase()}, and ${company.plural.toLowerCase()}`;

	return [
		// ── Workspace ─────────────────────────────────────────────────────────
		{
			id: "workspace.general",
			groupId: "workspace",
			label: "General",
			description:
				"Organization name, workspace URL, timezone, default currency, and industry.",
			keywords: [
				"name",
				"logo",
				"timezone",
				"currency",
				"industry",
				"url",
				"slug",
				"branding",
				"locale",
			],
		},
		{
			id: "workspace.entity-labels",
			groupId: "workspace",
			label: "Entity Labels",
			description: `Rename CRM entities (${pluralQuad}) to match your industry.`,
			keywords: [
				"rename",
				"customize",
				"singular",
				"plural",
				"label",
				"entity",
				"naming",
				...entityKeywords,
			],
		},
		{
			id: "workspace.modules",
			groupId: "workspace",
			label: "Module Visibility",
			description: `Hide or show ${pluralQuad} in the sidebar without deleting any data.`,
			keywords: [
				"hide",
				"show",
				"visibility",
				"sidebar",
				"module",
				"disable",
				"enable",
				...entityKeywords,
			],
		},
		{
			id: "workspace.record-codes",
			groupId: "workspace",
			label: "Record Codes",
			description:
				"Prefix used when generating unique codes for new records, e.g. P-001, D-042.",
			keywords: ["prefix", "code", "id", "numbering", "record id", "P-", "D-"],
		},

		// ── Modules ───────────────────────────────────────────────────────────
		{
			id: "modules.lead",
			groupId: "modules",
			label: lead.plural,
			description: `Display and custom fields for ${lead.plural.toLowerCase()}.`,
			keywords: [
				"module",
				"display",
				"default view",
				"card fields",
				"list columns",
				"custom field",
				lead.singular,
				lead.plural,
				"lead",
				"leads",
			],
		},
		{
			id: "modules.contact",
			groupId: "modules",
			label: contact.plural,
			description: `Display and custom fields for ${contact.plural.toLowerCase()}.`,
			keywords: [
				"module",
				"display",
				"default view",
				"card fields",
				"list columns",
				"custom field",
				contact.singular,
				contact.plural,
				"contact",
				"contacts",
			],
		},
		{
			id: "modules.deal",
			groupId: "modules",
			label: deal.plural,
			description: `Display and custom fields for ${deal.plural.toLowerCase()}. Pipelines are managed under the Pipelines settings group.`,
			keywords: [
				"module",
				"display",
				"default view",
				"card fields",
				"list columns",
				"custom field",
				deal.singular,
				deal.plural,
				"deal",
				"deals",
			],
		},
		{
			id: "modules.company",
			groupId: "modules",
			label: company.plural,
			description: `Display and custom fields for ${company.plural.toLowerCase()}.`,
			keywords: [
				"module",
				"display",
				"default view",
				"card fields",
				"list columns",
				"custom field",
				company.singular,
				company.plural,
				"company",
				"companies",
			],
		},

		// ── Pipelines ─────────────────────────────────────────────────────────
		{
			id: "pipelines.list",
			groupId: "pipelines",
			label: "All Pipelines",
			description: `Stage workflows for ${deal.plural.toLowerCase()}. Drag to reorder, edit codes, mark a default stage. Each pipeline ships with its own ordered list of stages.`,
			keywords: [
				"pipeline",
				"pipelines",
				"stage",
				"stages",
				"workflow",
				"kanban",
				"code",
				"default stage",
				"won",
				"lost",
				"final",
				deal.singular,
				deal.plural,
				"deal",
				"deals",
			],
			permission: "pipelines.view",
		},

		// ── Team ──────────────────────────────────────────────────────────────
		{
			id: "team.members",
			groupId: "team",
			label: "Members",
			description:
				"People who have access to this workspace. Invite, change role, or remove.",
			keywords: ["user", "teammate", "invite", "remove", "assign role", "role change"],
		},
		{
			id: "team.invitations",
			groupId: "team",
			label: "Pending Invitations",
			description: "Invitations that have been sent but not yet accepted.",
			keywords: ["email", "pending", "cancel invite", "resend", "invitation link"],
		},
		{
			id: "team.roles",
			groupId: "team",
			label: "Roles",
			description: "System and custom roles. Each role maps to a set of permissions.",
			keywords: ["permission", "owner", "admin", "member", "viewer", "rbac", "access"],
			ownerOnly: true,
		},

		// ── CRM ───────────────────────────────────────────────────────────────
		{
			id: "crm.tags",
			groupId: "crm",
			label: "Tags",
			description: `Shared tags for categorizing ${pluralTriplet}.`,
			keywords: ["label", "color", "categorize", "group", "mark", ...entityKeywords],
		},

		// ── CRM → Notes (sticky notes / tasks / timeline) ────────────────────
		// All of these were originally a top-level "Notes" group; they were
		// folded into CRM (2026-05-17) because they're cross-cutting CRM
		// concerns — there's no clean separation between "notes" and the
		// records they hang off. Each subsection is a CRMGroup tab.
		{
			id: "notes.categories",
			groupId: "crm",
			label: "Notes",
			description:
				"Coloured buckets that sticky-notes group into (Urgent, Today, Demo Scheduled, …). Used by the Notes board and per-entity panels.",
			keywords: [
				"note",
				"notes",
				"sticky",
				"category",
				"color",
				"urgent",
				"today",
				"label",
				"bucket",
				"kanban",
			],
			permission: "notes.categories.manage",
		},
		{
			id: "crm.tasks",
			groupId: "crm",
			label: "Tasks",
			description:
				"Default timing for automated reminders, morning briefings, follow-up cadence, and stale-deal alerts. Replaces the legacy Reminders + Follow-ups settings tabs.",
			keywords: [
				"task",
				"tasks",
				"follow-up",
				"followup",
				"reminder",
				"reminders",
				"cadence",
				"nudge",
				"sla",
				"briefing",
				"alert",
				"due date",
				"overdue",
				"rent",
			],
		},
		{
			id: "notes.timeline",
			groupId: "crm",
			label: "Timeline",
			description:
				"Choose which event types surface on entity and org-wide timelines. UI ships when the Timeline module lands.",
			keywords: ["timeline", "activity", "events", "feed", "audit"],
		},

		// ── AI ────────────────────────────────────────────────────────────────
		{
			id: "ai.context",
			groupId: "ai",
			label: "Business Context",
			description:
				"Business context fed into the AI assistant so it understands your workspace setup, industry, and tone.",
			keywords: [
				"prompt",
				"system prompt",
				"assistant",
				"workspace setup",
				"instructions",
				"persona",
				"tone",
				"industry",
			],
		},
		{
			id: "ai.usage",
			groupId: "ai",
			label: "AI Usage",
			description: "AI message consumption against your plan limit.",
			keywords: ["limit", "plan", "tokens", "messages", "quota", "consumption"],
		},
		{
			id: "ai.memory",
			groupId: "ai",
			label: "AI Memory",
			description:
				"What the AI has learned and remembers about your workspace and you across conversations.",
			keywords: [
				"memory",
				"facts",
				"keyfacts",
				"summary",
				"learned",
				"remember",
				"forget",
				"persona",
				"context",
			],
		},
		{
			id: "ai.apiTokens",
			groupId: "ai",
			label: "API Tokens",
			description:
				"Personal access tokens for external MCP and REST agents. Tokens execute under the issuing member's RBAC.",
			keywords: [
				"token",
				"tokens",
				"api token",
				"mcp",
				"rest",
				"bearer",
				"agent",
				"integration",
				"webhook",
				"automation",
				"pat",
				"personal access token",
			],
			permission: "ai.apiTokens.manage",
		},

		// ── Appearance ────────────────────────────────────────────────────────
		{
			id: "appearance.theme",
			groupId: "appearance",
			label: "Theme",
			description: "Color theme and dark / light mode.",
			keywords: ["dark mode", "light mode", "color", "preset", "palette", "appearance"],
		},
		{
			id: "appearance.layout",
			groupId: "appearance",
			label: "Layout",
			description: "Font, border radius, sidebar style, and density.",
			keywords: ["font", "radius", "border", "sidebar", "density", "spacing", "size"],
		},
		{
			id: "appearance.default-views",
			groupId: "appearance",
			label: "Default views",
			description: `Per-user default view (list or board) for ${pluralQuad}.`,
			keywords: [
				"default view",
				"list",
				"board",
				"kanban",
				"per user",
				"my preference",
				...entityKeywords,
			],
		},
		{
			id: "appearance.dashboard-density",
			groupId: "appearance",
			label: "Dashboard density",
			description:
				"How many rows the dashboard's Recent activity and Recent messages widgets show at a glance.",
			keywords: [
				"density",
				"rows",
				"row count",
				"limit",
				"compact",
				"dashboard",
				"recent activity",
				"recent messages",
				"preview",
				"slider",
				"items",
			],
		},
		{
			id: "appearance.tutorials",
			groupId: "appearance",
			label: "Tutorials",
			description:
				"Replay the first-time coachmarks that explain power gestures (drag-to-status, view options, etc.).",
			keywords: [
				"tutorial",
				"tour",
				"coachmark",
				"replay",
				"reset",
				"onboarding",
				"first-time",
				"help",
				"guide",
			],
		},

		// ── Notifications ─────────────────────────────────────────────────────
		{
			id: "notifications.crm",
			groupId: "notifications",
			label: "CRM",
			description: `Notifications for ${lead.singular.toLowerCase()}, ${contact.singular.toLowerCase()}, and ${deal.singular.toLowerCase()} activity.`,
			keywords: ["assigned", "stage", "converted", "won", ...entityKeywords],
		},
		{
			id: "notifications.reminders",
			groupId: "notifications",
			label: "Reminders",
			description: "Notifications for follow-up reminders and overdue items.",
			keywords: ["morning briefing", "overdue", "due", "follow-up"],
		},
		{
			id: "notifications.ai",
			groupId: "notifications",
			label: "AI",
			description: "Notifications for AI-powered actions and AI workspace setup.",
			keywords: ["ai action", "ai workspace setup", "ai ready", "setup complete"],
		},
		{
			id: "notifications.team",
			groupId: "notifications",
			label: "Team",
			description: "Notifications for team membership and role changes.",
			keywords: ["member invited", "member joined", "role changed"],
		},
		{
			id: "notifications.system",
			groupId: "notifications",
			label: "System",
			description: "Billing, trial, and data import notifications.",
			keywords: ["trial ending", "suspended", "csv import", "announcement"],
		},

		// ── Shortcuts ─────────────────────────────────────────────────────────
		{
			id: "shortcuts.navigation",
			groupId: "shortcuts",
			label: "Navigation",
			description: "Keyboard shortcuts for moving between pages.",
			keywords: ["g h", "g l", "goto", "page", "navigate"],
		},
		{
			id: "shortcuts.actions",
			groupId: "shortcuts",
			label: "Actions",
			description: "Global action shortcuts like command palette, create, and AI chat.",
			keywords: ["cmd k", "command palette", "create", "ai chat", "escape"],
		},
		{
			id: "shortcuts.table",
			groupId: "shortcuts",
			label: "Table & List",
			description: "Shortcuts for navigating and selecting rows.",
			keywords: ["j k", "select row", "delete row", "select all"],
		},
		{
			id: "shortcuts.record",
			groupId: "shortcuts",
			label: "Record",
			description: "Shortcuts inside a record detail view.",
			keywords: ["edit", "save", "close record", "pin", "archive"],
		},

		// ── Billing ───────────────────────────────────────────────────────────
		{
			id: "billing.plan",
			groupId: "billing",
			label: "Current Plan",
			description: "The plan your workspace is billed on.",
			keywords: [
				"subscription",
				"tier",
				"plan",
				"upgrade",
				"downgrade",
				"free",
				"pro",
				"business",
			],
			permission: "org.viewBilling",
		},
		{
			id: "billing.usage",
			groupId: "billing",
			label: "Usage",
			description: "Real-time usage against your plan's limits.",
			keywords: ["limit", "quota", "members used", "ai messages used", "consumption"],
			permission: "org.viewBilling",
		},
		{
			id: "billing.invoices",
			groupId: "billing",
			label: "Invoices",
			description: "Past invoices and payment history.",
			keywords: ["receipt", "payment", "history", "portal", "subscription", "billing"],
			permission: "org.viewBilling",
		},

		// ── Data & Security ───────────────────────────────────────────────────
		{
			id: "data.export",
			groupId: "data",
			label: "Export data",
			description: `Download your ${pluralQuad} as CSV or JSON.`,
			keywords: ["download", "backup", "csv", "json", "export", "archive", ...entityKeywords],
			permission: "org.editSettings",
		},
		{
			id: "data.trash",
			groupId: "data",
			label: "Trash",
			description: "Restore soft-deleted records during the retention window.",
			keywords: [
				"trash",
				"deleted",
				"restore",
				"recycle",
				"recover",
				"undo delete",
				"recently deleted",
				...entityKeywords,
			],
			permission: "data.viewTrash",
		},
		{
			id: "data.danger",
			groupId: "data",
			label: "Danger Zone",
			description: "Transfer ownership or permanently delete this workspace.",
			keywords: [
				"delete workspace",
				"remove workspace",
				"destroy",
				"permanent",
				"nuke",
				"transfer ownership",
			],
			ownerOnly: true,
		},
	];
}

/**
 * Static fallback — uses English defaults.
 *
 * @deprecated Use `getSettingsSections(labels)` from `useEntityLabels()`.
 *             Kept for compatibility with any non-reactive caller.
 */
export const SETTINGS_SECTIONS: SettingsSectionEntry[] = getSettingsSections();

/**
 * Filter sections to the ones the current user can see, optionally by group.
 *
 * Rules:
 *   - If the section is ownerOnly, the user must have `org.delete`.
 *   - If the section has a `permission`, the user must have it.
 *   - Otherwise the section is visible to anyone who can reach the parent group.
 */
export function getVisibleSections(
	sections: SettingsSectionEntry[],
	permissions: string[],
	groupId?: SettingsGroupId,
): SettingsSectionEntry[] {
	const isOwner = permissions.includes("org.delete");
	return sections.filter((s) => {
		if (groupId && s.groupId !== groupId) return false;
		if (s.ownerOnly && !isOwner) return false;
		if (s.permission && !permissions.includes(s.permission) && !isOwner) return false;
		return true;
	});
}

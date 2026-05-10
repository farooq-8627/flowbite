/**
 * Flat section registry — the single source of truth for:
 *   1. The dynamic sub-navigation rail inside each settings group
 *   2. The full-text Fuse.js search index
 *
 * Every <SettingsSection id="x"> card on-screen must have a matching entry here.
 * Conversely, every entry here implies a rendered section with that DOM id.
 *
 * WHY a flat list (not nested under groups):
 *   - The nav already knows the active group, so it just `filter(s.groupId === active)`.
 *   - The search is a flat fuzzy match — a flat list is what Fuse.js wants.
 *   - Permission filtering is a single `.filter(canSee)` instead of nested traversal.
 */
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

export const SETTINGS_SECTIONS: SettingsSectionEntry[] = [
	// ── Workspace ─────────────────────────────────────────────────────────────
	{
		id: "workspace.general",
		groupId: "workspace",
		label: "General",
		description: "Organization name, workspace URL, timezone, default currency, and industry.",
		keywords: ["name", "logo", "timezone", "currency", "industry", "url", "slug", "branding", "locale"],
	},
	{
		id: "workspace.entity-labels",
		groupId: "workspace",
		label: "Entity Labels",
		description: "Rename CRM entities (leads, contacts, deals, companies) to match your industry.",
		keywords: ["rename", "customize", "singular", "plural", "label", "lead", "contact", "deal", "company", "entity", "naming"],
	},
	{
		id: "workspace.record-codes",
		groupId: "workspace",
		label: "Record Codes",
		description: "Prefix used when generating unique codes for new records, e.g. P-001, D-042.",
		keywords: ["prefix", "code", "id", "numbering", "record id", "P-", "D-"],
	},

	// ── Team ──────────────────────────────────────────────────────────────────
	{
		id: "team.members",
		groupId: "team",
		label: "Members",
		description: "People who have access to this workspace. Invite, change role, or remove.",
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

	// ── CRM ───────────────────────────────────────────────────────────────────
	{
		id: "crm.pipelines",
		groupId: "crm",
		label: "Pipelines",
		description: "Deal stage workflows. Add, rename, recolor, or reorder stages inline.",
		keywords: ["stage", "kanban", "board", "workflow", "deal flow", "funnel"],
	},
	{
		id: "crm.fields",
		groupId: "crm",
		label: "Custom Fields",
		description: "Add custom fields to records — text, number, select, date, boolean, etc.",
		keywords: ["field", "custom", "property", "attribute", "text", "number", "select", "date", "boolean", "dropdown", "schema"],
	},
	{
		id: "crm.tags",
		groupId: "crm",
		label: "Tags",
		description: "Shared tags for categorizing leads, contacts, and deals.",
		keywords: ["label", "color", "categorize", "group", "mark"],
	},
	{
		id: "crm.reminders",
		groupId: "crm",
		label: "Reminder Defaults",
		description: "Default timing for automated reminders, morning briefings, and stale-deal alerts.",
		keywords: ["follow-up", "stale", "briefing", "alert", "due date", "overdue", "rent"],
	},

	// ── AI ────────────────────────────────────────────────────────────────────
	{
		id: "ai.context",
		groupId: "ai",
		label: "Business Context",
		description: "Business context fed into the AI assistant so it understands your workspace setup, industry, and tone.",
		keywords: ["prompt", "system prompt", "assistant", "workspace setup", "instructions", "persona", "tone", "industry"],
	},
	{
		id: "ai.usage",
		groupId: "ai",
		label: "AI Usage",
		description: "AI message consumption against your plan limit.",
		keywords: ["limit", "plan", "tokens", "messages", "quota", "consumption"],
	},

	// ── Appearance ────────────────────────────────────────────────────────────
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

	// ── Notifications ─────────────────────────────────────────────────────────
	{
		id: "notifications.crm",
		groupId: "notifications",
		label: "CRM",
		description: "Notifications for lead, contact, and deal activity.",
		keywords: ["lead", "contact", "deal", "assigned", "stage", "converted", "won"],
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

	// ── Shortcuts ─────────────────────────────────────────────────────────────
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

	// ── Billing ───────────────────────────────────────────────────────────────
	{
		id: "billing.plan",
		groupId: "billing",
		label: "Current Plan",
		description: "The plan your workspace is billed on.",
		keywords: ["subscription", "tier", "plan", "upgrade", "downgrade", "free", "pro", "business"],
		ownerOnly: true,
	},
	{
		id: "billing.usage",
		groupId: "billing",
		label: "Usage",
		description: "Real-time usage against your plan's limits.",
		keywords: ["limit", "quota", "members used", "ai messages used", "consumption"],
		ownerOnly: true,
	},
	{
		id: "billing.invoices",
		groupId: "billing",
		label: "Invoices",
		description: "Past invoices and payment history.",
		keywords: ["receipt", "payment", "history", "portal", "lemonsqueezy"],
		ownerOnly: true,
	},

	// ── Data & Security ───────────────────────────────────────────────────────
	{
		id: "data.export",
		groupId: "data",
		label: "Export data",
		description: "Download your CRM data as CSV or JSON.",
		keywords: ["download", "backup", "csv", "json", "export", "archive"],
		permission: "org.editSettings",
	},
	{
		id: "data.danger",
		groupId: "data",
		label: "Danger Zone",
		description: "Transfer ownership or permanently delete this workspace.",
		keywords: ["delete workspace", "remove workspace", "destroy", "permanent", "nuke", "transfer ownership"],
		ownerOnly: true,
	},
];

/**
 * Filter sections to the ones the current user can see, optionally by group.
 *
 * Rules:
 *   - If the section is ownerOnly, the user must have `org.delete`.
 *   - If the section has a `permission`, the user must have it.
 *   - Otherwise the section is visible to anyone who can reach the parent group.
 */
export function getVisibleSections(
	permissions: string[],
	groupId?: SettingsGroupId,
): SettingsSectionEntry[] {
	const isOwner = permissions.includes("org.delete");
	return SETTINGS_SECTIONS.filter((s) => {
		if (groupId && s.groupId !== groupId) return false;
		if (s.ownerOnly && !isOwner) return false;
		if (s.permission && !permissions.includes(s.permission) && !isOwner) return false;
		return true;
	});
}

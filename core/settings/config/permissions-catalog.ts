/**
 * Client-side permissions catalog.
 *
 * WHY THIS IS A FUNCTION (not a const):
 *   CRM entity names ("Lead", "Contact", "Deal", "Company") are renameable per
 *   org. If this file returned a static constant, the role editor would still
 *   say "View leads" after an admin renamed the entity to "Inquiry". We export
 *   `getPermissionModules(labels)` so the UI rebuilds labels on every render
 *   using the current org's labels — keeping the permission matrix in sync
 *   with Settings → Workspace → Entity Labels.
 *
 * WHAT LABELS DO vs DON'T CHANGE:
 *   - Module titles + permission labels: rewritten to use singular/plural
 *     entity names (e.g. "View leads" → "View inquiries").
 *   - Permission `key` strings: NEVER change — they're the backend contract.
 *     Renaming "lead" → "inquiry" in the UI does not rename "leads.view".
 *
 * MAINTENANCE:
 *   When you add a new permission key on the Convex side, ALSO add it here
 *   or the role editor won't let owners toggle it. The Convex map stays the
 *   authoritative source for *enforcement*; this file is the source for *UI*.
 *
 * Sources:
 *   - core/shared/hooks/useEntityLabels.ts (label types)
 *   - convex/_shared/permissions.ts (canonical permission keys)
 */

import { ENTITY_LABEL_DEFAULTS, type EntityLabels } from "@/core/shared/hooks/useEntityLabels";

// ─── Types ───────────────────────────────────────────────────────────────────

export type PermissionDef = {
	key: string;
	label: string;
	description?: string;
};

export type PermissionModule = {
	id: string;
	label: string;
	description?: string;
	permissions: PermissionDef[];
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Lowercase singular — used inline in sentences. Example: "View leads" */
const lc = (s: string) => s.toLowerCase();

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Build the permission-module catalog for the given set of entity labels.
 *
 * Pass the hook output from `useEntityLabels()` — this keeps permission labels
 * in lockstep with the admin's renamed entities. Falls back to the English
 * defaults when called without an argument (e.g. from unit tests).
 */
export function getPermissionModules(
	labels: EntityLabels = ENTITY_LABEL_DEFAULTS,
): PermissionModule[] {
	const lead = labels.lead;
	const contact = labels.contact;
	const deal = labels.deal;
	const company = labels.company;

	return [
		{
			id: "org",
			label: "Organization",
			description: "Workspace-level settings and billing.",
			permissions: [
				{
					key: "org.viewSettings",
					label: "View settings",
					description: "See workspace settings pages.",
				},
				{
					key: "org.editSettings",
					label: "Edit settings",
					description: "Change currency, timezone, and other workspace config.",
				},
				{ key: "org.editName", label: "Rename workspace" },
				{ key: "org.editLogo", label: "Change logo" },
				{
					key: "org.viewBilling",
					label: "View billing",
					description: "See plan, invoices, and usage.",
				},
				{
					key: "org.delete",
					label: "Delete workspace",
					description: "Permanently remove the workspace.",
				},
			],
		},
		{
			id: "members",
			label: "Members",
			description: "Who can join, leave, or change roles.",
			permissions: [
				{ key: "members.view", label: "View members" },
				{ key: "members.invite", label: "Invite members" },
				{ key: "members.cancelInvitation", label: "Cancel invitations" },
				{
					key: "members.remove",
					label: "Remove members",
					description: "Cannot remove the last owner.",
				},
				{
					key: "members.changeRole",
					label: "Change roles",
					description: "Needed to promote or demote members.",
				},
				{ key: "members.leave", label: "Leave workspace" },
			],
		},
		{
			id: "leads",
			label: lead.plural,
			permissions: [
				{ key: "leads.view", label: `View ${lc(lead.plural)}` },
				{ key: "leads.create", label: `Create ${lc(lead.plural)}` },
				{ key: "leads.update", label: `Edit ${lc(lead.plural)}` },
				{ key: "leads.delete", label: `Delete ${lc(lead.plural)}` },
				{ key: "leads.assign", label: `Assign ${lc(lead.plural)}` },
				{ key: "leads.qualify", label: `Qualify ${lc(lead.plural)}` },
				{
					key: "leads.convert",
					label: `Convert ${lc(lead.plural)}`,
					description: `Turn ${lc(`a ${lead.singular}`)} into ${lc(`a ${contact.singular}`)} + ${lc(deal.singular)}.`,
				},
			],
		},
		{
			id: "contacts",
			label: contact.plural,
			permissions: [
				{ key: "contacts.view", label: `View ${lc(contact.plural)}` },
				{ key: "contacts.create", label: `Create ${lc(contact.plural)}` },
				{ key: "contacts.update", label: `Edit ${lc(contact.plural)}` },
				{ key: "contacts.delete", label: `Delete ${lc(contact.plural)}` },
				{ key: "contacts.assign", label: `Assign ${lc(contact.plural)}` },
			],
		},
		{
			id: "companies",
			label: company.plural,
			permissions: [
				{ key: "companies.view", label: `View ${lc(company.plural)}` },
				{ key: "companies.create", label: `Create ${lc(company.plural)}` },
				{ key: "companies.update", label: `Edit ${lc(company.plural)}` },
				{ key: "companies.delete", label: `Delete ${lc(company.plural)}` },
			],
		},
		{
			id: "deals",
			label: deal.plural,
			permissions: [
				{ key: "deals.view", label: `View ${lc(deal.plural)}` },
				{ key: "deals.create", label: `Create ${lc(deal.plural)}` },
				{ key: "deals.update", label: `Edit ${lc(deal.plural)}` },
				{ key: "deals.delete", label: `Delete ${lc(deal.plural)}` },
				{ key: "deals.assign", label: `Assign ${lc(deal.plural)}` },
				{ key: "deals.changeStage", label: "Move stages" },
				{ key: "deals.close", label: "Close as won / lost" },
			],
		},
		{
			id: "notes",
			label: "Notes",
			permissions: [
				{ key: "notes.view", label: "View notes" },
				{
					key: "notes.viewInternal",
					label: "View internal notes",
					description: "Notes marked internal are hidden from regular members.",
				},
				{ key: "notes.create", label: "Create notes" },
				{ key: "notes.updateOwn", label: "Edit own notes" },
				{ key: "notes.deleteOwn", label: "Delete own notes" },
				{ key: "notes.deleteAny", label: "Delete any note" },
				{ key: "notes.pin", label: "Pin notes" },
			],
		},
		{
			id: "reminders",
			label: "Reminders",
			permissions: [
				{ key: "reminders.view", label: "View reminders" },
				{ key: "reminders.create", label: "Create reminders" },
				{
					key: "reminders.manage",
					label: "Manage reminders",
					description: "Update, complete, or delete reminders.",
				},
			],
		},
		{
			id: "tags",
			label: "Tags",
			permissions: [
				{ key: "tags.view", label: "View tags" },
				{
					key: "tags.manage",
					label: "Manage tags",
					description: "Create and delete org-wide tags.",
				},
				{ key: "tags.attach", label: "Apply tags to records" },
			],
		},
		{
			id: "pipelines",
			label: "Pipelines",
			permissions: [
				{ key: "pipelines.view", label: "View pipelines" },
				{ key: "pipelines.manage", label: "Manage pipelines and stages" },
			],
		},
		{
			id: "fields",
			label: "Custom Fields",
			permissions: [
				{ key: "fieldDefinitions.view", label: "View custom fields" },
				{ key: "fieldDefinitions.manage", label: "Manage custom fields" },
			],
		},
		{
			id: "ai",
			label: "AI Assistant",
			permissions: [
				{ key: "ai.use", label: "Use AI assistant" },
				{ key: "ai.manageTools", label: "Enable / disable AI tools" },
				{ key: "ai.viewHistory", label: "View AI history" },
			],
		},
		{
			id: "activityLogs",
			label: "Activity Logs",
			permissions: [
				{ key: "activityLogs.viewOrg", label: "View org activity log" },
				{ key: "activityLogs.viewOwn", label: "View own activity" },
			],
		},
		{
			id: "notifications",
			label: "Notifications",
			permissions: [
				{ key: "notifications.viewOwn", label: "View own notifications" },
				{ key: "notifications.markRead", label: "Mark notifications read" },
			],
		},
		{
			id: "savedViews",
			label: "Saved Views",
			permissions: [
				{ key: "savedViews.view", label: "View saved views" },
				{ key: "savedViews.createPersonal", label: "Create personal views" },
				{ key: "savedViews.createOrg", label: "Create org-wide views" },
				{ key: "savedViews.delete", label: "Delete saved views" },
			],
		},
	];
}

/**
 * Static fallback catalog built from English defaults.
 *
 * @deprecated Use `getPermissionModules(labels)` from `useEntityLabels()`.
 *             Kept only so any older callers keep compiling while we migrate.
 */
export const PERMISSION_MODULES: PermissionModule[] = getPermissionModules();

/** Flat list of every permission key — used to validate a role's permissions. */
export const ALL_PERMISSION_KEYS: readonly string[] = PERMISSION_MODULES.flatMap((m) =>
	m.permissions.map((p) => p.key),
);

/**
 * Client-side permissions catalog.
 *
 * Mirrors the PERMISSIONS map in convex/_shared/permissions.ts but adds
 * human-readable labels, descriptions, and module groupings for the UI.
 *
 * RULE: When you add a new permission key on the Convex side, ALSO add it here
 * or the role editor won't let owners toggle it. The Convex map stays the
 * authoritative source for *enforcement*; this file is the source for *UI*.
 */

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

export const PERMISSION_MODULES: PermissionModule[] = [
	{
		id: "org",
		label: "Organization",
		description: "Workspace-level settings and billing.",
		permissions: [
			{ key: "org.viewSettings", label: "View settings",   description: "See workspace settings pages." },
			{ key: "org.editSettings", label: "Edit settings",   description: "Change currency, timezone, and other workspace config." },
			{ key: "org.editName",     label: "Rename workspace" },
			{ key: "org.editLogo",     label: "Change logo" },
			{ key: "org.viewBilling",  label: "View billing",    description: "See plan, invoices, and usage." },
			{ key: "org.delete",       label: "Delete workspace", description: "Permanently remove the workspace." },
		],
	},
	{
		id: "members",
		label: "Members",
		description: "Who can join, leave, or change roles.",
		permissions: [
			{ key: "members.view",             label: "View members" },
			{ key: "members.invite",           label: "Invite members" },
			{ key: "members.cancelInvitation", label: "Cancel invitations" },
			{ key: "members.remove",           label: "Remove members",     description: "Cannot remove the last owner." },
			{ key: "members.changeRole",       label: "Change roles",       description: "Needed to promote or demote members." },
			{ key: "members.leave",            label: "Leave workspace" },
		],
	},
	{
		id: "leads",
		label: "Leads",
		permissions: [
			{ key: "leads.view",    label: "View leads" },
			{ key: "leads.create",  label: "Create leads" },
			{ key: "leads.update",  label: "Edit leads" },
			{ key: "leads.delete",  label: "Delete leads" },
			{ key: "leads.assign",  label: "Assign leads" },
			{ key: "leads.qualify", label: "Qualify leads" },
			{ key: "leads.convert", label: "Convert leads", description: "Turn a lead into a contact + deal." },
		],
	},
	{
		id: "contacts",
		label: "Contacts",
		permissions: [
			{ key: "contacts.view",   label: "View contacts" },
			{ key: "contacts.create", label: "Create contacts" },
			{ key: "contacts.update", label: "Edit contacts" },
			{ key: "contacts.delete", label: "Delete contacts" },
			{ key: "contacts.assign", label: "Assign contacts" },
		],
	},
	{
		id: "companies",
		label: "Companies",
		permissions: [
			{ key: "companies.view",   label: "View companies" },
			{ key: "companies.create", label: "Create companies" },
			{ key: "companies.update", label: "Edit companies" },
			{ key: "companies.delete", label: "Delete companies" },
		],
	},
	{
		id: "deals",
		label: "Deals",
		permissions: [
			{ key: "deals.view",        label: "View deals" },
			{ key: "deals.create",      label: "Create deals" },
			{ key: "deals.update",      label: "Edit deals" },
			{ key: "deals.delete",      label: "Delete deals" },
			{ key: "deals.assign",      label: "Assign deals" },
			{ key: "deals.changeStage", label: "Move stages" },
			{ key: "deals.close",       label: "Close as won / lost" },
		],
	},
	{
		id: "notes",
		label: "Notes",
		permissions: [
			{ key: "notes.view",         label: "View notes" },
			{ key: "notes.viewInternal", label: "View internal notes", description: "Notes marked internal are hidden from regular members." },
			{ key: "notes.create",       label: "Create notes" },
			{ key: "notes.updateOwn",    label: "Edit own notes" },
			{ key: "notes.deleteOwn",    label: "Delete own notes" },
			{ key: "notes.deleteAny",    label: "Delete any note" },
			{ key: "notes.pin",          label: "Pin notes" },
		],
	},
	{
		id: "reminders",
		label: "Reminders",
		permissions: [
			{ key: "reminders.view",   label: "View reminders" },
			{ key: "reminders.create", label: "Create reminders" },
			{ key: "reminders.manage", label: "Manage reminders", description: "Update, complete, or delete reminders." },
		],
	},
	{
		id: "tags",
		label: "Tags",
		permissions: [
			{ key: "tags.view",   label: "View tags" },
			{ key: "tags.manage", label: "Manage tags", description: "Create and delete org-wide tags." },
			{ key: "tags.attach", label: "Apply tags to records" },
		],
	},
	{
		id: "pipelines",
		label: "Pipelines",
		permissions: [
			{ key: "pipelines.view",   label: "View pipelines" },
			{ key: "pipelines.manage", label: "Manage pipelines and stages" },
		],
	},
	{
		id: "fields",
		label: "Custom Fields",
		permissions: [
			{ key: "fieldDefinitions.view",   label: "View custom fields" },
			{ key: "fieldDefinitions.manage", label: "Manage custom fields" },
		],
	},
	{
		id: "ai",
		label: "AI Assistant",
		permissions: [
			{ key: "ai.use",         label: "Use AI assistant" },
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
			{ key: "notifications.viewOwn",  label: "View own notifications" },
			{ key: "notifications.markRead", label: "Mark notifications read" },
		],
	},
	{
		id: "savedViews",
		label: "Saved Views",
		permissions: [
			{ key: "savedViews.view",           label: "View saved views" },
			{ key: "savedViews.createPersonal", label: "Create personal views" },
			{ key: "savedViews.createOrg",      label: "Create org-wide views" },
			{ key: "savedViews.delete",         label: "Delete saved views" },
		],
	},
];

/** Flat list of every permission key — used to validate a role's permissions. */
export const ALL_PERMISSION_KEYS: readonly string[] = PERMISSION_MODULES.flatMap(
	(m) => m.permissions.map((p) => p.key),
);

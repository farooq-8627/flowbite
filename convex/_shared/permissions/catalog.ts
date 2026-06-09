/**
 * Permission Catalog — SINGLE SOURCE OF TRUTH for every permission in the app.
 *
 * Add a permission HERE and it propagates automatically to:
 *   - Server-side `requireRole()` checks (just use the new key)
 *   - The seed permissions for the 4 system roles (`getDefaultPermissionsForRole`)
 *   - The role-editor UI (`getPermissionModules` derives modules from this)
 *   - The migration that backfills permissions on existing roles
 *
 * STRUCTURE:
 *   Each entry is `{ key, module, label, description?, defaultRoles[] }`.
 *
 *   - `key`          — canonical permission string used by `requireRole()`.
 *                      NEVER changes (backend contract).
 *   - `module`       — UI grouping bucket. Maps to a module label below.
 *   - `label`        — display label. May contain `{lead}` / `{leads}` /
 *                      `{Lead}` / `{Leads}` / `{contact}…` / `{deal}…` /
 *                      `{company}…` placeholders that the frontend
 *                      interpolates with the org's renamed entity labels.
 *   - `description`  — optional help text. Same placeholder rules.
 *   - `defaultRoles` — which of the 4 system roles are seeded with this
 *                      permission on org creation. Owner is always included
 *                      (it's the implicit superuser role).
 *
 * RULES:
 *   - Owner MUST be in every `defaultRoles` list. If a permission shouldn't
 *     be available to anyone in an org, it does not belong in this catalog —
 *     it's a platform/super_admin operation.
 *   - Don't sort entries alphabetically — keep them grouped by module so
 *     reviewers see the complete picture of any module at a glance.
 *
 * Sources:
 *   - convex/_shared/permissions.ts (legacy PERMISSIONS map — replaced by this file)
 *   - .github/agents/base/rbac.md (canonical role definitions)
 */

// ─── Types ───────────────────────────────────────────────────────────────────

/**
 * Names of the 4 system roles that get auto-seeded on org creation.
 *
 * Owners can create custom roles in addition to these — those custom roles
 * pick their permissions explicitly via the role editor; they do not draw
 * from `defaultRoles` at all.
 */
export const SYSTEM_ROLE_NAMES = ["Owner", "Admin", "Member", "Viewer"] as const;
export type SystemRoleName = (typeof SYSTEM_ROLE_NAMES)[number];

export type PermissionEntry = {
	readonly key: string;
	readonly module: string;
	readonly label: string;
	readonly description?: string;
	readonly defaultRoles: readonly SystemRoleName[];
};

// ─── Module display metadata ─────────────────────────────────────────────────

/**
 * Display titles for module buckets in the role-editor UI.
 *
 * Templates may contain `{Leads}` / `{Contacts}` / `{Deals}` / `{Companies}`
 * (capitalised plural) placeholders for the renamable CRM entities. The
 * frontend interpolates these via `useEntityLabels()` so a workspace that
 * renamed "Lead" to "Inquiry" shows "Inquiries" everywhere.
 */
export const PERMISSION_MODULE_LABELS: Record<string, { label: string; description?: string }> = {
	org: {
		label: "Organization",
		description: "Workspace-level settings and billing.",
	},
	members: {
		label: "Members",
		description: "Who can join, leave, or change roles.",
	},
	records: {
		label: "Record Visibility",
		description:
			"Whether a role sees every record in the workspace or only the ones assigned to them.",
	},
	leads: { label: "{Leads}" },
	contacts: { label: "{Contacts}" },
	companies: { label: "{Companies}" },
	deals: { label: "{Deals}" },
	notes: { label: "Notes" },
	messages: { label: "Messages" },
	tasks: { label: "Tasks" },
	tags: { label: "Tags" },
	savedViews: { label: "Saved Views" },
	pipelines: { label: "Pipelines" },
	fields: { label: "Custom Fields" },
	ai: { label: "AI Assistant" },
	activityLogs: { label: "Activity Logs" },
	notifications: { label: "Notifications" },
	files: { label: "Files" },
	data: { label: "Data & Privacy" },
};

/** Module render order in the role-editor UI. */
export const PERMISSION_MODULE_ORDER: readonly string[] = [
	"org",
	"members",
	"records",
	"leads",
	"contacts",
	"companies",
	"deals",
	"notes",
	"messages",
	"tasks",
	"tags",
	"savedViews",
	"pipelines",
	"fields",
	"ai",
	"activityLogs",
	"notifications",
	"files",
	"data",
];

// ─── Catalog ─────────────────────────────────────────────────────────────────

/**
 * The catalog. Adding/removing a permission means editing exactly this array.
 * Every consumer in the codebase derives from it.
 */
export const PERMISSION_CATALOG: readonly PermissionEntry[] = [
	// ── Org settings + danger zone ───────────────────────────────────────────
	{
		key: "org.viewSettings",
		module: "org",
		label: "View settings",
		description: "See workspace settings pages.",
		defaultRoles: ["Owner", "Admin"],
	},
	{
		key: "org.editName",
		module: "org",
		label: "Rename workspace",
		defaultRoles: ["Owner"],
	},
	{
		key: "org.editLogo",
		module: "org",
		label: "Change logo",
		defaultRoles: ["Owner", "Admin"],
	},
	{
		key: "org.editSettings",
		module: "org",
		label: "Edit settings",
		description: "Change currency, timezone, and other workspace config.",
		defaultRoles: ["Owner", "Admin"],
	},
	{
		key: "org.viewBilling",
		module: "org",
		label: "View billing",
		description: "See plan, invoices, and usage.",
		defaultRoles: ["Owner"],
	},
	{
		key: "org.delete",
		module: "org",
		label: "Delete workspace",
		description: "Permanently remove the workspace.",
		defaultRoles: ["Owner"],
	},

	// ── Members ──────────────────────────────────────────────────────────────
	{
		key: "members.view",
		module: "members",
		label: "View members",
		defaultRoles: ["Owner", "Admin", "Member", "Viewer"],
	},
	{
		key: "members.invite",
		module: "members",
		label: "Invite members",
		defaultRoles: ["Owner", "Admin"],
	},
	{
		key: "members.cancelInvitation",
		module: "members",
		label: "Cancel invitations",
		defaultRoles: ["Owner", "Admin"],
	},
	{
		key: "members.remove",
		module: "members",
		label: "Remove members",
		description: "Cannot remove the last owner.",
		defaultRoles: ["Owner", "Admin"],
	},
	{
		key: "members.changeRole",
		module: "members",
		label: "Change roles",
		description: "Promote or demote members.",
		defaultRoles: ["Owner"],
	},
	{
		key: "members.leave",
		module: "members",
		label: "Leave workspace",
		defaultRoles: ["Owner", "Admin", "Member", "Viewer"],
	},
	{
		// Stage 7 — analytical layer (`/SPRINT-PLAN.md` Stage 7).
		// Gate for the `member_performance` AI tool + the upcoming
		// per-member performance dashboard. Manager-level only — the
		// payload exposes per-person close rate / win value / pipeline
		// activity; non-managers should not see those numbers about their
		// teammates. Owners + Admins by default; the Member role can
		// still see THEIR OWN deal data through normal CRM views.
		key: "members.viewPerformance",
		module: "members",
		label: "View member performance",
		description:
			"Per-member close rate, deals won, pipeline value, and activity counts. Owner / Admin only by default.",
		defaultRoles: ["Owner", "Admin"],
	},

	// ── Record visibility (row-level scope) ─────────────────────────────────
	{
		// Assignment-based (row-level) visibility switch. This is the ONLY
		// cross-cutting visibility permission — it gates leads / contacts /
		// companies / deals together rather than per-entity, because the
		// product concept is one toggle: "does this role see the whole
		// workspace, or only the records assigned to them?".
		//
		// Semantics (capability model — presence GRANTS, absence RESTRICTS):
		//   - HAS `records.viewAll`  → sees every record in the org (the
		//     historical default for every role).
		//   - LACKS `records.viewAll` → row-level scope: only rows where
		//     `assignedTo === their own userId` are visible across list,
		//     board, detail, search, and AI search. Unassigned rows are
		//     hidden. The proactive AI Pulse is already per-user assigned-
		//     scoped, so it stays consistent automatically.
		//
		// Seeded to ALL 4 system roles so adding this permission changes
		// NOTHING by default — an org opts a role into row-level scope by
		// REMOVING this key from it (custom role, or by editing Member /
		// Viewer in the role editor). The backfill migration
		// `_migrations/2026_06_06_backfillRecordsViewAll` grants it to every
		// pre-existing role (system + custom) for the same reason.
		//
		// Enforced by the central helper in
		// `convex/_shared/permissions/recordScope.ts`
		// (`resolveRecordScope` / `rowInScope` / `resolveAssigneeFilter`).
		key: "records.viewAll",
		module: "records",
		label: "View all records (not just assigned)",
		description:
			"See every {lead}, {contact}, {company}, and {deal} in the workspace. Without this, the member only sees records assigned to them.",
		defaultRoles: ["Owner", "Admin", "Member", "Viewer"],
	},

	// ── Leads ────────────────────────────────────────────────────────────────
	{
		key: "leads.view",
		module: "leads",
		label: "View {leads}",
		defaultRoles: ["Owner", "Admin", "Member", "Viewer"],
	},
	{
		key: "leads.create",
		module: "leads",
		label: "Create {leads}",
		defaultRoles: ["Owner", "Admin", "Member"],
	},
	{
		key: "leads.update",
		module: "leads",
		label: "Edit {leads}",
		defaultRoles: ["Owner", "Admin", "Member"],
	},
	{
		key: "leads.delete",
		module: "leads",
		label: "Delete {leads}",
		defaultRoles: ["Owner", "Admin"],
	},
	{
		key: "leads.assign",
		module: "leads",
		label: "Assign {leads}",
		defaultRoles: ["Owner", "Admin"],
	},
	{
		key: "leads.qualify",
		module: "leads",
		label: "Qualify {leads}",
		defaultRoles: ["Owner", "Admin", "Member"],
	},
	{
		key: "leads.convert",
		module: "leads",
		label: "Convert {leads}",
		description: "Turn a {lead} into a {contact} + {deal}.",
		defaultRoles: ["Owner", "Admin"],
	},

	// ── Contacts ─────────────────────────────────────────────────────────────
	{
		key: "contacts.view",
		module: "contacts",
		label: "View {contacts}",
		defaultRoles: ["Owner", "Admin", "Member", "Viewer"],
	},
	{
		key: "contacts.create",
		module: "contacts",
		label: "Create {contacts}",
		defaultRoles: ["Owner", "Admin", "Member"],
	},
	{
		key: "contacts.update",
		module: "contacts",
		label: "Edit {contacts}",
		defaultRoles: ["Owner", "Admin", "Member"],
	},
	{
		key: "contacts.delete",
		module: "contacts",
		label: "Delete {contacts}",
		defaultRoles: ["Owner", "Admin"],
	},
	{
		key: "contacts.assign",
		module: "contacts",
		label: "Assign {contacts}",
		defaultRoles: ["Owner", "Admin"],
	},

	// ── Companies ────────────────────────────────────────────────────────────
	{
		key: "companies.view",
		module: "companies",
		label: "View {companies}",
		defaultRoles: ["Owner", "Admin", "Member", "Viewer"],
	},
	{
		key: "companies.create",
		module: "companies",
		label: "Create {companies}",
		defaultRoles: ["Owner", "Admin", "Member"],
	},
	{
		key: "companies.update",
		module: "companies",
		label: "Edit {companies}",
		defaultRoles: ["Owner", "Admin", "Member"],
	},
	{
		key: "companies.delete",
		module: "companies",
		label: "Delete {companies}",
		defaultRoles: ["Owner", "Admin"],
	},

	// ── Deals ────────────────────────────────────────────────────────────────
	{
		key: "deals.view",
		module: "deals",
		label: "View {deals}",
		defaultRoles: ["Owner", "Admin", "Member", "Viewer"],
	},
	{
		key: "deals.create",
		module: "deals",
		label: "Create {deals}",
		defaultRoles: ["Owner", "Admin", "Member"],
	},
	{
		key: "deals.update",
		module: "deals",
		label: "Edit {deals}",
		defaultRoles: ["Owner", "Admin", "Member"],
	},
	{
		key: "deals.delete",
		module: "deals",
		label: "Delete {deals}",
		defaultRoles: ["Owner"],
	},
	{
		key: "deals.assign",
		module: "deals",
		label: "Assign {deals}",
		defaultRoles: ["Owner", "Admin"],
	},
	{
		key: "deals.changeStage",
		module: "deals",
		label: "Move {deals} between stages",
		defaultRoles: ["Owner", "Admin", "Member"],
	},
	{
		key: "deals.changePipeline",
		module: "deals",
		label: "Move {deals} to a different pipeline",
		description: "Higher-stakes than changing stage — typically only Owners and Admins.",
		defaultRoles: ["Owner", "Admin"],
	},
	{
		key: "deals.viewValues",
		module: "deals",
		label: "View {deal} values (currency)",
		description: "Members see deal currency amounts. Viewers see redacted '—' placeholders.",
		defaultRoles: ["Owner", "Admin", "Member"],
	},
	{
		key: "deals.close",
		module: "deals",
		label: "Close {deals} as won/lost",
		defaultRoles: ["Owner", "Admin"],
	},

	// ── Notes ────────────────────────────────────────────────────────────────
	{
		key: "notes.view",
		module: "notes",
		label: "View notes",
		defaultRoles: ["Owner", "Admin", "Member", "Viewer"],
	},
	{
		key: "notes.viewInternal",
		module: "notes",
		label: "View internal notes",
		description: "Internal notes are hidden from regular members.",
		defaultRoles: ["Owner", "Admin"],
	},
	{
		key: "notes.create",
		module: "notes",
		label: "Create notes",
		defaultRoles: ["Owner", "Admin", "Member"],
	},
	{
		key: "notes.updateOwn",
		module: "notes",
		label: "Edit own notes",
		defaultRoles: ["Owner", "Admin", "Member"],
	},
	{
		key: "notes.deleteOwn",
		module: "notes",
		label: "Delete own notes",
		defaultRoles: ["Owner", "Admin", "Member"],
	},
	{
		key: "notes.deleteAny",
		module: "notes",
		label: "Delete any note",
		defaultRoles: ["Owner", "Admin"],
	},
	{
		key: "notes.pin",
		module: "notes",
		label: "Pin notes",
		defaultRoles: ["Owner", "Admin"],
	},
	{
		key: "notes.categories.view",
		module: "notes",
		label: "View note categories",
		description: "See the list of sticky-note categories defined for this workspace.",
		defaultRoles: ["Owner", "Admin", "Member", "Viewer"],
	},
	{
		key: "notes.categories.manage",
		module: "notes",
		label: "Manage note categories",
		description: "Create, rename, recolour, archive, and reorder sticky-note categories.",
		defaultRoles: ["Owner", "Admin"],
	},

	// ── Messages ─────────────────────────────────────────────────────────────
	{
		key: "messages.view",
		module: "messages",
		label: "View messages",
		description: "Read chat-style messages on profile, deal, and company threads.",
		defaultRoles: ["Owner", "Admin", "Member", "Viewer"],
	},
	{
		key: "messages.viewAll",
		module: "messages",
		label: "View all conversations (moderation)",
		description: "See every conversation in the org, even ones you aren't a member of.",
		defaultRoles: ["Owner", "Admin"],
	},
	{
		key: "messages.send",
		module: "messages",
		label: "Send messages",
		defaultRoles: ["Owner", "Admin", "Member"],
	},
	{
		key: "messages.editOwn",
		module: "messages",
		label: "Edit own messages",
		description: "Edit messages within the configured edit window.",
		defaultRoles: ["Owner", "Admin", "Member"],
	},
	{
		key: "messages.deleteOwn",
		module: "messages",
		label: "Delete own messages",
		defaultRoles: ["Owner", "Admin", "Member"],
	},
	{
		key: "messages.deleteAny",
		module: "messages",
		label: "Delete any message",
		description: "Moderator-level — remove other members' messages.",
		defaultRoles: ["Owner", "Admin"],
	},
	{
		key: "messages.subscribe",
		module: "messages",
		label: "Manage conversation participants",
		description: "Add, remove, and re-invite people on a conversation.",
		defaultRoles: ["Owner", "Admin", "Member"],
	},
	{
		key: "conversations.archive",
		module: "messages",
		label: "Archive conversations",
		defaultRoles: ["Owner", "Admin", "Member"],
	},

	// ── Tasks ───────────────────────────────────────────────────────────────
	{
		key: "tasks.view",
		module: "tasks",
		label: "View tasks",
		description: "See tasks (todo / call / email / meeting / followup) across the workspace.",
		defaultRoles: ["Owner", "Admin", "Member", "Viewer"],
	},
	{
		key: "tasks.create",
		module: "tasks",
		label: "Create tasks",
		defaultRoles: ["Owner", "Admin", "Member"],
	},
	{
		key: "tasks.manage",
		module: "tasks",
		label: "Manage tasks",
		description: "Update, complete, or delete tasks (and any reminder/follow-up data).",
		defaultRoles: ["Owner", "Admin", "Member"],
	},

	// ── Tags ─────────────────────────────────────────────────────────────────
	{
		key: "tags.view",
		module: "tags",
		label: "View tags",
		defaultRoles: ["Owner", "Admin", "Member", "Viewer"],
	},
	{
		key: "tags.manage",
		module: "tags",
		label: "Manage tags",
		description: "Create and delete org-wide tags.",
		defaultRoles: ["Owner", "Admin"],
	},
	{
		key: "tags.attach",
		module: "tags",
		label: "Apply tags to records",
		defaultRoles: ["Owner", "Admin", "Member"],
	},

	// ── Saved Views ──────────────────────────────────────────────────────────
	{
		key: "savedViews.view",
		module: "savedViews",
		label: "View saved views",
		defaultRoles: ["Owner", "Admin", "Member", "Viewer"],
	},
	{
		key: "savedViews.createPersonal",
		module: "savedViews",
		label: "Create personal views",
		defaultRoles: ["Owner", "Admin", "Member"],
	},
	{
		key: "savedViews.createOrg",
		module: "savedViews",
		label: "Create org-wide views",
		defaultRoles: ["Owner", "Admin"],
	},
	{
		key: "savedViews.delete",
		module: "savedViews",
		label: "Delete saved views",
		defaultRoles: ["Owner", "Admin"],
	},

	// ── Pipelines ────────────────────────────────────────────────────────────
	{
		key: "pipelines.view",
		module: "pipelines",
		label: "View pipelines",
		defaultRoles: ["Owner", "Admin", "Member", "Viewer"],
	},
	{
		key: "pipelines.manage",
		module: "pipelines",
		label: "Manage pipelines and stages",
		defaultRoles: ["Owner", "Admin"],
	},

	// ── Custom Fields ────────────────────────────────────────────────────────
	{
		key: "fieldDefinitions.view",
		module: "fields",
		label: "View custom fields",
		defaultRoles: ["Owner", "Admin", "Member", "Viewer"],
	},
	{
		key: "fieldDefinitions.manage",
		module: "fields",
		label: "Manage custom fields",
		defaultRoles: ["Owner", "Admin"],
	},

	// ── AI Assistant ─────────────────────────────────────────────────────────
	{
		key: "ai.use",
		module: "ai",
		label: "Use AI assistant",
		defaultRoles: ["Owner", "Admin", "Member"],
	},
	{
		key: "ai.manageTools",
		module: "ai",
		label: "Enable / disable AI tools",
		defaultRoles: ["Owner", "Admin"],
	},
	{
		key: "ai.viewHistory",
		module: "ai",
		label: "View AI history",
		defaultRoles: ["Owner", "Admin", "Member", "Viewer"],
	},
	{
		key: "ai.byokOrg",
		module: "ai",
		label: "Manage org-level AI API keys (BYOK)",
		description: "Add, remove, and rotate API keys that apply to the whole workspace.",
		defaultRoles: ["Owner"],
	},
	{
		key: "ai.byokUser",
		module: "ai",
		label: "Manage own AI API key",
		description: "Add or remove their own personal API key (user-scope BYOK).",
		defaultRoles: ["Owner", "Admin", "Member"],
	},
	{
		key: "ai.briefingRefresh",
		module: "ai",
		label: "Manually refresh AI morning briefing",
		description: "Triggers an immediate re-generation. Counts against message quota.",
		defaultRoles: ["Owner", "Admin", "Member"],
	},
	{
		key: "ai.expandTools",
		module: "ai",
		label: "Use advanced AI tool layers",
		description: "Allow AI to load expanded tool sets (pipelines, fields, settings, bulk ops).",
		defaultRoles: ["Owner", "Admin", "Member"],
	},
	{
		// Stage 7 — analytical layer (`/SPRINT-PLAN.md` Stage 7).
		// Gates the `analyze_metric` AI tool + the upcoming pipeline-
		// velocity dashboard. Read-only "explain why" — distinct from
		// `members.viewPerformance` (which exposes per-person numbers).
		// Member-eligible by default so individual contributors can ask
		// "why did pipeline value drop?".
		key: "ai.analytics.viewMetrics",
		module: "ai",
		label: "Use AI analytical tools",
		description:
			"Allow AI to run analyze_metric / cohort_analysis / pipeline-velocity narrative passes.",
		defaultRoles: ["Owner", "Admin", "Member"],
	},
	{
		// Stage 7 — analytical layer. Gates the `cohort_analysis` AI tool
		// + the cohort dashboard surface. Cohort rollups expose lead-source
		// / industry / owner conversion rates so we keep this manager-only
		// by default.
		key: "ai.cohorts.view",
		module: "ai",
		label: "View AI cohort reports",
		description:
			"Lead-source / industry / owner conversion + avg-deal-value rollups generated nightly.",
		defaultRoles: ["Owner", "Admin"],
	},
	{
		// Stage 7 — analytical layer. Gates the `view_ai_trace` UI route +
		// `getToolTraceForConversation` query. Read-only audit trail of
		// every tool call in a conversation; matches the conversations
		// trust-gate (org member can see conversations they own; admins
		// can see all via `messages.viewAll` — but trace is conversation-
		// scoped, not message-scoped, so we keep its own key).
		key: "ai.trace.view",
		module: "ai",
		label: "View AI tool traces",
		description: "See the full chain of tool calls for any AI conversation in this workspace.",
		defaultRoles: ["Owner", "Admin", "Member"],
	},
	{
		// B.39 — gates the audit-feed UI at `/{orgSlug}/ai/audit` and the
		// underlying `listAuditFeed` query. The feed is org-wide ("what
		// did the AI do today?") so we keep this manager-only by default;
		// individual contributors get conversation-scoped trace via
		// `ai.trace.view` instead. Members can be granted `ai.audit.view`
		// on a custom role when an org wants broader transparency.
		key: "ai.audit.view",
		module: "ai",
		label: "View AI audit feed",
		description:
			"Org-wide chronological feed of every AI capability call (filterable by source, status, risk, principal).",
		defaultRoles: ["Owner", "Admin"],
	},
	{
		// Stage 8 — autonomous layer (`/SPRINT-PLAN.md` Stage 8). Gate
		// for the standing-orders editor + per-user autonomy toggles +
		// the standing-orders runner that fires LLM workflows on a
		// schedule. Manager-only by default — these workflows can drive
		// real CRM writes (followups, enrichments) without a human in
		// the loop, so we restrict who can configure them. The runner
		// itself ALSO checks the OWNER's permissions via
		// `requireOrgMemberByIds` so autonomy never escalates beyond
		// the user it runs as.
		key: "ai.automation.manage",
		module: "ai",
		label: "Manage AI automation",
		description:
			"Create, edit, and toggle AI standing orders + per-user autonomous-action allow-lists.",
		defaultRoles: ["Owner", "Admin"],
	},
	{
		// S15 — gates the master toggle for the WhatsApp Agent Profile
		// (Mode C). Holding the key lets a member flip
		// `org.settings.aiAutonomy.whatsappAgentEnabled` ON, which lets the
		// `wa_profile` persona reply to customers from a `mode:"profile"`
		// Twilio number. The persona itself runs under a per-org service
		// member; this key is the human-side authorisation, NOT the
		// persona's RBAC. Owner+Admin only by default — turning autonomous
		// customer replies on is a high-blast-radius decision (compliance,
		// brand, escalation routing) so we keep it manager-only.
		key: "ai.whatsappAgent",
		module: "ai",
		label: "Manage WhatsApp AI persona",
		description:
			"Toggle the WhatsApp Agent Profile (Mode C) on/off; the persona stays OFF by default and only acts inside the per-conversation rate limit.",
		defaultRoles: ["Owner", "Admin"],
	},

	{
		// S16 — gates issuing/listing/revoking the personal access tokens
		// that power the MCP + REST projectors. A token executes under the
		// ISSUING member's RBAC, so this permission is the meta-control:
		// who in an org may turn one of THEIR seats into an external
		// programmatic surface. Owner+Admin by default — a Member who
		// holds it can mint a token but never escalates beyond what their
		// own role can do (the registry's runCapability gate is the truth).
		key: "ai.apiTokens.manage",
		module: "ai",
		label: "Manage AI API tokens",
		description:
			"Issue / list / revoke personal access tokens that authenticate this member's seat against the MCP + REST projectors. Tokens execute under the issuing member's RBAC.",
		defaultRoles: ["Owner", "Admin"],
	},

	// ── Activity Logs ────────────────────────────────────────────────────────
	{
		key: "activityLogs.viewOrg",
		module: "activityLogs",
		label: "View org activity log",
		defaultRoles: ["Owner", "Admin"],
	},
	{
		key: "activityLogs.viewOwn",
		module: "activityLogs",
		label: "View own activity",
		defaultRoles: ["Owner", "Admin", "Member", "Viewer"],
	},

	// ── Notifications ────────────────────────────────────────────────────────
	{
		key: "notifications.viewOwn",
		module: "notifications",
		label: "View own notifications",
		defaultRoles: ["Owner", "Admin", "Member", "Viewer"],
	},
	{
		key: "notifications.markRead",
		module: "notifications",
		label: "Mark notifications read",
		defaultRoles: ["Owner", "Admin", "Member", "Viewer"],
	},

	// ── Files ────────────────────────────────────────────────────────────────
	{
		key: "files.view",
		module: "files",
		label: "View files",
		defaultRoles: ["Owner", "Admin", "Member", "Viewer"],
	},
	{
		key: "files.upload",
		module: "files",
		label: "Upload files",
		defaultRoles: ["Owner", "Admin", "Member"],
	},
	{
		key: "files.delete",
		module: "files",
		label: "Delete own files",
		description: "Delete files the user uploaded.",
		defaultRoles: ["Owner", "Admin", "Member"],
	},
	{
		key: "files.deleteAny",
		module: "files",
		label: "Delete any file",
		description: "Moderator-level — remove other members' files.",
		defaultRoles: ["Owner", "Admin"],
	},

	// ── Data & privacy ──────────────────────────────────────────────────────
	{
		key: "data.viewTrash",
		module: "data",
		label: "View trash",
		description: "See deleted records pending purge.",
		defaultRoles: ["Owner"],
	},
	{
		key: "data.restore",
		module: "data",
		label: "Restore deleted records",
		description: "Bring soft-deleted records back from trash.",
		defaultRoles: ["Owner"],
	},
	{
		key: "data.export",
		module: "data",
		label: "Export data",
		description: "Generate a GDPR data bundle.",
		defaultRoles: ["Owner"],
	},
	{
		// S10 — destructive AI capabilities. The bulk/import/hard-delete
		// AI capabilities all gate on this key + 2FA step-up + the channel
		// allow-list (never WhatsApp). See `convex/ai/registry/gate.ts`.
		key: "data.bulkActions",
		module: "data",
		label: "Run bulk data actions",
		description:
			"Bulk update / delete / close many records at once via the AI assistant. Owner / Admin only.",
		defaultRoles: ["Owner", "Admin"],
	},
	{
		key: "data.import",
		module: "data",
		label: "Import data from CSV",
		description: "Bulk-create records from a CSV upload via the AI assistant.",
		defaultRoles: ["Owner", "Admin"],
	},
	{
		key: "data.hardDelete",
		module: "data",
		label: "Permanently delete records",
		description:
			"Bypass trash and physically remove a record. Irreversible — Owner only by default.",
		defaultRoles: ["Owner"],
	},
] as const;

/** All permission keys as a typed string union (compile-time safety for callers). */
export type PermissionKey = (typeof PERMISSION_CATALOG)[number]["key"];

/** Flat list of every permission key — used to validate roles at write time. */
export const ALL_PERMISSION_KEYS: readonly string[] = PERMISSION_CATALOG.map((p) => p.key);

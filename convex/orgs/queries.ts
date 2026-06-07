/**
 * Org queries.
 *
 * PATTERN EXPLANATION:
 *   All public org queries use `authenticatedQuery` or `orgQuery` (Rule R2).
 *   Both are identical wrappers (orgQuery is the org-scoped naming convention).
 *   They inject `ctx.user` and `ctx.userId` before the handler runs.
 *
 *   Org membership is verified INSIDE the handler with `.withIndex()` (Rule R4)
 *   rather than `.filter()`. This is production-grade because:
 *   (1) indexes push filtering to the storage layer — O(log n) not O(n),
 *   (2) no full table scans means the function stays within Convex's
 *       transaction read budget even when `orgMembers` grows to thousands of rows.
 *
 * Sources:
 * - https://github.com/get-convex/convex-saas/blob/main/convex/organizations.ts
 * - https://github.com/dbjpanda/convex-tenants/blob/main/example/convex/tenants.ts
 * - https://github.com/get-convex/convex-helpers/blob/main/packages/convex-helpers/server/customFunctions.ts
 */
import { v } from "convex/values";
import {
	authenticatedQuery,
	orgQuery,
	requireOrgMemberByIds,
	superAdminQuery,
} from "../_functions/authenticated";
import type { Id } from "../_generated/dataModel";
import { internalQuery, type QueryCtx } from "../_generated/server";
import { readAllOrgStats } from "../_shared/orgStats";
import { resolveRecordScope } from "../_shared/permissions/recordScope";
import { getOrgById, getUserOrgs } from "./helpers";

/**
 * Check if a slug is available. Returns true if available, false if taken.
 * Used by onboarding to validate slug uniqueness as the user types.
 */
export const checkSlug = authenticatedQuery({
	args: { slug: v.string() },
	handler: async (ctx, args) => {
		const existing = await ctx.db
			.query("orgs")
			.withIndex("by_slug", (q) => q.eq("slug", args.slug))
			.unique();
		return { available: existing === null };
	},
});

/**
 * Get full org settings for the settings page.
 * Returns all fields needed by the settings UI in a single query.
 * Requires org membership (any role can read settings — RBAC is enforced per-section in UI).
 */
export const getFullSettings = orgQuery({
	args: { orgId: v.id("orgs") },
	handler: async (ctx, args) => {
		const member = await ctx.db
			.query("orgMembers")
			.withIndex("by_orgId_and_userId", (q) =>
				q.eq("orgId", args.orgId).eq("userId", ctx.userId),
			)
			.first();
		if (!member || member.deletedAt !== undefined) return null;

		const org = await ctx.db.get(args.orgId);
		if (!org) return null;
		return {
			_id: org._id,
			name: org.name,
			slug: org.slug,
			logoStorageId: org.logoStorageId,
			industry: org.industry,
			plan: org.plan,
			entityLabels: org.entityLabels,
			settings: org.settings,
		};
	},
});

/**
 * List all orgs the current user is an active member of.
 *
 * HOW IT WORKS:
 *   1. `authenticatedQuery` wrapper injects `ctx.userId` (verified JWT identity).
 *   2. `getUserOrgs(ctx, ctx.userId)` queries `orgMembers` via the `by_userId` index
 *      — returns up to 100 memberships (bounded by `.take(100)`, Rule R5).
 *   3. For each active membership, fetches the `orgs` doc and merges it into the result.
 *
 * WHY NOT pass userId from client (Rule R3):
 *   `ctx.userId` comes from the validated JWT — impossible to spoof.
 *
 * RETURN: Array of `{ ...orgMember, org: Doc<"orgs"> }` — includes role, joinedAt, etc.
 */
export const listMyOrgs = authenticatedQuery({
	args: {},
	handler: async (ctx) => {
		return await getUserOrgs(ctx, ctx.userId);
	},
});

/**
 * Get a specific org by ID. Returns null if the calling user is not a member.
 *
 * HOW IT WORKS:
 *   1. Verifies org membership via `by_orgId_and_userId` compound index (Rule R4).
 *      This is O(log n) — no table scan.
 *   2. Returns null (not an error) if the user is not a member, so the client
 *      can redirect gracefully rather than crashing on a ConvexError.
 *   3. Returns the org document only if membership is confirmed.
 *
 * WHY return null instead of throwing:
 *   Clients often check `if (!org) redirect("/dashboard")` — throwing would require
 *   try/catch wrappers on every callsite. Null is cleaner for "access denied" on reads.
 */
export const get = orgQuery({
	args: { orgId: v.id("orgs") },
	handler: async (ctx, args) => {
		const member = await ctx.db
			.query("orgMembers")
			.withIndex("by_orgId_and_userId", (q) =>
				q.eq("orgId", args.orgId).eq("userId", ctx.userId),
			)
			.first();

		if (!member || member.deletedAt !== undefined) return null;

		return await getOrgById(ctx, args.orgId);
	},
});

/**
 * List all active members of an org (with their user profile).
 *
 * HOW IT WORKS:
 *   1. Confirms the calling user is an active member before listing (access control).
 *   2. Queries `orgMembers` via `by_orgId_and_userId` with only the orgId prefix —
 *      this returns all members of the org, bounded at 100 (Rule R5).
 *   3. For each active member, fetches the user document and merges it in.
 *
 * WHY bounded at 100:
 *   No org in Phase 0 is expected to exceed 100 members. When the team-management
 *   feature is built, this query will be replaced with a paginated version.
 *
 * RETURN: Array of `{ ...orgMember, user: Doc<"users"> }` — includes role, joinedAt, etc.
 */
export const listMembers = orgQuery({
	args: { orgId: v.id("orgs") },
	handler: async (ctx, args) => {
		const membership = await ctx.db
			.query("orgMembers")
			.withIndex("by_orgId_and_userId", (q) =>
				q.eq("orgId", args.orgId).eq("userId", ctx.userId),
			)
			.first();

		if (!membership || membership.deletedAt !== undefined) return [];

		return listMembersImpl(ctx, args.orgId);
	},
});

/**
 * Shared implementation reused by both the public `listMembers` and the
 * AI-callable `listMembersForAI` twin. Caller is responsible for membership
 * verification before invoking this helper.
 */
async function listMembersImpl(ctx: QueryCtx, orgId: Id<"orgs">) {
	const members = await ctx.db
		.query("orgMembers")
		.withIndex("by_orgId_and_userId", (q) => q.eq("orgId", orgId))
		.take(100);

	const result = [];
	for (const m of members) {
		if (m.deletedAt !== undefined) continue;
		const memberUser = await ctx.db.get(m.userId);
		if (!memberUser || memberUser.deletedAt !== undefined) continue;
		// Resolve the storage-backed avatar to a URL if one isn't already set.
		// Avoids "UM" initials-only rendering for users who uploaded a photo.
		let avatarUrl = memberUser.avatarUrl;
		if (!avatarUrl && memberUser.avatarStorageId) {
			avatarUrl = (await ctx.storage.getUrl(memberUser.avatarStorageId)) ?? undefined;
		}
		result.push({ ...m, user: { ...memberUser, avatarUrl } });
	}
	return result;
}

/** AI-callable internal twin of `listMembers`. Adds top-level `name`/`email` so
 * `list_members` tool can read without re-typing the nested `user`. */
export const listMembersForAI = internalQuery({
	args: { orgId: v.id("orgs"), userId: v.id("users") },
	handler: async (ctx, args) => {
		await requireOrgMemberByIds(ctx, args.orgId, args.userId);
		const rows = await listMembersImpl(ctx, args.orgId);
		return rows.map((m) => ({
			...m,
			name: m.user.name,
			email: m.user.email,
		}));
	},
});

/**
 * AI-callable internal twin that returns the org's `settings.modules` array.
 *
 * Why a dedicated query instead of forwarding `getFullSettings`: tools that
 * need to read-merge-write the modules array (e.g. `set_entity_default_view`)
 * only need this one slice. Returning the whole settings object would push
 * dozens of unrelated keys (rateLimits, mockData stamps, briefingDefaults,
 * etc.) through the agent's context budget for every read.
 *
 * Returns `[]` when the org has no modules yet — the writer rebuilds the
 * array from scratch using the entity slot list as the source of truth.
 */
export const getOrgModulesForAI = internalQuery({
	args: { orgId: v.id("orgs"), userId: v.id("users") },
	handler: async (ctx, args) => {
		await requireOrgMemberByIds(ctx, args.orgId, args.userId);
		const org = await ctx.db.get(args.orgId);
		if (!org) return [];
		const modules = (org.settings?.modules ?? []) as Array<{
			slot: string;
			label?: string;
			hidden?: boolean;
			order?: number;
			defaultView?: "list" | "board";
			cardFields?: string[];
			listColumns?: string[];
			boardGroupBy?: string;
			defaultFilters?: string[];
			meta?: unknown;
		}>;
		return modules;
	},
});

/**
 * AI-callable read returning the list of entity-type slot keys the org
 * has enabled. Drives `_shared/entityTypes.ts:loadEnabledEntityTypes`,
 * which in turn powers every dynamic entityType validation in the AI
 * capability layer.
 *
 *   - Reads `org.settings.modules[]` — slots with `hidden:true` are
 *     dropped so a workspace that hides a slot also hides it from the
 *     AI's input surface.
 *   - Falls back to the four CORE types (lead/contact/deal/company)
 *     when the org has not customised `modules` yet OR when every
 *     module is hidden — matches the entity-scaffolds behaviour for
 *     unconfigured workspaces.
 *   - Industry slots `entity5` / `entity6` show up here ONLY when the
 *     industry template's seed inserted a module entry for them or an
 *     admin enabled them via the modules editor.
 *
 * Why a dedicated query (vs reusing `getOrgModulesForAI`): the
 * entity-type validator only needs the slot KEYS, and reading them
 * here (vs deriving on the JS side) keeps the validator pure and
 * lets `loadEnabledEntityTypes` cache the read transparently across
 * capabilities in one turn.
 */
export const getEnabledEntityTypesForAI = internalQuery({
	args: { orgId: v.id("orgs"), userId: v.id("users") },
	handler: async (ctx, args) => {
		await requireOrgMemberByIds(ctx, args.orgId, args.userId);
		const org = await ctx.db.get(args.orgId);
		if (!org) return ["lead", "contact", "deal", "company"];
		const moduleSlots = (org.settings?.modules ?? []) as Array<{
			slot: string;
			hidden?: boolean;
		}>;
		const enabled = moduleSlots
			.filter((m) => m.hidden !== true && typeof m.slot === "string" && m.slot.length > 0)
			.map((m) => m.slot);
		// Fall back to the four CORE types when no modules are configured.
		if (enabled.length === 0) {
			return ["lead", "contact", "deal", "company"];
		}
		return enabled;
	},
});

/**
 * AI-callable read returning the org's effective task-type catalog.
 *
 * Resolution order:
 *   1. `org.settings.taskTypes[]` — when admin configured a custom set.
 *   2. The 5 SYSTEM defaults (`todo`, `call`, `email`, `meeting`,
 *      `followup`) — every workspace inherits these unless overridden.
 *
 * Each row carries `id` (storage key — what the mutation persists),
 * `label` (the user-facing name), and optional `labelAr` (Arabic
 * translation for RTL UIs). Returning the full row shape (vs just
 * the ids) lets the AI capability surface a richer repair envelope
 * when the model picks a wrong id.
 *
 * Workspaces that want to add a custom type (e.g. "demo", "site_visit")
 * append an entry to `settings.taskTypes`; existing tasks aren't
 * migrated. The capability writer rebuilds the array from scratch each
 * time so removed types simply disappear from the AI surface but old
 * task rows keep their original `type` value verbatim.
 */
export const getEffectiveTaskTypesForAI = internalQuery({
	args: { orgId: v.id("orgs"), userId: v.id("users") },
	handler: async (ctx, args) => {
		await requireOrgMemberByIds(ctx, args.orgId, args.userId);
		const org = await ctx.db.get(args.orgId);
		const SYSTEM_DEFAULTS: Array<{ id: string; label: string; labelAr?: string }> = [
			{ id: "todo", label: "To-do" },
			{ id: "call", label: "Call" },
			{ id: "email", label: "Email" },
			{ id: "meeting", label: "Meeting" },
			{ id: "followup", label: "Follow-up" },
		];
		if (!org) return SYSTEM_DEFAULTS;
		const settings = org.settings as
			| {
					taskTypes?: Array<{ id?: unknown; label?: unknown; labelAr?: unknown }>;
			  }
			| undefined;
		const custom = settings?.taskTypes;
		if (!Array.isArray(custom) || custom.length === 0) return SYSTEM_DEFAULTS;
		const cleaned = custom
			.map((row) => ({
				id: typeof row.id === "string" ? row.id : "",
				label: typeof row.label === "string" ? row.label : "",
				labelAr: typeof row.labelAr === "string" ? row.labelAr : undefined,
			}))
			.filter((row) => row.id.length > 0 && row.label.length > 0);
		return cleaned.length > 0 ? cleaned : SYSTEM_DEFAULTS;
	},
});

/**
 * AI-callable read of `org.entityLabels` + the enabled-modules slice the AI
 * needs to introspect the workspace shape. Used by `describe_workspace`.
 * Returns the same fallback-defaulted shape as the public `getEntityLabels`
 * query plus a flat list of enabled module slots.
 */
export const getWorkspaceShapeForAI = internalQuery({
	args: { orgId: v.id("orgs"), userId: v.id("users") },
	handler: async (ctx, args) => {
		await requireOrgMemberByIds(ctx, args.orgId, args.userId);
		const org = await ctx.db.get(args.orgId);
		if (!org) return null;
		const l = org.entityLabels;
		const labels = {
			lead: {
				singular: l?.lead?.singular ?? "Lead",
				plural: l?.lead?.plural ?? "Leads",
				slug: l?.lead?.slug ?? "leads",
			},
			contact: {
				singular: l?.contact?.singular ?? "Contact",
				plural: l?.contact?.plural ?? "Contacts",
				slug: l?.contact?.slug ?? "contacts",
			},
			deal: {
				singular: l?.deal?.singular ?? "Deal",
				plural: l?.deal?.plural ?? "Deals",
				slug: l?.deal?.slug ?? "deals",
			},
			company: {
				singular: l?.company?.singular ?? "Company",
				plural: l?.company?.plural ?? "Companies",
				slug: l?.company?.slug ?? "companies",
			},
		};
		const modules = (
			(org.settings?.modules ?? []) as Array<{
				slot: string;
				label?: string;
				hidden?: boolean;
			}>
		)
			.filter((m) => m.hidden !== true)
			.map((m) => ({ slot: m.slot, label: m.label }));
		return { labels, modules };
	},
});

/**
 * AI-callable read of the org's IANA timezone string.
 *
 * Used by scheduling capabilities (tasks, reminders, calendar events) to
 * coerce natural-language dates ("next Tuesday", "tomorrow 9am") into an
 * absolute epoch in the org's local time. The capability layer's
 * `field.timestampLazy()` deliberately defers timezone resolution to the
 * server because it is per-tenant — fixing it at schema-build time would
 * require a per-org schema, which is incompatible with prompt caching.
 *
 * Returns `"UTC"` when the org doc is missing or has no `settings.timezone`
 * — never throws / never returns null. Callers can rely on this contract.
 *
 * Sensitive? No — the timezone is workspace-public; every member sees it
 * already on dashboards and timeline rendering.
 */
export const getTimezoneForAI = internalQuery({
	args: { orgId: v.id("orgs"), userId: v.id("users") },
	handler: async (ctx, args) => {
		await requireOrgMemberByIds(ctx, args.orgId, args.userId);
		const org = await ctx.db.get(args.orgId);
		const tz = (org?.settings as { timezone?: unknown } | undefined)?.timezone;
		return typeof tz === "string" && tz.length > 0 ? tz : "UTC";
	},
});

/**
 * AI-callable read returning the small `OrgSnapshot` slice the registry's
 * module + vertical gates need (`convex/ai/registry/modules.ts:OrgSnapshot`).
 * Loaded once per turn from `runtime/host.ts`. Keep the shape narrow so the
 * cached prefix never depends on per-tenant data — only the per-turn TAIL.
 *
 * `hiddenSlots` is derived from `org.settings.modules[]` where `hidden ===
 * true`. Other module keys (pipelines, fields, …) inherit "default-on" and
 * appear in `hiddenSlots` only when a future settings UI explicitly hides
 * them — the registry treats unregistered module keys as enabled regardless.
 */
export const getOrgSnapshotForAI = internalQuery({
	args: { orgId: v.id("orgs"), userId: v.id("users") },
	handler: async (ctx, args) => {
		await requireOrgMemberByIds(ctx, args.orgId, args.userId);
		const org = await ctx.db.get(args.orgId);
		if (!org) {
			return {
				hiddenSlots: [] as string[],
				industryKey: undefined as string | undefined,
				entityLabels: undefined as
					| {
							lead?: { singular: string; plural: string };
							contact?: { singular: string; plural: string };
							deal?: { singular: string; plural: string };
							company?: { singular: string; plural: string };
					  }
					| undefined,
				currency: undefined as string | undefined,
			};
		}
		const moduleSlots = (org.settings?.modules ?? []) as Array<{
			slot: string;
			hidden?: boolean;
		}>;
		const hiddenSlots = moduleSlots
			.filter((m) => m.hidden === true)
			.map((m) => m.slot)
			.filter((s): s is string => typeof s === "string" && s.length > 0);
		const labels = org.entityLabels;
		const entityLabels = labels
			? {
					lead: labels.lead
						? { singular: labels.lead.singular, plural: labels.lead.plural }
						: undefined,
					contact: labels.contact
						? { singular: labels.contact.singular, plural: labels.contact.plural }
						: undefined,
					deal: labels.deal
						? { singular: labels.deal.singular, plural: labels.deal.plural }
						: undefined,
					company: labels.company
						? { singular: labels.company.singular, plural: labels.company.plural }
						: undefined,
				}
			: undefined;
		const settings = org.settings as { defaultCurrency?: unknown } | undefined;
		const currency =
			typeof settings?.defaultCurrency === "string" && settings.defaultCurrency.length > 0
				? settings.defaultCurrency
				: undefined;
		return {
			hiddenSlots,
			industryKey:
				typeof org.industry === "string" && org.industry.length > 0
					? org.industry
					: undefined,
			entityLabels,
			currency,
		};
	},
});

/**
 * Get the current user's membership in a specific org.
 *
 * HOW IT WORKS:
 *   1. `authenticatedQuery` wrapper injects `ctx.userId` (verified JWT).
 *   2. Queries `orgMembers` via the `by_orgId_and_userId` compound index — O(log n).
 *   3. Returns the membership doc (role, joinedAt, etc.) or null if not a member.
 *
 * WHY THIS EXISTS:
 *   `listMembers` fetches ALL members + their user profiles — O(n) reads.
 *   The frontend `useOrgPermission` hook only needs the CURRENT user's role.
 *   This query returns a single membership row — O(1) after index lookup.
 *
 * PERMISSIONS RESOLUTION:
 *   `orgMembers.permissions` is an OPTIONAL override field that's almost
 *   never set in production — `createOrg` only writes `roleId`. The real
 *   SSOT is `orgRoles.permissions`. We resolve it here so the returned
 *   `permissions` field is always populated, matching what backend handlers
 *   see via `getOrgMember(...)`. Otherwise every frontend permission check
 *   that reads `myMembership.permissions` silently evaluates to `false`,
 *   even for the org Owner.
 *
 * RETURN: `Doc<"orgMembers"> | null` — `permissions` is always present.
 */
export const getMyMembership = authenticatedQuery({
	args: { orgId: v.id("orgs") },
	handler: async (ctx, args) => {
		const member = await ctx.db
			.query("orgMembers")
			.withIndex("by_orgId_and_userId", (q) =>
				q.eq("orgId", args.orgId).eq("userId", ctx.userId),
			)
			.first();

		if (!member || member.deletedAt !== undefined) return null;

		// Resolve permissions from the role doc (SSOT). Per-member overrides
		// in `member.permissions` are honoured if present, otherwise fall
		// back to the role's catalog-derived list.
		const role = await ctx.db.get(member.roleId);
		const permissions = member.permissions ?? role?.permissions ?? [];

		return { ...member, permissions };
	},
});

/**
 * Internal: get org by ID. No auth check — for server-side use only.
 *
 * HOW IT WORKS:
 *   Direct `ctx.db.get(orgId)` — O(1) lookup. Returns null if not found.
 *
 * WHY `internalQuery` (Rule R6):
 *   Used by cron jobs, notification helpers, and activity log helpers that need
 *   an org doc without going through membership verification.
 */
export const getInternal = internalQuery({
	args: { orgId: v.id("orgs") },
	handler: async (ctx, args) => {
		return await ctx.db.get(args.orgId);
	},
});

/**
 * Super admin only: list ALL orgs in the platform.
 *
 * WHAT THIS DOES:
 *   Returns a paginated list of all orgs across the entire platform.
 *   Restricted to platform super_admin only — no org member can call this.
 *
 * HOW IT WORKS:
 *   `superAdminQuery` wrapper calls `resolveSuperAdmin()` before the handler.
 *   If the user does not have `platformRole === "super_admin"`, the handler
 *   never runs — ConvexError(SUPER_ADMIN_REQUIRED) is thrown.
 *
 * WHY BOUNDED WITH .take(100):
 *   Prevents runaway reads on large deployments. Super admin dashboard
 *   should paginate using the cursor from paginationOpts.
 *
 * Ref: .github/agents/base/rbac.md — Super Admin
 */
export const listAll = superAdminQuery({
	args: {},
	handler: async (ctx) => {
		return await ctx.db.query("orgs").order("desc").take(100);
	},
});

/**
 * Get entity labels for the current org.
 * Returns configured labels with fallbacks to defaults.
 * Used by nav, list pages, and any component that shows entity names.
 */
export const getEntityLabels = orgQuery({
	args: { orgId: v.id("orgs") },
	handler: async (ctx, args) => {
		const member = await ctx.db
			.query("orgMembers")
			.withIndex("by_orgId_and_userId", (q) =>
				q.eq("orgId", args.orgId).eq("userId", ctx.userId),
			)
			.first();
		if (!member || member.deletedAt !== undefined) return null;

		const org = await ctx.db.get(args.orgId);
		if (!org) return null;

		const l = org.entityLabels;
		return {
			lead: {
				singular: l?.lead?.singular ?? "Lead",
				plural: l?.lead?.plural ?? "Leads",
				slug: l?.lead?.slug ?? "leads",
			},
			contact: {
				singular: l?.contact?.singular ?? "Contact",
				plural: l?.contact?.plural ?? "Contacts",
				slug: l?.contact?.slug ?? "contacts",
			},
			deal: {
				singular: l?.deal?.singular ?? "Deal",
				plural: l?.deal?.plural ?? "Deals",
				slug: l?.deal?.slug ?? "deals",
			},
			company: {
				singular: l?.company?.singular ?? "Company",
				plural: l?.company?.plural ?? "Companies",
				slug: l?.company?.slug ?? "companies",
			},
		};
	},
});

/**
 * Get dashboard stats for the current org.
 *
 * READS DENORMALISED COUNTERS (production-grade)
 * ──────────────────────────────────────────────
 * The aggregate counts live in the `orgStats` table, written by every CRM
 * mutation via `applyOrgStat`. This query is O(1 + members) — no scan over
 * leads/contacts/deals. Drift recovery is handled by the canonical
 * `recomputeOrgStats` internal mutation in `_shared/orgStats.ts`, scheduled
 * weekly by the cron in `convex/crons.ts`.
 *
 * Recent activity stays as a small index lookup on activityLogs.
 * Reminders-due-today still reads off `by_org_and_status_and_due` — accurate
 * to the minute because reminders are time-based, not counter-friendly.
 */
export const getDashboardStats = orgQuery({
	args: {
		orgId: v.id("orgs"),
		/**
		 * Stage 7 of /DASHBOARD-V2-PLAN.md (2026-05-29) — recent
		 * activity row limit, configurable per-call. Default 10
		 * (matches the previous hardcoded `.take(10)`); clamped to
		 * `[1, 50]` so a misbehaving caller can't request a huge slice
		 * via this endpoint. Callers that want more should drive the
		 * full timeline page instead. Optional + clamped → backwards
		 * compatible with existing callers that don't supply a value.
		 */
		recentActivityLimit: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
		const member = await ctx.db
			.query("orgMembers")
			.withIndex("by_orgId_and_userId", (q) =>
				q.eq("orgId", args.orgId).eq("userId", ctx.userId),
			)
			.first();
		if (!member || member.deletedAt !== undefined) return null;

		const org = await ctx.db.get(args.orgId);
		if (!org) return null;

		// Resolve permissions for record-scope (B.45). Members without
		// `records.viewAll` see only stats for rows they're assigned to;
		// members with the capability use the fast `orgStats` aggregates.
		const role = await ctx.db.get(member.roleId);
		const permissions = (member.permissions ?? role?.permissions ?? []) as string[];
		const scope = resolveRecordScope(permissions, ctx.userId);

		const now = Date.now();
		const oneDayMs = 86_400_000;
		const sevenDaysAgo = now - 7 * oneDayMs;
		const startOfDay = new Date();
		startOfDay.setHours(0, 0, 0, 0);
		const startOfDayMs = startOfDay.getTime();

		// Clamp the activity limit so a misbehaving caller can't issue a
		// huge `.take()` via this endpoint. The default mirrors the
		// previous hardcoded behaviour.
		const requestedLimit = args.recentActivityLimit ?? 10;
		const activityLimit = Math.max(1, Math.min(50, Math.floor(requestedLimit)));

		// Branch: full-access members get the O(1) aggregate path;
		// scoped members get the assigned-only path that walks
		// `by_org_and_assignee` per entity. The scoped path is bounded
		// (`take(500)` per entity) so a user with 500+ assigned rows
		// reads at most 500 entries each — well within Convex's read
		// budget. For workspaces small enough that the org-wide aggregates
		// are appropriate, the fast path is unchanged.
		let leadCount: number;
		let contactCount: number;
		let dealCount: number;
		let companiesCount: number;
		let pipelineValue: number;
		let dealsWon: number;
		let dealsLost: number;
		let memberCount: number;
		let stats: Record<string, number> = {};

		if (scope.all) {
			// Fast path — read aggregate counters. UNCHANGED (production-
			// grade O(1) per key, no scan).
			stats = await readAllOrgStats(ctx, args.orgId);
			memberCount = stats["members.active"] ?? 0;
			leadCount = stats["leads.open"] ?? 0;
			contactCount = stats["contacts.active"] ?? 0;
			dealCount = stats["deals.open"] ?? 0;
			pipelineValue = stats["deals.pipelineValue"] ?? 0;
			dealsWon = stats["deals.won"] ?? 0;
			dealsLost = stats["deals.lost"] ?? 0;
			companiesCount = stats["companies.active"] ?? 0;
		} else {
			// Per-user path — count rows assigned to the caller via the
			// indexed `by_org_and_assignee` index on each entity. We
			// filter `deletedAt === undefined` in JS (Convex indexes
			// don't natively express undefined) and aggregate the deal
			// `value` for the pipelineValue tile while we're walking.
			//
			// Bounded reads — 500 rows per entity is enough headroom
			// for any individual's book of work; if a user holds more,
			// the count is capped which is acceptable for a dashboard
			// tile (the full list page paginates separately).
			const SCOPED_TAKE = 500;
			const userId = scope.userId;
			const [scopedLeads, scopedContacts, scopedCompanies, scopedDeals] = await Promise.all([
				ctx.db
					.query("leads")
					.withIndex("by_org_and_assignee", (q) =>
						q.eq("orgId", args.orgId).eq("assignedTo", userId),
					)
					.take(SCOPED_TAKE),
				ctx.db
					.query("contacts")
					.withIndex("by_org_and_assignee", (q) =>
						q.eq("orgId", args.orgId).eq("assignedTo", userId),
					)
					.take(SCOPED_TAKE),
				ctx.db
					.query("companies")
					.withIndex("by_org_and_assignee", (q) =>
						q.eq("orgId", args.orgId).eq("assignedTo", userId),
					)
					.take(SCOPED_TAKE),
				ctx.db
					.query("deals")
					.withIndex("by_org_and_assignee", (q) =>
						q.eq("orgId", args.orgId).eq("assignedTo", userId),
					)
					.take(SCOPED_TAKE),
			]);

			leadCount = scopedLeads.filter((r) => r.deletedAt === undefined).length;
			contactCount = scopedContacts.filter((r) => r.deletedAt === undefined).length;
			companiesCount = scopedCompanies.filter((r) => r.deletedAt === undefined).length;

			// Deals — count open / won / lost separately while summing
			// pipelineValue for the OPEN ones (matches the `orgStats`
			// "deals.pipelineValue" semantics — only open deals contribute).
			let openDeals = 0;
			let wonDeals = 0;
			let lostDeals = 0;
			let openPipelineValue = 0;
			for (const deal of scopedDeals) {
				if (deal.deletedAt !== undefined) continue;
				if (deal.wonAt !== undefined) {
					wonDeals += 1;
				} else if (deal.lostAt !== undefined) {
					lostDeals += 1;
				} else {
					openDeals += 1;
					if (typeof deal.value === "number" && deal.value > 0) {
						openPipelineValue += deal.value;
					}
				}
			}
			dealCount = openDeals;
			dealsWon = wonDeals;
			dealsLost = lostDeals;
			pipelineValue = openPipelineValue;

			// `memberCount` is org-wide (it counts the team, not anything
			// the caller "owns"), so even scoped members see the real
			// team headcount. Read it from the aggregate counter.
			stats = await readAllOrgStats(ctx, args.orgId);
			memberCount = stats["members.active"] ?? 0;
		}

		const [remindersDueToday, remindersOverdue, remindersDoneThisWeek, recentActivityRaw] =
			await Promise.all([
				ctx.db
					.query("tasks")
					.withIndex("by_org_and_status_and_due", (q) =>
						q
							.eq("orgId", args.orgId)
							.eq("status", "pending")
							.lte("dueAt", now + oneDayMs),
					)
					.take(scope.all ? 100 : 500)
					.then((rows) =>
						scope.all
							? rows.length
							: rows.filter((r) => r.assignedTo === scope.userId).length,
					),
				ctx.db
					.query("tasks")
					.withIndex("by_org_and_status_and_due", (q) =>
						q.eq("orgId", args.orgId).eq("status", "pending").lt("dueAt", startOfDayMs),
					)
					.take(scope.all ? 200 : 500)
					.then((rows) =>
						scope.all
							? rows.length
							: rows.filter((r) => r.assignedTo === scope.userId).length,
					),
				ctx.db
					.query("tasks")
					.withIndex("by_org_and_status_and_due", (q) =>
						q
							.eq("orgId", args.orgId)
							.eq("status", "completed")
							.gte("dueAt", sevenDaysAgo),
					)
					.take(scope.all ? 200 : 500)
					.then((rows) =>
						scope.all
							? rows.length
							: rows.filter((r) => r.assignedTo === scope.userId).length,
					),
				ctx.db
					.query("activityLogs")
					.withIndex("by_orgId_and_createdAt", (q) => q.eq("orgId", args.orgId))
					.order("desc")
					.take(scope.all ? activityLimit : Math.max(activityLimit * 5, 50)),
			]);

		// For scoped members, filter the org-wide activity feed to rows
		// touching one of THEIR entities. The activity log carries the
		// actor (`userId`) + the affected entity (`entityType`/`entityId`).
		// We surface a row when EITHER:
		//   • the actor IS the caller (their own actions), OR
		//   • the row's `personCode` matches one of the caller's leads/
		//     contacts (best-effort — we already loaded those above).
		// Anything else is filtered out so the user's "Recent activity"
		// widget shows only their book of work.
		let recentActivity = recentActivityRaw;
		if (!scope.all) {
			const ownPersonCodes = new Set<string>();
			// Re-read assigned leads/contacts personCodes for the filter.
			// The earlier reads already returned them — but the variable
			// is only in scope inside the `else` branch above. Cheaper to
			// re-walk the limited set than to refactor for hoisting.
			const [scopedLeadsForFilter, scopedContactsForFilter] = await Promise.all([
				ctx.db
					.query("leads")
					.withIndex("by_org_and_assignee", (q) =>
						q.eq("orgId", args.orgId).eq("assignedTo", scope.userId),
					)
					.take(500),
				ctx.db
					.query("contacts")
					.withIndex("by_org_and_assignee", (q) =>
						q.eq("orgId", args.orgId).eq("assignedTo", scope.userId),
					)
					.take(500),
			]);
			for (const r of scopedLeadsForFilter) {
				if (r.personCode) ownPersonCodes.add(r.personCode);
			}
			for (const r of scopedContactsForFilter) {
				if (r.personCode) ownPersonCodes.add(r.personCode);
			}
			recentActivity = recentActivityRaw
				.filter((row) => {
					// biome-ignore lint/suspicious/noExplicitAny: activityLogs row shape varies; we only need the optional fields.
					const r = row as any;
					if (r.userId === scope.userId) return true;
					if (typeof r.personCode === "string" && ownPersonCodes.has(r.personCode)) {
						return true;
					}
					return false;
				})
				.slice(0, activityLimit);
		}

		return {
			orgName: org.name,
			industry: org.industry ?? "default",
			plan: org.plan,
			memberCount,
			leadCount,
			contactCount,
			dealCount,
			pipelineValue,
			dealsWon,
			dealsLost,
			companiesCount,
			currency: org.settings?.defaultCurrency ?? "USD",
			remindersDueToday,
			// Productivity-shape metrics — read off reminders since the
			// productivity template treats deals-as-tasks but uses
			// reminders for due dates.
			tasksDueToday: remindersDueToday,
			tasksOverdue: remindersOverdue,
			tasksDoneThisWeek: remindersDoneThisWeek,
			recentActivity,
			// B.45 — surfacing scope so consumers (UI tooltip, AI tools)
			// can render "scoped to your assigned records" copy when the
			// caller's role lacks `records.viewAll`.
			scoped: !scope.all,
		};
	},
});

/**
 * Internal query for processChat: get a member's permissions + org plan in one call.
 * Returns null if user is not a member of the org.
 *
 * **2026-05-27 P0.1.1** — extended return shape with
 * `subscriptionStatus` + `currentPeriodEnd` so the AI quota gate
 * (`convex/ai/orchestrator/quotaGate.ts`) can honour `on_trial` (treat
 * as active) and `past_due` (allow for 3 days from period end as
 * grace, then fall back to free-tier rules).
 */
export const getMemberWithPermissions = internalQuery({
	args: { orgId: v.id("orgs"), userId: v.id("users") },
	handler: async (ctx, args) => {
		const org = await ctx.db.get(args.orgId);
		if (!org || org.deletedAt !== undefined) return null;
		const member = await ctx.db
			.query("orgMembers")
			.withIndex("by_orgId_and_userId", (q) =>
				q.eq("orgId", args.orgId).eq("userId", args.userId),
			)
			.first();
		if (!member || member.deletedAt !== undefined) return null;
		const orgRole = await ctx.db.get(member.roleId);
		if (!orgRole) return null;
		return {
			permissions: orgRole.permissions as string[],
			plan: (org.plan as string) ?? "free",
			settings: (org.settings ?? {}) as Record<string, unknown>,
			aiMessagesUsed:
				((org as Record<string, unknown>).aiMessagesUsedThisPeriod as number) ?? 0,
			subscriptionStatus: org.lemonSqueezySubscriptionStatus,
			currentPeriodEnd: org.lemonSqueezyCurrentPeriodEnd,
		};
	},
});

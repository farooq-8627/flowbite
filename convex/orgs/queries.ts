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

		const [stats, remindersDueToday, remindersOverdue, remindersDoneThisWeek, recentActivity] =
			await Promise.all([
				readAllOrgStats(ctx, args.orgId),
				ctx.db
					.query("tasks")
					.withIndex("by_org_and_status_and_due", (q) =>
						q
							.eq("orgId", args.orgId)
							.eq("status", "pending")
							.lte("dueAt", now + oneDayMs),
					)
					.take(100)
					.then((rows) => rows.length),
				ctx.db
					.query("tasks")
					.withIndex("by_org_and_status_and_due", (q) =>
						q.eq("orgId", args.orgId).eq("status", "pending").lt("dueAt", startOfDayMs),
					)
					.take(200)
					.then((rows) => rows.length),
				ctx.db
					.query("tasks")
					.withIndex("by_org_and_status_and_due", (q) =>
						q
							.eq("orgId", args.orgId)
							.eq("status", "completed")
							.gte("dueAt", sevenDaysAgo),
					)
					.take(200)
					.then((rows) => rows.length),
				ctx.db
					.query("activityLogs")
					.withIndex("by_orgId_and_createdAt", (q) => q.eq("orgId", args.orgId))
					.order("desc")
					.take(activityLimit),
			]);

		return {
			orgName: org.name,
			industry: org.industry ?? "default",
			plan: org.plan,
			memberCount: stats["members.active"] ?? 0,
			leadCount: stats["leads.open"] ?? 0,
			contactCount: stats["contacts.active"] ?? 0,
			dealCount: stats["deals.open"] ?? 0,
			pipelineValue: stats["deals.pipelineValue"] ?? 0,
			dealsWon: stats["deals.won"] ?? 0,
			dealsLost: stats["deals.lost"] ?? 0,
			companiesCount: stats["companies.active"] ?? 0,
			currency: org.settings?.defaultCurrency ?? "USD",
			remindersDueToday,
			// Productivity-shape metrics — read off reminders since the
			// productivity template treats deals-as-tasks but uses
			// reminders for due dates.
			tasksDueToday: remindersDueToday,
			tasksOverdue: remindersOverdue,
			tasksDoneThisWeek: remindersDoneThisWeek,
			recentActivity,
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

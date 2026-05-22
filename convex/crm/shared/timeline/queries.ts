/**
 * Timeline queries — convex/crm/shared/timeline/queries.ts
 *
 * Unified Timeline: merges activityLogs + notes + reminders into a single
 * chronological feed. Used in:
 *   - ProfilePage → Timeline tab (scoped to personCode)
 *   - /settings/activity-log → org-wide (admin only)
 *   - /{orgSlug}/timeline (org-wide page)
 *   - Deal/Company detail Timeline tab (entity-scoped)
 *   - Dashboard "Recent activity" widget (org-wide, capped)
 *
 * UI spec (saas-ui pattern, locked 2026-05-19):
 *   - One continuous left rail connecting every entry.
 *   - Two visual shapes per entry:
 *       - "bare"  : avatar + inline text "X created the contact. · 3d ago"
 *       - "card"  : bordered card with header + content body (notes / messages / reminders)
 *       - "node"  : tiny ring node for status changes / system events
 *   - Newest at the bottom; first paint scrolls to bottom; scroll up loads older.
 *
 * Each entry is tagged with `_entryType` ("activity" | "note" | "reminder")
 * and `_kind` ("bare" | "card" | "node") so the frontend renderer can switch
 * without reasoning about the original shape.
 *
 * Event type → color mapping (for UI):
 *   created      → blue    (#3b82f6)
 *   stage_change → purple  (#8b5cf6)
 *   note         → yellow  (#eab308)
 *   reminder     → orange  (#f97316)
 *   ai_action    → indigo  (#6366f1)
 *   whatsapp     → green   (#22c55e)
 *   system       → gray    (#6b7280)
 */
import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import { orgQuery, requireOrgMember } from "../../../_functions/authenticated";
import { hasPermission, requireRole } from "../../../_shared/permissions";

/** Unified timeline entry shape returned to the frontend */
type TimelineEntryType = "activity" | "note" | "reminder";
type TimelineEntryKind = "bare" | "card" | "node";

/**
 * Decide which visual kind an activity-log entry should render as.
 *
 * Rules (see CODE-ARCHITECTURE-TIMELINE-FOLLOWUPS.md §4.2):
 *   - Status / stage / converted → tiny "node" (just a circle on the rail)
 *   - Everything else            → "bare" line (avatar + inline text)
 */
function resolveActivityKind(action: string): TimelineEntryKind {
	if (
		action.includes("status") ||
		action.includes("stage") ||
		action.includes("converted") ||
		action.startsWith("system.")
	) {
		return "node";
	}
	return "bare";
}

/**
 * Get unified timeline for a specific person (by personCode).
 * Merges activityLogs + notes + reminders scoped to this person.
 * RBAC: internal notes hidden unless caller has notes.viewInternal.
 */
export const getForPerson = orgQuery({
	args: {
		orgId: v.id("orgs"),
		personCode: v.string(),
		limit: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
		const { member } = await requireOrgMember(ctx, args.orgId);
		const canViewInternal = member.permissions.includes("notes.viewInternal");

		const cap = args.limit ?? 50;

		const [activityLogs, notes, reminders] = await Promise.all([
			// Activity logs indexed by personCode — no full org scan
			ctx.db
				.query("activityLogs")
				.withIndex("by_org_and_personCode", (q) =>
					q.eq("orgId", args.orgId).eq("personCode", args.personCode),
				)
				.order("desc")
				.take(cap),
			// Notes attached to this person (via personCode field)
			ctx.db
				.query("notes")
				.withIndex("by_org_and_created", (q) => q.eq("orgId", args.orgId))
				.order("desc")
				.take(200)
				.then((rows) =>
					rows
						.filter((r) => r.personCode === args.personCode)
						.filter((r) => canViewInternal || !r.isInternal),
				),
			// Reminders for this person
			ctx.db
				.query("reminders")
				.withIndex("by_org_and_person", (q) =>
					q.eq("orgId", args.orgId).eq("personCode", args.personCode),
				)
				.order("desc")
				.take(cap),
		]);

		const entries = [
			...activityLogs.map((e) => ({
				...e,
				_entryType: "activity" as TimelineEntryType,
				_kind: resolveActivityKind(e.action),
				_color: resolveActivityColor(e.action),
			})),
			...notes.map((n) => ({
				...n,
				_entryType: "note" as TimelineEntryType,
				_kind: "card" as TimelineEntryKind,
				_color: "#eab308", // yellow
			})),
			...reminders.map((r) => ({
				...r,
				_entryType: "reminder" as TimelineEntryType,
				_kind: "card" as TimelineEntryKind,
				_color: "#f97316", // orange
			})),
		];

		return entries.sort((a, b) => b.createdAt - a.createdAt).slice(0, cap);
	},
});

/**
 * Get org-wide timeline (admin/owner only).
 * Used by /settings/activity-log page.
 */
export const getForOrg = orgQuery({
	args: {
		orgId: v.id("orgs"),
		limit: v.optional(v.number()),
		actorType: v.optional(v.string()), // filter by "user"|"ai"|"system"
	},
	handler: async (ctx, args) => {
		const { member } = await requireOrgMember(ctx, args.orgId);
		requireRole(member.permissions, "activityLogs.viewOrg");

		const cap = args.limit ?? 100;

		const q = ctx.db
			.query("activityLogs")
			.withIndex("by_orgId_and_createdAt", (q) => q.eq("orgId", args.orgId))
			.order("desc");

		const logs = await q.take(cap);

		return logs
			.filter((r) => !args.actorType || r.actorType === args.actorType)
			.map((e) => ({
				...e,
				_entryType: "activity" as TimelineEntryType,
				_kind: resolveActivityKind(e.action),
				_color: resolveActivityColor(e.action),
			}));
	},
});

// ─── Entity-scoped + paginated queries (added 2026-05-19) ────────────────────

/**
 * Entity-scoped timeline (deal / company / lead / contact detail page tabs).
 *
 * Reads activityLogs from the cheapest available index, plus any notes and
 * reminders attached to the same entityType+entityId. Members without
 * `notes.viewInternal` don't see internal notes. Returned array is sorted
 * descending by `createdAt`, capped at `limit` (default 100).
 *
 * Why this is its own query (not just `getForPerson`)
 *   - Deal / company entities don't have a personCode lookup — they have
 *     a code (`D-001`, `CO-001`).
 *   - The `activityLogs.by_entityType_and_entityId` index is the cheapest
 *     way to surface activity for a non-person entity.
 */
export const getForEntity = orgQuery({
	args: {
		orgId: v.id("orgs"),
		entityType: v.string(),
		entityId: v.string(),
		limit: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
		const { member } = await requireOrgMember(ctx, args.orgId);
		requireRole(member.permissions, "notes.view");
		const canViewInternal = hasPermission(member.permissions, "notes.viewInternal");

		const cap = args.limit ?? 100;

		const [activityLogs, notes, reminders] = await Promise.all([
			ctx.db
				.query("activityLogs")
				.withIndex("by_entityType_and_entityId", (q) =>
					q.eq("entityType", args.entityType).eq("entityId", args.entityId),
				)
				.order("desc")
				.take(cap),
			ctx.db
				.query("notes")
				.withIndex("by_entity", (q) =>
					q
						.eq("orgId", args.orgId)
						.eq("entityType", args.entityType)
						.eq("entityId", args.entityId),
				)
				.order("desc")
				.take(cap)
				.then((rows) => rows.filter((r) => canViewInternal || !r.isInternal)),
			ctx.db
				.query("reminders")
				.withIndex("by_org_and_due", (q) => q.eq("orgId", args.orgId))
				.collect()
				.then((rows) =>
					rows
						.filter(
							(r) => r.entityType === args.entityType && r.entityId === args.entityId,
						)
						.sort((a, b) => b.createdAt - a.createdAt)
						.slice(0, cap),
				),
		]);

		const entries = [
			...activityLogs.map((e) => ({
				...e,
				_entryType: "activity" as TimelineEntryType,
				_kind: resolveActivityKind(e.action),
				_color: resolveActivityColor(e.action),
			})),
			...notes.map((n) => ({
				...n,
				_entryType: "note" as TimelineEntryType,
				_kind: "card" as TimelineEntryKind,
				_color: "#eab308",
			})),
			...reminders.map((r) => ({
				...r,
				_entryType: "reminder" as TimelineEntryType,
				_kind: "card" as TimelineEntryKind,
				_color: "#f97316",
			})),
		];

		return entries.sort((a, b) => b.createdAt - a.createdAt).slice(0, cap);
	},
});

// Discriminated scope union — frontend passes one of these.
const timelineScopeValidator = v.union(
	v.object({ kind: v.literal("org") }),
	v.object({ kind: v.literal("person"), personCode: v.string() }),
	v.object({
		kind: v.literal("entity"),
		entityType: v.string(),
		entityId: v.string(),
	}),
);

/**
 * Paginated timeline — primary entry point used by `<TimelineFeed>`.
 *
 * Why pagination matters here
 * ──────────────────────────
 * A 5-year-old org has thousands of activity log rows per personCode.
 * The non-paginated `getForPerson` capped at 50 — fine for a profile
 * tab, not fine for a long-running customer with hundreds of touch
 * points. The frontend wants newest-at-the-bottom + scroll-up loads
 * older; pagination is the natural shape for that UX.
 *
 * How merging works inside one page
 *   - We currently merge from the activityLogs index ONLY. Adding notes
 *     + reminders to the merge requires a separate cursor per source,
 *     which complicates the API. The pragmatic shape is:
 *       - first page = paginated activityLogs (the noisiest source)
 *       - notes + reminders ride along inside that page's time window
 *       - older pages append more activity-log entries; notes/reminders
 *         already loaded stay where they are.
 *   - Trade-off: the "top of feed" (oldest visible page) may have a
 *     small number of notes/reminders that don't strictly belong in
 *     that page's time window. In practice this is invisible to users
 *     because the merge is sorted desc by createdAt before slicing.
 *
 * Args
 * ────
 *   - scope: discriminated union (org / person / entity)
 *   - paginationOpts: {numItems, cursor} — provided by `usePaginatedQuery`
 *
 * RBAC
 * ────
 *   - org scope     → `activityLogs.viewOrg`
 *   - person scope  → `notes.view` (with internal-note filter)
 *   - entity scope  → `notes.view`
 */
export const getForScope = orgQuery({
	args: {
		orgId: v.id("orgs"),
		scope: timelineScopeValidator,
		paginationOpts: paginationOptsValidator,
	},
	handler: async (ctx, args) => {
		const { member } = await requireOrgMember(ctx, args.orgId);
		const scope = args.scope;

		// RBAC per scope.
		if (scope.kind === "org") {
			requireRole(member.permissions, "activityLogs.viewOrg");
		} else {
			requireRole(member.permissions, "notes.view");
		}

		const canViewInternal = hasPermission(member.permissions, "notes.viewInternal");

		// Choose the activityLogs index based on scope.
		const activityPage = await (() => {
			if (scope.kind === "person") {
				return ctx.db
					.query("activityLogs")
					.withIndex("by_org_and_personCode", (q) =>
						q.eq("orgId", args.orgId).eq("personCode", scope.personCode),
					)
					.order("desc")
					.paginate(args.paginationOpts);
			}
			if (scope.kind === "entity") {
				return ctx.db
					.query("activityLogs")
					.withIndex("by_entityType_and_entityId", (q) =>
						q.eq("entityType", scope.entityType).eq("entityId", scope.entityId),
					)
					.order("desc")
					.paginate(args.paginationOpts);
			}
			return ctx.db
				.query("activityLogs")
				.withIndex("by_orgId_and_createdAt", (q) => q.eq("orgId", args.orgId))
				.order("desc")
				.paginate(args.paginationOpts);
		})();

		// Bound the time window by the activity page so notes/reminders ride along.
		const oldestInPage = activityPage.page.length
			? Math.min(...activityPage.page.map((r) => r.createdAt))
			: 0;
		const newestInPage = activityPage.page.length
			? Math.max(...activityPage.page.map((r) => r.createdAt))
			: Date.now();

		// Notes within the page's time window.
		const notesQuery = (() => {
			if (scope.kind === "person") {
				return ctx.db
					.query("notes")
					.withIndex("by_org_and_personCode", (q) =>
						q.eq("orgId", args.orgId).eq("personCode", scope.personCode),
					);
			}
			if (scope.kind === "entity") {
				return ctx.db
					.query("notes")
					.withIndex("by_entity", (q) =>
						q
							.eq("orgId", args.orgId)
							.eq("entityType", scope.entityType)
							.eq("entityId", scope.entityId),
					);
			}
			return ctx.db
				.query("notes")
				.withIndex("by_org_and_created", (q) => q.eq("orgId", args.orgId));
		})();

		const notes = await notesQuery
			.order("desc")
			.take(args.paginationOpts.numItems * 2)
			.then((rows) =>
				rows
					.filter((r) => canViewInternal || !r.isInternal)
					.filter((r) => r.createdAt >= oldestInPage && r.createdAt <= newestInPage + 1),
			);

		// Reminders within the page's time window.
		const remindersQuery = (() => {
			if (scope.kind === "person") {
				return ctx.db
					.query("reminders")
					.withIndex("by_org_and_person", (q) =>
						q.eq("orgId", args.orgId).eq("personCode", scope.personCode),
					);
			}
			return ctx.db
				.query("reminders")
				.withIndex("by_org_and_due", (q) => q.eq("orgId", args.orgId));
		})();

		const reminders = await remindersQuery
			.order("desc")
			.take(args.paginationOpts.numItems * 2)
			.then((rows) =>
				rows
					.filter((r) => {
						if (scope.kind === "entity") {
							return (
								r.entityType === scope.entityType && r.entityId === scope.entityId
							);
						}
						return true;
					})
					.filter((r) => r.createdAt >= oldestInPage && r.createdAt <= newestInPage + 1),
			);

		const merged = [
			...activityPage.page.map((e) => ({
				...e,
				_entryType: "activity" as TimelineEntryType,
				_kind: resolveActivityKind(e.action),
				_color: resolveActivityColor(e.action),
			})),
			...notes.map((n) => ({
				...n,
				_entryType: "note" as TimelineEntryType,
				_kind: "card" as TimelineEntryKind,
				_color: "#eab308",
			})),
			...reminders.map((r) => ({
				...r,
				_entryType: "reminder" as TimelineEntryType,
				_kind: "card" as TimelineEntryKind,
				_color: "#f97316",
			})),
		].sort((a, b) => b.createdAt - a.createdAt);

		return {
			page: merged,
			isDone: activityPage.isDone,
			continueCursor: activityPage.continueCursor,
		};
	},
});

/** Map action string to timeline icon color */
function resolveActivityColor(action: string): string {
	if (action.includes("created")) return "#3b82f6"; // blue
	if (action.includes("stage") || action.includes("converted")) return "#8b5cf6"; // purple
	if (action.includes("note")) return "#eab308"; // yellow
	if (action.includes("reminder") || action.includes("followup")) return "#f97316"; // orange
	if (action.includes("ai") || action.startsWith("ai.")) return "#6366f1"; // indigo
	if (action.includes("whatsapp")) return "#22c55e"; // green
	return "#6b7280"; // gray — default
}

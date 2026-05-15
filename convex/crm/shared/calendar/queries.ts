/**
 * Calendar Queries — convex/crm/shared/calendar/queries.ts
 *
 * Calendar is a CLIENT-DERIVED VIEW — no `events` table. This query merges three
 * sources into a unified `CalendarEvent[]` shape:
 *
 *   1. `reminders` — every reminder is a calendar event (most common case).
 *   2. `activityLogs` — entries with action ∈ {meeting_scheduled, call_scheduled, meeting_held, call_held}.
 *   3. `deals.expectedCloseDate` — every open deal becomes a "deal closes today" marker.
 *
 * Per FRONTEND-DECISIONS Rule 16: "Create event" from the calendar = create a reminder.
 * Per CORE-FEATURES-ARCHITECTURE.md §3.5: no separate events table — one source of truth.
 *
 * STATUS: IMPLEMENTED (Phase 2 backend).
 */
import { v } from "convex/values";
import { orgQuery, requireOrgMember } from "../../../_functions/authenticated";
import type { Id } from "../../../_generated/dataModel";
import type { QueryCtx } from "../../../_generated/server";
import { hasPermission, requireRole } from "../../../_shared/permissions";

/**
 * Tagged union returned to the client. Each event carries enough info for
 * click-through (`personCode` / `entityType` / `entityId` → profile or detail page).
 */
export type CalendarEventDTO = {
	id: string; // "reminder:<docId>" | "activity:<docId>" | "deal:<docId>"
	source: "reminder" | "activity" | "deal";
	title: string;
	startsAt: number;
	endsAt?: number;
	color: string; // hex from event-source-colors
	personCode?: string;
	entityType?: string;
	entityId?: string;
	meta?: Record<string, string | number | boolean>;
};

const COLOR_REMINDER = "#f97316"; // orange
const COLOR_ACTIVITY = "#6366f1"; // indigo
const COLOR_DEAL = "#3b82f6"; // blue

/** Activity actions surfaced as calendar events (extend as we add more). */
const CALENDAR_ACTIVITY_ACTIONS = new Set([
	"meeting_scheduled",
	"call_scheduled",
	"meeting_held",
	"call_held",
	"demo_scheduled",
	"demo_held",
]);

/**
 * Get every calendar event in [rangeStart, rangeEnd].
 *
 * `scope`:
 *   - "org" (default) — all events in the org
 *   - "person"        — restrict to one personCode
 *   - "entity"        — restrict to one (entityType, entityId)
 */
export const getEvents = orgQuery({
	args: {
		orgId: v.id("orgs"),
		rangeStart: v.number(),
		rangeEnd: v.number(),
		scope: v.optional(v.union(v.literal("org"), v.literal("person"), v.literal("entity"))),
		personCode: v.optional(v.string()),
		entityType: v.optional(v.string()),
		entityId: v.optional(v.string()),
		sources: v.optional(
			v.array(v.union(v.literal("reminder"), v.literal("activity"), v.literal("deal"))),
		),
	},
	handler: async (ctx, args) => {
		const { member, userId } = await requireOrgMember(ctx, args.orgId);
		// Calendar is a derived view — its primary source is `reminders`, with
		// activityLogs and deal close-dates layered on top. Gate on `reminders.view`
		// (every system role has it). `deals.view` is checked separately below
		// before the deal close-date layer is included.
		requireRole(member.permissions, "reminders.view");
		const canViewDeals = hasPermission(member.permissions, "deals.view");
		const canViewOrgActivity = hasPermission(member.permissions, "activityLogs.viewOrg");

		const sources = new Set(args.sources ?? ["reminder", "activity", "deal"]);
		const scope = args.scope ?? "org";

		const events: CalendarEventDTO[] = [];

		// ── 1. Reminders ─────────────────────────────────────────────────────
		if (sources.has("reminder")) {
			const reminders = await loadReminders(ctx, args, scope);
			for (const r of reminders) {
				if (r.dueAt < args.rangeStart || r.dueAt > args.rangeEnd) continue;
				events.push({
					id: `reminder:${r._id}`,
					source: "reminder",
					title: r.title,
					startsAt: r.dueAt,
					color: COLOR_REMINDER,
					personCode: r.personCode,
					entityType: r.entityType,
					entityId: r.entityId,
					meta: {
						status: r.status,
						followUpCode: r.followUpCode,
						assignedTo: r.assignedTo,
					},
				});
			}
		}

		// ── 2. Activity logs (meetings, calls, demos) ────────────────────────
		if (sources.has("activity")) {
			const logs = await loadActivityLogs(ctx, args, scope);
			for (const log of logs) {
				if (!CALENDAR_ACTIVITY_ACTIONS.has(log.action)) continue;
				if (log.createdAt < args.rangeStart || log.createdAt > args.rangeEnd) {
					continue;
				}
				// Members without `activityLogs.viewOrg` only see system events
				// they personally triggered. Org-level viewers see everything.
				if (!canViewOrgActivity && log.userId !== userId && log.actorType === "system") {
					continue;
				}
				events.push({
					id: `activity:${log._id}`,
					source: "activity",
					title: log.description ?? log.action.replace(/_/g, " "),
					startsAt: log.createdAt,
					color: COLOR_ACTIVITY,
					personCode: log.personCode,
					entityType: log.entityType,
					entityId: log.entityId,
					meta: {
						action: log.action,
						actorType: log.actorType,
					},
				});
			}
		}

		// ── 3. Deal close dates (open deals only) ────────────────────────────
		if (sources.has("deal") && canViewDeals) {
			const deals = await loadDeals(ctx, args, scope);
			for (const d of deals) {
				if (!d.expectedCloseDate) continue;
				if (d.wonAt || d.lostAt) continue; // skip closed deals
				if (d.expectedCloseDate < args.rangeStart || d.expectedCloseDate > args.rangeEnd) {
					continue;
				}
				events.push({
					id: `deal:${d._id}`,
					source: "deal",
					title: `${d.title} — expected close`,
					startsAt: d.expectedCloseDate,
					color: COLOR_DEAL,
					personCode: d.personCode,
					entityType: "deal",
					entityId: d.dealCode,
					meta: {
						dealCode: d.dealCode,
						value: d.value ?? 0,
						currency: d.currency ?? "",
					},
				});
			}
		}

		// Newest-first inside the range.
		return events.sort((a, b) => a.startsAt - b.startsAt);
	},
});

// ─── Source loaders (per scope) ──────────────────────────────────────────────

type GetEventsArgs = {
	orgId: Id<"orgs">;
	rangeStart: number;
	rangeEnd: number;
	personCode?: string;
	entityType?: string;
	entityId?: string;
};

async function loadReminders(
	ctx: QueryCtx,
	args: GetEventsArgs,
	scope: "org" | "person" | "entity",
) {
	if (scope === "person" && args.personCode) {
		return await ctx.db
			.query("reminders")
			.withIndex("by_org_and_person", (q) =>
				q.eq("orgId", args.orgId).eq("personCode", args.personCode!),
			)
			.collect();
	}
	// org or entity scope — pull by due-date range, then post-filter for entity.
	const byDue = await ctx.db
		.query("reminders")
		.withIndex("by_org_and_due", (q) =>
			q.eq("orgId", args.orgId).gte("dueAt", args.rangeStart).lte("dueAt", args.rangeEnd),
		)
		.collect();
	if (scope === "entity" && args.entityType && args.entityId) {
		return byDue.filter(
			(r) => r.entityType === args.entityType && r.entityId === args.entityId,
		);
	}
	return byDue;
}

async function loadActivityLogs(
	ctx: QueryCtx,
	args: GetEventsArgs,
	scope: "org" | "person" | "entity",
) {
	if (scope === "person" && args.personCode) {
		return await ctx.db
			.query("activityLogs")
			.withIndex("by_org_and_personCode", (q) =>
				q.eq("orgId", args.orgId).eq("personCode", args.personCode!),
			)
			.order("desc")
			.take(500);
	}
	if (scope === "entity" && args.entityType && args.entityId) {
		return await ctx.db
			.query("activityLogs")
			.withIndex("by_entityType_and_entityId", (q) =>
				q.eq("entityType", args.entityType!).eq("entityId", args.entityId!),
			)
			.order("desc")
			.take(500);
	}
	return await ctx.db
		.query("activityLogs")
		.withIndex("by_orgId_and_createdAt", (q) =>
			q
				.eq("orgId", args.orgId)
				.gte("createdAt", args.rangeStart)
				.lte("createdAt", args.rangeEnd),
		)
		.collect();
}

async function loadDeals(ctx: QueryCtx, args: GetEventsArgs, scope: "org" | "person" | "entity") {
	if (scope === "person" && args.personCode) {
		return await ctx.db
			.query("deals")
			.withIndex("by_org_and_personCode", (q) =>
				q.eq("orgId", args.orgId).eq("personCode", args.personCode!),
			)
			.collect();
	}
	if (scope === "entity" && args.entityType === "deal" && args.entityId) {
		return await ctx.db
			.query("deals")
			.withIndex("by_org_and_dealCode", (q) =>
				q.eq("orgId", args.orgId).eq("dealCode", args.entityId!),
			)
			.collect();
	}
	return await ctx.db
		.query("deals")
		.withIndex("by_org", (q) => q.eq("orgId", args.orgId))
		.collect();
}

/**
 * Timeline queries — convex/crm/shared/timeline/queries.ts
 *
 * Unified Timeline: merges activityLogs + notes + reminders into a single
 * chronological feed. Used in:
 *   - ProfilePage → Timeline tab (scoped to personCode)
 *   - /settings/activity-log → org-wide (admin only)
 *
 * UI spec: vertical feed, newest first, colored icons on left, vertical
 * connector lines, relative timestamps on right.
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
import { v } from "convex/values";
import { orgQuery, requireOrgMember } from "../../../_functions/authenticated";
import { requireRole } from "../../../_shared/permissions";

/** Unified timeline entry shape returned to the frontend */
type TimelineEntryType = "activity" | "note" | "reminder";

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
		const canViewInternal =
			["owner", "admin"].includes(member.role ?? "");

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
						.filter((r) => r.personCode === args.personCode && !r.isActivityChat)
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
				_color: resolveActivityColor(e.action),
			})),
			...notes.map((n) => ({
				...n,
				_entryType: "note" as TimelineEntryType,
				_color: "#eab308", // yellow
			})),
			...reminders.map((r) => ({
				...r,
				_entryType: "reminder" as TimelineEntryType,
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
		requireRole(member.role ?? "viewer", "activityLogs.viewOrg");

		const cap = args.limit ?? 100;

		let q = ctx.db
			.query("activityLogs")
			.withIndex("by_orgId_and_createdAt", (q) => q.eq("orgId", args.orgId))
			.order("desc");

		const logs = await q.take(cap);

		return logs
			.filter((r) => !args.actorType || r.actorType === args.actorType)
			.map((e) => ({
				...e,
				_entryType: "activity" as TimelineEntryType,
				_color: resolveActivityColor(e.action),
			}));
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

/**
 * convex/ai/tools/notifications/listNotifications.ts
 *
 * Stage 4 of /SPRINT-PLAN.md (2026-05-26). Read-only list_notifications
 * tool — surfaces the calling user's notifications scoped to the active
 * org. Atomic.
 *
 * Permission: `notifications.viewOwn` — they're always reading their own
 * row. Cross-org leakage is prevented by the `notifications.listMineForAI`
 * twin's org filter.
 */
import { z } from "zod";
import { registerTool } from "../../toolRegistry";
import { coerceInt, requirePermission, runTool, toolQuery } from "../_shared";
import { getNotificationsCtx } from "./_context";

type NotificationRow = {
	_id: string;
	type: string;
	title: string;
	body?: string;
	read?: boolean;
	createdAt: number;
};

registerTool({
	name: "list_notifications",
	layer: "notifications",
	permission: "notifications.viewOwn",
	confirmation: "none",
	description:
		"List the calling user's notifications for the active org. Optionally filter to unread only.",
	instruction: {
		whenToCall:
			"User asks 'do I have any notifications?' / 'what's in my inbox' / 'any updates for me' / 'what's new'.",
		whenNotToCall:
			"the user is asking about messages (use list_messages) OR org-wide activity (use list_org_timeline).",
		synonyms: [
			"my notifications",
			"my inbox",
			"new alerts",
			"any updates",
			"unread notifications",
		],
		goodExample: {
			description: "User: 'Show me my unread notifications.'",
			args: { onlyUnread: true, limit: 20 },
		},
	},
	runbook: {
		onSuccess:
			"Reply with one short sentence stating the count and (if any unread) the most recent title. The structured table already lists details.",
		onEmpty: "Tell the user they're caught up — no notifications match the filter.",
		onPermissionDenied:
			"Tell the user they need notifications.viewOwn permission (it's an Everyone default — should never fail in practice).",
	},
	schema: z.object({
		onlyUnread: z.optional(z.boolean()).describe("If true, return only unread notifications."),
		limit: coerceInt((n) => n.min(1).max(100).default(20)).describe(
			"Maximum number of notifications to return. Default 20.",
		),
	}),
	execute: async (args) =>
		runTool(async () => {
			const tc = getNotificationsCtx();
			requirePermission(tc.permissions, "notifications.viewOwn");

			const rows = (await toolQuery(tc, "notifications/queries:listMine", {
				orgId: tc.orgId,
				onlyUnread: args.onlyUnread,
				limit: args.limit ?? 20,
			})) as NotificationRow[];

			const headline =
				rows.length === 0
					? args.onlyUnread
						? "No unread notifications — you're caught up."
						: "No notifications."
					: `${rows.length} notification${rows.length === 1 ? "" : "s"}.`;

			return {
				ok: true as const,
				data: { count: rows.length, notifications: rows },
				summary: {
					headline,
					table: rows.slice(0, 8).map((r) => ({
						label: r.title,
						value: `${r.read ? "read" : "unread"} · ${new Date(r.createdAt).toISOString().slice(0, 10)}`,
					})),
				},
			};
		}),
});

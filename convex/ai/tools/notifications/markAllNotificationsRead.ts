/**
 * convex/ai/tools/notifications/markAllNotificationsRead.ts
 *
 * P1.3 G-7 — `mark_all_notifications_read` atomic tool. Flips every
 * unread notification belonging to the calling user (within the active
 * org) to `read: true`. Idempotent — calling twice returns the same
 * "0 updated" the second time.
 *
 * Permission: `notifications.markRead` (the same gate as the per-row
 * mark-as-read mutation).
 *
 * Tenant safety: the underlying `markAllReadForAI` filters by the org
 * the AI is running for, so the action never reaches another org's
 * notifications even though `notifications` is keyed by userId.
 */
import { z } from "zod";
import { registerTool } from "../../toolRegistry";
import { requirePermission, runTool, toolMutation } from "../_shared";
import { getNotificationsCtx } from "./_context";

registerTool({
	name: "mark_all_notifications_read",
	layer: "notifications",
	permission: "notifications.markRead",
	confirmation: "none",
	description:
		"Mark every unread notification in the calling user's inbox (this workspace) as read. Capped at 200 per call; idempotent.",
	instruction: {
		whenToCall:
			"User says 'mark all notifications read', 'clear my notifications', 'dismiss all', 'inbox zero', 'clear the bell'.",
		whenNotToCall:
			"the user wants to mark a SPECIFIC notification (use mark_notification_read) OR delete notifications (not currently supported via AI).",
		synonyms: [
			"mark all read",
			"clear all",
			"dismiss all",
			"inbox zero",
			"clear notifications",
			"clear bell",
		],
		goodExample: {
			description: "User: 'Clear my notifications.'",
			args: {},
		},
	},
	runbook: {
		onSuccess: "Confirm with the count flipped (e.g. 'Marked 17 notifications read.').",
	},
	schema: z.object({}),
	execute: async () =>
		runTool(async () => {
			const tc = getNotificationsCtx();
			requirePermission(tc.permissions, "notifications.markRead");
			const result = (await toolMutation(tc, "notifications/mutations:markAllRead", {
				orgId: tc.orgId,
			})) as { updated: number };
			const updated = result?.updated ?? 0;
			return {
				ok: true as const,
				data: result,
				display: {
					kind: "text" as const,
					text:
						updated === 0
							? "✅ Inbox already clear — nothing to mark."
							: `✅ Marked ${updated} ${updated === 1 ? "notification" : "notifications"} read.`,
				},
				summary: {
					headline:
						updated === 0
							? "Inbox already clear"
							: `Marked ${updated} notification${updated === 1 ? "" : "s"} read`,
				},
			};
		}),
});

/**
 * convex/ai/tools/notifications/markNotificationRead.ts
 *
 * Stage 4 of /SPRINT-PLAN.md (2026-05-26). Atomic
 * `mark_notification_read` tool. No propose / commit — marking a
 * notification read is reversible-ish (read flag flip), per-user only,
 * and idempotent. Permission: `notifications.markRead`.
 */
import { z } from "zod";
import { registerTool } from "../../toolRegistry";
import { requirePermission, runTool, toolMutation } from "../_shared";
import { getNotificationsCtx } from "./_context";

registerTool({
	name: "mark_notification_read",
	layer: "notifications",
	permission: "notifications.markRead",
	confirmation: "none",
	description: "Mark one of the calling user's notifications as read. Idempotent.",
	instruction: {
		whenToCall:
			"User asks 'mark this notification read' / 'dismiss this' / 'mark all read' (call once per id).",
		whenNotToCall:
			"the user wants to delete or archive notifications (not currently supported via AI).",
		preflight: ["list_notifications"],
		requiredClarifications: ["notificationId"],
		synonyms: ["mark read", "dismiss", "acknowledge", "clear notification"],
		goodExample: {
			description: "User: 'Mark notification N123 as read.'",
			args: { notificationId: "abc123" },
		},
	},
	runbook: {
		onSuccess: "Confirm in one short sentence — notification marked read.",
		onValidationError:
			"If notificationId doesn't resolve, list user's notifications via list_notifications first.",
	},
	schema: z.object({
		notificationId: z.string().describe("Convex notification _id."),
	}),
	execute: async (args) =>
		runTool(async () => {
			const tc = getNotificationsCtx();
			requirePermission(tc.permissions, "notifications.markRead");
			await toolMutation(tc, "notifications/mutations:markRead", {
				orgId: tc.orgId,
				notificationId: args.notificationId,
			});
			return {
				ok: true as const,
				data: { notificationId: args.notificationId },
				display: `✅ Notification marked read.`,
			};
		}),
});

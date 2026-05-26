/**
 * convex/ai/tools/messaging/markThreadRead.ts
 *
 * Atomic `mark_thread_read` tool. Marks the user's `conversationMembers`
 * row's `lastReadAt` to `now`. Idempotent + monotonic on the backend
 * (see the OCC guard in `markReadImpl`).
 *
 * No twoStep — the operation is per-user state, low risk, and
 * reversible (the next message un-marks it implicitly).
 *
 * Permission: `messages.view`.
 */
import { z } from "zod";
import { registerTool } from "../../toolRegistry";
import { requirePermission, runTool, toolMutation } from "../_shared";
import { getMessagingCtx } from "./_context";

registerTool({
	name: "mark_thread_read",
	layer: "messaging",
	permission: "messages.view",
	confirmation: "none",
	description: "Mark a conversation thread as read up to now.",
	instruction: {
		whenToCall:
			"Use when the user asks to mark a thread / conversation / inbox row as read, or to dismiss a notification badge.",
		whenNotToCall:
			"the user wants to archive the conversation (different verb) OR mute notifications (use update_notification_level — Stage 4).",
		synonyms: ["mark as read", "clear unread", "dismiss", "close thread"],
		goodExample: {
			description: "User: 'Mark the Acme thread as read.'",
			args: { conversationId: "k123abc..." },
		},
	},
	runbook: {
		onSuccess: "Confirm with one short sentence.",
	},
	schema: z.object({
		conversationId: z.string().min(1).describe("Convex id of the conversation to mark read."),
	}),
	execute: async (args) =>
		runTool(async () => {
			const tc = getMessagingCtx();
			requirePermission(tc.permissions, "messages.view");
			await toolMutation(tc, "crm/shared/conversations/mutations:markRead", {
				orgId: tc.orgId,
				conversationId: args.conversationId,
			});
			return {
				ok: true as const,
				data: { conversationId: args.conversationId },
				display: { kind: "text" as const, text: "Marked thread as read." },
			};
		}),
});

/**
 * convex/ai/tools/messaging/removeParticipant.ts
 *
 * Two-step `remove_participant` — remove a single user from a conversation.
 * Permission: `messages.subscribe`. Self-removal is allowed even without
 * the permission (mirrors the public mutation behaviour).
 *
 * Mirrors `convex/ai/tools/messaging/addParticipants.ts` shape.
 */
import { z } from "zod";
import { registerTool } from "../../toolRegistry";
import { propose, requirePermission, runTool, toolMutation } from "../_shared";
import { getMessagingCtx } from "./_context";

registerTool({
	name: "remove_participant",
	layer: "messaging",
	permission: "messages.subscribe",
	confirmation: "twoStep",
	description: "Remove a member from a conversation thread.",
	instruction: {
		whenToCall:
			"Use when the user asks to remove / kick / drop someone from a thread, OR to leave a thread themselves.",
		whenNotToCall:
			"the user wants to mute notifications instead (use update_notification_level when shipped) OR archive the whole thread (different verb).",
		preflight: ["list_members"],
		requiredClarifications: ["conversationId", "targetUserId"],
		synonyms: ["remove from thread", "kick", "drop", "uncc", "leave thread"],
		goodExample: {
			description: "User: 'Remove Alex from the Acme thread.'",
			args: { conversationId: "k123...", targetUserId: "u_alex" },
		},
	},
	runbook: {
		onSuccess: "Confirm with one short sentence.",
		onPermissionDenied:
			"Tell the user they need messages.subscribe permission unless they're removing themselves.",
	},
	schema: z.object({
		conversationId: z.string().min(1),
		targetUserId: z.string().min(1),
	}),
	execute: async (args) => {
		const { permissions, userId } = getMessagingCtx();
		// Self-removal is always allowed — bypass the permission gate.
		if (args.targetUserId !== userId) {
			requirePermission(permissions, "messages.subscribe");
		}
		const isSelf = args.targetUserId === userId;
		return propose("remove_participant", args, {
			title: isSelf ? "Leave this thread" : "Remove member from thread",
			fields: [
				{ label: "Conversation", value: args.conversationId },
				{
					label: isSelf ? "Action" : "Member",
					value: isSelf ? "Self-leave" : args.targetUserId,
				},
			],
		});
	},
});

registerTool({
	name: "commit_remove_participant",
	layer: "messaging",
	permission: "messages.subscribe",
	confirmation: "none",
	description: "Internal: commit a pre-approved remove_participant call.",
	schema: z.object({
		conversationId: z.string().min(1),
		targetUserId: z.string().min(1),
	}),
	execute: async (args) =>
		runTool(async () => {
			const tc = getMessagingCtx();
			if (args.targetUserId !== tc.userId) {
				requirePermission(tc.permissions, "messages.subscribe");
			}

			await toolMutation(tc, "crm/shared/conversations/mutations:removeParticipant", {
				orgId: tc.orgId,
				conversationId: args.conversationId,
				targetUserId: args.targetUserId,
			});

			return {
				ok: true as const,
				data: args,
				display: {
					kind: "text" as const,
					text:
						args.targetUserId === tc.userId
							? "You left the thread."
							: "Member removed from the thread.",
				},
			};
		}),
});

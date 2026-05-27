/**
 * convex/ai/tools/messaging/startDm.ts
 *
 * P1.3 G-3 — `start_dm` atomic tool. Opens (or returns the existing) 1:1
 * direct-message conversation between the caller and another org member.
 *
 * The underlying mutation is idempotent — repeated calls return the same
 * conversationId, which is why we don't need a propose/commit pair.
 * "Start a DM" is reversible (the user can archive the thread later).
 *
 * Permission: `messages.view`. The mutation refuses self-DMs and
 * non-member targets at the backend level, surfacing those as friendly
 * errors via the `friendlyToolError` envelope.
 */
import { z } from "zod";
import { registerTool } from "../../toolRegistry";
import { requirePermission, runTool, toolMutation } from "../_shared";
import { getMessagingCtx } from "./_context";

registerTool({
	name: "start_dm",
	layer: "messaging",
	permission: "messages.view",
	confirmation: "none",
	description:
		"Start (or open) a 1:1 direct message with another workspace member. Idempotent — repeated calls return the existing thread.",
	instruction: {
		whenToCall:
			"User says 'DM Sara about the Acme deal', 'open a chat with <member>', 'start a direct message', 'message <name> privately'.",
		whenNotToCall:
			"the user wants a group conversation (use ensure_for_entity / add_participants in Stage 2 messaging) OR is asking to send a message to a CRM person/lead (use send_message with personCode).",
		preflight: ["list_members"],
		requiredClarifications: ["targetUserId"],
		synonyms: ["DM", "direct message", "private message", "chat with", "ping member"],
		goodExample: {
			description:
				"User: 'Open a DM with Sara.' (model resolved Sara's userId via list_members)",
			args: { targetUserId: "k_user_sara_id" },
		},
		badExample: {
			description: "User: 'Open a DM.'",
			args: { targetUserId: "" },
			whyBad: "targetUserId is required. Resolve via list_members first.",
		},
	},
	runbook: {
		onSuccess:
			"Confirm in one short sentence with the member's name; the user can pick up the chat in /messages.",
		onValidationError:
			"INVALID_ARGS = self-DM (refuse politely). NOT_FOUND = the target isn't an active workspace member.",
	},
	schema: z.object({
		targetUserId: z.string().min(1).describe("Convex userId of the member to DM."),
		targetName: z.string().optional().describe("Member's display name for the result summary."),
	}),
	execute: async (args) =>
		runTool(async () => {
			const tc = getMessagingCtx();
			requirePermission(tc.permissions, "messages.view");
			const conversationId = (await toolMutation(
				tc,
				"crm/shared/conversations/mutations:ensureDirectMessage",
				{
					orgId: tc.orgId,
					targetUserId: args.targetUserId,
				},
			)) as string;
			return {
				ok: true as const,
				data: { conversationId, targetUserId: args.targetUserId },
				display: {
					kind: "text" as const,
					text: `✅ DM opened with ${args.targetName ?? "the member"}.`,
				},
				summary: {
					headline: `Opened a DM with ${args.targetName ?? "the member"}`,
					table: [
						{ label: "Member", value: args.targetName ?? args.targetUserId },
						{ label: "Conversation", value: conversationId },
					],
					suggestedNext: [
						{
							label: "Send first message",
							intent: `Send "Hey — got a minute?" to the DM with ${args.targetName ?? args.targetUserId}`,
						},
					],
				},
			};
		}),
});

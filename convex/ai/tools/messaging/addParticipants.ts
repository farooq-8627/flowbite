/**
 * convex/ai/tools/messaging/addParticipants.ts
 *
 * Two-step `add_participants` — invite one or more users into an existing
 * conversation. Permission: `messages.subscribe`.
 *
 * Schema:
 *   - `conversationId` (Convex id) is required — we don't ensure-on-add
 *     because adding people to a thread that doesn't exist yet would
 *     surprise the user. The propose card shows the conversation summary
 *     so the user can confirm they're inviting into the right thread.
 *   - `userIds` are user document ids; use list_members to find them.
 *   - Optional role + notificationLevel match the public mutation shape.
 */
import { z } from "zod";
import { registerTool } from "../../toolRegistry";
import { propose, requirePermission, runTool, toolMutation } from "../_shared";
import { getMessagingCtx } from "./_context";

registerTool({
	name: "add_participants",
	layer: "messaging",
	permission: "messages.subscribe",
	confirmation: "twoStep",
	description: "Add one or more members to an existing conversation thread.",
	instruction: {
		whenToCall:
			"Use when the user asks to add someone / loop someone in / cc someone / invite someone into a thread.",
		whenNotToCall:
			"the user wants to start a new thread (use send_message — it auto-creates the conversation) OR change roles in the thread (different gate).",
		preflight: ["list_members"],
		requiredClarifications: ["conversationId", "userIds"],
		synonyms: ["add to thread", "loop in", "include", "cc", "invite"],
		goodExample: {
			description: "User: 'Add Alex and Maria to the Acme thread.'",
			args: {
				conversationId: "k123...",
				userIds: ["u_alex", "u_maria"],
				role: "participant",
			},
		},
	},
	runbook: {
		onSuccess: "Confirm with the count of members added.",
		onPermissionDenied:
			"Tell the user they need messages.subscribe permission and suggest contacting an admin.",
	},
	schema: z.object({
		conversationId: z.string().min(1),
		userIds: z.array(z.string().min(1)).min(1).max(20),
		role: z.enum(["participant", "watcher"]).optional(),
		notificationLevel: z.enum(["all", "mentions", "none"]).optional(),
	}),
	execute: async (args) => {
		const { permissions } = getMessagingCtx();
		requirePermission(permissions, "messages.subscribe");
		return propose("add_participants", args, {
			title: `Add ${args.userIds.length} member(s) to thread`,
			fields: [
				{ label: "Conversation", value: args.conversationId },
				{ label: "Members", value: args.userIds.join(", ") },
				{ label: "Role", value: args.role ?? "participant" },
				{ label: "Notifications", value: args.notificationLevel ?? "all" },
			],
		});
	},
});

registerTool({
	name: "commit_add_participants",
	layer: "messaging",
	permission: "messages.subscribe",
	confirmation: "none",
	description: "Internal: commit a pre-approved add_participants call.",
	schema: z.object({
		conversationId: z.string().min(1),
		userIds: z.array(z.string().min(1)).min(1).max(20),
		role: z.enum(["participant", "watcher"]).optional(),
		notificationLevel: z.enum(["all", "mentions", "none"]).optional(),
	}),
	execute: async (args) =>
		runTool(async () => {
			const tc = getMessagingCtx();
			requirePermission(tc.permissions, "messages.subscribe");

			const result = (await toolMutation(
				tc,
				"crm/shared/conversations/mutations:addParticipants",
				{
					orgId: tc.orgId,
					conversationId: args.conversationId,
					userIds: args.userIds,
					role: args.role,
					notificationLevel: args.notificationLevel,
				},
			)) as { added: number };

			return {
				ok: true as const,
				data: result,
				display: {
					kind: "text" as const,
					text: `Added ${result.added} member(s) to the thread.`,
				},
			};
		}),
});

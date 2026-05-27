/**
 * convex/ai/tools/messaging/manageConversation.ts
 *
 * P1.3 G-4 — `manage_conversation` atomic tool. One verb-routed tool
 * that wraps three otherwise-trivial conversation mutations:
 *
 *   - `mode: "rename"`    → conversations/mutations:rename(title)
 *   - `mode: "archive"`   → conversations/mutations:archive
 *   - `mode: "unarchive"` → conversations/mutations:unarchive
 *
 * Bundling them keeps the AI tool surface compact (1 tool vs 3) which
 * reduces tool-pick error on small models. All three modes are
 * reversible (rename via another rename; archive↔unarchive) so atomic
 * with no propose/commit is the right shape.
 *
 * Permissions: `messages.view` for rename (must be a participant of the
 * conversation); `conversations.archive` for archive / unarchive (admins
 * + owners by default).
 */
import { z } from "zod";
import { registerTool } from "../../toolRegistry";
import { requirePermission, runTool, toolMutation } from "../_shared";
import { getMessagingCtx } from "./_context";

const manageSchema = z
	.object({
		mode: z.enum(["rename", "archive", "unarchive"]),
		conversationId: z.string().min(1).describe("Convex conversation _id."),
		title: z
			.string()
			.optional()
			.describe("New title (1–100 chars). Required when mode is 'rename'."),
	})
	.refine((v) => v.mode !== "rename" || (v.title !== undefined && v.title.trim().length > 0), {
		message: "title is required when mode is 'rename'.",
	});

registerTool({
	name: "manage_conversation",
	layer: "messaging",
	// Use the looser of the two permissions for the tool-surface filter;
	// the underlying mutation re-checks the right permission at commit.
	permission: "messages.view",
	confirmation: "none",
	description:
		"Rename, archive, or unarchive a conversation. `mode` selects the action: 'rename' takes a title; 'archive' / 'unarchive' flip the conversation's archived flag.",
	instruction: {
		whenToCall:
			"User says 'rename this thread to X', 'archive the Acme conversation', 'unarchive the chat', 'restore the archived thread'.",
		whenNotToCall:
			"the user wants to ADD/REMOVE participants (use add_participants / remove_participant) OR start a new DM (use start_dm) OR mute notifications (use update_notification_level — Stage 4).",
		requiredClarifications: ["conversationId", "mode"],
		synonyms: [
			"rename thread",
			"rename conversation",
			"archive thread",
			"unarchive thread",
			"restore thread",
		],
		goodExample: {
			description: "User: 'Rename this thread to Acme negotiation.'",
			args: { mode: "rename", conversationId: "k123abc...", title: "Acme negotiation" },
		},
		badExample: {
			description: "User: 'Archive a conversation.'",
			args: { mode: "archive", conversationId: "" },
			whyBad: "conversationId is required.",
		},
	},
	runbook: {
		onSuccess: "Confirm in one short sentence describing what changed.",
		onValidationError:
			"INVALID_ARGS = bad title length (1–100). FORBIDDEN on rename = the caller isn't a participant.",
		onPermissionDenied:
			"archive/unarchive needs conversations.archive (Admin / Owner). Surface to the user.",
	},
	schema: manageSchema,
	execute: async (args) =>
		runTool(async () => {
			const tc = getMessagingCtx();
			requirePermission(tc.permissions, "messages.view");

			if (args.mode === "rename") {
				await toolMutation(tc, "crm/shared/conversations/mutations:rename", {
					orgId: tc.orgId,
					conversationId: args.conversationId,
					title: (args.title ?? "").trim(),
				});
				return {
					ok: true as const,
					data: { conversationId: args.conversationId, mode: args.mode },
					display: {
						kind: "text" as const,
						text: `✅ Conversation renamed to "${args.title}".`,
					},
				};
			}

			requirePermission(tc.permissions, "conversations.archive");
			const path =
				args.mode === "archive"
					? "crm/shared/conversations/mutations:archive"
					: "crm/shared/conversations/mutations:unarchive";
			await toolMutation(tc, path, {
				orgId: tc.orgId,
				conversationId: args.conversationId,
			});
			return {
				ok: true as const,
				data: { conversationId: args.conversationId, mode: args.mode },
				display: {
					kind: "text" as const,
					text:
						args.mode === "archive"
							? "✅ Conversation archived."
							: "✅ Conversation unarchived.",
				},
			};
		}),
});

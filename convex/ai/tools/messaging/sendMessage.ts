/**
 * convex/ai/tools/messaging/sendMessage.ts
 *
 * Two-step send-message:
 *   - `send_message` proposes the write (rendered as a thread-preview card)
 *   - `commit_send_message` runs the actual mutation after approval
 *
 * The commit calls `crm/shared/messages/mutations:send` via `toolMutation`,
 * which is auto-rewritten to `:sendForAI` and injected with the trusted
 * userId. The public `send` mutation auto-creates the conversation when
 * called with `(entityType, entityId)` instead of `conversationId` — so we
 * never need a separate `ensure_conversation` propose.
 *
 * Schema design:
 *   - `personCode` is the canonical identity for person targets (lead OR
 *     contact). The model sees personCodes everywhere in the system prompt
 *     so we accept that directly. Internally `personCode` is mapped to
 *     entityType="person" + entityId=personCode in the underlying mutation.
 *   - `dealCode` / `companyCode` route to the corresponding entity.
 *   - `conversationId` (raw Convex id) is also accepted as a power-user
 *     escape hatch — the model rarely has these but the orchestrator can
 *     fill them when the chat originated from a thread.
 *   - Exactly ONE of personCode / dealCode / companyCode / conversationId
 *     must be set. We validate in the propose body.
 *
 * Permission: `messages.send`. Confirmation: twoStep.
 */
import { z } from "zod";
import { registerTool } from "../../toolRegistry";
import { optionalString, propose, requirePermission, runTool, toolMutation } from "../_shared";
import { getMessagingCtx } from "./_context";

registerTool({
	name: "send_message",
	layer: "messaging",
	permission: "messages.send",
	confirmation: "twoStep",
	approvalCategory: "send_message",
	description: "Send a chat message to a person, deal, company, or existing conversation thread.",
	instruction: {
		whenToCall:
			"Use when the user asks to send / message / tell / reply / DM / write to someone. Shows a preview card with the target thread + message body and waits for approval before posting.",
		whenNotToCall:
			"the user wants to attach a private note (use add_note) OR schedule a follow-up reminder (use create_followup) OR draft something for later editing (drafts not supported yet).",
		preflight: ["search_crm"],
		requiredClarifications: ["target", "content"],
		synonyms: ["send a message", "DM", "message", "reply", "text", "ping", "write to", "tell"],
		goodExample: {
			description:
				"User: 'Send Sara a message saying I will call her back at 3pm.' (Sara is the person P-014.)",
			args: {
				personCode: "P-014",
				content: "Hi Sara — I'll give you a call back at 3pm today.",
			},
		},
		badExample: {
			description: "User: 'Message someone.'",
			args: { content: "" },
			whyBad: "No target was supplied. Call ask_user_input or search_crm first to identify the recipient and ask the user for the message body.",
		},
	},
	runbook: {
		onSuccess:
			"Reply with ONE concise sentence ('Sent.' or 'Message sent to Sara.'). The structured summary card already shows the recipient + body. Do NOT restate the message body in prose.",
		onValidationError:
			"Group all failed fields and call ask_user_input ONCE for ALL of them. Never retry with the same args.",
		onPermissionDenied:
			"Tell the user they need messages.send permission and suggest contacting an admin.",
		suggestNext: "create_followup",
	},
	schema: z
		.object({
			personCode: optionalString().describe(
				"Person code (e.g. P-014). Send a message into the person's canonical conversation.",
			),
			dealCode: optionalString().describe(
				"Deal code (e.g. D-007). Send a message into the deal's conversation.",
			),
			companyCode: optionalString().describe(
				"Company code (e.g. C-003). Send a message into the company's conversation.",
			),
			conversationId: optionalString().describe(
				"Existing conversation id. Power-user escape hatch — rarely needed; prefer codes.",
			),
			threadId: optionalString().describe(
				"Optional sub-thread id when an entity has multiple parallel threads.",
			),
			content: z
				.string()
				.min(1)
				.describe("Plain-text message body. Required and must be non-empty."),
		})
		.refine(
			(v) =>
				[v.personCode, v.dealCode, v.companyCode, v.conversationId].filter(Boolean)
					.length === 1,
			{
				message:
					"Exactly one of personCode / dealCode / companyCode / conversationId must be set.",
			},
		),
	execute: async (args) => {
		const { permissions } = getMessagingCtx();
		requirePermission(permissions, "messages.send");

		const target = args.personCode
			? `Person ${args.personCode}`
			: args.dealCode
				? `Deal ${args.dealCode}`
				: args.companyCode
					? `Company ${args.companyCode}`
					: `Conversation ${args.conversationId}`;

		// Truncate the previewed body if huge — the chat composer renders
		// the full body anyway when the user clicks "approve".
		const previewBody =
			args.content.length > 240 ? `${args.content.slice(0, 240)}…` : args.content;

		return propose("send_message", args, {
			title: `Send message to ${target}`,
			fields: [
				{ label: "To", value: target },
				{ label: "Message", value: previewBody },
			],
		});
	},
});

registerTool({
	name: "commit_send_message",
	layer: "messaging",
	permission: "messages.send",
	confirmation: "none",
	description:
		"Internal: commit a pre-approved message send. Do not call without prior send_message approval.",
	schema: z.object({
		personCode: optionalString(),
		dealCode: optionalString(),
		companyCode: optionalString(),
		conversationId: optionalString(),
		threadId: optionalString(),
		content: z.string().min(1),
	}),
	execute: async (args) =>
		runTool(async () => {
			const tc = getMessagingCtx();
			requirePermission(tc.permissions, "messages.send");

			// Translate the user-friendly target shape into the underlying
			// mutation's (conversationId | entityType+entityId) shape.
			const mutationArgs: Record<string, unknown> = {
				orgId: tc.orgId,
				content: args.content,
				threadId: args.threadId,
			};

			let displayTarget: string;
			if (args.conversationId) {
				mutationArgs.conversationId = args.conversationId;
				displayTarget = `conversation ${args.conversationId}`;
			} else if (args.personCode) {
				mutationArgs.entityType = "person";
				mutationArgs.entityId = args.personCode;
				displayTarget = args.personCode;
			} else if (args.dealCode) {
				mutationArgs.entityType = "deal";
				mutationArgs.entityId = args.dealCode;
				displayTarget = args.dealCode;
			} else if (args.companyCode) {
				mutationArgs.entityType = "company";
				mutationArgs.entityId = args.companyCode;
				displayTarget = args.companyCode;
			} else {
				return {
					ok: false as const,
					error: "No target provided to commit_send_message.",
				};
			}

			const messageId = (await toolMutation(
				tc,
				"crm/shared/messages/mutations:send",
				mutationArgs,
			)) as string;

			const previewBody =
				args.content.length > 80 ? `${args.content.slice(0, 80)}…` : args.content;

			return {
				ok: true as const,
				data: { messageId, target: displayTarget },
				summary: {
					headline: `Sent message to ${displayTarget}`,
					table: [
						{ label: "To", value: displayTarget },
						{ label: "Message", value: previewBody },
					],
					suggestedNext: [
						{
							label: "Schedule a follow-up",
							intent: `Schedule a follow-up with ${displayTarget} for next week`,
						},
						{
							label: "View thread",
							intent: `Show me the recent messages with ${displayTarget}`,
						},
					],
				},
			};
		}),
});

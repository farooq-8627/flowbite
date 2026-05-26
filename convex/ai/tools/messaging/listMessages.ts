/**
 * convex/ai/tools/messaging/listMessages.ts
 *
 * Read-only `list_messages` tool. Routes to one of:
 *   - listForConversationForAI  (when conversationId is supplied)
 *   - listForEntityForAI        (when personCode/dealCode/companyCode is supplied)
 *   - listForPersonForAI        (when personCode + scope=allEntities is supplied)
 *   - listInboxForAI            (when no target is given — defaults to inbox)
 *
 * Atomic — no propose / commit. Permission gate: `messages.view`.
 */
import { z } from "zod";
import { registerTool } from "../../toolRegistry";
import { coerceInt, optionalString, requirePermission, runTool, toolQuery } from "../_shared";
import { getMessagingCtx } from "./_context";

type MessageRow = {
	_id: string;
	_creationTime: number;
	conversationId: string;
	authorId: string;
	authorType?: string;
	content: string;
	createdAt: number;
	editedAt?: number;
	entityType?: string;
	entityId?: string;
	personCode?: string;
};

registerTool({
	name: "list_messages",
	layer: "messaging",
	permission: "messages.view",
	confirmation: "none",
	description: "Read recent messages — for a conversation, an entity, a person, or the inbox.",
	instruction: {
		whenToCall:
			"Use when the user asks to see / read / show / list / summarise messages — either a specific thread (conversation/person/deal/company) or their inbox at large.",
		whenNotToCall:
			"the user is asking about activity in general (use list_org_timeline if available) OR about notes (use search_crm with type filter).",
		preflight: ["search_crm"],
		synonyms: [
			"show messages",
			"read thread",
			"what did Sara say",
			"latest chat",
			"my inbox",
			"unread messages",
		],
		goodExample: {
			description: "User: 'What did Sara message me last week?' (Sara is P-014.)",
			args: { personCode: "P-014", limit: 25 },
		},
		badExample: {
			description: "User: 'Show messages.'",
			args: {},
			whyBad: "Without a target this defaults to the inbox view, which may be 50+ rows. Ask first whether the user wants a specific thread or the inbox.",
		},
	},
	runbook: {
		onSuccess:
			"Summarise in 1-3 sentences. Quote at most 1 sender per sentence. If the result has > 5 messages, mention the count + offer to expand a specific sender.",
		onEmpty: "Tell the user no messages match. Suggest a different target or `send_message`.",
		suggestNext: "send_message",
	},
	schema: z.object({
		personCode: optionalString().describe(
			"Person code (e.g. P-014) to list messages for that person.",
		),
		dealCode: optionalString().describe("Deal code (e.g. D-007)."),
		companyCode: optionalString().describe("Company code (e.g. C-003)."),
		conversationId: optionalString().describe("Existing conversation id."),
		inbox: z
			.boolean()
			.optional()
			.describe(
				"When true, list the user's recent inbox conversations across the org. Defaults to false.",
			),
		filter: z
			.enum(["all", "unread", "ai", "mine"])
			.optional()
			.describe("Inbox filter (only honoured when inbox=true)."),
		limit: coerceInt((n) => n.min(1).max(100).default(25)),
	}),
	execute: async (args) =>
		runTool(async () => {
			const tc = getMessagingCtx();
			requirePermission(tc.permissions, "messages.view");

			// Inbox path — no target.
			if (args.inbox) {
				const rows = (await toolQuery(tc, "crm/shared/messages/queries:listInbox", {
					orgId: tc.orgId,
					filter: args.filter ?? "all",
					limit: args.limit,
				})) as MessageRow[];
				return {
					ok: true as const,
					data: { count: rows.length, scope: "inbox", messages: rows },
					display: {
						kind: "text" as const,
						text:
							rows.length === 0
								? "Your inbox is empty."
								: `${rows.length} thread(s) in your inbox.`,
					},
				};
			}

			if (args.conversationId) {
				const rows = (await toolQuery(
					tc,
					"crm/shared/messages/queries:listForConversation",
					{
						orgId: tc.orgId,
						conversationId: args.conversationId,
						limit: args.limit,
					},
				)) as MessageRow[];
				return {
					ok: true as const,
					data: { count: rows.length, scope: "conversation", messages: rows },
					display: {
						kind: "text" as const,
						text:
							rows.length === 0
								? "No messages in that thread yet."
								: `${rows.length} message(s) in the thread.`,
					},
				};
			}

			let entityType: "person" | "deal" | "company" | undefined;
			let entityId: string | undefined;
			let displayTarget = "";
			if (args.personCode) {
				entityType = "person";
				entityId = args.personCode;
				displayTarget = `Person ${args.personCode}`;
			} else if (args.dealCode) {
				entityType = "deal";
				entityId = args.dealCode;
				displayTarget = `Deal ${args.dealCode}`;
			} else if (args.companyCode) {
				entityType = "company";
				entityId = args.companyCode;
				displayTarget = `Company ${args.companyCode}`;
			}

			if (!entityType || !entityId) {
				return {
					ok: false as const,
					error: "Provide one of: personCode / dealCode / companyCode / conversationId, or set inbox=true.",
				};
			}

			const result = (await toolQuery(tc, "crm/shared/messages/queries:listForEntity", {
				orgId: tc.orgId,
				entityType,
				entityId,
				limit: args.limit,
			})) as { conversation: unknown; messages: MessageRow[] };

			const rows = result?.messages ?? [];
			return {
				ok: true as const,
				data: { count: rows.length, scope: entityType, messages: rows },
				display: {
					kind: "text" as const,
					text:
						rows.length === 0
							? `No messages with ${displayTarget} yet.`
							: `${rows.length} message(s) with ${displayTarget}.`,
				},
			};
		}),
});

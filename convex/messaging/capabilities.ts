/**
 * Messaging capabilities — the AI-callable surface for in-app chat
 * threads (the canonical `conversations` + `messages` schema). Wraps
 * the existing `*ForAI` internal twins under
 * `convex/crm/shared/{conversations,messages}/`; never re-implements
 * business logic.
 *
 * Surface (8 caps in the `messaging` group):
 *
 *   send_message          insert a message into a conversation
 *   list_messages         read recent messages by conversationId
 *                         OR by (entityType+entityCode) OR by personCode
 *   list_inbox            user's most-recent conversations across the org
 *   start_dm              ensure a 1:1 DM thread with another member
 *   manage_conversation   rename / archive / unarchive a conversation
 *   add_participants      add member(s) to a thread
 *   remove_participant    remove a member from a thread (or self-leave)
 *   mark_thread_read      flip the caller's lastReadAt to now
 *   set_thread_notify     update the caller's per-thread notification level
 *
 * Group invariants (mirrored in the playbook below — keep both in sync):
 *
 *   1. The AI ALWAYS sends with `authorType: "ai"` (the *ForAI* twin
 *      defaults to that). Don't pass `authorType: "user"` — the activity
 *      log + the chat avatar would mis-attribute the message to the
 *      acting member.
 *   2. The "person" entity type maps to `personCode` (P-NNN) — the
 *      conversation table keys on (entityType, entityId) where entityId
 *      is a string, NOT a Convex Id. P-NNN flows through unchanged.
 *   3. Outbound WhatsApp drafting is OUT OF SCOPE for v1 — the public
 *      mutation accepts `channel:"whatsapp"` but the V2 surface does
 *      NOT expose that field. WhatsApp ingress lands via the integration
 *      worker, not the AI.
 *   4. `manage_conversation` is a single capability with a discriminated
 *      `mode: "rename" | "archive" | "unarchive"` arg — chosen over three
 *      separate capabilities so the prompt catalogue stays compact AND
 *      the model picks the action by name, not by guessing tool-call
 *      verbs from synonyms.
 *   5. `remove_participant` uses the same gate as the public mutation:
 *      conversation owner OR `messages.viewAll` moderator OR self-removal.
 *      The capability surfaces "self-leave" via a missing `targetUserId`
 *      arg (the impl interprets that as the calling user).
 *   6. Permission keys mirror the underlying mutations exactly:
 *      `messages.view` (reads), `messages.send` (send + react),
 *      `messages.editOwn` / `deleteOwn` (the V1 handles those — V2
 *      doesn't ship them as separate caps), `messages.subscribe`
 *      (add/remove participants), `conversations.archive`.
 */
import { z } from "zod";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { defineCapability } from "../ai/registry/define";
import { defineGroup } from "../ai/registry/groups";
import { failed, ok } from "../ai/registry/result";
import type { CapabilityCtx } from "../ai/registry/types";

// ─── Closed unions (mirror the schema validators) ──────────────────────────

const ENTITY_TYPE_FOR_CHAT = z.enum([
	"lead",
	"contact",
	"deal",
	"company",
	"person",
	"user",
	"project",
	"task",
]);
type EntityTypeForChat = z.infer<typeof ENTITY_TYPE_FOR_CHAT>;

const NOTIFICATION_LEVEL = z.enum(["all", "mentions", "none"]);

const PARTICIPANT_ROLE = z.enum(["participant", "watcher"]);

const MANAGE_MODE = z.enum(["rename", "archive", "unarchive"]);

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Resolve an entity reference to a (entityType, entityId) string pair the
 * conversations table keys on. `entityType:"user"` keeps the raw user-id
 * passthrough so we can address by Convex `_id` when the AI needs to start
 * a DM with a specific member; everything else accepts an entity-code
 * (P-NNN / D-NNN / C-NNN) and resolves via `aiEntityPatch.resolveEntityCode`.
 */
async function resolveEntityRef(
	ctx: CapabilityCtx,
	args: { entityType: EntityTypeForChat; entityCode?: string; entityId?: string },
): Promise<{ entityType: EntityTypeForChat; entityId: string } | { error: string }> {
	if (args.entityType === "user") {
		if (!args.entityId) return { error: "user threads require entityId (a Convex user _id)." };
		return { entityType: "user", entityId: args.entityId };
	}
	if (args.entityType === "task" || args.entityType === "project") {
		if (!args.entityId)
			return { error: `${args.entityType} threads require entityId (a Convex _id).` };
		return { entityType: args.entityType, entityId: args.entityId };
	}

	// lead / contact / deal / company / person — code-based.
	if (!args.entityCode) {
		return {
			error: `${args.entityType} threads require entityCode (P-NNN / D-NNN / C-NNN).`,
		};
	}

	// Map "person" to "lead" for resolution — personCode flows on the lead row.
	const mapToResolverType: Record<EntityTypeForChat, "lead" | "contact" | "deal" | "company"> = {
		lead: "lead",
		contact: "contact",
		person: "lead",
		deal: "deal",
		company: "company",
		user: "lead", // unreachable — guarded above
		project: "lead",
		task: "lead",
	};

	const resolved = (await ctx.ctx.runMutation(internal.ai.aiEntityPatch.resolveEntityCode, {
		orgId: ctx.principal.orgId,
		userId: ctx.principal.userId,
		entityType: mapToResolverType[args.entityType],
		code: args.entityCode,
	})) as { entityType: string; entityId: string; canonicalCode: string };

	return { entityType: args.entityType, entityId: resolved.entityId };
}

// ─── Group playbook ─────────────────────────────────────────────────────────

defineGroup({
	name: "messaging",
	playbook: `Read first → \`list_inbox\` (org-wide recent threads) or \`list_messages\` (single conversation / entity / person scope) before composing. Find the conversationId from the result so subsequent calls don't re-resolve.

Send → \`send_message\` with EITHER \`conversationId\` (when known) OR \`{entityType, entityCode}\` (the mutation auto-creates the thread on first message). The AI ALWAYS sends as \`authorType: "ai"\` — never spoof a user. \`mentions: ["userId"]\` triggers per-recipient notifications.

Start a DM → \`start_dm\` with the target member's user _id. The mutation upserts a 1:1 thread keyed on the (caller, target) pair so re-running is safe.

Conversation lifecycle → \`manage_conversation\` with \`mode: "rename" | "archive" | "unarchive"\`; \`add_participants\` / \`remove_participant\` for the member list; \`mark_thread_read\` to clear unread state for the caller.

Permissions: \`messages.view\` for reads, \`messages.send\` for writes + reactions, \`messages.subscribe\` for participant edits, \`conversations.archive\` for archive/unarchive. Cross-tenant safety: every read filters by membership — the AI never surfaces a thread the caller isn't a member of, even with admin permissions.`,
});

// ─── send_message ───────────────────────────────────────────────────────────

const sendMessage = defineCapability<{
	conversationId?: string;
	entityType?: EntityTypeForChat;
	entityCode?: string;
	entityId?: string;
	threadId?: string;
	content: string;
	replyToId?: string;
	mentions?: string[];
}>({
	name: "send_message",
	module: "messaging",
	group: "messaging",
	permission: "messages.send",
	risk: "reversible",
	channels: ["chat", "mcp", "rest"],
	spec: {
		whenToCall:
			"Send a message into a conversation. Pass `conversationId` when known (cheap path); else pass `{entityType, entityCode}` and the mutation will auto-create the thread on first message.",
		whenNotToCall:
			"the user wants to send WhatsApp / SMS — that ships via the integration worker, not the AI.",
		requiredClarifications: ["content"],
		synonyms: ["post", "reply", "say", "comment", "send chat"],
		goodExample: {
			entityType: "deal",
			entityCode: "D-007",
			content: "Following up on the proposal — let me know if Tuesday works.",
		},
		badExample: {
			args: { entityType: "lead", content: "Test" },
			why: "When conversationId isn't known, you must pass entityCode (P-NNN / D-NNN / C-NNN).",
		},
	},
	drive: {
		onSuccess:
			"Confirm in one short sentence with the conversation context (entityCode if available). Don't quote the message body — the chat surface renders it.",
	},
	input: z
		.object({
			conversationId: z
				.string()
				.optional()
				.describe("Existing conversation _id. When set, entity fields are ignored."),
			entityType: ENTITY_TYPE_FOR_CHAT.optional().describe(
				"Entity kind to attach the new conversation to. Required when conversationId isn't set.",
			),
			entityCode: z
				.string()
				.optional()
				.describe(
					"Public code (P-NNN / D-NNN / C-NNN) — used with entityType to resolve / create the thread.",
				),
			entityId: z
				.string()
				.optional()
				.describe(
					"Convex _id passthrough — only valid for entityType='user' (DM) / 'project' / 'task'.",
				),
			threadId: z
				.string()
				.optional()
				.describe("Optional secondary thread key under the same entity."),
			content: z.string().min(1).describe("Message body. Markdown supported."),
			replyToId: z
				.string()
				.optional()
				.describe("Reply target — the original message's Convex _id."),
			mentions: z
				.array(z.string())
				.optional()
				.describe("User _ids to @-mention (each receives a notification)."),
		})
		.refine((v) => !!v.conversationId || !!v.entityType, {
			message: "Pass either conversationId OR entityType + entityCode/entityId.",
		}),
	run: async (cap, args) => {
		const { ctx, principal } = cap;

		let entityType: EntityTypeForChat | undefined;
		let entityId: string | undefined;
		if (!args.conversationId && args.entityType) {
			const resolved = await resolveEntityRef(cap, {
				entityType: args.entityType,
				entityCode: args.entityCode,
				entityId: args.entityId,
			});
			if ("error" in resolved) return failed("not_found", resolved.error);
			entityType = resolved.entityType;
			entityId = resolved.entityId;
		}

		const messageId = (await ctx.runMutation(internal.crm.shared.messages.mutations.sendForAI, {
			orgId: principal.orgId,
			userId: principal.userId,
			conversationId: args.conversationId as Id<"conversations"> | undefined,
			entityType,
			entityId,
			threadId: args.threadId,
			content: args.content,
			replyToId: args.replyToId as Id<"messages"> | undefined,
			mentions: args.mentions as Id<"users">[] | undefined,
		})) as Id<"messages">;

		const preview = args.content.length > 80 ? `${args.content.slice(0, 77)}…` : args.content;
		return ok({
			headline: args.entityCode
				? `Sent message to ${args.entityCode}.`
				: "Sent message to conversation.",
			changes: [
				...(args.entityCode
					? [{ label: "Thread", value: args.entityCode, emphasis: "added" as const }]
					: []),
				{ label: "Excerpt", value: preview, emphasis: "added" },
			],
			data: { messageId, conversationId: args.conversationId, entityType, entityId },
		});
	},
});

// ─── list_messages ──────────────────────────────────────────────────────────

const listMessages = defineCapability<{
	conversationId?: string;
	entityType?: EntityTypeForChat;
	entityCode?: string;
	entityId?: string;
	personCode?: string;
	threadId?: string;
	limit?: number;
}>({
	name: "list_messages",
	module: "messaging",
	group: "messaging",
	permission: "messages.view",
	risk: "safe",
	channels: ["chat", "whatsapp", "mcp", "rest"],
	spec: {
		whenToCall:
			"Read recent messages from a thread. Pass ONE OF: `conversationId` (cheap path); `{entityType, entityCode}` (resolves to a thread); `personCode` (every message attached to a person across threads).",
		whenNotToCall:
			"the user wants the org-wide most-recent threads — call list_inbox. The user wants the activity timeline — call list_org_timeline.",
		synonyms: ["read messages", "show chat", "thread history"],
		goodExample: { conversationId: "k123abc", limit: 50 },
	},
	drive: {
		onSuccess:
			"Narrate the count + the most-recent author + a one-line excerpt of the latest message. The result card carries the full list.",
		onEmpty: "No messages in this thread yet — offer to send one.",
	},
	input: z
		.object({
			conversationId: z.string().optional(),
			entityType: ENTITY_TYPE_FOR_CHAT.optional(),
			entityCode: z.string().optional(),
			entityId: z.string().optional(),
			personCode: z.string().optional(),
			threadId: z.string().optional(),
			limit: z.number().int().min(1).max(200).optional().default(50),
		})
		.refine((v) => !!v.conversationId || !!v.personCode || (!!v.entityType && !!v.entityCode), {
			message: "Pass conversationId, personCode, or entityType+entityCode (one is required).",
		}),
	run: async (cap, args) => {
		const { ctx, principal } = cap;
		const limit = args.limit ?? 50;

		if (args.conversationId) {
			const rows = (await ctx.runQuery(
				internal.crm.shared.messages.queries.listForConversationForAI,
				{
					orgId: principal.orgId,
					userId: principal.userId,
					conversationId: args.conversationId as Id<"conversations">,
					limit,
				},
			)) as Array<{
				_id: string;
				content: string;
				authorType: string;
				createdAt: number;
			}>;
			if (rows.length === 0) {
				return ok({
					headline: "No messages in this thread yet.",
					data: { messages: [] as unknown[] },
				});
			}
			return ok({
				headline: `${rows.length} message${rows.length === 1 ? "" : "s"} (most recent first).`,
				changes: rows.slice(0, 5).map((m) => ({
					label: m.authorType,
					value: m.content.slice(0, 80),
					emphasis: "unchanged" as const,
				})),
				data: { messages: rows },
			});
		}

		if (args.personCode) {
			const rows = (await ctx.runQuery(
				internal.crm.shared.messages.queries.listForPersonForAI,
				{
					orgId: principal.orgId,
					userId: principal.userId,
					personCode: args.personCode,
					limit,
				},
			)) as Array<{
				_id: string;
				content: string;
				authorType: string;
				createdAt: number;
			}>;
			if (rows.length === 0) {
				return ok({
					headline: `No messages found for ${args.personCode}.`,
					data: { messages: [] as unknown[] },
				});
			}
			return ok({
				headline: `${rows.length} message${rows.length === 1 ? "" : "s"} for ${args.personCode}.`,
				changes: rows.slice(0, 5).map((m) => ({
					label: m.authorType,
					value: m.content.slice(0, 80),
					emphasis: "unchanged" as const,
				})),
				data: { messages: rows },
			});
		}

		// Entity-scope path
		if (args.entityType && args.entityCode) {
			const resolved = await resolveEntityRef(cap, {
				entityType: args.entityType,
				entityCode: args.entityCode,
				entityId: args.entityId,
			});
			if ("error" in resolved) return failed("not_found", resolved.error);
			const result = (await ctx.runQuery(
				internal.crm.shared.messages.queries.listForEntityForAI,
				{
					orgId: principal.orgId,
					userId: principal.userId,
					entityType: resolved.entityType,
					entityId: resolved.entityId,
					threadId: args.threadId,
					limit,
				},
			)) as { conversation: unknown | null; messages: unknown[] };
			const messages = result.messages as Array<{ content: string; authorType: string }>;
			if (messages.length === 0) {
				return ok({
					headline: `No messages on ${args.entityCode} yet.`,
					data: { messages: [], conversation: result.conversation },
				});
			}
			return ok({
				headline: `${messages.length} message${messages.length === 1 ? "" : "s"} on ${args.entityCode}.`,
				changes: messages.slice(0, 5).map((m) => ({
					label: m.authorType,
					value: m.content.slice(0, 80),
					emphasis: "unchanged" as const,
				})),
				data: { messages, conversation: result.conversation },
			});
		}

		// Should be unreachable — schema refine guards this.
		return failed("needs_repair", "Pass conversationId, personCode, or entityType+entityCode.");
	},
});

// ─── list_inbox ─────────────────────────────────────────────────────────────

const listInbox = defineCapability<{
	filter?: "all" | "unread" | "ai" | "mine";
	limit?: number;
}>({
	name: "list_inbox",
	module: "messaging",
	group: "messaging",
	permission: "messages.view",
	risk: "safe",
	channels: ["chat", "whatsapp", "mcp", "rest"],
	spec: {
		whenToCall:
			"Read the user's most-recent conversations across the org — one row per thread, newest first. Filter by `unread` / `ai` (AI-authored most-recent) / `mine` (caller-authored most-recent).",
		whenNotToCall: "the caller already knows the conversationId — call list_messages directly.",
		synonyms: ["inbox", "recent chats", "what's new", "unread threads"],
		goodExample: { filter: "unread", limit: 25 },
	},
	drive: {
		onSuccess:
			"Narrate the total count + the top 3 by recency. The result card carries the full list.",
		onEmpty:
			"No conversations match. Offer to drop the filter or start a new thread on a specific record.",
	},
	input: z.object({
		filter: z
			.enum(["all", "unread", "ai", "mine"])
			.optional()
			.describe("Optional filter; default `all`."),
		limit: z.number().int().min(1).max(100).optional().default(50),
	}),
	run: async (cap, args) => {
		const { ctx, principal } = cap;
		const rows = (await ctx.runQuery(internal.crm.shared.messages.queries.listInboxForAI, {
			orgId: principal.orgId,
			userId: principal.userId,
			filter: args.filter,
			limit: args.limit ?? 50,
		})) as Array<{
			_id: string;
			conversationId: string;
			authorType: string;
			content: string;
			createdAt: number;
		}>;
		if (rows.length === 0) {
			return ok({
				headline: "No conversations match.",
				data: { conversations: [] as unknown[] },
			});
		}
		return ok({
			headline: `${rows.length} conversation${rows.length === 1 ? "" : "s"}${args.filter && args.filter !== "all" ? ` (${args.filter})` : ""}.`,
			changes: rows.slice(0, 5).map((m) => ({
				label: m.authorType,
				value: m.content.slice(0, 80),
				emphasis: "unchanged" as const,
			})),
			data: { conversations: rows },
		});
	},
});

// ─── start_dm ───────────────────────────────────────────────────────────────

const startDm = defineCapability<{ targetUserId: string }>({
	name: "start_dm",
	module: "messaging",
	group: "messaging",
	permission: "messages.view",
	risk: "reversible",
	channels: ["chat", "mcp", "rest"],
	spec: {
		whenToCall:
			"Ensure a 1:1 DM thread between the caller and another org member. Idempotent — re-running returns the existing conversation _id.",
		whenNotToCall:
			"the user wants a multi-party thread on a record — use `send_message` with entityType+entityCode (auto-creates a record-scoped thread).",
		requiredClarifications: ["targetUserId"],
		synonyms: ["DM", "direct message", "private chat", "1:1"],
		goodExample: { targetUserId: "k789ghi" },
		badExample: {
			args: { targetUserId: "Sara" },
			why: "targetUserId must be the Convex _id. Resolve via `list_members` first.",
		},
	},
	drive: {
		onSuccess: "Confirm with the conversation _id; the chat surface opens the thread.",
	},
	input: z.object({
		targetUserId: z.string().min(1).describe("Target member's Convex user _id."),
	}),
	run: async (cap, args) => {
		const { ctx, principal } = cap;
		const conversationId = (await ctx.runMutation(
			internal.crm.shared.conversations.mutations.ensureDirectMessageForAI,
			{
				orgId: principal.orgId,
				userId: principal.userId,
				targetUserId: args.targetUserId as Id<"users">,
			},
		)) as Id<"conversations">;
		return ok({
			headline: "DM thread ready.",
			changes: [
				{
					label: "Conversation",
					value: conversationId as unknown as string,
					emphasis: "added",
				},
			],
			data: { conversationId },
		});
	},
});

// ─── manage_conversation ────────────────────────────────────────────────────

const manageConversation = defineCapability<{
	conversationId: string;
	mode: "rename" | "archive" | "unarchive";
	title?: string;
}>({
	name: "manage_conversation",
	module: "messaging",
	group: "messaging",
	permission: "messages.view",
	risk: "reversible",
	channels: ["chat", "mcp", "rest"],
	spec: {
		whenToCall:
			"Lifecycle edit on a conversation: rename, archive (hide from inbox), or unarchive. The caller must be a member of the thread.",
		whenNotToCall:
			"the user wants to leave / be removed / add another member — call leave / remove_participant / add_participants.",
		requiredClarifications: ["conversationId", "mode"],
		synonyms: ["rename thread", "archive chat", "unarchive chat", "title chat"],
		goodExample: { conversationId: "k123abc", mode: "rename", title: "Q3 sales push" },
		badExample: {
			args: { conversationId: "k123abc", mode: "rename" },
			why: "mode='rename' requires a non-empty title.",
		},
	},
	drive: {
		onSuccess: "Confirm in one short sentence with the new state.",
	},
	input: z
		.object({
			conversationId: z.string().min(1).describe("Conversation _id."),
			mode: MANAGE_MODE,
			title: z.string().optional().describe("New title — required when mode='rename'."),
		})
		.refine((v) => v.mode !== "rename" || !!v.title?.trim(), {
			message: "mode='rename' requires title.",
		}),
	run: async (cap, args) => {
		const { ctx, principal } = cap;
		const conversationId = args.conversationId as Id<"conversations">;
		switch (args.mode) {
			case "rename":
				await ctx.runMutation(internal.crm.shared.conversations.mutations.renameForAI, {
					orgId: principal.orgId,
					userId: principal.userId,
					conversationId,
					title: args.title ?? "",
				});
				return ok({
					headline: "Conversation renamed.",
					changes: [{ label: "Title", value: args.title ?? "", emphasis: "changed" }],
					data: { conversationId, title: args.title },
				});
			case "archive":
				await ctx.runMutation(internal.crm.shared.conversations.mutations.archiveForAI, {
					orgId: principal.orgId,
					userId: principal.userId,
					conversationId,
				});
				return ok({
					headline: "Conversation archived.",
					data: { conversationId, archived: true },
				});
			case "unarchive":
				await ctx.runMutation(internal.crm.shared.conversations.mutations.unarchiveForAI, {
					orgId: principal.orgId,
					userId: principal.userId,
					conversationId,
				});
				return ok({
					headline: "Conversation unarchived.",
					data: { conversationId, archived: false },
				});
		}
	},
});

// ─── add_participants ───────────────────────────────────────────────────────

const addParticipants = defineCapability<{
	conversationId: string;
	userIds: string[];
	role?: "participant" | "watcher";
	notificationLevel?: "all" | "mentions" | "none";
}>({
	name: "add_participants",
	module: "messaging",
	group: "messaging",
	permission: "messages.subscribe",
	risk: "reversible",
	channels: ["chat", "mcp", "rest"],
	spec: {
		whenToCall:
			"Add one or more members to a conversation. Caller must be a thread owner OR hold `messages.viewAll` (admin moderator). Each new participant gets a `conversation_invite` notification.",
		whenNotToCall:
			"the user wants to start a new DM — use start_dm. The user wants to send a message — call send_message (the mutation auto-adds the caller).",
		requiredClarifications: ["conversationId", "userIds"],
		synonyms: ["invite to chat", "add member to thread"],
		goodExample: {
			conversationId: "k123abc",
			userIds: ["k789ghi"],
			role: "participant",
		},
	},
	drive: {
		onSuccess: "Confirm with the count of newly-added members.",
	},
	input: z.object({
		conversationId: z.string().min(1),
		userIds: z.array(z.string().min(1)).min(1).max(20),
		role: PARTICIPANT_ROLE.optional(),
		notificationLevel: NOTIFICATION_LEVEL.optional(),
	}),
	run: async (cap, args) => {
		const { ctx, principal } = cap;
		const result = (await ctx.runMutation(
			internal.crm.shared.conversations.mutations.addParticipantsForAI,
			{
				orgId: principal.orgId,
				userId: principal.userId,
				conversationId: args.conversationId as Id<"conversations">,
				userIds: args.userIds as Id<"users">[],
				role: args.role,
				notificationLevel: args.notificationLevel,
			},
		)) as { added: number };
		return ok({
			headline: `Added ${result.added} member${result.added === 1 ? "" : "s"} to the conversation.`,
			changes: [{ label: "Added", value: String(result.added), emphasis: "added" as const }],
			data: { conversationId: args.conversationId, added: result.added },
		});
	},
});

// ─── remove_participant ─────────────────────────────────────────────────────

const removeParticipant = defineCapability<{
	conversationId: string;
	targetUserId?: string;
}>({
	name: "remove_participant",
	module: "messaging",
	group: "messaging",
	permission: "messages.subscribe",
	risk: "reversible",
	channels: ["chat", "mcp", "rest"],
	spec: {
		whenToCall:
			"Remove a member from a thread. Pass `targetUserId` to remove someone else (requires owner or `messages.viewAll`); omit to leave yourself. Self-leave records a `conversation_left` activity row; admin removal records `conversation_member_removed`.",
		whenNotToCall:
			"the user wants to archive the whole thread — call manage_conversation with mode='archive'.",
		requiredClarifications: ["conversationId"],
		synonyms: ["leave chat", "kick from thread", "remove member"],
		goodExample: { conversationId: "k123abc", targetUserId: "k789ghi" },
	},
	drive: {
		onSuccess:
			"Reply 'Left the conversation.' on self-leave; 'Removed <userId> from the conversation.' on admin removal.",
	},
	input: z.object({
		conversationId: z.string().min(1),
		targetUserId: z.string().optional(),
	}),
	run: async (cap, args) => {
		const { ctx, principal } = cap;
		const target = args.targetUserId ?? (principal.userId as unknown as string);
		const isSelf = target === (principal.userId as unknown as string);

		if (isSelf) {
			await ctx.runMutation(internal.crm.shared.conversations.mutations.leaveForAI, {
				orgId: principal.orgId,
				userId: principal.userId,
				conversationId: args.conversationId as Id<"conversations">,
			});
			return ok({
				headline: "Left the conversation.",
				data: { conversationId: args.conversationId, left: true },
			});
		}

		await ctx.runMutation(internal.crm.shared.conversations.mutations.removeParticipantForAI, {
			orgId: principal.orgId,
			userId: principal.userId,
			conversationId: args.conversationId as Id<"conversations">,
			targetUserId: target as Id<"users">,
		});
		return ok({
			headline: "Removed member from conversation.",
			changes: [{ label: "Removed", value: target, emphasis: "changed" as const }],
			data: { conversationId: args.conversationId, removed: target },
		});
	},
});

// ─── mark_thread_read ───────────────────────────────────────────────────────

const markThreadRead = defineCapability<{ conversationId: string }>({
	name: "mark_thread_read",
	module: "messaging",
	group: "messaging",
	permission: "messages.view",
	risk: "reversible",
	channels: ["chat", "whatsapp", "mcp", "rest"],
	spec: {
		whenToCall:
			"Flip the caller's `lastReadAt` to now for one conversation. Idempotent — already-current rows are silently no-op.",
		whenNotToCall: "the user wants to mark every thread read — that's a v2 ergonomic surface.",
		requiredClarifications: ["conversationId"],
		synonyms: ["mark thread read", "clear unread", "ack messages"],
		goodExample: { conversationId: "k123abc" },
	},
	drive: {
		onSuccess: "Confirm in one short sentence — 'Marked thread as read.'.",
	},
	input: z.object({
		conversationId: z.string().min(1),
	}),
	run: async (cap, args) => {
		const { ctx, principal } = cap;
		await ctx.runMutation(internal.crm.shared.conversations.mutations.markReadForAI, {
			orgId: principal.orgId,
			userId: principal.userId,
			conversationId: args.conversationId as Id<"conversations">,
		});
		return ok({
			headline: "Marked thread as read.",
			data: { conversationId: args.conversationId },
		});
	},
});

// ─── set_thread_notify ──────────────────────────────────────────────────────

const setThreadNotify = defineCapability<{
	conversationId: string;
	level: "all" | "mentions" | "none";
}>({
	name: "set_thread_notify",
	module: "messaging",
	group: "messaging",
	permission: "messages.view",
	risk: "reversible",
	channels: ["chat", "mcp", "rest"],
	spec: {
		whenToCall:
			"Update the caller's per-thread notification level: `all` (every new message), `mentions` (only @-mentions), `none` (mute).",
		whenNotToCall:
			"the user wants org-wide muting — that's a Settings → Notifications surface.",
		requiredClarifications: ["conversationId", "level"],
		synonyms: ["mute thread", "unmute thread", "thread notifications"],
		goodExample: { conversationId: "k123abc", level: "mentions" },
	},
	drive: {
		onSuccess: "Confirm with the new level.",
	},
	input: z.object({
		conversationId: z.string().min(1),
		level: NOTIFICATION_LEVEL,
	}),
	run: async (cap, args) => {
		const { ctx, principal } = cap;
		await ctx.runMutation(
			internal.crm.shared.conversations.mutations.updateNotificationLevelForAI,
			{
				orgId: principal.orgId,
				userId: principal.userId,
				conversationId: args.conversationId as Id<"conversations">,
				level: args.level,
			},
		);
		return ok({
			headline: `Thread notifications set to ${args.level}.`,
			changes: [{ label: "Level", value: args.level, emphasis: "changed" as const }],
			data: { conversationId: args.conversationId, level: args.level },
		});
	},
});

// ─── Public surface ─────────────────────────────────────────────────────────

export const MESSAGING_CAPABILITIES = [
	sendMessage,
	listMessages,
	listInbox,
	startDm,
	manageConversation,
	addParticipants,
	removeParticipant,
	markThreadRead,
	setThreadNotify,
];

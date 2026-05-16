/**
 * Schema — CRM shared domain.
 *
 * Tables:
 *   - conversations         (NEW — production multi-participant chat)
 *   - conversationMembers   (NEW — per-user thread state, read receipts, notif level)
 *   - messages              (rewritten — conversationId-keyed, idempotent, soft-delete, mentions)
 *   - notes                 (existing)
 *   - reminders             (existing)
 *   - tags / entityTags     (existing)
 *   - savedViews            (existing)
 *   - companyMembers        (existing — denormalized join)
 *
 * The `conversations` + `conversationMembers` + `messages` triple replaces the
 * earlier flat `messages` table with `readBy[]`. Reasons (production-grade):
 *
 *   1. Multi-participant fan-out without scanning every message — one
 *      `conversationMembers` row per (convo, user) is the canonical "who is
 *      in this thread, what's their unread state, what's their notification
 *      preference".
 *   2. Per-user inbox queries become an indexed lookup on
 *      `conversationMembers.by_user_and_lastRead` rather than scanning the
 *      `messages` table and reducing.
 *   3. Read receipts scale linearly with members, not with messages.
 *   4. Notification fan-out honours per-user `notificationLevel` (all /
 *      mentions / none) without inspecting message content.
 *   5. The same shape powers project/task chat in Phase 4 — `entityType`
 *      already accepts `"project" | "task"`.
 */

import { defineTable } from "convex/server";
import { v } from "convex/values";
import { entityTypeForChatValidator } from "../_shared/entityCodes";
import { orgScoped, softDelete, timestamps } from "../_shared/validators";

// ─── Notes ────────────────────────────────────────────────────────────────────

/**
 * Rich text notes attached to any entity. authorType distinguishes user vs AI.
 *
 * Notes are agent-written annotations: editable, pinnable, sometimes long-lived.
 * For chat-style messages between users (or AI on-behalf), use the
 * `conversations` + `messages` tables.
 */
export const notes = defineTable({
	...orgScoped,
	entityType: v.string(),
	entityId: v.string(),
	personCode: v.optional(v.string()),
	content: v.string(),
	authorId: v.id("users"),
	authorType: v.string(),
	isPinned: v.boolean(),
	isInternal: v.boolean(),
	embedding: v.optional(v.array(v.float64())),
	...timestamps,
})
	.index("by_entity", ["orgId", "entityType", "entityId"])
	.index("by_org_and_author", ["orgId", "authorId"])
	.index("by_org_and_personCode", ["orgId", "personCode"])
	.index("by_org_and_created", ["orgId", "createdAt"])
	.vectorIndex("by_embedding", {
		vectorField: "embedding",
		dimensions: 1536, // OpenAI text-embedding-3-small
		filterFields: ["orgId"],
	});

// ─── Conversations + members + messages ──────────────────────────────────────

/**
 * One conversation per (orgId, entityType, entityId, threadId?). The default
 * threadId is unset — meaning the "main thread" of the entity. Sub-threads
 * are an optional client feature; the server treats them as just another
 * conversation row.
 *
 * We denormalise `lastMessage*` onto the conversation so the inbox view is a
 * single index lookup, not an aggregation across messages.
 */
export const conversations = defineTable({
	...orgScoped,
	entityType: entityTypeForChatValidator, // typed union, never `v.string()`
	entityId: v.string(), // entity code (P-001, D-001, CO-001) or project/task id
	threadId: v.optional(v.string()), // null = main thread
	title: v.optional(v.string()), // optional override of computed title
	lastMessageAt: v.optional(v.number()),
	lastMessagePreview: v.optional(v.string()),
	lastMessageAuthorId: v.optional(v.id("users")),
	isArchived: v.boolean(),
	createdBy: v.id("users"),
	...timestamps,
})
	.index("by_org_and_entity", ["orgId", "entityType", "entityId"])
	.index("by_org_and_lastMessage", ["orgId", "lastMessageAt"])
	.index("by_org_and_archived", ["orgId", "isArchived", "lastMessageAt"]);

/**
 * Per-user state on a conversation: role, read-receipt, notification level.
 *
 * One row per (conversation, user). `leftAt` is set when a user is removed or
 * leaves themselves — historical messages stay attributed but they stop
 * receiving notifications. Re-adding a user resets `leftAt: undefined`.
 */
export const conversationMembers = defineTable({
	...orgScoped,
	conversationId: v.id("conversations"),
	userId: v.id("users"),
	role: v.union(
		v.literal("owner"), // can add/remove other members; assigned auto on creation
		v.literal("participant"), // standard
		v.literal("watcher"), // read-only (audit view)
	),
	notificationLevel: v.union(
		v.literal("all"), // every message → notification
		v.literal("mentions"), // only @mentions
		v.literal("none"), // muted
	),
	lastReadAt: v.optional(v.number()),
	joinedAt: v.number(),
	leftAt: v.optional(v.number()),
	joinedBy: v.optional(v.id("users")), // who added them; undefined = self
	joinReason: v.union(
		v.literal("auto"), // auto-add (sender, assignee)
		v.literal("invite"), // explicitly added by another member
		v.literal("mention"), // auto-added on first @mention
		v.literal("self"), // user joined themselves
	),
})
	.index("by_conversation", ["conversationId"])
	.index("by_user_and_conversation", ["userId", "conversationId"])
	.index("by_org_and_user", ["orgId", "userId"])
	.index("by_org_and_user_and_lastRead", ["orgId", "userId", "lastReadAt"]);

/**
 * Append-mostly chat messages. Always tied to a `conversationId`.
 *
 * `mentions[]` lists explicit @-mentioned users (parsed from content
 * server-side, validated against org members). `idempotencyKey` allows safe
 * client retry on flaky networks. `editedAt` and `deletedAt` enable the
 * standard edit/delete UX.
 *
 * Reactions are stored inline on the message — production-acceptable up to
 * ~50 reactions per message; if we ever blow that we'll split into a
 * `reactions` join table.
 */
export const messages = defineTable({
	...orgScoped,
	conversationId: v.id("conversations"),
	// Denormalised for fast cross-entity queries (e.g. inbox by personCode):
	entityType: entityTypeForChatValidator,
	entityId: v.string(),
	personCode: v.optional(v.string()),
	threadId: v.optional(v.string()),

	content: v.string(),
	authorId: v.id("users"),
	authorType: v.union(v.literal("user"), v.literal("ai"), v.literal("system")),
	onBehalfOf: v.optional(v.id("users")),

	replyToId: v.optional(v.id("messages")),
	attachments: v.optional(v.array(v.id("files"))),
	mentions: v.optional(v.array(v.id("users"))),

	// Idempotency: if the same (orgId, conversationId, idempotencyKey) is
	// posted twice in a row, the second call returns the first message id.
	idempotencyKey: v.optional(v.string()),

	// Reactions inline (small N expected per message).
	reactions: v.optional(
		v.array(
			v.object({
				userId: v.id("users"),
				emoji: v.string(),
				createdAt: v.number(),
			}),
		),
	),

	editedAt: v.optional(v.number()),
	...softDelete,
	...timestamps,
})
	.index("by_conversation_and_created", ["conversationId", "createdAt"])
	.index("by_org_and_created", ["orgId", "createdAt"])
	.index("by_org_and_personCode", ["orgId", "personCode", "createdAt"])
	.index("by_replyTo", ["replyToId"])
	.index("by_org_and_idempotency", ["orgId", "conversationId", "idempotencyKey"]);

// ─── Reminders ────────────────────────────────────────────────────────────────

/**
 * Follow-up reminders. followUpCode auto-generated (FU-001).
 */
export const reminders = defineTable({
	...orgScoped,
	followUpCode: v.string(),
	personCode: v.string(),
	dealCode: v.optional(v.string()),
	entityType: v.string(),
	entityId: v.string(),
	title: v.string(),
	note: v.optional(v.string()),
	dueAt: v.number(),
	assignedTo: v.id("users"),
	status: v.string(),
	completedAt: v.optional(v.number()),
	source: v.string(),
	createdAt: v.number(),
})
	.index("by_org_and_person", ["orgId", "personCode"])
	.index("by_org_and_due", ["orgId", "dueAt"])
	.index("by_org_and_status", ["orgId", "status"])
	.index("by_org_and_status_and_due", ["orgId", "status", "dueAt"])
	.index("by_user_and_due", ["assignedTo", "dueAt"]);

// ─── Tags / entityTags / savedViews / companyMembers ─────────────────────────

export const tags = defineTable({
	...orgScoped,
	name: v.string(),
	color: v.optional(v.string()),
	createdAt: v.number(),
})
	.index("by_org", ["orgId"])
	.index("by_org_and_name", ["orgId", "name"]);

export const entityTags = defineTable({
	...orgScoped,
	tagId: v.id("tags"),
	entityType: v.string(),
	entityId: v.string(),
	createdAt: v.number(),
})
	.index("by_entity", ["orgId", "entityType", "entityId"])
	.index("by_tag", ["orgId", "tagId"]);

/**
 * Filter presets pinnable to sidebar. scope: "user" (personal) | "org" (shared).
 */
export const savedViews = defineTable({
	...orgScoped,
	name: v.string(),
	entityType: v.string(),
	scope: v.string(),
	filters: v.string(),
	sortBy: v.optional(v.string()),
	sortOrder: v.optional(v.string()),
	columns: v.optional(v.array(v.string())),
	isPinned: v.boolean(),
	createdBy: v.id("users"),
	createdAt: v.number(),
	updatedAt: v.number(),
})
	.index("by_org_and_entity", ["orgId", "entityType"])
	.index("by_org_and_creator", ["orgId", "createdBy"])
	.index("by_org_and_pinned", ["orgId", "isPinned"]);

/**
 * Denormalized join: personCode → companyId. Maintained by companies.addPerson
 * / removePerson mutations. Replaces the O(N) array scan in getByPersonCode.
 */
export const companyMembers = defineTable({
	...orgScoped,
	personCode: v.string(),
	companyId: v.id("companies"),
	createdAt: v.number(),
})
	.index("by_org_and_personCode", ["orgId", "personCode"])
	.index("by_org_and_company", ["orgId", "companyId"]);

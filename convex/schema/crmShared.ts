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
import { aiExcluded, orgScoped, softDelete, timestamps } from "../_shared/validators";

// ─── Notes ────────────────────────────────────────────────────────────────────

/**
 * User-managed sticky-note categories — one row per (orgId, name).
 *
 * Replaces the old fixed 6-color enum on `notes`. Each org defines its own
 * categories ("Urgent", "Today", "Demo Scheduled", …) with a background
 * colour (hex) and an optional explicit text colour. When `textColor` is
 * unset, the UI derives a readable text colour from the bg luminance at
 * render time — see `core/comms/notes/components/note-color-utils.ts`.
 *
 * Default categories are seeded on org creation (Yellow / Blue / Green /
 * Pink / Purple / Gray) so existing notes keep their visual identity. Yellow
 * is marked `isDefault: true`. Owners can rename, archive, reorder, or
 * change defaults in Settings → CRM → Note Categories.
 */
export const noteCategories = defineTable({
	...orgScoped,
	/** Display label shown on the card and in Settings. */
	name: v.string(),
	/** Background colour as a hex string (e.g. "#fde68a"). */
	bgColor: v.string(),
	/**
	 * Optional explicit text colour. When unset, the UI derives a readable
	 * value from `bgColor` luminance.
	 */
	textColor: v.optional(v.string()),
	/** Sort order on the board and in Settings. Lower = earlier. */
	position: v.number(),
	/** New notes created without an explicit categoryId land in this one. */
	isDefault: v.boolean(),
	/**
	 * Soft archive — archived categories keep their notes but no longer show
	 * in pickers or as Kanban columns. Archived categories may not be the
	 * default.
	 */
	isArchived: v.boolean(),
	...timestamps,
})
	.index("by_org", ["orgId"])
	.index("by_org_and_position", ["orgId", "position"])
	.index("by_org_and_name", ["orgId", "name"])
	.index("by_org_and_default", ["orgId", "isDefault"]);

/**
 * Sticky-style notes attached to any entity (lead, contact, deal, company, person, org).
 *
 * Notes are agent-written annotations: editable, pinnable, sometimes long-lived.
 * The UI is a sticky-note board — `categoryId` is NOT decorative; it drives the
 * Kanban-style column the card belongs to and the per-card colour.
 *
 * Schema notes
 * ────────────
 *   - `categoryId` (optional) — reference into `noteCategories`. Optional so the
 *     org-wide page can hold uncategorised cards while a fresh org is being
 *     seeded; in steady-state every row has one (set by `notes.create` if the
 *     caller didn't pass it). The 2026-05-17 migration backfills every legacy
 *     row from the old `color` enum.
 *   - `title` (optional) — short label (≤80 chars). Most cards are body-only.
 *   - The legacy `color` + `type` enum fields were dropped from the schema
 *     on 2026-05-17 after the cleanup migration zeroed them out. Categories
 *     are the single axis now.
 *
 * For chat-style messages between users (or AI on-behalf), use the dedicated
 * `messages` table — never repurpose this one.
 */
export const notes = defineTable({
	...orgScoped,
	entityType: v.string(),
	entityId: v.string(),
	personCode: v.optional(v.string()),
	title: v.optional(v.string()),
	content: v.string(),
	categoryId: v.optional(v.id("noteCategories")),
	authorId: v.id("users"),
	authorType: v.string(),
	isPinned: v.boolean(),
	isInternal: v.boolean(),
	/**
	 * Free-position kanban order, ascending = top of column.
	 *
	 * Optional in the schema so legacy rows pass validation while the
	 * `_migrations/seedSortOrder.ts` backfill populates them. Once every
	 * row carries a value, the field is treated as required by the UI
	 * (queries fall back to `-createdAt` when absent — same visible order).
	 *
	 * Allocation strategy: gap-based integers (multiples of 1024). Inserting
	 * between A=1024 and B=2048 gives K=1536 (one mutation, no batch
	 * rewrites). When two neighbours are adjacent (gap < 2), the column is
	 * cheap to renumber on the next move.
	 */
	sortOrder: v.optional(v.number()),
	embedding: v.optional(v.array(v.float64())),
	...timestamps,
	...aiExcluded,
})
	.index("by_entity", ["orgId", "entityType", "entityId"])
	.index("by_entity_and_pinned", ["orgId", "entityType", "entityId", "isPinned", "createdAt"])
	.index("by_org_and_category", ["orgId", "categoryId", "createdAt"])
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
	authorType: v.union(
		v.literal("user"),
		v.literal("ai"),
		v.literal("system"),
		// Phase 3 (WhatsApp): inbound messages from a lead/contact who has no
		// `users` row. `authorId` still points to a real org user (the entity
		// assignee or a designated bot user) for accountability + RBAC; the
		// real sender is identified by `authorPersonCode`.
		v.literal("contact"),
	),
	onBehalfOf: v.optional(v.id("users")),

	// ── Phase 3 / WhatsApp transport metadata (additive — no migration) ──────
	/**
	 * Transport that delivered this message. `internal` = native chat in this
	 * app. `whatsapp` / `email` / `sms` = synced from an external integration.
	 * Outbound: org user types in our composer with channel="whatsapp" → a
	 *   trigger.dev worker forwards the message to WhatsApp Cloud API.
	 * Inbound: webhook arrives → resolves the lead/contact by phone → upserts
	 *   into `messages` with channel="whatsapp" + authorType="contact".
	 */
	channel: v.optional(
		v.union(v.literal("internal"), v.literal("whatsapp"), v.literal("email"), v.literal("sms")),
	),
	/**
	 * Sender's personCode when `authorType === "contact"` (lead/contact who
	 * messaged us via WhatsApp/email). Empty for normal user/ai/system rows —
	 * those are attributed via `authorId`.
	 */
	authorPersonCode: v.optional(v.string()),

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
	/**
	 * Per-user "delete for me" list — users who hid this message from
	 * their own view. Distinct from `deletedAt` which means the message
	 * is deleted for everyone (added by `softDelete` and now reserved
	 * for hard-delete tombstones written by `messages.remove({ mode:
	 * "everyone" })`).
	 *
	 * Doctrine (2026-05-19):
	 *   - "Delete for me" → adds the caller to `deletedFor[]`. Other
	 *     participants still see the message untouched. Author OR any
	 *     participant can do this for their own view.
	 *   - "Delete for everyone" → hard-deletes the row (no tombstone).
	 *     Only allowed for the author within the edit window OR for any
	 *     org member with `messages.deleteAny`. After hard-delete the
	 *     conversation's `lastMessage*` fields are recomputed from the
	 *     next-newest surviving message.
	 *
	 * The legacy `deletedAt` (from `softDelete`) is kept on the schema
	 * but is no longer written by `messages.remove`. Existing
	 * soft-deleted rows continue to be filtered out of queries via the
	 * existing `r.deletedAt === undefined` check; this field is purely
	 * additive.
	 */
	deletedFor: v.optional(v.array(v.id("users"))),
	...softDelete,
	...timestamps,
})
	.index("by_conversation_and_created", ["conversationId", "createdAt"])
	.index("by_org_and_created", ["orgId", "createdAt"])
	.index("by_org_and_personCode", ["orgId", "personCode", "createdAt"])
	.index("by_replyTo", ["replyToId"])
	.index("by_org_and_idempotency", ["orgId", "conversationId", "idempotencyKey"]);

// ─── Tasks ────────────────────────────────────────────────────────────────────

/**
 * The canonical scheduling table. Replaces the legacy `reminders` +
 * `followups` UX per TASKS-RENAME-PLAN.md (Stage 4D landed the schema
 * removal). One table, one `type` discriminator
 * (`todo`/`call`/`email`/`meeting`/`followup`), one auto-generated
 * public code (`T-001`).
 */
export const tasks = defineTable({
	...orgScoped,
	taskCode: v.string(),
	// Per-org task type catalog (B.46) — `org.settings.taskTypes` may
	// extend the system defaults (`todo`/`call`/`email`/`meeting`/
	// `followup`). The schema accepts ANY string so a custom type
	// (`"site_visit"`, `"demo"`) lands cleanly. Validation against
	// the org's effective catalog happens at the AI capability layer
	// (`tasks/capabilities.ts:validateTaskType`) and at the public
	// mutation surface (the form UI surfaces only enabled types).
	type: v.string(),
	personCode: v.optional(v.string()),
	dealCode: v.optional(v.string()),
	entityType: v.string(),
	entityId: v.string(),
	title: v.string(),
	note: v.optional(v.string()),
	dueAt: v.number(),
	assignedTo: v.id("users"),
	status: v.union(v.literal("pending"), v.literal("completed")),
	completedAt: v.optional(v.number()),
	priority: v.optional(
		v.union(v.literal("low"), v.literal("normal"), v.literal("high"), v.literal("urgent")),
	),
	createdAt: v.number(),
	updatedAt: v.optional(v.number()),
	...aiExcluded,
})
	.index("by_org_and_person", ["orgId", "personCode"])
	.index("by_org_and_due", ["orgId", "dueAt"])
	.index("by_org_and_status_and_due", ["orgId", "status", "dueAt"])
	.index("by_org_and_taskCode", ["orgId", "taskCode"])
	.index("by_org_and_type_and_due", ["orgId", "type", "dueAt"])
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

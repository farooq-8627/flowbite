/**
 * Schema — CRM shared domain.
 *
 * Tables: notes, messages, reminders, tags, entityTags, savedViews, companyMembers.
 *
 * Cross-entity systems shared by leads/contacts/deals/companies.
 */

import { defineTable } from "convex/server";
import { v } from "convex/values";
import { orgScoped, timestamps } from "../_shared/validators";

/**
 * Rich text notes attached to any entity. authorType distinguishes user vs AI.
 *
 * Notes are agent-written annotations: editable, pinnable, sometimes long-lived.
 * For chat-style messages between users (or AI on-behalf), use the `messages` table.
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

/**
 * Chat-style messages between users (and AI on-behalf). Append-mostly, status-tracked.
 *
 * One row per message — no thread/conversation table; threads are derived from
 * (entityType, entityId) groups (and optionally `threadId` for sub-threads).
 *
 * Distinct from `notes` because:
 *   - Append-mostly: rarely edited, never pinned
 *   - Status (sent/delivered/read) and reply chains needed
 *   - Different volume curve (high-frequency, indexed for inbox queries)
 *   - Independent permissions (`messages.view/send/delete/deleteAny`)
 */
export const messages = defineTable({
	...orgScoped,
	entityType: v.string(), // "person" | "deal" | "company" | "lead" | "contact" | ...
	entityId: v.string(),
	personCode: v.optional(v.string()), // for cross-entity person threads
	threadId: v.optional(v.string()), // future grouping; default = entityType+entityId

	content: v.string(),
	authorId: v.id("users"), // sender (always set)
	authorType: v.union(v.literal("user"), v.literal("ai"), v.literal("system")),
	onBehalfOf: v.optional(v.id("users")), // AI sending on behalf of a user

	replyToId: v.optional(v.id("messages")),
	attachments: v.optional(v.array(v.id("files"))), // image/file/voice via files.mimeType
	status: v.union(v.literal("sent"), v.literal("delivered"), v.literal("read")),
	readBy: v.optional(v.array(v.id("users"))), // multi-user thread read tracking

	...timestamps,
})
	.index("by_entity", ["orgId", "entityType", "entityId", "createdAt"])
	.index("by_org_and_personCode", ["orgId", "personCode", "createdAt"])
	.index("by_org_and_created", ["orgId", "createdAt"]) // inbox view
	.index("by_org_and_thread", ["orgId", "threadId", "createdAt"])
	.index("by_replyTo", ["replyToId"]);

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

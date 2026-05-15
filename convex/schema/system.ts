/**
 * Schema — System domain.
 *
 * Tables: notifications, activityLogs, files.
 *
 * Generic infrastructure tables fed by every feature.
 */

import { defineTable } from "convex/server";
import { v } from "convex/values";
import { orgScoped, softDelete, timestamps } from "../_shared/validators";

/**
 * In-app notifications for users. Generic — fed by feature mutations.
 */
export const notifications = defineTable({
	...orgScoped,
	userId: v.id("users"),
	type: v.string(),
	title: v.string(),
	body: v.optional(v.string()),
	entityType: v.optional(v.string()),
	entityId: v.optional(v.string()),
	actionUrl: v.optional(v.string()),
	read: v.boolean(),
	readAt: v.optional(v.number()),
	archivedAt: v.optional(v.number()),
	metadata: v.optional(v.record(v.string(), v.union(v.string(), v.number(), v.boolean()))),
	...timestamps,
})
	.index("by_userId_and_read", ["userId", "read"])
	.index("by_userId_and_read_and_archivedAt", ["userId", "read", "archivedAt"])
	.index("by_orgId_and_userId", ["orgId", "userId"])
	.index("by_userId_and_createdAt", ["userId", "createdAt"]);

/**
 * Audit trail for all mutations. Always call logActivity() after mutations.
 *
 * actorType enables unified timeline to distinguish AI vs human vs integration actions.
 * userId is ALWAYS required — actorType clarifies the medium, not the identity.
 * For AI actions: userId = user who triggered the conversation, actorType = "ai".
 */
export const activityLogs = defineTable({
	...orgScoped,
	userId: v.id("users"),
	actorType: v.union(
		v.literal("user"),
		v.literal("ai"),
		v.literal("integration"),
		v.literal("system"),
	),
	action: v.string(),
	entityType: v.string(),
	entityId: v.string(),
	personCode: v.optional(v.string()),
	description: v.optional(v.string()),
	metadata: v.optional(v.record(v.string(), v.union(v.string(), v.number(), v.boolean()))),
	createdAt: v.number(),
})
	.index("by_orgId_and_createdAt", ["orgId", "createdAt"])
	.index("by_entityType_and_entityId", ["entityType", "entityId"])
	.index("by_userId_and_createdAt", ["userId", "createdAt"])
	.index("by_orgId_and_actorType_and_createdAt", ["orgId", "actorType", "createdAt"])
	.index("by_org_and_personCode", ["orgId", "personCode"]);

/**
 * Universal attachment table. Works for every entity in the app.
 *
 *   - `scope`    — namespace the attachment lives in ("lead", "contact",
 *                  "deal", "company", "user", "org", or any custom slot).
 *   - `scopeId`  — the record id inside that scope (e.g. a leadId).
 *   - `fieldKey` — optional hint for dynamic-field attachments.
 *   - `tags`     — free-form attribution markers (e.g. "deal:D-001").
 *
 * storageId is the Convex File Storage id — actual bytes live there.
 */
export const files = defineTable({
	...orgScoped,
	storageId: v.id("_storage"),
	scope: v.string(),
	scopeId: v.string(),
	fieldKey: v.optional(v.string()),
	tags: v.optional(v.array(v.string())),
	name: v.string(),
	size: v.number(),
	mimeType: v.string(),
	uploadedBy: v.id("users"),
	...timestamps,
	...softDelete,
})
	.index("by_org_and_scope", ["orgId", "scope", "scopeId"])
	.index("by_org_scope_field", ["orgId", "scope", "scopeId", "fieldKey"])
	.index("by_storageId", ["storageId"])
	.index("by_uploader", ["orgId", "uploadedBy"]);

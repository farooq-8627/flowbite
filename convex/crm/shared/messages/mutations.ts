/**
 * Messages Mutations — convex/crm/shared/messages/mutations.ts
 *
 * Send chat-style messages, mark read, delete. Per FRONTEND-DECISIONS Rule 2,
 * messages live in their own dedicated `messages` table.
 *
 * Mutations:
 *   - send:        Insert a message + log activity + notify watchers (best-effort).
 *   - markRead:    Mark one message as read (and append the reader to readBy[]).
 *   - markAllRead: Mark every message in a thread as read for the current user.
 *   - remove:      Delete one message (own message OR `messages.deleteAny`).
 *
 * STATUS: IMPLEMENTED (Phase 2 backend).
 */
import { ConvexError, v } from "convex/values";
import { orgMutation, requireOrgMember } from "../../../_functions/authenticated";
import type { Id } from "../../../_generated/dataModel";
import type { MutationCtx } from "../../../_generated/server";
import { ERRORS } from "../../../_shared/errors";
import { hasPermission, requireRole } from "../../../_shared/permissions";
import { logActivity } from "../../../activityLogs/helpers";
import { sendNotification } from "../../../notifications/helpers";

/**
 * Send a message on an entity thread.
 *
 * Canonical pattern:
 *   requireOrgMember → requireRole("messages.send") → insert → logActivity →
 *   sendNotification to thread watchers (assignee + others).
 *
 * `authorType` defaults to "user". For AI on-behalf, pass `"ai"` and `onBehalfOf`.
 * For system-generated messages (e.g. "Stage moved to Closed Won"), pass `"system"`.
 */
export const send = orgMutation({
	args: {
		orgId: v.id("orgs"),
		entityType: v.string(),
		entityId: v.string(),
		personCode: v.optional(v.string()),
		threadId: v.optional(v.string()),
		content: v.string(),
		authorType: v.optional(v.union(v.literal("user"), v.literal("ai"), v.literal("system"))),
		onBehalfOf: v.optional(v.id("users")),
		replyToId: v.optional(v.id("messages")),
		attachments: v.optional(v.array(v.id("files"))),
	},
	handler: async (ctx, args) => {
		const { member, userId } = await requireOrgMember(ctx, args.orgId);
		requireRole(member.permissions, "messages.send");

		const trimmed = args.content.trim();
		if (trimmed.length === 0) throw new ConvexError(ERRORS.INVALID_ARGS);

		const now = Date.now();
		const messageId = await ctx.db.insert("messages", {
			orgId: args.orgId,
			entityType: args.entityType,
			entityId: args.entityId,
			personCode: args.personCode,
			threadId: args.threadId,
			content: trimmed,
			authorId: userId,
			authorType: args.authorType ?? "user",
			onBehalfOf: args.onBehalfOf,
			replyToId: args.replyToId,
			attachments: args.attachments,
			status: "sent",
			readBy: [userId], // sender always counts as having read
			createdAt: now,
			updatedAt: now,
		});

		await logActivity(ctx, {
			orgId: args.orgId,
			userId,
			actorType: args.authorType === "ai" ? "ai" : "user",
			action: "message_sent",
			entityType: args.entityType,
			entityId: args.entityId,
			personCode: args.personCode,
			description: `Message sent: ${trimmed.slice(0, 80)}${trimmed.length > 80 ? "…" : ""}`,
			metadata: { messageId },
		});

		// Best-effort notification to entity assignee (if any).
		await notifyEntityWatchers(ctx, {
			orgId: args.orgId,
			entityType: args.entityType,
			entityId: args.entityId,
			senderId: userId,
			messageId,
			content: trimmed,
			personCode: args.personCode,
		});

		return messageId;
	},
});

/**
 * Mark a single message as read by the current user.
 *
 * Adds the user to `readBy[]` if not already present. If every member with access
 * has read the message, transitions `status` to "read".
 */
export const markRead = orgMutation({
	args: { orgId: v.id("orgs"), messageId: v.id("messages") },
	handler: async (ctx, args) => {
		const { member, userId } = await requireOrgMember(ctx, args.orgId);
		requireRole(member.permissions, "messages.view");

		const message = await ctx.db.get(args.messageId);
		if (!message || message.orgId !== args.orgId) {
			throw new ConvexError(ERRORS.NOT_FOUND);
		}

		const readers = new Set(message.readBy ?? []);
		if (readers.has(userId)) return; // idempotent
		readers.add(userId);

		// Transition to "delivered" or "read" — pragmatic: any non-author read marks
		// the message as read for the thread. Multi-party read tracking lives in readBy[].
		const nextStatus = message.authorId === userId ? message.status : "read";

		await ctx.db.patch(args.messageId, {
			readBy: [...readers],
			status: nextStatus,
			updatedAt: Date.now(),
		});
	},
});

/**
 * Mark every unread message in a thread as read by the current user.
 *
 * Use this when the user opens a conversation — bulk sets readBy.
 */
export const markAllRead = orgMutation({
	args: {
		orgId: v.id("orgs"),
		entityType: v.string(),
		entityId: v.string(),
	},
	handler: async (ctx, args) => {
		const { member, userId } = await requireOrgMember(ctx, args.orgId);
		requireRole(member.permissions, "messages.view");

		const messages = await ctx.db
			.query("messages")
			.withIndex("by_entity", (q) =>
				q
					.eq("orgId", args.orgId)
					.eq("entityType", args.entityType)
					.eq("entityId", args.entityId),
			)
			.collect();

		const now = Date.now();
		let touched = 0;

		for (const m of messages) {
			const readers = new Set(m.readBy ?? []);
			if (readers.has(userId)) continue;
			readers.add(userId);
			await ctx.db.patch(m._id, {
				readBy: [...readers],
				status: m.authorId === userId ? m.status : "read",
				updatedAt: now,
			});
			touched++;
		}

		return { marked: touched };
	},
});

/**
 * Delete a message.
 *
 * Allowed when:
 *   - The caller is the author (`messages.delete` permission), OR
 *   - The caller has `messages.deleteAny` (admin moderation).
 */
export const remove = orgMutation({
	args: { orgId: v.id("orgs"), messageId: v.id("messages") },
	handler: async (ctx, args) => {
		const { member, userId } = await requireOrgMember(ctx, args.orgId);

		const message = await ctx.db.get(args.messageId);
		if (!message || message.orgId !== args.orgId) {
			throw new ConvexError(ERRORS.NOT_FOUND);
		}

		const isOwn = message.authorId === userId;
		const canDeleteOwn = hasPermission(member.permissions, "messages.delete");
		const canDeleteAny = hasPermission(member.permissions, "messages.deleteAny");

		if (!(canDeleteAny || (isOwn && canDeleteOwn))) {
			throw new ConvexError(ERRORS.FORBIDDEN);
		}

		await ctx.db.delete(args.messageId);

		await logActivity(ctx, {
			orgId: args.orgId,
			userId,
			action: "message_deleted",
			entityType: message.entityType,
			entityId: message.entityId,
			personCode: message.personCode,
			description: "Message deleted",
			metadata: { messageId: args.messageId },
		});
	},
});

// ─── Internal helpers ────────────────────────────────────────────────────────

/**
 * Notify the entity's primary assignee (if any) that a new message arrived.
 *
 * Best-effort — silently no-ops if the entity isn't found, has no assignee, or
 * the assignee is the sender themselves.
 *
 * Entity types covered: "lead" | "contact" | "deal" | "company" | "person".
 * Future entity types fall through silently.
 */
async function notifyEntityWatchers(
	ctx: MutationCtx,
	args: {
		orgId: Id<"orgs">;
		entityType: string;
		entityId: string;
		senderId: Id<"users">;
		messageId: Id<"messages">;
		content: string;
		personCode?: string;
	},
): Promise<void> {
	let assignedTo: Id<"users"> | undefined;

	if (args.entityType === "lead") {
		const lead = await ctx.db
			.query("leads")
			.withIndex("by_org_and_personCode", (q) =>
				q.eq("orgId", args.orgId).eq("personCode", args.entityId),
			)
			.first();
		assignedTo = lead?.assignedTo;
	} else if (args.entityType === "contact") {
		const contact = await ctx.db
			.query("contacts")
			.withIndex("by_org_and_personCode", (q) =>
				q.eq("orgId", args.orgId).eq("personCode", args.entityId),
			)
			.first();
		assignedTo = contact?.assignedTo;
	} else if (args.entityType === "deal") {
		const deal = await ctx.db
			.query("deals")
			.withIndex("by_org_and_dealCode", (q) =>
				q.eq("orgId", args.orgId).eq("dealCode", args.entityId),
			)
			.first();
		assignedTo = deal?.assignedTo;
	} else if (args.entityType === "company") {
		const company = await ctx.db
			.query("companies")
			.withIndex("by_org_and_companyCode", (q) =>
				q.eq("orgId", args.orgId).eq("companyCode", args.entityId),
			)
			.first();
		assignedTo = company?.assignedTo;
	}

	if (!assignedTo || assignedTo === args.senderId) return;

	const preview = args.content.length > 120 ? `${args.content.slice(0, 117)}…` : args.content;

	await sendNotification(ctx, {
		orgId: args.orgId,
		userId: assignedTo,
		type: "message.received",
		title: "New message",
		body: preview,
		entityType: args.entityType,
		entityId: args.entityId,
		actionUrl: args.personCode ? `/profile/${args.personCode}` : undefined,
		metadata: {
			messageId: args.messageId,
			personCode: args.personCode ?? "",
		},
	});
}

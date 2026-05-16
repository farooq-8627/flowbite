/**
 * Messages mutations — convex/crm/shared/messages/mutations.ts
 *
 * Production-grade chat-message API. Key properties:
 *
 *   • Conversation-aware: every message is tied to a `conversationId`. The
 *     `send` mutation auto-creates the conversation on first use via
 *     `getOrCreateConversation` from the `conversations` module.
 *   • Multi-participant fan-out: notifications go to **every** active
 *     conversation member (except the sender), filtered by each member's
 *     `notificationLevel` ("all" / "mentions" / "none"). The entity assignee
 *     is auto-added as a participant on first send.
 *   • Mentions: `@<userId>` mentions parsed from `args.mentions[]`. Mentioned
 *     users are auto-added as participants and receive a `message_mention`
 *     notification regardless of their level (always wins).
 *   • Idempotent: callers may pass `idempotencyKey`. If the same
 *     (orgId, conversationId, idempotencyKey) message exists, return its id.
 *   • Edit + soft-delete: messages are soft-deleted; queries hide rows with
 *     `deletedAt` set. Edits are time-windowed (15 min by default).
 */

import { ConvexError, v } from "convex/values";
import { orgMutation, requireOrgMember } from "../../../_functions/authenticated";
import type { Id } from "../../../_generated/dataModel";
import type { MutationCtx } from "../../../_generated/server";
import { entityTypeForChatValidator } from "../../../_shared/entityCodes";
import { ERRORS } from "../../../_shared/errors";
import { isNotificationPreferenceEnabled } from "../../../_shared/notificationKeys";
import { hasPermission, requireRole } from "../../../_shared/permissions";
import { enforceRateLimit, RATE_LIMITS } from "../../../_shared/rateLimit";
import { logActivity } from "../../../activityLogs/helpers";
import { sendNotification } from "../../../notifications/helpers";
import {
	ensureMember,
	getConversationOrThrow,
	getMyMembership,
	getOrCreateConversation,
	listActiveMembers,
} from "../conversations/internal";

const EDIT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes

// ─── send ────────────────────────────────────────────────────────────────────

/**
 * Send a message into a conversation thread.
 *
 * Either pass `conversationId` (existing thread) OR `entityType + entityId`
 * (auto-create / find). Mutually exclusive — provide one set.
 *
 * Fan-out:
 *   1. Sender is auto-added as participant if not already.
 *   2. Entity assignee is auto-added (auto-discoverable for lead/contact/
 *      deal/company; skipped for project/task in Phase 2).
 *   3. Mentioned users are auto-added with `joinReason: "mention"`.
 *   4. Notifications fan out to every active member except the sender,
 *      filtered by each member's `notificationLevel`. Mentions always notify.
 */
export const send = orgMutation({
	args: {
		orgId: v.id("orgs"),
		// Either:
		conversationId: v.optional(v.id("conversations")),
		// Or (auto-create):
		entityType: v.optional(entityTypeForChatValidator),
		entityId: v.optional(v.string()),
		threadId: v.optional(v.string()),
		// Body:
		content: v.string(),
		authorType: v.optional(v.union(v.literal("user"), v.literal("ai"), v.literal("system"))),
		onBehalfOf: v.optional(v.id("users")),
		replyToId: v.optional(v.id("messages")),
		attachments: v.optional(v.array(v.id("files"))),
		mentions: v.optional(v.array(v.id("users"))),
		// Idempotency:
		idempotencyKey: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const { member, userId, org } = await requireOrgMember(ctx, args.orgId);
		requireRole(member.permissions, "messages.send");
		await enforceRateLimit(ctx, {
			orgId: args.orgId,
			scope: "messages.send",
			key: `${userId}:${args.orgId}`,
			...RATE_LIMITS.write,
		});

		const trimmed = args.content.trim();
		if (trimmed.length === 0) throw new ConvexError(ERRORS.INVALID_ARGS);

		// Resolve conversation — either by id or by (entityType, entityId).
		let conversationId: Id<"conversations">;
		let entityType: typeof args.entityType;
		let entityId: string;
		if (args.conversationId) {
			const convo = await getConversationOrThrow(ctx, args.conversationId, args.orgId);
			conversationId = convo._id;
			entityType = convo.entityType;
			entityId = convo.entityId;
		} else if (args.entityType && args.entityId) {
			conversationId = await getOrCreateConversation(ctx, {
				orgId: args.orgId,
				entityType: args.entityType,
				entityId: args.entityId,
				threadId: args.threadId,
				creatorId: userId,
			});
			entityType = args.entityType;
			entityId = args.entityId;
		} else {
			throw new ConvexError({
				code: "INVALID_ARGS",
				message: "send requires either conversationId or (entityType + entityId)",
			});
		}

		// Idempotency check — if the same key already produced a message in
		// this conversation, return its id without inserting again.
		if (args.idempotencyKey) {
			const existing = await ctx.db
				.query("messages")
				.withIndex("by_org_and_idempotency", (q) =>
					q
						.eq("orgId", args.orgId)
						.eq("conversationId", conversationId)
						.eq("idempotencyKey", args.idempotencyKey),
				)
				.first();
			if (existing) return existing._id;
		}

		const now = Date.now();
		const personCode =
			entityType === "lead" || entityType === "contact" || entityType === "person"
				? entityId
				: undefined;

		// 1. Insert the message row.
		const messageId = await ctx.db.insert("messages", {
			orgId: args.orgId,
			conversationId,
			entityType: entityType ?? "person",
			entityId,
			personCode,
			threadId: args.threadId,
			content: trimmed,
			authorId: userId,
			authorType: args.authorType ?? "user",
			onBehalfOf: args.onBehalfOf,
			replyToId: args.replyToId,
			attachments: args.attachments,
			mentions: args.mentions,
			idempotencyKey: args.idempotencyKey,
			createdAt: now,
			updatedAt: now,
		});

		// 2. Update the conversation summary (denormalised for inbox query).
		await ctx.db.patch(conversationId, {
			lastMessageAt: now,
			lastMessagePreview: trimmed.slice(0, 200),
			lastMessageAuthorId: userId,
			updatedAt: now,
		});

		// 3. Ensure the sender is a participant (auto-join). Already-a-member
		//    is a no-op.
		await ensureMember(ctx, {
			orgId: args.orgId,
			conversationId,
			userId,
			role: "participant",
			joinReason: "auto",
		});

		// 4. Auto-add the entity assignee (if discoverable) on first message.
		const assigneeId = await resolveEntityAssignee(ctx, {
			orgId: args.orgId,
			entityType: entityType ?? "person",
			entityId,
		});
		if (assigneeId && assigneeId !== userId) {
			await ensureMember(ctx, {
				orgId: args.orgId,
				conversationId,
				userId: assigneeId,
				role: "participant",
				joinReason: "auto",
			});
		}

		// 5. Auto-add mentioned users.
		const mentionedSet = new Set<string>();
		for (const mentionedId of args.mentions ?? []) {
			if (mentionedId === userId) continue;
			await ensureMember(ctx, {
				orgId: args.orgId,
				conversationId,
				userId: mentionedId,
				role: "participant",
				joinReason: "mention",
			});
			mentionedSet.add(String(mentionedId));
		}

		// Pre-resolve the sender's display name (cheaper than lookup-per-recipient
		// inside the fan-out loop).
		const senderUser = ctx.user; // injected by orgMutation wrapper
		const senderDisplay =
			senderUser?.name?.split(" ")[0] ?? senderUser?.email?.split("@")[0] ?? "Someone";

		// 6. Fan-out notifications to every active member.
		const members = await listActiveMembers(ctx, conversationId);
		for (const m of members) {
			if (m.userId === userId) continue; // never notify sender

			const isMentioned = mentionedSet.has(String(m.userId));
			const level = m.notificationLevel;

			// Mentions always notify (highest priority), regardless of level.
			if (!isMentioned) {
				if (level === "none") continue;
				if (level === "mentions") continue; // not mentioned, mute everything else
			}

			// Honour user's per-key preference too.
			const recipientUser = await ctx.db.get(m.userId);
			const prefKey = isMentioned ? "message_mention" : "message_received";
			if (!isNotificationPreferenceEnabled(recipientUser?.notificationPreferences, prefKey)) {
				continue;
			}

			await sendNotification(ctx, {
				orgId: args.orgId,
				userId: m.userId,
				type: isMentioned ? "message.mention" : "message.received",
				title: isMentioned ? `${senderDisplay} mentioned you` : "New message",
				body: trimmed.length > 120 ? `${trimmed.slice(0, 117)}…` : trimmed,
				entityType,
				entityId,
				actionUrl: actionUrlFor(entityType, entityId),
				metadata: {
					conversationId: String(conversationId),
					messageId: String(messageId),
					personCode: personCode ?? "",
				},
			});
		}

		// 7. Activity log (single row per send — fan-out lives in notifications).
		await logActivity(ctx, {
			orgId: args.orgId,
			userId,
			actorType: args.authorType === "ai" ? "ai" : "user",
			action: "message_sent",
			entityType: entityType ?? "person",
			entityId,
			personCode,
			description: `Message sent: ${trimmed.slice(0, 80)}${trimmed.length > 80 ? "…" : ""}`,
			metadata: { messageId: String(messageId), conversationId: String(conversationId) },
		});

		// Avoid the "unused" lint on `org` — surface it for the future where we
		// might use org settings here (e.g. message-edit-window override).
		void org;

		return messageId;
	},
});

// ─── update / soft-delete / reactions ────────────────────────────────────────

export const update = orgMutation({
	args: {
		orgId: v.id("orgs"),
		messageId: v.id("messages"),
		content: v.string(),
	},
	handler: async (ctx, args) => {
		const { member, userId } = await requireOrgMember(ctx, args.orgId);

		const message = await ctx.db.get(args.messageId);
		if (!message || message.orgId !== args.orgId || message.deletedAt !== undefined) {
			throw new ConvexError(ERRORS.NOT_FOUND);
		}

		// Edit window: own message + within 15 min, OR moderator.
		const isOwn = message.authorId === userId;
		const canEditOwn = hasPermission(member.permissions, "messages.editOwn");
		const canEditAny = hasPermission(member.permissions, "messages.deleteAny"); // moderator

		const within = Date.now() - message.createdAt < EDIT_WINDOW_MS;
		if (!(canEditAny || (isOwn && canEditOwn && within))) {
			throw new ConvexError(ERRORS.FORBIDDEN);
		}

		const trimmed = args.content.trim();
		if (trimmed.length === 0) throw new ConvexError(ERRORS.INVALID_ARGS);

		const now = Date.now();
		await ctx.db.patch(args.messageId, {
			content: trimmed,
			editedAt: now,
			updatedAt: now,
		});

		await logActivity(ctx, {
			orgId: args.orgId,
			userId,
			action: "message_edited",
			entityType: message.entityType,
			entityId: message.entityId,
			personCode: message.personCode,
			description: "Message edited",
			metadata: { messageId: String(args.messageId) },
		});
	},
});

export const remove = orgMutation({
	args: { orgId: v.id("orgs"), messageId: v.id("messages") },
	handler: async (ctx, args) => {
		const { member, userId } = await requireOrgMember(ctx, args.orgId);

		const message = await ctx.db.get(args.messageId);
		if (!message || message.orgId !== args.orgId || message.deletedAt !== undefined) {
			throw new ConvexError(ERRORS.NOT_FOUND);
		}

		const isOwn = message.authorId === userId;
		const canDeleteOwn = hasPermission(member.permissions, "messages.deleteOwn");
		const canDeleteAny = hasPermission(member.permissions, "messages.deleteAny");
		if (!(canDeleteAny || (isOwn && canDeleteOwn))) {
			throw new ConvexError(ERRORS.FORBIDDEN);
		}

		const now = Date.now();
		await ctx.db.patch(args.messageId, {
			deletedAt: now,
			updatedAt: now,
		});

		await logActivity(ctx, {
			orgId: args.orgId,
			userId,
			action: "message_deleted",
			entityType: message.entityType,
			entityId: message.entityId,
			personCode: message.personCode,
			description: "Message deleted",
			metadata: { messageId: String(args.messageId) },
		});
	},
});

/**
 * Toggle a reaction by the current user. If the (userId, emoji) pair already
 * exists on the message, it's removed; otherwise added.
 */
export const toggleReaction = orgMutation({
	args: {
		orgId: v.id("orgs"),
		messageId: v.id("messages"),
		emoji: v.string(),
	},
	handler: async (ctx, args) => {
		const { member, userId } = await requireOrgMember(ctx, args.orgId);
		requireRole(member.permissions, "messages.send");

		const message = await ctx.db.get(args.messageId);
		if (!message || message.orgId !== args.orgId || message.deletedAt !== undefined) {
			throw new ConvexError(ERRORS.NOT_FOUND);
		}

		const reactions = message.reactions ?? [];
		const existing = reactions.find(
			(r) => String(r.userId) === String(userId) && r.emoji === args.emoji,
		);

		const next = existing
			? reactions.filter(
					(r) => !(String(r.userId) === String(userId) && r.emoji === args.emoji),
				)
			: [...reactions, { userId, emoji: args.emoji, createdAt: Date.now() }];

		await ctx.db.patch(args.messageId, {
			reactions: next,
			updatedAt: Date.now(),
		});
	},
});

// ─── Helpers (file-local) ────────────────────────────────────────────────────

async function resolveEntityAssignee(
	ctx: MutationCtx,
	args: { orgId: Id<"orgs">; entityType: string; entityId: string },
): Promise<Id<"users"> | undefined> {
	if (args.entityType === "lead" || args.entityType === "person") {
		const lead = await ctx.db
			.query("leads")
			.withIndex("by_org_and_personCode", (q) =>
				q.eq("orgId", args.orgId).eq("personCode", args.entityId),
			)
			.first();
		if (lead?.assignedTo) return lead.assignedTo;
	}
	if (args.entityType === "contact" || args.entityType === "person") {
		const contact = await ctx.db
			.query("contacts")
			.withIndex("by_org_and_personCode", (q) =>
				q.eq("orgId", args.orgId).eq("personCode", args.entityId),
			)
			.first();
		if (contact?.assignedTo) return contact.assignedTo;
	}
	if (args.entityType === "deal") {
		const deal = await ctx.db
			.query("deals")
			.withIndex("by_org_and_dealCode", (q) =>
				q.eq("orgId", args.orgId).eq("dealCode", args.entityId),
			)
			.first();
		if (deal?.assignedTo) return deal.assignedTo;
	}
	if (args.entityType === "company") {
		const company = await ctx.db
			.query("companies")
			.withIndex("by_org_and_companyCode", (q) =>
				q.eq("orgId", args.orgId).eq("companyCode", args.entityId),
			)
			.first();
		if (company?.assignedTo) return company.assignedTo;
	}
	// project / task assignee discovery lives in their own modules (Phase 4).
	return undefined;
}

function actionUrlFor(entityType: string | undefined, entityId: string): string | undefined {
	if (entityType === "deal") return `/deals/${entityId}`;
	if (entityType === "company") return `/companies/${entityId}`;
	if (entityType === "lead" || entityType === "contact" || entityType === "person")
		return `/profile/${entityId}`;
	return undefined;
}

// Suppress getMyMembership lint (re-exported for tests).
export const __internal = { getMyMembership };

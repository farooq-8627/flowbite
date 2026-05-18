/**
 * Conversation mutations — convex/crm/shared/conversations/mutations.ts
 *
 * Public surface for managing chat threads. The `messages.send` mutation
 * implicitly calls `ensureForEntity` on first message — so most apps never
 * need to call these directly. They exist for explicit invite / mute /
 * archive flows.
 */

import { ConvexError, v } from "convex/values";
import { orgMutation, requireOrgMember } from "../../../_functions/authenticated";
import { entityTypeForChatValidator } from "../../../_shared/entityCodes";
import { ERRORS } from "../../../_shared/errors";
import { hasPermission, requireRole } from "../../../_shared/permissions";
import { logActivity } from "../../../activityLogs/helpers";
import { sendNotification } from "../../../notifications/helpers";
import {
	ensureMember,
	getConversationOrThrow,
	getMyMembership,
	getOrCreateConversation,
	listActiveMembers,
} from "./internal";

// ─── Create / find a conversation ────────────────────────────────────────────

/**
 * Get-or-create a conversation for the given entity thread. Returns the
 * conversation id. Adds the caller as an owner if the conversation didn't
 * exist yet.
 */
export const ensureForEntity = orgMutation({
	args: {
		orgId: v.id("orgs"),
		entityType: entityTypeForChatValidator,
		entityId: v.string(),
		threadId: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const { member, userId } = await requireOrgMember(ctx, args.orgId);
		requireRole(member.permissions, "messages.view");

		const conversationId = await getOrCreateConversation(ctx, {
			orgId: args.orgId,
			entityType: args.entityType,
			entityId: args.entityId,
			threadId: args.threadId,
			creatorId: userId,
		});
		return conversationId;
	},
});

// ─── Add / remove participants ───────────────────────────────────────────────

export const addParticipants = orgMutation({
	args: {
		orgId: v.id("orgs"),
		conversationId: v.id("conversations"),
		userIds: v.array(v.id("users")),
		role: v.optional(v.union(v.literal("participant"), v.literal("watcher"))),
		notificationLevel: v.optional(
			v.union(v.literal("all"), v.literal("mentions"), v.literal("none")),
		),
	},
	handler: async (ctx, args) => {
		const { member, userId } = await requireOrgMember(ctx, args.orgId);
		requireRole(member.permissions, "messages.subscribe");

		const conversation = await getConversationOrThrow(ctx, args.conversationId, args.orgId);

		// Caller must be an owner of the conversation OR have `messages.viewAll` (moderator).
		const myMembership = await getMyMembership(ctx, {
			conversationId: args.conversationId,
			userId,
		});
		const isOwner = myMembership?.role === "owner";
		const canModerate = hasPermission(member.permissions, "messages.viewAll");
		if (!(isOwner || canModerate)) {
			throw new ConvexError(ERRORS.FORBIDDEN);
		}

		const added: string[] = [];
		for (const targetUserId of args.userIds) {
			const memberId = await ensureMember(ctx, {
				orgId: args.orgId,
				conversationId: args.conversationId,
				userId: targetUserId,
				role: args.role ?? "participant",
				notificationLevel: args.notificationLevel,
				joinedBy: userId,
				joinReason: "invite",
			});
			added.push(memberId);

			// Notify the new participant.
			if (targetUserId !== userId) {
				await sendNotification(ctx, {
					orgId: args.orgId,
					userId: targetUserId,
					type: "conversation_invite",
					title: "You were added to a conversation",
					entityType: conversation.entityType,
					entityId: conversation.entityId,
					actionUrl:
						conversation.entityType === "deal"
							? `/deals/${conversation.entityId}`
							: conversation.entityType === "company"
								? `/companies/${conversation.entityId}`
								: `/profile/${conversation.entityId}`,
					metadata: { conversationId: String(args.conversationId) },
				});
			}
		}

		await logActivity(ctx, {
			orgId: args.orgId,
			userId,
			action: "conversation_members_added",
			entityType: conversation.entityType,
			entityId: conversation.entityId,
			description: `Added ${args.userIds.length} member(s) to conversation`,
			metadata: { conversationId: String(args.conversationId), count: args.userIds.length },
		});

		return { added: added.length };
	},
});

export const removeParticipant = orgMutation({
	args: {
		orgId: v.id("orgs"),
		conversationId: v.id("conversations"),
		userId: v.id("users"),
	},
	handler: async (ctx, args) => {
		const { member, userId: callerId } = await requireOrgMember(ctx, args.orgId);
		requireRole(member.permissions, "messages.subscribe");

		const conversation = await getConversationOrThrow(ctx, args.conversationId, args.orgId);

		const myMembership = await getMyMembership(ctx, {
			conversationId: args.conversationId,
			userId: callerId,
		});
		const isOwner = myMembership?.role === "owner";
		const canModerate = hasPermission(member.permissions, "messages.viewAll");
		const isSelfRemoval = args.userId === callerId;
		if (!(isOwner || canModerate || isSelfRemoval)) {
			throw new ConvexError(ERRORS.FORBIDDEN);
		}

		const target = await ctx.db
			.query("conversationMembers")
			.withIndex("by_user_and_conversation", (q) =>
				q.eq("userId", args.userId).eq("conversationId", args.conversationId),
			)
			.first();
		if (!target) return; // already not a member — idempotent

		await ctx.db.patch(target._id, { leftAt: Date.now() });

		await logActivity(ctx, {
			orgId: args.orgId,
			userId: callerId,
			action: isSelfRemoval ? "conversation_left" : "conversation_member_removed",
			entityType: conversation.entityType,
			entityId: conversation.entityId,
			description: isSelfRemoval ? "Left conversation" : "Removed member from conversation",
			metadata: { conversationId: String(args.conversationId) },
		});
	},
});

/**
 * Self-remove from a conversation. Equivalent to
 * `removeParticipant({userId: callerId})` but doesn't require permission.
 */
export const leave = orgMutation({
	args: { orgId: v.id("orgs"), conversationId: v.id("conversations") },
	handler: async (ctx, args) => {
		const { userId } = await requireOrgMember(ctx, args.orgId);
		const conversation = await getConversationOrThrow(ctx, args.conversationId, args.orgId);
		const me = await getMyMembership(ctx, { conversationId: args.conversationId, userId });
		if (!me) return; // not a member, nothing to do

		await ctx.db.patch(me._id, { leftAt: Date.now() });

		await logActivity(ctx, {
			orgId: args.orgId,
			userId,
			action: "conversation_left",
			entityType: conversation.entityType,
			entityId: conversation.entityId,
			description: "Left conversation",
			metadata: { conversationId: String(args.conversationId) },
		});
	},
});

// ─── Per-user conversation state ─────────────────────────────────────────────

export const updateNotificationLevel = orgMutation({
	args: {
		orgId: v.id("orgs"),
		conversationId: v.id("conversations"),
		level: v.union(v.literal("all"), v.literal("mentions"), v.literal("none")),
	},
	handler: async (ctx, args) => {
		const { userId } = await requireOrgMember(ctx, args.orgId);
		const me = await getMyMembership(ctx, { conversationId: args.conversationId, userId });
		if (!me) throw new ConvexError(ERRORS.NOT_FOUND);
		await ctx.db.patch(me._id, { notificationLevel: args.level });
	},
});

export const markRead = orgMutation({
	args: { orgId: v.id("orgs"), conversationId: v.id("conversations") },
	handler: async (ctx, args) => {
		const { userId } = await requireOrgMember(ctx, args.orgId);
		const me = await getMyMembership(ctx, { conversationId: args.conversationId, userId });
		if (!me) return; // not a member — silently ignore

		// Idempotency / OCC guard.
		//
		// Convex insights surfaced 45 critical write conflicts + 223 retry
		// warnings on `conversationMembers.markRead` per minute. Two tabs
		// (or one tab + a remount) can fire `markRead` near-simultaneously
		// for the same `(userId, conversationId)`; both transactions read
		// the same `me` row, then both try to patch it, and the second
		// loser hits OCC. The client-side fix (`MessagesThread.tsx` deps)
		// reduced the burst dramatically, but a slow tab can still fire a
		// stale `markRead` AFTER a newer one already landed — and a
		// no-op patch still consumes the lock and contributes contention.
		//
		// This mutation is monotonic by definition: `lastReadAt` only ever
		// moves forward. So we can:
		//   1. Skip the patch entirely when the existing `lastReadAt` is
		//      already at-or-beyond `now`. This is the no-op fast path.
		//   2. Bound any forward jump to `now` so we never write a wall-
		//      clock time that's smaller than the row's current value.
		//
		// Result: a stale racer either reads the same value and skips the
		// write, or it does write but immediately observes its row is
		// monotonic with the latest write — no contention either way.
		const now = Date.now();
		if (me.lastReadAt !== undefined && me.lastReadAt >= now) {
			return; // already at or beyond — no write, no OCC risk
		}
		await ctx.db.patch(me._id, { lastReadAt: now });
	},
});

export const archive = orgMutation({
	args: { orgId: v.id("orgs"), conversationId: v.id("conversations") },
	handler: async (ctx, args) => {
		const { member, userId } = await requireOrgMember(ctx, args.orgId);
		requireRole(member.permissions, "conversations.archive");
		const conversation = await getConversationOrThrow(ctx, args.conversationId, args.orgId);
		await ctx.db.patch(args.conversationId, {
			isArchived: true,
			updatedAt: Date.now(),
		});
		await logActivity(ctx, {
			orgId: args.orgId,
			userId,
			action: "conversation_archived",
			entityType: conversation.entityType,
			entityId: conversation.entityId,
			description: "Archived conversation",
			metadata: { conversationId: String(args.conversationId) },
		});
	},
});

export const unarchive = orgMutation({
	args: { orgId: v.id("orgs"), conversationId: v.id("conversations") },
	handler: async (ctx, args) => {
		const { member, userId } = await requireOrgMember(ctx, args.orgId);
		requireRole(member.permissions, "conversations.archive");
		const conversation = await getConversationOrThrow(ctx, args.conversationId, args.orgId);
		await ctx.db.patch(args.conversationId, {
			isArchived: false,
			updatedAt: Date.now(),
		});
		await logActivity(ctx, {
			orgId: args.orgId,
			userId,
			action: "conversation_unarchived",
			entityType: conversation.entityType,
			entityId: conversation.entityId,
			description: "Unarchived conversation",
			metadata: { conversationId: String(args.conversationId) },
		});
	},
});

// re-exported for tests
export const __internal = { listActiveMembers };

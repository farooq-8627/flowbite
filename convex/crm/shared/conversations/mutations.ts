/**
 * Conversation mutations — convex/crm/shared/conversations/mutations.ts
 *
 * Public surface for managing chat threads. The `messages.send` mutation
 * implicitly calls `ensureForEntity` on first message — so most apps never
 * need to call these directly. They exist for explicit invite / mute /
 * archive flows.
 *
 * 2026-05-26 — Stage 2 of SPRINT-PLAN.md adds *ForAI internal twins
 * (per AGENTS.md non-negotiable rule) so the AI tool layer
 * (`convex/ai/tools/messaging/*`) can drive these mutations from inside
 * `processChat.run`. Each public + ForAI pair shares an `*Impl` helper
 * so the bodies cannot diverge.
 */

import { ConvexError, v } from "convex/values";
import {
	orgMutation,
	requireOrgMember,
	requireOrgMemberByIds,
} from "../../../_functions/authenticated";
import type { Id } from "../../../_generated/dataModel";
import { internalMutation, type MutationCtx } from "../../../_generated/server";
import { buildDmPairKey, entityTypeForChatValidator } from "../../../_shared/entityCodes";
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

// ─── ensureForEntity ─────────────────────────────────────────────────────────

async function ensureForEntityImpl(
	ctx: MutationCtx,
	args: {
		orgId: Id<"orgs">;
		userId: Id<"users">;
		memberPermissions: string[];
		entityType:
			| "user"
			| "lead"
			| "contact"
			| "person"
			| "deal"
			| "company"
			| "project"
			| "task";
		entityId: string;
		threadId?: string;
	},
): Promise<Id<"conversations">> {
	requireRole(args.memberPermissions, "messages.view");

	return await getOrCreateConversation(ctx, {
		orgId: args.orgId,
		entityType: args.entityType,
		entityId: args.entityId,
		threadId: args.threadId,
		creatorId: args.userId,
	});
}

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
		return ensureForEntityImpl(ctx, {
			...args,
			userId,
			memberPermissions: member.permissions,
		});
	},
});

export const ensureForEntityForAI = internalMutation({
	args: {
		orgId: v.id("orgs"),
		userId: v.id("users"),
		entityType: entityTypeForChatValidator,
		entityId: v.string(),
		threadId: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const { member } = await requireOrgMemberByIds(ctx, args.orgId, args.userId);
		const { userId: _u, ...rest } = args;
		return ensureForEntityImpl(ctx, {
			...rest,
			userId: args.userId,
			memberPermissions: member.permissions,
		});
	},
});

// ─── addParticipants ─────────────────────────────────────────────────────────

async function addParticipantsImpl(
	ctx: MutationCtx,
	args: {
		orgId: Id<"orgs">;
		userId: Id<"users">;
		memberPermissions: string[];
		conversationId: Id<"conversations">;
		userIds: Id<"users">[];
		role?: "participant" | "watcher";
		notificationLevel?: "all" | "mentions" | "none";
	},
): Promise<{ added: number }> {
	requireRole(args.memberPermissions, "messages.subscribe");

	const conversation = await getConversationOrThrow(ctx, args.conversationId, args.orgId);

	const myMembership = await getMyMembership(ctx, {
		conversationId: args.conversationId,
		userId: args.userId,
	});
	const isOwner = myMembership?.role === "owner";
	const canModerate = hasPermission(args.memberPermissions, "messages.viewAll");
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
			joinedBy: args.userId,
			joinReason: "invite",
		});
		added.push(memberId);

		if (targetUserId !== args.userId) {
			await sendNotification(ctx, {
				orgId: args.orgId,
				userId: targetUserId,
				type: "conversation_invite",
				title: "You were added to a conversation",
				entityType: conversation.entityType,
				entityId: conversation.entityId,
				metadata: { conversationId: String(args.conversationId) },
			});
		}
	}

	await logActivity(ctx, {
		orgId: args.orgId,
		userId: args.userId,
		action: "conversation_members_added",
		entityType: conversation.entityType,
		entityId: conversation.entityId,
		description: `Added ${args.userIds.length} member(s) to conversation`,
		metadata: { conversationId: String(args.conversationId), count: args.userIds.length },
	});

	return { added: added.length };
}

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
		return addParticipantsImpl(ctx, {
			...args,
			userId,
			memberPermissions: member.permissions,
		});
	},
});

export const addParticipantsForAI = internalMutation({
	args: {
		orgId: v.id("orgs"),
		userId: v.id("users"),
		conversationId: v.id("conversations"),
		userIds: v.array(v.id("users")),
		role: v.optional(v.union(v.literal("participant"), v.literal("watcher"))),
		notificationLevel: v.optional(
			v.union(v.literal("all"), v.literal("mentions"), v.literal("none")),
		),
	},
	handler: async (ctx, args) => {
		const { member } = await requireOrgMemberByIds(ctx, args.orgId, args.userId);
		const { userId: _u, ...rest } = args;
		return addParticipantsImpl(ctx, {
			...rest,
			userId: args.userId,
			memberPermissions: member.permissions,
		});
	},
});

// ─── removeParticipant ───────────────────────────────────────────────────────

async function removeParticipantImpl(
	ctx: MutationCtx,
	args: {
		orgId: Id<"orgs">;
		callerId: Id<"users">;
		memberPermissions: string[];
		conversationId: Id<"conversations">;
		targetUserId: Id<"users">;
	},
): Promise<void> {
	requireRole(args.memberPermissions, "messages.subscribe");

	const conversation = await getConversationOrThrow(ctx, args.conversationId, args.orgId);

	const myMembership = await getMyMembership(ctx, {
		conversationId: args.conversationId,
		userId: args.callerId,
	});
	const isOwner = myMembership?.role === "owner";
	const canModerate = hasPermission(args.memberPermissions, "messages.viewAll");
	const isSelfRemoval = args.targetUserId === args.callerId;
	if (!(isOwner || canModerate || isSelfRemoval)) {
		throw new ConvexError(ERRORS.FORBIDDEN);
	}

	const target = await ctx.db
		.query("conversationMembers")
		.withIndex("by_user_and_conversation", (q) =>
			q.eq("userId", args.targetUserId).eq("conversationId", args.conversationId),
		)
		.first();
	if (!target) return;

	await ctx.db.patch(target._id, { leftAt: Date.now() });

	await logActivity(ctx, {
		orgId: args.orgId,
		userId: args.callerId,
		action: isSelfRemoval ? "conversation_left" : "conversation_member_removed",
		entityType: conversation.entityType,
		entityId: conversation.entityId,
		description: isSelfRemoval ? "Left conversation" : "Removed member from conversation",
		metadata: { conversationId: String(args.conversationId) },
	});
}

export const removeParticipant = orgMutation({
	args: {
		orgId: v.id("orgs"),
		conversationId: v.id("conversations"),
		userId: v.id("users"),
	},
	handler: async (ctx, args) => {
		const { member, userId: callerId } = await requireOrgMember(ctx, args.orgId);
		return removeParticipantImpl(ctx, {
			orgId: args.orgId,
			callerId,
			memberPermissions: member.permissions,
			conversationId: args.conversationId,
			targetUserId: args.userId,
		});
	},
});

export const removeParticipantForAI = internalMutation({
	args: {
		orgId: v.id("orgs"),
		userId: v.id("users"),
		conversationId: v.id("conversations"),
		targetUserId: v.id("users"),
	},
	handler: async (ctx, args) => {
		const { member } = await requireOrgMemberByIds(ctx, args.orgId, args.userId);
		return removeParticipantImpl(ctx, {
			orgId: args.orgId,
			callerId: args.userId,
			memberPermissions: member.permissions,
			conversationId: args.conversationId,
			targetUserId: args.targetUserId,
		});
	},
});

// ─── leave ───────────────────────────────────────────────────────────────────

async function leaveImpl(
	ctx: MutationCtx,
	args: { orgId: Id<"orgs">; userId: Id<"users">; conversationId: Id<"conversations"> },
): Promise<void> {
	const conversation = await getConversationOrThrow(ctx, args.conversationId, args.orgId);
	const me = await getMyMembership(ctx, {
		conversationId: args.conversationId,
		userId: args.userId,
	});
	if (!me) return;

	await ctx.db.patch(me._id, { leftAt: Date.now() });

	await logActivity(ctx, {
		orgId: args.orgId,
		userId: args.userId,
		action: "conversation_left",
		entityType: conversation.entityType,
		entityId: conversation.entityId,
		description: "Left conversation",
		metadata: { conversationId: String(args.conversationId) },
	});
}

export const leave = orgMutation({
	args: { orgId: v.id("orgs"), conversationId: v.id("conversations") },
	handler: async (ctx, args) => {
		const { userId } = await requireOrgMember(ctx, args.orgId);
		return leaveImpl(ctx, { ...args, userId });
	},
});

export const leaveForAI = internalMutation({
	args: {
		orgId: v.id("orgs"),
		userId: v.id("users"),
		conversationId: v.id("conversations"),
	},
	handler: async (ctx, args) => {
		await requireOrgMemberByIds(ctx, args.orgId, args.userId);
		return leaveImpl(ctx, args);
	},
});

// ─── updateNotificationLevel ─────────────────────────────────────────────────

async function updateNotificationLevelImpl(
	ctx: MutationCtx,
	args: {
		orgId: Id<"orgs">;
		userId: Id<"users">;
		conversationId: Id<"conversations">;
		level: "all" | "mentions" | "none";
	},
): Promise<void> {
	const me = await getMyMembership(ctx, {
		conversationId: args.conversationId,
		userId: args.userId,
	});
	if (!me) throw new ConvexError(ERRORS.NOT_FOUND);
	await ctx.db.patch(me._id, { notificationLevel: args.level });
}

export const updateNotificationLevel = orgMutation({
	args: {
		orgId: v.id("orgs"),
		conversationId: v.id("conversations"),
		level: v.union(v.literal("all"), v.literal("mentions"), v.literal("none")),
	},
	handler: async (ctx, args) => {
		const { userId } = await requireOrgMember(ctx, args.orgId);
		return updateNotificationLevelImpl(ctx, { ...args, userId });
	},
});

export const updateNotificationLevelForAI = internalMutation({
	args: {
		orgId: v.id("orgs"),
		userId: v.id("users"),
		conversationId: v.id("conversations"),
		level: v.union(v.literal("all"), v.literal("mentions"), v.literal("none")),
	},
	handler: async (ctx, args) => {
		await requireOrgMemberByIds(ctx, args.orgId, args.userId);
		return updateNotificationLevelImpl(ctx, args);
	},
});

// ─── markRead ────────────────────────────────────────────────────────────────

async function markReadImpl(
	ctx: MutationCtx,
	args: {
		orgId: Id<"orgs">;
		userId: Id<"users">;
		conversationId: Id<"conversations">;
	},
): Promise<void> {
	const me = await getMyMembership(ctx, {
		conversationId: args.conversationId,
		userId: args.userId,
	});
	if (!me) return;

	// Idempotency / OCC guard. See the original public `markRead` comment
	// for the full rationale — `lastReadAt` is monotonic, so we skip any
	// no-op patch.
	const now = Date.now();
	if (me.lastReadAt !== undefined && me.lastReadAt >= now) {
		return;
	}
	await ctx.db.patch(me._id, { lastReadAt: now });
}

export const markRead = orgMutation({
	args: { orgId: v.id("orgs"), conversationId: v.id("conversations") },
	handler: async (ctx, args) => {
		const { userId } = await requireOrgMember(ctx, args.orgId);
		return markReadImpl(ctx, { ...args, userId });
	},
});

export const markReadForAI = internalMutation({
	args: {
		orgId: v.id("orgs"),
		userId: v.id("users"),
		conversationId: v.id("conversations"),
	},
	handler: async (ctx, args) => {
		await requireOrgMemberByIds(ctx, args.orgId, args.userId);
		return markReadImpl(ctx, args);
	},
});

// ─── archive / unarchive ─────────────────────────────────────────────────────

async function archiveImpl(
	ctx: MutationCtx,
	args: { orgId: Id<"orgs">; userId: Id<"users">; conversationId: Id<"conversations"> },
): Promise<void> {
	const conversation = await getConversationOrThrow(ctx, args.conversationId, args.orgId);
	await ctx.db.patch(args.conversationId, {
		isArchived: true,
		updatedAt: Date.now(),
	});
	await logActivity(ctx, {
		orgId: args.orgId,
		userId: args.userId,
		action: "conversation_archived",
		entityType: conversation.entityType,
		entityId: conversation.entityId,
		description: "Archived conversation",
		metadata: { conversationId: String(args.conversationId) },
	});
}

async function unarchiveImpl(
	ctx: MutationCtx,
	args: { orgId: Id<"orgs">; userId: Id<"users">; conversationId: Id<"conversations"> },
): Promise<void> {
	const conversation = await getConversationOrThrow(ctx, args.conversationId, args.orgId);
	await ctx.db.patch(args.conversationId, {
		isArchived: false,
		updatedAt: Date.now(),
	});
	await logActivity(ctx, {
		orgId: args.orgId,
		userId: args.userId,
		action: "conversation_unarchived",
		entityType: conversation.entityType,
		entityId: conversation.entityId,
		description: "Unarchived conversation",
		metadata: { conversationId: String(args.conversationId) },
	});
}

export const archive = orgMutation({
	args: { orgId: v.id("orgs"), conversationId: v.id("conversations") },
	handler: async (ctx, args) => {
		const { member, userId } = await requireOrgMember(ctx, args.orgId);
		requireRole(member.permissions, "conversations.archive");
		return archiveImpl(ctx, { ...args, userId });
	},
});

/** AI-callable internal twin. */
export const archiveForAI = internalMutation({
	args: {
		orgId: v.id("orgs"),
		userId: v.id("users"),
		conversationId: v.id("conversations"),
	},
	handler: async (ctx, args) => {
		const { member } = await requireOrgMemberByIds(ctx, args.orgId, args.userId);
		requireRole(member.permissions, "conversations.archive");
		return archiveImpl(ctx, args);
	},
});

export const unarchive = orgMutation({
	args: { orgId: v.id("orgs"), conversationId: v.id("conversations") },
	handler: async (ctx, args) => {
		const { member, userId } = await requireOrgMember(ctx, args.orgId);
		requireRole(member.permissions, "conversations.archive");
		return unarchiveImpl(ctx, { ...args, userId });
	},
});

/** AI-callable internal twin. */
export const unarchiveForAI = internalMutation({
	args: {
		orgId: v.id("orgs"),
		userId: v.id("users"),
		conversationId: v.id("conversations"),
	},
	handler: async (ctx, args) => {
		const { member } = await requireOrgMemberByIds(ctx, args.orgId, args.userId);
		requireRole(member.permissions, "conversations.archive");
		return unarchiveImpl(ctx, args);
	},
});

// re-exported for tests
export const __internal = { listActiveMembers };

// ─── Direct message (member-to-member 1:1 DM) ───────────────────────────────

async function ensureDirectMessageImpl(
	ctx: MutationCtx,
	args: { orgId: Id<"orgs">; userId: Id<"users">; targetUserId: Id<"users"> },
): Promise<Id<"conversations">> {
	if (args.targetUserId === args.userId) {
		throw new ConvexError({ code: "INVALID_ARGS", message: "Cannot DM yourself." });
	}

	const targetMember = await ctx.db
		.query("orgMembers")
		.withIndex("by_orgId_and_userId", (q) =>
			q.eq("orgId", args.orgId).eq("userId", args.targetUserId),
		)
		.first();
	if (!targetMember) throw new ConvexError(ERRORS.NOT_FOUND);

	const pairKey = buildDmPairKey(String(args.userId), String(args.targetUserId));

	const conversationId = await getOrCreateConversation(ctx, {
		orgId: args.orgId,
		entityType: "user",
		entityId: pairKey,
		creatorId: args.userId,
	});

	const convo = await ctx.db.get(conversationId);
	if (convo && !convo.title) {
		const callerUser = await ctx.db.get(args.userId);
		const targetUser = await ctx.db.get(args.targetUserId);
		const callerName = callerUser?.name ?? callerUser?.email?.split("@")[0] ?? "You";
		const targetName = targetUser?.name ?? targetUser?.email?.split("@")[0] ?? "Member";
		await ctx.db.patch(conversationId, {
			title: `${callerName} and ${targetName}`,
		});
	}

	await ensureMember(ctx, {
		orgId: args.orgId,
		conversationId,
		userId: args.targetUserId,
		role: "participant",
		joinReason: "auto",
	});

	return conversationId;
}

export const ensureDirectMessage = orgMutation({
	args: {
		orgId: v.id("orgs"),
		targetUserId: v.id("users"),
	},
	handler: async (ctx, args) => {
		const { member, userId } = await requireOrgMember(ctx, args.orgId);
		requireRole(member.permissions, "messages.view");
		return ensureDirectMessageImpl(ctx, { ...args, userId });
	},
});

/** AI-callable internal twin. */
export const ensureDirectMessageForAI = internalMutation({
	args: {
		orgId: v.id("orgs"),
		userId: v.id("users"),
		targetUserId: v.id("users"),
	},
	handler: async (ctx, args) => {
		const { member } = await requireOrgMemberByIds(ctx, args.orgId, args.userId);
		requireRole(member.permissions, "messages.view");
		return ensureDirectMessageImpl(ctx, args);
	},
});

// ─── Rename conversation ─────────────────────────────────────────────────────

async function renameImpl(
	ctx: MutationCtx,
	args: {
		orgId: Id<"orgs">;
		userId: Id<"users">;
		conversationId: Id<"conversations">;
		title: string;
	},
): Promise<void> {
	await getConversationOrThrow(ctx, args.conversationId, args.orgId);
	const myMembership = await getMyMembership(ctx, {
		conversationId: args.conversationId,
		userId: args.userId,
	});
	if (!myMembership) throw new ConvexError(ERRORS.FORBIDDEN);

	const trimmed = args.title.trim();
	if (trimmed.length === 0 || trimmed.length > 100) {
		throw new ConvexError(ERRORS.INVALID_ARGS);
	}

	await ctx.db.patch(args.conversationId, {
		title: trimmed,
		updatedAt: Date.now(),
	});
}

export const rename = orgMutation({
	args: {
		orgId: v.id("orgs"),
		conversationId: v.id("conversations"),
		title: v.string(),
	},
	handler: async (ctx, args) => {
		const { member, userId } = await requireOrgMember(ctx, args.orgId);
		requireRole(member.permissions, "messages.view");
		return renameImpl(ctx, { ...args, userId });
	},
});

/** AI-callable internal twin. */
export const renameForAI = internalMutation({
	args: {
		orgId: v.id("orgs"),
		userId: v.id("users"),
		conversationId: v.id("conversations"),
		title: v.string(),
	},
	handler: async (ctx, args) => {
		const { member } = await requireOrgMemberByIds(ctx, args.orgId, args.userId);
		requireRole(member.permissions, "messages.view");
		return renameImpl(ctx, args);
	},
});

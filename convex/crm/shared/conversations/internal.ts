/**
 * Conversation internals — convex/crm/shared/conversations/internal.ts
 *
 * Shared, non-exposed helpers used by `messages.send` and the conversation
 * mutations themselves. These functions assume the caller has already
 * verified org membership and permissions — they do NOT re-check.
 *
 * Public mutations live in `mutations.ts`; queries in `queries.ts`.
 */

import { ConvexError } from "convex/values";
import type { Id } from "../../../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../../../_generated/server";
import type { EntityTypeForChat } from "../../../_shared/entityCodes";
import { ERRORS } from "../../../_shared/errors";

// ─── Lookup ──────────────────────────────────────────────────────────────────

export async function findConversation(
	ctx: QueryCtx | MutationCtx,
	args: {
		orgId: Id<"orgs">;
		entityType: EntityTypeForChat;
		entityId: string;
		threadId?: string;
	},
) {
	const matches = await ctx.db
		.query("conversations")
		.withIndex("by_org_and_entity", (q) =>
			q
				.eq("orgId", args.orgId)
				.eq("entityType", args.entityType)
				.eq("entityId", args.entityId),
		)
		.take(50); // bounded — typical entity has 1–3 threads
	return matches.find((c) => (c.threadId ?? null) === (args.threadId ?? null)) ?? null;
}

/**
 * Resolve (and create if missing) the conversation for an entity thread.
 * Adds the creator as an `owner` participant on first creation.
 */
export async function getOrCreateConversation(
	ctx: MutationCtx,
	args: {
		orgId: Id<"orgs">;
		entityType: EntityTypeForChat;
		entityId: string;
		threadId?: string;
		creatorId: Id<"users">;
	},
): Promise<Id<"conversations">> {
	const existing = await findConversation(ctx, args);
	if (existing) return existing._id;

	const now = Date.now();
	const conversationId = await ctx.db.insert("conversations", {
		orgId: args.orgId,
		entityType: args.entityType,
		entityId: args.entityId,
		threadId: args.threadId,
		isArchived: false,
		createdBy: args.creatorId,
		createdAt: now,
		updatedAt: now,
	});

	// Owner row for the creator.
	await ensureMember(ctx, {
		orgId: args.orgId,
		conversationId,
		userId: args.creatorId,
		role: "owner",
		joinReason: "self",
	});

	return conversationId;
}

// ─── Membership ──────────────────────────────────────────────────────────────

/**
 * Add a user to a conversation if not already an active member. Idempotent.
 *
 * If the user previously left (`leftAt` set), they are re-activated.
 */
export async function ensureMember(
	ctx: MutationCtx,
	args: {
		orgId: Id<"orgs">;
		conversationId: Id<"conversations">;
		userId: Id<"users">;
		role?: "owner" | "participant" | "watcher";
		notificationLevel?: "all" | "mentions" | "none";
		joinedBy?: Id<"users">;
		joinReason: "auto" | "invite" | "mention" | "self";
	},
): Promise<Id<"conversationMembers">> {
	const existing = await ctx.db
		.query("conversationMembers")
		.withIndex("by_user_and_conversation", (q) =>
			q.eq("userId", args.userId).eq("conversationId", args.conversationId),
		)
		.first();

	const now = Date.now();
	if (existing) {
		if (existing.leftAt !== undefined) {
			// Re-activate (rejoin)
			await ctx.db.patch(existing._id, {
				leftAt: undefined,
				joinedAt: now,
				joinedBy: args.joinedBy,
				joinReason: args.joinReason,
				...(args.role ? { role: args.role } : {}),
			});
		}
		return existing._id;
	}

	return await ctx.db.insert("conversationMembers", {
		orgId: args.orgId,
		conversationId: args.conversationId,
		userId: args.userId,
		role: args.role ?? "participant",
		notificationLevel: args.notificationLevel ?? "all",
		joinedAt: now,
		joinedBy: args.joinedBy,
		joinReason: args.joinReason,
	});
}

/**
 * List all currently-active members of a conversation (excludes leftAt).
 * Bounded at 200 — production limit per thread.
 */
export async function listActiveMembers(
	ctx: QueryCtx | MutationCtx,
	conversationId: Id<"conversations">,
) {
	const all = await ctx.db
		.query("conversationMembers")
		.withIndex("by_conversation", (q) => q.eq("conversationId", conversationId))
		.take(200);
	return all.filter((m) => m.leftAt === undefined);
}

/**
 * Verify the caller has access to a conversation. Returns the membership row
 * if the user is an active member; null otherwise. The caller decides what
 * to do (e.g. fall back to `messages.viewAll` permission for moderation).
 */
export async function getMyMembership(
	ctx: QueryCtx | MutationCtx,
	args: { conversationId: Id<"conversations">; userId: Id<"users"> },
) {
	const member = await ctx.db
		.query("conversationMembers")
		.withIndex("by_user_and_conversation", (q) =>
			q.eq("userId", args.userId).eq("conversationId", args.conversationId),
		)
		.first();
	if (!member || member.leftAt !== undefined) return null;
	return member;
}

// ─── Conversation lookup with org-scope check ────────────────────────────────

export async function getConversationOrThrow(
	ctx: QueryCtx | MutationCtx,
	conversationId: Id<"conversations">,
	orgId: Id<"orgs">,
) {
	const conversation = await ctx.db.get(conversationId);
	if (!conversation || conversation.orgId !== orgId) {
		throw new ConvexError(ERRORS.NOT_FOUND);
	}
	return conversation;
}

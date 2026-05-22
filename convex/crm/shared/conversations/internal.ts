/**
 * Conversation internals — convex/crm/shared/conversations/internal.ts
 *
 * Shared, non-exposed helpers used by `messages.send` and the conversation
 * mutations themselves. These functions assume the caller has already
 * verified org membership and permissions — they do NOT re-check.
 *
 * Public mutations live in `mutations.ts`; queries in `queries.ts`.
 *
 * 2026-05-19 — person conversation normalisation
 * ─────────────────────────────────────────────
 * Doctrine: a person's conversation always uses `entityType: "person"`,
 * NEVER `lead` / `contact`. Reasons:
 *   1. A personCode survives lead → contact conversion. The thread should
 *      follow the person, not split when the lead is converted.
 *   2. Profile page and global inbox must show the SAME thread for the
 *      same person — a single source of truth.
 *   3. AI tools key on personCode, not on the lead/contact discriminator.
 *
 * `normaliseEntityType()` is the single chokepoint for this rule. Every
 * write path runs through it; reads do too via `findConversation()`.
 *
 * For backwards-compat with conversations created before this rule
 * landed, `findConversation()` does a SECONDARY lookup against any
 * legacy `lead` / `contact` rows for the same personCode and re-keys
 * the row to `person` on first read. Idempotent.
 */

import { ConvexError } from "convex/values";
import type { Id } from "../../../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../../../_generated/server";
import type { EntityTypeForChat } from "../../../_shared/entityCodes";
import { ERRORS } from "../../../_shared/errors";

/**
 * Person-conversation normalisation. Every entry that targets a person
 * (lead / contact / person) collapses to `entityType: "person"`. Other
 * entity types pass through unchanged.
 */
export function normaliseEntityType(entityType: EntityTypeForChat): EntityTypeForChat {
	if (entityType === "lead" || entityType === "contact") return "person";
	return entityType;
}

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
	const target = normaliseEntityType(args.entityType);

	const matches = await ctx.db
		.query("conversations")
		.withIndex("by_org_and_entity", (q) =>
			q.eq("orgId", args.orgId).eq("entityType", target).eq("entityId", args.entityId),
		)
		.take(50); // bounded — typical entity has 1–3 threads
	const direct = matches.find((c) => (c.threadId ?? null) === (args.threadId ?? null));
	if (direct) return direct;

	// Backwards-compat: if we're looking for a person, also check the legacy
	// `lead` / `contact` keys. Conversations created before the 2026-05-19
	// normalisation rule may still be keyed there. Returning the legacy
	// row is enough — write paths re-key it to `person` automatically.
	if (target === "person") {
		const legacy = await ctx.db
			.query("conversations")
			.withIndex("by_org_and_entity", (q) =>
				q.eq("orgId", args.orgId).eq("entityType", "lead").eq("entityId", args.entityId),
			)
			.take(50);
		const legacyMatch = legacy.find((c) => (c.threadId ?? null) === (args.threadId ?? null));
		if (legacyMatch) return legacyMatch;

		const contactLegacy = await ctx.db
			.query("conversations")
			.withIndex("by_org_and_entity", (q) =>
				q.eq("orgId", args.orgId).eq("entityType", "contact").eq("entityId", args.entityId),
			)
			.take(50);
		const contactMatch = contactLegacy.find(
			(c) => (c.threadId ?? null) === (args.threadId ?? null),
		);
		if (contactMatch) return contactMatch;
	}
	return null;
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
	const normalised = normaliseEntityType(args.entityType);
	const lookupArgs = { ...args, entityType: normalised };

	const existing = await findConversation(ctx, lookupArgs);
	if (existing) {
		// If we found a legacy lead/contact-keyed row, opportunistically re-key
		// it to `person` so future reads hit the canonical index path. Skips
		// when already canonical.
		if (
			normalised === "person" &&
			(existing.entityType === "lead" || existing.entityType === "contact")
		) {
			await ctx.db.patch(existing._id, {
				entityType: "person",
				updatedAt: Date.now(),
			});
		}
		return existing._id;
	}

	const now = Date.now();
	const conversationId = await ctx.db.insert("conversations", {
		orgId: args.orgId,
		entityType: normalised,
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

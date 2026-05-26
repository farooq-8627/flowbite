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
 *
 * 2026-05-26 — Stage 2 of SPRINT-PLAN.md adds *ForAI internal twins so the
 * AI tool layer (`convex/ai/tools/messaging/*`) can drive these mutations
 * from inside `processChat.run`. Per AGENTS.md non-negotiable rule, every
 * public mutation called by an AI tool MUST have a same-file twin that
 * validates auth via `requireOrgMemberByIds(ctx, orgId, userId)` instead
 * of `getAuthUserId(ctx)`. Each public + ForAI pair shares an `*Impl`
 * helper so the bodies cannot diverge.
 */

import { ConvexError, v } from "convex/values";
import {
	orgMutation,
	requireOrgMember,
	requireOrgMemberByIds,
} from "../../../_functions/authenticated";
import type { Id } from "../../../_generated/dataModel";
import { internalMutation, type MutationCtx } from "../../../_generated/server";
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
	normaliseEntityType,
} from "../conversations/internal";

const EDIT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes

// ─── send ────────────────────────────────────────────────────────────────────

type SendImplArgs = {
	orgId: Id<"orgs">;
	userId: Id<"users">;
	memberPermissions: string[];
	conversationId?: Id<"conversations">;
	entityType?: "user" | "lead" | "contact" | "person" | "deal" | "company" | "project" | "task";
	entityId?: string;
	threadId?: string;
	content: string;
	authorType?: "user" | "ai" | "system" | "contact";
	onBehalfOf?: Id<"users">;
	replyToId?: Id<"messages">;
	attachments?: Id<"files">[];
	mentions?: Id<"users">[];
	channel?: "internal" | "whatsapp" | "email" | "sms";
	authorPersonCode?: string;
	idempotencyKey?: string;
	senderDisplayName?: string;
};

async function sendImpl(ctx: MutationCtx, args: SendImplArgs): Promise<Id<"messages">> {
	requireRole(args.memberPermissions, "messages.send");
	await enforceRateLimit(ctx, {
		orgId: args.orgId,
		scope: "messages.send",
		key: `${args.userId}:${args.orgId}`,
		...RATE_LIMITS.write,
	});

	const trimmed = args.content.trim();
	const hasAttachments = (args.attachments?.length ?? 0) > 0;
	// Body must contain SOMETHING — text OR attachments. File-only sends
	// (e.g. "send these 3 photos with no caption") are valid; pure empty
	// sends are not.
	if (trimmed.length === 0 && !hasAttachments) {
		throw new ConvexError({
			code: "INVALID_ARGS",
			message: "Message must contain text, attachments, or both.",
		});
	}

	// Resolve conversation — either by id or by (entityType, entityId).
	let conversationId: Id<"conversations">;
	let entityType: SendImplArgs["entityType"];
	let entityId: string;
	if (args.conversationId) {
		const convo = await getConversationOrThrow(ctx, args.conversationId, args.orgId);
		conversationId = convo._id;
		entityType = convo.entityType;
		entityId = convo.entityId;
	} else if (args.entityType && args.entityId) {
		const normalised = normaliseEntityType(args.entityType);
		conversationId = await getOrCreateConversation(ctx, {
			orgId: args.orgId,
			entityType: normalised,
			entityId: args.entityId,
			threadId: args.threadId,
			creatorId: args.userId,
		});
		entityType = normalised;
		entityId = args.entityId;
	} else {
		throw new ConvexError({
			code: "INVALID_ARGS",
			message: "send requires either conversationId or (entityType + entityId)",
		});
	}

	// Idempotency check.
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
		authorId: args.userId,
		authorType: args.authorType ?? "user",
		onBehalfOf: args.onBehalfOf,
		replyToId: args.replyToId,
		attachments: args.attachments,
		mentions: args.mentions,
		channel: args.channel,
		authorPersonCode: args.authorPersonCode,
		idempotencyKey: args.idempotencyKey,
		createdAt: now,
		updatedAt: now,
	});

	// 2. Update the conversation summary (denormalised for inbox query).
	await ctx.db.patch(conversationId, {
		lastMessageAt: now,
		lastMessagePreview: trimmed.slice(0, 200),
		lastMessageAuthorId: args.userId,
		updatedAt: now,
	});

	// 3. Ensure the sender is a participant.
	await ensureMember(ctx, {
		orgId: args.orgId,
		conversationId,
		userId: args.userId,
		role: "participant",
		joinReason: "auto",
	});

	// 4. Auto-add the entity assignee.
	const assigneeId = await resolveEntityAssignee(ctx, {
		orgId: args.orgId,
		entityType: entityType ?? "person",
		entityId,
	});
	if (assigneeId && assigneeId !== args.userId) {
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
		if (mentionedId === args.userId) continue;
		await ensureMember(ctx, {
			orgId: args.orgId,
			conversationId,
			userId: mentionedId,
			role: "participant",
			joinReason: "mention",
		});
		mentionedSet.add(String(mentionedId));
	}

	// Pre-resolve sender display name.
	let senderDisplay = args.senderDisplayName;
	if (!senderDisplay) {
		const senderUser = await ctx.db.get(args.userId);
		senderDisplay =
			senderUser?.name?.split(" ")[0] ?? senderUser?.email?.split("@")[0] ?? "Someone";
	}

	// 6. Fan-out notifications.
	const members = await listActiveMembers(ctx, conversationId);
	for (const m of members) {
		if (m.userId === args.userId) continue;

		const isMentioned = mentionedSet.has(String(m.userId));
		const level = m.notificationLevel;

		if (!isMentioned) {
			if (level === "none") continue;
			if (level === "mentions") continue;
		}

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
			metadata: {
				conversationId: String(conversationId),
				messageId: String(messageId),
				personCode: personCode ?? "",
			},
		});
	}

	// 7. Activity log.
	await logActivity(ctx, {
		orgId: args.orgId,
		userId: args.userId,
		actorType: args.authorType === "ai" ? "ai" : "user",
		action: "message_sent",
		entityType: entityType ?? "person",
		entityId,
		personCode,
		description: `Message sent: ${trimmed.slice(0, 80)}${trimmed.length > 80 ? "…" : ""}`,
		metadata: { messageId: String(messageId), conversationId: String(conversationId) },
	});

	return messageId;
}

/**
 * Send a message into a conversation thread.
 *
 * Either pass `conversationId` (existing thread) OR `entityType + entityId`
 * (auto-create / find). Mutually exclusive — provide one set.
 */
export const send = orgMutation({
	args: {
		orgId: v.id("orgs"),
		conversationId: v.optional(v.id("conversations")),
		entityType: v.optional(entityTypeForChatValidator),
		entityId: v.optional(v.string()),
		threadId: v.optional(v.string()),
		content: v.string(),
		authorType: v.optional(
			v.union(v.literal("user"), v.literal("ai"), v.literal("system"), v.literal("contact")),
		),
		onBehalfOf: v.optional(v.id("users")),
		replyToId: v.optional(v.id("messages")),
		attachments: v.optional(v.array(v.id("files"))),
		mentions: v.optional(v.array(v.id("users"))),
		channel: v.optional(
			v.union(
				v.literal("internal"),
				v.literal("whatsapp"),
				v.literal("email"),
				v.literal("sms"),
			),
		),
		authorPersonCode: v.optional(v.string()),
		idempotencyKey: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const { member, userId } = await requireOrgMember(ctx, args.orgId);
		return sendImpl(ctx, {
			...args,
			userId,
			memberPermissions: member.permissions,
		});
	},
});

/**
 * AI-callable internal twin. See AGENTS.md "AI tools call *ForAI" rule.
 *
 * Same body as `send` — auth comes from a trusted `userId` arg instead of
 * `ctx.auth`. Caller is the AI orchestrator inside a scheduled action.
 *
 * Includes a forced `authorType: "ai"` default so the resulting activity
 * log row + notification preview correctly attribute to the AI.
 */
export const sendForAI = internalMutation({
	args: {
		orgId: v.id("orgs"),
		userId: v.id("users"),
		conversationId: v.optional(v.id("conversations")),
		entityType: v.optional(entityTypeForChatValidator),
		entityId: v.optional(v.string()),
		threadId: v.optional(v.string()),
		content: v.string(),
		authorType: v.optional(
			v.union(v.literal("user"), v.literal("ai"), v.literal("system"), v.literal("contact")),
		),
		onBehalfOf: v.optional(v.id("users")),
		replyToId: v.optional(v.id("messages")),
		attachments: v.optional(v.array(v.id("files"))),
		mentions: v.optional(v.array(v.id("users"))),
		channel: v.optional(
			v.union(
				v.literal("internal"),
				v.literal("whatsapp"),
				v.literal("email"),
				v.literal("sms"),
			),
		),
		authorPersonCode: v.optional(v.string()),
		idempotencyKey: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const { member } = await requireOrgMemberByIds(ctx, args.orgId, args.userId);
		const { userId: _u, ...rest } = args;
		return sendImpl(ctx, {
			...rest,
			userId: args.userId,
			memberPermissions: member.permissions,
			// Default authorType to "ai" when the AI tool layer drives the send.
			// The AI tool can still pass "user" to send-on-behalf-of (rare).
			authorType: args.authorType ?? "ai",
		});
	},
});

// ─── update ──────────────────────────────────────────────────────────────────

async function updateImpl(
	ctx: MutationCtx,
	args: {
		orgId: Id<"orgs">;
		userId: Id<"users">;
		memberPermissions: string[];
		messageId: Id<"messages">;
		content: string;
	},
): Promise<void> {
	const message = await ctx.db.get(args.messageId);
	if (!message || message.orgId !== args.orgId || message.deletedAt !== undefined) {
		throw new ConvexError(ERRORS.NOT_FOUND);
	}

	const isOwn = message.authorId === args.userId;
	const canEditOwn = hasPermission(args.memberPermissions, "messages.editOwn");
	const canEditAny = hasPermission(args.memberPermissions, "messages.deleteAny");

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
		userId: args.userId,
		action: "message_edited",
		entityType: message.entityType,
		entityId: message.entityId,
		personCode: message.personCode,
		description: "Message edited",
		metadata: { messageId: String(args.messageId) },
	});
}

export const update = orgMutation({
	args: {
		orgId: v.id("orgs"),
		messageId: v.id("messages"),
		content: v.string(),
	},
	handler: async (ctx, args) => {
		const { member, userId } = await requireOrgMember(ctx, args.orgId);
		return updateImpl(ctx, { ...args, userId, memberPermissions: member.permissions });
	},
});

export const updateForAI = internalMutation({
	args: {
		orgId: v.id("orgs"),
		userId: v.id("users"),
		messageId: v.id("messages"),
		content: v.string(),
	},
	handler: async (ctx, args) => {
		const { member } = await requireOrgMemberByIds(ctx, args.orgId, args.userId);
		const { userId: _u, ...rest } = args;
		return updateImpl(ctx, {
			...rest,
			userId: args.userId,
			memberPermissions: member.permissions,
		});
	},
});

// ─── remove ──────────────────────────────────────────────────────────────────

async function removeImpl(
	ctx: MutationCtx,
	args: {
		orgId: Id<"orgs">;
		userId: Id<"users">;
		memberPermissions: string[];
		messageId: Id<"messages">;
		mode?: "self" | "everyone";
	},
): Promise<void> {
	const message = await ctx.db.get(args.messageId);
	if (!message || message.orgId !== args.orgId || message.deletedAt !== undefined) {
		throw new ConvexError(ERRORS.NOT_FOUND);
	}

	const mode = args.mode ?? "self";

	if (mode === "self") {
		const already = (message.deletedFor ?? []).some((u) => String(u) === String(args.userId));
		if (already) return;
		await ctx.db.patch(args.messageId, {
			deletedFor: [...(message.deletedFor ?? []), args.userId],
			updatedAt: Date.now(),
		});
		return;
	}

	const isOwn = message.authorId === args.userId;
	const canDeleteOwn = hasPermission(args.memberPermissions, "messages.deleteOwn");
	const canDeleteAny = hasPermission(args.memberPermissions, "messages.deleteAny");
	const within = Date.now() - message.createdAt < EDIT_WINDOW_MS;
	if (!(canDeleteAny || (isOwn && canDeleteOwn && within))) {
		throw new ConvexError(ERRORS.FORBIDDEN);
	}

	const conversationId = message.conversationId;
	const entityType = message.entityType;
	const entityId = message.entityId;
	const personCode = message.personCode;

	await ctx.db.delete(args.messageId);

	const nextNewest = await ctx.db
		.query("messages")
		.withIndex("by_conversation_and_created", (q) => q.eq("conversationId", conversationId))
		.order("desc")
		.first();

	await ctx.db.patch(conversationId, {
		lastMessageAt: nextNewest?.createdAt,
		lastMessagePreview: nextNewest?.content.slice(0, 200),
		lastMessageAuthorId: nextNewest?.authorId,
		updatedAt: Date.now(),
	});

	await logActivity(ctx, {
		orgId: args.orgId,
		userId: args.userId,
		action: "message_deleted",
		entityType,
		entityId,
		personCode,
		description: "Message deleted (for everyone)",
		metadata: { messageId: String(args.messageId) },
	});
}

export const remove = orgMutation({
	args: {
		orgId: v.id("orgs"),
		messageId: v.id("messages"),
		mode: v.optional(v.union(v.literal("self"), v.literal("everyone"))),
	},
	handler: async (ctx, args) => {
		const { member, userId } = await requireOrgMember(ctx, args.orgId);
		return removeImpl(ctx, { ...args, userId, memberPermissions: member.permissions });
	},
});

export const removeForAI = internalMutation({
	args: {
		orgId: v.id("orgs"),
		userId: v.id("users"),
		messageId: v.id("messages"),
		mode: v.optional(v.union(v.literal("self"), v.literal("everyone"))),
	},
	handler: async (ctx, args) => {
		const { member } = await requireOrgMemberByIds(ctx, args.orgId, args.userId);
		const { userId: _u, ...rest } = args;
		return removeImpl(ctx, {
			...rest,
			userId: args.userId,
			memberPermissions: member.permissions,
		});
	},
});

// ─── toggleReaction ──────────────────────────────────────────────────────────

async function toggleReactionImpl(
	ctx: MutationCtx,
	args: {
		orgId: Id<"orgs">;
		userId: Id<"users">;
		memberPermissions: string[];
		messageId: Id<"messages">;
		emoji: string;
	},
): Promise<void> {
	requireRole(args.memberPermissions, "messages.send");

	const message = await ctx.db.get(args.messageId);
	if (!message || message.orgId !== args.orgId || message.deletedAt !== undefined) {
		throw new ConvexError(ERRORS.NOT_FOUND);
	}

	const reactions = message.reactions ?? [];
	const existing = reactions.find(
		(r) => String(r.userId) === String(args.userId) && r.emoji === args.emoji,
	);

	const next = existing
		? reactions.filter(
				(r) => !(String(r.userId) === String(args.userId) && r.emoji === args.emoji),
			)
		: [...reactions, { userId: args.userId, emoji: args.emoji, createdAt: Date.now() }];

	await ctx.db.patch(args.messageId, {
		reactions: next,
		updatedAt: Date.now(),
	});
}

export const toggleReaction = orgMutation({
	args: {
		orgId: v.id("orgs"),
		messageId: v.id("messages"),
		emoji: v.string(),
	},
	handler: async (ctx, args) => {
		const { member, userId } = await requireOrgMember(ctx, args.orgId);
		return toggleReactionImpl(ctx, { ...args, userId, memberPermissions: member.permissions });
	},
});

export const toggleReactionForAI = internalMutation({
	args: {
		orgId: v.id("orgs"),
		userId: v.id("users"),
		messageId: v.id("messages"),
		emoji: v.string(),
	},
	handler: async (ctx, args) => {
		const { member } = await requireOrgMemberByIds(ctx, args.orgId, args.userId);
		const { userId: _u, ...rest } = args;
		return toggleReactionImpl(ctx, {
			...rest,
			userId: args.userId,
			memberPermissions: member.permissions,
		});
	},
});

// ─── Helpers (file-local) ────────────────────────────────────────────────────

async function resolveEntityAssignee(
	ctx: MutationCtx,
	args: { orgId: Id<"orgs">; entityType: string; entityId: string },
): Promise<Id<"users"> | undefined> {
	if (args.entityType === "user") return undefined;
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
	return undefined;
}

// Suppress getMyMembership lint (re-exported for tests).
export const __internal = { getMyMembership };

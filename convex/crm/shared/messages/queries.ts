/**
 * Messages Queries — convex/crm/shared/messages/queries.ts
 *
 * Chat-style messages between users and AI on-behalf. Per FRONTEND-DECISIONS Rule 2,
 * messages live in their own dedicated `messages` table — distinct from `notes`.
 *
 * Three read patterns:
 *   - listForEntity:  All messages on a specific entity thread (deal/company/person).
 *   - listForPerson:  All messages tied to a personCode across entities.
 *   - listInbox:      One row per active conversation, newest first — feeds the inbox view.
 *
 * RBAC: gated by `messages.view`. No internal/public split (use a separate notes thread for
 * private agent annotations).
 *
 * STATUS: IMPLEMENTED (Phase 2 backend).
 */
import { v } from "convex/values";
import { orgQuery, requireOrgMember } from "../../../_functions/authenticated";
import { requireRole } from "../../../_shared/permissions";

/**
 * All messages for one entity thread, ordered newest-first.
 *
 * Use this for the panel embedded in Profile/Deal/Company tabs and for the
 * Selected Thread pane of the org-wide inbox.
 */
export const listForEntity = orgQuery({
	args: {
		orgId: v.id("orgs"),
		entityType: v.string(),
		entityId: v.string(),
		limit: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
		const { member } = await requireOrgMember(ctx, args.orgId);
		requireRole(member.permissions, "messages.view");

		const cap = args.limit ?? 100;

		return await ctx.db
			.query("messages")
			.withIndex("by_entity", (q) =>
				q
					.eq("orgId", args.orgId)
					.eq("entityType", args.entityType)
					.eq("entityId", args.entityId),
			)
			.order("desc")
			.take(cap);
	},
});

/**
 * All messages tied to a personCode across entity types.
 *
 * Use this when viewing a person's complete message history — including messages
 * sent against deals/companies they're linked to (denormalized via `personCode`).
 */
export const listForPerson = orgQuery({
	args: {
		orgId: v.id("orgs"),
		personCode: v.string(),
		limit: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
		const { member } = await requireOrgMember(ctx, args.orgId);
		requireRole(member.permissions, "messages.view");

		const cap = args.limit ?? 100;

		return await ctx.db
			.query("messages")
			.withIndex("by_org_and_personCode", (q) =>
				q.eq("orgId", args.orgId).eq("personCode", args.personCode),
			)
			.order("desc")
			.take(cap);
	},
});

/**
 * Inbox view — one row per conversation (entity thread), newest first.
 *
 * Implementation: scan recent messages by `by_org_and_created`, dedupe by
 * (entityType, entityId), and return the newest message per conversation.
 *
 * NOTE: O(scan) — fine for medium volumes. For high-traffic orgs we'll add a
 * `conversations` summary table later. Keep `scanLimit` modest (default 500).
 */
export const listInbox = orgQuery({
	args: {
		orgId: v.id("orgs"),
		filter: v.optional(
			v.union(v.literal("all"), v.literal("unread"), v.literal("ai"), v.literal("mine")),
		),
		scanLimit: v.optional(v.number()),
		limit: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
		const { member, userId } = await requireOrgMember(ctx, args.orgId);
		requireRole(member.permissions, "messages.view");

		const filter = args.filter ?? "all";
		const scanLimit = args.scanLimit ?? 500;
		const cap = args.limit ?? 50;

		const recent = await ctx.db
			.query("messages")
			.withIndex("by_org_and_created", (q) => q.eq("orgId", args.orgId))
			.order("desc")
			.take(scanLimit);

		// Dedupe by (entityType, entityId) — keep first (newest) seen per key.
		const seen = new Map<string, (typeof recent)[number]>();
		for (const m of recent) {
			const key = `${m.entityType}:${m.entityId}`;
			if (!seen.has(key)) seen.set(key, m);
		}

		const conversations = [...seen.values()];

		const filtered = conversations.filter((m) => {
			if (filter === "unread") return m.status !== "read";
			if (filter === "ai") return m.authorType === "ai";
			if (filter === "mine") return m.authorId === userId;
			return true;
		});

		return filtered.slice(0, cap);
	},
});

/**
 * Recent messages across the org — feeds the dashboard "MessagesPreviewWidget".
 *
 * No conversation dedup; just the newest N messages chronologically. Cheaper than
 * `listInbox`.
 */
export const listRecent = orgQuery({
	args: {
		orgId: v.id("orgs"),
		limit: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
		const { member } = await requireOrgMember(ctx, args.orgId);
		requireRole(member.permissions, "messages.view");

		return await ctx.db
			.query("messages")
			.withIndex("by_org_and_created", (q) => q.eq("orgId", args.orgId))
			.order("desc")
			.take(args.limit ?? 5);
	},
});

/**
 * Get one message by id (for reply previews, message-detail dialogs).
 */
export const getById = orgQuery({
	args: { orgId: v.id("orgs"), messageId: v.id("messages") },
	handler: async (ctx, args) => {
		const { member } = await requireOrgMember(ctx, args.orgId);
		requireRole(member.permissions, "messages.view");

		const message = await ctx.db.get(args.messageId);
		if (!message || message.orgId !== args.orgId) return null;
		return message;
	},
});

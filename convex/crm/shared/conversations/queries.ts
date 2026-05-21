/**
 * Conversation queries — convex/crm/shared/conversations/queries.ts
 *
 * Read APIs for the chat UI:
 *   - listForUser:       per-user inbox feed (cross-conversation)
 *   - getById:           one conversation + my membership state
 *   - listParticipants:  all active members + their state (avatar row)
 *   - getUnreadCount:    badge count for sidebar
 *   - getForEntity:      look up by (entityType, entityId, threadId?)
 */

import { v } from "convex/values";
import { orgQuery, requireOrgMember } from "../../../_functions/authenticated";
import type { Doc, Id } from "../../../_generated/dataModel";
import { entityTypeForChatValidator, getOtherUserFromPairKey } from "../../../_shared/entityCodes";
import { hasPermission, requireRole } from "../../../_shared/permissions";
import { findConversation, getMyMembership, listActiveMembers } from "./internal";

// ─── Inbox: list every conversation the caller is in ────────────────────────

export const listForUser = orgQuery({
	args: {
		orgId: v.id("orgs"),
		filter: v.optional(v.union(v.literal("all"), v.literal("unread"), v.literal("archived"))),
		limit: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
		const { userId, member } = await requireOrgMember(ctx, args.orgId);
		requireRole(member.permissions, "messages.view");

		const filter = args.filter ?? "all";
		const cap = args.limit ?? 25;

		const memberships = await ctx.db
			.query("conversationMembers")
			.withIndex("by_org_and_user", (q) => q.eq("orgId", args.orgId).eq("userId", userId))
			.take(cap * 2); // over-fetch slightly to allow for left/archived filtering

		const active = memberships.filter((m) => m.leftAt === undefined);

		type EnrichedRow = {
			membership: Doc<"conversationMembers">;
			conversation: Doc<"conversations">;
			unread: boolean;
		};

		const enriched: EnrichedRow[] = [];
		for (const m of active) {
			const convo = await ctx.db.get(m.conversationId);
			if (!convo) continue;
			const unread = Boolean(
				convo.lastMessageAt && (m.lastReadAt ?? 0) < convo.lastMessageAt,
			);
			enriched.push({ membership: m, conversation: convo, unread });
		}

		const filtered = enriched.filter((r) => {
			if (filter === "unread") return r.unread && !r.conversation.isArchived;
			if (filter === "archived") return r.conversation.isArchived;
			return !r.conversation.isArchived; // "all" excludes archived by default
		});

		// Newest activity first.
		filtered.sort(
			(a, b) =>
				(b.conversation.lastMessageAt ?? b.conversation.createdAt) -
				(a.conversation.lastMessageAt ?? a.conversation.createdAt),
		);

		return filtered.slice(0, cap);
	},
});

// ─── Single conversation lookup ─────────────────────────────────────────────

export const getById = orgQuery({
	args: { orgId: v.id("orgs"), conversationId: v.id("conversations") },
	handler: async (ctx, args) => {
		const { userId, member } = await requireOrgMember(ctx, args.orgId);
		requireRole(member.permissions, "messages.view");

		const conversation = await ctx.db.get(args.conversationId);
		if (!conversation || conversation.orgId !== args.orgId) return null;

		const myMembership = await getMyMembership(ctx, {
			conversationId: args.conversationId,
			userId,
		});

		// If not a member and don't have viewAll permission → null (hide existence).
		const canModerate = hasPermission(member.permissions, "messages.viewAll");
		if (!myMembership && !canModerate) return null;

		return { conversation, myMembership };
	},
});

export const getForEntity = orgQuery({
	args: {
		orgId: v.id("orgs"),
		entityType: entityTypeForChatValidator,
		entityId: v.string(),
		threadId: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const { member } = await requireOrgMember(ctx, args.orgId);
		requireRole(member.permissions, "messages.view");

		return await findConversation(ctx, args);
	},
});

export const listParticipants = orgQuery({
	args: { orgId: v.id("orgs"), conversationId: v.id("conversations") },
	handler: async (ctx, args) => {
		const { userId, member } = await requireOrgMember(ctx, args.orgId);
		requireRole(member.permissions, "messages.view");

		const conversation = await ctx.db.get(args.conversationId);
		if (!conversation || conversation.orgId !== args.orgId) return [];

		const myMembership = await getMyMembership(ctx, {
			conversationId: args.conversationId,
			userId,
		});
		const canModerate = hasPermission(member.permissions, "messages.viewAll");
		if (!myMembership && !canModerate) return [];

		const members = await listActiveMembers(ctx, args.conversationId);
		// Join in user profile fields for the avatar row.
		const result = [];
		for (const m of members) {
			const user = await ctx.db.get(m.userId);
			if (!user || user.deletedAt !== undefined) continue;
			let avatarUrl = user.avatarUrl;
			if (!avatarUrl && user.avatarStorageId) {
				avatarUrl = (await ctx.storage.getUrl(user.avatarStorageId)) ?? undefined;
			}
			result.push({ membership: m, user: { ...user, avatarUrl } });
		}
		return result;
	},
});

export const getUnreadCount = orgQuery({
	args: { orgId: v.id("orgs"), conversationId: v.id("conversations") },
	handler: async (ctx, args) => {
		const { userId, member } = await requireOrgMember(ctx, args.orgId);
		requireRole(member.permissions, "messages.view");

		const conversation = await ctx.db.get(args.conversationId);
		if (!conversation || conversation.orgId !== args.orgId) return 0;

		const myMembership = await getMyMembership(ctx, {
			conversationId: args.conversationId,
			userId,
		});
		if (!myMembership) return 0;

		const lastReadAt = myMembership.lastReadAt ?? 0;
		// Count messages newer than lastReadAt (capped — UI only renders a badge,
		// "99+" is fine if the bucket overflows).
		const newer = await ctx.db
			.query("messages")
			.withIndex("by_conversation_and_created", (q) =>
				q.eq("conversationId", args.conversationId).gt("createdAt", lastReadAt),
			)
			.take(100);
		return newer.length;
	},
});

/**
 * Aggregate badge for the sidebar: total unread across every conversation
 * the caller is a member of. Capped at 99 (display-only).
 */
export const getMyTotalUnread = orgQuery({
	args: { orgId: v.id("orgs") },
	handler: async (ctx, args) => {
		const { userId, member } = await requireOrgMember(ctx, args.orgId);
		requireRole(member.permissions, "messages.view");

		const memberships = await ctx.db
			.query("conversationMembers")
			.withIndex("by_org_and_user", (q) => q.eq("orgId", args.orgId).eq("userId", userId))
			.take(50);

		const active = memberships.filter((m) => m.leftAt === undefined);

		let total = 0;
		for (const m of active) {
			const convo = await ctx.db.get(m.conversationId);
			if (!convo || convo.isArchived) continue;
			if ((convo.lastMessageAt ?? 0) > (m.lastReadAt ?? 0)) total += 1;
			if (total >= 99) return 99;
		}
		return total;
	},
});

// ─── Batched entity display resolver (eliminates N+1 in sidebar/forward) ────

/**
 * Resolve display info for a batch of (entityType, entityId) tuples.
 * Returns `Record<"entityType:entityId", DisplayInfo>`.
 *
 * Used by `MessagesSidebar` and `ForwardDialog` so each row doesn't open
 * its own `getByPersonCode` / `getByDealCode` / `getByCompanyCode`
 * subscription. One subscription covers the entire visible list.
 *
 * Capped at 200 tuples (practical max = inbox size).
 */
export const listEntityDisplays = orgQuery({
	args: {
		orgId: v.id("orgs"),
		items: v.array(
			v.object({
				entityType: v.string(),
				entityId: v.string(),
			}),
		),
	},
	handler: async (ctx, args) => {
		const { member, userId } = await requireOrgMember(ctx, args.orgId);
		requireRole(member.permissions, "messages.view");

		const uniq = new Map<string, { entityType: string; entityId: string }>();
		for (const item of args.items) {
			const key = `${item.entityType}:${item.entityId}`;
			if (!uniq.has(key)) uniq.set(key, item);
		}
		const tuples = Array.from(uniq.values()).slice(0, 200);

		const result: Record<
			string,
			{
				name: string;
				secondary?: string;
				kindLabel: string;
				avatarUrl?: string;
			}
		> = {};

		for (const t of tuples) {
			const key = `${t.entityType}:${t.entityId}`;
			const isPerson =
				t.entityType === "lead" || t.entityType === "contact" || t.entityType === "person";

			if (t.entityType === "user") {
				// DM pair key — resolve the "other" user's name for display.
				const otherUserId = getOtherUserFromPairKey(t.entityId, String(userId));
				if (otherUserId) {
					const otherUser = await ctx.db.get(otherUserId as Id<"users">);
					if (otherUser) {
						const u = otherUser as Doc<"users">;
						let avatarUrl: string | undefined = u.avatarUrl;
						if (!avatarUrl && u.avatarStorageId) {
							avatarUrl = (await ctx.storage.getUrl(u.avatarStorageId)) ?? undefined;
						}
						result[key] = {
							name: u.name ?? u.email ?? "Member",
							secondary: u.email ?? undefined,
							kindLabel: "DM",
							avatarUrl,
						};
					}
				}
				continue;
			}

			if (isPerson) {
				const contact = await ctx.db
					.query("contacts")
					.withIndex("by_org_and_personCode", (q) =>
						q.eq("orgId", args.orgId).eq("personCode", t.entityId),
					)
					.first();
				if (contact && !contact.deletedAt) {
					result[key] = {
						name: contact.displayName,
						secondary: contact.email ?? contact.phone ?? undefined,
						kindLabel: "Contact",
					};
					continue;
				}
				const lead = await ctx.db
					.query("leads")
					.withIndex("by_org_and_personCode", (q) =>
						q.eq("orgId", args.orgId).eq("personCode", t.entityId),
					)
					.first();
				if (lead && !lead.deletedAt) {
					result[key] = {
						name: lead.displayName,
						secondary: lead.email ?? lead.phone ?? undefined,
						kindLabel: "Lead",
					};
				}
				continue;
			}

			if (t.entityType === "deal") {
				const deal = await ctx.db
					.query("deals")
					.withIndex("by_org_and_dealCode", (q) =>
						q.eq("orgId", args.orgId).eq("dealCode", t.entityId),
					)
					.first();
				if (deal && !deal.deletedAt) {
					result[key] = {
						name: deal.title ?? t.entityId,
						secondary: deal.dealCode,
						kindLabel: "Deal",
					};
				}
				continue;
			}

			if (t.entityType === "company") {
				const company = await ctx.db
					.query("companies")
					.withIndex("by_org_and_companyCode", (q) =>
						q.eq("orgId", args.orgId).eq("companyCode", t.entityId),
					)
					.first();
				if (company && !company.deletedAt) {
					result[key] = {
						name: company.name,
						secondary: company.companyCode,
						kindLabel: "Company",
					};
				}
			}
		}

		return result;
	},
});

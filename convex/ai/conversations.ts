/**
 * convex/ai/conversations.ts
 *
 * Thread management — CRUD + history for AI conversations.
 * Every conversation is scoped to (orgId, userId) — no cross-user visibility.
 */
import { ConvexError, v } from "convex/values";
import { orgMutation, orgQuery, requireOrgMember } from "../_functions/authenticated";
import { internalMutation, internalQuery } from "../_generated/server";
import { ERRORS } from "../_shared/errors";
import { requireRole } from "../_shared/permissions/helpers";
import { enforceRateLimit } from "../_shared/rateLimit";

// ─── Queries ──────────────────────────────────────────────────────────────────

/** List threads for the calling user, sorted by most recent activity. */
export const list = orgQuery({
	args: {
		orgId: v.id("orgs"),
		limit: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
		const { userId } = await requireOrgMember(ctx, args.orgId);
		const limit = Math.min(args.limit ?? 50, 100);
		return await ctx.db
			.query("aiConversations")
			.withIndex("by_org_and_user_and_lastMessage", (q) =>
				q.eq("orgId", args.orgId).eq("userId", userId),
			)
			.order("desc")
			.filter((q) => q.neq(q.field("status"), "deleted"))
			.take(limit);
	},
});

/** Get a single conversation. Must belong to the calling user. */
export const get = orgQuery({
	args: { orgId: v.id("orgs"), conversationId: v.id("aiConversations") },
	handler: async (ctx, args) => {
		const { userId } = await requireOrgMember(ctx, args.orgId);
		const conv = await ctx.db.get(args.conversationId);
		if (
			!conv ||
			conv.orgId !== args.orgId ||
			conv.userId !== userId ||
			conv.status === "deleted"
		) {
			return null;
		}
		return conv;
	},
});

/**
 * Internal-only conversation getter for the processChat orchestrator.
 * Skips the user-identity check (the caller is an internalAction running
 * with a service identity) but defends in depth by asserting orgId match.
 */
export const getInternal = internalQuery({
	args: { orgId: v.id("orgs"), conversationId: v.id("aiConversations") },
	handler: async (ctx, args) => {
		const conv = await ctx.db.get(args.conversationId);
		if (!conv || conv.orgId !== args.orgId) return null;
		return conv;
	},
});

// ─── Mutations ────────────────────────────────────────────────────────────────

/** Create a new conversation thread. */
export const create = orgMutation({
	args: {
		orgId: v.id("orgs"),
		title: v.optional(v.string()),
		defaultModel: v.optional(v.string()),
		defaultProvider: v.optional(v.string()),
		routeContextPath: v.optional(v.string()),
		routeEntityType: v.optional(v.string()),
		routeEntityId: v.optional(v.string()),
		pinnedEntityCode: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const { member, userId } = await requireOrgMember(ctx, args.orgId);
		requireRole(member.permissions, "ai.use");
		await enforceRateLimit(ctx, {
			scope: "ai.conversation.create",
			key: `${userId}:${args.orgId}`,
			max: 30,
			periodMs: 60_000,
		});

		const now = Date.now();
		return await ctx.db.insert("aiConversations", {
			orgId: args.orgId,
			userId,
			title: args.title,
			status: "active",
			defaultModel: args.defaultModel,
			defaultProvider: args.defaultProvider,
			lastMessageAt: now,
			routeContextPath: args.routeContextPath,
			routeEntityType: args.routeEntityType,
			routeEntityId: args.routeEntityId,
			pinnedEntityCode: args.pinnedEntityCode,
			createdAt: now,
			updatedAt: now,
		});
	},
});

/** Rename a conversation. */
export const rename = orgMutation({
	args: {
		orgId: v.id("orgs"),
		conversationId: v.id("aiConversations"),
		title: v.string(),
	},
	handler: async (ctx, args) => {
		const { userId } = await requireOrgMember(ctx, args.orgId);
		const conv = await ctx.db.get(args.conversationId);
		if (!conv || conv.orgId !== args.orgId || conv.userId !== userId) {
			throw new ConvexError(ERRORS.NOT_FOUND);
		}
		await ctx.db.patch(args.conversationId, {
			title: args.title.trim().slice(0, 100),
			updatedAt: Date.now(),
		});
	},
});

/** Archive (hide) a conversation. */
export const archive = orgMutation({
	args: { orgId: v.id("orgs"), conversationId: v.id("aiConversations") },
	handler: async (ctx, args) => {
		const { userId } = await requireOrgMember(ctx, args.orgId);
		const conv = await ctx.db.get(args.conversationId);
		if (!conv || conv.orgId !== args.orgId || conv.userId !== userId) {
			throw new ConvexError(ERRORS.NOT_FOUND);
		}
		await ctx.db.patch(args.conversationId, { status: "archived", updatedAt: Date.now() });
	},
});

/** Soft-delete a conversation (sets status: "deleted", keeps data). */
export const softDelete = orgMutation({
	args: { orgId: v.id("orgs"), conversationId: v.id("aiConversations") },
	handler: async (ctx, args) => {
		const { userId } = await requireOrgMember(ctx, args.orgId);
		const conv = await ctx.db.get(args.conversationId);
		if (!conv || conv.orgId !== args.orgId || conv.userId !== userId) {
			throw new ConvexError(ERRORS.NOT_FOUND);
		}
		await ctx.db.patch(args.conversationId, { status: "deleted", updatedAt: Date.now() });
	},
});

/** Set sticky model for a thread. */
export const setDefaultModel = orgMutation({
	args: {
		orgId: v.id("orgs"),
		conversationId: v.id("aiConversations"),
		model: v.string(),
		provider: v.string(),
	},
	handler: async (ctx, args) => {
		const { userId } = await requireOrgMember(ctx, args.orgId);
		const conv = await ctx.db.get(args.conversationId);
		if (!conv || conv.orgId !== args.orgId || conv.userId !== userId) {
			throw new ConvexError(ERRORS.NOT_FOUND);
		}
		await ctx.db.patch(args.conversationId, {
			defaultModel: args.model,
			defaultProvider: args.provider,
			updatedAt: Date.now(),
		});
	},
});

/**
 * Internal-only title patch used by the auto-title action
 * (`convex/ai/titleGeneration.ts:autoTitle`). Only updates if the title is
 * currently empty / "Untitled conversation" — never clobbers a user-set rename.
 */
export const setAutoTitleInternal = internalMutation({
	args: {
		orgId: v.id("orgs"),
		conversationId: v.id("aiConversations"),
		title: v.string(),
	},
	handler: async (ctx, args) => {
		const conv = await ctx.db.get(args.conversationId);
		if (!conv || conv.orgId !== args.orgId) return { ok: false as const };
		// Don't clobber a user-set title.
		const current = (conv.title ?? "").trim();
		if (current && current !== "Untitled conversation") {
			return { ok: false as const, reason: "already_titled" as const };
		}
		const next = args.title.trim().slice(0, 80);
		if (!next) return { ok: false as const };
		await ctx.db.patch(args.conversationId, { title: next, updatedAt: Date.now() });
		return { ok: true as const };
	},
});

// ─── Week 3.2 — contextBag (Salesforce L4 variables) ─────────────────────────
//
// `set_context_var` (synthetic AI tool) calls this internal mutation to
// patch the per-conversation contextBag. The bag is enforced to ~4KB
// total — the system-prompt builder injects it on EVERY turn, so unbounded
// growth is real money. When the cap is hit, oldest keys evicted FIFO.

const CONTEXT_BAG_BYTE_BUDGET = 4_000;

/** Conservative byte estimator that doesn't import Buffer (Node) or TextEncoder. */
function estimateBytes(value: unknown): number {
	try {
		return JSON.stringify(value).length;
	} catch {
		return 0;
	}
}

export const patchContextBag = internalMutation({
	args: {
		orgId: v.id("orgs"),
		conversationId: v.id("aiConversations"),
		key: v.string(),
		value: v.optional(v.any()),
		delete: v.optional(v.boolean()),
	},
	handler: async (ctx, args) => {
		const conv = await ctx.db.get(args.conversationId);
		if (!conv || conv.orgId !== args.orgId) {
			throw new ConvexError(ERRORS.NOT_FOUND);
		}

		// Mutable copy. We deliberately sort the entries so eviction is FIFO
		// when budget is exceeded (last-touched-stays — `bag[key] = value`
		// re-inserts the key at the end of the natural insertion order).
		const bag: Record<string, unknown> = { ...(conv.contextBag ?? {}) };

		if (args.delete === true) {
			if (!(args.key in bag)) {
				return { ok: true as const, key: args.key, deleted: false };
			}
			delete bag[args.key];
			await ctx.db.patch(args.conversationId, {
				contextBag: bag,
				updatedAt: Date.now(),
			});
			return { ok: true as const, key: args.key, deleted: true };
		}

		// Re-insert at the end so frequently-updated keys stay newest.
		delete bag[args.key];
		bag[args.key] = args.value;

		// Enforce budget. Pop from the start of insertion order until under.
		while (estimateBytes(bag) > CONTEXT_BAG_BYTE_BUDGET) {
			const keys = Object.keys(bag);
			if (keys.length <= 1) break; // never evict the value we just set
			const oldest = keys[0];
			if (oldest === args.key) {
				// Edge case: only the new key remains and it's STILL too big.
				// Bail rather than infinite-loop.
				break;
			}
			delete bag[oldest];
		}

		await ctx.db.patch(args.conversationId, {
			contextBag: bag,
			updatedAt: Date.now(),
		});
		return { ok: true as const, key: args.key, deleted: false };
	},
});

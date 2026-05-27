/**
 * convex/_platform/aiKeys/mutations.ts
 *
 * Owner-panel mutations for platform-managed AI provider keys.
 *
 * Public surface (owner-only):
 *   - remove — soft-deactivates an existing platform key.
 *
 * Internal surface:
 *   - insertEncrypted — actual write path, called by the Node action
 *     in `./actions.ts` AFTER the plaintext key is encrypted via
 *     `encryptApiKey`. Audit-logged via `platformAuditLogs`.
 *
 * Adding a new provider's key supersedes any existing active row for
 * the same provider — at most one active row per provider, enforced
 * by deactivating the old row inside `insertEncrypted`.
 *
 * Spec: PLATFORM-OWNER-PANEL.md §5 (added 2026-05-27).
 */
import { ConvexError, v } from "convex/values";
import type { Id } from "../../_generated/dataModel";
import { internalMutation, mutation } from "../../_generated/server";
import { ERRORS } from "../../_shared/errors";
import { logPlatformAction } from "../audit/helpers";
import { requirePlatformOwner } from "../ownerAuth";

const PROVIDER_LITERALS = [
	"anthropic",
	"openai",
	"google",
	"xai",
	"groq",
	"mistral",
	"openrouter",
	"nvidia",
	"moonshot",
	"custom",
] as const;
type Provider = (typeof PROVIDER_LITERALS)[number];

// ─── Internal mutation: actual write path ────────────────────────────────

/**
 * Persist an encrypted platform key. Called only by the Node action in
 * `./actions.ts` after `encryptApiKey` produces the ciphertext.
 *
 * If an active row already exists for the same provider, it is
 * deactivated (soft-delete) so at most one active key exists per
 * provider. The rotation is audit-logged.
 */
export const insertEncrypted = internalMutation({
	args: {
		provider: v.union(
			v.literal("anthropic"),
			v.literal("openai"),
			v.literal("google"),
			v.literal("xai"),
			v.literal("groq"),
			v.literal("mistral"),
			v.literal("openrouter"),
			v.literal("nvidia"),
			v.literal("moonshot"),
			v.literal("custom"),
		),
		encryptedKey: v.string(),
		keyHint: v.string(),
		baseUrl: v.optional(v.string()),
		name: v.optional(v.string()),
		actorUserId: v.id("users"),
		actorEmail: v.string(),
		ip: v.optional(v.string()),
		userAgent: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const now = Date.now();

		// Deactivate any existing active row for the same provider.
		const previous = await ctx.db
			.query("platformAiKeys")
			.withIndex("by_provider", (q) => q.eq("provider", args.provider))
			.filter((q) => q.eq(q.field("isActive"), true))
			.collect();
		for (const row of previous) {
			await ctx.db.patch(row._id, { isActive: false, updatedAt: now });
		}

		const newId = await ctx.db.insert("platformAiKeys", {
			provider: args.provider,
			encryptedKey: args.encryptedKey,
			keyHint: args.keyHint,
			baseUrl: args.baseUrl,
			name: args.name,
			isActive: true,
			createdBy: args.actorUserId,
			createdAt: now,
			updatedAt: now,
		});

		await logPlatformAction(ctx, {
			actorUserId: args.actorUserId,
			actorEmail: args.actorEmail,
			action: "owner.platformAiKey.upsert",
			targetType: "platformAiKey",
			targetId: newId as unknown as string,
			before: previous.length > 0 ? { rotatedFromIds: previous.map((p) => p._id) } : null,
			after: { provider: args.provider, keyHint: args.keyHint, name: args.name ?? null },
			ip: args.ip,
			userAgent: args.userAgent,
		});

		return { id: newId, replaced: previous.length };
	},
});

// ─── Public mutation: soft-deactivate an existing key ────────────────────

export const remove = mutation({
	args: {
		keyId: v.id("platformAiKeys"),
	},
	handler: async (ctx, args) => {
		const { user, userId } = await requirePlatformOwner(ctx);
		const row = await ctx.db.get(args.keyId);
		if (!row) throw new ConvexError(ERRORS.NOT_FOUND);
		if (!row.isActive) {
			// Already deactivated — idempotent return.
			return { ok: true as const };
		}
		const now = Date.now();
		await ctx.db.patch(args.keyId, { isActive: false, updatedAt: now });
		await logPlatformAction(ctx, {
			actorUserId: userId as Id<"users">,
			actorEmail: (user.email ?? "").toLowerCase(),
			action: "owner.platformAiKey.remove",
			targetType: "platformAiKey",
			targetId: args.keyId as unknown as string,
			before: { provider: row.provider, keyHint: row.keyHint, name: row.name ?? null },
			after: null,
		});
		return { ok: true as const };
	},
});

// Export the type for action handlers that need it.
export type PlatformAiProvider = Provider;

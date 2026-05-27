/**
 * Owner-panel feature-flag mutations — convex/_platform/flags/mutations.ts
 *
 * Toggle global default + add/remove per-org overrides on the existing
 * `featureFlags` table. Auto-creates the flag row on first toggle (so the
 * owner doesn't need a separate "create flag" step).
 *
 * Mutation pattern (PLATFORM-OWNER-PANEL.md §8):
 *   1. requirePlatformOwner(ctx)
 *   2. enforceRateLimit("owner.write")
 *   3. read-modify-write with `before` snapshot
 *   4. logPlatformAction
 *
 * Spec: PLATFORM-OWNER-PANEL.md §10 stage 6.
 */
import { v } from "convex/values";
import { mutation } from "../../_generated/server";
import { enforceRateLimit, RATE_LIMITS } from "../../_shared/rateLimit";
import { logPlatformAction } from "../audit/helpers";
import { requirePlatformOwner } from "../ownerAuth";

/**
 * Toggle the global enabled flag for a feature key. Creates the row if
 * it doesn't exist (initial state set from `enabled`).
 */
export const setFlagEnabled = mutation({
	args: {
		key: v.string(),
		enabled: v.boolean(),
		description: v.optional(v.string()),
		reason: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const { user, userId } = await requirePlatformOwner(ctx);
		await enforceRateLimit(ctx, {
			scope: "owner.write",
			key: `${userId}`,
			...RATE_LIMITS.write,
		});

		const existing = await ctx.db
			.query("featureFlags")
			.withIndex("by_key", (q) => q.eq("key", args.key))
			.unique();

		const now = Date.now();
		let before: Record<string, unknown> | null;
		let after: Record<string, unknown>;

		if (!existing) {
			const id = await ctx.db.insert("featureFlags", {
				key: args.key,
				enabled: args.enabled,
				orgOverrides: {},
				description: args.description,
				createdAt: now,
				updatedAt: now,
			});
			before = null;
			after = { _id: id, key: args.key, enabled: args.enabled };
		} else {
			before = { ...existing };
			await ctx.db.patch(existing._id, {
				enabled: args.enabled,
				description: args.description ?? existing.description,
				updatedAt: now,
			});
			after = { _id: existing._id, key: existing.key, enabled: args.enabled };
		}

		await logPlatformAction(ctx, {
			actorUserId: userId,
			actorEmail: user.email,
			action: "owner.flag.toggle",
			targetType: "flag",
			targetId: args.key,
			before,
			after,
			reason: args.reason,
		});

		return { ok: true };
	},
});

/**
 * Set a per-org override on a flag. Pass `enabled: null` to remove the
 * override entirely (so the org falls back to the global default).
 */
export const setOrgOverride = mutation({
	args: {
		key: v.string(),
		orgId: v.id("orgs"),
		enabled: v.union(v.boolean(), v.null()),
		reason: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const { user, userId } = await requirePlatformOwner(ctx);
		await enforceRateLimit(ctx, {
			scope: "owner.write",
			key: `${userId}`,
			...RATE_LIMITS.write,
		});

		const existing = await ctx.db
			.query("featureFlags")
			.withIndex("by_key", (q) => q.eq("key", args.key))
			.unique();

		const now = Date.now();
		const overrides = { ...(existing?.orgOverrides ?? {}) };
		const orgIdStr = args.orgId as unknown as string;

		const before: Record<string, unknown> = existing
			? { orgOverrides: { ...overrides } }
			: { existed: false };

		if (args.enabled === null) {
			delete overrides[orgIdStr];
		} else {
			overrides[orgIdStr] = args.enabled;
		}

		if (!existing) {
			await ctx.db.insert("featureFlags", {
				key: args.key,
				enabled: false,
				orgOverrides: overrides,
				createdAt: now,
				updatedAt: now,
			});
		} else {
			await ctx.db.patch(existing._id, { orgOverrides: overrides, updatedAt: now });
		}

		await logPlatformAction(ctx, {
			actorUserId: userId,
			actorEmail: user.email,
			action:
				args.enabled === null
					? "owner.flag.org_override.remove"
					: "owner.flag.org_override.set",
			targetType: "flag",
			targetId: `${args.key}:${orgIdStr}`,
			before,
			after: { orgOverrides: overrides },
			reason: args.reason,
		});

		return { ok: true };
	},
});

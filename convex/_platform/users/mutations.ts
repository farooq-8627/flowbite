/**
 * Owner-panel user mutations — convex/_platform/users/mutations.ts
 *
 * Four mutations for the user-management surface, mirroring the org
 * lifecycle in `_platform/orgs/mutations.ts`:
 *
 *   - suspendUser / unsuspendUser  → reversible lockout, no data destroyed
 *   - softDeleteUser / restoreUser → soft-delete (filtered out of every
 *                                    auth path until restored)
 *
 * Each follows the standard 4-step owner-panel pattern (gate, rate limit,
 * snapshot, audit) — see `_platform/MODULE.md §8`.
 *
 * SELF-TARGET REFUSAL — the platform owner cannot suspend or delete
 * themselves through the panel. The mutation throws FORBIDDEN if
 * `args.userId === userId` of the caller. This is a defence against
 * a panicked operator locking themselves out and against an attacker
 * who has compromised the panel attempting to lock out the only
 * remaining super-admin.
 *
 * Action verbs:
 *   `owner.user.suspend | unsuspend | soft_delete | restore`
 */
import { ConvexError, v } from "convex/values";
import { mutation } from "../../_generated/server";
import { ERRORS } from "../../_shared/errors";
import { enforceRateLimit, RATE_LIMITS } from "../../_shared/rateLimit";
import { logPlatformAction } from "../audit/helpers";
import { requirePlatformOwner } from "../ownerAuth";

function refuseSelfTarget(actorUserId: string, targetUserId: string) {
	if (actorUserId === targetUserId) {
		// Generic FORBIDDEN — same shape as any RBAC failure so the panel
		// surfaces the standard "you don't have permission" copy. We don't
		// reveal that the specific reason is "you're targeting yourself"
		// because the platform owner already knows.
		throw new ConvexError(ERRORS.FORBIDDEN);
	}
}

// ─── Suspend / unsuspend (reversible lockout, no data destroyed) ─────────────

export const suspendUser = mutation({
	args: { userId: v.id("users"), reason: v.optional(v.string()) },
	handler: async (ctx, args) => {
		const { user, userId } = await requirePlatformOwner(ctx);
		refuseSelfTarget(userId, args.userId);
		await enforceRateLimit(ctx, {
			scope: "owner.write",
			key: `${userId}`,
			...RATE_LIMITS.write,
		});

		const target = await ctx.db.get(args.userId);
		if (!target) throw new ConvexError(ERRORS.USER_NOT_FOUND);

		const now = Date.now();
		const before = { suspendedAt: target.suspendedAt ?? null };
		await ctx.db.patch(args.userId, {
			suspendedAt: now,
			suspensionReason: args.reason,
			updatedAt: now,
		});
		const after = { suspendedAt: now, suspensionReason: args.reason ?? null };

		await logPlatformAction(ctx, {
			actorUserId: userId,
			actorEmail: user.email,
			action: "owner.user.suspend",
			targetType: "user",
			targetId: args.userId,
			before,
			after,
			reason: args.reason,
		});

		return { ok: true };
	},
});

export const unsuspendUser = mutation({
	args: { userId: v.id("users"), reason: v.optional(v.string()) },
	handler: async (ctx, args) => {
		const { user, userId } = await requirePlatformOwner(ctx);
		await enforceRateLimit(ctx, {
			scope: "owner.write",
			key: `${userId}`,
			...RATE_LIMITS.write,
		});

		const target = await ctx.db.get(args.userId);
		if (!target) throw new ConvexError(ERRORS.USER_NOT_FOUND);

		const before = {
			suspendedAt: target.suspendedAt ?? null,
			suspensionReason: target.suspensionReason ?? null,
		};
		await ctx.db.patch(args.userId, {
			suspendedAt: undefined,
			suspensionReason: undefined,
			updatedAt: Date.now(),
		});
		const after = { suspendedAt: null, suspensionReason: null };

		await logPlatformAction(ctx, {
			actorUserId: userId,
			actorEmail: user.email,
			action: "owner.user.unsuspend",
			targetType: "user",
			targetId: args.userId,
			before,
			after,
			reason: args.reason,
		});

		return { ok: true };
	},
});

// ─── Soft delete / restore ───────────────────────────────────────────────────

export const softDeleteUser = mutation({
	args: { userId: v.id("users"), reason: v.optional(v.string()) },
	handler: async (ctx, args) => {
		const { user, userId } = await requirePlatformOwner(ctx);
		refuseSelfTarget(userId, args.userId);
		await enforceRateLimit(ctx, {
			scope: "owner.write",
			key: `${userId}`,
			...RATE_LIMITS.write,
		});

		const target = await ctx.db.get(args.userId);
		if (!target) throw new ConvexError(ERRORS.USER_NOT_FOUND);

		const now = Date.now();
		const before = { deletedAt: target.deletedAt ?? null };
		await ctx.db.patch(args.userId, {
			deletedAt: now,
			updatedAt: now,
		});
		const after = { deletedAt: now };

		await logPlatformAction(ctx, {
			actorUserId: userId,
			actorEmail: user.email,
			action: "owner.user.soft_delete",
			targetType: "user",
			targetId: args.userId,
			before,
			after,
			reason: args.reason,
		});

		return { ok: true };
	},
});

export const restoreUser = mutation({
	args: { userId: v.id("users"), reason: v.optional(v.string()) },
	handler: async (ctx, args) => {
		const { user, userId } = await requirePlatformOwner(ctx);
		await enforceRateLimit(ctx, {
			scope: "owner.write",
			key: `${userId}`,
			...RATE_LIMITS.write,
		});

		const target = await ctx.db.get(args.userId);
		if (!target) throw new ConvexError(ERRORS.USER_NOT_FOUND);

		const before = { deletedAt: target.deletedAt ?? null };
		await ctx.db.patch(args.userId, {
			deletedAt: undefined,
			updatedAt: Date.now(),
		});
		const after = { deletedAt: null };

		await logPlatformAction(ctx, {
			actorUserId: userId,
			actorEmail: user.email,
			action: "owner.user.restore",
			targetType: "user",
			targetId: args.userId,
			before,
			after,
			reason: args.reason,
		});

		return { ok: true };
	},
});

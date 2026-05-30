/**
 * Owner-panel organisation mutations — convex/_platform/orgs/mutations.ts
 *
 * Five mutations for the orgs surface, each following the 4-step pattern
 * in PLATFORM-OWNER-PANEL.md §8:
 *
 *   1. requirePlatformOwner(ctx)         — defence-in-depth gate
 *   2. enforceRateLimit(ctx, ...)        — shared "owner.write" scope
 *   3. read-modify-write with snapshot   — capture `before` JSON
 *   4. logPlatformAction(ctx, ...)       — append-only audit row
 *
 * Pause vs delete semantics
 * ─────────────────────────
 * - **suspendOrg / unsuspendOrg** — sets/clears `orgs.suspendedAt`.
 *   `requireOrgMember` then throws `ORG_SUSPENDED` for every member.
 *   Reversible — no data destroyed. Use for billing problems, abuse
 *   investigations, or a customer's "pause my workspace" request.
 *
 * - **softDeleteOrg / restoreOrg** — sets/clears `orgs.deletedAt`.
 *   The org is filtered out of `listMyOrgs`, treated as 404 by the
 *   layout-level membership check, and excluded from every per-org
 *   query that filters on `deletedAt !== undefined`. Still reversible
 *   from this panel because it's a soft-delete (the underlying row
 *   stays until the daily purge cron runs after the retention window).
 *
 * - **changeOrgTier** — patches `orgs.plan`. Pure metadata write; no
 *   data touched. The org's billing surfaces (PricingCard, plan-tier
 *   gates) re-evaluate on the next subscription update.
 *
 * Action verbs follow the convention in `audit/helpers.ts`:
 *   `owner.org.tier_change | suspend | unsuspend | soft_delete | restore`
 */
import { ConvexError, v } from "convex/values";
import { mutation } from "../../_generated/server";
import { ERRORS } from "../../_shared/errors";
import { enforceRateLimit, RATE_LIMITS } from "../../_shared/rateLimit";
import { orgPlanValidator } from "../../_shared/validators";
import { logPlatformAction } from "../audit/helpers";
import { requirePlatformOwner } from "../ownerAuth";

// ─── Tier change ─────────────────────────────────────────────────────────────

/**
 * Patch the plan tier on a single org. Distinct from
 * `_platform/tiers/mutations.ts::changeUserTier` (which targets a
 * (user, org) pair from the user-drawer). This is the canonical
 * org-first mutation — the owner picks an org in the list view and
 * picks a tier without needing to specify a user.
 */
export const changeOrgTier = mutation({
	args: {
		orgId: v.id("orgs"),
		newKey: orgPlanValidator,
		reason: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const { user, userId } = await requirePlatformOwner(ctx);
		await enforceRateLimit(ctx, {
			scope: "owner.write",
			key: `${userId}`,
			...RATE_LIMITS.write,
		});

		const org = await ctx.db.get(args.orgId);
		if (!org) throw new ConvexError(ERRORS.ORG_NOT_FOUND);

		const before = { plan: org.plan, orgId: args.orgId };
		await ctx.db.patch(args.orgId, { plan: args.newKey, updatedAt: Date.now() });
		const after = { plan: args.newKey, orgId: args.orgId };

		await logPlatformAction(ctx, {
			actorUserId: userId,
			actorEmail: user.email,
			action: "owner.org.tier_change",
			targetType: "org",
			targetId: args.orgId,
			before,
			after,
			reason: args.reason,
		});

		return { ok: true, previousPlan: before.plan, newPlan: after.plan };
	},
});

// ─── Suspend / unsuspend (reversible lockout, no data destroyed) ─────────────

export const suspendOrg = mutation({
	args: {
		orgId: v.id("orgs"),
		reason: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const { user, userId } = await requirePlatformOwner(ctx);
		await enforceRateLimit(ctx, {
			scope: "owner.write",
			key: `${userId}`,
			...RATE_LIMITS.write,
		});

		const org = await ctx.db.get(args.orgId);
		if (!org) throw new ConvexError(ERRORS.ORG_NOT_FOUND);

		const now = Date.now();
		const before = { suspendedAt: org.suspendedAt ?? null };
		await ctx.db.patch(args.orgId, {
			suspendedAt: now,
			suspensionReason: args.reason,
			updatedAt: now,
		});
		const after = { suspendedAt: now, suspensionReason: args.reason ?? null };

		await logPlatformAction(ctx, {
			actorUserId: userId,
			actorEmail: user.email,
			action: "owner.org.suspend",
			targetType: "org",
			targetId: args.orgId,
			before,
			after,
			reason: args.reason,
		});

		return { ok: true };
	},
});

export const unsuspendOrg = mutation({
	args: { orgId: v.id("orgs"), reason: v.optional(v.string()) },
	handler: async (ctx, args) => {
		const { user, userId } = await requirePlatformOwner(ctx);
		await enforceRateLimit(ctx, {
			scope: "owner.write",
			key: `${userId}`,
			...RATE_LIMITS.write,
		});

		const org = await ctx.db.get(args.orgId);
		if (!org) throw new ConvexError(ERRORS.ORG_NOT_FOUND);

		const before = {
			suspendedAt: org.suspendedAt ?? null,
			suspensionReason: org.suspensionReason ?? null,
		};
		await ctx.db.patch(args.orgId, {
			suspendedAt: undefined,
			suspensionReason: undefined,
			updatedAt: Date.now(),
		});
		const after = { suspendedAt: null, suspensionReason: null };

		await logPlatformAction(ctx, {
			actorUserId: userId,
			actorEmail: user.email,
			action: "owner.org.unsuspend",
			targetType: "org",
			targetId: args.orgId,
			before,
			after,
			reason: args.reason,
		});

		return { ok: true };
	},
});

// ─── Soft delete / restore ───────────────────────────────────────────────────

export const softDeleteOrg = mutation({
	args: { orgId: v.id("orgs"), reason: v.optional(v.string()) },
	handler: async (ctx, args) => {
		const { user, userId } = await requirePlatformOwner(ctx);
		await enforceRateLimit(ctx, {
			scope: "owner.write",
			key: `${userId}`,
			...RATE_LIMITS.write,
		});

		const org = await ctx.db.get(args.orgId);
		if (!org) throw new ConvexError(ERRORS.ORG_NOT_FOUND);

		const now = Date.now();
		const before = { deletedAt: org.deletedAt ?? null };
		await ctx.db.patch(args.orgId, {
			deletedAt: now,
			updatedAt: now,
		});
		const after = { deletedAt: now };

		await logPlatformAction(ctx, {
			actorUserId: userId,
			actorEmail: user.email,
			action: "owner.org.soft_delete",
			targetType: "org",
			targetId: args.orgId,
			before,
			after,
			reason: args.reason,
		});

		return { ok: true };
	},
});

export const restoreOrg = mutation({
	args: { orgId: v.id("orgs"), reason: v.optional(v.string()) },
	handler: async (ctx, args) => {
		const { user, userId } = await requirePlatformOwner(ctx);
		await enforceRateLimit(ctx, {
			scope: "owner.write",
			key: `${userId}`,
			...RATE_LIMITS.write,
		});

		const org = await ctx.db.get(args.orgId);
		if (!org) throw new ConvexError(ERRORS.ORG_NOT_FOUND);

		const before = { deletedAt: org.deletedAt ?? null };
		await ctx.db.patch(args.orgId, {
			deletedAt: undefined,
			updatedAt: Date.now(),
		});
		const after = { deletedAt: null };

		await logPlatformAction(ctx, {
			actorUserId: userId,
			actorEmail: user.email,
			action: "owner.org.restore",
			targetType: "org",
			targetId: args.orgId,
			before,
			after,
			reason: args.reason,
		});

		return { ok: true };
	},
});

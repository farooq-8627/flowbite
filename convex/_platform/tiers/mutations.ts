/**
 * Owner-panel tier mutations — convex/_platform/tiers/mutations.ts
 *
 * Writes to `platformTiers` (and the org-level `plan` field for
 * `changeUserTier`). Every mutation follows the 4-step pattern in
 * PLATFORM-OWNER-PANEL.md §8:
 *
 *   1. requirePlatformOwner(ctx)         — defence-in-depth gate
 *   2. enforceRateLimit(ctx, ...)        — shared "owner.write" scope
 *   3. read-modify-write with snapshot   — capture `before` JSON
 *   4. logPlatformAction(ctx, ...)       — append-only audit row
 *
 * Spec: PLATFORM-OWNER-PANEL.md §10 stage 4 (updateTier) + stage 5
 *       (changeUserTier).
 */
import { ConvexError, v } from "convex/values";
import { mutation } from "../../_generated/server";
import { ERRORS } from "../../_shared/errors";
import { enforceRateLimit, RATE_LIMITS } from "../../_shared/rateLimit";
import { orgPlanValidator } from "../../_shared/validators";
import { logPlatformAction } from "../audit/helpers";
import { PLAN_LIMITS, type PlanTier } from "../limits";
import { requirePlatformOwner } from "../ownerAuth";

// ─── Tier definition writes ──────────────────────────────────────────────────

const TIER_FALLBACK_DEFAULTS: Record<
	PlanTier,
	{ displayName: string; monthlyPriceUSD: number; yearlyPriceUSD: number; trialDays: number }
> = {
	free: { displayName: "Free", monthlyPriceUSD: 0, yearlyPriceUSD: 0, trialDays: 0 },
	starter: { displayName: "Starter", monthlyPriceUSD: 19, yearlyPriceUSD: 190, trialDays: 14 },
	pro: { displayName: "Pro", monthlyPriceUSD: 49, yearlyPriceUSD: 490, trialDays: 14 },
	enterprise: {
		displayName: "Enterprise",
		monthlyPriceUSD: 199,
		yearlyPriceUSD: 1990,
		trialDays: 30,
	},
};

const limitsValidator = v.object({
	maxPipelinesPerEntityType: v.number(),
	maxDeals: v.number(),
	maxMembers: v.number(),
	maxCustomFieldsPerEntityType: v.number(),
	maxStorageBytes: v.number(),
	aiTokensPerMonth: v.number(),
});

/**
 * Patch a tier definition. Auto-creates the row if it doesn't exist yet
 * (first edit after deployment seeds the row idempotently — operators
 * don't have to remember to run the migration).
 *
 * `patch` carries only the fields that changed; missing keys leave the
 * existing values untouched. Limit values clamp at -1 for unlimited and
 * at 0 for "feature disabled".
 */
export const updateTier = mutation({
	args: {
		key: orgPlanValidator,
		patch: v.object({
			displayName: v.optional(v.string()),
			monthlyPriceUSD: v.optional(v.number()),
			yearlyPriceUSD: v.optional(v.number()),
			trialDays: v.optional(v.number()),
			limits: v.optional(limitsValidator),
			active: v.optional(v.boolean()),
		}),
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
			.query("platformTiers")
			.withIndex("by_key", (q) => q.eq("key", args.key))
			.unique();

		const now = Date.now();
		let before: Record<string, unknown> | null;
		let after: Record<string, unknown>;

		if (!existing) {
			// First edit — seed the row from defaults + patch.
			const defaults = TIER_FALLBACK_DEFAULTS[args.key];
			const seeded = {
				key: args.key,
				displayName: args.patch.displayName ?? defaults.displayName,
				monthlyPriceUSD: args.patch.monthlyPriceUSD ?? defaults.monthlyPriceUSD,
				yearlyPriceUSD: args.patch.yearlyPriceUSD ?? defaults.yearlyPriceUSD,
				trialDays: args.patch.trialDays ?? defaults.trialDays,
				limits: args.patch.limits ?? PLAN_LIMITS[args.key],
				active: args.patch.active ?? true,
				updatedBy: userId,
				createdAt: now,
				updatedAt: now,
			};
			const id = await ctx.db.insert("platformTiers", seeded);
			before = null;
			after = { _id: id, ...seeded };
		} else {
			before = { ...existing };
			const next = {
				displayName: args.patch.displayName ?? existing.displayName,
				monthlyPriceUSD: args.patch.monthlyPriceUSD ?? existing.monthlyPriceUSD,
				yearlyPriceUSD: args.patch.yearlyPriceUSD ?? existing.yearlyPriceUSD,
				trialDays: args.patch.trialDays ?? existing.trialDays,
				limits: args.patch.limits ?? existing.limits,
				active: args.patch.active ?? existing.active,
				updatedBy: userId,
				updatedAt: now,
			};
			await ctx.db.patch(existing._id, next);
			after = { _id: existing._id, key: existing.key, ...next };
		}

		await logPlatformAction(ctx, {
			actorUserId: userId,
			actorEmail: user.email,
			action: "owner.tier.update",
			targetType: "tier",
			targetId: args.key,
			before,
			after,
			reason: args.reason,
		});

		return { ok: true };
	},
});

// ─── User-tier change (Stage 5 — operates on the org's `plan` field) ─────────

/**
 * Change the plan tier on an org owned by the target user.
 *
 * Decision: tier lives on the `orgs` table — there is no per-user tier.
 * The owner picks an org in the UI (the user's drawer lists their orgs)
 * and we patch that org's `plan` value. NEVER deletes data — same
 * doctrine as `superAdminMutation` (`.github/agents/base/rbac.md` —
 * Data Preservation).
 *
 * Spec: PLATFORM-OWNER-PANEL.md §10 stage 5 (changeUserTier).
 */
export const changeUserTier = mutation({
	args: {
		userId: v.id("users"),
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

		const targetUser = await ctx.db.get(args.userId);
		if (!targetUser || targetUser.deletedAt !== undefined) {
			throw new ConvexError(ERRORS.USER_NOT_FOUND);
		}

		const org = await ctx.db.get(args.orgId);
		if (!org || org.deletedAt !== undefined) {
			throw new ConvexError(ERRORS.ORG_NOT_FOUND);
		}

		// Soft check: confirm the target user is actually a member of this
		// org. Owner can still change the tier on any org from the panel
		// (there's no per-user constraint), but the audit trail records
		// the requested target user for traceability.
		const member = await ctx.db
			.query("orgMembers")
			.withIndex("by_orgId_and_userId", (q) =>
				q.eq("orgId", args.orgId).eq("userId", args.userId),
			)
			.first();

		const before = { plan: org.plan, orgId: args.orgId };
		await ctx.db.patch(args.orgId, { plan: args.newKey, updatedAt: Date.now() });
		const after = { plan: args.newKey, orgId: args.orgId };

		await logPlatformAction(ctx, {
			actorUserId: userId,
			actorEmail: user.email,
			action: "owner.user.tier_change",
			targetType: "user",
			targetId: args.userId,
			before,
			after: { ...after, requestedFor: args.userId, isMember: !!member },
			reason: args.reason,
		});

		return { ok: true, previousPlan: before.plan, newPlan: after.plan };
	},
});

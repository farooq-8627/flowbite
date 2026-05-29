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
	{
		displayName: string;
		monthlyPriceUSD: number;
		yearlyPriceUSD: number;
		trialDays: number;
		description: string;
		features: string[];
		highlight: boolean;
	}
> = {
	free: {
		displayName: "Free",
		monthlyPriceUSD: 0,
		yearlyPriceUSD: 0,
		trialDays: 0,
		description: "Get started — bring your own AI key, or test the platform.",
		features: [
			"Up to 100 leads & 50 deals",
			"3 team members",
			"5 custom fields per entity",
			"100 MB file storage",
			"Bring-your-own AI key (unmetered)",
		],
		highlight: false,
	},
	starter: {
		displayName: "Starter",
		monthlyPriceUSD: 19,
		yearlyPriceUSD: 190,
		trialDays: 14,
		description: "For solo operators ready to scale beyond the free tier.",
		features: [
			"5,000 leads & 1,000 deals",
			"10 team members",
			"3 pipelines per entity, 20 custom fields",
			"5 GB file storage",
			"100K AI tokens / 5,000 AI messages per month",
		],
		highlight: false,
	},
	pro: {
		displayName: "Pro",
		monthlyPriceUSD: 49,
		yearlyPriceUSD: 490,
		trialDays: 14,
		description: "For growing teams that need automation + analytics.",
		features: [
			"50,000 leads & 10,000 deals",
			"50 team members",
			"10 pipelines per entity, 100 custom fields",
			"50 GB file storage",
			"1M AI tokens / 50,000 AI messages per month",
			"Premium models (Opus, GPT-4o, Gemini Pro) on platform key",
		],
		highlight: true,
	},
	enterprise: {
		displayName: "Enterprise",
		monthlyPriceUSD: 199,
		yearlyPriceUSD: 1990,
		trialDays: 30,
		description: "For agencies + large workspaces with bespoke needs.",
		features: [
			"Unlimited leads, deals, members, fields, storage",
			"Unlimited AI tokens + AI messages",
			"Premium support + onboarding",
			"Custom contract + SSO available",
		],
		highlight: false,
	},
};

const limitsValidator = v.object({
	maxPipelinesPerEntityType: v.number(),
	maxDeals: v.number(),
	maxLeads: v.optional(v.number()),
	maxMembers: v.number(),
	maxCustomFieldsPerEntityType: v.number(),
	maxStorageBytes: v.number(),
	aiTokensPerMonth: v.number(),
	aiMessageCreditsPerMonth: v.optional(v.number()),
});

/**
 * Patch a tier definition. Auto-creates the row if it doesn't exist yet
 * (first edit after deployment seeds the row idempotently — operators
 * don't have to remember to run the migration).
 *
 * `patch` carries only the fields that changed; missing keys leave the
 * existing values untouched. Limit values clamp at -1 for unlimited and
 * at 0 for "feature disabled".
 *
 * **2026-05-27 P0.1.2** — patch shape extended with marketing-copy
 * fields (`description`, `features`, `highlight`) + LemonSqueezy
 * variant ids (`lemonSqueezyVariantIdMonthly`,
 * `lemonSqueezyVariantIdYearly`). Owner-panel edits to those propagate
 * directly to the in-app `PricingCard` and the marketing /pricing page
 * via the public `listPublicTiers` query.
 */
export const updateTier = mutation({
	args: {
		key: orgPlanValidator,
		patch: v.object({
			displayName: v.optional(v.string()),
			description: v.optional(v.string()),
			features: v.optional(v.array(v.string())),
			highlight: v.optional(v.boolean()),
			monthlyPriceUSD: v.optional(v.number()),
			yearlyPriceUSD: v.optional(v.number()),
			trialDays: v.optional(v.number()),
			lemonSqueezyVariantIdMonthly: v.optional(v.string()),
			lemonSqueezyVariantIdYearly: v.optional(v.string()),
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
				description: args.patch.description ?? defaults.description,
				features: args.patch.features ?? defaults.features,
				highlight: args.patch.highlight ?? defaults.highlight,
				monthlyPriceUSD: args.patch.monthlyPriceUSD ?? defaults.monthlyPriceUSD,
				yearlyPriceUSD: args.patch.yearlyPriceUSD ?? defaults.yearlyPriceUSD,
				trialDays: args.patch.trialDays ?? defaults.trialDays,
				lemonSqueezyVariantIdMonthly: args.patch.lemonSqueezyVariantIdMonthly,
				lemonSqueezyVariantIdYearly: args.patch.lemonSqueezyVariantIdYearly,
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
				description: args.patch.description ?? existing.description,
				features: args.patch.features ?? existing.features,
				highlight: args.patch.highlight ?? existing.highlight,
				monthlyPriceUSD: args.patch.monthlyPriceUSD ?? existing.monthlyPriceUSD,
				yearlyPriceUSD: args.patch.yearlyPriceUSD ?? existing.yearlyPriceUSD,
				trialDays: args.patch.trialDays ?? existing.trialDays,
				lemonSqueezyVariantIdMonthly:
					args.patch.lemonSqueezyVariantIdMonthly ??
					existing.lemonSqueezyVariantIdMonthly,
				lemonSqueezyVariantIdYearly:
					args.patch.lemonSqueezyVariantIdYearly ?? existing.lemonSqueezyVariantIdYearly,
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

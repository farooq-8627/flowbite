/**
 * Reserved-slug owner mutations — convex/_platform/reservedSlugs/mutations.ts
 *
 * Stage 2 implementation. Three CRUD verbs:
 *   - `createReservedSlug`  — add a brand-new owner-managed reservation.
 *   - `removeReservedSlug`  — delete a non-built-in entry; rejects with
 *                             `BUILT_IN_SLUG_PROTECTED` for seeded rows.
 *   - `updateReservedSlug`  — patch the human-facing `reason` only;
 *                             slug + category are immutable (rename via
 *                             remove + recreate).
 *
 * Built-in entries (`isBuiltIn: true`, seeded by
 * `_migrations/2026_05_27_seedReservedSlugs`) are protected from
 * deletion. Their `reason` text can still be edited (so operators can
 * annotate "why we keep this reserved").
 *
 * Pattern: PLATFORM-OWNER-PANEL.md §8 4-step.
 */

import { ConvexError, v } from "convex/values";
import { mutation } from "../../_generated/server";
import { enforceRateLimit, RATE_LIMITS } from "../../_shared/rateLimit";
import { SLUG_MAX, SLUG_MIN, SLUG_REGEX } from "../../_shared/reservedSlugs";
import { logPlatformAction } from "../audit/helpers";
import { requirePlatformOwner } from "../ownerAuth";

const categoryValidator = v.union(
	v.literal("org"),
	v.literal("template"),
	v.literal("industryGroup"),
	v.literal("entitySlug"),
	v.literal("route"),
);

function assertValidSlug(slug: string): void {
	if (!slug || slug.length < SLUG_MIN) {
		throw new ConvexError(`INVALID_SLUG_FORMAT: minimum ${SLUG_MIN} characters`);
	}
	if (slug.length > SLUG_MAX) {
		throw new ConvexError(`INVALID_SLUG_FORMAT: maximum ${SLUG_MAX} characters`);
	}
	if (!SLUG_REGEX.test(slug)) {
		throw new ConvexError(
			"INVALID_SLUG_FORMAT: only lowercase letters, numbers, and hyphens; cannot start or end with a hyphen",
		);
	}
	if (slug.includes("--")) {
		throw new ConvexError("INVALID_SLUG_FORMAT: consecutive hyphens are not allowed");
	}
}

export const createReservedSlug = mutation({
	args: {
		slug: v.string(),
		category: categoryValidator,
		reason: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const { user, userId } = await requirePlatformOwner(ctx);
		await enforceRateLimit(ctx, {
			scope: "owner.write",
			key: `${userId}`,
			...RATE_LIMITS.write,
		});

		const slug = args.slug.trim().toLowerCase();
		assertValidSlug(slug);

		const existing = await ctx.db
			.query("platformReservedSlugs")
			.withIndex("by_category_slug", (q) => q.eq("category", args.category).eq("slug", slug))
			.unique();
		if (existing) throw new ConvexError("RESERVED_SLUG_TAKEN");

		const now = Date.now();
		const id = await ctx.db.insert("platformReservedSlugs", {
			slug,
			category: args.category,
			reason: args.reason?.trim() || undefined,
			isBuiltIn: false,
			createdBy: userId,
			updatedBy: userId,
			createdAt: now,
			updatedAt: now,
		});

		await logPlatformAction(ctx, {
			actorUserId: userId,
			actorEmail: user.email,
			action: "owner.reservedSlug.create",
			targetType: "reservedSlug",
			targetId: `${args.category}:${slug}`,
			before: null,
			after: {
				_id: id,
				slug,
				category: args.category,
				reason: args.reason,
				isBuiltIn: false,
			},
			reason: args.reason,
		});

		return { ok: true };
	},
});

export const removeReservedSlug = mutation({
	args: {
		slug: v.string(),
		category: categoryValidator,
		reason: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const { user, userId } = await requirePlatformOwner(ctx);
		await enforceRateLimit(ctx, {
			scope: "owner.write",
			key: `${userId}`,
			...RATE_LIMITS.write,
		});

		const slug = args.slug.trim().toLowerCase();
		const existing = await ctx.db
			.query("platformReservedSlugs")
			.withIndex("by_category_slug", (q) => q.eq("category", args.category).eq("slug", slug))
			.unique();
		if (!existing) throw new ConvexError("RESERVED_SLUG_NOT_FOUND");
		if (existing.isBuiltIn) throw new ConvexError("BUILT_IN_SLUG_PROTECTED");

		const before = { ...existing };
		await ctx.db.delete(existing._id);

		await logPlatformAction(ctx, {
			actorUserId: userId,
			actorEmail: user.email,
			action: "owner.reservedSlug.remove",
			targetType: "reservedSlug",
			targetId: `${args.category}:${slug}`,
			before,
			after: null,
			reason: args.reason,
		});

		return { ok: true };
	},
});

export const updateReservedSlug = mutation({
	args: {
		slug: v.string(),
		category: categoryValidator,
		patch: v.object({
			reason: v.optional(v.string()),
		}),
	},
	handler: async (ctx, args) => {
		const { user, userId } = await requirePlatformOwner(ctx);
		await enforceRateLimit(ctx, {
			scope: "owner.write",
			key: `${userId}`,
			...RATE_LIMITS.write,
		});

		const slug = args.slug.trim().toLowerCase();
		const existing = await ctx.db
			.query("platformReservedSlugs")
			.withIndex("by_category_slug", (q) => q.eq("category", args.category).eq("slug", slug))
			.unique();
		if (!existing) throw new ConvexError("RESERVED_SLUG_NOT_FOUND");

		const before = { reason: existing.reason };
		const nextReason =
			args.patch.reason !== undefined
				? args.patch.reason.trim() || undefined
				: existing.reason;
		await ctx.db.patch(existing._id, {
			reason: nextReason,
			updatedBy: userId,
			updatedAt: Date.now(),
		});

		await logPlatformAction(ctx, {
			actorUserId: userId,
			actorEmail: user.email,
			action: "owner.reservedSlug.update",
			targetType: "reservedSlug",
			targetId: `${args.category}:${slug}`,
			before,
			after: { reason: nextReason },
		});

		return { ok: true };
	},
});

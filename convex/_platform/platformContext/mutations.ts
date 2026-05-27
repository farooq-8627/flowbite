/**
 * Owner-panel platform-context mutation — convex/_platform/platformContext/mutations.ts
 *
 * Update the `platformContext.main` row that's injected into every AI
 * system prompt. Auto-creates the row on first save (so a fresh
 * deployment doesn't need a separate seed step before the editor works).
 *
 * Mutation pattern (PLATFORM-OWNER-PANEL.md §8).
 *
 * Spec: PLATFORM-OWNER-PANEL.md §10 stage 6.
 */
import { v } from "convex/values";
import { mutation } from "../../_generated/server";
import { enforceRateLimit, RATE_LIMITS } from "../../_shared/rateLimit";
import { logPlatformAction } from "../audit/helpers";
import { requirePlatformOwner } from "../ownerAuth";

export const update = mutation({
	args: {
		content: v.string(),
		rules: v.optional(v.array(v.string())),
		/** Free-form version label, e.g. "v1.2.0". Defaults to a timestamp string. */
		version: v.optional(v.string()),
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
			.query("platformContext")
			.withIndex("by_key", (q) => q.eq("key", "main"))
			.unique();

		const now = Date.now();
		const version = args.version?.trim() || `v${new Date(now).toISOString()}`;
		let before: Record<string, unknown> | null;

		if (!existing) {
			const id = await ctx.db.insert("platformContext", {
				key: "main",
				version,
				content: args.content,
				rules: args.rules,
				updatedBy: userId,
				createdAt: now,
				updatedAt: now,
			});
			before = null;
			await logPlatformAction(ctx, {
				actorUserId: userId,
				actorEmail: user.email,
				action: "owner.context.create",
				targetType: "platformContext",
				targetId: "main",
				before,
				after: { _id: id, version, hasRules: Boolean(args.rules?.length) },
				reason: args.reason,
			});
		} else {
			before = {
				version: existing.version,
				content: existing.content,
				rules: existing.rules ?? [],
			};
			await ctx.db.patch(existing._id, {
				version,
				content: args.content,
				rules: args.rules,
				updatedBy: userId,
				updatedAt: now,
			});
			await logPlatformAction(ctx, {
				actorUserId: userId,
				actorEmail: user.email,
				action: "owner.context.update",
				targetType: "platformContext",
				targetId: "main",
				before,
				after: {
					version,
					content: args.content,
					rules: args.rules ?? [],
				},
				reason: args.reason,
			});
		}

		return { ok: true, version };
	},
});

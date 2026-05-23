/**
 * convex/_migrations/2026_05_23_setSuperAdmin.ts
 *
 * One-shot: promotes a user to platform super_admin by email.
 * Run with:
 *   npx convex run _migrations/2026_05_23_setSuperAdmin:run '{"email":"you@example.com"}'
 *
 * Idempotent — safe to run twice, second call is a no-op.
 * Delete this file after confirming platformContext seeded successfully.
 */
import { v } from "convex/values";
import { internalMutation } from "../_generated/server";

export const run = internalMutation({
	args: { email: v.string() },
	handler: async (ctx, args) => {
		const user = await ctx.db
			.query("users")
			.filter((q) => q.eq(q.field("email"), args.email))
			.first();

		if (!user) {
			return { ok: false, reason: `No user found with email: ${args.email}` };
		}

		if (user.platformRole === "super_admin") {
			return { ok: true, reason: "already_super_admin", userId: user._id };
		}

		await ctx.db.patch(user._id, { platformRole: "super_admin" });
		return { ok: true, reason: "promoted", userId: user._id, email: user.email };
	},
});

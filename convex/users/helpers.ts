/**
 * User helper functions for internal use.
 *
 * Sources:
 * - https://github.com/get-convex/convex-saas/blob/main/convex/users.ts
 * - https://labs.convex.dev/auth/config/users
 */
import { getAuthUserId } from "@convex-dev/auth/server";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { ERRORS } from "../_shared/errors";

/**
 * Returns the authenticated user's profile document.
 * Throws if not authenticated or user not found.
 */
export async function getCurrentUser(ctx: QueryCtx): Promise<Doc<"users">> {
	const userId = await getAuthUserId(ctx);
	if (userId === null) throw new Error(ERRORS.UNAUTHORIZED);
	const user = await ctx.db.get(userId);
	if (!user || user.deletedAt !== undefined) throw new Error(ERRORS.USER_NOT_FOUND);
	return user;
}

/**
 * Returns the authenticated user's profile or null if not authenticated.
 */
export async function getCurrentUserOrNull(ctx: QueryCtx): Promise<Doc<"users"> | null> {
	const userId = await getAuthUserId(ctx);
	if (userId === null) return null;
	const user = await ctx.db.get(userId);
	if (!user || user.deletedAt !== undefined) return null;
	return user;
}

/**
 * Returns a user by ID. Throws if not found.
 */
export async function getUserById(ctx: QueryCtx, userId: Id<"users">): Promise<Doc<"users">> {
	const user = await ctx.db.get(userId);
	if (!user || user.deletedAt !== undefined) throw new Error(ERRORS.USER_NOT_FOUND);
	return user;
}

/**
 * Returns a user by tokenIdentifier. Returns null if not found.
 */
export async function getUserByTokenIdentifier(
	ctx: QueryCtx,
	tokenIdentifier: string,
): Promise<Doc<"users"> | null> {
	return await ctx.db
		.query("users")
		.withIndex("by_tokenIdentifier", (q) => q.eq("tokenIdentifier", tokenIdentifier))
		.unique();
}

/**
 * Touches the user's lastActiveAt timestamp.
 */
export async function touchUserActivity(ctx: MutationCtx, userId: Id<"users">): Promise<void> {
	await ctx.db.patch(userId, { lastActiveAt: Date.now(), updatedAt: Date.now() });
}

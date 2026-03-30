/**
 * User profile mutations.
 *
 * PATTERN EXPLANATION:
 *   All public mutations that require authentication use `authenticatedMutation`
 *   from `convex/_functions/authenticated.ts` (Rule R2). This wrapper:
 *     1. Calls `getAuthUserId(ctx)` from `@convex-dev/auth/server` to validate
 *        the active session JWT before the handler runs.
 *     2. Loads the user document from the `users` table.
 *     3. Injects `ctx.user` (Doc<"users">) and `ctx.userId` (Id<"users">) into
 *        the handler context — no manual auth boilerplate needed.
 *     4. Throws `ConvexError("Unauthorized")` if the session is invalid/missing.
 *
 *   Internal mutations (`deleteMalformedUsers`, `upsertFromAuth`) use
 *   `internalMutation` because they are invoked by the auth system or cron
 *   jobs — never by the client (Rule R6).
 *
 * WHY `authenticatedMutation` (Rule R2):
 *   Using raw `mutation` + `getCurrentUser(ctx)` inside the handler works but
 *   violates R2. The risk is: if someone forgets the `getCurrentUser()` call,
 *   the mutation silently accepts unauthenticated requests. The wrapper makes
 *   the auth requirement impossible to bypass or forget.
 *
 * Sources:
 * - https://github.com/get-convex/convex-saas/blob/main/convex/users.ts
 * - https://labs.convex.dev/auth/config/users
 * - https://github.com/get-convex/convex-helpers/blob/main/packages/convex-helpers/server/customFunctions.ts
 */
import { ConvexError, v } from "convex/values";
import { internalMutation } from "../_generated/server";
import { authenticatedMutation } from "../_functions/authenticated";
import { ERRORS } from "../_shared/errors";

/**
 * Update the current user's display profile (name, locale, timezone).
 *
 * HOW IT WORKS:
 *   1. `authenticatedMutation` wrapper validates the session and injects
 *      `ctx.userId` before the handler runs — no manual `getAuthUserId` call.
 *   2. `ctx.db.patch` performs a shallow merge, so only the supplied fields are
 *      updated. Missing optional fields are left unchanged.
 *   3. `updatedAt` is always refreshed (Rule R7: every mutation must update updatedAt).
 *
 * WHY it only allows name/locale/timezone:
 *   Email changes require re-authentication (handled by @convex-dev/auth).
 *   Avatar uploads go through Convex File Storage and set `avatarStorageId`.
 *   Security-sensitive fields (tokenIdentifier, defaultOrgId) have dedicated mutations.
 */
export const updateProfile = authenticatedMutation({
	args: {
		name: v.optional(v.string()),
		locale: v.optional(v.string()),
		timezone: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		await ctx.db.patch(ctx.userId, {
			...args,
			updatedAt: Date.now(),
		});
	},
});

/**
 * Mark the current user's onboarding flow as completed.
 *
 * HOW IT WORKS:
 *   After a user creates their first org (or completes the onboarding wizard),
 *   this mutation flips `onboardingCompleted: true`. The app reads this flag
 *   in middleware to decide whether to redirect to `/onboarding` or `/dashboard`.
 *
 * WHY a dedicated mutation (not part of `updateProfile`):
 *   Onboarding completion is a one-way state transition. Isolating it in its
 *   own mutation makes it auditable (logActivity can target this specific action)
 *   and prevents accidental resets via `updateProfile`.
 */
export const completeOnboarding = authenticatedMutation({
	args: {},
	handler: async (ctx) => {
		await ctx.db.patch(ctx.userId, {
			onboardingCompleted: true,
			updatedAt: Date.now(),
		});
	},
});

/**
 * Set the user's default org (the org loaded on dashboard entry).
 *
 * HOW IT WORKS:
 *   1. Verifies the user is an active member of the target org before setting it
 *      as the default. This prevents a user from setting an org they've been
 *      removed from as their default.
 *   2. Uses `by_orgId_and_userId` index for O(log n) membership check (Rule R4).
 *
 * WHY NOT accept userId as arg (Rule R3):
 *   The user identity comes from `ctx.userId` (verified JWT), not from the
 *   client payload. This prevents a client from setting another user's defaultOrgId.
 */
export const setDefaultOrg = authenticatedMutation({
	args: { orgId: v.id("orgs") },
	handler: async (ctx, args) => {
		const member = await ctx.db
			.query("orgMembers")
			.withIndex("by_orgId_and_userId", (q) =>
				q.eq("orgId", args.orgId).eq("userId", ctx.userId),
			)
			.first();

		if (!member || member.deletedAt !== undefined) {
			throw new ConvexError(ERRORS.ORG_MEMBER_NOT_FOUND);
		}

		await ctx.db.patch(ctx.userId, {
			defaultOrgId: args.orgId,
			updatedAt: Date.now(),
		});
	},
});

/**
 * Soft-delete the current user's account.
 *
 * HOW IT WORKS:
 *   Sets `deletedAt` to the current timestamp. The `getCurrentUser` and
 *   `resolveUser` helpers both check `user.deletedAt !== undefined` and throw
 *   if set, so all subsequent authenticated requests will be rejected.
 *
 * WHY soft-delete (not hard delete):
 *   Org membership, activity logs, and notifications reference `userId`. Hard-deleting
 *   the user would break foreign key integrity. Soft-delete preserves history while
 *   effectively deactivating the account.
 *
 * IMPORTANT: In production, a background job should also revoke auth sessions
 *   via `@convex-dev/auth` after soft-deletion.
 */
export const deleteAccount = authenticatedMutation({
	args: {},
	handler: async (ctx) => {
		await ctx.db.patch(ctx.userId, {
			deletedAt: Date.now(),
			updatedAt: Date.now(),
		});
	},
});

// ─── Internal mutations ───────────────────────────────────────────────────────

/**
 * One-time dev migration: delete user documents that don't match the current schema.
 *
 * HOW IT WORKS:
 *   Scans up to 1000 users (Rule R5: bounded `.take()`) and deletes any that
 *   are missing required fields. These "malformed" docs were created before
 *   the `createOrUpdateUser` callback was added to `convex/auth.ts` (i.e. when
 *   @convex-dev/auth created a minimal user stub with only `email`).
 *
 * WHY `internalMutation` (Rule R6):
 *   Migration mutations must never be callable by clients. Using `internalMutation`
 *   ensures this can only be triggered by a Convex dashboard action or cron.
 *
 * WHEN TO RUN: Once after adding the `createOrUpdateUser` callback to auth.ts.
 */
export const deleteMalformedUsers = internalMutation({
	args: {},
	handler: async (ctx) => {
		const allUsers = await ctx.db.query("users").take(1000);
		let deleted = 0;

		for (const user of allUsers) {
			if (
				!user.tokenIdentifier ||
				!user.email ||
				user.onboardingCompleted === undefined ||
				!user.createdAt ||
				!user.updatedAt
			) {
				await ctx.db.delete(user._id);
				deleted++;
			}
		}

		return { deleted };
	},
});

/**
 * Upsert a user record from the auth callback. Internal use by the auth system.
 *
 * HOW IT WORKS:
 *   Called by `createOrUpdateUser` in `convex/auth.ts` when a user signs in via
 *   OAuth or Password. It either:
 *     - Updates the existing user's `name`, `avatarUrl`, `lastActiveAt`, `updatedAt`
 *       (without touching app-level fields like `defaultOrgId`, `locale`).
 *     - Or creates a new user document with the data provided by the OAuth provider.
 *
 *   Uses the `by_tokenIdentifier` index for an O(log n) lookup (Rule R4).
 *
 * WHY `internalMutation` (Rule R6):
 *   This mutation bypasses the normal auth guard (it's called during the auth flow
 *   itself, before a session exists). Making it internal ensures it can only be
 *   invoked by `convex/auth.ts`, not by a client.
 *
 * NOTE: In our setup, `createOrUpdateUser` in auth.ts directly calls `ctx.db`
 *   operations, so this function is available as a helper if needed by other
 *   internal flows (e.g. admin user provisioning).
 */
export const upsertFromAuth = internalMutation({
	args: {
		tokenIdentifier: v.string(),
		email: v.string(),
		name: v.optional(v.string()),
		avatarUrl: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const now = Date.now();
		const existing = await ctx.db
			.query("users")
			.withIndex("by_tokenIdentifier", (q) =>
				q.eq("tokenIdentifier", args.tokenIdentifier),
			)
			.unique();

		if (existing) {
			await ctx.db.patch(existing._id, {
				lastActiveAt: now,
				updatedAt: now,
				...(args.name !== undefined ? { name: args.name } : {}),
				...(args.avatarUrl !== undefined ? { avatarUrl: args.avatarUrl } : {}),
			});
			return existing._id;
		}

		return await ctx.db.insert("users", {
			tokenIdentifier: args.tokenIdentifier,
			email: args.email,
			name: args.name,
			avatarUrl: args.avatarUrl,
			onboardingCompleted: false,
			createdAt: now,
			updatedAt: now,
		});
	},
});


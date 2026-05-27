/**
 * User profile queries.
 *
 * PATTERN EXPLANATION:
 *   - `me` uses raw `query` because it must return null (not throw) when the
 *     caller is unauthenticated. It cannot use `authenticatedQuery` because
 *     that wrapper throws a ConvexError when there's no session. Rule R2 only
 *     applies to routes that REQUIRE auth.
 *   - `getCurrent` uses `authenticatedQuery` (Rule R2). It auto-injects
 *     `ctx.user` via the custom function builder in `_functions/authenticated.ts`,
 *     eliminating the boilerplate of manually calling `getAuthUserId` + `ctx.db.get`.
 *   - `getById`, `getByEmail` are `internalQuery` — only callable by other
 *     Convex functions, never exposed to the public internet (Rule R6).
 *
 * WHY THIS IS CORRECT:
 *   Using `authenticatedQuery` (from convex-helpers customFunctions) means the
 *   auth check is enforced at the wrapper layer before the handler runs.
 *   This is production-grade because: (1) auth cannot be accidentally forgotten,
 *   (2) ctx.user / ctx.userId are strictly typed Doc<"users"> / Id<"users">,
 *   and (3) the pattern scales identically across every protected function.
 *
 * Sources:
 * - https://github.com/get-convex/convex-saas/blob/main/convex/users.ts
 * - https://stack.convex.dev/pattern-query-current-user
 * - https://github.com/get-convex/convex-helpers/blob/main/packages/convex-helpers/server/customFunctions.ts
 */
import { v } from "convex/values";
import { authenticatedQuery } from "../_functions/authenticated";
import { internalQuery, query } from "../_generated/server";
import { getCurrentUserOrNull } from "./helpers";

/**
 * Returns the currently authenticated user's profile, or `null` if not signed in.
 *
 * HOW IT WORKS:
 *   1. Calls `getCurrentUserOrNull(ctx)` which runs `getAuthUserId(ctx)` from
 *      `@convex-dev/auth/server`. This validates the JWT session token that
 *      the Convex Auth middleware injects into every request.
 *   2. Looks up the user in our `users` table by the auth-issued `Id<"users">`.
 *   3. Returns null (never throws) if: no session, user not found, or soft-deleted.
 *
 * WHY raw `query` NOT `authenticatedQuery`:
 *   `authenticatedQuery` throws ConvexError("Unauthorized") when there's no session.
 *   `me` must return null for unauthenticated callers (e.g. the signin page checks
 *   `useQuery(api.users.me)` to decide whether to show the auth form or redirect).
 *
 * USAGE: `const user = useQuery(api.users.me);`
 */
export const me = query({
	args: {},
	handler: async (ctx) => {
		return await getCurrentUserOrNull(ctx);
	},
});

/**
 * Returns the currently authenticated user's full profile. Throws if not signed in.
 *
 * HOW IT WORKS:
 *   Uses `authenticatedQuery` wrapper from `convex/_functions/authenticated.ts`.
 *   The wrapper calls `getAuthUserId(ctx)` and loads the user document before
 *   the handler runs. Both `ctx.user` (full Doc<"users">) and `ctx.userId`
 *   (Id<"users">) are injected into `ctx`.
 *
 * WHY `authenticatedQuery` (Rule R2):
 *   Never call `ctx.auth.getUserIdentity()` or `getAuthUserId` manually inside
 *   protected handlers. The wrapper enforces auth at the call boundary,
 *   ensures consistent error messages, and provides typed ctx.user.
 *
 * USAGE: `const user = useQuery(api.users.getCurrent);`
 */
export const getCurrent = authenticatedQuery({
	args: {},
	handler: async (ctx) => {
		return ctx.user;
	},
});

/**
 * Returns a user document by ID. Internal functions only — never public.
 *
 * HOW IT WORKS:
 *   Direct `ctx.db.get(userId)` — O(1) lookup by Convex document ID.
 *   Returns null if the user doesn't exist (not a member-not-found error).
 *
 * WHY `internalQuery` (Rule R6):
 *   This function accepts a raw `userId` argument. Exposing it publicly would
 *   allow any authenticated client to fetch any user's profile by ID — a data
 *   leak. `internalQuery` is unreachable from the client or HTTP layer.
 *
 * USAGE: `await ctx.runQuery(internal.users.queries.getById, { userId })`
 */
export const getById = internalQuery({
	args: { userId: v.id("users") },
	handler: async (ctx, args) => {
		return await ctx.db.get(args.userId);
	},
});

/**
 * Returns a user document by email address. Internal functions only.
 *
 * HOW IT WORKS:
 *   Uses the `by_email` index defined in schema.ts for an O(log n) lookup
 *   instead of a full table scan. `.unique()` throws if multiple users share
 *   the same email (should never happen with auth, but guards against data bugs).
 *
 * WHY `internalQuery` (Rule R6):
 *   Email lookup is used by invitation acceptance flow (server-side only).
 *   Exposing it publicly would allow email enumeration attacks.
 *
 * USAGE: `await ctx.runQuery(internal.users.queries.getByEmail, { email })`
 */
export const getByEmail = internalQuery({
	args: { email: v.string() },
	handler: async (ctx, args) => {
		return await ctx.db
			.query("users")
			.withIndex("by_email", (q) => q.eq("email", args.email))
			.unique();
	},
});

/**
 * Internal query: get AI preferences for a user.
 * Used by processChat to resolve model defaults + the per-user AI tool
 * approval-gate map (see `convex/_shared/aiApprovals.ts`).
 */
export const getPreferences = internalQuery({
	args: { userId: v.id("users") },
	handler: async (ctx, args) => {
		const user = await ctx.db.get(args.userId);
		if (!user) return null;
		return {
			aiDefaultModel: user.preferences?.aiDefaultModel ?? null,
			aiDefaultProvider: user.preferences?.aiDefaultProvider ?? null,
			aiAutoContextLoad: user.preferences?.aiAutoContextLoad ?? true,
			aiBriefingEnabled: user.preferences?.aiBriefingEnabled ?? true,
			aiApprovals: user.preferences?.aiApprovals ?? {},
		};
	},
});

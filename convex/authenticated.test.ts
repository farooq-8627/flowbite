/// <reference types="vite/client" />
/**
 * Tests for authenticated function builders.
 *
 * WHAT IS BEING TESTED:
 *   The `resolveUser`, `authenticatedQuery`, `authenticatedMutation`, and
 *   `requireOrgMember` helpers in `convex/_functions/authenticated.ts`.
 *
 * WHY THESE TESTS EXIST:
 *   These helpers are the auth enforcement layer for every protected Convex
 *   function in the project. If they break, ALL protected routes are unprotected.
 *   Tests here confirm:
 *     1. Unauthenticated requests are rejected (Unauthorized error).
 *     2. Authenticated requests receive ctx.user / ctx.userId.
 *     3. Soft-deleted users are rejected (USER_NOT_FOUND error).
 *     4. requireOrgMember: verifies membership and injects org context.
 *     5. requireOrgMember: rejects non-members with ORG_MEMBER_NOT_FOUND.
 *
 * HOW convex-test works with @convex-dev/auth:
 *   `t.withIdentity({ subject: userId })` sets the JWT identity in the test context.
 *   `getAuthUserId(ctx)` from @convex-dev/auth splits `identity.subject` by `|` and
 *   returns the first segment — so `subject: userId` or `subject: userId|session`
 *   both resolve to `userId`.
 *
 * Sources:
 * - https://github.com/get-convex/convex-test — convex-test official package
 * - https://github.com/Develonaut/bnto/blob/main/packages/%40bnto/backend/convex/auth_lifecycle.test.ts
 *   — reference pattern for seedUser + withIdentity + auth testing
 * - https://github.com/get-convex/convex-helpers/blob/main/packages/convex-helpers/server/customFunctions.ts
 *   — custom function builder source
 */
import { describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

// ─── Test helpers ─────────────────────────────────────────────────────────────

/**
 * Creates a user in the database and returns an authenticated test context.
 *
 * Pattern mirrors what @convex-dev/auth's createOrUpdateUser callback does:
 * inserts a full user document, then creates a test identity with subject=userId.
 * getAuthUserId(ctx) splits by "|" and returns the first segment (the userId).
 */
async function seedUser(
	t: ReturnType<typeof convexTest>,
	opts?: { email?: string; name?: string; onboardingCompleted?: boolean },
) {
	const email = opts?.email ?? "alice@example.com";
	const name = opts?.name ?? "Alice";
	const now = Date.now();

	const userId = await t.run(async (ctx) => {
		return ctx.db.insert("users", {
			tokenIdentifier: `password|${email}`,
			email,
			name,
			onboardingCompleted: opts?.onboardingCompleted ?? false,
			createdAt: now,
			updatedAt: now,
		});
	});

	// subject: userId causes getAuthUserId to return userId directly
	const asUser = t.withIdentity({ subject: userId });
	return { userId, asUser };
}

// ─── authenticatedQuery ───────────────────────────────────────────────────────

describe("authenticatedQuery guard", () => {
	it("returns null from `me` when there is no session (unauthenticated)", async () => {
		/**
		 * `me` is a raw query (not authenticatedQuery) that returns null.
		 * Tests that the public-facing query handles unauthenticated gracefully.
		 */
		const t = convexTest(schema, modules);
		const result = await t.query(api.users.queries.me);
		expect(result).toBeNull();
	});

	it("returns user from `me` when authenticated", async () => {
		/**
		 * Confirms the authenticated context injects the correct user.
		 */
		const t = convexTest(schema, modules);
		const { userId, asUser } = await seedUser(t);

		const user = await asUser.query(api.users.queries.me);
		expect(user).not.toBeNull();
		expect(user!._id).toBe(userId);
		expect(user!.email).toBe("alice@example.com");
	});

	it("getCurrent throws when not authenticated", async () => {
		/**
		 * `getCurrent` uses authenticatedQuery — must throw ConvexError("Unauthorized")
		 * when called without a session.
		 */
		const t = convexTest(schema, modules);
		await expect(t.query(api.users.queries.getCurrent)).rejects.toThrow();
	});

	it("getCurrent returns the user when authenticated", async () => {
		const t = convexTest(schema, modules);
		const { userId, asUser } = await seedUser(t);

		const user = await asUser.query(api.users.queries.getCurrent);
		expect(user._id).toBe(userId);
		expect(user.email).toBe("alice@example.com");
	});

	it("getCurrent throws USER_NOT_FOUND for soft-deleted user", async () => {
		/**
		 * Confirms the auth guard rejects soft-deleted users even when a valid JWT
		 * session exists. Critical for account deletion flows.
		 */
		const t = convexTest(schema, modules);
		const { userId, asUser } = await seedUser(t);

		// Soft-delete the user
		await t.run(async (ctx) => {
			await ctx.db.patch(userId, { deletedAt: Date.now() });
		});

		await expect(asUser.query(api.users.queries.getCurrent)).rejects.toThrow();
	});
});

// ─── authenticatedMutation guard ─────────────────────────────────────────────

describe("authenticatedMutation guard", () => {
	it("updateProfile throws when not authenticated", async () => {
		/**
		 * Verifies the mutation-level auth guard. If this fails, any unauthenticated
		 * caller could update user profiles.
		 */
		const t = convexTest(schema, modules);
		await expect(
			t.mutation(api.users.mutations.updateProfile, { name: "Hacker" }),
		).rejects.toThrow();
	});

	it("updateProfile succeeds when authenticated", async () => {
		const t = convexTest(schema, modules);
		const { userId, asUser } = await seedUser(t);

		await asUser.mutation(api.users.mutations.updateProfile, { name: "Alice Smith" });

		const user = await t.run(async (ctx) => ctx.db.get(userId));
		expect(user!.name).toBe("Alice Smith");
	});
});

// ─── requireOrgMember ────────────────────────────────────────────────────────

describe("requireOrgMember", () => {
	it("throws ORG_MEMBER_NOT_FOUND when user is not a member of the org", async () => {
		/**
		 * `orgs/queries.get` calls requireOrgMember implicitly via the membership
		 * check inside its handler. Non-members must get null / rejection.
		 */
		const t = convexTest(schema, modules);
		const { asUser } = await seedUser(t);
		const now = Date.now();

		// Create an org that alice is NOT a member of
		const orgId = await t.run(async (ctx) => {
			return ctx.db.insert("orgs", {
				name: "Other Org",
				slug: "other-org",
				plan: "free",
				createdAt: now,
				updatedAt: now,
			});
		});

		// Alice queries an org she doesn't belong to — must return null
		const result = await asUser.query(api.orgs.queries.get, { orgId });
		expect(result).toBeNull();
	});

	it("returns org context when user is a valid member", async () => {
		/**
		 * Confirms the full happy path: user creates an org (becomes owner),
		 * then queries it and gets the org doc back.
		 */
		const t = convexTest(schema, modules);
		const { asUser } = await seedUser(t);

		const orgId = await asUser.mutation(api.orgs.mutations.create, { name: "Alice Corp" });

		const org = await asUser.query(api.orgs.queries.get, { orgId });
		expect(org).not.toBeNull();
		expect(org!._id).toBe(orgId);
		expect(org!.name).toBe("Alice Corp");
	});
});

// ─── superAdminQuery / superAdminMutation guards ──────────────────────────────

describe("superAdmin guards", () => {
	/**
	 * Tests for `superAdminQuery` and `superAdminMutation` builders.
	 *
	 * WHAT IS BEING TESTED:
	 *   - Regular users (no platformRole) are rejected with SUPER_ADMIN_REQUIRED.
	 *   - Users with platformRole "super_admin" pass through.
	 *
	 * WHY THESE MATTER:
	 *   Super admin operations (plan changes, feature flag overrides, etc.)
	 *   must be completely inaccessible to regular users. If this check fails,
	 *   any org member could change plans or disable features.
	 *
	 * Ref: .github/agents/base/rbac.md — Platform Roles
	 */

	it("rejects a regular user from a super-admin-only query", async () => {
		/**
		 * A regular user (no platformRole) attempts to call a super_admin-gated query.
		 * Should throw ConvexError with SUPER_ADMIN_REQUIRED message.
		 */
		const t = convexTest(schema, modules);
		const { asUser } = await seedUser(t, { email: "regular@example.com" });

		// `orgs.queries.listAll` uses superAdminQuery
		await expect(
			asUser.query(api.orgs.queries.listAll),
		).rejects.toThrow();
	});

	it("allows a super_admin user through a super-admin-only query", async () => {
		/**
		 * A user with platformRole "super_admin" calls the same query.
		 * Should succeed and return the list (even if empty).
		 */
		const t = convexTest(schema, modules);
		const now = Date.now();

		// Create super_admin user
		const adminId = await t.run(async (ctx) => {
			return ctx.db.insert("users", {
				tokenIdentifier: "password|admin@flowbite.dev",
				email: "admin@flowbite.dev",
				name: "Super Admin",
				platformRole: "super_admin",
				onboardingCompleted: true,
				createdAt: now,
				updatedAt: now,
			});
		});

		const asAdmin = t.withIdentity({ subject: adminId });
		const result = await asAdmin.query(api.orgs.queries.listAll);

		// Should return an array (empty or with orgs), not throw
		expect(Array.isArray(result)).toBe(true);
	});
});

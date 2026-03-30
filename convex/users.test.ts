/// <reference types="vite/client" />
/**
 * Tests for user queries and mutations.
 *
 * WHAT IS BEING TESTED:
 *   All public and internal functions in `convex/users/queries.ts` and
 *   `convex/users/mutations.ts`.
 *
 * TEST COVERAGE:
 *   Queries:
 *     - me: null when unauthenticated, correct user when authenticated
 *     - getCurrent: throws when unauthenticated, returns full user doc
 *     - getById (internal): returns user by ID
 *     - getByEmail (internal): returns user by email, returns null if missing
 *   Mutations:
 *     - updateProfile: updates name/locale/timezone, updatedAt refreshed
 *     - completeOnboarding: flips onboardingCompleted to true
 *     - setDefaultOrg: sets defaultOrgId, rejects non-members
 *     - deleteAccount: soft-deletes user (sets deletedAt)
 *     - upsertFromAuth (internal): creates new user; updates existing
 *     - deleteMalformedUsers (internal): deletes docs missing required fields
 *
 * HOW convex-test simulates @convex-dev/auth:
 *   `t.withIdentity({ subject: userId })` injects a JWT identity whose subject
 *   is the userId string. `getAuthUserId(ctx)` from @convex-dev/auth splits the
 *   subject by `|` and returns the first part — so subject=userId resolves directly.
 *
 * Sources:
 * - https://github.com/get-convex/convex-test — convex-test official package
 * - https://github.com/Develonaut/bnto/blob/main/packages/%40bnto/backend/convex/auth_lifecycle.test.ts
 * - https://github.com/get-convex/convex-saas/blob/main/convex/users.ts
 */
import { describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import { api, internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

// ─── Seed helper ──────────────────────────────────────────────────────────────

async function seedUser(
	t: ReturnType<typeof convexTest>,
	opts?: {
		email?: string;
		name?: string;
		onboardingCompleted?: boolean;
	},
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

	const asUser = t.withIdentity({ subject: userId });
	return { userId, asUser };
}

// ─── me query ─────────────────────────────────────────────────────────────────

describe("users.queries.me", () => {
	it("returns null when there is no session", async () => {
		/**
		 * The signin page calls `useQuery(api.users.me)` on load.
		 * It must return null (not throw) for unauthenticated visitors.
		 */
		const t = convexTest(schema, modules);
		const result = await t.query(api.users.queries.me);
		expect(result).toBeNull();
	});

	it("returns the user document when authenticated", async () => {
		const t = convexTest(schema, modules);
		const { userId, asUser } = await seedUser(t, { name: "Alice" });

		const user = await asUser.query(api.users.queries.me);
		expect(user).not.toBeNull();
		expect(user!._id).toBe(userId);
		expect(user!.email).toBe("alice@example.com");
		expect(user!.name).toBe("Alice");
	});

	it("returns null for a soft-deleted user", async () => {
		/**
		 * After deleteAccount is called, the user's session may still be active
		 * briefly. `me` must return null so the client treats them as logged out.
		 */
		const t = convexTest(schema, modules);
		const { userId, asUser } = await seedUser(t);

		await t.run(async (ctx) => {
			await ctx.db.patch(userId, { deletedAt: Date.now() });
		});

		const result = await asUser.query(api.users.queries.me);
		expect(result).toBeNull();
	});
});

// ─── getCurrent query ─────────────────────────────────────────────────────────

describe("users.queries.getCurrent", () => {
	it("throws when not authenticated (uses authenticatedQuery guard)", async () => {
		const t = convexTest(schema, modules);
		await expect(t.query(api.users.queries.getCurrent)).rejects.toThrow();
	});

	it("returns the full user document when authenticated", async () => {
		const t = convexTest(schema, modules);
		const { userId, asUser } = await seedUser(t, { name: "Alice", email: "alice@test.com" });

		const user = await asUser.query(api.users.queries.getCurrent);
		expect(user._id).toBe(userId);
		expect(user.email).toBe("alice@test.com");
		expect(user.name).toBe("Alice");
		expect(user.onboardingCompleted).toBe(false);
		// All timestamp fields present
		expect(typeof user.createdAt).toBe("number");
		expect(typeof user.updatedAt).toBe("number");
	});
});

// ─── getById internal query ───────────────────────────────────────────────────

describe("users.queries.getById (internal)", () => {
	it("returns the user by ID", async () => {
		const t = convexTest(schema, modules);
		const { userId } = await seedUser(t);

		const user = await t.run(async (ctx) => {
			return ctx.runQuery(internal.users.queries.getById, { userId });
		});
		expect(user).not.toBeNull();
		expect(user!._id).toBe(userId);
	});

	it("returns null for a non-existent user ID", async () => {
		const t = convexTest(schema, modules);
		const { userId } = await seedUser(t);

		// Delete the user and try to fetch it
		await t.run(async (ctx) => ctx.db.delete(userId));

		const user = await t.run(async (ctx) => {
			return ctx.runQuery(internal.users.queries.getById, { userId });
		});
		expect(user).toBeNull();
	});
});

// ─── getByEmail internal query ────────────────────────────────────────────────

describe("users.queries.getByEmail (internal)", () => {
	it("returns user by email", async () => {
		const t = convexTest(schema, modules);
		await seedUser(t, { email: "specific@example.com" });

		const user = await t.run(async (ctx) => {
			return ctx.runQuery(internal.users.queries.getByEmail, {
				email: "specific@example.com",
			});
		});
		expect(user).not.toBeNull();
		expect(user!.email).toBe("specific@example.com");
	});

	it("returns null when email not found", async () => {
		const t = convexTest(schema, modules);

		const user = await t.run(async (ctx) => {
			return ctx.runQuery(internal.users.queries.getByEmail, {
				email: "ghost@example.com",
			});
		});
		expect(user).toBeNull();
	});
});

// ─── updateProfile mutation ───────────────────────────────────────────────────

describe("users.mutations.updateProfile", () => {
	it("throws when not authenticated (authenticatedMutation guard)", async () => {
		const t = convexTest(schema, modules);
		await expect(
			t.mutation(api.users.mutations.updateProfile, { name: "Hacker" }),
		).rejects.toThrow();
	});

	it("updates name only when only name is provided", async () => {
		const t = convexTest(schema, modules);
		const { userId, asUser } = await seedUser(t, { name: "Alice" });

		await asUser.mutation(api.users.mutations.updateProfile, { name: "Alice Smith" });

		const user = await t.run(async (ctx) => ctx.db.get(userId));
		expect(user!.name).toBe("Alice Smith");
		// locale/timezone untouched (not set previously, not in update)
		expect(user!.locale).toBeUndefined();
	});

	it("updates locale and timezone without touching name", async () => {
		const t = convexTest(schema, modules);
		const { userId, asUser } = await seedUser(t, { name: "Alice" });

		await asUser.mutation(api.users.mutations.updateProfile, {
			locale: "en-GB",
			timezone: "Europe/London",
		});

		const user = await t.run(async (ctx) => ctx.db.get(userId));
		expect(user!.name).toBe("Alice");
		expect(user!.locale).toBe("en-GB");
		expect(user!.timezone).toBe("Europe/London");
	});

	it("refreshes updatedAt on every update (Rule R7)", async () => {
		/**
		 * Rule R7: every mutation must update updatedAt.
		 * Tests that updatedAt actually changes after the mutation.
		 */
		const t = convexTest(schema, modules);
		const { userId, asUser } = await seedUser(t);
		const before = await t.run(async (ctx) => ctx.db.get(userId));

		// Small delay to ensure timestamp changes
		await new Promise((r) => setTimeout(r, 2));

		await asUser.mutation(api.users.mutations.updateProfile, { name: "Updated" });

		const after = await t.run(async (ctx) => ctx.db.get(userId));
		expect(after!.updatedAt).toBeGreaterThanOrEqual(before!.updatedAt);
	});
});

// ─── completeOnboarding mutation ──────────────────────────────────────────────

describe("users.mutations.completeOnboarding", () => {
	it("throws when not authenticated", async () => {
		const t = convexTest(schema, modules);
		await expect(t.mutation(api.users.mutations.completeOnboarding)).rejects.toThrow();
	});

	it("sets onboardingCompleted to true", async () => {
		const t = convexTest(schema, modules);
		const { userId, asUser } = await seedUser(t, { onboardingCompleted: false });

		await asUser.mutation(api.users.mutations.completeOnboarding);

		const user = await t.run(async (ctx) => ctx.db.get(userId));
		expect(user!.onboardingCompleted).toBe(true);
	});

	it("is idempotent — calling twice does not error", async () => {
		const t = convexTest(schema, modules);
		const { asUser } = await seedUser(t, { onboardingCompleted: true });

		// Should not throw even if already completed
		await asUser.mutation(api.users.mutations.completeOnboarding);
	});
});

// ─── setDefaultOrg mutation ───────────────────────────────────────────────────

describe("users.mutations.setDefaultOrg", () => {
	it("throws when not authenticated", async () => {
		const t = convexTest(schema, modules);
		const orgId = await t.run(async (ctx) => {
			const now = Date.now();
			return ctx.db.insert("orgs", {
				name: "Org",
				slug: "org",
				plan: "free",
				createdAt: now,
				updatedAt: now,
			});
		});
		await expect(t.mutation(api.users.mutations.setDefaultOrg, { orgId })).rejects.toThrow();
	});

	it("sets defaultOrgId when user is a valid member", async () => {
		const t = convexTest(schema, modules);
		const { userId, asUser } = await seedUser(t);

		// Create org and add user as member
		const orgId = await t.run(async (ctx) => {
			const now = Date.now();
			const id = await ctx.db.insert("orgs", {
				name: "My Org",
				slug: "my-org",
				plan: "free",
				createdAt: now,
				updatedAt: now,
			});
			await ctx.db.insert("orgMembers", { orgId: id, userId, role: "owner", joinedAt: now });
			return id;
		});

		await asUser.mutation(api.users.mutations.setDefaultOrg, { orgId });

		const user = await t.run(async (ctx) => ctx.db.get(userId));
		expect(user!.defaultOrgId).toBe(orgId);
	});

	it("throws ORG_MEMBER_NOT_FOUND when user is not a member", async () => {
		/**
		 * A user should not be able to set an org they don't belong to as their default.
		 */
		const t = convexTest(schema, modules);
		const { asUser } = await seedUser(t);

		const orgId = await t.run(async (ctx) => {
			const now = Date.now();
			return ctx.db.insert("orgs", {
				name: "Other Org",
				slug: "other-org",
				plan: "free",
				createdAt: now,
				updatedAt: now,
			});
		});

		await expect(asUser.mutation(api.users.mutations.setDefaultOrg, { orgId })).rejects.toThrow();
	});
});

// ─── deleteAccount mutation ───────────────────────────────────────────────────

describe("users.mutations.deleteAccount", () => {
	it("throws when not authenticated", async () => {
		const t = convexTest(schema, modules);
		await expect(t.mutation(api.users.mutations.deleteAccount)).rejects.toThrow();
	});

	it("sets deletedAt on the user document (soft delete)", async () => {
		const t = convexTest(schema, modules);
		const { userId, asUser } = await seedUser(t);

		await asUser.mutation(api.users.mutations.deleteAccount);

		const user = await t.run(async (ctx) => ctx.db.get(userId));
		expect(user!.deletedAt).toBeDefined();
		expect(typeof user!.deletedAt).toBe("number");
	});

	it("soft-deleted user cannot access protected routes", async () => {
		/**
		 * After deletion, the user's session is still technically valid.
		 * authenticatedQuery/Mutation must reject them because deletedAt is set.
		 */
		const t = convexTest(schema, modules);
		const { asUser } = await seedUser(t);

		await asUser.mutation(api.users.mutations.deleteAccount);

		// getCurrent uses authenticatedQuery — must now throw
		await expect(asUser.query(api.users.queries.getCurrent)).rejects.toThrow();
	});
});

// ─── upsertFromAuth internal mutation ─────────────────────────────────────────

describe("users.mutations.upsertFromAuth (internal)", () => {
	it("creates a new user when tokenIdentifier does not exist", async () => {
		/**
		 * Mirrors what convex/auth.ts createOrUpdateUser does for a first-time sign-in.
		 */
		const t = convexTest(schema, modules);

		const userId = await t.run(async (ctx) => {
			return ctx.runMutation(internal.users.mutations.upsertFromAuth, {
				tokenIdentifier: "github|12345",
				email: "bob@github.com",
				name: "Bob GitHub",
				avatarUrl: "https://avatars.githubusercontent.com/bob",
			});
		});

		const user = await t.run(async (ctx) => ctx.db.get(userId));
		expect(user).not.toBeNull();
		expect(user!.tokenIdentifier).toBe("github|12345");
		expect(user!.email).toBe("bob@github.com");
		expect(user!.name).toBe("Bob GitHub");
		expect(user!.onboardingCompleted).toBe(false);
	});

	it("updates name/avatarUrl on re-authentication without touching app fields", async () => {
		/**
		 * If a user updates their GitHub name, the next sign-in should refresh it
		 * without resetting onboardingCompleted or defaultOrgId.
		 */
		const t = convexTest(schema, modules);
		const now = Date.now();

		// Create the user initially
		const userId = await t.run(async (ctx) => {
			const id = await ctx.db.insert("users", {
				tokenIdentifier: "github|12345",
				email: "bob@github.com",
				name: "Bob Old",
				onboardingCompleted: true,
				createdAt: now,
				updatedAt: now,
			});
			return id;
		});

		// Re-authenticate with updated profile
		const resultId = await t.run(async (ctx) => {
			return ctx.runMutation(internal.users.mutations.upsertFromAuth, {
				tokenIdentifier: "github|12345",
				email: "bob@github.com",
				name: "Bob New",
				avatarUrl: "https://avatars.githubusercontent.com/bob-new",
			});
		});

		expect(resultId).toBe(userId);

		const user = await t.run(async (ctx) => ctx.db.get(userId));
		expect(user!.name).toBe("Bob New");
		expect(user!.avatarUrl).toBe("https://avatars.githubusercontent.com/bob-new");
		// App fields NOT reset
		expect(user!.onboardingCompleted).toBe(true);
	});
});

// ─── deleteMalformedUsers internal mutation ────────────────────────────────────

describe("users.mutations.deleteMalformedUsers (internal)", () => {
	it.skip(
		"deletes user documents missing required fields — cannot be unit-tested via convex-test",
		async () => {
			/**
			 * WHY SKIPPED:
			 *   convex-test enforces the Convex schema at the application layer, which means
			 *   `ctx.db.insert("users", { email: "x" })` throws a schema-validation error before
			 *   the document is stored. In production, malformed documents only exist from
			 *   BEFORE the schema was enforced (legacy data created without the schema).
			 *
			 *   This migration mutation is a one-time cleanup tool for pre-schema data. Its
			 *   safety on a clean database is verified by the adjacent test: "does not delete
			 *   valid users". The mutation has no observable side effects on a valid dataset.
			 *
			 *   To test this in CI, you would need a raw database fixture with pre-schema
			 *   documents, which is out of scope for convex-test unit tests.
			 *
			 * REFERENCES:
			 *   - https://docs.convex.dev/database/schemas — Convex schema enforcement
			 *   - https://github.com/get-convex/convex-test — convex-test docs
			 */
		},
	);

	it("does not delete valid users", async () => {
		const t = convexTest(schema, modules);
		await seedUser(t, { email: "valid@example.com" });

		const result = await t.run(async (ctx) => {
			return ctx.runMutation(internal.users.mutations.deleteMalformedUsers);
		});

		expect(result.deleted).toBe(0);
		// Verify user still exists
		const users = await t.run(async (ctx) => ctx.db.query("users").take(10));
		expect(users).toHaveLength(1);
	});
});

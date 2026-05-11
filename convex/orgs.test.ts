/// <reference types="vite/client" />
/**
 * Tests for org queries and mutations.
 *
 * WHAT IS BEING TESTED:
 *   All public functions in `convex/orgs/queries.ts` and `convex/orgs/mutations.ts`.
 *
 * TEST COVERAGE:
 *   Queries:
 *     - listMyOrgs: returns user's orgs, empty for non-member
 *     - get: returns org for members, null for non-members
 *     - listMembers: returns members with user profiles, gates on membership
 *   Mutations:
 *     - create: creates org, sets creator as owner, sets defaultOrgId
 *     - create: slug uniqueness enforcement
 *     - update: owner/admin can update; viewer cannot; slug uniqueness
 *     - removeMember: owner/admin can remove; cannot remove last owner
 *     - updateMemberRole: owner can change roles; non-owner cannot
 *     - deleteOrg: owner can soft-delete; non-owner cannot
 *
 * MULTI-TENANCY ISOLATION:
 *   Critical tests verify that users can only access orgs they belong to.
 *   This is the foundation of the B2B multi-tenant architecture.
 *
 * Sources:
 * - https://github.com/get-convex/convex-saas/blob/main/convex/organizations.ts
 * - https://github.com/dbjpanda/convex-tenants/blob/main/example/convex/tenants.ts
 * - https://github.com/Develonaut/bnto/blob/main/packages/%40bnto/backend/convex/auth_lifecycle.test.ts
 */

import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

// ─── Seed helpers ─────────────────────────────────────────────────────────────

async function seedUser(
	t: ReturnType<typeof convexTest>,
	opts?: { email?: string; name?: string },
) {
	const email = opts?.email ?? "alice@example.com";
	const name = opts?.name ?? "Alice";
	const now = Date.now();

	const userId = await t.run(async (ctx) => {
		return ctx.db.insert("users", {
			tokenIdentifier: `password|${email}`,
			email,
			name,
			onboardingCompleted: false,
			createdAt: now,
			updatedAt: now,
		});
	});

	const asUser = t.withIdentity({ subject: userId });
	return { userId, asUser };
}

// ─── orgs.mutations.create ────────────────────────────────────────────────────

describe("orgs.mutations.create", () => {
	it("throws when not authenticated", async () => {
		const t = convexTest(schema, modules);
		await expect(t.mutation(api.orgs.mutations.create, { name: "Test" })).rejects.toThrow();
	});

	it("creates the org and inserts an owner membership", async () => {
		/**
		 * Core creation flow: org is inserted with free plan, user becomes owner.
		 */
		const t = convexTest(schema, modules);
		const { userId, asUser } = await seedUser(t);

		const orgId = await asUser.mutation(api.orgs.mutations.create, { name: "Alice Corp" });

		const org = await t.run(async (ctx) => ctx.db.get(orgId));
		expect(org).not.toBeNull();
		expect(org!.name).toBe("Alice Corp");
		expect(org!.plan).toBe("free");
		expect(org!.deletedAt).toBeUndefined();

		// Verify owner membership
		const member = await t.run(async (ctx) => {
			return ctx.db
				.query("orgMembers")
				.withIndex("by_orgId_and_userId", (q) => q.eq("orgId", orgId).eq("userId", userId))
				.first();
		});
		expect(member).not.toBeNull();
		// roleId is now the source of truth — role string is no longer stored
		expect(member!.roleId).toBeTruthy();
	});

	it("sets defaultOrgId on the user when they have no default", async () => {
		/**
		 * The first org a user creates should become their defaultOrgId
		 * so the dashboard redirect works immediately after signup.
		 */
		const t = convexTest(schema, modules);
		const { userId, asUser } = await seedUser(t);

		const orgId = await asUser.mutation(api.orgs.mutations.create, { name: "First Org" });

		const user = await t.run(async (ctx) => ctx.db.get(userId));
		expect(user!.defaultOrgId).toBe(orgId);
		expect(user!.onboardingCompleted).toBe(true);
	});

	it("does NOT overwrite defaultOrgId when user already has a default", async () => {
		/**
		 * Creating a second org should not steal the defaultOrgId from the first one.
		 */
		const t = convexTest(schema, modules);
		const { asUser } = await seedUser(t);

		const firstOrgId = await asUser.mutation(api.orgs.mutations.create, { name: "First Org" });
		await asUser.mutation(api.orgs.mutations.create, { name: "Second Org" });

		const user = await t.run(async (ctx) => {
			return ctx.db.query("users").first();
		});
		expect(user!.defaultOrgId).toBe(firstOrgId);
	});

	it("accepts a custom slug", async () => {
		const t = convexTest(schema, modules);
		const { asUser } = await seedUser(t);

		const orgId = await asUser.mutation(api.orgs.mutations.create, {
			name: "My Company",
			slug: "my-custom-slug",
		});

		const org = await t.run(async (ctx) => ctx.db.get(orgId));
		expect(org!.slug).toBe("my-custom-slug");
	});

	it("throws ORG_SLUG_TAKEN when slug is already in use", async () => {
		/**
		 * Slug uniqueness is enforced at the mutation level via `by_slug` index lookup.
		 * createOrg (onboarding flow) throws on duplicate slug.
		 * The legacy `create` mutation auto-increments instead.
		 */
		const t = convexTest(schema, modules);
		const { asUser } = await seedUser(t);

		await asUser.mutation(api.orgs.mutations.createOrg, { name: "Org A", slug: "shared-slug" });

		await expect(
			asUser.mutation(api.orgs.mutations.createOrg, { name: "Org B", slug: "shared-slug" }),
		).rejects.toThrow();
	});
});

// ─── orgs.queries.listMyOrgs ──────────────────────────────────────────────────

describe("orgs.queries.listMyOrgs", () => {
	it("throws when not authenticated", async () => {
		const t = convexTest(schema, modules);
		await expect(t.query(api.orgs.queries.listMyOrgs)).rejects.toThrow();
	});

	it("returns empty array for user with no orgs", async () => {
		const t = convexTest(schema, modules);
		const { asUser } = await seedUser(t);

		const orgs = await asUser.query(api.orgs.queries.listMyOrgs);
		expect(orgs).toEqual([]);
	});

	it("returns all orgs the user belongs to", async () => {
		const t = convexTest(schema, modules);
		const { asUser } = await seedUser(t);

		await asUser.mutation(api.orgs.mutations.create, { name: "Org A" });
		await asUser.mutation(api.orgs.mutations.create, { name: "Org B" });

		const orgs = await asUser.query(api.orgs.queries.listMyOrgs);
		expect(orgs).toHaveLength(2);
	});

	it("does not return orgs the user is not a member of (multi-tenancy isolation)", async () => {
		/**
		 * This is the critical multi-tenancy test. Alice must only see her own orgs.
		 * Bob's org must be invisible to Alice.
		 */
		const t = convexTest(schema, modules);
		const { asUser: asAlice } = await seedUser(t, { email: "alice@example.com" });
		const { asUser: asBob } = await seedUser(t, { email: "bob@example.com" });

		await asAlice.mutation(api.orgs.mutations.create, { name: "Alice Corp" });
		await asBob.mutation(api.orgs.mutations.create, { name: "Bob Corp" });

		const aliceOrgs = await asAlice.query(api.orgs.queries.listMyOrgs);
		expect(aliceOrgs).toHaveLength(1);
		expect(aliceOrgs[0].org.name).toBe("Alice Corp");

		const bobOrgs = await asBob.query(api.orgs.queries.listMyOrgs);
		expect(bobOrgs).toHaveLength(1);
		expect(bobOrgs[0].org.name).toBe("Bob Corp");
	});
});

// ─── orgs.queries.get ─────────────────────────────────────────────────────────

describe("orgs.queries.get", () => {
	it("returns null for non-member (org exists but caller is not a member)", async () => {
		/**
		 * Ensures that knowing an orgId doesn't give access. This is the access
		 * control test for org reads.
		 */
		const t = convexTest(schema, modules);
		const { asUser: asAlice } = await seedUser(t, { email: "alice@example.com" });
		const { asUser: asBob } = await seedUser(t, { email: "bob@example.com" });

		const orgId = await asAlice.mutation(api.orgs.mutations.create, { name: "Alice Corp" });

		// Bob cannot see Alice's org even though he knows the orgId
		const result = await asBob.query(api.orgs.queries.get, { orgId });
		expect(result).toBeNull();
	});

	it("returns the org for a valid member", async () => {
		const t = convexTest(schema, modules);
		const { asUser } = await seedUser(t);

		const orgId = await asUser.mutation(api.orgs.mutations.create, { name: "My Org" });

		const org = await asUser.query(api.orgs.queries.get, { orgId });
		expect(org).not.toBeNull();
		expect(org!._id).toBe(orgId);
		expect(org!.name).toBe("My Org");
	});
});

// ─── orgs.queries.listMembers ─────────────────────────────────────────────────

describe("orgs.queries.listMembers", () => {
	it("returns empty array for non-member", async () => {
		const t = convexTest(schema, modules);
		const { asUser: asAlice } = await seedUser(t, { email: "alice@example.com" });
		const { asUser: asBob } = await seedUser(t, { email: "bob@example.com" });

		const orgId = await asAlice.mutation(api.orgs.mutations.create, { name: "Alice Corp" });

		// Bob is not a member — should get empty array
		const result = await asBob.query(api.orgs.queries.listMembers, { orgId });
		expect(result).toEqual([]);
	});

	it("returns members with user profiles for valid member", async () => {
		/**
		 * Verifies the join: each member row includes the `user` field with the
		 * full user document. This powers the team settings UI.
		 */
		const t = convexTest(schema, modules);
		const { userId: aliceId, asUser: asAlice } = await seedUser(t, {
			email: "alice@example.com",
		});

		const orgId = await asAlice.mutation(api.orgs.mutations.create, { name: "Alice Corp" });

		const members = await asAlice.query(api.orgs.queries.listMembers, { orgId });
		expect(members).toHaveLength(1);
		expect(members[0].userId).toBe(aliceId);
		expect(members[0].roleId).toBeTruthy();
		expect(members[0].user).toBeDefined();
		expect(members[0].user.email).toBe("alice@example.com");
	});
});

// ─── orgs.queries.getMyMembership ─────────────────────────────────────────────

describe("orgs.queries.getMyMembership", () => {
	it("throws when not authenticated", async () => {
		const t = convexTest(schema, modules);
		const { asUser } = await seedUser(t);
		const orgId = await asUser.mutation(api.orgs.mutations.create, { name: "Org" });

		await expect(t.query(api.orgs.queries.getMyMembership, { orgId })).rejects.toThrow();
	});

	it("returns null for non-member", async () => {
		const t = convexTest(schema, modules);
		const { asUser: asAlice } = await seedUser(t, { email: "alice@example.com" });
		const { asUser: asBob } = await seedUser(t, { email: "bob@example.com" });

		const orgId = await asAlice.mutation(api.orgs.mutations.create, { name: "Alice Corp" });

		const membership = await asBob.query(api.orgs.queries.getMyMembership, { orgId });
		expect(membership).toBeNull();
	});

	it("returns membership doc for a member", async () => {
		const t = convexTest(schema, modules);
		const { userId, asUser } = await seedUser(t);

		const orgId = await asUser.mutation(api.orgs.mutations.create, { name: "My Org" });

		const membership = await asUser.query(api.orgs.queries.getMyMembership, { orgId });
		expect(membership).not.toBeNull();
		expect(membership!.roleId).toBeTruthy();
		expect(membership!.userId).toBe(userId);
		expect(membership!.orgId).toBe(orgId);
	});

	it("excludes soft-deleted memberships", async () => {
		const t = convexTest(schema, modules);
		const { asUser } = await seedUser(t);

		const orgId = await asUser.mutation(api.orgs.mutations.create, { name: "My Org" });

		// Soft-delete the membership
		await t.run(async (ctx) => {
			const members = await ctx.db
				.query("orgMembers")
				.withIndex("by_orgId_and_userId", (q) => q.eq("orgId", orgId))
				.collect();
			for (const m of members) {
				await ctx.db.patch(m._id, { deletedAt: Date.now() });
			}
		});

		const membership = await asUser.query(api.orgs.queries.getMyMembership, { orgId });
		expect(membership).toBeNull();
	});
});

// ─── orgs.mutations.update ────────────────────────────────────────────────────

describe("orgs.mutations.update", () => {
	it("owner can update org name", async () => {
		const t = convexTest(schema, modules);
		const { asUser } = await seedUser(t);

		const orgId = await asUser.mutation(api.orgs.mutations.create, { name: "Old Name" });
		await asUser.mutation(api.orgs.mutations.update, { orgId, name: "New Name" });

		const org = await t.run(async (ctx) => ctx.db.get(orgId));
		expect(org!.name).toBe("New Name");
	});

	it("viewer cannot update org settings (FORBIDDEN)", async () => {
		/**
		 * RBAC test: only owner/admin can update. Viewers must be rejected.
		 */
		const t = convexTest(schema, modules);
		const { asUser: asAlice } = await seedUser(t, { email: "alice@example.com" });
		const { userId: bobId, asUser: asBob } = await seedUser(t, { email: "bob@example.com" });

		const orgId = await asAlice.mutation(api.orgs.mutations.create, { name: "Alice Corp" });

		// Add Bob as a viewer
		await t.run(async (ctx) => {
			const { seedOrgMember } = await import("./_test/helpers");
			await seedOrgMember(ctx, orgId, bobId, "viewer");
		});

		await expect(
			asBob.mutation(api.orgs.mutations.update, { orgId, name: "Hacked Name" }),
		).rejects.toThrow();
	});

	it("throws ORG_SLUG_TAKEN when new slug is already taken by another org", async () => {
		const t = convexTest(schema, modules);
		const { asUser } = await seedUser(t);

		const orgId = await asUser.mutation(api.orgs.mutations.create, {
			name: "Org A",
			slug: "org-a",
		});
		await asUser.mutation(api.orgs.mutations.create, { name: "Org B", slug: "org-b" });

		await expect(
			asUser.mutation(api.orgs.mutations.update, { orgId, slug: "org-b" }),
		).rejects.toThrow();
	});
});

// ─── orgs.mutations.removeMember ─────────────────────────────────────────────

describe("orgs.mutations.removeMember", () => {
	it("owner can remove a member", async () => {
		const t = convexTest(schema, modules);
		const { asUser: asAlice } = await seedUser(t, { email: "alice@example.com" });
		const { userId: bobId } = await seedUser(t, { email: "bob@example.com" });

		const orgId = await asAlice.mutation(api.orgs.mutations.create, { name: "Alice Corp" });
		const now = Date.now();

		// Add Bob as member
		await t.run(async (ctx) => {
			const { seedOrgMember } = await import("./_test/helpers");
			await seedOrgMember(ctx, orgId, bobId, "member");
		});

		await asAlice.mutation(api.orgs.mutations.removeMember, { orgId, userId: bobId });

		// Verify Bob's membership is soft-deleted
		const member = await t.run(async (ctx) => {
			return ctx.db
				.query("orgMembers")
				.withIndex("by_orgId_and_userId", (q) => q.eq("orgId", orgId).eq("userId", bobId))
				.first();
		});
		expect(member!.deletedAt).toBeDefined();
	});

	it("cannot remove the last owner of the org", async () => {
		/**
		 * Safety guard: an org must always have at least one owner.
		 * This prevents orphaned orgs with no one to manage them.
		 */
		const t = convexTest(schema, modules);
		const { userId: aliceId, asUser: asAlice } = await seedUser(t, {
			email: "alice@example.com",
		});

		const orgId = await asAlice.mutation(api.orgs.mutations.create, { name: "Solo Org" });

		// Alice tries to remove herself (the only owner)
		await expect(
			asAlice.mutation(api.orgs.mutations.removeMember, { orgId, userId: aliceId }),
		).rejects.toThrow("Cannot remove the last owner");
	});

	it("non-member cannot remove others (FORBIDDEN)", async () => {
		const t = convexTest(schema, modules);
		const { userId: aliceId, asUser: asAlice } = await seedUser(t, {
			email: "alice@example.com",
		});
		const { asUser: asBob } = await seedUser(t, { email: "bob@example.com" });

		const orgId = await asAlice.mutation(api.orgs.mutations.create, { name: "Alice Corp" });

		// Bob is not a member — cannot remove Alice
		await expect(
			asBob.mutation(api.orgs.mutations.removeMember, { orgId, userId: aliceId }),
		).rejects.toThrow();
	});
});

// ─── orgs.mutations.updateMemberRole ─────────────────────────────────────────

describe("orgs.mutations.updateMemberRole", () => {
	it("owner can change a member's role to admin", async () => {
		const t = convexTest(schema, modules);
		const { asUser: asAlice } = await seedUser(t, { email: "alice@example.com" });
		const { userId: bobId } = await seedUser(t, { email: "bob@example.com" });

		const orgId = await asAlice.mutation(api.orgs.mutations.create, { name: "Alice Corp" });
		const now = Date.now();

		// Get the Admin role for this org
		const adminRoleId = await t.run(async (ctx) => {
			const role = await ctx.db
				.query("orgRoles")
				.withIndex("by_orgId_and_name", (q) => q.eq("orgId", orgId).eq("name", "Admin"))
				.first();
			return role!._id;
		});

		// Seed Bob as a member
		await t.run(async (ctx) => {
			const { seedOrgMember } = await import("./_test/helpers");
			await seedOrgMember(ctx, orgId, bobId, "member");
		});

		await asAlice.mutation(api.orgs.mutations.updateMemberRole, {
			orgId,
			userId: bobId,
			roleId: adminRoleId,
		});

		const member = await t.run(async (ctx) => {
			return ctx.db
				.query("orgMembers")
				.withIndex("by_orgId_and_userId", (q) => q.eq("orgId", orgId).eq("userId", bobId))
				.first();
		});
		expect(member!.roleId).toBe(adminRoleId);
	});

	it("non-owner cannot change roles (FORBIDDEN)", async () => {
		/**
		 * Role management is owner-only. Admins cannot promote others.
		 */
		const t = convexTest(schema, modules);
		const { asUser: asAlice } = await seedUser(t, { email: "alice@example.com" });
		const { userId: bobId, asUser: asBob } = await seedUser(t, { email: "bob@example.com" });
		const { userId: charlieId } = await seedUser(t, { email: "charlie@example.com" });

		const orgId = await asAlice.mutation(api.orgs.mutations.create, { name: "Alice Corp" });
		const now = Date.now();

		// Bob is admin, Charlie is member
		await t.run(async (ctx) => {
			const { seedOrgMember } = await import("./_test/helpers");
			await seedOrgMember(ctx, orgId, bobId, "admin");
			await seedOrgMember(ctx, orgId, charlieId, "member");
		});

		// Bob (admin) tries to promote Charlie — must fail (owner only)
		const adminRoleId = await t.run(async (ctx) => {
			const role = await ctx.db
				.query("orgRoles")
				.withIndex("by_orgId_and_name", (q) => q.eq("orgId", orgId).eq("name", "Admin"))
				.first();
			return role!._id;
		});
		await expect(
			asBob.mutation(api.orgs.mutations.updateMemberRole, {
				orgId,
				userId: charlieId,
				roleId: adminRoleId,
			}),
		).rejects.toThrow();
	});
});

// ─── orgs.mutations.deleteOrg ─────────────────────────────────────────────────

describe("orgs.mutations.deleteOrg", () => {
	it("owner can soft-delete the org", async () => {
		const t = convexTest(schema, modules);
		const { asUser } = await seedUser(t);

		const orgId = await asUser.mutation(api.orgs.mutations.create, { name: "To Delete" });
		await asUser.mutation(api.orgs.mutations.deleteOrg, { orgId });

		const org = await t.run(async (ctx) => ctx.db.get(orgId));
		expect(org!.deletedAt).toBeDefined();
	});

	it("non-owner cannot delete the org (FORBIDDEN)", async () => {
		const t = convexTest(schema, modules);
		const { asUser: asAlice } = await seedUser(t, { email: "alice@example.com" });
		const { userId: bobId, asUser: asBob } = await seedUser(t, { email: "bob@example.com" });

		const orgId = await asAlice.mutation(api.orgs.mutations.create, { name: "Alice Corp" });
		const now = Date.now();

		// Add Bob as admin — still cannot delete
		await t.run(async (ctx) => {
			const { seedOrgMember } = await import("./_test/helpers");
			await seedOrgMember(ctx, orgId, bobId, "admin");
		});

		await expect(asBob.mutation(api.orgs.mutations.deleteOrg, { orgId })).rejects.toThrow();
	});

	it("soft-deleted org is invisible via get query", async () => {
		/**
		 * After deleteOrg, the org should be treated as non-existent by all queries.
		 * getOrgById checks deletedAt !== undefined and throws ORG_NOT_FOUND.
		 * The orgs/queries.get returns null when the org is not found.
		 */
		const t = convexTest(schema, modules);
		const { asUser } = await seedUser(t);

		const orgId = await asUser.mutation(api.orgs.mutations.create, { name: "Gone Org" });
		await asUser.mutation(api.orgs.mutations.deleteOrg, { orgId });

		// Querying a deleted org should return null (getOrgById throws → caught → null)
		const org = await asUser.query(api.orgs.queries.get, { orgId }).catch(() => null);
		expect(org).toBeNull();
	});
});

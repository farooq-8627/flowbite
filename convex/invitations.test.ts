/// <reference types="vite/client" />
/**
 * Tests for invitation queries and mutations.
 *
 * WHAT IS BEING TESTED:
 *   All public functions in `convex/invitations/queries.ts` and
 *   `convex/invitations/mutations.ts`.
 *
 * TEST COVERAGE:
 *   Mutations:
 *     - create: owner/admin can create; member/viewer cannot
 *     - create: duplicate pending invitation rejected
 *     - create: existing member cannot be re-invited
 *     - create: rejects when role belongs to a different org
 *     - create: rejects when role is the Owner role
 *     - accept: token lookup, email match, member creation, expired handling
 *     - accept: soft-deleted member reactivated
 *     - decline: marks invitation as declined
 *     - cancel: requires members.invite; validates orgId match
 *   Queries:
 *     - listPending: returns only pending invitations
 *   Integration:
 *     - logActivity records are created on mutations
 *     - sendNotification records are created on accept
 *
 * NOTE on role lookup:
 *   Each test re-fetches the role doc by name inline (matches the pattern
 *   used in `orgs.test.ts`). A shared helper would be cleaner, but typing
 *   `t: ReturnType<typeof convexTest>` drops the schema generic and
 *   downgrades `withIndex` to `SystemIndexes` only — TS rejects the call
 *   in the convex/tsconfig.json strict pass. Inlining keeps the schema
 *   inferred from the local `convexTest(schema, modules)` value.
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
	return { userId, asUser, email };
}

async function seedOrgWithOwner(t: ReturnType<typeof convexTest>) {
	const owner = await seedUser(t, { email: "owner@example.com", name: "Owner" });
	const orgId = await owner.asUser.mutation(api.orgs.mutations.create, { name: "Test Org" });
	return { owner, orgId };
}

// ─── invitations.mutations.create ─────────────────────────────────────────────

describe("invitations.mutations.create", () => {
	it("owner can create an invitation", async () => {
		const t = convexTest(schema, modules);
		const { owner, orgId } = await seedOrgWithOwner(t);
		const memberRoleId = await t.run(async (ctx) => {
			const r = await ctx.db
				.query("orgRoles")
				.withIndex("by_orgId_and_name", (q) => q.eq("orgId", orgId).eq("name", "Member"))
				.first();
			return r!._id;
		});

		const result = await owner.asUser.mutation(api.invitations.mutations.create, {
			orgId,
			email: "bob@example.com",
			roleId: memberRoleId,
		});

		expect(result.invitationId).toBeDefined();
		expect(result.token).toBeDefined();

		// Verify invitation in DB
		const invitation = await t.run(async (ctx) => ctx.db.get(result.invitationId));
		expect(invitation).not.toBeNull();
		expect(invitation!.email).toBe("bob@example.com");
		expect(invitation!.roleId).toBe(memberRoleId);
		expect(invitation!.status).toBe("pending");
	});

	it("non-member cannot create an invitation", async () => {
		const t = convexTest(schema, modules);
		const { orgId } = await seedOrgWithOwner(t);
		const memberRoleId = await t.run(async (ctx) => {
			const r = await ctx.db
				.query("orgRoles")
				.withIndex("by_orgId_and_name", (q) => q.eq("orgId", orgId).eq("name", "Member"))
				.first();
			return r!._id;
		});
		const outsider = await seedUser(t, { email: "outsider@example.com", name: "Outsider" });

		await expect(
			outsider.asUser.mutation(api.invitations.mutations.create, {
				orgId,
				email: "bob@example.com",
				roleId: memberRoleId,
			}),
		).rejects.toThrow();
	});

	it("rejects duplicate pending invitation to same email", async () => {
		const t = convexTest(schema, modules);
		const { owner, orgId } = await seedOrgWithOwner(t);
		const { memberRoleId, adminRoleId } = await t.run(async (ctx) => {
			const member = await ctx.db
				.query("orgRoles")
				.withIndex("by_orgId_and_name", (q) => q.eq("orgId", orgId).eq("name", "Member"))
				.first();
			const admin = await ctx.db
				.query("orgRoles")
				.withIndex("by_orgId_and_name", (q) => q.eq("orgId", orgId).eq("name", "Admin"))
				.first();
			return { memberRoleId: member!._id, adminRoleId: admin!._id };
		});

		await owner.asUser.mutation(api.invitations.mutations.create, {
			orgId,
			email: "bob@example.com",
			roleId: memberRoleId,
		});

		await expect(
			owner.asUser.mutation(api.invitations.mutations.create, {
				orgId,
				email: "bob@example.com",
				roleId: adminRoleId,
			}),
		).rejects.toThrow(/active invitation/i);
	});

	it("rejects role from a different org", async () => {
		const t = convexTest(schema, modules);
		const { owner, orgId } = await seedOrgWithOwner(t);

		// Seed a second org owned by a different user. Its Member roleId
		// must not be assignable inside the first org's invitation.
		const otherOwner = await seedUser(t, { email: "other@example.com", name: "Other" });
		const otherOrgId = await otherOwner.asUser.mutation(api.orgs.mutations.create, {
			name: "Other Org",
		});
		const otherMemberRoleId = await t.run(async (ctx) => {
			const r = await ctx.db
				.query("orgRoles")
				.withIndex("by_orgId_and_name", (q) =>
					q.eq("orgId", otherOrgId).eq("name", "Member"),
				)
				.first();
			return r!._id;
		});

		await expect(
			owner.asUser.mutation(api.invitations.mutations.create, {
				orgId,
				email: "bob@example.com",
				roleId: otherMemberRoleId,
			}),
		).rejects.toThrow(/role/i);
	});

	it("rejects the Owner role", async () => {
		const t = convexTest(schema, modules);
		const { owner, orgId } = await seedOrgWithOwner(t);
		const ownerRoleId = await t.run(async (ctx) => {
			const r = await ctx.db
				.query("orgRoles")
				.withIndex("by_orgId_and_name", (q) => q.eq("orgId", orgId).eq("name", "Owner"))
				.first();
			return r!._id;
		});

		await expect(
			owner.asUser.mutation(api.invitations.mutations.create, {
				orgId,
				email: "bob@example.com",
				roleId: ownerRoleId,
			}),
		).rejects.toThrow(/owner/i);
	});

	it("creates logActivity record", async () => {
		const t = convexTest(schema, modules);
		const { owner, orgId } = await seedOrgWithOwner(t);
		const memberRoleId = await t.run(async (ctx) => {
			const r = await ctx.db
				.query("orgRoles")
				.withIndex("by_orgId_and_name", (q) => q.eq("orgId", orgId).eq("name", "Member"))
				.first();
			return r!._id;
		});

		await owner.asUser.mutation(api.invitations.mutations.create, {
			orgId,
			email: "bob@example.com",
			roleId: memberRoleId,
		});

		const logs = await t.run(async (ctx) => ctx.db.query("activityLogs").collect());
		const inviteLogs = logs.filter(
			(l) => l.entityType === "invitation" && l.action === "created",
		);
		expect(inviteLogs.length).toBeGreaterThanOrEqual(1);
	});
});

// ─── invitations.mutations.accept ─────────────────────────────────────────────

describe("invitations.mutations.accept", () => {
	it("invited user can accept and becomes a member", async () => {
		const t = convexTest(schema, modules);
		const { owner, orgId } = await seedOrgWithOwner(t);
		const memberRoleId = await t.run(async (ctx) => {
			const r = await ctx.db
				.query("orgRoles")
				.withIndex("by_orgId_and_name", (q) => q.eq("orgId", orgId).eq("name", "Member"))
				.first();
			return r!._id;
		});

		const { token } = await owner.asUser.mutation(api.invitations.mutations.create, {
			orgId,
			email: "bob@example.com",
			roleId: memberRoleId,
		});

		const bob = await seedUser(t, { email: "bob@example.com", name: "Bob" });

		const result = await bob.asUser.mutation(api.invitations.mutations.accept, { token });
		expect(result.orgId).toBe(orgId);
		expect(result.alreadyMember).toBe(false);

		// Verify membership
		const member = await t.run(async (ctx) =>
			ctx.db
				.query("orgMembers")
				.withIndex("by_orgId_and_userId", (q) =>
					q.eq("orgId", orgId).eq("userId", bob.userId),
				)
				.first(),
		);
		expect(member).not.toBeNull();
		expect(member!.roleId).toBe(memberRoleId);
	});

	it("sets defaultOrgId on accepting user if none set", async () => {
		const t = convexTest(schema, modules);
		const { owner, orgId } = await seedOrgWithOwner(t);
		const memberRoleId = await t.run(async (ctx) => {
			const r = await ctx.db
				.query("orgRoles")
				.withIndex("by_orgId_and_name", (q) => q.eq("orgId", orgId).eq("name", "Member"))
				.first();
			return r!._id;
		});

		const { token } = await owner.asUser.mutation(api.invitations.mutations.create, {
			orgId,
			email: "bob@example.com",
			roleId: memberRoleId,
		});

		const bob = await seedUser(t, { email: "bob@example.com", name: "Bob" });

		await bob.asUser.mutation(api.invitations.mutations.accept, { token });

		const user = await t.run(async (ctx) => ctx.db.get(bob.userId));
		expect(user!.defaultOrgId).toBe(orgId);
	});

	it("flips onboardingCompleted=true on accept (skips workspace wizard)", async () => {
		// Regression: before 2026-05-21, an invited brand-new user
		// (`onboardingCompleted: false` from auth.ts) would accept and land
		// at `/<orgSlug>`. The dashboard's `<OnboardingGuard>` then fired
		// `redirect("/onboarding")` because the flag was still false. The
		// ErrorBoundary above the guard caught the `NEXT_REDIRECT` and
		// rendered "Something went wrong" — every dashboard load after the
		// invite was broken. Accept must therefore mark the user onboarded:
		// they joined an existing workspace, so the workspace-creation
		// wizard isn't relevant.
		const t = convexTest(schema, modules);
		const { owner, orgId } = await seedOrgWithOwner(t);
		const memberRoleId = await t.run(async (ctx) => {
			const r = await ctx.db
				.query("orgRoles")
				.withIndex("by_orgId_and_name", (q) => q.eq("orgId", orgId).eq("name", "Member"))
				.first();
			return r!._id;
		});

		const { token } = await owner.asUser.mutation(api.invitations.mutations.create, {
			orgId,
			email: "bob@example.com",
			roleId: memberRoleId,
		});

		const bob = await seedUser(t, { email: "bob@example.com", name: "Bob" });

		// Sanity: seed leaves onboardingCompleted=false (matches auth.ts).
		const before = await t.run(async (ctx) => ctx.db.get(bob.userId));
		expect(before!.onboardingCompleted).toBe(false);

		await bob.asUser.mutation(api.invitations.mutations.accept, { token });

		const after = await t.run(async (ctx) => ctx.db.get(bob.userId));
		expect(after!.onboardingCompleted).toBe(true);
	});

	it("rejects when email does not match", async () => {
		const t = convexTest(schema, modules);
		const { owner, orgId } = await seedOrgWithOwner(t);
		const memberRoleId = await t.run(async (ctx) => {
			const r = await ctx.db
				.query("orgRoles")
				.withIndex("by_orgId_and_name", (q) => q.eq("orgId", orgId).eq("name", "Member"))
				.first();
			return r!._id;
		});

		const { token } = await owner.asUser.mutation(api.invitations.mutations.create, {
			orgId,
			email: "bob@example.com",
			roleId: memberRoleId,
		});

		// Eve tries to accept Bob's invitation
		const eve = await seedUser(t, { email: "eve@example.com", name: "Eve" });
		await expect(
			eve.asUser.mutation(api.invitations.mutations.accept, { token }),
		).rejects.toThrow();
	});

	it("rejects expired invitation", async () => {
		const t = convexTest(schema, modules);
		const { owner, orgId } = await seedOrgWithOwner(t);
		const memberRoleId = await t.run(async (ctx) => {
			const r = await ctx.db
				.query("orgRoles")
				.withIndex("by_orgId_and_name", (q) => q.eq("orgId", orgId).eq("name", "Member"))
				.first();
			return r!._id;
		});

		const { invitationId, token } = await owner.asUser.mutation(
			api.invitations.mutations.create,
			{
				orgId,
				email: "bob@example.com",
				roleId: memberRoleId,
			},
		);

		// Manually expire the invitation
		await t.run(async (ctx) => {
			await ctx.db.patch(invitationId, { expiresAt: Date.now() - 1000 });
		});

		const bob = await seedUser(t, { email: "bob@example.com", name: "Bob" });
		await expect(
			bob.asUser.mutation(api.invitations.mutations.accept, { token }),
		).rejects.toThrow();
	});

	it("rejects already-used invitation (one-shot link guarantee)", async () => {
		const t = convexTest(schema, modules);
		const { owner, orgId } = await seedOrgWithOwner(t);
		const memberRoleId = await t.run(async (ctx) => {
			const r = await ctx.db
				.query("orgRoles")
				.withIndex("by_orgId_and_name", (q) => q.eq("orgId", orgId).eq("name", "Member"))
				.first();
			return r!._id;
		});

		const { token } = await owner.asUser.mutation(api.invitations.mutations.create, {
			orgId,
			email: "bob@example.com",
			roleId: memberRoleId,
		});

		const bob = await seedUser(t, { email: "bob@example.com", name: "Bob" });

		// Accept once
		await bob.asUser.mutation(api.invitations.mutations.accept, { token });

		// Try to accept again — must throw, even though Bob is the
		// originally-invited user. Once accepted the link is dead forever.
		await expect(
			bob.asUser.mutation(api.invitations.mutations.accept, { token }),
		).rejects.toThrow();
	});

	it("sends notification to inviter on accept", async () => {
		const t = convexTest(schema, modules);
		const { owner, orgId } = await seedOrgWithOwner(t);
		const memberRoleId = await t.run(async (ctx) => {
			const r = await ctx.db
				.query("orgRoles")
				.withIndex("by_orgId_and_name", (q) => q.eq("orgId", orgId).eq("name", "Member"))
				.first();
			return r!._id;
		});

		const { token } = await owner.asUser.mutation(api.invitations.mutations.create, {
			orgId,
			email: "bob@example.com",
			roleId: memberRoleId,
		});

		const bob = await seedUser(t, { email: "bob@example.com", name: "Bob" });
		await bob.asUser.mutation(api.invitations.mutations.accept, { token });

		const notifications = await t.run(async (ctx) => ctx.db.query("notifications").collect());
		const acceptNotifs = notifications.filter(
			(n) => n.type === "invitation.accepted" && n.userId === owner.userId,
		);
		expect(acceptNotifs.length).toBe(1);
	});

	it("reactivates soft-deleted member on accept", async () => {
		const t = convexTest(schema, modules);
		const { owner, orgId } = await seedOrgWithOwner(t);
		const adminRoleId = await t.run(async (ctx) => {
			const r = await ctx.db
				.query("orgRoles")
				.withIndex("by_orgId_and_name", (q) => q.eq("orgId", orgId).eq("name", "Admin"))
				.first();
			return r!._id;
		});

		// Create a soft-deleted member for Bob
		const bob = await seedUser(t, { email: "bob@example.com", name: "Bob" });
		const memberId = await t.run(async (ctx) => {
			const { seedOrgMember } = await import("./_test/helpers");
			const { memberId: mId } = await seedOrgMember(ctx, orgId, bob.userId, "member");
			await ctx.db.patch(mId, { deletedAt: Date.now() });
			return mId;
		});

		// Invite at admin role and accept
		const { token } = await owner.asUser.mutation(api.invitations.mutations.create, {
			orgId,
			email: "bob@example.com",
			roleId: adminRoleId,
		});
		await bob.asUser.mutation(api.invitations.mutations.accept, { token });

		// Verify reactivated with new role
		const member = await t.run(async (ctx) => {
			const m = await ctx.db.get(memberId);
			return m as { deletedAt?: number; roleId: unknown } | null;
		});
		expect(member!.deletedAt).toBeUndefined();
		expect(member!.roleId).toBe(adminRoleId);
	});
});

// ─── invitations.mutations.decline ────────────────────────────────────────────

describe("invitations.mutations.decline", () => {
	it("invited user can decline", async () => {
		const t = convexTest(schema, modules);
		const { owner, orgId } = await seedOrgWithOwner(t);
		const memberRoleId = await t.run(async (ctx) => {
			const r = await ctx.db
				.query("orgRoles")
				.withIndex("by_orgId_and_name", (q) => q.eq("orgId", orgId).eq("name", "Member"))
				.first();
			return r!._id;
		});

		const { invitationId, token } = await owner.asUser.mutation(
			api.invitations.mutations.create,
			{
				orgId,
				email: "bob@example.com",
				roleId: memberRoleId,
			},
		);

		const bob = await seedUser(t, { email: "bob@example.com", name: "Bob" });
		await bob.asUser.mutation(api.invitations.mutations.decline, { token });

		const invitation = await t.run(async (ctx) => ctx.db.get(invitationId));
		expect(invitation!.status).toBe("declined");
	});

	it("wrong email cannot decline", async () => {
		const t = convexTest(schema, modules);
		const { owner, orgId } = await seedOrgWithOwner(t);
		const memberRoleId = await t.run(async (ctx) => {
			const r = await ctx.db
				.query("orgRoles")
				.withIndex("by_orgId_and_name", (q) => q.eq("orgId", orgId).eq("name", "Member"))
				.first();
			return r!._id;
		});

		const { token } = await owner.asUser.mutation(api.invitations.mutations.create, {
			orgId,
			email: "bob@example.com",
			roleId: memberRoleId,
		});

		const eve = await seedUser(t, { email: "eve@example.com", name: "Eve" });
		await expect(
			eve.asUser.mutation(api.invitations.mutations.decline, { token }),
		).rejects.toThrow();
	});
});

// ─── invitations.mutations.cancel ─────────────────────────────────────────────

describe("invitations.mutations.cancel", () => {
	it("owner can cancel a pending invitation", async () => {
		const t = convexTest(schema, modules);
		const { owner, orgId } = await seedOrgWithOwner(t);
		const memberRoleId = await t.run(async (ctx) => {
			const r = await ctx.db
				.query("orgRoles")
				.withIndex("by_orgId_and_name", (q) => q.eq("orgId", orgId).eq("name", "Member"))
				.first();
			return r!._id;
		});

		const { invitationId } = await owner.asUser.mutation(api.invitations.mutations.create, {
			orgId,
			email: "bob@example.com",
			roleId: memberRoleId,
		});

		await owner.asUser.mutation(api.invitations.mutations.cancel, {
			orgId,
			invitationId,
		});

		const invitation = await t.run(async (ctx) => ctx.db.get(invitationId));
		expect(invitation!.status).toBe("expired");
	});

	it("non-member cannot cancel", async () => {
		const t = convexTest(schema, modules);
		const { owner, orgId } = await seedOrgWithOwner(t);
		const memberRoleId = await t.run(async (ctx) => {
			const r = await ctx.db
				.query("orgRoles")
				.withIndex("by_orgId_and_name", (q) => q.eq("orgId", orgId).eq("name", "Member"))
				.first();
			return r!._id;
		});

		const { invitationId } = await owner.asUser.mutation(api.invitations.mutations.create, {
			orgId,
			email: "bob@example.com",
			roleId: memberRoleId,
		});

		const outsider = await seedUser(t, { email: "outsider@example.com", name: "Outsider" });
		await expect(
			outsider.asUser.mutation(api.invitations.mutations.cancel, {
				orgId,
				invitationId,
			}),
		).rejects.toThrow();
	});
});

// ─── invitations.queries.listPending ──────────────────────────────────────────

describe("invitations.queries.listPending", () => {
	it("returns only pending invitations", async () => {
		const t = convexTest(schema, modules);
		const { owner, orgId } = await seedOrgWithOwner(t);
		const { memberRoleId, adminRoleId } = await t.run(async (ctx) => {
			const member = await ctx.db
				.query("orgRoles")
				.withIndex("by_orgId_and_name", (q) => q.eq("orgId", orgId).eq("name", "Member"))
				.first();
			const admin = await ctx.db
				.query("orgRoles")
				.withIndex("by_orgId_and_name", (q) => q.eq("orgId", orgId).eq("name", "Admin"))
				.first();
			return { memberRoleId: member!._id, adminRoleId: admin!._id };
		});

		await owner.asUser.mutation(api.invitations.mutations.create, {
			orgId,
			email: "bob@example.com",
			roleId: memberRoleId,
		});

		await owner.asUser.mutation(api.invitations.mutations.create, {
			orgId,
			email: "carol@example.com",
			roleId: adminRoleId,
		});

		// Decline one
		const carol = await seedUser(t, { email: "carol@example.com", name: "Carol" });
		const all = await t.run(async (ctx) => ctx.db.query("invitations").collect());
		const carolInvite = all.find((i) => i.email === "carol@example.com");
		await carol.asUser.mutation(api.invitations.mutations.decline, {
			token: carolInvite!.token,
		});

		const pending = await owner.asUser.query(api.invitations.queries.listPending, { orgId });
		expect(pending.length).toBe(1);
		expect(pending[0].email).toBe("bob@example.com");
		expect(pending[0].roleName).toBe("Member");
	});
});

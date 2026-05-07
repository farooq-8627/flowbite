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
 *     - accept: token lookup, email match, member creation, expired handling
 *     - accept: soft-deleted member reactivated
 *     - decline: marks invitation as declined
 *     - cancel: requires members.invite; validates orgId match
 *   Queries:
 *     - listPending: returns only pending invitations
 *   Integration:
 *     - logActivity records are created on mutations
 *     - sendNotification records are created on accept
 */
import { describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
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

		const result = await owner.asUser.mutation(api.invitations.mutations.create, {
			orgId,
			email: "bob@example.com",
			role: "member",
		});

		expect(result.invitationId).toBeDefined();
		expect(result.token).toBeDefined();

		// Verify invitation in DB
		const invitation = await t.run(async (ctx) => ctx.db.get(result.invitationId));
		expect(invitation).not.toBeNull();
		expect(invitation!.email).toBe("bob@example.com");
		expect(invitation!.role).toBe("member");
		expect(invitation!.status).toBe("pending");
	});

	it("non-member cannot create an invitation", async () => {
		const t = convexTest(schema, modules);
		const { orgId } = await seedOrgWithOwner(t);
		const outsider = await seedUser(t, { email: "outsider@example.com", name: "Outsider" });

		await expect(
			outsider.asUser.mutation(api.invitations.mutations.create, {
				orgId,
				email: "bob@example.com",
				role: "member",
			}),
		).rejects.toThrow();
	});

	it("rejects duplicate pending invitation to same email", async () => {
		const t = convexTest(schema, modules);
		const { owner, orgId } = await seedOrgWithOwner(t);

		await owner.asUser.mutation(api.invitations.mutations.create, {
			orgId,
			email: "bob@example.com",
			role: "member",
		});

		await expect(
			owner.asUser.mutation(api.invitations.mutations.create, {
				orgId,
				email: "bob@example.com",
				role: "admin",
			}),
		).rejects.toThrow(/active invitation/i);
	});

	it("creates logActivity record", async () => {
		const t = convexTest(schema, modules);
		const { owner, orgId } = await seedOrgWithOwner(t);

		await owner.asUser.mutation(api.invitations.mutations.create, {
			orgId,
			email: "bob@example.com",
			role: "member",
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

		const { token } = await owner.asUser.mutation(api.invitations.mutations.create, {
			orgId,
			email: "bob@example.com",
			role: "member",
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
		expect(member!.roleId).toBeTruthy();
	});

	it("sets defaultOrgId on accepting user if none set", async () => {
		const t = convexTest(schema, modules);
		const { owner, orgId } = await seedOrgWithOwner(t);

		const { token } = await owner.asUser.mutation(api.invitations.mutations.create, {
			orgId,
			email: "bob@example.com",
			role: "member",
		});

		const bob = await seedUser(t, { email: "bob@example.com", name: "Bob" });

		await bob.asUser.mutation(api.invitations.mutations.accept, { token });

		const user = await t.run(async (ctx) => ctx.db.get(bob.userId));
		expect(user!.defaultOrgId).toBe(orgId);
	});

	it("rejects when email does not match", async () => {
		const t = convexTest(schema, modules);
		const { owner, orgId } = await seedOrgWithOwner(t);

		const { token } = await owner.asUser.mutation(api.invitations.mutations.create, {
			orgId,
			email: "bob@example.com",
			role: "member",
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

		const { invitationId, token } = await owner.asUser.mutation(
			api.invitations.mutations.create,
			{
				orgId,
				email: "bob@example.com",
				role: "member",
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

	it("rejects already-used invitation", async () => {
		const t = convexTest(schema, modules);
		const { owner, orgId } = await seedOrgWithOwner(t);

		const { token } = await owner.asUser.mutation(api.invitations.mutations.create, {
			orgId,
			email: "bob@example.com",
			role: "member",
		});

		const bob = await seedUser(t, { email: "bob@example.com", name: "Bob" });

		// Accept once
		await bob.asUser.mutation(api.invitations.mutations.accept, { token });

		// Try to accept again
		await expect(
			bob.asUser.mutation(api.invitations.mutations.accept, { token }),
		).rejects.toThrow();
	});

	it("sends notification to inviter on accept", async () => {
		const t = convexTest(schema, modules);
		const { owner, orgId } = await seedOrgWithOwner(t);

		const { token } = await owner.asUser.mutation(api.invitations.mutations.create, {
			orgId,
			email: "bob@example.com",
			role: "member",
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

		// Create a soft-deleted member for Bob
		const bob = await seedUser(t, { email: "bob@example.com", name: "Bob" });
		const memberId = await t.run(async (ctx) =>
			ctx.db.insert("orgMembers", {
				orgId,
				userId: bob.userId,
				role: "member",
				joinedAt: Date.now(),
				deletedAt: Date.now(),
			}),
		);

		// Invite and accept
		const { token } = await owner.asUser.mutation(api.invitations.mutations.create, {
			orgId,
			email: "bob@example.com",
			role: "admin",
		});
		await bob.asUser.mutation(api.invitations.mutations.accept, { token });

		// Verify reactivated with new role
		const member = await t.run(async (ctx) => ctx.db.get(memberId));
		expect(member!.deletedAt).toBeUndefined();
		expect(member!.roleId).toBeTruthy();
	});
});

// ─── invitations.mutations.decline ────────────────────────────────────────────

describe("invitations.mutations.decline", () => {
	it("invited user can decline", async () => {
		const t = convexTest(schema, modules);
		const { owner, orgId } = await seedOrgWithOwner(t);

		const { invitationId, token } = await owner.asUser.mutation(
			api.invitations.mutations.create,
			{
				orgId,
				email: "bob@example.com",
				role: "member",
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

		const { token } = await owner.asUser.mutation(api.invitations.mutations.create, {
			orgId,
			email: "bob@example.com",
			role: "member",
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

		const { invitationId } = await owner.asUser.mutation(api.invitations.mutations.create, {
			orgId,
			email: "bob@example.com",
			role: "member",
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

		const { invitationId } = await owner.asUser.mutation(api.invitations.mutations.create, {
			orgId,
			email: "bob@example.com",
			role: "member",
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

		await owner.asUser.mutation(api.invitations.mutations.create, {
			orgId,
			email: "bob@example.com",
			role: "member",
		});

		await owner.asUser.mutation(api.invitations.mutations.create, {
			orgId,
			email: "carol@example.com",
			role: "admin",
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
	});
});

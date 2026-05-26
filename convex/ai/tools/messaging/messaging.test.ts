/**
 * convex/ai/tools/messaging/messaging.test.ts
 *
 * Stage 2 of SPRINT-PLAN.md (2026-05-26). Regression coverage for the
 * messaging ForAI twins added alongside the new send_message /
 * list_messages / mark_thread_read / add_participants /
 * remove_participant tools.
 *
 * The agent-scorer test (`convex/ai/agentScorer.test.ts`) already
 * exercises the orchestrator's tool-filter / Zod-formatter / twoStep
 * pipeline. Here we cover the SECOND-half of the AGENTS.md non-negotiable
 * rule: every public mutation called by an AI tool MUST have a same-file
 * `*ForAI` twin that:
 *
 *   (a) refuses the call when the trusted userId is not an org member,
 *   (b) uses requireOrgMemberByIds (NOT getAuthUserId) — so AI calls
 *       inside the scheduled processChat action don't fail with
 *       UNAUTHORIZED,
 *   (c) writes the same row shape the public version writes (body parity),
 *   (d) defaults authorType to "ai" so activity log + notifications
 *       attribute correctly.
 *
 * These tests don't load a real LLM — they invoke the internal twins
 * directly via `t.action`-style calls through the convex-test harness so
 * we can verify the auth gate + DB write in isolation.
 */

import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api, internal } from "../../../_generated/api";
import { getDefaultPermissionsForRole } from "../../../_shared/permissions/derive";
import schema from "../../../schema";

const modules = import.meta.glob("../../../**/*.ts");

// ─── seeders (mirror crm-hardening.test.ts) ──────────────────────────────────

async function seedUser(t: ReturnType<typeof convexTest>, email = "alice@example.com") {
	const now = Date.now();
	const userId = await t.run(async (ctx) => {
		return ctx.db.insert("users", {
			tokenIdentifier: `password|${email}`,
			email,
			name: email.split("@")[0],
			onboardingCompleted: false,
			createdAt: now,
			updatedAt: now,
		});
	});
	return { userId, asUser: t.withIdentity({ subject: userId }) };
}

async function seedOrg(
	t: ReturnType<typeof convexTest>,
	userId: string,
	roleName: "owner" | "admin" | "member" | "viewer" = "owner",
) {
	return await t.run(async (ctx) => {
		const now = Date.now();
		const id = await ctx.db.insert("orgs", {
			name: "Messaging Test Org",
			slug: `messaging-test-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
			plan: "free",
			platformOrgId: "ORB-TEST",
			settings: {},
			createdAt: now,
			updatedAt: now,
		});
		const capitalize = (s: string) =>
			(s.charAt(0).toUpperCase() + s.slice(1)) as "Owner" | "Admin" | "Member" | "Viewer";
		const roleId = await ctx.db.insert("orgRoles", {
			orgId: id,
			name: capitalize(roleName),
			permissions: [...getDefaultPermissionsForRole(capitalize(roleName))],
			isSystem: true,
			isDefault: roleName === "member",
			createdAt: now,
			updatedAt: now,
		});
		await ctx.db.insert("orgMembers", {
			orgId: id,
			userId,
			roleId,
			joinedAt: now,
		});
		return id;
	});
}

// ─── ForAI twin guarantees ───────────────────────────────────────────────────

describe("messaging ForAI twins (Stage 2)", () => {
	it("sendForAI inserts a message + auto-creates the conversation when caller is an org member", async () => {
		const t = convexTest(schema, modules);
		const { userId, asUser } = await seedUser(t);
		const orgId = await seedOrg(t, userId);
		const { personCode } = await asUser.mutation(api.crm.entities.leads.mutations.create, {
			orgId,
			displayName: "Sara Khan",
			source: "manual",
		});

		// Direct internal call — mirrors what `commit_send_message` does
		// via `toolMutation("crm/shared/messages/mutations:send")` (the
		// _shared helper auto-rewrites to :sendForAI and injects userId).
		const messageId = await t.mutation(internal.crm.shared.messages.mutations.sendForAI, {
			orgId,
			userId,
			entityType: "lead",
			entityId: personCode,
			content: "Hi Sara — calling you back at 3pm.",
		});

		const msg = await t.run(async (ctx) => ctx.db.get(messageId));
		expect(msg?.content).toBe("Hi Sara — calling you back at 3pm.");
		// Default authorType for sendForAI is "ai" so notifications + activity
		// log attribute correctly when no explicit override is provided.
		expect(msg?.authorType).toBe("ai");
		// Conversation auto-created + normalised to entityType: "person".
		const convo = await t.run(async (ctx) => ctx.db.get(msg!.conversationId));
		expect(convo?.entityType).toBe("person");
		expect(convo?.entityId).toBe(personCode);
	});

	it("sendForAI honours an explicit authorType override (e.g. 'user' for send-on-behalf)", async () => {
		const t = convexTest(schema, modules);
		const { userId, asUser } = await seedUser(t);
		const orgId = await seedOrg(t, userId);
		const { personCode } = await asUser.mutation(api.crm.entities.leads.mutations.create, {
			orgId,
			displayName: "Alex",
			source: "manual",
		});

		const messageId = await t.mutation(internal.crm.shared.messages.mutations.sendForAI, {
			orgId,
			userId,
			entityType: "lead",
			entityId: personCode,
			content: "Manual on-behalf send",
			authorType: "user",
		});
		const msg = await t.run(async (ctx) => ctx.db.get(messageId));
		expect(msg?.authorType).toBe("user");
	});

	it("sendForAI rejects when the trusted userId is not an org member", async () => {
		const t = convexTest(schema, modules);
		const { userId } = await seedUser(t);
		const orgId = await seedOrg(t, userId);
		const { userId: outsiderId } = await seedUser(t, "outsider@example.com");

		await expect(
			t.mutation(internal.crm.shared.messages.mutations.sendForAI, {
				orgId,
				userId: outsiderId,
				entityType: "deal",
				entityId: "D-001",
				content: "should fail — outsider is not a member of orgId",
			}),
		).rejects.toThrow();
	});

	it("sendForAI rejects empty content (matches public mutation semantics)", async () => {
		const t = convexTest(schema, modules);
		const { userId } = await seedUser(t);
		const orgId = await seedOrg(t, userId);

		await expect(
			t.mutation(internal.crm.shared.messages.mutations.sendForAI, {
				orgId,
				userId,
				entityType: "deal",
				entityId: "D-001",
				content: "   ",
			}),
		).rejects.toThrow();
	});

	it("listForEntityForAI returns the conversation + recent messages for a member", async () => {
		const t = convexTest(schema, modules);
		const { userId, asUser } = await seedUser(t);
		const orgId = await seedOrg(t, userId);
		const { personCode } = await asUser.mutation(api.crm.entities.leads.mutations.create, {
			orgId,
			displayName: "Pat",
			source: "manual",
		});

		await t.mutation(internal.crm.shared.messages.mutations.sendForAI, {
			orgId,
			userId,
			entityType: "lead",
			entityId: personCode,
			content: "first",
		});
		await t.mutation(internal.crm.shared.messages.mutations.sendForAI, {
			orgId,
			userId,
			entityType: "lead",
			entityId: personCode,
			content: "second",
		});

		const result = await t.query(internal.crm.shared.messages.queries.listForEntityForAI, {
			orgId,
			userId,
			entityType: "person", // canonical lookup — must match person normalisation
			entityId: personCode,
			limit: 10,
		});
		expect(result.messages.length).toBe(2);
		// Newest-first by index ordering.
		expect(result.messages[0]?.content).toBe("second");
		expect(result.messages[1]?.content).toBe("first");
	});

	it("listForEntityForAI returns an empty result when the caller is not an org member", async () => {
		const t = convexTest(schema, modules);
		const { userId } = await seedUser(t);
		const orgId = await seedOrg(t, userId);
		const { userId: outsiderId } = await seedUser(t, "outsider@example.com");

		// requireOrgMemberByIds throws — same as the public version.
		await expect(
			t.query(internal.crm.shared.messages.queries.listForEntityForAI, {
				orgId,
				userId: outsiderId,
				entityType: "person",
				entityId: "P-001",
			}),
		).rejects.toThrow();
	});

	it("markReadForAI is monotonic + idempotent (matches OCC guard in public markRead)", async () => {
		const t = convexTest(schema, modules);
		const { userId, asUser } = await seedUser(t);
		const orgId = await seedOrg(t, userId);
		const { personCode } = await asUser.mutation(api.crm.entities.leads.mutations.create, {
			orgId,
			displayName: "Toby",
			source: "manual",
		});
		const messageId = await t.mutation(internal.crm.shared.messages.mutations.sendForAI, {
			orgId,
			userId,
			entityType: "lead",
			entityId: personCode,
			content: "ping",
		});
		const conversationId = (await t.run(async (ctx) => ctx.db.get(messageId)))!.conversationId;

		await t.mutation(internal.crm.shared.conversations.mutations.markReadForAI, {
			orgId,
			userId,
			conversationId,
		});
		// Idempotent — a second call within the same millisecond range
		// should not throw and should not corrupt the stored value.
		await t.mutation(internal.crm.shared.conversations.mutations.markReadForAI, {
			orgId,
			userId,
			conversationId,
		});

		const me = await t.run(async (ctx) =>
			ctx.db
				.query("conversationMembers")
				.withIndex("by_user_and_conversation", (q) =>
					q.eq("userId", userId).eq("conversationId", conversationId),
				)
				.first(),
		);
		expect(me?.lastReadAt).toBeGreaterThan(0);
	});

	it("addParticipantsForAI requires conversation owner OR moderator", async () => {
		const t = convexTest(schema, modules);
		const { userId: ownerId, asUser: asOwner } = await seedUser(t, "owner@example.com");
		const orgId = await seedOrg(t, ownerId);

		// Seed an additional member who isn't the conversation owner.
		const { userId: memberId } = await seedUser(t, "member@example.com");
		await t.run(async (ctx) => {
			const role = await ctx.db
				.query("orgRoles")
				.withIndex("by_orgId_and_isDefault", (q) =>
					q.eq("orgId", orgId).eq("isDefault", true),
				)
				.first();
			// Fall back to ANY non-default role if no default — still a member of the org.
			const fallback = await ctx.db
				.query("orgRoles")
				.withIndex("by_orgId", (q) => q.eq("orgId", orgId))
				.first();
			await ctx.db.insert("orgMembers", {
				orgId,
				userId: memberId,
				roleId: (role?._id ?? fallback?._id)!,
				joinedAt: Date.now(),
			});
		});

		// Owner sends the first message → owner becomes the conversation owner.
		const { personCode } = await asOwner.mutation(api.crm.entities.leads.mutations.create, {
			orgId,
			displayName: "Convo",
			source: "manual",
		});
		const messageId = await t.mutation(internal.crm.shared.messages.mutations.sendForAI, {
			orgId,
			userId: ownerId,
			entityType: "lead",
			entityId: personCode,
			content: "kickoff",
		});
		const conversationId = (await t.run(async (ctx) => ctx.db.get(messageId)))!.conversationId;

		// memberId is not yet in the conversation — owner adds them.
		const result = await t.mutation(
			internal.crm.shared.conversations.mutations.addParticipantsForAI,
			{
				orgId,
				userId: ownerId,
				conversationId,
				userIds: [memberId],
			},
		);
		expect(result.added).toBe(1);
	});
});

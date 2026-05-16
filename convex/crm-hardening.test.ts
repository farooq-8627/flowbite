/// <reference types="vite/client" />
/**
 * Tests for the new shared CRM modules: messages, files, fieldValues,
 * companies cleanup, reminders permission gates. Covers the security fixes
 * landed in the Stage 4 audit pass (2026-05-16).
 *
 * Runs against the same convex-test harness as the other suites — schema,
 * indexes, and SSOT permission catalog are exercised end-to-end.
 */

import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api } from "./_generated/api";
import { getDefaultPermissionsForRole } from "./_shared/permissions/derive";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

// ─── Common seeders ──────────────────────────────────────────────────────────

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
	settings: Record<string, unknown> = {},
) {
	const orgId = await t.run(async (ctx) => {
		const now = Date.now();
		const id = await ctx.db.insert("orgs", {
			name: "Test Org",
			slug: `test-org-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
			plan: "free",
			platformOrgId: "ORB-TEST",
			settings,
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
	return orgId;
}

async function seedAdditionalMember(
	t: ReturnType<typeof convexTest>,
	orgId: string,
	userId: string,
	roleName: "owner" | "admin" | "member" | "viewer",
) {
	await t.run(async (ctx) => {
		const now = Date.now();
		const capitalize = (s: string) =>
			(s.charAt(0).toUpperCase() + s.slice(1)) as "Owner" | "Admin" | "Member" | "Viewer";
		const roleId = await ctx.db.insert("orgRoles", {
			orgId,
			name: capitalize(roleName),
			permissions: [...getDefaultPermissionsForRole(capitalize(roleName))],
			isSystem: true,
			isDefault: roleName === "member",
			createdAt: now,
			updatedAt: now,
		});
		await ctx.db.insert("orgMembers", {
			orgId,
			userId,
			roleId,
			joinedAt: now,
		});
	});
}

// ─── messages.send (production conversation-aware fan-out) ──────────────────

describe("messages.send", () => {
	it("inserts a message, creates a conversation, and logs activity", async () => {
		const t = convexTest(schema, modules);
		const { userId, asUser } = await seedUser(t);
		const orgId = await seedOrg(t, userId);
		const { personCode } = await asUser.mutation(api.crm.entities.leads.mutations.create, {
			orgId,
			displayName: "Lead",
			source: "manual",
		});

		const messageId = await asUser.mutation(api.crm.shared.messages.mutations.send, {
			orgId,
			entityType: "lead",
			entityId: personCode,
			content: "Hello from a test",
		});

		const msg = await t.run(async (ctx) => ctx.db.get(messageId));
		expect(msg?.content).toBe("Hello from a test");
		expect(msg?.conversationId).toBeTruthy();

		// Conversation was auto-created and the sender was auto-added as owner.
		const convo = await t.run(async (ctx) => ctx.db.get(msg!.conversationId));
		expect(convo?.entityType).toBe("lead");
		expect(convo?.entityId).toBe(personCode);

		const memberships = await t.run(async (ctx) =>
			ctx.db
				.query("conversationMembers")
				.withIndex("by_conversation", (q) => q.eq("conversationId", msg!.conversationId))
				.collect(),
		);
		expect(memberships.some((m) => m.userId === userId && m.role === "owner")).toBe(true);

		const logs = await t.run(async (ctx) =>
			ctx.db
				.query("activityLogs")
				.withIndex("by_entityType_and_entityId", (q) =>
					q.eq("entityType", "lead").eq("entityId", personCode),
				)
				.collect(),
		);
		expect(logs.some((l) => l.action === "message_sent")).toBe(true);
	});

	it("rejects empty content", async () => {
		const t = convexTest(schema, modules);
		const { userId, asUser } = await seedUser(t);
		const orgId = await seedOrg(t, userId);
		await expect(
			asUser.mutation(api.crm.shared.messages.mutations.send, {
				orgId,
				entityType: "deal",
				entityId: "D-001",
				content: "   ",
			}),
		).rejects.toThrow();
	});

	it("blocks viewer from sending", async () => {
		const t = convexTest(schema, modules);
		const { userId } = await seedUser(t);
		const orgId = await seedOrg(t, userId);
		const { userId: viewerId, asUser: asViewer } = await seedUser(t, "viewer@example.com");
		await seedAdditionalMember(t, orgId, viewerId, "viewer");

		await expect(
			asViewer.mutation(api.crm.shared.messages.mutations.send, {
				orgId,
				entityType: "lead",
				entityId: "P-001",
				content: "should fail",
			}),
		).rejects.toThrow();
	});

	it("idempotency: same idempotencyKey returns same messageId", async () => {
		const t = convexTest(schema, modules);
		const { userId, asUser } = await seedUser(t);
		const orgId = await seedOrg(t, userId);
		const { personCode } = await asUser.mutation(api.crm.entities.leads.mutations.create, {
			orgId,
			displayName: "Lead",
			source: "manual",
		});

		const id1 = await asUser.mutation(api.crm.shared.messages.mutations.send, {
			orgId,
			entityType: "lead",
			entityId: personCode,
			content: "first",
			idempotencyKey: "client-uuid-abc",
		});
		const id2 = await asUser.mutation(api.crm.shared.messages.mutations.send, {
			orgId,
			entityType: "lead",
			entityId: personCode,
			content: "first",
			idempotencyKey: "client-uuid-abc",
		});
		expect(id1).toBe(id2);
	});

	it("multi-participant fan-out: assignee is auto-added and notified", async () => {
		const t = convexTest(schema, modules);
		const { userId, asUser } = await seedUser(t);
		const orgId = await seedOrg(t, userId);
		const { userId: assigneeId } = await seedUser(t, "assignee@example.com");
		await seedAdditionalMember(t, orgId, assigneeId, "member");

		const { personCode } = await asUser.mutation(api.crm.entities.leads.mutations.create, {
			orgId,
			displayName: "Lead",
			source: "manual",
			assignedTo: assigneeId,
		});

		await asUser.mutation(api.crm.shared.messages.mutations.send, {
			orgId,
			entityType: "lead",
			entityId: personCode,
			content: "hi",
		});

		// Assignee should be a participant on the auto-created conversation.
		const memberships = await t.run(async (ctx) =>
			ctx.db.query("conversationMembers").collect(),
		);
		expect(memberships.some((m) => m.userId === assigneeId)).toBe(true);

		// Assignee should have a message.received notification.
		const notifs = await t.run(async (ctx) =>
			ctx.db
				.query("notifications")
				.withIndex("by_orgId_and_userId", (q) =>
					q.eq("orgId", orgId).eq("userId", assigneeId),
				)
				.collect(),
		);
		expect(notifs.some((n) => n.type === "message.received")).toBe(true);
	});

	it("@mention notifies even when notificationLevel=mentions", async () => {
		const t = convexTest(schema, modules);
		const { userId, asUser } = await seedUser(t);
		const orgId = await seedOrg(t, userId);
		const { userId: bobId } = await seedUser(t, "bob@example.com");
		await seedAdditionalMember(t, orgId, bobId, "member");

		const { personCode } = await asUser.mutation(api.crm.entities.leads.mutations.create, {
			orgId,
			displayName: "Lead",
			source: "manual",
		});

		await asUser.mutation(api.crm.shared.messages.mutations.send, {
			orgId,
			entityType: "lead",
			entityId: personCode,
			content: "Hey @bob, look at this",
			mentions: [bobId],
		});

		// Bob is now a participant via mention auto-join.
		const memberships = await t.run(async (ctx) =>
			ctx.db
				.query("conversationMembers")
				.withIndex("by_org_and_user", (q) => q.eq("orgId", orgId).eq("userId", bobId))
				.collect(),
		);
		expect(memberships.length).toBe(1);
		expect(memberships[0].joinReason).toBe("mention");

		const notifs = await t.run(async (ctx) =>
			ctx.db
				.query("notifications")
				.withIndex("by_orgId_and_userId", (q) => q.eq("orgId", orgId).eq("userId", bobId))
				.collect(),
		);
		expect(notifs.some((n) => n.type === "message.mention")).toBe(true);
	});
});

describe("conversations.markRead", () => {
	it("updates the per-user lastReadAt", async () => {
		const t = convexTest(schema, modules);
		const { userId, asUser } = await seedUser(t);
		const orgId = await seedOrg(t, userId);
		const { personCode } = await asUser.mutation(api.crm.entities.leads.mutations.create, {
			orgId,
			displayName: "Lead",
			source: "manual",
		});

		const messageId = await asUser.mutation(api.crm.shared.messages.mutations.send, {
			orgId,
			entityType: "lead",
			entityId: personCode,
			content: "Hi",
		});
		const msg = await t.run(async (ctx) => ctx.db.get(messageId));
		await asUser.mutation(api.crm.shared.conversations.mutations.markRead, {
			orgId,
			conversationId: msg!.conversationId,
		});
		const me = await t.run(async (ctx) =>
			ctx.db
				.query("conversationMembers")
				.withIndex("by_user_and_conversation", (q) =>
					q.eq("userId", userId).eq("conversationId", msg!.conversationId),
				)
				.first(),
		);
		expect(me?.lastReadAt).toBeGreaterThan(0);
	});
});

// ─── files.record validation ─────────────────────────────────────────────────

describe("files.record", () => {
	it("rejects unknown scope", async () => {
		const t = convexTest(schema, modules);
		const { userId, asUser } = await seedUser(t);
		const orgId = await seedOrg(t, userId);

		// Create a real storage entry so the v.id("_storage") validator passes
		// — we want to hit our own scope validation, not the arg validator.
		const storageId = await t.run(async (ctx) =>
			ctx.storage.store(new Blob(["test"], { type: "image/png" })),
		);

		await expect(
			asUser.mutation(api.files.mutations.record, {
				orgId,
				storageId,
				scope: "made_up_scope",
				scopeId: "anything",
				name: "x.png",
				size: 100,
				mimeType: "image/png",
			}),
		).rejects.toThrow();
	});

	it("rejects file exceeding org max size", async () => {
		const t = convexTest(schema, modules);
		const { userId, asUser } = await seedUser(t);
		const orgId = await seedOrg(t, userId, "owner", {
			fileUpload: { maxSizeMb: 1 }, // 1 MB cap
		});
		const storageId = await t.run(async (ctx) =>
			ctx.storage.store(new Blob(["test"], { type: "application/zip" })),
		);

		await expect(
			asUser.mutation(api.files.mutations.record, {
				orgId,
				storageId,
				scope: "org",
				scopeId: orgId,
				name: "huge.zip",
				size: 5 * 1024 * 1024, // 5 MB
				mimeType: "application/zip",
			}),
		).rejects.toThrow(/limit/i);
	});

	it("rejects mime type outside org-allowed categories", async () => {
		const t = convexTest(schema, modules);
		const { userId, asUser } = await seedUser(t);
		const orgId = await seedOrg(t, userId, "owner", {
			fileUpload: { allowedMimeCategories: ["image"] },
		});
		const storageId = await t.run(async (ctx) =>
			ctx.storage.store(new Blob(["test"], { type: "application/pdf" })),
		);

		await expect(
			asUser.mutation(api.files.mutations.record, {
				orgId,
				storageId,
				scope: "org",
				scopeId: orgId,
				name: "doc.pdf",
				size: 1024,
				mimeType: "application/pdf",
			}),
		).rejects.toThrow(/not allowed/i);
	});

	it("rejects scope=lead with non-existent personCode", async () => {
		const t = convexTest(schema, modules);
		const { userId, asUser } = await seedUser(t);
		const orgId = await seedOrg(t, userId);
		const storageId = await t.run(async (ctx) =>
			ctx.storage.store(new Blob(["test"], { type: "image/png" })),
		);

		await expect(
			asUser.mutation(api.files.mutations.record, {
				orgId,
				storageId,
				scope: "lead",
				scopeId: "P-DOES-NOT-EXIST",
				name: "x.png",
				size: 100,
				mimeType: "image/png",
			}),
		).rejects.toThrow();
	});

	it("blocks viewer from uploading (no files.upload permission)", async () => {
		const t = convexTest(schema, modules);
		const { userId } = await seedUser(t);
		const orgId = await seedOrg(t, userId);
		const { userId: viewerId, asUser: asViewer } = await seedUser(t, "viewer@example.com");
		await seedAdditionalMember(t, orgId, viewerId, "viewer");
		const storageId = await t.run(async (ctx) =>
			ctx.storage.store(new Blob(["test"], { type: "image/png" })),
		);

		await expect(
			asViewer.mutation(api.files.mutations.record, {
				orgId,
				storageId,
				scope: "org",
				scopeId: orgId,
				name: "x.png",
				size: 100,
				mimeType: "image/png",
			}),
		).rejects.toThrow();
	});
});

// ─── companies.softDelete cleans up companyMembers ───────────────────────────

describe("companies.softDelete", () => {
	it("removes companyMembers join rows when company is soft-deleted", async () => {
		const t = convexTest(schema, modules);
		const { userId, asUser } = await seedUser(t);
		const orgId = await seedOrg(t, userId);

		const { companyId } = await asUser.mutation(api.crm.entities.companies.mutations.create, {
			orgId,
			name: "Acme",
		});

		// Attach two people via the canonical addPerson path.
		await asUser.mutation(api.crm.entities.companies.mutations.addPerson, {
			orgId,
			companyId,
			personCode: "P-001",
		});
		await asUser.mutation(api.crm.entities.companies.mutations.addPerson, {
			orgId,
			companyId,
			personCode: "P-002",
		});

		const beforeLinks = await t.run(async (ctx) =>
			ctx.db
				.query("companyMembers")
				.withIndex("by_org_and_company", (q) =>
					q.eq("orgId", orgId).eq("companyId", companyId),
				)
				.collect(),
		);
		expect(beforeLinks.length).toBe(2);

		await asUser.mutation(api.crm.entities.companies.mutations.softDelete, {
			orgId,
			companyId,
		});

		const afterLinks = await t.run(async (ctx) =>
			ctx.db
				.query("companyMembers")
				.withIndex("by_org_and_company", (q) =>
					q.eq("orgId", orgId).eq("companyId", companyId),
				)
				.collect(),
		);
		expect(afterLinks.length).toBe(0);
	});
});

// ─── deals.closeAsDone fires the deal_won notification ───────────────────────

describe("deals.closeAsDone", () => {
	it("notifies the assignee on positive close", async () => {
		const t = convexTest(schema, modules);
		const { userId, asUser } = await seedUser(t);
		const orgId = await seedOrg(t, userId);
		const { userId: assigneeId } = await seedUser(t, "assignee@example.com");
		await seedAdditionalMember(t, orgId, assigneeId, "member");

		const pipelineId = await t.run(async (ctx) => {
			const now = Date.now();
			return ctx.db.insert("pipelines", {
				orgId,
				name: "Sales",
				entityType: "deal",
				isDefault: true,
				stages: [
					{ id: "stage_new", name: "New", order: 0, color: "#3b82f6" },
					{
						id: "stage_won",
						name: "Won",
						order: 1,
						color: "#22c55e",
						isFinal: true,
						finalType: "positive",
					},
				],
				createdAt: now,
				updatedAt: now,
			});
		});

		const { dealId } = await asUser.mutation(api.crm.entities.deals.mutations.create, {
			orgId,
			title: "Big",
			pipelineId,
			currentStageId: "stage_new",
			source: "manual",
			assignedTo: assigneeId,
		});

		await asUser.mutation(api.crm.entities.deals.mutations.closeAsDone, {
			orgId,
			dealId,
			finalType: "positive",
		});

		const notifs = await t.run(async (ctx) =>
			ctx.db
				.query("notifications")
				.withIndex("by_orgId_and_userId", (q) =>
					q.eq("orgId", orgId).eq("userId", assigneeId),
				)
				.collect(),
		);
		expect(notifs.some((n) => n.type === "deal.won")).toBe(true);
	});
});

// ─── fieldValues.set permission gate ─────────────────────────────────────────

describe("fieldValues.set permission gate", () => {
	it("blocks viewer from writing field values on a deal", async () => {
		const t = convexTest(schema, modules);
		const { userId } = await seedUser(t);
		const orgId = await seedOrg(t, userId);
		const { userId: viewerId, asUser: asViewer } = await seedUser(t, "viewer@example.com");
		await seedAdditionalMember(t, orgId, viewerId, "viewer");

		const fieldId = await t.run(async (ctx) => {
			const now = Date.now();
			return ctx.db.insert("fieldDefinitions", {
				orgId,
				entityType: "deal",
				name: "noteField",
				label: "Note",
				type: "text",
				required: false,
				order: 0,
				createdAt: now,
				updatedAt: now,
			});
		});

		await expect(
			asViewer.mutation(api.crm.fields.fieldValues.mutations.set, {
				orgId,
				entityType: "deal",
				entityId: "D-001",
				fieldId,
				value: "anything",
			}),
		).rejects.toThrow();
	});
});

// ─── reminders permission gates (non-assignee, non-manager → forbidden) ──────

describe("reminders.complete", () => {
	it("blocks a non-assignee viewer from completing", async () => {
		const t = convexTest(schema, modules);
		const { userId, asUser } = await seedUser(t);
		const orgId = await seedOrg(t, userId);
		const { userId: viewerId, asUser: asViewer } = await seedUser(t, "viewer@example.com");
		await seedAdditionalMember(t, orgId, viewerId, "viewer");

		// Create reminder assigned to the org owner (asUser).
		const { reminderId } = await asUser.mutation(api.crm.shared.reminders.mutations.create, {
			orgId,
			personCode: "P-001",
			entityType: "lead",
			entityId: "P-001",
			title: "Follow up",
			dueAt: Date.now() + 86_400_000,
			assignedTo: userId,
			source: "manual",
		});

		// Viewer (no reminders.manage, no assignment) cannot complete.
		await expect(
			asViewer.mutation(api.crm.shared.reminders.mutations.complete, {
				orgId,
				reminderId,
			}),
		).rejects.toThrow();
	});

	it("allows a Member with reminders.manage to complete on behalf of the assignee", async () => {
		// Member role in the SSOT catalog has `reminders.manage` — this is the
		// "team admin" path for closing reminders other team members own.
		const t = convexTest(schema, modules);
		const { userId, asUser } = await seedUser(t);
		const orgId = await seedOrg(t, userId);
		const { userId: assigneeId } = await seedUser(t, "assignee@example.com");
		await seedAdditionalMember(t, orgId, assigneeId, "member");

		const { reminderId } = await asUser.mutation(api.crm.shared.reminders.mutations.create, {
			orgId,
			personCode: "P-001",
			entityType: "lead",
			entityId: "P-001",
			title: "Follow up",
			dueAt: Date.now() + 86_400_000,
			assignedTo: assigneeId,
			source: "manual",
		});

		// Owner (different from assignee) can still complete via reminders.manage.
		await asUser.mutation(api.crm.shared.reminders.mutations.complete, {
			orgId,
			reminderId,
		});
		const reminder = await t.run(async (ctx) => ctx.db.get(reminderId));
		expect(reminder?.status).toBe("completed");
	});

	it("allows the assignee to complete their own reminder", async () => {
		const t = convexTest(schema, modules);
		const { userId, asUser } = await seedUser(t);
		const orgId = await seedOrg(t, userId);

		const { reminderId } = await asUser.mutation(api.crm.shared.reminders.mutations.create, {
			orgId,
			personCode: "P-001",
			entityType: "lead",
			entityId: "P-001",
			title: "Follow up",
			dueAt: Date.now() + 86_400_000,
			assignedTo: userId,
			source: "manual",
		});

		await asUser.mutation(api.crm.shared.reminders.mutations.complete, {
			orgId,
			reminderId,
		});

		const reminder = await t.run(async (ctx) => ctx.db.get(reminderId));
		expect(reminder?.status).toBe("completed");
	});
});

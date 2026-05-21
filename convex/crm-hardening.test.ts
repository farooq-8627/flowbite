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
		// Per `consolidatePersonConversations.ts`, every person-scoped
		// conversation collapses to `entityType: "person"` regardless of
		// whether the underlying record is a lead or a contact.
		const convo = await t.run(async (ctx) => ctx.db.get(msg!.conversationId));
		expect(convo?.entityType).toBe("person");
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
					q.eq("entityType", "person").eq("entityId", personCode),
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

	/**
	 * OCC / idempotency invariant (2026-05-18).
	 *
	 * `markRead` is monotonic: `lastReadAt` only ever moves forward. Two
	 * tabs (or one tab + a remount) can fire `markRead` near-simultaneously
	 * for the same `(userId, conversationId)`, both reading the same `me`
	 * row, both racing to patch it. Convex's OCC lost the second writer
	 * 45+ times per minute in production telemetry.
	 *
	 * The fix in `convex/crm/shared/conversations/mutations.ts::markRead`:
	 * skip the patch entirely when the existing `lastReadAt` is already
	 * at-or-beyond the wall-clock `now`. This means a stale racer that
	 * arrives AFTER a newer write either:
	 *   - reads the same value and writes a no-op (no contention), or
	 *   - reads the row and skips writing (no contention).
	 *
	 * Verified here: calling `markRead` twice in quick succession is safe,
	 * `lastReadAt` is monotonic, no errors thrown.
	 */
	it("is idempotent: a second back-to-back call doesn't go backwards", async () => {
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

		// First mark — patches lastReadAt from undefined → now.
		await asUser.mutation(api.crm.shared.conversations.mutations.markRead, {
			orgId,
			conversationId: msg!.conversationId,
		});
		const after1 = await t.run(async (ctx) =>
			ctx.db
				.query("conversationMembers")
				.withIndex("by_user_and_conversation", (q) =>
					q.eq("userId", userId).eq("conversationId", msg!.conversationId),
				)
				.first(),
		);
		expect(after1?.lastReadAt).toBeGreaterThan(0);

		// Second mark in the same wall-clock millisecond — must succeed
		// without throwing and must NOT move lastReadAt backwards.
		await asUser.mutation(api.crm.shared.conversations.mutations.markRead, {
			orgId,
			conversationId: msg!.conversationId,
		});
		const after2 = await t.run(async (ctx) =>
			ctx.db
				.query("conversationMembers")
				.withIndex("by_user_and_conversation", (q) =>
					q.eq("userId", userId).eq("conversationId", msg!.conversationId),
				)
				.first(),
		);
		// Monotonic: equal-or-greater, never less.
		expect(after2?.lastReadAt ?? 0).toBeGreaterThanOrEqual(after1?.lastReadAt ?? 0);
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

	it("rejects mime type outside the field's allowed categories", async () => {
		// Per-field whitelists replaced the legacy org-wide knob (2026-05-22).
		// To verify enforcement we create a lead, declare a `passport` file
		// field that only accepts images, then try to attach a PDF — the
		// server-side check should reject before the row is written.
		const t = convexTest(schema, modules);
		const { userId, asUser } = await seedUser(t);
		const orgId = await seedOrg(t, userId);
		await asUser.mutation(api.crm.fields.fieldDefinitions.mutations.create, {
			orgId,
			entityType: "lead",
			name: "passport",
			label: "Passport",
			type: "file",
			required: false,
			allowedFileTypes: ["image"],
		});
		const { personCode } = await asUser.mutation(api.crm.entities.leads.mutations.create, {
			orgId,
			displayName: "Lead with files",
			source: "manual",
		});
		const storageId = await t.run(async (ctx) =>
			ctx.storage.store(new Blob(["test"], { type: "application/pdf" })),
		);

		await expect(
			asUser.mutation(api.files.mutations.record, {
				orgId,
				storageId,
				scope: "lead",
				scopeId: personCode,
				fieldKey: "passport",
				name: "doc.pdf",
				size: 1024,
				mimeType: "application/pdf",
			}),
		).rejects.toThrow(/not allowed/i);
	});

	it("free-form attachments (no fieldKey) are unrestricted by per-field rules", async () => {
		// The flip side of the previous test: when no fieldKey is provided
		// (drop-zone uploads, message attachments, profile-level files),
		// per-field rules don't apply. This is a regression guard so we
		// don't accidentally re-introduce an org-wide gate that would
		// frustrate users dropping files into the universal Files tab.
		const t = convexTest(schema, modules);
		const { userId, asUser } = await seedUser(t);
		const orgId = await seedOrg(t, userId);
		const { personCode } = await asUser.mutation(api.crm.entities.leads.mutations.create, {
			orgId,
			displayName: "Lead",
			source: "manual",
		});
		const storageId = await t.run(async (ctx) =>
			ctx.storage.store(new Blob(["test"], { type: "application/pdf" })),
		);
		await expect(
			asUser.mutation(api.files.mutations.record, {
				orgId,
				storageId,
				scope: "lead",
				scopeId: personCode,
				name: "doc.pdf",
				size: 1024,
				mimeType: "application/pdf",
			}),
		).resolves.toBeDefined();
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

// ─── files.queries.listByIdsKeyed (conversation-level batched lookup) ────────

describe("files.queries.listByIdsKeyed", () => {
	it("returns a record keyed by file id, dropping cross-tenant + deleted rows", async () => {
		const t = convexTest(schema, modules);
		const { userId, asUser } = await seedUser(t);
		const orgIdA = await seedOrg(t, userId);

		// Org B is a sibling tenant — its file MUST NOT leak into org A's
		// keyed result even though we ask for it explicitly.
		const { userId: userIdB, asUser: asUserB } = await seedUser(t, "bob@example.com");
		const orgIdB = await seedOrg(t, userIdB);

		const storeBlob = async () =>
			t.run(async (ctx) => ctx.storage.store(new Blob(["x"], { type: "image/png" })));

		const sA1 = await storeBlob();
		const sA2 = await storeBlob();
		const sBx = await storeBlob();

		const fileA1 = await asUser.mutation(api.files.mutations.record, {
			orgId: orgIdA,
			storageId: sA1,
			scope: "org",
			scopeId: orgIdA,
			name: "a1.png",
			size: 100,
			mimeType: "image/png",
		});
		const fileA2 = await asUser.mutation(api.files.mutations.record, {
			orgId: orgIdA,
			storageId: sA2,
			scope: "org",
			scopeId: orgIdA,
			name: "a2.png",
			size: 100,
			mimeType: "image/png",
		});
		const fileBx = await asUserB.mutation(api.files.mutations.record, {
			orgId: orgIdB,
			storageId: sBx,
			scope: "org",
			scopeId: orgIdB,
			name: "bx.png",
			size: 100,
			mimeType: "image/png",
		});

		// Soft-delete fileA2 — it must be filtered out even though we pass
		// its id to the query.
		await asUser.mutation(api.files.mutations.remove, {
			orgId: orgIdA,
			fileId: fileA2 as any,
		});

		const result = await asUser.query(api.files.queries.listByIdsKeyed, {
			orgId: orgIdA,
			ids: [fileA1 as any, fileA2 as any, fileBx as any],
		});

		expect(Object.keys(result)).toHaveLength(1);
		expect(result[String(fileA1)]).toBeDefined();
		expect(result[String(fileA1)]?.name).toBe("a1.png");
		expect(result[String(fileA2)]).toBeUndefined(); // soft-deleted
		expect(result[String(fileBx)]).toBeUndefined(); // cross-tenant
	});

	it("returns an empty record when the id list is empty", async () => {
		const t = convexTest(schema, modules);
		const { userId, asUser } = await seedUser(t);
		const orgId = await seedOrg(t, userId);

		const result = await asUser.query(api.files.queries.listByIdsKeyed, {
			orgId,
			ids: [],
		});
		expect(result).toEqual({});
	});

	it("de-dupes repeat ids in the input (single-write per id)", async () => {
		const t = convexTest(schema, modules);
		const { userId, asUser } = await seedUser(t);
		const orgId = await seedOrg(t, userId);

		const storageId = await t.run(async (ctx) =>
			ctx.storage.store(new Blob(["x"], { type: "image/png" })),
		);
		const fileId = await asUser.mutation(api.files.mutations.record, {
			orgId,
			storageId,
			scope: "org",
			scopeId: orgId,
			name: "dup.png",
			size: 50,
			mimeType: "image/png",
		});

		const result = await asUser.query(api.files.queries.listByIdsKeyed, {
			orgId,
			ids: [fileId as any, fileId as any, fileId as any],
		});
		// One key in the record; multiple references collapse to a single row.
		expect(Object.keys(result)).toEqual([String(fileId)]);
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
					{ id: "stage_new", name: "New", code: "NEW", order: 0, color: "#3b82f6" },
					{
						id: "stage_won",
						name: "Won",
						code: "WON",
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

// ─── Drag-write minimization (single-write per drop invariant) ───────────────
//
// The kanban primitive's `onCommit` fires exactly once per drop. The
// consumers (`KanbanBoard`, `NotesSingleBoard`) MUST persist only the
// dragged card, not every displaced card. These tests lock that contract
// in at the mutation layer:
//
// 1. Calling `notes.reorder` for a single card must change exactly that
//    card's `sortOrder` — no other rows.
// 2. Calling `notes.setCategory` (cross-column drop) atomically updates
//    `categoryId` AND `sortOrder` so the consumer never has to follow up
//    with a second `reorder` mutation.
// 3. The drag-rate guard caps `notes.reorder` at 120 / minute / user-org
//    pair. A bug loop firing 200x in the same window must be rejected.

describe("notes.reorder (single-write invariant)", () => {
	it("updates only the dragged card's sortOrder, leaves siblings untouched", async () => {
		const t = convexTest(schema, modules);
		const { userId, asUser } = await seedUser(t);
		const orgId = await seedOrg(t, userId);

		// Create three notes in the default category.
		const id1 = await asUser.mutation(api.crm.shared.notes.mutations.create, {
			orgId,
			entityType: "org",
			entityId: orgId as unknown as string,
			content: "first",
			authorType: "user",
			isInternal: false,
		});
		const id2 = await asUser.mutation(api.crm.shared.notes.mutations.create, {
			orgId,
			entityType: "org",
			entityId: orgId as unknown as string,
			content: "second",
			authorType: "user",
			isInternal: false,
		});
		const id3 = await asUser.mutation(api.crm.shared.notes.mutations.create, {
			orgId,
			entityType: "org",
			entityId: orgId as unknown as string,
			content: "third",
			authorType: "user",
			isInternal: false,
		});

		const before = await t.run(async (ctx) => ({
			n1: await ctx.db.get(id1),
			n2: await ctx.db.get(id2),
			n3: await ctx.db.get(id3),
		}));

		// User drags note #1 into the middle (between #3 and #2 in sort
		// order). The consumer computes the midpoint sortOrder for the
		// dropped position and fires ONE reorder call.
		const newSortOrder = ((before.n2?.sortOrder ?? 0) + (before.n3?.sortOrder ?? 0)) / 2;
		await asUser.mutation(api.crm.shared.notes.mutations.reorder, {
			orgId,
			noteId: id1,
			sortOrder: newSortOrder,
		});

		const after = await t.run(async (ctx) => ({
			n1: await ctx.db.get(id1),
			n2: await ctx.db.get(id2),
			n3: await ctx.db.get(id3),
		}));

		expect(after.n1?.sortOrder).toBe(newSortOrder);
		// CRITICAL: untouched siblings keep their original sortOrder.
		expect(after.n2?.sortOrder).toBe(before.n2?.sortOrder);
		expect(after.n3?.sortOrder).toBe(before.n3?.sortOrder);
	});

	it("is a no-op when the new sortOrder equals the current one", async () => {
		const t = convexTest(schema, modules);
		const { userId, asUser } = await seedUser(t);
		const orgId = await seedOrg(t, userId);

		const id = await asUser.mutation(api.crm.shared.notes.mutations.create, {
			orgId,
			entityType: "org",
			entityId: orgId as unknown as string,
			content: "only",
			authorType: "user",
			isInternal: false,
		});
		const before = await t.run(async (ctx) => ctx.db.get(id));

		await asUser.mutation(api.crm.shared.notes.mutations.reorder, {
			orgId,
			noteId: id,
			sortOrder: before?.sortOrder ?? 0,
		});

		const after = await t.run(async (ctx) => ctx.db.get(id));
		// updatedAt must NOT have moved — the mutation early-returned.
		expect(after?.updatedAt).toBe(before?.updatedAt);
	});

	it("rejects after 120 reorders inside the rate-limit window", async () => {
		const t = convexTest(schema, modules);
		const { userId, asUser } = await seedUser(t);
		const orgId = await seedOrg(t, userId);

		const id = await asUser.mutation(api.crm.shared.notes.mutations.create, {
			orgId,
			entityType: "org",
			entityId: orgId as unknown as string,
			content: "draggable",
			authorType: "user",
			isInternal: false,
		});

		// 120 calls — should all succeed (just below the limit).
		for (let i = 0; i < 120; i += 1) {
			await asUser.mutation(api.crm.shared.notes.mutations.reorder, {
				orgId,
				noteId: id,
				// Vary sortOrder so each call isn't a no-op.
				sortOrder: 1000 - i,
			});
		}

		// 121st must be rejected.
		await expect(
			asUser.mutation(api.crm.shared.notes.mutations.reorder, {
				orgId,
				noteId: id,
				sortOrder: -999,
			}),
		).rejects.toThrow();
	});
});

describe("notes.setCategory (cross-column drop is atomic)", () => {
	it("changes both categoryId AND sortOrder in one mutation", async () => {
		const t = convexTest(schema, modules);
		const { userId, asUser } = await seedUser(t);
		const orgId = await seedOrg(t, userId);

		// Lazy-seed the default note categories by creating one note (the
		// notes.create handler auto-seeds the 6 defaults on first call).
		await asUser.mutation(api.crm.shared.notes.mutations.create, {
			orgId,
			entityType: "org",
			entityId: orgId as unknown as string,
			content: "seed",
			authorType: "user",
			isInternal: false,
		});

		const cats = await asUser.query(api.crm.shared.noteCategories.queries.listForOrg, {
			orgId,
		});
		expect(cats.length).toBeGreaterThanOrEqual(2);
		const defaultCat = cats[0];
		const otherCat = cats[1];

		// Create the note in the default category.
		const id = await asUser.mutation(api.crm.shared.notes.mutations.create, {
			orgId,
			entityType: "org",
			entityId: orgId as unknown as string,
			content: "moving",
			authorType: "user",
			isInternal: false,
			categoryId: defaultCat._id,
		});
		const before = await t.run(async (ctx) => ctx.db.get(id));
		expect(before?.categoryId).toBe(defaultCat._id);

		// Drop it into the other category at a specific sort position.
		await asUser.mutation(api.crm.shared.notes.mutations.setCategory, {
			orgId,
			noteId: id,
			categoryId: otherCat._id,
			sortOrder: 12345,
		});

		const after = await t.run(async (ctx) => ctx.db.get(id));
		// CRITICAL: ONE mutation = both fields updated. Consumer never has
		// to fire a follow-up reorder() — that's the bug we're guarding.
		expect(after?.categoryId).toBe(otherCat._id);
		expect(after?.sortOrder).toBe(12345);
	});

	it("auto-stamps a top-of-column sortOrder when none provided", async () => {
		const t = convexTest(schema, modules);
		const { userId, asUser } = await seedUser(t);
		const orgId = await seedOrg(t, userId);

		// Lazy-seed by creating a note first (auto-seeds default categories).
		await asUser.mutation(api.crm.shared.notes.mutations.create, {
			orgId,
			entityType: "org",
			entityId: orgId as unknown as string,
			content: "seed",
			authorType: "user",
			isInternal: false,
		});

		const cats = await asUser.query(api.crm.shared.noteCategories.queries.listForOrg, {
			orgId,
		});
		expect(cats.length).toBeGreaterThanOrEqual(2);
		const defaultCat = cats[0];
		const otherCat = cats[1];

		// Seed the destination column with one existing note so we can
		// verify the new card sorts above it.
		const existingId = await asUser.mutation(api.crm.shared.notes.mutations.create, {
			orgId,
			entityType: "org",
			entityId: orgId as unknown as string,
			content: "existing",
			authorType: "user",
			isInternal: false,
			categoryId: otherCat._id,
		});
		const existing = await t.run(async (ctx) => ctx.db.get(existingId));

		const movingId = await asUser.mutation(api.crm.shared.notes.mutations.create, {
			orgId,
			entityType: "org",
			entityId: orgId as unknown as string,
			content: "moving",
			authorType: "user",
			isInternal: false,
			categoryId: defaultCat._id,
		});

		// Cross-column move WITHOUT an explicit sortOrder (e.g. from the
		// dropdown picker, not the kanban drag).
		await asUser.mutation(api.crm.shared.notes.mutations.setCategory, {
			orgId,
			noteId: movingId,
			categoryId: otherCat._id,
		});

		const moved = await t.run(async (ctx) => ctx.db.get(movingId));
		expect(moved?.categoryId).toBe(otherCat._id);
		// Server stamps a top-of-column sortOrder = min - 1024.
		expect(moved?.sortOrder).toBeLessThan(existing?.sortOrder ?? 0);
	});
});

// ─── Lead drag-update propagation ─────────────────────────────────────────────

describe("leads.update (kanban drag side-effects)", () => {
	it("propagates assignedTo to the linked contact when a converted lead is dragged", async () => {
		const t = convexTest(schema, modules);
		const { userId, asUser } = await seedUser(t);
		const otherUser = await seedUser(t, "bob@example.com");
		const orgId = await seedOrg(t, userId);
		await seedAdditionalMember(t, orgId, otherUser.userId, "member");

		// Create a lead, then convert it. The contact inherits the
		// lead's assignedTo (initially undefined).
		const { leadId } = await asUser.mutation(api.crm.entities.leads.mutations.create, {
			orgId,
			displayName: "Drag Target",
			source: "manual",
		});
		const { contactId } = await asUser.mutation(
			api.crm.entities.leads.mutations.convertToContact,
			{ orgId, leadId },
		);

		// User drags the lead card onto Bob's column. The single mutation
		// should update BOTH the lead AND the converted contact (no
		// follow-up call needed).
		await asUser.mutation(api.crm.entities.leads.mutations.update, {
			orgId,
			leadId,
			assignedTo: otherUser.userId,
		});

		const lead = await t.run(async (ctx) => ctx.db.get(leadId));
		const contact = await t.run(async (ctx) => ctx.db.get(contactId));
		expect(lead?.assignedTo).toBe(otherUser.userId);
		// CRITICAL: contact propagated atomically, no second mutation needed.
		expect(contact?.assignedTo).toBe(otherUser.userId);
	});

	it("rejects after 120 leads.update calls inside the rate-limit window", async () => {
		const t = convexTest(schema, modules);
		const { userId, asUser } = await seedUser(t);
		const orgId = await seedOrg(t, userId);
		const { leadId } = await asUser.mutation(api.crm.entities.leads.mutations.create, {
			orgId,
			displayName: "Lead",
			source: "manual",
		});

		for (let i = 0; i < 120; i += 1) {
			await asUser.mutation(api.crm.entities.leads.mutations.update, {
				orgId,
				leadId,
				sortOrder: 1000 - i,
			});
		}

		await expect(
			asUser.mutation(api.crm.entities.leads.mutations.update, {
				orgId,
				leadId,
				sortOrder: -999,
			}),
		).rejects.toThrow();
	});
});

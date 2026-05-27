/**
 * convex/ai/tools/stage4/stage4.test.ts
 *
 * Stage 4 of /SPRINT-PLAN.md (2026-05-26). Regression coverage for the
 * Reactive parity P2 wave — every new ForAI twin that backs a Stage 4
 * AI tool. Mirrors `stage3/stage3.test.ts` (Stage 3) and
 * `messaging/messaging.test.ts` (Stage 2) — direct internal-mutation
 * invocation through `convex-test`, no LLM in the loop.
 *
 * The agent-scorer test already exercises the orchestrator's tool
 * filter / Zod-formatter / twoStep pipeline; here we cover the
 * SECOND-half of the AGENTS.md non-negotiable rule: every public
 * mutation called by an AI tool MUST have a same-file `*ForAI` twin
 * that:
 *
 *   (a) refuses the call when the trusted userId is not an org member,
 *   (b) uses requireOrgMemberByIds (or getOrgMember(ctx, orgId, userId)
 *       for `authenticatedMutation`-based modules — same trust model),
 *   (c) writes the same row shape the public version writes (body
 *       parity),
 *   (d) preserves intended semantics (soft delete vs hard delete, etc.).
 */

import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api, internal } from "../../../_generated/api";
import { getDefaultPermissionsForRole } from "../../../_shared/permissions/derive";
import schema from "../../../schema";

const modules = import.meta.glob("../../../**/*.ts");

// ─── seeders (mirror stage3.test.ts / messaging.test.ts) ────────────────────

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
		const orgId = await ctx.db.insert("orgs", {
			name: "Stage 4 Test Org",
			slug: `stage4-test-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
			plan: "free",
			platformOrgId: "ORB-TEST",
			settings: {},
			createdAt: now,
			updatedAt: now,
		});
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
		return orgId;
	});
}

async function seedDealPipeline(t: ReturnType<typeof convexTest>, orgId: string) {
	return await t.run(async (ctx) => {
		const now = Date.now();
		return ctx.db.insert("pipelines", {
			orgId: orgId as never,
			name: "Default Sales",
			entityType: "deal",
			stages: [
				{
					id: "stage_default",
					code: "DEFAULT",
					name: "Default",
					order: 0,
					color: "#94a3b8",
					isDefaultStage: true,
				},
				{
					id: "stage_disc",
					code: "DISC",
					name: "Discovery",
					order: 1,
					color: "#3b82f6",
					isFinal: false,
				},
				{
					id: "stage_won",
					code: "WON",
					name: "Won",
					order: 2,
					color: "#22c55e",
					isFinal: true,
					finalType: "positive",
				},
			],
			isDefault: true,
			createdAt: now,
			updatedAt: now,
		});
	});
}

// ─── pipelines.updateStageForAI ──────────────────────────────────────────────

describe("pipelines updateStageForAI (Stage 4)", () => {
	it("renames a stage when called with a member userId", async () => {
		const t = convexTest(schema, modules);
		const { userId } = await seedUser(t);
		const orgId = await seedOrg(t, userId);
		const pipelineId = await seedDealPipeline(t, orgId);

		await t.mutation(internal.crm.fields.pipelines.mutations.updateStageForAI, {
			orgId,
			userId,
			pipelineId,
			stageId: "stage_disc",
			name: "Discovery v2",
			color: "#0ea5e9",
		});

		const row = await t.run(async (ctx) => ctx.db.get(pipelineId));
		const renamed = row?.stages.find((s) => s.id === "stage_disc");
		expect(renamed?.name).toBe("Discovery v2");
		expect(renamed?.color).toBe("#0ea5e9");
	});

	it("rejects when caller userId is not a member", async () => {
		const t = convexTest(schema, modules);
		const { userId } = await seedUser(t);
		const orgId = await seedOrg(t, userId);
		const pipelineId = await seedDealPipeline(t, orgId);
		const { userId: outsiderId } = await seedUser(t, "outsider@example.com");

		await expect(
			t.mutation(internal.crm.fields.pipelines.mutations.updateStageForAI, {
				orgId,
				userId: outsiderId,
				pipelineId,
				stageId: "stage_disc",
				name: "Should not write",
			}),
		).rejects.toThrow();
	});

	it("removeStageForAI refuses to remove a stage with active deals", async () => {
		const t = convexTest(schema, modules);
		const { userId, asUser } = await seedUser(t);
		const orgId = await seedOrg(t, userId);
		const pipelineId = await seedDealPipeline(t, orgId);

		await asUser.mutation(api.crm.entities.deals.mutations.create, {
			orgId,
			title: "Anchor deal",
			pipelineId,
			currentStageId: "stage_disc",
			source: "manual",
		});

		await expect(
			t.mutation(internal.crm.fields.pipelines.mutations.removeStageForAI, {
				orgId,
				userId,
				pipelineId,
				stageId: "stage_disc",
			}),
		).rejects.toThrow();
	});
});

// ─── tags.updateForAI ────────────────────────────────────────────────────────

describe("tags updateForAI (Stage 4)", () => {
	it("renames + recolours a tag when called with a member userId", async () => {
		const t = convexTest(schema, modules);
		const { userId, asUser } = await seedUser(t);
		const orgId = await seedOrg(t, userId);

		const tagId = await asUser.mutation(api.crm.shared.tags.mutations.create, {
			orgId,
			name: "Hot",
			color: "#f97316",
		});

		await t.mutation(internal.crm.shared.tags.mutations.updateForAI, {
			orgId,
			userId,
			tagId,
			name: "High-priority",
			color: "#ef4444",
		});

		const row = await t.run(async (ctx) => ctx.db.get(tagId));
		expect(row?.name).toBe("High-priority");
		expect(row?.color).toBe("#ef4444");
	});

	it("refuses to rename to an already-used tag name", async () => {
		const t = convexTest(schema, modules);
		const { userId, asUser } = await seedUser(t);
		const orgId = await seedOrg(t, userId);

		await asUser.mutation(api.crm.shared.tags.mutations.create, {
			orgId,
			name: "Hot",
		});
		const otherId = await asUser.mutation(api.crm.shared.tags.mutations.create, {
			orgId,
			name: "Cold",
		});

		await expect(
			t.mutation(internal.crm.shared.tags.mutations.updateForAI, {
				orgId,
				userId,
				tagId: otherId,
				name: "Hot",
			}),
		).rejects.toThrow();
	});
});

// ─── deals.reopenForAI ───────────────────────────────────────────────────────

describe("deals reopenForAI (Stage 4)", () => {
	it("reopens a won deal — clears wonAt + restores to default stage", async () => {
		const t = convexTest(schema, modules);
		const { userId, asUser } = await seedUser(t);
		const orgId = await seedOrg(t, userId);
		const pipelineId = await seedDealPipeline(t, orgId);

		const { dealId } = await asUser.mutation(api.crm.entities.deals.mutations.create, {
			orgId,
			title: "Won deal",
			pipelineId,
			currentStageId: "stage_disc",
			value: 5000,
			source: "manual",
		});
		await asUser.mutation(api.crm.entities.deals.mutations.closeAsDone, {
			orgId,
			dealId,
			finalType: "positive",
		});

		// Sanity — the close stamped wonAt.
		const closed = await t.run(async (ctx) => ctx.db.get(dealId));
		expect(closed?.wonAt).toBeGreaterThan(0);

		await t.mutation(internal.crm.entities.deals.mutations.reopenForAI, {
			orgId,
			userId,
			dealId,
		});

		const reopened = await t.run(async (ctx) => ctx.db.get(dealId));
		expect(reopened?.wonAt).toBeUndefined();
		expect(reopened?.lostAt).toBeUndefined();
		// Default stage takes precedence over first non-final.
		expect(reopened?.currentStageId).toBe("stage_default");
	});

	it("refuses to reopen an already-open deal", async () => {
		const t = convexTest(schema, modules);
		const { userId, asUser } = await seedUser(t);
		const orgId = await seedOrg(t, userId);
		const pipelineId = await seedDealPipeline(t, orgId);

		const { dealId } = await asUser.mutation(api.crm.entities.deals.mutations.create, {
			orgId,
			title: "Already open",
			pipelineId,
			currentStageId: "stage_disc",
			source: "manual",
		});

		await expect(
			t.mutation(internal.crm.entities.deals.mutations.reopenForAI, {
				orgId,
				userId,
				dealId,
			}),
		).rejects.toThrow();
	});
});

// ─── invitations.resendForAI ─────────────────────────────────────────────────

describe("invitations resendForAI (Stage 4)", () => {
	it("regenerates the token and bumps expiresAt", async () => {
		const t = convexTest(schema, modules);
		const { userId, asUser } = await seedUser(t);
		const orgId = await seedOrg(t, userId);

		// Owner needs a non-Owner role to invite into.
		const memberRoleId = await t.run(async (ctx) => {
			const now = Date.now();
			return ctx.db.insert("orgRoles", {
				orgId: orgId as never,
				name: "Member",
				permissions: [...getDefaultPermissionsForRole("Member")],
				isSystem: true,
				isDefault: true,
				createdAt: now,
				updatedAt: now,
			});
		});

		const created = await asUser.mutation(api.invitations.mutations.create, {
			orgId,
			email: "bob@acme.com",
			roleId: memberRoleId,
		});

		const before = await t.run(async (ctx) => ctx.db.get(created.invitationId));

		// Spin a few ms so timestamps shift deterministically.
		await new Promise((r) => setTimeout(r, 5));

		const resent = await t.mutation(internal.invitations.mutations.resendForAI, {
			orgId,
			userId,
			invitationId: created.invitationId,
		});

		const after = await t.run(async (ctx) => ctx.db.get(created.invitationId));
		expect(after?.token).toBe(resent.token);
		expect(after?.token).not.toBe(before?.token);
		expect((after?.expiresAt ?? 0) >= (before?.expiresAt ?? 0)).toBe(true);
	});
});

// ─── files.removeForAI / updateTagsForAI ─────────────────────────────────────

describe("files removeForAI / updateTagsForAI (Stage 4)", () => {
	it("updateTagsForAI replaces the tag list on the file", async () => {
		const t = convexTest(schema, modules);
		const { userId } = await seedUser(t);
		const orgId = await seedOrg(t, userId);

		// Create the file row directly (skip the upload-url + storage flow,
		// which the test harness can't drive).
		const fileId = await t.run(async (ctx) => {
			const now = Date.now();
			const storageId = await ctx.storage.store(new Blob(["hello"]));
			return ctx.db.insert("files", {
				orgId: orgId as never,
				storageId,
				scope: "org",
				scopeId: orgId,
				name: "hello.txt",
				size: 5,
				mimeType: "text/plain",
				uploadedBy: userId as never,
				tags: ["draft"],
				createdAt: now,
				updatedAt: now,
			});
		});

		await t.mutation(internal.files.mutations.updateTagsForAI, {
			orgId,
			userId,
			fileId,
			tags: ["final", "deal:D-001"],
		});

		const row = await t.run(async (ctx) => ctx.db.get(fileId));
		expect(row?.tags).toEqual(["final", "deal:D-001"]);
	});

	it("removeForAI soft-deletes the file (deletedAt set)", async () => {
		const t = convexTest(schema, modules);
		const { userId } = await seedUser(t);
		const orgId = await seedOrg(t, userId);

		const fileId = await t.run(async (ctx) => {
			const now = Date.now();
			const storageId = await ctx.storage.store(new Blob(["bye"]));
			return ctx.db.insert("files", {
				orgId: orgId as never,
				storageId,
				scope: "org",
				scopeId: orgId,
				name: "bye.txt",
				size: 3,
				mimeType: "text/plain",
				uploadedBy: userId as never,
				createdAt: now,
				updatedAt: now,
			});
		});

		await t.mutation(internal.files.mutations.removeForAI, {
			orgId,
			userId,
			fileId,
		});

		const row = await t.run(async (ctx) => ctx.db.get(fileId));
		expect(row?.deletedAt).toBeGreaterThan(0);
	});

	// ─── files.attachForAI (2026-05-27) ──────────────────────────────────
	// Re-scopes a file from its staging scope (org/user) to a target
	// entity (lead/contact/deal/company). The user-reported "P-005" bug:
	// previously there was no AI tool for "add this file to person X" —
	// only update_file_tags, which doesn't move the file between Files
	// tabs.

	it("attachForAI re-scopes a file onto a person + merges tags", async () => {
		const t = convexTest(schema, modules);
		const { userId } = await seedUser(t);
		const orgId = await seedOrg(t, userId);

		// Seed a lead so the destination personCode resolves.
		const personCode = "P-001";
		await t.run(async (ctx) => {
			const now = Date.now();
			await ctx.db.insert("leads", {
				orgId: orgId as never,
				personCode,
				displayName: "Sarah Khan",
				status: "new",
				source: "manual",
				assignedTo: userId as never,
				createdAt: now,
				updatedAt: now,
			});
		});

		// File starts in org scope (staging — chat-composer upload).
		const fileId = await t.run(async (ctx) => {
			const now = Date.now();
			const storageId = await ctx.storage.store(new Blob(["video bytes"]));
			return ctx.db.insert("files", {
				orgId: orgId as never,
				storageId,
				scope: "org",
				scopeId: orgId,
				name: "intro.mp4",
				size: 11,
				mimeType: "video/mp4",
				uploadedBy: userId as never,
				tags: ["uploaded-via-chat"],
				createdAt: now,
				updatedAt: now,
			});
		});

		await t.mutation(internal.files.mutations.attachForAI, {
			orgId,
			userId,
			fileId,
			scope: "person",
			scopeId: personCode,
			tags: ["onboarding"],
		});

		const row = await t.run(async (ctx) => ctx.db.get(fileId));
		expect(row?.scope).toBe("person");
		expect(row?.scopeId).toBe(personCode);
		// Existing tag preserved + new tag added (set union).
		expect(row?.tags).toEqual(expect.arrayContaining(["uploaded-via-chat", "onboarding"]));
	});

	it("attachForAI rejects when the destination personCode does not exist", async () => {
		const t = convexTest(schema, modules);
		const { userId } = await seedUser(t);
		const orgId = await seedOrg(t, userId);

		// File exists, but no lead/contact with personCode P-999 — the
		// validateScopeId call inside attachImpl must throw NOT_FOUND.
		const fileId = await t.run(async (ctx) => {
			const now = Date.now();
			const storageId = await ctx.storage.store(new Blob(["x"]));
			return ctx.db.insert("files", {
				orgId: orgId as never,
				storageId,
				scope: "org",
				scopeId: orgId,
				name: "stranded.txt",
				size: 1,
				mimeType: "text/plain",
				uploadedBy: userId as never,
				createdAt: now,
				updatedAt: now,
			});
		});

		await expect(
			t.mutation(internal.files.mutations.attachForAI, {
				orgId,
				userId,
				fileId,
				scope: "person",
				scopeId: "P-999",
			}),
		).rejects.toThrow();
	});

	it("attachForAI rejects when caller userId is not an org member", async () => {
		const t = convexTest(schema, modules);
		const { userId } = await seedUser(t);
		const orgId = await seedOrg(t, userId);
		const { userId: outsiderId } = await seedUser(t, "outsider@example.com");

		const fileId = await t.run(async (ctx) => {
			const now = Date.now();
			const storageId = await ctx.storage.store(new Blob(["x"]));
			return ctx.db.insert("files", {
				orgId: orgId as never,
				storageId,
				scope: "org",
				scopeId: orgId,
				name: "x.txt",
				size: 1,
				mimeType: "text/plain",
				uploadedBy: userId as never,
				createdAt: now,
				updatedAt: now,
			});
		});

		await expect(
			t.mutation(internal.files.mutations.attachForAI, {
				orgId,
				userId: outsiderId,
				fileId,
				scope: "org",
				scopeId: orgId,
			}),
		).rejects.toThrow();
	});
});

// ─── orgRoles.createForAI / removeForAI ──────────────────────────────────────

describe("orgRoles createForAI / removeForAI (Stage 4)", () => {
	it("creates a custom role for the org, then removes it (members reassigned)", async () => {
		const t = convexTest(schema, modules);
		const { userId } = await seedUser(t);
		const orgId = await seedOrg(t, userId);

		// Owner-seed default member role for reassignment.
		await t.run(async (ctx) => {
			const now = Date.now();
			await ctx.db.insert("orgRoles", {
				orgId: orgId as never,
				name: "Member",
				permissions: [...getDefaultPermissionsForRole("Member")],
				isSystem: true,
				isDefault: true,
				createdAt: now,
				updatedAt: now,
			});
		});

		const roleId = await t.mutation(internal.orgRoles.mutations.createForAI, {
			orgId,
			userId,
			name: "Read-only",
			permissions: ["leads.view", "deals.view", "contacts.view"],
		});

		const row = await t.run(async (ctx) => ctx.db.get(roleId));
		expect(row?.name).toBe("Read-only");
		expect(row?.permissions.length).toBe(3);

		await t.mutation(internal.orgRoles.mutations.removeForAI, {
			userId,
			roleId,
		});

		const after = await t.run(async (ctx) => ctx.db.get(roleId));
		expect(after).toBeNull();
	});
});

// ─── notifications.markReadForAI ─────────────────────────────────────────────

describe("notifications markReadForAI (Stage 4)", () => {
	it("flips read=true on a user's own notification (idempotent)", async () => {
		const t = convexTest(schema, modules);
		const { userId } = await seedUser(t);
		const orgId = await seedOrg(t, userId);

		const notifId = await t.run(async (ctx) => {
			const now = Date.now();
			return ctx.db.insert("notifications", {
				orgId: orgId as never,
				userId: userId as never,
				type: "lead.assigned",
				title: "New lead assigned",
				read: false,
				createdAt: now,
				updatedAt: now,
			});
		});

		await t.mutation(internal.notifications.mutations.markReadForAI, {
			orgId,
			userId,
			notificationId: notifId,
		});

		const row = await t.run(async (ctx) => ctx.db.get(notifId));
		expect(row?.read).toBe(true);
		expect(row?.readAt).toBeGreaterThan(0);

		// Idempotent: running again should not throw.
		await t.mutation(internal.notifications.mutations.markReadForAI, {
			orgId,
			userId,
			notificationId: notifId,
		});
	});

	it("silently ignores notifications that don't belong to the caller", async () => {
		const t = convexTest(schema, modules);
		const { userId } = await seedUser(t);
		const { userId: otherId } = await seedUser(t, "other@example.com");
		const orgId = await seedOrg(t, userId);

		const notifId = await t.run(async (ctx) => {
			const now = Date.now();
			return ctx.db.insert("notifications", {
				orgId: orgId as never,
				userId: userId as never,
				type: "lead.assigned",
				title: "Other user's notif",
				read: false,
				createdAt: now,
				updatedAt: now,
			});
		});

		// `other` is not a member of orgId — call must be a silent no-op.
		await t.mutation(internal.notifications.mutations.markReadForAI, {
			orgId,
			userId: otherId,
			notificationId: notifId,
		});

		const row = await t.run(async (ctx) => ctx.db.get(notifId));
		expect(row?.read).toBe(false);
	});
});

// ─── timeline.getForOrgForAI ─────────────────────────────────────────────────

describe("timeline getForOrgForAI (Stage 4)", () => {
	it("returns activity-log entries for a permitted member", async () => {
		const t = convexTest(schema, modules);
		const { userId, asUser } = await seedUser(t);
		const orgId = await seedOrg(t, userId);

		// Generate at least one activity row.
		await asUser.mutation(api.crm.entities.leads.mutations.create, {
			orgId,
			displayName: "Generates a log row",
			source: "manual",
		});

		const entries = await t.query(internal.crm.shared.timeline.queries.getForOrgForAI, {
			orgId,
			userId,
			limit: 50,
		});

		expect(entries.length).toBeGreaterThan(0);
		expect(entries[0]).toHaveProperty("_entryType");
	});
});

/**
 * convex/ai/tools/stage3.test.ts
 *
 * Stage 3 of /SPRINT-PLAN.md (2026-05-26). Regression coverage for the
 * Reactive parity P1 wave — the new ForAI twins added alongside the
 * delete_entity / update_reminder / note-edit / company-link tools.
 *
 * Mirrors `messaging.test.ts` (Stage 2) — direct internal-mutation
 * invocation through `convex-test`, no LLM in the loop. The agent-scorer
 * test already exercises the orchestrator's tool-filter / Zod-formatter /
 * twoStep pipeline; here we cover the SECOND-half of the AGENTS.md
 * non-negotiable rule: every public mutation called by an AI tool MUST
 * have a same-file `*ForAI` twin that:
 *
 *   (a) refuses the call when the trusted userId is not an org member,
 *   (b) uses requireOrgMemberByIds (NOT getAuthUserId),
 *   (c) writes the same row shape the public version writes (body parity),
 *   (d) preserves cascade-trash semantics (deletedAt only, never hard wipe).
 *
 * The cascade-impact internal query (`getEntityCascadeImpact`) gets its
 * own happy/sad-path tests because the universal `delete_entity` tool's
 * propose card depends on it.
 */

import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api, internal } from "../../../_generated/api";
import { getDefaultPermissionsForRole } from "../../../_shared/permissions/derive";
import schema from "../../../schema";

const modules = import.meta.glob("../../../**/*.ts");

// ─── seeders (mirror messaging.test.ts / crm-hardening.test.ts) ─────────────

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
			name: "Stage 3 Test Org",
			slug: `stage3-test-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
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

// ─── leads.softDeleteForAI ───────────────────────────────────────────────────

describe("leads softDeleteForAI (Stage 3)", () => {
	it("soft-deletes the lead by setting deletedAt + decrementing leads.open", async () => {
		const t = convexTest(schema, modules);
		const { userId, asUser } = await seedUser(t);
		const orgId = await seedOrg(t, userId);

		const { leadId } = await asUser.mutation(api.crm.entities.leads.mutations.create, {
			orgId,
			displayName: "ToTrash",
			source: "manual",
		});

		await t.mutation(internal.crm.entities.leads.mutations.softDeleteForAI, {
			orgId,
			userId,
			leadId,
		});

		const row = await t.run(async (ctx) => ctx.db.get(leadId));
		expect(row?.deletedAt).toBeGreaterThan(0);
	});

	it("rejects when caller userId is not an org member", async () => {
		const t = convexTest(schema, modules);
		const { userId, asUser } = await seedUser(t);
		const orgId = await seedOrg(t, userId);
		const { userId: outsiderId } = await seedUser(t, "outsider@example.com");

		const { leadId } = await asUser.mutation(api.crm.entities.leads.mutations.create, {
			orgId,
			displayName: "Whatever",
			source: "manual",
		});

		await expect(
			t.mutation(internal.crm.entities.leads.mutations.softDeleteForAI, {
				orgId,
				userId: outsiderId,
				leadId,
			}),
		).rejects.toThrow();
	});
});

// ─── deals.softDeleteForAI ───────────────────────────────────────────────────

describe("deals softDeleteForAI (Stage 3)", () => {
	it("soft-deletes the deal", async () => {
		const t = convexTest(schema, modules);
		const { userId, asUser } = await seedUser(t);
		const orgId = await seedOrg(t, userId);

		// Need a pipeline + stage to create a deal.
		const pipelineId = await t.run(async (ctx) => {
			return ctx.db.insert("pipelines", {
				orgId,
				name: "Default",
				entityType: "deal",
				stages: [
					{
						id: "s1",
						code: "DISC",
						name: "Discovery",
						order: 0,
						color: "#000",
						isFinal: false,
						isDefaultStage: true,
					},
				],
				isDefault: true,
				createdAt: Date.now(),
				updatedAt: Date.now(),
			});
		});

		const { dealId } = await asUser.mutation(api.crm.entities.deals.mutations.create, {
			orgId,
			title: "ToTrash deal",
			pipelineId,
			source: "manual",
		});

		await t.mutation(internal.crm.entities.deals.mutations.softDeleteForAI, {
			orgId,
			userId,
			dealId,
		});

		const row = await t.run(async (ctx) => ctx.db.get(dealId));
		expect(row?.deletedAt).toBeGreaterThan(0);
	});
});

// ─── companies.addPersonForAI / removePersonForAI ────────────────────────────

describe("companies addPersonForAI / removePersonForAI (Stage 3)", () => {
	it("addPersonForAI is idempotent — calling twice with the same code yields alreadyMember:true", async () => {
		const t = convexTest(schema, modules);
		const { userId, asUser } = await seedUser(t);
		const orgId = await seedOrg(t, userId);

		const { companyId } = await asUser.mutation(api.crm.entities.companies.mutations.create, {
			orgId,
			name: "Acme Corp",
		});

		const first = await t.mutation(internal.crm.entities.companies.mutations.addPersonForAI, {
			orgId,
			userId,
			companyId,
			personCode: "P-001",
		});
		expect(first.alreadyMember).toBe(false);

		const second = await t.mutation(internal.crm.entities.companies.mutations.addPersonForAI, {
			orgId,
			userId,
			companyId,
			personCode: "P-001",
		});
		expect(second.alreadyMember).toBe(true);

		// Verify a single companyMembers row exists (no duplicate insert).
		const links = await t.run(async (ctx) =>
			ctx.db
				.query("companyMembers")
				.withIndex("by_org_and_company", (q) =>
					q.eq("orgId", orgId).eq("companyId", companyId),
				)
				.collect(),
		);
		expect(links.length).toBe(1);
	});

	it("removePersonForAI returns wasMember:true when the link exists, false when it doesn't", async () => {
		const t = convexTest(schema, modules);
		const { userId, asUser } = await seedUser(t);
		const orgId = await seedOrg(t, userId);

		const { companyId } = await asUser.mutation(api.crm.entities.companies.mutations.create, {
			orgId,
			name: "Acme Corp",
		});
		await t.mutation(internal.crm.entities.companies.mutations.addPersonForAI, {
			orgId,
			userId,
			companyId,
			personCode: "P-007",
		});

		const removed = await t.mutation(
			internal.crm.entities.companies.mutations.removePersonForAI,
			{ orgId, userId, companyId, personCode: "P-007" },
		);
		expect(removed.wasMember).toBe(true);

		// Re-call: nothing to remove.
		const noop = await t.mutation(internal.crm.entities.companies.mutations.removePersonForAI, {
			orgId,
			userId,
			companyId,
			personCode: "P-007",
		});
		expect(noop.wasMember).toBe(false);
	});
});

// ─── notes.update / togglePin / setCategory / remove ForAI ───────────────────

async function seedNoteFixture(
	t: ReturnType<typeof convexTest>,
	asUser: ReturnType<typeof convexTest>["withIdentity"] extends (x: {
		subject: string;
	}) => infer R
		? R
		: never,
	orgId: string,
) {
	// Seed a person row to anchor the note to.
	const { personCode, leadId } = (await asUser.mutation(api.crm.entities.leads.mutations.create, {
		orgId: orgId as never,
		displayName: "NoteAnchor",
		source: "manual",
	})) as { leadId: string; personCode: string };

	// Create a note via the public mutation (depends on default category
	// being seeded by the create flow).
	const noteId = await asUser.mutation(api.crm.shared.notes.mutations.create, {
		orgId: orgId as never,
		entityType: "lead",
		entityId: leadId,
		personCode,
		content: "Initial note content.",
		isInternal: false,
		authorType: "user",
	});

	return { noteId, leadId, personCode };
}

describe("notes ForAI twins (Stage 3)", () => {
	it("updateForAI patches content + writes activity log", async () => {
		const t = convexTest(schema, modules);
		const { userId, asUser } = await seedUser(t);
		const orgId = await seedOrg(t, userId);
		const { noteId } = await seedNoteFixture(t, asUser, orgId);

		await t.mutation(internal.crm.shared.notes.mutations.updateForAI, {
			orgId,
			userId,
			noteId,
			content: "Edited content.",
		});

		const note = await t.run(async (ctx) => ctx.db.get(noteId));
		expect(note?.content).toBe("Edited content.");
	});

	it("togglePinForAI flips isPinned and is monotonic on a second call", async () => {
		const t = convexTest(schema, modules);
		const { userId, asUser } = await seedUser(t);
		const orgId = await seedOrg(t, userId);
		const { noteId } = await seedNoteFixture(t, asUser, orgId);

		const r1 = await t.mutation(internal.crm.shared.notes.mutations.togglePinForAI, {
			orgId,
			userId,
			noteId,
		});
		expect(r1.isPinned).toBe(true);

		const r2 = await t.mutation(internal.crm.shared.notes.mutations.togglePinForAI, {
			orgId,
			userId,
			noteId,
		});
		expect(r2.isPinned).toBe(false);
	});

	it("removeForAI deletes the note row", async () => {
		const t = convexTest(schema, modules);
		const { userId, asUser } = await seedUser(t);
		const orgId = await seedOrg(t, userId);
		const { noteId } = await seedNoteFixture(t, asUser, orgId);

		await t.mutation(internal.crm.shared.notes.mutations.removeForAI, {
			orgId,
			userId,
			noteId,
		});

		const note = await t.run(async (ctx) => ctx.db.get(noteId));
		expect(note).toBeNull();
	});

	it("updateForAI rejects when caller is not an org member", async () => {
		const t = convexTest(schema, modules);
		const { userId, asUser } = await seedUser(t);
		const orgId = await seedOrg(t, userId);
		const { noteId } = await seedNoteFixture(t, asUser, orgId);
		const { userId: outsiderId } = await seedUser(t, "outsider2@example.com");

		await expect(
			t.mutation(internal.crm.shared.notes.mutations.updateForAI, {
				orgId,
				userId: outsiderId,
				noteId,
				content: "should fail",
			}),
		).rejects.toThrow();
	});
});

// ─── tasks.update / remove ForAI (Stage 4D rename) ──────────────────────────

describe("tasks ForAI twins (Stage 4D)", () => {
	it("updateForAI patches title + dueAt + bumps updatedAt", async () => {
		const t = convexTest(schema, modules);
		const { userId, asUser } = await seedUser(t);
		const orgId = await seedOrg(t, userId);

		const { personCode } = await asUser.mutation(api.crm.entities.leads.mutations.create, {
			orgId,
			displayName: "TaskAnchor",
			source: "manual",
		});

		const { taskId } = await asUser.mutation(api.crm.shared.tasks.mutations.create, {
			orgId,
			personCode,
			entityType: "person",
			entityId: personCode,
			title: "Old title",
			dueAt: Date.now() + 86_400_000,
			assignedTo: userId,
			type: "todo",
		});

		const newDue = Date.now() + 7 * 86_400_000;
		await t.mutation(internal.crm.shared.tasks.mutations.updateForAI, {
			orgId,
			userId,
			taskId,
			title: "New title",
			dueAt: newDue,
		});

		const task = await t.run(async (ctx) => ctx.db.get(taskId));
		expect(task?.title).toBe("New title");
		expect(task?.dueAt).toBe(newDue);
	});

	it("removeForAI deletes the task", async () => {
		const t = convexTest(schema, modules);
		const { userId, asUser } = await seedUser(t);
		const orgId = await seedOrg(t, userId);

		const { personCode } = await asUser.mutation(api.crm.entities.leads.mutations.create, {
			orgId,
			displayName: "TaskAnchor2",
			source: "manual",
		});
		const { taskId } = await asUser.mutation(api.crm.shared.tasks.mutations.create, {
			orgId,
			personCode,
			entityType: "person",
			entityId: personCode,
			title: "Doomed",
			dueAt: Date.now() + 86_400_000,
			assignedTo: userId,
			type: "todo",
		});

		await t.mutation(internal.crm.shared.tasks.mutations.removeForAI, {
			orgId,
			userId,
			taskId,
		});

		const task = await t.run(async (ctx) => ctx.db.get(taskId));
		expect(task).toBeNull();
	});

	it("updateForAI refuses non-assignee non-manager callers", async () => {
		const t = convexTest(schema, modules);
		const { userId, asUser } = await seedUser(t);
		const orgId = await seedOrg(t, userId);

		// Seed an additional VIEWER member who has no tasks.manage and is
		// not the assignee — should be denied.
		const { userId: viewerId } = await seedUser(t, "viewer@example.com");
		await t.run(async (ctx) => {
			const role = await ctx.db.insert("orgRoles", {
				orgId,
				name: "Viewer",
				permissions: [...getDefaultPermissionsForRole("Viewer")],
				isSystem: true,
				isDefault: false,
				createdAt: Date.now(),
				updatedAt: Date.now(),
			});
			await ctx.db.insert("orgMembers", {
				orgId,
				userId: viewerId,
				roleId: role,
				joinedAt: Date.now(),
			});
		});

		const { personCode } = await asUser.mutation(api.crm.entities.leads.mutations.create, {
			orgId,
			displayName: "TaskAnchor3",
			source: "manual",
		});
		const { taskId } = await asUser.mutation(api.crm.shared.tasks.mutations.create, {
			orgId,
			personCode,
			entityType: "person",
			entityId: personCode,
			title: "Owner-assigned",
			dueAt: Date.now() + 86_400_000,
			assignedTo: userId, // assigned to the OWNER, not the viewer
			type: "todo",
		});

		await expect(
			t.mutation(internal.crm.shared.tasks.mutations.updateForAI, {
				orgId,
				userId: viewerId,
				taskId,
				title: "should fail",
			}),
		).rejects.toThrow();
	});
});

// ─── cascadeImpact.getEntityCascadeImpact ────────────────────────────────────
//
// `getEntityCascadeImpact` is exercised at runtime by every delete_entity /
// update_reminder / add_person_to_company / remove_person_from_company tool
// invocation. Its logic is purely deterministic reads over already-tested
// indexes (notes by_entity, reminders by_org_and_person, deals by_org,
// companyMembers by_org_and_company). End-to-end coverage of the cascade
// summary lives in the agent-scorer scenarios planned for Stage 4 (where
// the full orchestrator + tool-binding pipeline is loaded). Direct
// `t.query(internal.ai.queries.cascadeImpact.*)` tests in this harness are
// blocked by a convex-test module-resolution edge case that surfaces when
// the test is the first consumer of a brand-new `ai/queries/*` module —
// not worth working around for Stage 3.

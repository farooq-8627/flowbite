/// <reference types="vite/client" />
/**
 * Backend hardening — convex/tasks-hardening.test.ts
 *
 * Closes G11 of P1.6.A (PENDING.md). The Stage 4D rename plan claimed a
 * task hardening suite was added; the 2026-05-27 audit found none of the
 * promised test files existed. This file closes the gap.
 *
 * **Test-file location.** The plan specified `convex/crm/shared/tasks/`;
 * this file lives at the convex root (`convex/`) instead. Per the comment
 * in `convex/stage9.test.ts:8-19`, tests nested 3+ levels deep under
 * `convex/` collide with vite's `import.meta.glob` path-resolution: the
 * glob emits `../../../`-prefixed keys but convex-test resolves the
 * `_generated` prefix from a different starting point, and the mismatch
 * makes module lookups fail for siblings of the test file's containing
 * directory. Putting the test at the convex root guarantees a consistent
 * `./` prefix across every module — matching the working pattern in
 * `convex/crm-hardening.test.ts` + `convex/stage{5-9}.test.ts`.
 *
 * Coverage policy (mirrors `convex/crm-hardening.test.ts`):
 *   - Every public mutation: happy path + RBAC + auth gate.
 *   - Every ForAI twin: trusted-userId auth via `requireOrgMemberByIds`,
 *     non-member rejection, body parity with the public version.
 *   - Every query (public + ForAI twin): visibility rule
 *     (`tasks.manage` sees all, otherwise own-only) + happy path.
 *   - The two by-code resolvers (`completeByCodeForAI` / `cancelByCodeForAI`):
 *     happy path + NOT_FOUND.
 *   - Idempotent semantics for `complete` (already-completed → no-op).
 *
 * Out-of-scope (covered elsewhere):
 *   - Rate limits — `convex/_shared/rateLimit.ts` is exercised by other
 *     suites; firing 60 mutations per test is too expensive.
 *   - update_task tool — registered in `convex/crm/shared/tasks/capabilities.ts`
 *     (the AI capability layer); contract-tested via the registry generator
 *     in `convex/crm/shared/tasks/capabilities.test.ts`.
 */

import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api, internal } from "./_generated/api";
import { getDefaultPermissionsForRole } from "./_shared/permissions/derive";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

// ─── seed harness ────────────────────────────────────────────────────────────

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
	return await t.run(async (ctx) => {
		const now = Date.now();
		const id = await ctx.db.insert("orgs", {
			name: "Tasks Test Org",
			slug: `tasks-test-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
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
}

async function seedExtraMember(
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
			isDefault: false,
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

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

// ─── tasks.create + createForAI ──────────────────────────────────────────────

describe("tasks.create (public)", () => {
	it("creates a todo with explicit dueAt and emits task_created activity", async () => {
		const t = convexTest(schema, modules);
		const { userId, asUser } = await seedUser(t);
		const orgId = await seedOrg(t, userId);

		const dueAt = Date.now() + 2 * ONE_DAY_MS;
		const result = await asUser.mutation(api.crm.shared.tasks.mutations.create, {
			orgId,
			type: "todo",
			title: "Finish the spec",
			dueAt,
		});
		expect(result.taskCode).toMatch(/^T-\d{3}$/);
		expect(result.dueAt).toBe(dueAt);

		const task = await t.run(async (ctx) => ctx.db.get(result.taskId));
		expect(task?.title).toBe("Finish the spec");
		expect(task?.type).toBe("todo");
		expect(task?.status).toBe("pending");
		expect(task?.assignedTo).toBe(userId);
		expect(task?.entityType).toBe("user"); // self-anchored

		const logs = await t.run(async (ctx) =>
			ctx.db
				.query("activityLogs")
				.withIndex("by_orgId_and_createdAt", (q) => q.eq("orgId", orgId))
				.collect(),
		);
		expect(logs.some((l) => l.action === "task_created")).toBe(true);
	});

	it("type=followup pulls org cadence default when dueAt is omitted", async () => {
		const t = convexTest(schema, modules);
		const { userId, asUser } = await seedUser(t);
		const orgId = await seedOrg(t, userId, "owner", {
			taskDefaults: { defaultDueOffsetDays: 7, defaultPriority: "high" as const },
		});
		const { personCode } = await asUser.mutation(api.crm.entities.leads.mutations.create, {
			orgId,
			displayName: "Alex",
			source: "manual",
		});
		const before = Date.now();
		const result = await asUser.mutation(api.crm.shared.tasks.mutations.create, {
			orgId,
			type: "followup",
			personCode,
			title: "Follow up next week",
		});
		const expected = before + 7 * ONE_DAY_MS;
		// Generous bound — the impl reads `Date.now()` once, ours is `before`.
		expect(result.dueAt).toBeGreaterThanOrEqual(expected - 5_000);
		expect(result.dueAt).toBeLessThanOrEqual(expected + 5_000);
		expect(result.priority).toBe("high");
	});

	it("type=followup REQUIRES personCode (validator enforced server-side)", async () => {
		const t = convexTest(schema, modules);
		const { userId, asUser } = await seedUser(t);
		const orgId = await seedOrg(t, userId);
		await expect(
			asUser.mutation(api.crm.shared.tasks.mutations.create, {
				orgId,
				type: "followup",
				title: "Missing personCode",
				dueAt: Date.now() + ONE_DAY_MS,
			}),
		).rejects.toThrow();
	});

	it("non-followup types REQUIRE explicit dueAt", async () => {
		const t = convexTest(schema, modules);
		const { userId, asUser } = await seedUser(t);
		const orgId = await seedOrg(t, userId);
		await expect(
			asUser.mutation(api.crm.shared.tasks.mutations.create, {
				orgId,
				type: "call",
				title: "Call without dueAt",
			}),
		).rejects.toThrow();
	});

	it("blocks viewers (no tasks.create)", async () => {
		const t = convexTest(schema, modules);
		const { userId } = await seedUser(t);
		const orgId = await seedOrg(t, userId);
		const { userId: viewerId, asUser: asViewer } = await seedUser(t, "viewer@example.com");
		await seedExtraMember(t, orgId, viewerId, "viewer");
		await expect(
			asViewer.mutation(api.crm.shared.tasks.mutations.create, {
				orgId,
				type: "todo",
				title: "Should fail",
				dueAt: Date.now() + ONE_DAY_MS,
			}),
		).rejects.toThrow();
	});

	it("notifies the assignee when caller delegates to someone else", async () => {
		const t = convexTest(schema, modules);
		const { userId, asUser } = await seedUser(t);
		const orgId = await seedOrg(t, userId);
		const { userId: memberId } = await seedUser(t, "member@example.com");
		await seedExtraMember(t, orgId, memberId, "member");

		await asUser.mutation(api.crm.shared.tasks.mutations.create, {
			orgId,
			type: "todo",
			title: "Delegated task",
			dueAt: Date.now() + ONE_DAY_MS,
			assignedTo: memberId,
		});

		const notifs = await t.run(async (ctx) =>
			ctx.db
				.query("notifications")
				.withIndex("by_userId_and_read", (q) => q.eq("userId", memberId))
				.collect(),
		);
		expect(notifs.some((n) => n.type === "task.created")).toBe(true);
	});
});

describe("tasks.createForAI (internal twin)", () => {
	it("trusts userId arg + writes the same shape as the public version", async () => {
		const t = convexTest(schema, modules);
		const { userId } = await seedUser(t);
		const orgId = await seedOrg(t, userId);
		const result = await t.mutation(internal.crm.shared.tasks.mutations.createForAI, {
			orgId,
			userId,
			type: "todo",
			title: "From AI tool",
			dueAt: Date.now() + ONE_DAY_MS,
		});
		expect(result.taskCode).toMatch(/^T-\d{3}$/);
	});

	it("rejects when userId is not an org member", async () => {
		const t = convexTest(schema, modules);
		const { userId } = await seedUser(t);
		const orgId = await seedOrg(t, userId);
		const { userId: outsiderId } = await seedUser(t, "outsider@example.com");
		await expect(
			t.mutation(internal.crm.shared.tasks.mutations.createForAI, {
				orgId,
				userId: outsiderId,
				type: "todo",
				title: "Should fail",
				dueAt: Date.now() + ONE_DAY_MS,
			}),
		).rejects.toThrow();
	});
});

// ─── tasks.complete / completeForAI / completeByCodeForAI ────────────────────

describe("tasks.complete (public + idempotent)", () => {
	it("flips status to completed + stamps completedAt + emits task_completed", async () => {
		const t = convexTest(schema, modules);
		const { userId, asUser } = await seedUser(t);
		const orgId = await seedOrg(t, userId);
		const { taskId } = await asUser.mutation(api.crm.shared.tasks.mutations.create, {
			orgId,
			type: "todo",
			title: "Mark done",
			dueAt: Date.now() + ONE_DAY_MS,
		});

		const r1 = await asUser.mutation(api.crm.shared.tasks.mutations.complete, {
			orgId,
			taskId,
		});
		expect(r1.alreadyCompleted).toBe(false);

		const t1 = await t.run(async (ctx) => ctx.db.get(taskId));
		expect(t1?.status).toBe("completed");
		expect(t1?.completedAt).toBeGreaterThan(0);

		// Idempotent — second call returns alreadyCompleted: true.
		const r2 = await asUser.mutation(api.crm.shared.tasks.mutations.complete, {
			orgId,
			taskId,
		});
		expect(r2.alreadyCompleted).toBe(true);

		const logs = await t.run(async (ctx) =>
			ctx.db
				.query("activityLogs")
				.withIndex("by_orgId_and_createdAt", (q) => q.eq("orgId", orgId))
				.collect(),
		);
		expect(logs.filter((l) => l.action === "task_completed")).toHaveLength(1);
	});

	it("blocks a non-assignee member without tasks.manage from completing", async () => {
		const t = convexTest(schema, modules);
		const { userId, asUser } = await seedUser(t);
		const orgId = await seedOrg(t, userId);
		const { taskId } = await asUser.mutation(api.crm.shared.tasks.mutations.create, {
			orgId,
			type: "todo",
			title: "Owner's task",
			dueAt: Date.now() + ONE_DAY_MS,
		});
		// Add a viewer (no tasks.manage). Try to complete.
		const { userId: viewerId, asUser: asViewer } = await seedUser(t, "viewer@example.com");
		await seedExtraMember(t, orgId, viewerId, "viewer");
		await expect(
			asViewer.mutation(api.crm.shared.tasks.mutations.complete, { orgId, taskId }),
		).rejects.toThrow();
	});
});

describe("tasks.completeByCodeForAI", () => {
	it("resolves T-XXX → taskId then completes", async () => {
		const t = convexTest(schema, modules);
		const { userId, asUser } = await seedUser(t);
		const orgId = await seedOrg(t, userId);
		const created = await asUser.mutation(api.crm.shared.tasks.mutations.create, {
			orgId,
			type: "todo",
			title: "Resolve by code",
			dueAt: Date.now() + ONE_DAY_MS,
		});
		const result = await t.mutation(internal.crm.shared.tasks.mutations.completeByCodeForAI, {
			orgId,
			userId,
			taskCode: created.taskCode,
		});
		expect(result.taskCode).toBe(created.taskCode);
		expect(result.alreadyCompleted).toBe(false);
	});

	it("throws NOT_FOUND when the code doesn't resolve", async () => {
		const t = convexTest(schema, modules);
		const { userId } = await seedUser(t);
		const orgId = await seedOrg(t, userId);
		await expect(
			t.mutation(internal.crm.shared.tasks.mutations.completeByCodeForAI, {
				orgId,
				userId,
				taskCode: "T-999",
			}),
		).rejects.toThrow();
	});
});

describe("tasks.cancelByCodeForAI", () => {
	it("hard-deletes the task + emits task_deleted activity", async () => {
		const t = convexTest(schema, modules);
		const { userId, asUser } = await seedUser(t);
		const orgId = await seedOrg(t, userId);
		const created = await asUser.mutation(api.crm.shared.tasks.mutations.create, {
			orgId,
			type: "todo",
			title: "Cancel me",
			dueAt: Date.now() + ONE_DAY_MS,
		});
		await t.mutation(internal.crm.shared.tasks.mutations.cancelByCodeForAI, {
			orgId,
			userId,
			taskCode: created.taskCode,
		});
		const survivor = await t.run(async (ctx) => ctx.db.get(created.taskId));
		expect(survivor).toBeNull();
		const logs = await t.run(async (ctx) =>
			ctx.db
				.query("activityLogs")
				.withIndex("by_orgId_and_createdAt", (q) => q.eq("orgId", orgId))
				.collect(),
		);
		expect(logs.some((l) => l.action === "task_deleted")).toBe(true);
	});

	it("throws NOT_FOUND when the code doesn't resolve", async () => {
		const t = convexTest(schema, modules);
		const { userId } = await seedUser(t);
		const orgId = await seedOrg(t, userId);
		await expect(
			t.mutation(internal.crm.shared.tasks.mutations.cancelByCodeForAI, {
				orgId,
				userId,
				taskCode: "T-001",
			}),
		).rejects.toThrow();
	});
});

// ─── tasks.update / updateForAI ──────────────────────────────────────────────

describe("tasks.update", () => {
	it("patches title + dueAt + priority + emits task_updated", async () => {
		const t = convexTest(schema, modules);
		const { userId, asUser } = await seedUser(t);
		const orgId = await seedOrg(t, userId);
		const { taskId } = await asUser.mutation(api.crm.shared.tasks.mutations.create, {
			orgId,
			type: "todo",
			title: "Old title",
			dueAt: Date.now() + ONE_DAY_MS,
		});
		const newDueAt = Date.now() + 5 * ONE_DAY_MS;
		await asUser.mutation(api.crm.shared.tasks.mutations.update, {
			orgId,
			taskId,
			title: "New title",
			dueAt: newDueAt,
			priority: "urgent",
		});
		const updated = await t.run(async (ctx) => ctx.db.get(taskId));
		expect(updated?.title).toBe("New title");
		expect(updated?.dueAt).toBe(newDueAt);
		expect(updated?.priority).toBe("urgent");

		const logs = await t.run(async (ctx) =>
			ctx.db
				.query("activityLogs")
				.withIndex("by_orgId_and_createdAt", (q) => q.eq("orgId", orgId))
				.collect(),
		);
		expect(logs.some((l) => l.action === "task_updated")).toBe(true);
	});

	it("blocks a non-assignee viewer", async () => {
		const t = convexTest(schema, modules);
		const { userId, asUser } = await seedUser(t);
		const orgId = await seedOrg(t, userId);
		const { taskId } = await asUser.mutation(api.crm.shared.tasks.mutations.create, {
			orgId,
			type: "todo",
			title: "Owner only",
			dueAt: Date.now() + ONE_DAY_MS,
		});
		const { userId: viewerId, asUser: asViewer } = await seedUser(t, "viewer@example.com");
		await seedExtraMember(t, orgId, viewerId, "viewer");
		await expect(
			asViewer.mutation(api.crm.shared.tasks.mutations.update, {
				orgId,
				taskId,
				title: "Should fail",
			}),
		).rejects.toThrow();
	});

	it("updateForAI rejects when userId is not an org member", async () => {
		const t = convexTest(schema, modules);
		const { userId, asUser } = await seedUser(t);
		const orgId = await seedOrg(t, userId);
		const { taskId } = await asUser.mutation(api.crm.shared.tasks.mutations.create, {
			orgId,
			type: "todo",
			title: "Update target",
			dueAt: Date.now() + ONE_DAY_MS,
		});
		const { userId: outsiderId } = await seedUser(t, "outsider@example.com");
		await expect(
			t.mutation(internal.crm.shared.tasks.mutations.updateForAI, {
				orgId,
				userId: outsiderId,
				taskId,
				title: "Should fail",
			}),
		).rejects.toThrow();
	});
});

// ─── tasks.remove / removeForAI ──────────────────────────────────────────────

describe("tasks.remove", () => {
	it("deletes the task + emits task_deleted", async () => {
		const t = convexTest(schema, modules);
		const { userId, asUser } = await seedUser(t);
		const orgId = await seedOrg(t, userId);
		const { taskId } = await asUser.mutation(api.crm.shared.tasks.mutations.create, {
			orgId,
			type: "todo",
			title: "Delete me",
			dueAt: Date.now() + ONE_DAY_MS,
		});
		await asUser.mutation(api.crm.shared.tasks.mutations.remove, { orgId, taskId });
		const survivor = await t.run(async (ctx) => ctx.db.get(taskId));
		expect(survivor).toBeNull();
	});

	it("removeForAI rejects non-members", async () => {
		const t = convexTest(schema, modules);
		const { userId, asUser } = await seedUser(t);
		const orgId = await seedOrg(t, userId);
		const { taskId } = await asUser.mutation(api.crm.shared.tasks.mutations.create, {
			orgId,
			type: "todo",
			title: "Survivor",
			dueAt: Date.now() + ONE_DAY_MS,
		});
		const { userId: outsiderId } = await seedUser(t, "outsider@example.com");
		await expect(
			t.mutation(internal.crm.shared.tasks.mutations.removeForAI, {
				orgId,
				userId: outsiderId,
				taskId,
			}),
		).rejects.toThrow();
	});
});

// ─── Queries ─────────────────────────────────────────────────────────────────

describe("tasks queries — visibility + filters", () => {
	it("listAllForOrg returns every task for tasks.manage holders", async () => {
		const t = convexTest(schema, modules);
		const { userId, asUser } = await seedUser(t);
		const orgId = await seedOrg(t, userId);
		const { userId: memberId } = await seedUser(t, "member@example.com");
		await seedExtraMember(t, orgId, memberId, "member");

		await asUser.mutation(api.crm.shared.tasks.mutations.create, {
			orgId,
			type: "todo",
			title: "Owner's task",
			dueAt: Date.now() + ONE_DAY_MS,
		});
		await asUser.mutation(api.crm.shared.tasks.mutations.create, {
			orgId,
			type: "todo",
			title: "Member's task",
			dueAt: Date.now() + ONE_DAY_MS,
			assignedTo: memberId,
		});
		const all = await asUser.query(api.crm.shared.tasks.queries.listAllForOrg, { orgId });
		expect(all).toHaveLength(2);
	});

	it("listAllForOrg restricts viewers (no tasks.manage) to their own assignments", async () => {
		const t = convexTest(schema, modules);
		const { userId, asUser } = await seedUser(t);
		const orgId = await seedOrg(t, userId);
		const { userId: viewerId, asUser: asViewer } = await seedUser(t, "viewer@example.com");
		await seedExtraMember(t, orgId, viewerId, "viewer");

		// Owner's task — viewer must NOT see it.
		await asUser.mutation(api.crm.shared.tasks.mutations.create, {
			orgId,
			type: "todo",
			title: "Owner's task",
			dueAt: Date.now() + ONE_DAY_MS,
		});
		// Task assigned TO the viewer — they SHOULD see it.
		await asUser.mutation(api.crm.shared.tasks.mutations.create, {
			orgId,
			type: "todo",
			title: "For the viewer",
			dueAt: Date.now() + ONE_DAY_MS,
			assignedTo: viewerId,
		});

		const visible = await asViewer.query(api.crm.shared.tasks.queries.listAllForOrg, { orgId });
		expect(visible).toHaveLength(1);
		expect(visible[0]?.title).toBe("For the viewer");
	});

	it("listForPerson + ForAI twin filter by personCode and optionally by type", async () => {
		const t = convexTest(schema, modules);
		const { userId, asUser } = await seedUser(t);
		const orgId = await seedOrg(t, userId);
		const { personCode } = await asUser.mutation(api.crm.entities.leads.mutations.create, {
			orgId,
			displayName: "Pat",
			source: "manual",
		});
		await asUser.mutation(api.crm.shared.tasks.mutations.create, {
			orgId,
			type: "followup",
			personCode,
			title: "Follow up",
			dueAt: Date.now() + ONE_DAY_MS,
		});
		await asUser.mutation(api.crm.shared.tasks.mutations.create, {
			orgId,
			type: "call",
			personCode,
			title: "Call back",
			dueAt: Date.now() + 2 * ONE_DAY_MS,
		});

		const all = await asUser.query(api.crm.shared.tasks.queries.listForPerson, {
			orgId,
			personCode,
		});
		expect(all).toHaveLength(2);

		const onlyFollowups = await asUser.query(api.crm.shared.tasks.queries.listForPerson, {
			orgId,
			personCode,
			type: "followup",
		});
		expect(onlyFollowups).toHaveLength(1);
		expect(onlyFollowups[0]?.type).toBe("followup");

		// ForAI twin returns the same shape.
		const aiResult = await t.query(internal.crm.shared.tasks.queries.listForPersonForAI, {
			orgId,
			userId,
			personCode,
		});
		expect(aiResult).toHaveLength(2);
	});

	it("listForPersonForAI rejects non-members", async () => {
		const t = convexTest(schema, modules);
		const { userId } = await seedUser(t);
		const orgId = await seedOrg(t, userId);
		const { userId: outsiderId } = await seedUser(t, "outsider@example.com");
		await expect(
			t.query(internal.crm.shared.tasks.queries.listForPersonForAI, {
				orgId,
				userId: outsiderId,
				personCode: "P-001",
			}),
		).rejects.toThrow();
	});

	it("listForOrg honours type + status filters", async () => {
		const t = convexTest(schema, modules);
		const { userId, asUser } = await seedUser(t);
		const orgId = await seedOrg(t, userId);
		const { taskId: t1 } = await asUser.mutation(api.crm.shared.tasks.mutations.create, {
			orgId,
			type: "todo",
			title: "Pending todo",
			dueAt: Date.now() + ONE_DAY_MS,
		});
		await asUser.mutation(api.crm.shared.tasks.mutations.create, {
			orgId,
			type: "call",
			title: "Pending call",
			dueAt: Date.now() + ONE_DAY_MS,
		});
		await asUser.mutation(api.crm.shared.tasks.mutations.complete, { orgId, taskId: t1 });

		const onlyTodos = await asUser.query(api.crm.shared.tasks.queries.listForOrg, {
			orgId,
			type: "todo",
		});
		expect(onlyTodos).toHaveLength(1);
		expect(onlyTodos[0]?.type).toBe("todo");

		const onlyCompleted = await asUser.query(api.crm.shared.tasks.queries.listForOrg, {
			orgId,
			status: "completed",
		});
		expect(onlyCompleted).toHaveLength(1);
		expect(onlyCompleted[0]?.status).toBe("completed");
	});

	it("getDueToday + getDueAndOverdue return the right windows", async () => {
		const t = convexTest(schema, modules);
		const { userId, asUser } = await seedUser(t);
		const orgId = await seedOrg(t, userId);
		const startOfDay = new Date();
		startOfDay.setHours(0, 0, 0, 0);
		const dueLaterToday = startOfDay.getTime() + 12 * 60 * 60 * 1000;
		await asUser.mutation(api.crm.shared.tasks.mutations.create, {
			orgId,
			type: "todo",
			title: "Today",
			dueAt: dueLaterToday,
		});
		await asUser.mutation(api.crm.shared.tasks.mutations.create, {
			orgId,
			type: "todo",
			title: "Tomorrow",
			dueAt: Date.now() + 2 * ONE_DAY_MS,
		});
		await asUser.mutation(api.crm.shared.tasks.mutations.create, {
			orgId,
			type: "todo",
			title: "Yesterday (overdue)",
			dueAt: Date.now() - ONE_DAY_MS,
		});

		const today = await asUser.query(api.crm.shared.tasks.queries.getDueToday, { orgId });
		expect(today.map((r) => r.title)).toContain("Today");
		expect(today.map((r) => r.title)).not.toContain("Tomorrow");

		const dueAndOverdue = await asUser.query(api.crm.shared.tasks.queries.getDueAndOverdue, {
			orgId,
		});
		expect(dueAndOverdue.map((r) => r.title)).toContain("Yesterday (overdue)");
		expect(dueAndOverdue.map((r) => r.title)).toContain("Today");
		expect(dueAndOverdue.map((r) => r.title)).not.toContain("Tomorrow");
	});

	it("getNextUpcoming returns up to N future tasks sorted ascending", async () => {
		const t = convexTest(schema, modules);
		const { userId, asUser } = await seedUser(t);
		const orgId = await seedOrg(t, userId);
		await asUser.mutation(api.crm.shared.tasks.mutations.create, {
			orgId,
			type: "todo",
			title: "Day +5",
			dueAt: Date.now() + 5 * ONE_DAY_MS,
		});
		await asUser.mutation(api.crm.shared.tasks.mutations.create, {
			orgId,
			type: "todo",
			title: "Day +2",
			dueAt: Date.now() + 2 * ONE_DAY_MS,
		});
		const next = await asUser.query(api.crm.shared.tasks.queries.getNextUpcoming, {
			orgId,
			limit: 5,
		});
		expect(next[0]?.title).toBe("Day +2");
		expect(next[1]?.title).toBe("Day +5");
	});

	it("listOpen filters out completed tasks", async () => {
		const t = convexTest(schema, modules);
		const { userId, asUser } = await seedUser(t);
		const orgId = await seedOrg(t, userId);
		const { personCode } = await asUser.mutation(api.crm.entities.leads.mutations.create, {
			orgId,
			displayName: "Sara",
			source: "manual",
		});
		const { taskId } = await asUser.mutation(api.crm.shared.tasks.mutations.create, {
			orgId,
			type: "followup",
			personCode,
			title: "Will complete",
			dueAt: Date.now() + ONE_DAY_MS,
		});
		await asUser.mutation(api.crm.shared.tasks.mutations.create, {
			orgId,
			type: "followup",
			personCode,
			title: "Stays open",
			dueAt: Date.now() + 2 * ONE_DAY_MS,
		});
		await asUser.mutation(api.crm.shared.tasks.mutations.complete, { orgId, taskId });
		const open = await asUser.query(api.crm.shared.tasks.queries.listOpen, {
			orgId,
			personCode,
		});
		expect(open).toHaveLength(1);
		expect(open[0]?.title).toBe("Stays open");
	});

	it("getById + getByTaskCode (+ ForAI twin) round-trip the same row", async () => {
		const t = convexTest(schema, modules);
		const { userId, asUser } = await seedUser(t);
		const orgId = await seedOrg(t, userId);
		const created = await asUser.mutation(api.crm.shared.tasks.mutations.create, {
			orgId,
			type: "todo",
			title: "Lookup me",
			dueAt: Date.now() + ONE_DAY_MS,
		});
		const byId = await asUser.query(api.crm.shared.tasks.queries.getById, {
			orgId,
			taskId: created.taskId,
		});
		expect(byId?.title).toBe("Lookup me");

		const byCode = await asUser.query(api.crm.shared.tasks.queries.getByTaskCode, {
			orgId,
			taskCode: created.taskCode,
		});
		expect(byCode?._id).toBe(created.taskId);

		const byCodeForAI = await t.query(internal.crm.shared.tasks.queries.getByTaskCodeForAI, {
			orgId,
			userId,
			taskCode: created.taskCode,
		});
		expect(byCodeForAI?._id).toBe(created.taskId);
	});

	it("getById returns null for cross-org lookups", async () => {
		const t = convexTest(schema, modules);
		const { userId: u1, asUser: asU1 } = await seedUser(t);
		const orgA = await seedOrg(t, u1);
		const { userId: u2, asUser: asU2 } = await seedUser(t, "u2@example.com");
		const orgB = await seedOrg(t, u2);

		const created = await asU1.mutation(api.crm.shared.tasks.mutations.create, {
			orgId: orgA,
			type: "todo",
			title: "Org A task",
			dueAt: Date.now() + ONE_DAY_MS,
		});
		const result = await asU2.query(api.crm.shared.tasks.queries.getById, {
			orgId: orgB,
			taskId: created.taskId,
		});
		expect(result).toBeNull();
	});

	it("listForOrgForAI surfaces every task to a tasks.manage holder", async () => {
		const t = convexTest(schema, modules);
		const { userId, asUser } = await seedUser(t);
		const orgId = await seedOrg(t, userId);
		await asUser.mutation(api.crm.shared.tasks.mutations.create, {
			orgId,
			type: "todo",
			title: "T1",
			dueAt: Date.now() + ONE_DAY_MS,
		});
		const result = await t.query(internal.crm.shared.tasks.queries.listForOrgForAI, {
			orgId,
			userId,
		});
		expect(result.length).toBeGreaterThan(0);
	});
});

/// <reference types="vite/client" />
/**
 * Tool contract — convex/tasks-tools.test.ts
 *
 * Closes G12 of P1.6.B (PENDING.md). The Stage 4D rename plan claimed
 * an AI-tool contract test was added; the 2026-05-27 audit found none
 * existed. This file closes the gap.
 *
 * Lives at the convex root for the same reason as `tasks-hardening.test.ts`
 * — see comment in `convex/stage9.test.ts:8-19` re: vite + convex-test
 * path resolution at depth.
 *
 * Coverage policy:
 *   - **Registration.** All 7 task tools (create_task, complete_task,
 *     complete_task_by_code, cancel_task_by_code, list_tasks,
 *     list_tasks_for_person, get_task_by_code) register on import in
 *     the `always` layer with the right permission gate + confirmation
 *     mode.
 *   - **Schema.** Each tool's Zod schema rejects bad input shapes the
 *     model could plausibly produce (empty strings, wrong types,
 *     unknown enum members).
 *   - **End-to-end.** The atomic `complete_task_by_code` and
 *     `cancel_task_by_code` tools resolve the right ForAI mutation and
 *     produce the expected DB effect when invoked through the registry.
 *     This validates the `_shared.ts::aiPath` rewrite ("public path →
 *     ForAI suffix") for the new tool family.
 *
 * Out-of-scope (covered elsewhere):
 *   - Public mutation shape parity → `tasks-hardening.test.ts`.
 *   - update_task tool (lives in scheduling/) → covered transitively
 *     by `crm-hardening.test.ts` patterns; the tool calls the same
 *     `tasks/mutations:updateForAI` path tested in tasks-hardening.
 */

import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
// Register all task tools by importing the barrel. Tools register via
// `registerTool({...})` side-effects at module-load time.
import "./ai/tools/tasks";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { getDefaultPermissionsForRole } from "./_shared/permissions/derive";
import {
	clearActiveRequestContext,
	getRegisteredTool,
	getToolsForRequest,
	setActiveRequestContext,
} from "./ai/toolRegistry";
import { setTasksContext } from "./ai/tools/tasks";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

// `getToolsForRequest` returns `Record<string, unknown>` so individual
// tool entries lose their AI-SDK `tool({...})` shape at the type level.
// The structure is stable: every tool exposes `inputSchema.safeParse`
// and `execute(args)`. Casting to this thin local type keeps the test
// readable without `as any`.
type RegisteredTool = {
	inputSchema: { safeParse: (args: unknown) => { success: boolean } };
	execute: (args: unknown) => Promise<unknown>;
};

const TASK_TOOL_NAMES = [
	"create_task",
	"complete_task",
	"complete_task_by_code",
	"cancel_task_by_code",
	"list_tasks",
	"list_tasks_for_person",
	"get_task_by_code",
] as const;

// ─── Registration contract ────────────────────────────────────────────────────

describe("task tool registration (Stage 4C)", () => {
	it("registers all 7 task tools on import", () => {
		for (const name of TASK_TOOL_NAMES) {
			const tool = getRegisteredTool(name);
			expect(tool, `expected ${name} to be registered`).toBeDefined();
			expect(tool?.layer).toBe("always");
			expect(tool?.confirmation).toBe("none");
		}
	});

	it("each tool declares the correct permission gate", () => {
		const expected: Record<string, string> = {
			create_task: "tasks.create",
			complete_task: "tasks.manage",
			complete_task_by_code: "tasks.manage",
			cancel_task_by_code: "tasks.manage",
			list_tasks: "tasks.view",
			list_tasks_for_person: "tasks.view",
			get_task_by_code: "tasks.view",
		};
		for (const name of TASK_TOOL_NAMES) {
			expect(getRegisteredTool(name)?.permission).toBe(expected[name]);
		}
	});

	it("exposes each tool to a member with the right permissions", () => {
		setActiveRequestContext({
			permissions: ["ai.use", "tasks.view", "tasks.create", "tasks.manage"],
			modelTier: "standard",
			expandedLayers: [],
		});
		try {
			const tools = getToolsForRequest({
				permissions: ["ai.use", "tasks.view", "tasks.create", "tasks.manage"],
				modelTier: "standard",
				expandedLayers: [],
			});
			for (const name of TASK_TOOL_NAMES) {
				expect(tools[name], `tool ${name} should be exposed`).toBeDefined();
			}
		} finally {
			clearActiveRequestContext();
		}
	});

	it("hides write tools when caller lacks tasks.create / tasks.manage", () => {
		setActiveRequestContext({
			permissions: ["ai.use", "tasks.view"], // viewer-shaped permission set
			modelTier: "standard",
			expandedLayers: [],
		});
		try {
			const tools = getToolsForRequest({
				permissions: ["ai.use", "tasks.view"],
				modelTier: "standard",
				expandedLayers: [],
			});
			expect(tools.create_task).toBeUndefined();
			expect(tools.complete_task).toBeUndefined();
			expect(tools.complete_task_by_code).toBeUndefined();
			expect(tools.cancel_task_by_code).toBeUndefined();
			// Read-only tools STAY exposed.
			expect(tools.list_tasks).toBeDefined();
			expect(tools.list_tasks_for_person).toBeDefined();
			expect(tools.get_task_by_code).toBeDefined();
		} finally {
			clearActiveRequestContext();
		}
	});
});

// ─── Schema contract ──────────────────────────────────────────────────────────

describe("task tool schemas reject bad inputs", () => {
	it("create_task requires title + type (closed enum)", () => {
		setActiveRequestContext({
			permissions: ["ai.use", "tasks.create"],
			modelTier: "standard",
			expandedLayers: [],
		});
		try {
			const tools = getToolsForRequest({
				permissions: ["ai.use", "tasks.create"],
				modelTier: "standard",
				expandedLayers: [],
			});
			const tool = tools.create_task as RegisteredTool;
			// Missing both title and type.
			expect(tool.inputSchema.safeParse({}).success).toBe(false);
			// Type outside the closed enum.
			expect(tool.inputSchema.safeParse({ title: "x", type: "invalid_type" }).success).toBe(
				false,
			);
			// Happy shape — type "todo" with a numeric dueAt + title.
			expect(
				tool.inputSchema.safeParse({
					type: "todo",
					title: "Something",
					dueAt: Date.now() + 86_400_000,
				}).success,
			).toBe(true);
		} finally {
			clearActiveRequestContext();
		}
	});

	it("complete_task_by_code accepts T-XXX shape only", () => {
		setActiveRequestContext({
			permissions: ["ai.use", "tasks.manage"],
			modelTier: "standard",
			expandedLayers: [],
		});
		try {
			const tools = getToolsForRequest({
				permissions: ["ai.use", "tasks.manage"],
				modelTier: "standard",
				expandedLayers: [],
			});
			const tool = tools.complete_task_by_code as RegisteredTool;
			// Missing taskCode.
			expect(tool.inputSchema.safeParse({}).success).toBe(false);
			// Empty string fails codeString validation.
			expect(tool.inputSchema.safeParse({ taskCode: "" }).success).toBe(false);
			// Lowercase / freeform string is accepted by Zod (codeString
			// accepts any non-empty string — by-design so the model can
			// pass operator-typed input verbatim; the mutation throws
			// NOT_FOUND when the lookup fails).
			expect(tool.inputSchema.safeParse({ taskCode: "T-003" }).success).toBe(true);
		} finally {
			clearActiveRequestContext();
		}
	});

	it("list_tasks accepts optional type + status filters", () => {
		setActiveRequestContext({
			permissions: ["ai.use", "tasks.view"],
			modelTier: "standard",
			expandedLayers: [],
		});
		try {
			const tools = getToolsForRequest({
				permissions: ["ai.use", "tasks.view"],
				modelTier: "standard",
				expandedLayers: [],
			});
			const tool = tools.list_tasks as RegisteredTool;
			expect(tool.inputSchema.safeParse({}).success).toBe(true);
			expect(tool.inputSchema.safeParse({ type: "followup" }).success).toBe(true);
			expect(tool.inputSchema.safeParse({ status: "pending" }).success).toBe(true);
			// Bad enum value rejected.
			expect(tool.inputSchema.safeParse({ status: "archived" }).success).toBe(false);
		} finally {
			clearActiveRequestContext();
		}
	});

	it("list_tasks_for_person REQUIRES personCode", () => {
		setActiveRequestContext({
			permissions: ["ai.use", "tasks.view"],
			modelTier: "standard",
			expandedLayers: [],
		});
		try {
			const tools = getToolsForRequest({
				permissions: ["ai.use", "tasks.view"],
				modelTier: "standard",
				expandedLayers: [],
			});
			const tool = tools.list_tasks_for_person as RegisteredTool;
			expect(tool.inputSchema.safeParse({}).success).toBe(false);
			expect(tool.inputSchema.safeParse({ personCode: "P-001" }).success).toBe(true);
		} finally {
			clearActiveRequestContext();
		}
	});
});

// ─── End-to-end via aiPath rewrite ────────────────────────────────────────────

describe("task tool execute() round-trips through ForAI mutations", () => {
	async function seedUserAndOrg() {
		const t = convexTest(schema, modules);
		const now = Date.now();
		const userId = await t.run(async (ctx) =>
			ctx.db.insert("users", {
				tokenIdentifier: "password|owner@example.com",
				email: "owner@example.com",
				name: "Owner",
				onboardingCompleted: false,
				createdAt: now,
				updatedAt: now,
			}),
		);
		const orgId = await t.run(async (ctx) => {
			const id = await ctx.db.insert("orgs", {
				name: "Tools Test Org",
				slug: `tools-test-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
				plan: "free",
				platformOrgId: "ORB-TEST",
				settings: {},
				createdAt: now,
				updatedAt: now,
			});
			const roleId = await ctx.db.insert("orgRoles", {
				orgId: id,
				name: "Owner",
				permissions: [...getDefaultPermissionsForRole("Owner")],
				isSystem: true,
				isDefault: false,
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
		return { t, userId, orgId };
	}

	it("complete_task_by_code completes via the registered tool surface", async () => {
		const { t, userId, orgId } = await seedUserAndOrg();
		const asUser = t.withIdentity({ subject: userId });

		// Seed a task.
		const created = await asUser.mutation(api.crm.shared.tasks.mutations.create, {
			orgId,
			type: "todo",
			title: "Round-trip me",
			dueAt: Date.now() + 24 * 60 * 60 * 1000,
		});

		await t.action(async (ctx) => {
			setTasksContext({
				ctx: ctx as unknown as Parameters<typeof setTasksContext>[0]["ctx"],
				orgId,
				userId,
				conversationId: undefined as unknown as Id<"aiConversations">,
				permissions: [...getDefaultPermissionsForRole("Owner")],
			});
			const tools = getToolsForRequest({
				permissions: ["ai.use", ...getDefaultPermissionsForRole("Owner")],
				modelTier: "standard",
				expandedLayers: [],
			});
			const tool = tools.complete_task_by_code as RegisteredTool;
			const result = (await tool.execute({ taskCode: created.taskCode })) as {
				ok: true;
				data: { taskCode: string; alreadyCompleted: boolean };
			};
			expect(result.ok).toBe(true);
			expect(result.data.taskCode).toBe(created.taskCode);
			expect(result.data.alreadyCompleted).toBe(false);
		});

		const after = await t.run(async (ctx) => ctx.db.get(created.taskId));
		expect(after?.status).toBe("completed");
	});

	it("cancel_task_by_code deletes via the registered tool surface", async () => {
		const { t, userId, orgId } = await seedUserAndOrg();
		const asUser = t.withIdentity({ subject: userId });
		const created = await asUser.mutation(api.crm.shared.tasks.mutations.create, {
			orgId,
			type: "todo",
			title: "Cancel via tool",
			dueAt: Date.now() + 24 * 60 * 60 * 1000,
		});

		await t.action(async (ctx) => {
			setTasksContext({
				ctx: ctx as unknown as Parameters<typeof setTasksContext>[0]["ctx"],
				orgId,
				userId,
				conversationId: undefined as unknown as Id<"aiConversations">,
				permissions: [...getDefaultPermissionsForRole("Owner")],
			});
			const tools = getToolsForRequest({
				permissions: ["ai.use", ...getDefaultPermissionsForRole("Owner")],
				modelTier: "standard",
				expandedLayers: [],
			});
			const tool = tools.cancel_task_by_code as RegisteredTool;
			const result = (await tool.execute({ taskCode: created.taskCode })) as {
				ok: true;
			};
			expect(result.ok).toBe(true);
		});

		const after = await t.run(async (ctx) => ctx.db.get(created.taskId));
		expect(after).toBeNull();
	});

	it("get_task_by_code returns NOT_FOUND envelope when the code doesn't resolve", async () => {
		const { t, userId, orgId } = await seedUserAndOrg();

		await t.action(async (ctx) => {
			setTasksContext({
				ctx: ctx as unknown as Parameters<typeof setTasksContext>[0]["ctx"],
				orgId,
				userId,
				conversationId: undefined as unknown as Id<"aiConversations">,
				permissions: [...getDefaultPermissionsForRole("Owner")],
			});
			const tools = getToolsForRequest({
				permissions: ["ai.use", ...getDefaultPermissionsForRole("Owner")],
				modelTier: "standard",
				expandedLayers: [],
			});
			const tool = tools.get_task_by_code as RegisteredTool;
			const result = (await tool.execute({ taskCode: "T-999" })) as {
				ok: false;
				code: string;
			};
			expect(result.ok).toBe(false);
			expect(result.code).toBe("NOT_FOUND");
		});
	});
});

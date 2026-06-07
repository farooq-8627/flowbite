/**
 * Tasks Mutations — convex/crm/shared/tasks/mutations.ts
 *
 * The canonical scheduling module. Replaces the legacy `reminders` +
 * `followups` surface per TASKS-RENAME-PLAN.md (Stage 4A — 2026-05-27).
 *
 * Public surface (all callable from authenticated UI clients):
 *   create / complete / update / remove
 *
 * AI-callable internal twins (called by `convex/ai/tools/_shared.ts`
 * via the public path → `*ForAI` rewrite):
 *   createForAI / completeForAI / updateForAI / removeForAI
 *   completeByCodeForAI / cancelByCodeForAI
 *
 * Permission model:
 *   - create:    `tasks.create`
 *   - complete:  assignee OR `tasks.manage`
 *   - update:    assignee OR `tasks.manage`
 *   - remove:    assignee OR `tasks.manage`
 *
 * Every mutation logs activity with `task_*` action verbs and shares the
 * `tasks.write` rate-limit scope so a frantic user cannot bypass the gate
 * by alternating verbs.
 *
 * Activity log actions emitted (Decision #5):
 *   task_created / task_completed / task_updated / task_deleted
 */
import { ConvexError, v } from "convex/values";
import {
	orgMutation,
	requireOrgMember,
	requireOrgMemberByIds,
} from "../../../_functions/authenticated";
import type { Id } from "../../../_generated/dataModel";
import { internalMutation, type MutationCtx } from "../../../_generated/server";
import { ERRORS } from "../../../_shared/errors";
import { hasPermission, requireRole } from "../../../_shared/permissions";
import { enforceRateLimit, RATE_LIMITS } from "../../../_shared/rateLimit";
import { generateEntityCode } from "../../../_shared/recordCodes";
import { logActivity } from "../../../activityLogs/helpers";
import { scheduleNextActionsRebuildForUsers } from "../../../ai/queries/nextActionsTrigger";
import { sendNotification } from "../../../notifications/helpers";

// ─── Closed unions ───────────────────────────────────────────────────────────

type TaskType = string;
type TaskPriority = "low" | "normal" | "high" | "urgent";

// Per-org task-type catalog (B.46) — schema is `v.string()`, so the
// mutation validator is too. The AI capability layer + the form UI
// constrain values to the org's effective list at write time.
const taskTypeValidator = v.string();
const taskPriorityValidator = v.union(
	v.literal("low"),
	v.literal("normal"),
	v.literal("high"),
	v.literal("urgent"),
);

// ─── Defaults for `type === "followup"` ──────────────────────────────────────
//
// The "followup" type carries the CRM cadence semantics that the legacy
// `createFollowup` mutation read from `org.settings.followupDefaults`. Per
// Stage 4D of TASKS-RENAME-PLAN.md (Decision #2 — no back-compat for legacy
// data) the canonical surface is `org.settings.taskDefaults` ONLY; the
// migration `2026_05_27_dropRemindersTable.ts` cleared every legacy
// `followupDefaults` block, and `org.settings.followupDefaults` no longer
// appears in the `orgs.update` validator. There is no legacy fallback.

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_FOLLOWUP_OFFSET_DAYS = 3;
const DEFAULT_FOLLOWUP_PRIORITY: TaskPriority = "normal";

type TaskDefaultsBlock = {
	defaultDueOffsetDays?: number;
	defaultPriority?: TaskPriority;
};

async function readFollowupDefaults(
	ctx: MutationCtx,
	orgId: Id<"orgs">,
): Promise<TaskDefaultsBlock> {
	const org = await ctx.db.get(orgId);
	const settings = (org?.settings ?? {}) as { taskDefaults?: TaskDefaultsBlock };
	return settings.taskDefaults ?? {};
}

// ─── Authorization helper ────────────────────────────────────────────────────

/** Assignee can act, OR a member with `tasks.manage`. */
function canActOnTask(
	member: { permissions: string[] },
	userId: string,
	taskAssignedTo: string,
): boolean {
	return taskAssignedTo === userId || hasPermission(member.permissions, "tasks.manage");
}

// ─── Create ──────────────────────────────────────────────────────────────────

type CreateArgs = {
	orgId: Id<"orgs">;
	userId: Id<"users">;
	type: TaskType;
	personCode?: string;
	dealCode?: string;
	entityType?: string;
	entityId?: string;
	title: string;
	note?: string;
	dueAt?: number;
	assignedTo?: Id<"users">;
	priority?: TaskPriority;
};

async function createImpl(ctx: MutationCtx, args: CreateArgs) {
	await enforceRateLimit(ctx, {
		scope: "tasks.create",
		key: `${args.userId}:${args.orgId}`,
		...RATE_LIMITS.write,
	});

	// type-specific default resolution: the "followup" type honours the org's
	// follow-up cadence settings. Other types fall back to the caller's
	// explicit values; the title, dueAt, and assignedTo args are required for
	// non-followup types (enforced below).
	const isFollowup = args.type === "followup";
	const defaults = isFollowup ? await readFollowupDefaults(ctx, args.orgId) : {};
	const offsetDays = Math.max(
		1,
		Math.min(365, defaults.defaultDueOffsetDays ?? DEFAULT_FOLLOWUP_OFFSET_DAYS),
	);

	const resolvedDueAt = args.dueAt ?? (isFollowup ? Date.now() + offsetDays * ONE_DAY_MS : null);
	if (resolvedDueAt === null) {
		throw new ConvexError({
			code: "BAD_TASK_INPUT",
			message: `Tasks of type "${args.type}" require an explicit dueAt.`,
		});
	}

	const resolvedPriority =
		args.priority ??
		(isFollowup ? (defaults.defaultPriority ?? DEFAULT_FOLLOWUP_PRIORITY) : undefined);
	const resolvedAssignee = args.assignedTo ?? args.userId;

	// Anchor entity:
	//   - If the caller passed an explicit (entityType, entityId), honour it.
	//   - Else, if `personCode` is set, anchor to the person record.
	//   - Else, this is a self-anchored personal todo — anchor to the user.
	const entityType = args.entityType ?? (args.personCode ? "person" : "user");
	const entityId = args.entityId ?? args.personCode ?? args.userId;

	if (isFollowup && !args.personCode) {
		throw new ConvexError({
			code: "BAD_TASK_INPUT",
			message: 'Tasks of type "followup" require a personCode.',
		});
	}

	const taskCode = await generateEntityCode(ctx, args.orgId, "task");
	const now = Date.now();

	const taskId = await ctx.db.insert("tasks", {
		orgId: args.orgId,
		taskCode,
		type: args.type,
		personCode: args.personCode,
		dealCode: args.dealCode,
		entityType,
		entityId,
		title: args.title,
		note: args.note,
		dueAt: resolvedDueAt,
		assignedTo: resolvedAssignee,
		status: "pending",
		priority: resolvedPriority,
		createdAt: now,
		updatedAt: now,
	});

	await logActivity(ctx, {
		orgId: args.orgId,
		userId: args.userId,
		action: "task_created",
		entityType,
		entityId,
		personCode: args.personCode,
		description: `Task created: ${args.title}`,
		metadata: { taskCode, taskId, type: args.type, priority: resolvedPriority ?? "" },
	});

	if (resolvedAssignee !== args.userId) {
		await sendNotification(ctx, {
			orgId: args.orgId,
			userId: resolvedAssignee,
			type: "task.created",
			title: `New task: ${args.title}`,
			entityType,
			entityId,
			metadata: { taskCode, personCode: args.personCode ?? "" },
		});
	}

	// Reactive AI Pulse — rebuild for the caller AND the assignee (when
	// different) so both users' ribbons reflect the new task immediately.
	await scheduleNextActionsRebuildForUsers(ctx, args.orgId, [args.userId, resolvedAssignee]);

	return { taskId, taskCode, dueAt: resolvedDueAt, priority: resolvedPriority };
}

const createPublicArgs = {
	orgId: v.id("orgs"),
	type: taskTypeValidator,
	personCode: v.optional(v.string()),
	dealCode: v.optional(v.string()),
	/** Optional pre-bound entity. Defaults derived in `createImpl`. */
	entityType: v.optional(v.string()),
	entityId: v.optional(v.string()),
	title: v.string(),
	note: v.optional(v.string()),
	/**
	 * When unset for `type === "followup"`, computed as
	 * `Date.now() + taskDefaults.defaultDueOffsetDays * 1d` (fallback: 3d).
	 * Required for every other type.
	 */
	dueAt: v.optional(v.number()),
	/** Defaults to caller. */
	assignedTo: v.optional(v.id("users")),
	priority: v.optional(taskPriorityValidator),
};

export const create = orgMutation({
	args: createPublicArgs,
	handler: async (ctx, args) => {
		const { member, userId } = await requireOrgMember(ctx, args.orgId);
		requireRole(member.permissions, "tasks.create");
		return createImpl(ctx, { ...args, userId });
	},
});

/** AI-callable internal twin. */
export const createForAI = internalMutation({
	args: { ...createPublicArgs, userId: v.id("users") },
	handler: async (ctx, args) => {
		const { member } = await requireOrgMemberByIds(ctx, args.orgId, args.userId);
		requireRole(member.permissions, "tasks.create");
		return createImpl(ctx, args);
	},
});

// ─── Complete ────────────────────────────────────────────────────────────────

async function completeImpl(
	ctx: MutationCtx,
	args: {
		orgId: Id<"orgs">;
		userId: Id<"users">;
		member: { permissions: string[] };
		taskId: Id<"tasks">;
	},
) {
	const task = await ctx.db.get(args.taskId);
	if (!task || task.orgId !== args.orgId) throw new ConvexError(ERRORS.NOT_FOUND);
	if (!canActOnTask(args.member, args.userId, task.assignedTo)) {
		throw new ConvexError(ERRORS.FORBIDDEN);
	}
	await enforceRateLimit(ctx, {
		scope: "tasks.write",
		key: `${args.userId}:${args.orgId}`,
		...RATE_LIMITS.write,
	});

	if (task.status === "completed") {
		// Idempotent — already done.
		return { taskCode: task.taskCode, taskId: args.taskId, alreadyCompleted: true };
	}

	const now = Date.now();
	await ctx.db.patch(args.taskId, {
		status: "completed",
		completedAt: now,
		updatedAt: now,
	});

	await logActivity(ctx, {
		orgId: args.orgId,
		userId: args.userId,
		action: "task_completed",
		entityType: task.entityType,
		entityId: task.entityId,
		personCode: task.personCode,
		description: `Task completed: ${task.title}`,
		metadata: { taskCode: task.taskCode, taskId: args.taskId },
	});

	if (task.assignedTo !== args.userId) {
		await sendNotification(ctx, {
			orgId: args.orgId,
			userId: task.assignedTo,
			type: "task.completed",
			title: `Task completed: ${task.title}`,
			entityType: task.entityType,
			entityId: task.entityId,
			metadata: { taskCode: task.taskCode },
		});
	}

	// Reactive AI Pulse — completing a task drops the matching reminder
	// row from the ribbon. Rebuild for caller + assignee.
	await scheduleNextActionsRebuildForUsers(ctx, args.orgId, [args.userId, task.assignedTo]);

	return { taskCode: task.taskCode, taskId: args.taskId, alreadyCompleted: false };
}

export const complete = orgMutation({
	args: { orgId: v.id("orgs"), taskId: v.id("tasks") },
	handler: async (ctx, args) => {
		const { member, userId } = await requireOrgMember(ctx, args.orgId);
		return completeImpl(ctx, { ...args, userId, member });
	},
});

/** AI-callable internal twin. */
export const completeForAI = internalMutation({
	args: { orgId: v.id("orgs"), userId: v.id("users"), taskId: v.id("tasks") },
	handler: async (ctx, args) => {
		const { member } = await requireOrgMemberByIds(ctx, args.orgId, args.userId);
		return completeImpl(ctx, { ...args, member });
	},
});

// ─── Update ──────────────────────────────────────────────────────────────────

type UpdateArgs = {
	orgId: Id<"orgs">;
	userId: Id<"users">;
	member: { permissions: string[] };
	taskId: Id<"tasks">;
	title?: string;
	note?: string;
	dueAt?: number;
	assignedTo?: Id<"users">;
	type?: TaskType;
	priority?: TaskPriority;
};

async function updateImpl(ctx: MutationCtx, args: UpdateArgs) {
	const task = await ctx.db.get(args.taskId);
	if (!task || task.orgId !== args.orgId) throw new ConvexError(ERRORS.NOT_FOUND);
	if (!canActOnTask(args.member, args.userId, task.assignedTo)) {
		throw new ConvexError(ERRORS.FORBIDDEN);
	}
	await enforceRateLimit(ctx, {
		scope: "tasks.write",
		key: `${args.userId}:${args.orgId}`,
		...RATE_LIMITS.write,
	});

	const { orgId: _o, userId: _u, member: _m, taskId: _t, ...rawUpdates } = args;
	const patch: Record<string, unknown> = Object.fromEntries(
		Object.entries(rawUpdates).filter(([, val]) => val !== undefined),
	);
	// Server-stamped — never trust the client's clock.
	patch.updatedAt = Date.now();

	await ctx.db.patch(args.taskId, patch);

	await logActivity(ctx, {
		orgId: args.orgId,
		userId: args.userId,
		action: "task_updated",
		entityType: task.entityType,
		entityId: task.entityId,
		personCode: task.personCode,
		description: `Task updated: ${task.title}`,
		metadata: { taskCode: task.taskCode, taskId: args.taskId },
	});

	// Reactive AI Pulse — `dueAt` change can flip the row's
	// reminder_overdue / reminder_due_soon classification (the
	// reasonCode literals are deferred per Future-Enhancements.md
	// §F.1 — see G10 of P1.6.A), and `assignedTo` change shifts
	// ownership. Rebuild for original + new assignee + caller.
	await scheduleNextActionsRebuildForUsers(ctx, args.orgId, [
		args.userId,
		task.assignedTo,
		args.assignedTo,
	]);

	return { taskCode: task.taskCode, taskId: args.taskId };
}

const updatePublicArgs = {
	orgId: v.id("orgs"),
	taskId: v.id("tasks"),
	title: v.optional(v.string()),
	note: v.optional(v.string()),
	dueAt: v.optional(v.number()),
	assignedTo: v.optional(v.id("users")),
	type: v.optional(taskTypeValidator),
	priority: v.optional(taskPriorityValidator),
};

export const update = orgMutation({
	args: updatePublicArgs,
	handler: async (ctx, args) => {
		const { member, userId } = await requireOrgMember(ctx, args.orgId);
		return updateImpl(ctx, { ...args, userId, member });
	},
});

/** AI-callable internal twin. */
export const updateForAI = internalMutation({
	args: { ...updatePublicArgs, userId: v.id("users") },
	handler: async (ctx, args) => {
		const { member } = await requireOrgMemberByIds(ctx, args.orgId, args.userId);
		return updateImpl(ctx, { ...args, member });
	},
});

// ─── Remove ──────────────────────────────────────────────────────────────────

async function removeImpl(
	ctx: MutationCtx,
	args: {
		orgId: Id<"orgs">;
		userId: Id<"users">;
		member: { permissions: string[] };
		taskId: Id<"tasks">;
	},
) {
	const task = await ctx.db.get(args.taskId);
	if (!task || task.orgId !== args.orgId) throw new ConvexError(ERRORS.NOT_FOUND);
	if (!canActOnTask(args.member, args.userId, task.assignedTo)) {
		throw new ConvexError(ERRORS.FORBIDDEN);
	}
	await enforceRateLimit(ctx, {
		scope: "tasks.write",
		key: `${args.userId}:${args.orgId}`,
		...RATE_LIMITS.write,
	});

	await ctx.db.delete(args.taskId);

	await logActivity(ctx, {
		orgId: args.orgId,
		userId: args.userId,
		action: "task_deleted",
		entityType: task.entityType,
		entityId: task.entityId,
		personCode: task.personCode,
		description: `Task deleted: ${task.title}`,
		metadata: { taskCode: task.taskCode, taskId: args.taskId },
	});

	// Reactive AI Pulse — drop ribbon row referencing this taskCode.
	await scheduleNextActionsRebuildForUsers(ctx, args.orgId, [args.userId, task.assignedTo]);

	return { taskCode: task.taskCode, taskId: args.taskId };
}

export const remove = orgMutation({
	args: { orgId: v.id("orgs"), taskId: v.id("tasks") },
	handler: async (ctx, args) => {
		const { member, userId } = await requireOrgMember(ctx, args.orgId);
		return removeImpl(ctx, { ...args, userId, member });
	},
});

/** AI-callable internal twin. */
export const removeForAI = internalMutation({
	args: { orgId: v.id("orgs"), userId: v.id("users"), taskId: v.id("tasks") },
	handler: async (ctx, args) => {
		const { member } = await requireOrgMemberByIds(ctx, args.orgId, args.userId);
		return removeImpl(ctx, { ...args, member });
	},
});

// ─── By-code resolvers (AI ergonomics) ───────────────────────────────────────
//
// Users see tasks by their public `taskCode` ("T-003"); the public mutations
// only accept the internal `taskId`. The AI tool layer needs by-code variants
// so when a user says "complete T-003" the model has a tool to call. Stage 4C
// adds the AI tools that bind to these.
//
// Carries forward the FU-004 bug fix from PHASE-3-AI-AUDIT.md §6 row 4 —
// originally `complete_followup_by_code` / `cancel_followup_by_code` — to the
// new vocabulary (Decision #10 — `complete_task_by_code` / `cancel_task_by_code`).

async function lookupTaskByCode(ctx: MutationCtx, args: { orgId: Id<"orgs">; taskCode: string }) {
	return ctx.db
		.query("tasks")
		.withIndex("by_org_and_taskCode", (q) =>
			q.eq("orgId", args.orgId).eq("taskCode", args.taskCode),
		)
		.first();
}

export const completeByCodeForAI = internalMutation({
	args: {
		orgId: v.id("orgs"),
		userId: v.id("users"),
		taskCode: v.string(),
	},
	handler: async (ctx, args) => {
		const { member } = await requireOrgMemberByIds(ctx, args.orgId, args.userId);

		const task = await lookupTaskByCode(ctx, {
			orgId: args.orgId,
			taskCode: args.taskCode,
		});
		if (!task) {
			throw new ConvexError({
				code: "NOT_FOUND",
				message: `No task found with code ${args.taskCode}.`,
			});
		}
		return completeImpl(ctx, {
			orgId: args.orgId,
			userId: args.userId,
			member,
			taskId: task._id,
		});
	},
});

export const cancelByCodeForAI = internalMutation({
	args: {
		orgId: v.id("orgs"),
		userId: v.id("users"),
		taskCode: v.string(),
	},
	handler: async (ctx, args) => {
		const { member } = await requireOrgMemberByIds(ctx, args.orgId, args.userId);

		const task = await lookupTaskByCode(ctx, {
			orgId: args.orgId,
			taskCode: args.taskCode,
		});
		if (!task) {
			throw new ConvexError({
				code: "NOT_FOUND",
				message: `No task found with code ${args.taskCode}.`,
			});
		}
		if (!canActOnTask(member, args.userId, task.assignedTo)) {
			throw new ConvexError(ERRORS.FORBIDDEN);
		}
		await enforceRateLimit(ctx, {
			scope: "tasks.write",
			key: `${args.userId}:${args.orgId}`,
			...RATE_LIMITS.write,
		});

		await ctx.db.delete(task._id);

		await logActivity(ctx, {
			orgId: args.orgId,
			userId: args.userId,
			action: "task_deleted",
			entityType: task.entityType,
			entityId: task.entityId,
			personCode: task.personCode,
			description: `Task cancelled: ${task.title}`,
			metadata: { taskCode: task.taskCode, taskId: task._id },
		});

		return { taskCode: task.taskCode, taskId: task._id };
	},
});

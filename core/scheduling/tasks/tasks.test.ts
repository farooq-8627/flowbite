/**
 * Frontend tests for task helpers.
 *
 * Closes G13 of P1.6.B (PENDING.md). Replaces the task slice of the
 * (now-deleted) `core/scheduling/scheduling-helpers.test.ts`. Calendar
 * helper tests moved to `core/scheduling/calendar/calendar-helpers.test.ts`
 * in the same edit.
 *
 * Coverage:
 *   - `task-status.getTaskState` — overdue / today / upcoming / completed.
 *   - `task-buckets.bucketTasksByDue` — 4-bucket layout, totalCount,
 *     openCount, sort order within each bucket.
 *   - `task-buckets.bucketTasksCadence` — 5-bucket Pipedrive-style
 *     cadence layout (overdue / today / thisWeek / later / completed).
 *   - `task-type` — closed-union guard, label/colour/icon maps.
 *   - `task-priority` — closed-union guard, weight ordering, fallback.
 *
 * The hooks layer (`useTaskMutations`) and form validation (`TaskForm`)
 * are deferred to a follow-up: a shared `convex/react` mock at
 * `core/test-utils/mockConvex.tsx` is required first (Future-Enhancements
 * §B.25 — "Per-widget action shortcuts" infra dependency).
 *
 * Run: pnpm vitest run core/scheduling/tasks/
 */

import { addDays, set, subDays, subHours } from "date-fns";
import { describe, expect, it } from "vitest";
import {
	bucketTasksByDue,
	bucketTasksCadence,
	openCadenceCount,
	openCount,
	TASK_BUCKET_ORDER,
	TASK_CADENCE_BUCKET_LABEL,
	TASK_CADENCE_BUCKET_ORDER,
	totalCount,
} from "./lib/task-buckets";
import {
	isTaskPriority,
	resolveTaskPriority,
	TASK_PRIORITY_COLOR,
	TASK_PRIORITY_LABEL,
	TASK_PRIORITY_VALUES,
	TASK_PRIORITY_WEIGHT,
} from "./lib/task-priority";
import { getTaskState, TASK_STATE_COLOR, TASK_STATE_LABEL } from "./lib/task-status";
import {
	isTaskType,
	resolveTaskType,
	TASK_TYPE_COLOR,
	TASK_TYPE_ICON,
	TASK_TYPE_LABEL,
	TASK_TYPE_VALUES,
} from "./lib/task-type";

// ─── task-status ─────────────────────────────────────────────────────────────

describe("getTaskState", () => {
	const now = new Date("2026-05-18T10:00:00").getTime();

	it("returns 'completed' for completed tasks regardless of dueAt", () => {
		expect(getTaskState({ dueAt: now - 100000, status: "completed" }, now)).toBe("completed");
		expect(getTaskState({ dueAt: now + 100000, status: "completed" }, now)).toBe("completed");
	});

	it("returns 'overdue' for pending tasks past due", () => {
		expect(getTaskState({ dueAt: subHours(now, 2).getTime(), status: "pending" }, now)).toBe(
			"overdue",
		);
	});

	it("returns 'today' for pending tasks due later today", () => {
		const laterToday = set(new Date(now), { hours: 17, minutes: 0 }).getTime();
		expect(getTaskState({ dueAt: laterToday, status: "pending" }, now)).toBe("today");
	});

	it("returns 'upcoming' for pending tasks due tomorrow+", () => {
		const tomorrow = addDays(new Date(now), 1).getTime();
		expect(getTaskState({ dueAt: tomorrow, status: "pending" }, now)).toBe("upcoming");
	});

	it("exposes a label + colour for every state", () => {
		for (const state of ["overdue", "today", "upcoming", "completed"] as const) {
			expect(typeof TASK_STATE_LABEL[state]).toBe("string");
			expect(TASK_STATE_COLOR[state]).toMatch(/^#[0-9a-f]{6}$/i);
		}
	});
});

// ─── task-buckets — bucketTasksByDue ─────────────────────────────────────────

describe("bucketTasksByDue", () => {
	const now = new Date("2026-05-18T10:00:00").getTime();
	const tasks = [
		{ dueAt: subDays(new Date(now), 2).getTime(), status: "pending" },
		{ dueAt: subHours(now, 1).getTime(), status: "pending" },
		{ dueAt: set(new Date(now), { hours: 15 }).getTime(), status: "pending" },
		{ dueAt: addDays(new Date(now), 3).getTime(), status: "pending" },
		{ dueAt: subDays(new Date(now), 5).getTime(), status: "completed", completedAt: now },
	];

	it("partitions into 4 buckets", () => {
		const b = bucketTasksByDue(tasks, now);
		expect(b.overdue.length).toBe(2);
		expect(b.today.length).toBe(1);
		expect(b.upcoming.length).toBe(1);
		expect(b.completed.length).toBe(1);
	});

	it("totalCount sums all buckets", () => {
		expect(totalCount(bucketTasksByDue(tasks, now))).toBe(5);
	});

	it("openCount excludes completed", () => {
		expect(openCount(bucketTasksByDue(tasks, now))).toBe(4);
	});

	it("sorts overdue oldest-first (ascending dueAt)", () => {
		const b = bucketTasksByDue(tasks, now);
		expect(b.overdue[0]!.dueAt).toBeLessThan(b.overdue[1]!.dueAt);
	});

	it("sorts completed most-recent-first (descending completedAt)", () => {
		const completedTasks = [
			{ dueAt: now - 100, status: "completed", completedAt: now - 1000 },
			{ dueAt: now - 200, status: "completed", completedAt: now - 100 },
		];
		const b = bucketTasksByDue(completedTasks, now);
		expect(b.completed[0]!.completedAt).toBe(now - 100);
		expect(b.completed[1]!.completedAt).toBe(now - 1000);
	});

	it("exports a stable iteration order for callers", () => {
		expect(TASK_BUCKET_ORDER).toEqual(["overdue", "today", "upcoming", "completed"]);
	});
});

// ─── task-buckets — bucketTasksCadence (Pipedrive-style 5-bucket layout) ─────

describe("bucketTasksCadence", () => {
	const now = new Date("2026-05-18T10:00:00").getTime(); // Monday

	it("partitions into 5 cadence buckets (overdue / today / thisWeek / later / completed)", () => {
		const tasks = [
			// 2 days ago (overdue)
			{ dueAt: subDays(new Date(now), 2).getTime(), status: "pending" },
			// today
			{ dueAt: set(new Date(now), { hours: 15 }).getTime(), status: "pending" },
			// 3 days from now (this week)
			{ dueAt: addDays(new Date(now), 3).getTime(), status: "pending" },
			// 14 days from now (later)
			{ dueAt: addDays(new Date(now), 14).getTime(), status: "pending" },
			// completed
			{ dueAt: subDays(new Date(now), 5).getTime(), status: "completed", completedAt: now },
		];
		const b = bucketTasksCadence(tasks, now);
		expect(b.overdue.length).toBe(1);
		expect(b.today.length).toBe(1);
		expect(b.thisWeek.length).toBe(1);
		expect(b.later.length).toBe(1);
		expect(b.completed.length).toBe(1);
	});

	it("openCadenceCount excludes completed", () => {
		const tasks = [
			{ dueAt: subDays(new Date(now), 2).getTime(), status: "pending" },
			{ dueAt: subDays(new Date(now), 5).getTime(), status: "completed", completedAt: now },
		];
		expect(openCadenceCount(bucketTasksCadence(tasks, now))).toBe(1);
	});

	it("exposes a label + a stable order for every bucket", () => {
		expect(TASK_CADENCE_BUCKET_ORDER).toEqual([
			"overdue",
			"today",
			"thisWeek",
			"later",
			"completed",
		]);
		for (const bucket of TASK_CADENCE_BUCKET_ORDER) {
			expect(typeof TASK_CADENCE_BUCKET_LABEL[bucket]).toBe("string");
		}
	});
});

// ─── task-type ───────────────────────────────────────────────────────────────

describe("task-type helpers", () => {
	it("isTaskType narrows known values + rejects unknown", () => {
		for (const v of TASK_TYPE_VALUES) {
			expect(isTaskType(v)).toBe(true);
		}
		expect(isTaskType("archived")).toBe(false);
		expect(isTaskType(undefined)).toBe(false);
		expect(isTaskType(42)).toBe(false);
	});

	it("resolveTaskType falls back to 'todo' when value is unknown", () => {
		expect(resolveTaskType("call")).toBe("call");
		expect(resolveTaskType(undefined)).toBe("todo");
		expect(resolveTaskType("garbage")).toBe("todo");
	});

	it("each type has a label, colour and icon", () => {
		for (const v of TASK_TYPE_VALUES) {
			expect(typeof TASK_TYPE_LABEL[v]).toBe("string");
			expect(TASK_TYPE_COLOR[v]).toMatch(/^#[0-9a-f]{6}$/i);
			expect(TASK_TYPE_ICON[v]).toBeTypeOf("object");
		}
	});

	it("includes the 5 expected types: todo, call, email, meeting, followup", () => {
		expect([...TASK_TYPE_VALUES].sort()).toEqual([
			"call",
			"email",
			"followup",
			"meeting",
			"todo",
		]);
	});
});

// ─── task-priority ───────────────────────────────────────────────────────────

describe("task-priority helpers", () => {
	it("isTaskPriority narrows known values + rejects unknown", () => {
		for (const v of TASK_PRIORITY_VALUES) {
			expect(isTaskPriority(v)).toBe(true);
		}
		expect(isTaskPriority("blocker")).toBe(false);
		expect(isTaskPriority(undefined)).toBe(false);
	});

	it("resolveTaskPriority falls back to 'normal' when value is unknown", () => {
		expect(resolveTaskPriority("urgent")).toBe("urgent");
		expect(resolveTaskPriority(undefined)).toBe("normal");
		expect(resolveTaskPriority("highest")).toBe("normal");
	});

	it("weights order urgent > high > normal > low", () => {
		expect(TASK_PRIORITY_WEIGHT.urgent).toBeGreaterThan(TASK_PRIORITY_WEIGHT.high);
		expect(TASK_PRIORITY_WEIGHT.high).toBeGreaterThan(TASK_PRIORITY_WEIGHT.normal);
		expect(TASK_PRIORITY_WEIGHT.normal).toBeGreaterThan(TASK_PRIORITY_WEIGHT.low);
	});

	it("each priority has a label and colour", () => {
		for (const v of TASK_PRIORITY_VALUES) {
			expect(typeof TASK_PRIORITY_LABEL[v]).toBe("string");
			expect(TASK_PRIORITY_COLOR[v]).toMatch(/^#[0-9a-f]{6}$/i);
		}
	});
});

"use client";

/**
 * Optimistic-update wrappers for task mutations.
 *
 * Per AGENTS.md "Every list-affecting mutation has `withOptimisticUpdate`":
 * tasks are rendered in 7 cached lists across the app:
 *   - `getDueToday` (org-wide TasksView + DueTodayWidget)
 *   - `getDueAndOverdue` (dashboard "Tasks" card + embedded panels)
 *   - `getNextUpcoming` (next-task fallback)
 *   - `listAllForOrg` (TasksView "All" tab)
 *   - `listForOrg` (status-filtered org-wide)
 *   - `listForPerson` (TasksPanel on profile / deal / company)
 *   - `listOpen` (pending-only per-person)
 *
 * In addition, the AI Pulse Ribbon's source store `aiNextActions`
 * surfaces rows that reference task `taskCode`s — e.g. "Follow-up T-042
 * needs you". The reactive trigger rebuilds those rows on every
 * relevant mutation; without an
 * optimistic patch a user who completes a task watches the ribbon row
 * linger until the next rebuild (the bug surfaced 2026-05-27). Each
 * task mutation below therefore ALSO drops any matching reminder row
 * from the `aiNextActions` cache so the ribbon clears immediately. The
 * server-side rebuild remains the source of truth — the optimistic
 * patch is purely a UX fix.
 *
 * The optimistic patcher walks every cached query of each shape, drops
 * `null` returns, and writes the patched array back. The
 * `bumpUpdatedAt: false` rule from AGENTS.md is honoured — we only set
 * fields the user changed; the server stamps `updatedAt`.
 */

import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Doc } from "@/convex/_generated/dataModel";
import { dropAiNextActionsByCode } from "@/core/ai/lib/aiNextActionsCache";

type Task = Doc<"tasks">;

/** Patch every cached task list with `transform`, dropping `null`. */
function patchTaskListsForOrg(
	store: Parameters<Parameters<ReturnType<typeof useMutation>["withOptimisticUpdate"]>[0]>[0],
	orgId: string,
	transform: (t: Task) => Task | null,
) {
	// `getDueToday`
	const dueToday = store.getAllQueries(api.crm.shared.tasks.queries.getDueToday);
	for (const { args: qa, value: list } of dueToday) {
		if (!list || qa.orgId !== orgId) continue;
		const next = list.map(transform).filter((t): t is Task => t !== null);
		store.setQuery(api.crm.shared.tasks.queries.getDueToday, qa, next);
	}
	// `getDueAndOverdue`
	const dueAndOverdue = store.getAllQueries(api.crm.shared.tasks.queries.getDueAndOverdue);
	for (const { args: qa, value: list } of dueAndOverdue) {
		if (!list || qa.orgId !== orgId) continue;
		const next = list.map(transform).filter((t): t is Task => t !== null);
		store.setQuery(api.crm.shared.tasks.queries.getDueAndOverdue, qa, next);
	}
	// `getNextUpcoming`
	const nextUpcoming = store.getAllQueries(api.crm.shared.tasks.queries.getNextUpcoming);
	for (const { args: qa, value: list } of nextUpcoming) {
		if (!list || qa.orgId !== orgId) continue;
		const next = list.map(transform).filter((t): t is Task => t !== null);
		store.setQuery(api.crm.shared.tasks.queries.getNextUpcoming, qa, next);
	}
	// `listAllForOrg`
	const allForOrg = store.getAllQueries(api.crm.shared.tasks.queries.listAllForOrg);
	for (const { args: qa, value: list } of allForOrg) {
		if (!list || qa.orgId !== orgId) continue;
		const next = list.map(transform).filter((t): t is Task => t !== null);
		store.setQuery(api.crm.shared.tasks.queries.listAllForOrg, qa, next);
	}
	// `listForOrg` (status-filterable)
	const forOrg = store.getAllQueries(api.crm.shared.tasks.queries.listForOrg);
	for (const { args: qa, value: list } of forOrg) {
		if (!list || qa.orgId !== orgId) continue;
		const next = list.map(transform).filter((t): t is Task => t !== null);
		store.setQuery(api.crm.shared.tasks.queries.listForOrg, qa, next);
	}
	// `listForPerson`
	const perPerson = store.getAllQueries(api.crm.shared.tasks.queries.listForPerson);
	for (const { args: qa, value: list } of perPerson) {
		if (!list || qa.orgId !== orgId) continue;
		const next = list.map(transform).filter((t): t is Task => t !== null);
		store.setQuery(api.crm.shared.tasks.queries.listForPerson, qa, next);
	}
	// `listOpen`
	const open = store.getAllQueries(api.crm.shared.tasks.queries.listOpen);
	for (const { args: qa, value: list } of open) {
		if (!list || qa.orgId !== orgId) continue;
		const next = list.map(transform).filter((t): t is Task => t !== null);
		store.setQuery(api.crm.shared.tasks.queries.listOpen, qa, next);
	}
}

/** Mark a task completed — patch every cached list to flip `status`. */
export function useCompleteTaskOptimistic() {
	return useMutation(api.crm.shared.tasks.mutations.complete).withOptimisticUpdate(
		(store, args) => {
			const now = Date.now();
			// Resolve the taskCode by looking the task up in any cached
			// list — required for the aiNextActions patch below.
			const taskCode = findTaskCodeInCache(store, args.orgId, args.taskId);
			patchTaskListsForOrg(store, args.orgId, (t) =>
				t._id === args.taskId
					? { ...t, status: "completed" as const, completedAt: now }
					: t,
			);
			// Also drop any AI Pulse Ribbon row that points at this
			// taskCode so the ribbon clears immediately. The cron rebuild
			// is the source of truth; this is purely a UX patch.
			if (taskCode) dropNextActionsForTaskCode(store, args.orgId, taskCode);
		},
	);
}

/** Update — patch fields on a task. Used by inline edits + drag. */
export function useUpdateTaskOptimistic() {
	return useMutation(api.crm.shared.tasks.mutations.update).withOptimisticUpdate(
		(store, args) => {
			const { orgId, taskId, ...rest } = args;
			const patch: Partial<Task> = {};
			for (const [k, v] of Object.entries(rest)) {
				if (v !== undefined) (patch as Record<string, unknown>)[k] = v;
			}
			patchTaskListsForOrg(store, orgId, (t) => (t._id === taskId ? { ...t, ...patch } : t));
		},
	);
}

/** Delete a task — drop the row from every cached list. */
export function useDeleteTaskOptimistic() {
	return useMutation(api.crm.shared.tasks.mutations.remove).withOptimisticUpdate(
		(store, args) => {
			const taskCode = findTaskCodeInCache(store, args.orgId, args.taskId);
			patchTaskListsForOrg(store, args.orgId, (t) => (t._id === args.taskId ? null : t));
			if (taskCode) dropNextActionsForTaskCode(store, args.orgId, taskCode);
		},
	);
}

// ─── aiNextActions cache helpers ─────────────────────────────────────────
//
// Pulse Ribbon rows reference tasks via `recordKind === "reminder"` +
// `recordCode === <taskCode>`. When the user completes or deletes the
// underlying task we want the ribbon row to disappear immediately —
// not after the next reactive rebuild round-trip. The shared
// `dropAiNextActionsByCode` from `core/ai/lib/aiNextActionsCache.ts`
// owns the actual cache patch; this module only resolves the taskCode
// from one of the cached task lists before delegating.

type StoreLike = Parameters<
	Parameters<ReturnType<typeof useMutation>["withOptimisticUpdate"]>[0]
>[0];

/** Look up a task's `taskCode` from any cached task list. */
function findTaskCodeInCache(store: StoreLike, orgId: string, taskId: string): string | null {
	const candidates = [
		api.crm.shared.tasks.queries.getDueToday,
		api.crm.shared.tasks.queries.getDueAndOverdue,
		api.crm.shared.tasks.queries.getNextUpcoming,
		api.crm.shared.tasks.queries.listAllForOrg,
		api.crm.shared.tasks.queries.listForOrg,
		api.crm.shared.tasks.queries.listForPerson,
		api.crm.shared.tasks.queries.listOpen,
	];
	for (const q of candidates) {
		const entries = store.getAllQueries(q);
		for (const { args: qa, value: list } of entries) {
			if (!list || (qa as { orgId?: string }).orgId !== orgId) continue;
			const hit = (list as Array<Task>).find((t) => t._id === taskId);
			if (hit?.taskCode) return hit.taskCode;
		}
	}
	return null;
}

/** Thin local alias for the shared helper — preserves the existing
 * call sites above without changing their signatures. */
function dropNextActionsForTaskCode(store: StoreLike, orgId: string, taskCode: string) {
	dropAiNextActionsByCode(store, orgId, "reminder", taskCode);
}

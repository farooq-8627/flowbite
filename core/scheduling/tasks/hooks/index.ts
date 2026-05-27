/**
 * Tasks hooks — Convex query + mutation bindings.
 *
 * Mutations use the optimistic-update wrappers from
 * `./useTaskMutations.ts` so quick-complete, drag-to-reschedule, inline
 * edits, and deletes update every cached list instantly — per AGENTS.md
 * "every list-affecting mutation has `withOptimisticUpdate`".
 */
"use client";

import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
	useCompleteTaskOptimistic,
	useDeleteTaskOptimistic,
	useUpdateTaskOptimistic,
} from "./useTaskMutations";

// ─── Read hooks ──────────────────────────────────────────────────────────────

/** All tasks for one person — used by `TasksPanel`. Optionally filter by `type`. */
export function useTasksForPerson(args: {
	orgId?: Id<"orgs">;
	personCode: string;
	type?: "todo" | "call" | "email" | "meeting" | "followup";
}) {
	return useQuery(
		api.crm.shared.tasks.queries.listForPerson,
		args.orgId
			? args.type
				? { orgId: args.orgId, personCode: args.personCode, type: args.type }
				: { orgId: args.orgId, personCode: args.personCode }
			: "skip",
	);
}

/**
 * Tasks for a specific entity (deal/company detail tab). Filtered to
 * `type === "followup"` by default (matches the legacy followups
 * surface); pass `type: undefined` to get every type.
 */
export function useTasksForEntity(args: {
	orgId?: Id<"orgs">;
	entityType?: string;
	entityId?: string;
	type?: "todo" | "call" | "email" | "meeting" | "followup";
}) {
	// We don't have a server-side entity-keyed index; the org-wide
	// listForOrg view is plenty efficient because deals + companies have
	// small per-entity volumes. Filter in memory at the consumer.
	const rows = useQuery(
		api.crm.shared.tasks.queries.listForOrg,
		args.orgId
			? args.type !== undefined
				? { orgId: args.orgId, type: args.type }
				: { orgId: args.orgId, type: "followup" as const }
			: "skip",
	);
	if (!rows || !args.entityType || !args.entityId) return rows;
	return rows.filter((t) => t.entityType === args.entityType && t.entityId === args.entityId);
}

/** Tasks due today (across the org). Used by `DueTodayWidget`. */
export function useTasksDueToday(args: { orgId?: Id<"orgs"> }) {
	return useQuery(
		api.crm.shared.tasks.queries.getDueToday,
		args.orgId ? { orgId: args.orgId } : "skip",
	);
}

/**
 * Tasks pending AND (overdue OR due today). Powers the dashboard
 * "Tasks" card so tasks dragged to yesterday still surface as overdue.
 */
export function useTasksDueAndOverdue(args: { orgId?: Id<"orgs">; lookbackDays?: number }) {
	return useQuery(
		api.crm.shared.tasks.queries.getDueAndOverdue,
		args.orgId
			? args.lookbackDays !== undefined
				? { orgId: args.orgId, lookbackDays: args.lookbackDays }
				: { orgId: args.orgId }
			: "skip",
	);
}

/**
 * Next N pending tasks strictly after today. Used by the "next task"
 * fallback shown when overdue + today are empty.
 *
 * Accepts an optional `enabled` flag so callers can gate the
 * subscription on "main bucket is empty" without conditionally calling
 * the hook (which would violate Rules of Hooks). When `enabled === false`
 * the underlying `useQuery` receives `"skip"` and contributes zero
 * subscription cost.
 */
export function useTasksNextUpcoming(args: {
	orgId?: Id<"orgs">;
	limit?: number;
	horizonDays?: number;
	enabled?: boolean;
}) {
	const enabled = args.enabled ?? true;
	return useQuery(
		api.crm.shared.tasks.queries.getNextUpcoming,
		args.orgId && enabled
			? {
					orgId: args.orgId,
					...(args.limit !== undefined ? { limit: args.limit } : {}),
					...(args.horizonDays !== undefined ? { horizonDays: args.horizonDays } : {}),
				}
			: "skip",
	);
}

/** ALL tasks for the org — powers TasksView (Today/Open/Completed/All tabs). */
export function useTasksAllForOrg(args: { orgId?: Id<"orgs"> }) {
	return useQuery(
		api.crm.shared.tasks.queries.listAllForOrg,
		args.orgId ? { orgId: args.orgId } : "skip",
	);
}

/** Status-filterable org-wide list (mirrors legacy listFollowupsForOrg). */
export function useTasksForOrg(args: {
	orgId?: Id<"orgs">;
	type?: "todo" | "call" | "email" | "meeting" | "followup";
	status?: "pending" | "completed";
}) {
	return useQuery(
		api.crm.shared.tasks.queries.listForOrg,
		args.orgId
			? {
					orgId: args.orgId,
					...(args.type ? { type: args.type } : {}),
					...(args.status ? { status: args.status } : {}),
				}
			: "skip",
	);
}

/** Pending tasks for one person. */
export function useTasksOpen(args: { orgId?: Id<"orgs">; personCode: string }) {
	return useQuery(
		api.crm.shared.tasks.queries.listOpen,
		args.orgId ? { orgId: args.orgId, personCode: args.personCode } : "skip",
	);
}

// ─── Write hooks ─────────────────────────────────────────────────────────────

/**
 * Create a task. No optimistic update — the server assigns the id +
 * taskCode + (for type === "followup") the org-default dueAt + priority.
 * The lists naturally re-render in ~250ms.
 */
export function useCreateTask() {
	return useMutation(api.crm.shared.tasks.mutations.create);
}

/** Mark a task completed — instant via optimistic update. */
export function useCompleteTask() {
	return useCompleteTaskOptimistic();
}

/** Update task fields — instant via optimistic update. */
export function useUpdateTask() {
	return useUpdateTaskOptimistic();
}

/** Delete a task — instant via optimistic update. */
export function useDeleteTask() {
	return useDeleteTaskOptimistic();
}

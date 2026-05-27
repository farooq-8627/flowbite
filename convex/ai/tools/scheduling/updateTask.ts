/**
 * convex/ai/tools/scheduling/updateTask.ts
 *
 * Two-step task edit:
 *
 *   update_task (propose)   → confirmation card with patch summary
 *      ↓ user approves
 *   commit_update_task      → calls tasks/mutations:updateForAI
 *
 * Targeting:
 *   - `taskCode` (T-XXX) — preferred, what users see in the timeline.
 *   - `taskId`   — escape hatch when the AI already has the raw id from
 *                  a prior list query (`list_tasks`).
 *
 * Permission: assignee OR `tasks.manage`. The mutation re-verifies at
 * write time, so the tool-surface filter just uses `tasks.manage` as the
 * strongest gate.
 *
 * Replaces `updateReminder.ts` per TASKS-RENAME-PLAN.md (Stage 4C).
 */
import { z } from "zod";
import { internal } from "../../../_generated/api";
import type { CascadeImpactResult } from "../../queries/cascadeImpact";
import { registerTool } from "../../toolRegistry";
import {
	coerceInt,
	optionalNumber,
	optionalString,
	propose,
	requirePermission,
	runTool,
	toolMutation,
} from "../_shared";
import { getSchedulingCtx } from "./_context";

const PRIORITY_ENUM = z.enum(["low", "normal", "high", "urgent"]);
const TYPE_ENUM = z.enum(["todo", "call", "email", "meeting", "followup"]);

const schema = z
	.object({
		taskCode: optionalString().describe("Public task code (T-XXX). Preferred over taskId."),
		taskId: optionalString().describe(
			"Raw Convex _id. Use only when you have it from a prior list query.",
		),
		title: optionalString().describe("New task title."),
		note: optionalString().describe("New free-form note."),
		dueAt: optionalNumber(coerceInt() as never).describe(
			"New due timestamp in milliseconds (Unix ms).",
		),
		assignedTo: optionalString().describe(
			"User _id of the new assignee. Use list_members to resolve.",
		),
		type: z.optional(TYPE_ENUM).describe("Change the task type."),
		priority: z
			.optional(PRIORITY_ENUM)
			.describe("Priority chip — low / normal / high / urgent."),
	})
	.refine((v) => !!v.taskCode || !!v.taskId, {
		message: "Pass exactly one of taskCode or taskId.",
	})
	.refine(
		(v) =>
			v.title !== undefined ||
			v.note !== undefined ||
			v.dueAt !== undefined ||
			v.assignedTo !== undefined ||
			v.type !== undefined ||
			v.priority !== undefined,
		{
			message:
				"At least one of title / note / dueAt / assignedTo / type / priority must be set.",
		},
	);

registerTool({
	name: "update_task",
	layer: "always",
	permission: "tasks.manage",
	confirmation: "twoStep",
	approvalCategory: "schedule",
	description:
		"Edit a task's title, note, due date, assignee, type, or priority. Pass taskCode (T-XXX) or taskId.",
	instruction: {
		whenToCall:
			"User asks to push / postpone / reschedule / change / reassign / re-prioritise a task. Always show the confirmation card before writing.",
		whenNotToCall:
			"the user wants to mark the task DONE (use complete_task or complete_task_by_code) OR delete it (use delete_entity with entityType='task').",
		preflight: ["list_tasks", "list_tasks_for_person"],
		requiredClarifications: ["taskCode"],
		synonyms: [
			"push task",
			"postpone task",
			"reschedule task",
			"reassign task",
			"change priority",
		],
		goodExample: {
			description: "User: 'Push T-003 to next Tuesday at 10am.' (model converts to ms)",
			args: { taskCode: "T-003", dueAt: 1716537600000 },
		},
		badExample: {
			description: "User: 'Reschedule the task with Sarah.'",
			args: { taskCode: "Sarah" },
			whyBad: "taskCode must be T-XXX. Call list_tasks_for_person first to find the right code.",
		},
	},
	runbook: {
		onSuccess:
			"Reply with one short sentence using the taskCode + the human-readable change ('Pushed T-003 to Tuesday 10am.').",
		onValidationError:
			"If the code doesn't resolve, do NOT retry — call list_tasks_for_person on the right person first.",
		onPermissionDenied:
			"Tell the user they need tasks.manage permission OR be assigned to the task.",
	},
	schema,
	execute: async (args) => {
		return runTool(async () => {
			const tc = getSchedulingCtx();
			requirePermission(tc.permissions, "tasks.manage");

			let displayLabel: string;
			let resolvedTaskId: string | undefined = args.taskId;

			if (args.taskCode && !args.taskId) {
				const impact = (await tc.ctx.runQuery(
					internal.ai.queries.cascadeImpact.getEntityCascadeImpact,
					{
						orgId: tc.orgId,
						userId: tc.userId,
						entityType: "task" as const,
						taskCode: args.taskCode,
					},
				)) as CascadeImpactResult;
				if (impact.kind === "not_found") {
					return {
						ok: false as const,
						code: "NOT_FOUND",
						error: `No task found for ${args.taskCode}. Call list_tasks_for_person first.`,
					};
				}
				resolvedTaskId = impact.entityId;
				displayLabel = `${impact.canonicalCode ?? impact.entityId} (${impact.displayName})`;
			} else {
				displayLabel = args.taskId ?? args.taskCode ?? "(unknown)";
			}

			const patchParts: string[] = [];
			if (args.title !== undefined) patchParts.push(`title="${args.title}"`);
			if (args.note !== undefined) {
				const preview = args.note.length > 60 ? `${args.note.slice(0, 60)}…` : args.note;
				patchParts.push(`note="${preview}"`);
			}
			if (args.dueAt !== undefined) {
				const dueDate = new Date(args.dueAt);
				patchParts.push(`due=${dueDate.toLocaleString()}`);
			}
			if (args.assignedTo !== undefined) patchParts.push(`assignedTo=${args.assignedTo}`);
			if (args.type !== undefined) patchParts.push(`type=${args.type}`);
			if (args.priority !== undefined) patchParts.push(`priority=${args.priority}`);

			return propose(
				"update_task",
				{ ...args, taskId: resolvedTaskId },
				{
					title: `Update task ${displayLabel}`,
					fields: [
						{ label: "Task", value: displayLabel },
						{ label: "Patch", value: patchParts.join(" · ") },
					],
				},
			);
		});
	},
});

registerTool({
	name: "commit_update_task",
	layer: "always",
	permission: "tasks.manage",
	confirmation: "none",
	description:
		"Internal: commit a pre-approved update_task call. Do not call without prior update_task approval.",
	schema: z
		.object({
			taskCode: optionalString(),
			taskId: optionalString(),
			title: optionalString(),
			note: optionalString(),
			dueAt: optionalNumber(coerceInt() as never),
			assignedTo: optionalString(),
			type: z.optional(TYPE_ENUM),
			priority: z.optional(PRIORITY_ENUM),
		})
		.refine((v) => !!v.taskCode || !!v.taskId, {
			message: "Pass exactly one of taskCode or taskId.",
		}),
	execute: async (args) =>
		runTool(async () => {
			const tc = getSchedulingCtx();
			requirePermission(tc.permissions, "tasks.manage");

			let taskId = args.taskId;
			let canonicalCode: string | undefined;
			if (!taskId && args.taskCode) {
				const impact = (await tc.ctx.runQuery(
					internal.ai.queries.cascadeImpact.getEntityCascadeImpact,
					{
						orgId: tc.orgId,
						userId: tc.userId,
						entityType: "task" as const,
						taskCode: args.taskCode,
					},
				)) as CascadeImpactResult;
				if (impact.kind === "not_found") {
					return {
						ok: false as const,
						code: "NOT_FOUND",
						error: `No task found for ${args.taskCode}.`,
					};
				}
				taskId = impact.entityId;
				canonicalCode = impact.canonicalCode;
			}
			if (!taskId) {
				return {
					ok: false as const,
					code: "INVALID_ARGS",
					error: "No task identifier resolved — pass taskCode or taskId.",
				};
			}

			await toolMutation(tc, "crm/shared/tasks/mutations:update", {
				orgId: tc.orgId,
				taskId,
				...(args.title !== undefined ? { title: args.title } : {}),
				...(args.note !== undefined ? { note: args.note } : {}),
				...(args.dueAt !== undefined ? { dueAt: args.dueAt } : {}),
				...(args.assignedTo !== undefined ? { assignedTo: args.assignedTo } : {}),
				...(args.type !== undefined ? { type: args.type } : {}),
				...(args.priority !== undefined ? { priority: args.priority } : {}),
			});

			const summaryRows: Array<{ label: string; value: string }> = [
				{ label: "Task", value: canonicalCode ?? taskId },
			];
			if (args.title !== undefined) summaryRows.push({ label: "Title", value: args.title });
			if (args.dueAt !== undefined) {
				summaryRows.push({
					label: "New due",
					value: new Date(args.dueAt).toLocaleString(),
				});
			}
			if (args.priority !== undefined) {
				summaryRows.push({ label: "Priority", value: args.priority });
			}
			if (args.type !== undefined) {
				summaryRows.push({ label: "Type", value: args.type });
			}
			if (args.assignedTo !== undefined) {
				summaryRows.push({ label: "Assigned to", value: args.assignedTo });
			}

			return {
				ok: true as const,
				data: { taskId, taskCode: canonicalCode },
				display: { kind: "task" as const, taskId },
				summary: {
					headline: `Updated task ${canonicalCode ?? taskId}`,
					table: summaryRows,
					suggestedNext: [
						{
							label: "Mark complete",
							intent: canonicalCode
								? `Mark ${canonicalCode} complete`
								: "Mark this task complete",
						},
						{
							label: "Cancel it",
							intent: canonicalCode ? `Cancel ${canonicalCode}` : "Cancel this task",
						},
					],
				},
			};
		}),
});

/**
 * convex/ai/tools/tasks.ts
 *
 * Canonical task AI tools — replaces the legacy `create_reminder` /
 * `create_followup` / `complete_reminder` / `complete_followup_by_code`
 * / `cancel_followup_by_code` family from `notesReminders.ts` per
 * TASKS-RENAME-PLAN.md (Stage 4C, 2026-05-27).
 *
 * Tools exposed:
 *   - create_task                — atomic. Single tool replaces both
 *                                  legacy create_reminder + create_followup
 *                                  via the `type` discriminator
 *                                  (todo/call/email/meeting/followup).
 *   - complete_task              — atomic. By internal taskId.
 *   - complete_task_by_code      — atomic. By public T-XXX code.
 *   - cancel_task_by_code        — atomic. By public T-XXX code (delete).
 *   - list_tasks                 — atomic. Org-wide listing.
 *   - list_tasks_for_person      — atomic. Per-person listing.
 *   - get_task_by_code           — atomic. Lookup by T-XXX (fixes the
 *                                  FU-004 bug — `get_entity_detail`
 *                                  routes here for entityType="task").
 *   - update_task                — twoStep. Edit title / dueAt /
 *                                  assignee / priority / type. Lives
 *                                  in scheduling/updateTask.ts (registered
 *                                  via the scheduling barrel) so Stage 8
 *                                  cron-driven scheduling features can
 *                                  share its context.
 */

import { z } from "zod";
import { internal } from "../../_generated/api";
import { codeString } from "../../_shared/synonyms";
import { registerTool } from "../toolRegistry";
import { coerceInt, requirePermission, runTool, type ToolContext, toolMutation } from "./_shared";

let _toolCtx: ToolContext | null = null;
export function setTasksContext(ctx: ToolContext): void {
	_toolCtx = ctx;
}
function getCtx(): ToolContext {
	if (!_toolCtx) throw new Error("Tool context not initialized");
	return _toolCtx;
}

const TASK_TYPE = z.enum(["todo", "call", "email", "meeting", "followup"]);
const TASK_PRIORITY = z.enum(["low", "normal", "high", "urgent"]);

// ─── create_task ─────────────────────────────────────────────────────────────

registerTool({
	name: "create_task",
	layer: "always",
	permission: "tasks.create",
	confirmation: "none",
	description: `
Create a task with a type discriminator: todo / call / email / meeting / followup.
Linked to an entity via personCode / dealCode, or self-anchored as a personal todo.
Type "followup" auto-applies the org cadence defaults when dueAt is omitted.
  `.trim(),
	instruction: {
		whenToCall:
			"User asks to schedule, follow up, remind, set a task, plan a call/email/meeting. Pick the right `type` from context: 'remind me to send the report' → todo; 'call X tomorrow' → call; 'follow up with Sarah' → followup. Type 'followup' REQUIRES personCode.",
		whenNotToCall:
			"the user is editing an existing task (use update_task) OR completing one (use complete_task / complete_task_by_code).",
		preflight: ["search_crm"],
		requiredClarifications: ["title", "type"],
		synonyms: [
			"set reminder",
			"remind me",
			"schedule task",
			"calendar event",
			"follow up",
			"check in",
			"next-touch",
			"call back",
		],
		goodExample: {
			description: "User: 'Follow up with P-001 next Tuesday at 10am.'",
			args: {
				type: "followup",
				personCode: "P-001",
				title: "Follow-up call",
				dueAt: 1716537600000,
				priority: "normal",
			},
		},
		badExample: {
			description: "User: 'Follow up with Sarah.'",
			args: { type: "followup", personCode: "Sarah", title: "" },
			whyBad: "personCode must be a P-XXX code. Resolve via search_crm first.",
		},
	},
	runbook: {
		onSuccess:
			"Confirm in one short sentence with the human-readable due date and the task code. The task card renders below.",
		onValidationError:
			"If personCode doesn't resolve, call search_crm first. Don't retry with the same code.",
		onPermissionDenied:
			"Tell the user they need tasks.create permission. Suggest contacting an admin.",
	},
	schema: z.object({
		type: TASK_TYPE.describe(
			"Task type. todo = generic to-do, call = phone call, email = outbound email, meeting = scheduled meeting, followup = CRM cadence touch (requires personCode).",
		),
		title: z.string().describe("Short task title."),
		personCode: z
			.optional(z.string())
			.describe("Person code (P-XXX). Required when type is 'followup'."),
		dealCode: z
			.optional(z.string())
			.describe("Deal code (D-XXX) when this task is about a deal."),
		entityType: z
			.optional(z.string())
			.describe(
				"Optional explicit entity attachment. Defaults derived from personCode/dealCode.",
			),
		entityId: z.optional(z.string()).describe("Optional explicit entity id."),
		dueAt: z
			.optional(coerceInt() as unknown as z.ZodNumber)
			.describe(
				"Due timestamp in milliseconds. Required for non-followup types. For type=followup, defaults to today + org.settings.taskDefaults.defaultDueOffsetDays.",
			),
		note: z.optional(z.string()).describe("Free-form note attached to the task."),
		priority: z
			.optional(TASK_PRIORITY)
			.describe("Priority chip — low / normal / high / urgent."),
		assignedTo: z
			.optional(z.string())
			.describe("User _id of the assignee. Defaults to the calling user."),
	}),
	execute: async (args) => {
		return runTool(async () => {
			const { orgId, userId, permissions } = getCtx();
			requirePermission(permissions, "tasks.create");
			const result = (await toolMutation(getCtx(), "crm/shared/tasks/mutations:create", {
				orgId,
				type: args.type,
				title: args.title,
				...(args.personCode ? { personCode: args.personCode } : {}),
				...(args.dealCode ? { dealCode: args.dealCode } : {}),
				...(args.entityType ? { entityType: args.entityType } : {}),
				...(args.entityId ? { entityId: args.entityId } : {}),
				...(args.dueAt !== undefined ? { dueAt: args.dueAt } : {}),
				...(args.note ? { note: args.note } : {}),
				...(args.priority ? { priority: args.priority } : {}),
				assignedTo: args.assignedTo ?? userId,
			})) as { taskId: string; taskCode: string; dueAt: number; priority?: string };
			const dueLabel = new Date(result.dueAt).toLocaleString();
			return {
				ok: true as const,
				data: result,
				display: {
					kind: "task" as const,
					taskId: result.taskId,
				},
				summary: {
					headline: `Created ${result.taskCode}: ${args.title}`,
					table: [
						{ label: "Type", value: args.type },
						{ label: "Due", value: dueLabel },
						...(args.personCode ? [{ label: "For", value: args.personCode }] : []),
						...(result.priority ? [{ label: "Priority", value: result.priority }] : []),
					],
					suggestedNext: [
						{
							label: "Add note",
							intent: args.personCode
								? `Add a note to ${args.personCode}`
								: "Add a note about this",
						},
					],
				},
			};
		});
	},
});

// ─── complete_task ───────────────────────────────────────────────────────────

registerTool({
	name: "complete_task",
	layer: "always",
	permission: "tasks.manage",
	confirmation: "none",
	description: "Mark a task as completed using its internal taskId.",
	instruction: {
		whenToCall:
			"Use when you already have the taskId from a prior list/search call AND the user says they finished it ('done', 'completed', 'taken care of').",
		whenNotToCall:
			"the user mentions a public T-XXX code — call complete_task_by_code instead. If completion was actually a cancel, call cancel_task_by_code.",
		requiredClarifications: ["taskId"],
		synonyms: ["done", "complete", "mark complete", "finished"],
		goodExample: {
			description: "User: 'Mark that task done.' (after model just listed tasks)",
			args: { taskId: "kg2j..." },
		},
		badExample: {
			description: "User: 'Cancel T-003.'",
			args: { taskId: "T-003" },
			whyBad: "T-003 is a public code, not a taskId. Use cancel_task_by_code.",
		},
	},
	runbook: {
		onSuccess: "Confirm in one short sentence. The task card already shows the new state.",
		onPermissionDenied:
			"Tell the user they need tasks.manage permission OR be assigned to the task.",
	},
	schema: z.object({
		taskId: z.string().describe("Internal _id of the task to mark complete."),
	}),
	execute: async ({ taskId }) => {
		return runTool(async () => {
			const { orgId, permissions } = getCtx();
			requirePermission(permissions, "tasks.manage");
			await toolMutation(getCtx(), "crm/shared/tasks/mutations:complete", { orgId, taskId });
			return {
				ok: true as const,
				data: { taskId },
				display: { kind: "task" as const, taskId },
				summary: {
					headline: "Task marked complete",
					suggestedNext: [
						{ label: "Schedule the next one", intent: "Set a follow-up task" },
					],
				},
			};
		});
	},
});

// ─── complete_task_by_code ───────────────────────────────────────────────────

registerTool({
	name: "complete_task_by_code",
	layer: "always",
	permission: "tasks.manage",
	confirmation: "none",
	description:
		"Mark a task complete using its public code (T-001 / T-042 / …). Users see this code in the timeline and dashboard; they don't know the internal taskId.",
	instruction: {
		whenToCall:
			"User refers to a task by its public T-XXX code and says it's done ('completed T-003', 'mark T-7 as called').",
		whenNotToCall:
			"the user mentions a generic task without a code — use complete_task with the taskId. If the code doesn't resolve, do NOT retry with a different code; surface the failure.",
		requiredClarifications: ["taskCode"],
		synonyms: ["mark task done", "complete task", "finished task"],
		goodExample: {
			description: "User: 'Mark T-003 as completed.'",
			args: { taskCode: "T-003" },
		},
		badExample: {
			description: "User: 'Mark the task with Sarah done.'",
			args: { taskCode: "Sarah" },
			whyBad: "taskCode must be T-XXX. Resolve via list_tasks_for_person first.",
		},
	},
	runbook: {
		onSuccess:
			"Confirm in one short sentence using the taskCode. If `alreadyCompleted: true`, mention it was already done.",
		onValidationError:
			"If the code doesn't resolve, do NOT retry — call search_crm to find the right person, then list_tasks_for_person.",
		onPermissionDenied:
			"Tell the user they need tasks.manage permission OR be assigned to the task.",
	},
	schema: z.object({
		taskCode: codeString().describe("Task code (T-XXX)."),
	}),
	execute: async ({ taskCode }) => {
		return runTool(async () => {
			const { orgId, permissions } = getCtx();
			requirePermission(permissions, "tasks.manage");
			const result = (await toolMutation(
				getCtx(),
				"crm/shared/tasks/mutations:completeByCode",
				{ orgId, taskCode },
			)) as { taskCode: string; taskId: string; alreadyCompleted: boolean };
			return {
				ok: true as const,
				data: result,
				display: { kind: "task" as const, taskId: result.taskId },
				summary: {
					headline: result.alreadyCompleted
						? `${result.taskCode} was already complete`
						: `Completed ${result.taskCode}`,
					suggestedNext: [
						{ label: "Schedule next task", intent: "Set a follow-up task" },
					],
				},
			};
		});
	},
});

// ─── cancel_task_by_code ─────────────────────────────────────────────────────

registerTool({
	name: "cancel_task_by_code",
	layer: "always",
	permission: "tasks.manage",
	confirmation: "none",
	description:
		"Cancel (delete) a task using its public code (T-001 / T-042 / …). Cancellation is permanent — there is no undo. Use complete_task_by_code if the work was actually done.",
	instruction: {
		whenToCall:
			"User explicitly says cancel/delete/remove a task by its T-XXX code. If they said 'completed' or 'done', use complete_task_by_code instead — cancellation is destructive.",
		whenNotToCall:
			"the work was actually done — use complete_task_by_code so the timeline records completion.",
		requiredClarifications: ["taskCode"],
		synonyms: ["cancel task", "delete task", "remove T", "drop the task"],
		goodExample: {
			description: "User: 'Cancel T-003, the deal fell through.'",
			args: { taskCode: "T-003" },
		},
		badExample: {
			description: "User: 'Mark T-003 as done.'",
			args: { taskCode: "T-003" },
			whyBad: "User said 'done', not 'cancel'. Call complete_task_by_code instead so the activity log records completion.",
		},
	},
	runbook: {
		onSuccess: "Confirm in one short sentence using the taskCode (e.g. 'Cancelled T-003.').",
		onValidationError:
			"If the code doesn't resolve, do NOT retry — call search_crm to find the right person, then list_tasks_for_person.",
		onPermissionDenied:
			"Tell the user they need tasks.manage permission OR be assigned to the task.",
	},
	schema: z.object({
		taskCode: codeString().describe("Task code (T-XXX)."),
	}),
	execute: async ({ taskCode }) => {
		return runTool(async () => {
			const { orgId, permissions } = getCtx();
			requirePermission(permissions, "tasks.manage");
			const result = (await toolMutation(
				getCtx(),
				"crm/shared/tasks/mutations:cancelByCode",
				{ orgId, taskCode },
			)) as { taskCode: string; taskId: string };
			return {
				ok: true as const,
				data: result,
				display: `🗑 Cancelled task ${result.taskCode}.`,
				summary: {
					headline: `Cancelled ${result.taskCode}`,
					table: [{ label: "Status", value: "Cancelled (permanent)" }],
				},
			};
		});
	},
});

// ─── list_tasks ──────────────────────────────────────────────────────────────

registerTool({
	name: "list_tasks",
	layer: "always",
	permission: "tasks.view",
	confirmation: "none",
	description:
		"List tasks across the org. Optional filters by type and status. Members without tasks.manage see only their own assigned tasks.",
	instruction: {
		whenToCall:
			"User asks 'what tasks do I have?', 'show open follow-ups', 'list pending tasks', 'what's on my plate?'",
		whenNotToCall:
			"the user already specified a person — use list_tasks_for_person for tighter scope.",
		synonyms: ["my tasks", "open tasks", "pending tasks", "to-dos", "todos"],
		goodExample: {
			description: "User: 'Show me all open follow-ups.'",
			args: { type: "followup", status: "pending" },
		},
		badExample: {
			description: "User: 'List Sarah's follow-ups.'",
			args: {},
			whyBad: "User specified a person — call list_tasks_for_person with personCode.",
		},
	},
	runbook: {
		onSuccess:
			"If 0 results, say so plainly. If many, summarise count + top 3 by due date. The model can call get_task_by_code afterwards for details.",
	},
	schema: z.object({
		type: z.optional(TASK_TYPE).describe("Optional filter by task type."),
		status: z.optional(z.enum(["pending", "completed"])).describe("Optional filter by status."),
	}),
	execute: async (args) => {
		return runTool(async () => {
			const { orgId, userId, permissions } = getCtx();
			requirePermission(permissions, "tasks.view");
			const tc = getCtx();
			const result = (await tc.ctx.runQuery(
				internal.crm.shared.tasks.queries.listForOrgForAI,
				{
					orgId,
					userId,
					...(args.type ? { type: args.type } : {}),
					...(args.status ? { status: args.status } : {}),
				},
			)) as Array<{
				_id: string;
				taskCode: string;
				type: string;
				title: string;
				dueAt: number;
				status: string;
				priority?: string;
				personCode?: string;
				dealCode?: string;
			}>;
			const top = [...result].sort((a, b) => a.dueAt - b.dueAt).slice(0, 5);
			return {
				ok: true as const,
				data: { tasks: result },
				summary: {
					headline:
						result.length === 0
							? "No matching tasks"
							: `${result.length} task${result.length === 1 ? "" : "s"}`,
					table: top.map((t) => ({
						label: t.taskCode,
						value: `${t.title} · ${new Date(t.dueAt).toLocaleDateString()} · ${t.type}${t.priority ? ` · ${t.priority}` : ""}`,
					})),
				},
			};
		});
	},
});

// ─── list_tasks_for_person ───────────────────────────────────────────────────

registerTool({
	name: "list_tasks_for_person",
	layer: "always",
	permission: "tasks.view",
	confirmation: "none",
	description: "List tasks attached to a specific person. Optional filter by type.",
	instruction: {
		whenToCall:
			"User asks for a person's tasks/follow-ups by name or P-XXX code. Use this before completing or cancelling any of their tasks so you have the right T-XXX codes.",
		whenNotToCall: "the user wants org-wide listing — use list_tasks.",
		preflight: ["search_crm"],
		requiredClarifications: ["personCode"],
		synonyms: ["sarah's tasks", "p-001 follow-ups", "their open tasks"],
		goodExample: {
			description: "User: 'Show all follow-ups for P-001.'",
			args: { personCode: "P-001", type: "followup" },
		},
		badExample: {
			description: "User: 'List Sarah's tasks.'",
			args: { personCode: "Sarah" },
			whyBad: "personCode must be P-XXX. Call search_crm first.",
		},
	},
	runbook: {
		onSuccess:
			"List up to 5 tasks newest-first. If 0, mention it explicitly. The user can drill into one via get_task_by_code.",
	},
	schema: z.object({
		personCode: z.string().describe("Person code (P-XXX)."),
		type: z.optional(TASK_TYPE).describe("Optional filter by task type."),
	}),
	execute: async ({ personCode, type }) => {
		return runTool(async () => {
			const { orgId, userId, permissions } = getCtx();
			requirePermission(permissions, "tasks.view");
			const tc = getCtx();
			const result = (await tc.ctx.runQuery(
				internal.crm.shared.tasks.queries.listForPersonForAI,
				{ orgId, userId, personCode, ...(type ? { type } : {}) },
			)) as Array<{
				_id: string;
				taskCode: string;
				type: string;
				title: string;
				dueAt: number;
				status: string;
			}>;
			const sorted = [...result].sort((a, b) => a.dueAt - b.dueAt).slice(0, 5);
			return {
				ok: true as const,
				data: { personCode, tasks: result },
				summary: {
					headline:
						result.length === 0
							? `No tasks for ${personCode}`
							: `${result.length} task${result.length === 1 ? "" : "s"} for ${personCode}`,
					table: sorted.map((t) => ({
						label: t.taskCode,
						value: `${t.title} · ${new Date(t.dueAt).toLocaleDateString()} · ${t.type} · ${t.status}`,
					})),
				},
			};
		});
	},
});

// ─── get_task_by_code ────────────────────────────────────────────────────────

registerTool({
	name: "get_task_by_code",
	layer: "always",
	permission: "tasks.view",
	confirmation: "none",
	description:
		"Look up a single task by its public T-XXX code. Fixes the original FU-004 bug — get_entity_detail now routes entityType='task' to this tool.",
	instruction: {
		whenToCall:
			"User asks 'what's T-003 about?' / 'show me T-007 details' / clicks a T-XXX link. Use this BEFORE complete_task_by_code or cancel_task_by_code so you can confirm the task before destructive action.",
		whenNotToCall: "the user only has a person/deal — use list_tasks_for_person instead.",
		requiredClarifications: ["taskCode"],
		synonyms: ["task details", "show T", "what is T-"],
		goodExample: {
			description: "User: 'Open T-007.'",
			args: { taskCode: "T-007" },
		},
	},
	runbook: {
		onSuccess:
			"Render a one-line summary with title, due date, status, type, priority. The task card renders below.",
		onValidationError:
			"If the code doesn't resolve, surface the failure plainly — DO NOT retry with a different code.",
	},
	schema: z.object({
		taskCode: codeString().describe("Task code (T-XXX)."),
	}),
	execute: async ({ taskCode }) => {
		return runTool(async () => {
			const { orgId, userId, permissions } = getCtx();
			requirePermission(permissions, "tasks.view");
			const tc = getCtx();
			const task = (await tc.ctx.runQuery(
				internal.crm.shared.tasks.queries.getByTaskCodeForAI,
				{ orgId, userId, taskCode },
			)) as null | {
				_id: string;
				taskCode: string;
				type: string;
				title: string;
				dueAt: number;
				status: string;
				priority?: string;
				note?: string;
				personCode?: string;
				dealCode?: string;
			};
			if (!task) {
				return {
					ok: false as const,
					code: "NOT_FOUND",
					error: `No task found with code ${taskCode}.`,
				};
			}
			return {
				ok: true as const,
				data: { task },
				display: { kind: "task" as const, taskId: task._id },
				summary: {
					headline: `${task.taskCode}: ${task.title}`,
					table: [
						{ label: "Type", value: task.type },
						{ label: "Status", value: task.status },
						{ label: "Due", value: new Date(task.dueAt).toLocaleString() },
						...(task.priority ? [{ label: "Priority", value: task.priority }] : []),
						...(task.personCode ? [{ label: "Person", value: task.personCode }] : []),
						...(task.dealCode ? [{ label: "Deal", value: task.dealCode }] : []),
					],
				},
			};
		});
	},
});

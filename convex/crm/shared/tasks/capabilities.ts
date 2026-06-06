/**
 * Tasks capabilities — the AI-callable surface for the canonical
 * scheduling table (`convex/schema/scheduling.ts → tasks`). Wraps the
 * existing `*ForAI` internal twins in `mutations.ts` + `queries.ts`;
 * never re-implements business logic.
 *
 * Where this fits in the system:
 *
 *     ┌─────────────────────────┐   user message      ┌──────────────────┐
 *     │  AI host (runtime/host) │ ───────────────────▶│ CapabilityWrapper│
 *     │  router preloads "tasks"│ ◀───── envelope ────│ (registry/wrapper)│
 *     └─────────────────────────┘                     └──────────────────┘
 *                                                              │
 *                                                              ▼  cap.run(ctx, args)
 *                                              ┌──────────────────────────────┐
 *                                              │ this file's run() body       │
 *                                              │ · reads org timezone         │
 *                                              │ · coerces dueAt              │
 *                                              │ · calls *ForAI mutation/query│
 *                                              └──────────────────────────────┘
 *                                                              │
 *                                                              ▼
 *                                  internal.crm.shared.tasks.{mutations,queries}.*ForAI
 *                                  → public *Impl helper → ctx.db.{insert,patch,delete}
 *
 * Capabilities exported here (8 total — all in the `tasks` group):
 *
 *   create_task            create a row of any type (todo/call/email/meeting/followup)
 *   complete_task          mark completed by internal taskId
 *   complete_task_by_code  mark completed by public T-NNN code
 *   cancel_task_by_code    HARD-DELETE a task by public T-NNN code
 *   update_task            patch (title/note/dueAt/assignedTo/type/priority) by code
 *   list_tasks             org-wide listing, optional type+status filters
 *   list_tasks_for_person  per-person listing, optional type filter
 *   get_task_by_code       single-row lookup by T-NNN
 *
 * Group invariants (also baked into the playbook below — keep both in sync):
 *
 *   1. The "followup" type REQUIRES `personCode`. The mutation throws if
 *      it's missing; the AI must run `search_crm` first to resolve the
 *      lead/contact name → P-NNN.
 *   2. `dueAt` is timezone-sensitive. The schema field
 *      ({@link "../../../ai/registry/coerce".field.timestampLazy}) does
 *      NOT pre-coerce the value — `run()` reads the live org timezone
 *      via `internal.orgs.queries.getTimezoneForAI` and feeds the raw
 *      input through `coerceTimestamp(value, orgTz)`. Schema-time
 *      timezone (the eager `field.timestamp(tz)` variant) is wrong here
 *      because the timezone is per-tenant and the prompt is cached
 *      cross-tenant — see `coerce.ts:field.timestampLazy` for the long
 *      version.
 *   3. The AI never sees the org's timezone. It can pass:
 *        · an epoch number (always absolute)
 *        · an ISO string with explicit offset (always absolute)
 *        · a natural-language phrase ("next Tuesday", "tomorrow 9am")
 *      Strings without an explicit offset get re-anchored to the org's
 *      local time. This is the deterministic kill of the "dueAt class"
 *      of bugs called out in `AI-TOOLING-BUILD-STAGES.md` S4.
 *   4. `resolveRef` (registry/resolveRef.ts) walks args and finds the
 *      `personCode` field — it injects `entityType:"lead"` + `entityId`
 *      into args. The task mutation also accepts `entityType`/`entityId`
 *      for explicit anchoring, so `run()` MUST strip those fields
 *      before calling `createForAI`, otherwise the task anchors to the
 *      lead row instead of the person identity (diff: a converted
 *      contact's tasks would point at the dead lead row).
 *   5. `cancel_task_by_code` is a hard delete and permanent. Ranked
 *      `reversible` — not `irreversible` — because the user can recreate
 *      via `create_task` and the activity log preserves the audit trail.
 *      This matches the legacy V1 confirmation policy. If S10 widens the
 *      `irreversible` fence to single-row destructive ops, flip the
 *      classification here in the same edit.
 *
 * AGENTS.md cross-references:
 *   · RULE: AI tools call `*ForAI` internal twins, NEVER public mutations
 *     — every `runMutation`/`runQuery` below targets the internal twin.
 *   · Decision #12 — `personCode` is the stable identity; tasks attach
 *     by personCode (string), not by lead/contact `_id`.
 *   · Decision #21 — ranking on `reminders.write` shared-scope rate
 *     limit lives inside the underlying mutation, not at this layer.
 */
import { z } from "zod";
import { internal } from "../../../_generated/api";
import type { Id } from "../../../_generated/dataModel";
import { coerceTimestamp, field } from "../../../ai/registry/coerce";
import { defineCapability } from "../../../ai/registry/define";
import { defineGroup } from "../../../ai/registry/groups";
import { failed, ok, repair } from "../../../ai/registry/result";
import type { CapabilityCtx, CapabilityResult } from "../../../ai/registry/types";

// ─── Closed unions (mirror the schema validators) ───────────────────────────

const TASK_TYPE = z.enum(["todo", "call", "email", "meeting", "followup"]);
type TaskType = z.infer<typeof TASK_TYPE>;
const TASK_STATUS = z.enum(["pending", "completed"]);
type TaskStatus = z.infer<typeof TASK_STATUS>;
const TASK_PRIORITY = z.enum(["low", "normal", "high", "urgent"]);
type TaskPriority = z.infer<typeof TASK_PRIORITY>;

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Read the org's IANA timezone via the AI-twin internal query.
 *
 * Always returns a string — falls back to `"UTC"` when the org doc is
 * missing or has no `settings.timezone`. The query is cheap (single
 * `db.get`) and idempotent; we don't bother memoising it across
 * capabilities in a turn because the runtime overhead is negligible
 * compared to the AI step round-trip.
 */
async function readOrgTimezone(ctx: CapabilityCtx): Promise<string> {
	const tz = (await ctx.ctx.runQuery(internal.orgs.queries.getTimezoneForAI, {
		orgId: ctx.principal.orgId,
		userId: ctx.principal.userId,
	})) as string;
	return tz;
}

/**
 * Resolve a `string | number | undefined` raw dueAt value into an absolute
 * epoch in `orgTz`. Returns `undefined` for empty input AND for strings
 * the natural-language parser can't make sense of (the caller surfaces a
 * `repair` envelope so the model self-corrects).
 *
 * Numbers are passed through as-is — they're already absolute. Empty
 * strings + nulls become `undefined` (the caller decides whether the
 * field was required for this task type).
 */
function resolveDueAt(value: string | number | undefined, orgTz: string): number | undefined {
	if (value === undefined || value === null) return undefined;
	if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
	return coerceTimestamp(value, orgTz);
}

/**
 * Strip the resolver-injected fields before forwarding args to the
 * mutation. {@link "../../../ai/registry/resolveRef".resolveRef} adds
 * `entityType` / `entityId` / `<entityType>Id` / `_resolvedDisplayName`
 * when it resolves a `personCode` (or any other code-shaped field) to a
 * concrete row. The task mutation ALSO accepts an `entityType`/`entityId`
 * pair, but with different semantics — that pair is for "this task is
 * attached to a deal/company/etc. that isn't a person." Letting the
 * resolver-injected `entityType:"lead"` flow through would silently
 * anchor every personCode-bound task to the lead row instead of the
 * person identity — ugly when the lead later converts to a contact.
 *
 * Returns the resolver's display name (when present) so `run()` can
 * include it in the success headline ("Created T-005 for Sarah Khan").
 */
function unpickResolverInjection<T extends Record<string, unknown>>(
	args: T,
): {
	rest: Omit<T, "entityType" | "entityId" | "leadId" | "_resolvedDisplayName">;
	resolvedDisplayName?: string;
} {
	const {
		entityType: _et,
		entityId: _eid,
		leadId: _lid,
		_resolvedDisplayName: name,
		...rest
	} = args as T & {
		entityType?: unknown;
		entityId?: unknown;
		leadId?: unknown;
		_resolvedDisplayName?: unknown;
	};
	return {
		rest: rest as Omit<T, "entityType" | "entityId" | "leadId" | "_resolvedDisplayName">,
		resolvedDisplayName: typeof name === "string" ? name : undefined,
	};
}

/** Format a task's dueAt epoch for the user-facing changes table. */
function formatDue(epoch: number): string {
	return new Date(epoch).toISOString();
}

/** Build a "Created <code>: <title>" headline + a small changes table. */
function buildCreateEnvelope(args: {
	taskCode: string;
	title: string;
	type: TaskType;
	dueAt: number;
	priority?: TaskPriority;
	personCode?: string;
	resolvedDisplayName?: string;
}): CapabilityResult {
	const personLabel = args.resolvedDisplayName
		? `${args.resolvedDisplayName} (${args.personCode})`
		: args.personCode;
	return ok({
		headline: personLabel
			? `Created ${args.taskCode}: ${args.title} — for ${personLabel}.`
			: `Created ${args.taskCode}: ${args.title}.`,
		changes: [
			{ label: "Code", value: args.taskCode, emphasis: "added" },
			{ label: "Type", value: args.type, emphasis: "added" },
			{ label: "Title", value: args.title, emphasis: "added" },
			{ label: "Due", value: formatDue(args.dueAt), emphasis: "added" },
			...(args.priority
				? [{ label: "Priority", value: args.priority, emphasis: "added" as const }]
				: []),
			...(args.personCode
				? [{ label: "For", value: args.personCode, emphasis: "added" as const }]
				: []),
		],
		display: { kind: "task", taskId: undefined as unknown as string },
		suggestedNext: [
			{
				label: "Add note",
				intent: args.personCode
					? `Add a note to ${args.personCode}`
					: "Add a note about this",
			},
		],
	});
}

// ─── Group playbook ─────────────────────────────────────────────────────────
//
// Read by `renderGroupPlaybooks` and emitted in the per-turn tail when
// the router activates the "tasks" group. Keep the prose tight (≤ 15
// lines is the design target) and aligned with the invariants in this
// file's header — drift here = a model that calls the wrong tool.

defineGroup({
	name: "tasks",
	playbook: `Read first → \`list_tasks\` (org-wide) or \`list_tasks_for_person\` (when a person is in context) before \`complete_task_by_code\` / \`cancel_task_by_code\` / \`update_task\` so you have the right T-NNN. \`get_task_by_code\` confirms a single row before destructive action.

Create → \`create_task\` with a \`type\` discriminator. Required clarifications: \`title\` and \`type\`. The "followup" type REQUIRES \`personCode\` (resolve the name via \`search_crm\` first); the other types accept an explicit \`personCode\` or run as a personal todo. \`dueAt\` accepts an epoch ms, an ISO string with offset, OR natural language ("next Tuesday", "tomorrow 9am") — the SERVER resolves the org timezone, you don't have to know it.

Complete vs cancel → \`complete_task_by_code\` records "the work was done" in the activity log; \`cancel_task_by_code\` is a HARD delete with no work-done audit. Use the verb the user said. If they said "completed" / "done", call complete; if they said "cancel" / "drop" / "delete", call cancel. NEVER substitute one for the other.

Update → \`update_task\` patches title/note/dueAt/assignedTo/type/priority by T-NNN code. Use this for "push to next Tuesday", "reassign to Bob", "raise priority". Status flips ("mark complete") still go through \`complete_task_by_code\` — \`update_task\` does not accept a status arg.

Listing → \`list_tasks\` for org-wide views, \`list_tasks_for_person\` when a personCode (P-NNN) is in context. Both honour the visibility rule: members without \`tasks.manage\` see only their own assigned rows.`,
});

// ─── create_task ────────────────────────────────────────────────────────────

const createTask = defineCapability<{
	type: TaskType;
	title: string;
	personCode?: string;
	dealCode?: string;
	dueAt?: string | number;
	note?: string;
	priority?: TaskPriority;
	assignedTo?: string;
}>({
	name: "create_task",
	module: "tasks",
	group: "tasks",
	permission: "tasks.create",
	risk: "reversible",
	channels: ["chat", "whatsapp", "mcp", "rest"],
	spec: {
		whenToCall:
			"Create a new task. The `type` discriminator picks the verb: todo (generic to-do), call (phone call), email (outbound email), meeting (scheduled meeting), followup (CRM cadence touch — REQUIRES personCode). Also use this for 'remind me to ...' / 'set a follow-up with ...' / 'schedule a call'. ALWAYS run search_crm first when the user named a person without a P-NNN code.",
		whenNotToCall:
			"the user wants to EDIT an existing task — use update_task. To mark a task done, use complete_task_by_code; to delete, use cancel_task_by_code.",
		requiredClarifications: ["type", "title"],
		synonyms: [
			"set reminder",
			"remind me",
			"schedule task",
			"follow up",
			"check in",
			"next-touch",
			"call back",
			"to-do",
			"plan a meeting",
			"send an email",
		],
		goodExample: {
			type: "followup",
			title: "Follow-up call",
			personCode: "P-001",
			dueAt: "next Tuesday 9am",
			priority: "normal",
		},
		badExample: {
			args: { type: "followup", personCode: "Sarah", title: "" },
			why: "personCode must be a P-NNN code (resolve via search_crm). title is required. The 'followup' type also REQUIRES personCode.",
		},
	},
	drive: {
		onSuccess:
			"Confirm in one short sentence with the human-readable due time and the new T-NNN code. The task card renders below the message.",
		onValidationError:
			"If `dueAt` came back as needs_repair, re-call once with an ISO string with explicit offset (e.g. '2026-06-09T09:00:00+04:00'). Do NOT loop more than once.",
		suggestNext: "Offer to add a note or log an activity for the same person.",
	},
	input: z.object({
		type: TASK_TYPE.describe(
			"Task type. todo = generic; call = phone call; email = outbound email; meeting = scheduled meeting; followup = CRM cadence touch (requires personCode).",
		),
		title: z.string().min(1).describe("Short task title."),
		personCode: z
			.string()
			.optional()
			.describe("Person code (P-NNN). REQUIRED when `type` is 'followup'."),
		dealCode: z
			.string()
			.optional()
			.describe("Deal code (D-NNN) when this task is about a deal."),
		dueAt: field
			.timestampLazy()
			.optional()
			.describe(
				"When the task is due. Accepts epoch ms, ISO 8601 (with or without explicit offset), OR natural language ('next Tuesday', 'tomorrow 9am'). The server reads the org's timezone — you don't need to know it. Required for non-followup types; followup tasks default to today + the org cadence (3 days fallback).",
			),
		note: z.string().optional().describe("Free-form note attached to the task."),
		priority: TASK_PRIORITY.optional().describe(
			"low / normal / high / urgent. Skip when not specified by the user.",
		),
		assignedTo: z
			.string()
			.optional()
			.describe("Convex user _id of the assignee. Defaults to the calling user."),
	}),
	run: async (cap, rawArgs) => {
		// Strip resolver injection BEFORE forwarding to the mutation —
		// otherwise the task would anchor to the lead row instead of the
		// person identity (see this file's invariant #4).
		const { rest: args, resolvedDisplayName } = unpickResolverInjection(rawArgs);

		// Re-coerce dueAt with the live org timezone (invariant #2).
		const orgTz = await readOrgTimezone(cap);
		const dueAtMs = resolveDueAt(args.dueAt, orgTz);
		if (args.dueAt !== undefined && dueAtMs === undefined) {
			return repair(
				"dueAt",
				"epoch ms, ISO 8601 with offset, or a natural-language phrase",
				JSON.stringify(args.dueAt),
				"Pass an absolute time (e.g. '2026-06-09T09:00:00Z') or a natural phrase the server can resolve in the org timezone.",
				{
					type: args.type,
					title: args.title,
					personCode: args.personCode ?? "P-001",
					dueAt: "next Tuesday 9am",
				},
			);
		}

		const created = (await cap.ctx.runMutation(
			internal.crm.shared.tasks.mutations.createForAI,
			{
				orgId: cap.principal.orgId,
				userId: cap.principal.userId,
				type: args.type,
				title: args.title,
				personCode: args.personCode,
				dealCode: args.dealCode,
				...(dueAtMs !== undefined ? { dueAt: dueAtMs } : {}),
				note: args.note,
				priority: args.priority,
				assignedTo: args.assignedTo as Id<"users"> | undefined,
			},
		)) as {
			taskId: Id<"tasks">;
			taskCode: string;
			dueAt: number;
			priority?: TaskPriority;
		};

		const env = buildCreateEnvelope({
			taskCode: created.taskCode,
			title: args.title,
			type: args.type,
			dueAt: created.dueAt,
			priority: created.priority,
			personCode: args.personCode,
			resolvedDisplayName,
		});
		// Patch the task display id now that the mutation returned it.
		env.display = { kind: "task", taskId: created.taskId as unknown as string };
		env.data = created;
		return env;
	},
});

// ─── complete_task ──────────────────────────────────────────────────────────

const completeTask = defineCapability<{ taskId: string }>({
	name: "complete_task",
	module: "tasks",
	group: "tasks",
	permission: "tasks.manage",
	risk: "reversible",
	channels: ["chat", "whatsapp", "mcp", "rest"],
	spec: {
		whenToCall:
			"Mark a task done by its internal taskId. Use ONLY when you already have the taskId from a prior list/search call. Most users refer to tasks by T-NNN — use complete_task_by_code instead in that case.",
		whenNotToCall:
			"the user mentioned a public T-NNN code — call complete_task_by_code. If they said 'cancel'/'delete', call cancel_task_by_code (DO NOT substitute complete for cancel).",
		requiredClarifications: ["taskId"],
		synonyms: ["done", "complete", "mark complete", "finished"],
		goodExample: { taskId: "kg2j_internal_id_from_list_call" },
		badExample: {
			args: { taskId: "T-003" },
			why: "T-003 is a PUBLIC code, not a Convex _id. Use complete_task_by_code.",
		},
	},
	drive: {
		onSuccess:
			"Confirm in one short sentence. If the task was already complete (`alreadyCompleted: true`), say so plainly — don't pretend it just changed.",
	},
	input: z.object({
		taskId: z.string().min(1).describe("Internal Convex _id of the task to mark complete."),
	}),
	run: async (cap, args) => {
		const result = (await cap.ctx.runMutation(
			internal.crm.shared.tasks.mutations.completeForAI,
			{
				orgId: cap.principal.orgId,
				userId: cap.principal.userId,
				taskId: args.taskId as Id<"tasks">,
			},
		)) as { taskCode: string; taskId: Id<"tasks">; alreadyCompleted: boolean };
		return ok({
			headline: result.alreadyCompleted
				? `${result.taskCode} was already complete — no change.`
				: `Marked ${result.taskCode} complete.`,
			changes: [
				{ label: "Code", value: result.taskCode, emphasis: "unchanged" },
				{
					label: "Status",
					value: "completed",
					emphasis: result.alreadyCompleted ? "unchanged" : "changed",
				},
			],
			data: result,
			display: { kind: "task", taskId: result.taskId as unknown as string },
			suggestedNext: [{ label: "Schedule the next one", intent: "Set a follow-up task" }],
		});
	},
});

// ─── complete_task_by_code ──────────────────────────────────────────────────

const completeTaskByCode = defineCapability<{ taskCode: string }>({
	name: "complete_task_by_code",
	module: "tasks",
	group: "tasks",
	permission: "tasks.manage",
	risk: "reversible",
	channels: ["chat", "whatsapp", "mcp", "rest"],
	spec: {
		whenToCall:
			"Mark a task done by its public T-NNN code. This is the path to use when the user references a task by code ('completed T-003', 'mark T-7 as called').",
		whenNotToCall:
			"the user said 'cancel'/'delete' — use cancel_task_by_code (don't silently swap one for the other; the activity log records different verbs).",
		requiredClarifications: ["taskCode"],
		synonyms: ["mark task done", "complete task", "finished task"],
		goodExample: { taskCode: "T-003" },
		badExample: {
			args: { taskCode: "the task with Sarah" },
			why: "taskCode must be T-NNN. Resolve via list_tasks_for_person first if you only have a person.",
		},
	},
	drive: {
		onSuccess:
			"Confirm using the taskCode. Surface `alreadyCompleted: true` plainly (don't claim a state change that didn't happen).",
		onValidationError:
			"If the code returned not_found, do NOT retry with a different code. Call search_crm or list_tasks_for_person to find the right one.",
	},
	input: z.object({
		taskCode: z.string().min(1).describe("Public task code (T-NNN)."),
	}),
	run: async (cap, args) => {
		const result = (await cap.ctx.runMutation(
			internal.crm.shared.tasks.mutations.completeByCodeForAI,
			{
				orgId: cap.principal.orgId,
				userId: cap.principal.userId,
				taskCode: args.taskCode,
			},
		)) as { taskCode: string; taskId: Id<"tasks">; alreadyCompleted: boolean };
		return ok({
			headline: result.alreadyCompleted
				? `${result.taskCode} was already complete — no change.`
				: `Marked ${result.taskCode} complete.`,
			changes: [
				{ label: "Code", value: result.taskCode, emphasis: "unchanged" },
				{
					label: "Status",
					value: "completed",
					emphasis: result.alreadyCompleted ? "unchanged" : "changed",
				},
			],
			data: result,
			display: { kind: "task", taskId: result.taskId as unknown as string },
		});
	},
});

// ─── cancel_task_by_code ────────────────────────────────────────────────────

const cancelTaskByCode = defineCapability<{ taskCode: string }>({
	name: "cancel_task_by_code",
	module: "tasks",
	group: "tasks",
	permission: "tasks.manage",
	risk: "reversible",
	channels: ["chat", "whatsapp", "mcp", "rest"],
	spec: {
		whenToCall:
			"HARD-DELETE a task by its T-NNN code. Use ONLY when the user explicitly said cancel / delete / drop / remove — i.e. the work was NOT done.",
		whenNotToCall:
			"the work was done — call complete_task_by_code so the timeline records completion (different verb in the activity log).",
		requiredClarifications: ["taskCode"],
		synonyms: ["cancel task", "delete task", "remove T", "drop the task"],
		goodExample: { taskCode: "T-003" },
		badExample: {
			args: { taskCode: "T-003" }, // user actually said "done"
			why: "If the user said 'done' or 'completed', this is wrong — the activity log will read 'task_deleted' instead of 'task_completed'. Call complete_task_by_code.",
		},
	},
	drive: {
		onSuccess: "Confirm with the taskCode. Mention that cancellation is permanent.",
		onValidationError:
			"If not_found, surface the failure plainly — do NOT retry with a different code.",
	},
	input: z.object({
		taskCode: z.string().min(1).describe("Public task code (T-NNN)."),
	}),
	run: async (cap, args) => {
		const result = (await cap.ctx.runMutation(
			internal.crm.shared.tasks.mutations.cancelByCodeForAI,
			{
				orgId: cap.principal.orgId,
				userId: cap.principal.userId,
				taskCode: args.taskCode,
			},
		)) as { taskCode: string; taskId: Id<"tasks"> };
		return ok({
			headline: `Cancelled ${result.taskCode} (permanent).`,
			changes: [
				{ label: "Code", value: result.taskCode, emphasis: "unchanged" },
				{ label: "Status", value: "cancelled (deleted)", emphasis: "changed" },
			],
			data: result,
		});
	},
});

// ─── update_task ────────────────────────────────────────────────────────────

const updateTask = defineCapability<{
	taskCode: string;
	title?: string;
	note?: string;
	dueAt?: string | number;
	assignedTo?: string;
	type?: TaskType;
	priority?: TaskPriority;
}>({
	name: "update_task",
	module: "tasks",
	group: "tasks",
	permission: "tasks.manage",
	risk: "reversible",
	channels: ["chat", "whatsapp", "mcp", "rest"],
	spec: {
		whenToCall:
			"Patch a task's title / note / due date / assignee / type / priority by T-NNN code. Use for 'push to next Tuesday', 'reassign to Bob', 'raise priority'.",
		whenNotToCall:
			"the user wants to mark it DONE (use complete_task_by_code) or DELETE it (use cancel_task_by_code). update_task does NOT accept a status arg — completion is its own verb.",
		requiredClarifications: ["taskCode"],
		synonyms: [
			"push task",
			"postpone task",
			"reschedule task",
			"reassign task",
			"change priority",
			"edit task",
		],
		goodExample: { taskCode: "T-003", dueAt: "next Tuesday 9am" },
		badExample: {
			args: { taskCode: "T-003" }, // no patch fields
			why: "At least one of title / note / dueAt / assignedTo / type / priority must be set — otherwise the call is a no-op.",
		},
	},
	drive: {
		onSuccess:
			"Reply with one short sentence using the taskCode + the human-readable change ('Pushed T-003 to Tuesday 10am.').",
		onValidationError:
			"If the code returned not_found, do NOT retry — call list_tasks_for_person on the right person first.",
	},
	input: z
		.object({
			taskCode: z.string().min(1).describe("Public task code (T-NNN)."),
			title: z.string().min(1).optional(),
			note: z.string().optional(),
			dueAt: field
				.timestampLazy()
				.optional()
				.describe(
					"New due time. Same input shape as create_task.dueAt — epoch / ISO / natural language, server resolves the timezone.",
				),
			assignedTo: z.string().optional().describe("Convex user _id of the new assignee."),
			type: TASK_TYPE.optional(),
			priority: TASK_PRIORITY.optional(),
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
		),
	run: async (cap, args) => {
		const orgTz = await readOrgTimezone(cap);
		const dueAtMs = resolveDueAt(args.dueAt, orgTz);
		if (args.dueAt !== undefined && dueAtMs === undefined) {
			return repair(
				"dueAt",
				"epoch ms, ISO 8601 with offset, or a natural-language phrase",
				JSON.stringify(args.dueAt),
				"Pass an absolute time (e.g. '2026-06-09T09:00:00Z') or a natural phrase the server can resolve.",
				{ taskCode: args.taskCode, dueAt: "next Tuesday 9am" },
			);
		}

		// Resolve T-NNN → taskId via the dedicated by-code AI query. We
		// can't call updateForAI directly with a code because the public
		// update mutation takes the internal id (matches the
		// requireOrgMember-then-update pattern shared with other entities).
		const task = (await cap.ctx.runQuery(internal.crm.shared.tasks.queries.getByTaskCodeForAI, {
			orgId: cap.principal.orgId,
			userId: cap.principal.userId,
			taskCode: args.taskCode,
		})) as { _id: Id<"tasks">; taskCode: string; title: string } | null;
		if (!task) {
			return failed("not_found", `No task found with code ${args.taskCode}.`);
		}

		const result = (await cap.ctx.runMutation(internal.crm.shared.tasks.mutations.updateForAI, {
			orgId: cap.principal.orgId,
			userId: cap.principal.userId,
			taskId: task._id,
			...(args.title !== undefined ? { title: args.title } : {}),
			...(args.note !== undefined ? { note: args.note } : {}),
			...(dueAtMs !== undefined ? { dueAt: dueAtMs } : {}),
			...(args.assignedTo !== undefined
				? { assignedTo: args.assignedTo as Id<"users"> }
				: {}),
			...(args.type !== undefined ? { type: args.type } : {}),
			...(args.priority !== undefined ? { priority: args.priority } : {}),
		})) as { taskCode: string; taskId: Id<"tasks"> };

		const changes: { label: string; value: string; emphasis: "changed" | "unchanged" }[] = [];
		if (args.title !== undefined)
			changes.push({ label: "Title", value: args.title, emphasis: "changed" });
		if (args.note !== undefined)
			changes.push({
				label: "Note",
				value: args.note.length > 60 ? `${args.note.slice(0, 60)}…` : args.note,
				emphasis: "changed",
			});
		if (dueAtMs !== undefined)
			changes.push({ label: "Due", value: formatDue(dueAtMs), emphasis: "changed" });
		if (args.assignedTo !== undefined)
			changes.push({
				label: "Assigned to",
				value: args.assignedTo,
				emphasis: "changed",
			});
		if (args.type !== undefined)
			changes.push({ label: "Type", value: args.type, emphasis: "changed" });
		if (args.priority !== undefined)
			changes.push({ label: "Priority", value: args.priority, emphasis: "changed" });

		return ok({
			headline: `Updated ${result.taskCode}.`,
			changes,
			data: result,
			display: { kind: "task", taskId: result.taskId as unknown as string },
			suggestedNext: [
				{ label: "Mark complete", intent: `Mark ${result.taskCode} complete` },
				{ label: "Cancel it", intent: `Cancel ${result.taskCode}` },
			],
		});
	},
});

// ─── list_tasks ─────────────────────────────────────────────────────────────

const listTasks = defineCapability<{ type?: TaskType; status?: TaskStatus }>({
	name: "list_tasks",
	module: "tasks",
	group: "tasks",
	permission: "tasks.view",
	risk: "safe",
	channels: ["chat", "whatsapp", "mcp", "rest"],
	spec: {
		whenToCall:
			"Org-wide listing of tasks, with optional `type` + `status` filters. Use for 'what's on my plate?' / 'show open follow-ups' / 'list pending tasks'. Members without `tasks.manage` see only their own assigned rows — visibility is enforced server-side; you don't need to filter.",
		whenNotToCall:
			"the user named a person — use list_tasks_for_person for tighter scope (less noise, fewer tokens).",
		synonyms: ["my tasks", "open tasks", "pending tasks", "to-dos", "todos"],
		goodExample: { type: "followup", status: "pending" },
		badExample: {
			args: { type: "todo", status: "archived" },
			why: "status must be 'pending' or 'completed'. There is no 'archived' status — cancelled tasks are hard-deleted.",
		},
	},
	drive: {
		onSuccess:
			"If 0 results, say so plainly. If many, narrate the count + the top 3 by due date — the result card carries the full list.",
		onEmpty:
			"No matching tasks. Offer to relax the filter (drop type or status) before broadening to all entities.",
	},
	input: z.object({
		type: TASK_TYPE.optional().describe("Optional filter by task type."),
		status: TASK_STATUS.optional().describe("Optional filter by status (pending|completed)."),
	}),
	run: async (cap, args) => {
		const rows = (await cap.ctx.runQuery(internal.crm.shared.tasks.queries.listForOrgForAI, {
			orgId: cap.principal.orgId,
			userId: cap.principal.userId,
			type: args.type,
			status: args.status,
		})) as Array<{
			_id: string;
			taskCode: string;
			type: string;
			title: string;
			dueAt: number;
			status: string;
			priority?: string;
			personCode?: string;
		}>;
		if (rows.length === 0) {
			return ok({
				headline: "No matching tasks.",
				facts: [
					"Try without the filter, or use list_tasks_for_person if you have a personCode.",
				],
				data: { tasks: [] as unknown[] },
			});
		}
		const top = [...rows].sort((a, b) => a.dueAt - b.dueAt).slice(0, 5);
		return ok({
			headline: `${rows.length} task${rows.length === 1 ? "" : "s"}.`,
			changes: top.map((t) => ({
				label: t.taskCode,
				value: `${t.title} · ${formatDue(t.dueAt)} · ${t.type}${t.priority ? ` · ${t.priority}` : ""}`,
				emphasis: "unchanged" as const,
			})),
			data: { tasks: rows },
		});
	},
});

// ─── list_tasks_for_person ──────────────────────────────────────────────────

const listTasksForPerson = defineCapability<{ personCode: string; type?: TaskType }>({
	name: "list_tasks_for_person",
	module: "tasks",
	group: "tasks",
	permission: "tasks.view",
	risk: "safe",
	channels: ["chat", "whatsapp", "mcp", "rest"],
	spec: {
		whenToCall:
			"List tasks attached to a specific person (P-NNN). Use this BEFORE complete/update/cancel to surface the right T-NNN codes — saves a round-trip vs list_tasks org-wide.",
		whenNotToCall: "the user wants org-wide listing — use list_tasks.",
		requiredClarifications: ["personCode"],
		synonyms: ["sarah's tasks", "p-001 follow-ups", "their open tasks"],
		goodExample: { personCode: "P-001", type: "followup" },
		badExample: {
			args: { personCode: "Sarah" },
			why: "personCode must be P-NNN. Call search_crm first to resolve the name.",
		},
	},
	drive: {
		onSuccess:
			"List up to 5 tasks newest-first. If 0, say so plainly. The user can drill into one via get_task_by_code.",
	},
	input: z.object({
		personCode: z.string().min(1).describe("Person code (P-NNN)."),
		type: TASK_TYPE.optional().describe("Optional filter by task type."),
	}),
	run: async (cap, rawArgs) => {
		// Discard resolver-injected fields — the query takes personCode (string),
		// not entityId. See file invariant #4.
		const { rest: args } = unpickResolverInjection(rawArgs);
		const rows = (await cap.ctx.runQuery(internal.crm.shared.tasks.queries.listForPersonForAI, {
			orgId: cap.principal.orgId,
			userId: cap.principal.userId,
			personCode: args.personCode,
			type: args.type,
		})) as Array<{
			_id: string;
			taskCode: string;
			type: string;
			title: string;
			dueAt: number;
			status: string;
		}>;
		if (rows.length === 0) {
			return ok({
				headline: `No tasks for ${args.personCode}.`,
				data: { personCode: args.personCode, tasks: [] as unknown[] },
			});
		}
		const sorted = [...rows].sort((a, b) => a.dueAt - b.dueAt).slice(0, 5);
		return ok({
			headline: `${rows.length} task${rows.length === 1 ? "" : "s"} for ${args.personCode}.`,
			changes: sorted.map((t) => ({
				label: t.taskCode,
				value: `${t.title} · ${formatDue(t.dueAt)} · ${t.type} · ${t.status}`,
				emphasis: "unchanged" as const,
			})),
			data: { personCode: args.personCode, tasks: rows },
		});
	},
});

// ─── get_task_by_code ───────────────────────────────────────────────────────

const getTaskByCode = defineCapability<{ taskCode: string }>({
	name: "get_task_by_code",
	module: "tasks",
	group: "tasks",
	permission: "tasks.view",
	risk: "safe",
	channels: ["chat", "whatsapp", "mcp", "rest"],
	spec: {
		whenToCall:
			"Read one task by its T-NNN code. Use BEFORE complete_task_by_code / cancel_task_by_code so you can confirm what you're acting on.",
		whenNotToCall: "the user only has a person/deal — use list_tasks_for_person instead.",
		requiredClarifications: ["taskCode"],
		synonyms: ["task details", "show T", "what is T-"],
		goodExample: { taskCode: "T-007" },
	},
	drive: {
		onSuccess:
			"Render a one-line summary with title, due, status, type, priority. The task card shows the full row.",
		onValidationError:
			"If not_found, surface the failure plainly — do NOT retry with a different code.",
	},
	input: z.object({
		taskCode: z.string().min(1).describe("Public task code (T-NNN)."),
	}),
	run: async (cap, args) => {
		const task = (await cap.ctx.runQuery(internal.crm.shared.tasks.queries.getByTaskCodeForAI, {
			orgId: cap.principal.orgId,
			userId: cap.principal.userId,
			taskCode: args.taskCode,
		})) as null | {
			_id: Id<"tasks">;
			taskCode: string;
			type: TaskType;
			title: string;
			dueAt: number;
			status: TaskStatus;
			priority?: TaskPriority;
			note?: string;
			personCode?: string;
			dealCode?: string;
		};
		if (!task) {
			return failed("not_found", `No task found with code ${args.taskCode}.`);
		}
		const facts: string[] = [
			`Type: ${task.type}`,
			`Status: ${task.status}`,
			`Due: ${formatDue(task.dueAt)}`,
		];
		if (task.priority) facts.push(`Priority: ${task.priority}`);
		if (task.personCode) facts.push(`Person: ${task.personCode}`);
		if (task.dealCode) facts.push(`Deal: ${task.dealCode}`);
		return ok({
			headline: `${task.taskCode}: ${task.title}`,
			facts,
			data: { task },
			display: { kind: "task", taskId: task._id as unknown as string },
		});
	},
});

// ─── Public surface ─────────────────────────────────────────────────────────

/**
 * Every task capability — exported for `host.ts` (registration via
 * side-effect import) and `capabilities.test.ts` (contract-test
 * generator). Keep this list authoritative; nothing else introspects it.
 */
export const TASKS_CAPABILITIES = [
	createTask,
	completeTask,
	completeTaskByCode,
	cancelTaskByCode,
	updateTask,
	listTasks,
	listTasksForPerson,
	getTaskByCode,
];

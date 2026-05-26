/**
 * convex/ai/tools/scheduling/_context.ts
 *
 * Stage 3 of /SPRINT-PLAN.md (2026-05-26). Per-request ToolContext for
 * the reminder-edit tools (update_reminder; future: snooze_reminder,
 * reschedule_reminder, etc.). Set once per turn from
 * `bindAllToolContexts`; consumed via `getSchedulingCtx()` inside each
 * tool's `execute()`.
 *
 * The existing reminder CREATE / COMPLETE / CANCEL tools live in
 * `convex/ai/tools/notesReminders.ts` and use that file's
 * `setNotesRemindersContext` setter. Scheduling-edit tools moved to a
 * separate folder both because the file count was getting large and
 * because Stage 8 will add cron-driven scheduling features (standing
 * orders, auto-followup-on-stage-move) that naturally live alongside
 * the edit tools.
 */
import type { ToolContext } from "../_shared";

let _ctx: ToolContext | null = null;

export function setSchedulingContext(ctx: ToolContext): void {
	_ctx = ctx;
}

export function getSchedulingCtx(): ToolContext {
	if (!_ctx) throw new Error("Scheduling tool context not initialized");
	return _ctx;
}

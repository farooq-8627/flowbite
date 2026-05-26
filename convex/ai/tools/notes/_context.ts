/**
 * convex/ai/tools/notes/_context.ts
 *
 * Stage 3 of /SPRINT-PLAN.md (2026-05-26). Per-request ToolContext for
 * the note-edit tools (update_note, delete_note, pin_note,
 * set_note_category). Set once per turn from
 * `bindAllToolContexts`; consumed via `getNotesCtx()` inside each
 * tool's `execute()`.
 *
 * Mirrors `convex/ai/tools/crud/_context.ts` — same module-scope
 * single-binding pattern used by every other tool group.
 */
import type { ToolContext } from "../_shared";

let _ctx: ToolContext | null = null;

export function setNotesContext(ctx: ToolContext): void {
	_ctx = ctx;
}

export function getNotesCtx(): ToolContext {
	if (!_ctx) throw new Error("Notes tool context not initialized");
	return _ctx;
}

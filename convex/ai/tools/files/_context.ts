/**
 * convex/ai/tools/files/_context.ts
 *
 * Stage 4 of /SPRINT-PLAN.md (2026-05-26). Per-request ToolContext for the
 * files tool family (list_files, update_file_tags, remove_file). Set once
 * per turn from `bindAllToolContexts`; consumed via `getFilesCtx()` inside
 * each tool's `execute()`.
 */
import type { ToolContext } from "../_shared";

let _ctx: ToolContext | null = null;

export function setFilesContext(ctx: ToolContext): void {
	_ctx = ctx;
}

export function getFilesCtx(): ToolContext {
	if (!_ctx) throw new Error("Files tool context not initialized");
	return _ctx;
}

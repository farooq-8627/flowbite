/**
 * convex/ai/tools/timeline/_context.ts
 *
 * Stage 4 of /SPRINT-PLAN.md (2026-05-26). Per-request ToolContext for the
 * timeline tool family (list_org_timeline). Set once per turn from
 * `bindAllToolContexts`; consumed via `getTimelineCtx()` inside each
 * tool's `execute()`.
 */
import type { ToolContext } from "../_shared";

let _ctx: ToolContext | null = null;

export function setTimelineContext(ctx: ToolContext): void {
	_ctx = ctx;
}

export function getTimelineCtx(): ToolContext {
	if (!_ctx) throw new Error("Timeline tool context not initialized");
	return _ctx;
}

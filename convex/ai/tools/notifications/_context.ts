/**
 * convex/ai/tools/notifications/_context.ts
 *
 * Stage 4 of /SPRINT-PLAN.md (2026-05-26). Per-request ToolContext for
 * the notifications tool family (list_notifications,
 * mark_notification_read).
 */
import type { ToolContext } from "../_shared";

let _ctx: ToolContext | null = null;

export function setNotificationsContext(ctx: ToolContext): void {
	_ctx = ctx;
}

export function getNotificationsCtx(): ToolContext {
	if (!_ctx) throw new Error("Notifications tool context not initialized");
	return _ctx;
}

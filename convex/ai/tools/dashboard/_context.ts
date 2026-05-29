/**
 * convex/ai/tools/dashboard/_context.ts
 *
 * Shared per-request tool context for all dashboard/* tools
 * (render_widget, annotate_widget, score_deal, explain_deal_score,
 * list_anomalies, revise_forecast).
 *
 * Mirrors `convex/ai/tools/messaging/_context.ts` — same module-scope
 * single-binding pattern used by every other tool group.
 */
import type { ToolContext } from "../_shared";

let _ctx: ToolContext | null = null;

export function setDashboardContext(ctx: ToolContext): void {
	_ctx = ctx;
}

export function getDashboardCtx(): ToolContext {
	if (!_ctx) throw new Error("Dashboard tool context not initialized");
	return _ctx;
}

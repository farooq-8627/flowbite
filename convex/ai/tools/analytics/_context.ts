/**
 * convex/ai/tools/analytics/_context.ts
 *
 * Stage 7 (`/SPRINT-PLAN.md`) — module-scope `ToolContext` setter for
 * the analytics layer. Mirrors `crud/_context.ts` + `proactive.ts`.
 */

import type { ToolContext } from "../_shared";

let _ctx: ToolContext | null = null;

export function setAnalyticsContext(c: ToolContext): void {
	_ctx = c;
}

export function getAnalyticsCtx(): ToolContext {
	if (!_ctx) throw new Error("analytics ctx not bound");
	return _ctx;
}

/**
 * convex/ai/tools/creative/_context.ts
 *
 * Stage 9 of `/SPRINT-PLAN.md` (2026-05-26). Module-scope per-request
 * `ToolContext` setter for every tool in the `creative` layer
 * (`draft_message`, `commit_draft_message`, `draft_proposal`,
 * `commit_draft_proposal`, `summarise_conversation`, `web_scrape`).
 *
 * Mirrors `convex/ai/tools/messaging/_context.ts` + every other layer
 * file. `processChat.run` calls `setCreativeContext()` once per turn via
 * `bindAllToolContexts`; each tool reads via `getCreativeCtx()` inside
 * its `execute()`. Throws if read before bind so a refactor that drops
 * the bind site fails loudly instead of silently NOOP-ing.
 */

import type { ToolContext } from "../_shared";

let _ctx: ToolContext | null = null;

export function setCreativeContext(ctx: ToolContext): void {
	_ctx = ctx;
}

export function getCreativeCtx(): ToolContext {
	if (!_ctx) throw new Error("Creative tool context not initialized");
	return _ctx;
}

/**
 * convex/ai/tools/companies/_context.ts
 *
 * Stage 3 of /SPRINT-PLAN.md (2026-05-26). Per-request ToolContext for
 * the company-relationship tools (add_person_to_company,
 * remove_person_from_company). Set once per turn from
 * `bindAllToolContexts`; consumed via `getCompaniesCtx()` inside each
 * tool's `execute()`.
 *
 * Company create/update tools live under `convex/ai/tools/crud/`
 * because they share the entity-create pattern. Company-relationship
 * tools (linking people to companies) live here because they're
 * cross-table joins, not entity creates.
 */
import type { ToolContext } from "../_shared";

let _ctx: ToolContext | null = null;

export function setCompaniesContext(ctx: ToolContext): void {
	_ctx = ctx;
}

export function getCompaniesCtx(): ToolContext {
	if (!_ctx) throw new Error("Companies tool context not initialized");
	return _ctx;
}

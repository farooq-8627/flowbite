/**
 * convex/ai/tools/crud/_context.ts
 *
 * Shared per-request tool context for all crud/* tools (create_lead,
 * create_contact, create_company, create_deal, and their commit twins).
 *
 * `processChat` calls `setCrudContext()` once before each chat turn; the
 * individual tool files read it via `getCtx()` inside their `execute()`.
 *
 * Why a module-scoped variable instead of plumbing the context through
 * every call: AI SDK tools have a fixed `(input) => Promise<unknown>`
 * signature — there's no way to inject ambient state. Module-scope is
 * the same trick used by every other tool group in this folder.
 */
import type { ToolContext } from "../_shared";

let _ctx: ToolContext | null = null;

export function setCrudContext(ctx: ToolContext): void {
	_ctx = ctx;
}

export function getCrudCtx(): ToolContext {
	if (!_ctx) throw new Error("CRUD tool context not initialized");
	return _ctx;
}

/**
 * Backwards-compat alias. The old `setCreateEntitiesContext` is the public
 * name `processChat` imports — keep it pointing at the new setter so we
 * don't have to touch processChat in this restructure.
 */
export const setCreateEntitiesContext = setCrudContext;

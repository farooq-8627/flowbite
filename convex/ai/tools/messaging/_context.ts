/**
 * convex/ai/tools/messaging/_context.ts
 *
 * Shared per-request tool context for all messaging/* tools (send_message,
 * list_messages, mark_thread_read, add_participants, remove_participant).
 *
 * `processChat.run` calls `setMessagingContext()` once before each chat
 * turn via `bindAllToolContexts`; each tool reads via `getMessagingCtx()`
 * inside its `execute()`.
 *
 * Mirrors `convex/ai/tools/crud/_context.ts` — same module-scope
 * single-binding trick used by every other tool group.
 */
import type { ToolContext } from "../_shared";

let _ctx: ToolContext | null = null;

export function setMessagingContext(ctx: ToolContext): void {
	_ctx = ctx;
}

export function getMessagingCtx(): ToolContext {
	if (!_ctx) throw new Error("Messaging tool context not initialized");
	return _ctx;
}

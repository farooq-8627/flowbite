/**
 * convex/ai/tools/_shared.ts
 *
 * RBAC helpers, error wrapping, and activity logging for AI tool handlers.
 * Every tool's execute() should call these at the appropriate points.
 *
 * Security model (4 layers):
 *   1. Auth: processChat verifies membership before any tool runs
 *   2. Tool filtering: toolRegistry filters by permission before exposing to model
 *   3. Per-tool RBAC: each execute() calls requirePermission() (defence-in-depth)
 *   4. DB layer: underlying org mutations enforce RBAC independently
 */
import { ConvexError } from "convex/values";
import type { Id } from "../../_generated/dataModel";
import type { ActionCtx } from "../../_generated/server";

// ─── Types ────────────────────────────────────────────────────────────────────

/** ctx typed as ActionCtx — tools always run inside processChat's internalAction. */
export type ToolContext = {
	ctx: ActionCtx;
	orgId: Id<"orgs">;
	userId: Id<"users">;
	permissions: string[];
	conversationId: Id<"aiConversations">;
};

/**
 * Run a mutation from inside a tool execute() function.
 * Uses string-path pattern (pre-codegen forward references).
 */
export function toolMutation(
	ctx: ActionCtx,
	path: string,
	args: Record<string, unknown>,
): Promise<unknown> {
	return ctx.runMutation(path as never, args as never);
}

/**
 * Run a query from inside a tool execute() function.
 */
export function toolQuery(
	ctx: ActionCtx,
	path: string,
	args: Record<string, unknown>,
): Promise<unknown> {
	return ctx.runQuery(path as never, args as never);
}

export type ToolResult<T = unknown> =
	| { ok: true; data: T; display?: string }
	| { ok: false; error: string; code?: string };

// ─── RBAC enforcement ─────────────────────────────────────────────────────────

/**
 * Verify the calling user holds a specific permission.
 * Throws a user-friendly ConvexError if not.
 * Called inside every tool's execute() as defence-in-depth.
 */
export function requirePermission(permissions: string[], permission: string): void {
	if (!permissions.includes(permission)) {
		throw new ConvexError({
			code: "AI_TOOL_UNAUTHORIZED",
			message: `You don't have permission to perform this action (requires: ${permission}).`,
		});
	}
}

/**
 * Verify the user holds at least one of the supplied permissions.
 */
export function requireAnyPermission(permissions: string[], anyOf: string[]): void {
	if (!anyOf.some((p) => permissions.includes(p))) {
		throw new ConvexError({
			code: "AI_TOOL_UNAUTHORIZED",
			message: `You don't have permission to perform this action.`,
		});
	}
}

// ─── Two-step confirmation helpers ───────────────────────────────────────────

/**
 * Build a standardised "propose" response for two-step confirmation.
 * The AI returns this JSON; the frontend renders a ChatConfirmation card.
 */
export function propose<T extends Record<string, unknown>>(
	toolName: string,
	args: T,
	preview: { title: string; fields: Array<{ label: string; value: unknown }> },
): ToolResult<never> & { requiresConfirmation: true; confirmationPayload: unknown } {
	return {
		ok: false as const,
		error: `Awaiting user confirmation to ${toolName}.`,
		requiresConfirmation: true as const,
		confirmationPayload: { tool: toolName, args, preview },
	};
}

// ─── Error wrapping ───────────────────────────────────────────────────────────

/**
 * Wrap a tool handler so errors are caught and returned as ToolResult failures
 * rather than bubbling up as raw exceptions. Raw exceptions would be logged
 * by processChat but we want structured, user-friendly output.
 */
export async function runTool<T>(fn: () => Promise<ToolResult<T>>): Promise<ToolResult<T>> {
	try {
		return await fn();
	} catch (err) {
		if (err instanceof ConvexError) {
			return {
				ok: false,
				error: (err.data as { message?: string })?.message ?? "Action failed.",
				code: (err.data as { code?: string })?.code,
			};
		}
		// Log unexpected errors — don't expose stack to AI/user
		console.error("[AI tool error]", err);
		return {
			ok: false,
			error: "An unexpected error occurred. Please try again.",
		};
	}
}

// ─── Activity logging for AI actions ─────────────────────────────────────────

/**
 * Log an AI tool call to the org's activity log.
 * Must be called from within a processChat internalAction via ctx.runMutation.
 */
export { logActivity } from "../../activityLogs/helpers";

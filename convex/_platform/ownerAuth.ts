/**
 * Platform Owner gate — convex/_platform/ownerAuth.ts
 *
 * Defence-in-depth helper used by every owner-panel query/mutation/action.
 * Layers on top of the existing `requireSuperAdmin` helper so the panel
 * has a SECOND independent check (env email allow-list) on top of the
 * platformRole flag.
 *
 * **Why this exists.** A compromised `users.platformRole` row is not enough
 * to access owner-panel state if the user's email is not on the env
 * allow-list. The env value is operator-controlled and changes require a
 * redeploy — an attacker who can write to the DB still cannot bypass the
 * env check unless they also compromise the deployment pipeline.
 *
 * **Env contract.** Reads `PLATFORM_OWNER_EMAILS` at first call. Comma-
 * separated lower-cased emails. If the variable is unset OR empty, NO ONE
 * passes the gate — every call throws `SUPER_ADMIN_REQUIRED`. This is the
 * deliberate fail-closed default: forgetting to set the env disables the
 * panel rather than silently widening access.
 *
 * Spec: PLATFORM-OWNER-PANEL.md §2.4 (locked decisions L1–L11).
 */
import { ConvexError } from "convex/values";
import { requireSuperAdmin } from "../_functions/authenticated";
import type { ActionCtx, MutationCtx, QueryCtx } from "../_generated/server";
import { ERRORS } from "../_shared/errors";

/**
 * Parse `PLATFORM_OWNER_EMAILS` into a normalised lower-case list. Called
 * lazily on every request so test environments that mutate `process.env`
 * pick up the latest value (the cost is a few microseconds — negligible).
 */
function getAllowedEmails(): string[] {
	const raw = process.env.PLATFORM_OWNER_EMAILS ?? "";
	return raw
		.split(",")
		.map((entry) => entry.trim().toLowerCase())
		.filter((entry) => entry.length > 0);
}

/**
 * Require the caller to be a platform owner. Throws `ConvexError` with
 * `ERRORS.SUPER_ADMIN_REQUIRED` if any check fails; never leaks which check
 * failed (the message is identical to the plain `requireSuperAdmin` error
 * so probing the panel can't reveal allow-list membership).
 *
 * Returns the same `{ user, userId }` shape as `requireSuperAdmin` so call
 * sites can destructure either helper interchangeably.
 *
 * Usage:
 * ```ts
 * export const updateTier = mutation({
 *   args: {...},
 *   handler: async (ctx, args) => {
 *     const { user, userId } = await requirePlatformOwner(ctx);
 *     // ...rest of mutation
 *   },
 * });
 * ```
 */
export async function requirePlatformOwner(ctx: QueryCtx | MutationCtx | ActionCtx) {
	// For ActionCtx we don't have the standard auth identity helpers from
	// the query/mutation builders. Actions must read identity from
	// `ctx.auth.getUserIdentity()` and cannot fetch the user document
	// directly — so we route them through Convex's standard auth check
	// inside the action layer, then re-call this helper from a derived
	// query/mutation. To keep the API simple, we narrow at the call site:
	// only query/mutation contexts pass to `requireSuperAdmin`.
	if (!("db" in ctx)) {
		throw new ConvexError(ERRORS.SUPER_ADMIN_REQUIRED);
	}

	const { user, userId } = await requireSuperAdmin(ctx as QueryCtx | MutationCtx);

	const allowed = getAllowedEmails();
	if (allowed.length === 0) {
		// Fail closed — env unset or empty means panel is disabled.
		throw new ConvexError(ERRORS.SUPER_ADMIN_REQUIRED);
	}

	const email = (user.email ?? "").toLowerCase();
	if (!email || !allowed.includes(email)) {
		throw new ConvexError(ERRORS.SUPER_ADMIN_REQUIRED);
	}

	return { user, userId };
}

/**
 * Pure predicate variant — useful when a layout/server-component needs to
 * answer "is this caller an owner?" without throwing. Returns false on any
 * failure (unauthenticated, wrong role, email not allowed, env unset).
 *
 * Always prefer `requirePlatformOwner` inside mutations/queries so the
 * error path is enforced. This predicate is for read-only gating in
 * dashboards / nav visibility checks.
 */
export async function isPlatformOwner(ctx: QueryCtx | MutationCtx): Promise<boolean> {
	try {
		await requirePlatformOwner(ctx);
		return true;
	} catch {
		return false;
	}
}

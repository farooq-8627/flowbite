/**
 * Runtime permission checks — used inside Convex query/mutation handlers.
 *
 * Two flavours:
 *   1. Array-based (`hasPermission`, `requireRole`)  — given an already-loaded
 *      `member.permissions[]` array, check membership. Cheapest. Used inside
 *      the canonical `requireOrgMember(...).then(({member}) => requireRole(member.permissions, "x"))`
 *      pattern that runs at the start of every protected handler.
 *   2. DB-backed (`hasPermissionFromDB`, `requirePermission`) — given just an
 *      orgId + userId, load membership + role from the DB and check. Used
 *      from places where the calling code doesn't already hold a member doc.
 *
 * Plus role-rank helpers (`hasMinRole`, `requireMinRole`) for the rare cases
 * where a coarse "at least admin" check is enough — keep these for super-admin
 * workflows in `_functions/admin.ts`.
 *
 * Plus plan-feature gate (`requirePlanFeature`) used in mutations that should
 * reject when a feature isn't included in the org's plan.
 */

import { ConvexError } from "convex/values";
import type { Id } from "../../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../../_generated/server";
import { PLAN_FEATURES } from "../constants";
import { ERRORS } from "../errors";
import { ORG_ROLE_RANK, type OrgRole } from "../validators";

// ─── Array-based checks (called inside handlers) ─────────────────────────────

/**
 * Returns true if the member's permissions array includes the required key.
 *
 * USAGE:
 * ```ts
 * const { member } = await requireOrgMember(ctx, args.orgId);
 * if (hasPermission(member.permissions, "notes.viewInternal")) { ... }
 * ```
 */
export function hasPermission(permissions: readonly string[], permission: string): boolean {
	return permissions.includes(permission);
}

/**
 * Throws `FORBIDDEN` if the member's permissions don't include the required key.
 *
 * This is the canonical guard at the start of every protected handler.
 *
 * USAGE:
 * ```ts
 * const { member } = await requireOrgMember(ctx, args.orgId);
 * requireRole(member.permissions, "leads.create");
 * ```
 */
export function requireRole(permissions: readonly string[], permission: string): void {
	if (!permissions.includes(permission)) {
		throw new ConvexError(ERRORS.FORBIDDEN);
	}
}

// ─── Role-rank checks (super-admin / coarse gating) ──────────────────────────

/** True if `role` ≥ `minRole` in the rank order viewer < member < admin < owner. */
export function hasMinRole(role: OrgRole, minRole: OrgRole): boolean {
	return ORG_ROLE_RANK[role] >= ORG_ROLE_RANK[minRole];
}

/** Throws `FORBIDDEN` if `role` < `minRole`. */
export function requireMinRole(role: OrgRole, minRole: OrgRole): void {
	if (!hasMinRole(role, minRole)) {
		throw new ConvexError(ERRORS.FORBIDDEN);
	}
}

// ─── Plan-feature gate ───────────────────────────────────────────────────────

/**
 * Throws `FEATURE_DISABLED` if the org's plan doesn't include the given feature.
 *
 * For runtime feature flag checks (respecting `featureFlags.orgOverrides`),
 * use the reactive `useFeatureFlag()` hook on the frontend — this helper only
 * checks the static plan → features mapping in `constants.PLAN_FEATURES`.
 */
export function requirePlanFeature(plan: string, featureKey: string): void {
	const features = PLAN_FEATURES[plan as keyof typeof PLAN_FEATURES] ?? ([] as readonly string[]);
	if (!(features as readonly string[]).includes(featureKey)) {
		throw new ConvexError(ERRORS.FEATURE_DISABLED);
	}
}

// ─── DB-backed checks ────────────────────────────────────────────────────────

/**
 * Loads the user's membership + role from the DB and throws `FORBIDDEN` if
 * they don't have the permission.
 *
 * Properly typed `ctx` — no more `{ db: any }`. Accepts both `QueryCtx` and
 * `MutationCtx` because read-only callers (queries) need this too.
 */
export async function requirePermission(
	ctx: QueryCtx | MutationCtx,
	orgId: Id<"orgs">,
	userId: Id<"users">,
	permission: string,
): Promise<void> {
	const member = await ctx.db
		.query("orgMembers")
		.withIndex("by_orgId_and_userId", (q) => q.eq("orgId", orgId).eq("userId", userId))
		.first();

	if (!member || member.deletedAt !== undefined) {
		throw new ConvexError(ERRORS.FORBIDDEN);
	}

	const role = await ctx.db.get(member.roleId);
	if (!role || !Array.isArray(role.permissions)) {
		throw new ConvexError(ERRORS.FORBIDDEN);
	}
	if (!role.permissions.includes(permission)) {
		throw new ConvexError(ERRORS.FORBIDDEN);
	}
}

/** Boolean equivalent of `requirePermission` (catches and returns false). */
export async function hasPermissionFromDB(
	ctx: QueryCtx | MutationCtx,
	orgId: Id<"orgs">,
	userId: Id<"users">,
	permission: string,
): Promise<boolean> {
	try {
		await requirePermission(ctx, orgId, userId, permission);
		return true;
	} catch {
		return false;
	}
}

/**
 * Record-scope helpers — assignment-based (row-level) record visibility.
 *
 * THE CONCEPT (locked decision — see AGENTS.md "Locked architectural
 * decisions"). The RBAC model is otherwise module-level (`leads.view`,
 * `deals.view`, …). This file adds the ONE cross-cutting, row-level layer:
 *
 *   - A member whose role HAS `records.viewAll` sees every record in the
 *     org (the historical default).
 *   - A member whose role LACKS `records.viewAll` only ever sees rows where
 *     `assignedTo === their own userId`. Unassigned rows are invisible to
 *     them.
 *
 * This gates leads / contacts / companies / deals TOGETHER (one product
 * switch the owner flips per role in Settings → Roles), and is enforced on
 * every list / board / detail / search read — including the AI `search_crm`
 * capability, which flows through the same `*ForAI` query twins. The
 * proactive AI Pulse already loads only the caller's assigned rows
 * (`by_org_and_assignee`), so it's consistent without extra wiring.
 *
 * OWNER CONTROL: visibility is decided PER ROLE. The owner grants/removes
 * `records.viewAll` on any role in the role editor — checked = that role
 * sees everything, unchecked = assigned-only. No org-wide mode flag; the
 * role IS the unit of control, consistent with the rest of the RBAC model.
 *
 * INVARIANTS / GOTCHAS:
 *   - Pure functions only — no `ctx`, no DB. Safe to import anywhere
 *     (Convex handlers, tests). DB filtering is done by the caller using
 *     these predicates.
 *   - `rowInScope` treats a missing `assignedTo` as NOT in scope for a
 *     scoped member. Showing unassigned rows would leak the whole
 *     unassigned pool, which defeats the point.
 *   - `resolveAssigneeFilter` lets list queries pick the most selective
 *     index: a scoped member is locked to their own `userId`, and a scoped
 *     member who explicitly requests someone else's records short-circuits
 *     to an empty result (`{ empty: true }`).
 *   - The permission is a CAPABILITY (presence grants). Never invert it to
 *     a "restrict" flag — the catalog model is additive and the backfill
 *     migration relies on "grant to everyone to preserve behaviour".
 */

import type { Id } from "../../_generated/dataModel";

/** Canonical permission key for full (non-scoped) record visibility. */
export const VIEW_ALL_RECORDS_PERMISSION = "records.viewAll";

/**
 * Resolved visibility scope for one member in one org.
 *
 *   - `{ all: true }`             → no row-level restriction.
 *   - `{ all: false, userId }`    → only rows assigned to `userId`.
 */
export type RecordScope =
	| { readonly all: true }
	| { readonly all: false; readonly userId: Id<"users"> };

/** True when the member's role grants full (all-records) visibility. */
export function canViewAllRecords(permissions: readonly string[]): boolean {
	return permissions.includes(VIEW_ALL_RECORDS_PERMISSION);
}

/**
 * Resolve a member's record scope from their permissions + their userId.
 * Call once per handler after `requireOrgMember` / `requireOrgMemberByIds`.
 */
export function resolveRecordScope(
	permissions: readonly string[],
	userId: Id<"users">,
): RecordScope {
	return canViewAllRecords(permissions) ? { all: true } : { all: false, userId };
}

/**
 * Predicate: does a single row pass the scope? Use for in-memory filtering
 * of an already-fetched list (board grouping, search results, profile sub-
 * lists) and for single-row detail reads (`getById`, `getByCode`).
 *
 * A missing `assignedTo` fails the check for a scoped member by design.
 */
export function rowInScope(scope: RecordScope, row: { assignedTo?: Id<"users"> }): boolean {
	return scope.all || row.assignedTo === scope.userId;
}

/**
 * The assignee value a scoped read is locked to, or `undefined` for an
 * all-access member. Useful when threading scope into a shared search
 * helper (`searchLeadsImpl(... , { scopeAssignee })`).
 */
export function scopeAssignee(scope: RecordScope): Id<"users"> | undefined {
	return scope.all ? undefined : scope.userId;
}

/**
 * Combine a caller-supplied `assignedTo` filter with the member's scope to
 * pick the effective assignee for index selection.
 *
 *   - all-access member  → honour the caller's `assignedTo` (may be
 *     undefined = no filter).
 *   - scoped member      → forced to their own `userId`. If the caller
 *     asked for a DIFFERENT user's records, there is nothing they may see →
 *     `{ empty: true }` so the handler can return `[]` immediately.
 */
export function resolveAssigneeFilter(
	scope: RecordScope,
	requestedAssignee: Id<"users"> | undefined,
):
	| { readonly empty: true }
	| { readonly empty: false; readonly assignedTo: Id<"users"> | undefined } {
	if (scope.all) {
		return { empty: false, assignedTo: requestedAssignee };
	}
	if (requestedAssignee !== undefined && requestedAssignee !== scope.userId) {
		return { empty: true };
	}
	return { empty: false, assignedTo: scope.userId };
}

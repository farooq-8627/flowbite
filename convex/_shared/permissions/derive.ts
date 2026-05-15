/**
 * Pure derivers over the permission catalog.
 *
 * Everything in this file is a no-DB function — safe to import from anywhere
 * (Convex query/mutation/action handlers, React components, tests).
 *
 * If you find yourself adding a deriver that needs context (`ctx.db`), it
 * belongs in `helpers.ts` instead.
 */

import { PERMISSION_CATALOG, type PermissionEntry, type SystemRoleName } from "./catalog";

// ─── Seed permissions for the 4 system roles ─────────────────────────────────

/**
 * Returns the permission keys that should be seeded on a fresh `orgRoles` row
 * for the given system role name.
 *
 * Used by:
 *   - `convex/orgs/mutations.ts::createOrg` (initial seed)
 *   - `convex/orgs/mutations.ts::backfillRolePermissions` (reconcile drift)
 *   - Role-editor "Reset to defaults" action
 */
export function getDefaultPermissionsForRole(role: SystemRoleName): readonly string[] {
	return PERMISSION_CATALOG.filter((p) => p.defaultRoles.includes(role)).map((p) => p.key);
}

/**
 * Returns the permission keys that the given role *should* have but currently
 * doesn't. Used by `backfillRolePermissions` to reconcile drift on existing
 * orgs after a permission is added to the catalog.
 *
 * Returns `[]` if the role is up to date or if the role name isn't a system
 * role (custom roles are never reconciled — they're owner-curated).
 */
export function getMissingPermissionsForRole(
	roleName: string,
	currentPermissions: readonly string[],
): string[] {
	if (!isSystemRoleName(roleName)) return [];
	const expected = getDefaultPermissionsForRole(roleName);
	const have = new Set(currentPermissions);
	return expected.filter((p) => !have.has(p));
}

/** Type guard — narrows an arbitrary string to `SystemRoleName`. */
export function isSystemRoleName(name: string): name is SystemRoleName {
	return name === "Owner" || name === "Admin" || name === "Member" || name === "Viewer";
}

// ─── Module grouping (UI helper) ─────────────────────────────────────────────

/**
 * Group catalog entries by module, preserving catalog order within each
 * module. Used by the role-editor UI to render the toggle matrix.
 */
export function groupCatalogByModule(): Map<string, PermissionEntry[]> {
	const grouped = new Map<string, PermissionEntry[]>();
	for (const entry of PERMISSION_CATALOG) {
		const list = grouped.get(entry.module) ?? [];
		list.push(entry);
		grouped.set(entry.module, list);
	}
	return grouped;
}

// ─── Catalog lookups ─────────────────────────────────────────────────────────

/** O(1) lookup: permission key → catalog entry. Built once. */
const CATALOG_BY_KEY: ReadonlyMap<string, PermissionEntry> = new Map(
	PERMISSION_CATALOG.map((p) => [p.key, p] as const),
);

export function getPermissionEntry(key: string): PermissionEntry | undefined {
	return CATALOG_BY_KEY.get(key);
}

export function isKnownPermission(key: string): boolean {
	return CATALOG_BY_KEY.has(key);
}

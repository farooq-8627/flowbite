/**
 * Permissions module — barrel.
 *
 * Existing code imports from `"../_shared/permissions"`; that resolves here.
 * All public names from the previous single-file `permissions.ts` are re-exported.
 */

// SSOT data + types
export {
	ALL_PERMISSION_KEYS,
	PERMISSION_CATALOG,
	PERMISSION_MODULE_LABELS,
	PERMISSION_MODULE_ORDER,
	type PermissionEntry,
	type PermissionKey,
	SYSTEM_ROLE_NAMES,
	type SystemRoleName,
} from "./catalog";

// Pure derivers
export {
	getDefaultPermissionsForRole,
	getMissingPermissionsForRole,
	getPermissionEntry,
	groupCatalogByModule,
	isKnownPermission,
	isSystemRoleName,
} from "./derive";

// Runtime helpers
export {
	hasMinRole,
	hasPermission,
	hasPermissionFromDB,
	requireMinRole,
	requirePermission,
	requirePlanFeature,
	requireRole,
} from "./helpers";

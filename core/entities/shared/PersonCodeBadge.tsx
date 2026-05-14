"use client";

/**
 * @deprecated — Use `IdentityBadge` directly.
 *
 * This file is kept ONLY as a thin re-export shim so existing import paths
 * (`@/core/entities/shared/PersonCodeBadge`) keep working until the final
 * migration sweep. New code should import from
 * `@/core/entities/shared/components/IdentityBadge`.
 */

export {
	IdentityBadge,
	type IdentityBadgeProps,
	type IdentityEntityType,
	PersonCodeBadge,
} from "./components/IdentityBadge";

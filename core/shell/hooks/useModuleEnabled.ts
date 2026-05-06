/**
 * useModuleEnabled — checks if a CRM module is enabled for the current workspace.
 *
 * Uses the org's module config to determine if a module (by slug or type) is active.
 * Returns false if the module is disabled or doesn't exist in the config.
 *
 * @param slugOrType - Module slug (URL segment) or entity type
 * @returns true if module is enabled
 */

import { DEFAULT_MODULES, type EntityType } from "@/core/shell/config/navigation";

export function useModuleEnabled(slugOrType: string): boolean {
	// TODO: Replace DEFAULT_MODULES with org's module config from Convex query
	const modules = DEFAULT_MODULES;

	return modules.some(
		(m) => m.enabled && (m.slug === slugOrType || m.type === slugOrType),
	);
}

/**
 * useModuleConfig — returns the full module config for a given slug or type.
 */
export function useModuleConfig(slugOrType: string) {
	// TODO: Replace DEFAULT_MODULES with org's module config from Convex query
	const modules = DEFAULT_MODULES;

	return modules.find(
		(m) => m.slug === slugOrType || m.type === slugOrType,
	) ?? null;
}

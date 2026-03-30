/**
 * Feature module registry — central place to register all feature modules.
 *
 * WHY THIS EXISTS:
 *   R11: Every feature folder must have an index. The registry maps module keys
 *   to their metadata so the dashboard sidebar, settings page, and permission
 *   gates can dynamically discover available features.
 *
 * HOW IT WORKS:
 *   Each module exports a FeatureModule config. The registry collects them.
 *   When building the sidebar, iterate over enabledModules and render nav items.
 *   Feature flag checks can use the `featureFlagKey` to gate access.
 *
 * USAGE:
 *   ```ts
 *   import { featureModules } from "@/features/_registry";
 *   for (const mod of featureModules) {
 *     if (isEnabled(mod.featureFlagKey)) renderNavItem(mod);
 *   }
 *   ```
 *
 * Sources:
 * - .github/agents/base/folder-structure.md — target structure
 * - .github/agents/base/rules.md R11 — feature folder rule
 */

export interface FeatureModule {
	/** Unique key for the module (e.g. "connections", "workflows") */
	key: string;
	/** Display label for sidebar/nav */
	label: string;
	/** Lucide icon name */
	icon: string;
	/** Dashboard route path (without locale prefix) */
	href: string;
	/** Feature flag key that gates this module (checked against PLAN_FEATURES) */
	featureFlagKey?: string;
	/** Minimum org role required to see this module in the sidebar */
	minRole?: "owner" | "admin" | "member" | "viewer";
	/** Phase when this module was built (for documentation) */
	phase: number;
}

/**
 * All registered feature modules.
 * Add new modules here as they are built in each phase.
 */
export const featureModules: FeatureModule[] = [
	// Phase 1 — Connections
	// {
	//   key: "connections",
	//   label: "Connections",
	//   icon: "Link",
	//   href: "/dashboard/connections",
	//   featureFlagKey: "connections.basic",
	//   minRole: "viewer",
	//   phase: 1,
	// },
];

/** Get a module by its key */
export function getModule(key: string): FeatureModule | undefined {
	return featureModules.find((m) => m.key === key);
}

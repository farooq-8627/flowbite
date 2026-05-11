/**
 * Barrel export for preferences library.
 */

// Types
export type {
	ContentLayout,
	NavbarStyle,
	SidebarCollapsible,
	SidebarVariant,
} from "./layout";
// Constants
export {
	CONTENT_LAYOUTS,
	NAVBAR_STYLES,
	SIDEBAR_COLLAPSIBLE_MODES,
	SIDEBAR_VARIANTS,
} from "./layout";
// Utils
export { getContentLayoutClass, getLayoutDataAttributes, getNavbarClass } from "./layout-utils";
export type { PersistenceStrategy, PreferenceKey, PreferenceTypeMap } from "./preferences-config";
export { PREFERENCE_DEFAULTS, PREFERENCE_KEYS, PREFERENCE_PERSISTENCE } from "./preferences-config";
// Storage
export {
	getAllPreferences,
	getPreference,
	parsePreferencesFromCookieHeader,
	setPreference,
} from "./preferences-storage";
export type { ThemeMode, ThemePreset, ThemePresetOption } from "./theme";
export { THEME_MODES, THEME_PRESET_OPTIONS, THEME_PRESETS } from "./theme";
export { applyFont, applyThemePreset, isValidThemePreset } from "./theme-utils";

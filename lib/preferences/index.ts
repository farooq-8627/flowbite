/**
 * Barrel export for preferences library.
 */

// Types
export type {
	SidebarVariant,
	SidebarCollapsible,
	ContentLayout,
	NavbarStyle,
} from "./layout";
export type { ThemeMode, ThemePreset, ThemePresetOption } from "./theme";
export type { PreferenceKey, PreferenceTypeMap, PersistenceStrategy } from "./preferences-config";

// Constants
export {
	SIDEBAR_VARIANTS,
	SIDEBAR_COLLAPSIBLE_MODES,
	CONTENT_LAYOUTS,
	NAVBAR_STYLES,
} from "./layout";
export { THEME_MODES, THEME_PRESETS, THEME_PRESET_OPTIONS } from "./theme";
export { PREFERENCE_KEYS, PREFERENCE_DEFAULTS, PREFERENCE_PERSISTENCE } from "./preferences-config";

// Storage
export {
	getPreference,
	setPreference,
	getAllPreferences,
	parsePreferencesFromCookieHeader,
} from "./preferences-storage";

// Utils
export { getContentLayoutClass, getNavbarClass, getLayoutDataAttributes } from "./layout-utils";
export { isValidThemePreset, applyThemePreset, applyFont } from "./theme-utils";

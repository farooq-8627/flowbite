/**
 * UI Defaults Configuration
 *
 * Central configuration for all UI-related defaults across the application.
 * This ensures consistency and makes it easy to update defaults in one place.
 */

import type {
	SidebarVariant,
	SidebarCollapsible,
	ContentLayout,
	NavbarStyle,
} from "./preferences/layout";
import type { ThemeMode, ThemePreset } from "./preferences/theme";
import type { FontKey } from "./fonts/registry";

// --- Layout Defaults ---

export const DEFAULT_SIDEBAR_VARIANT: SidebarVariant = "inset";
export const DEFAULT_SIDEBAR_COLLAPSIBLE: SidebarCollapsible = "icon";
export const DEFAULT_CONTENT_LAYOUT: ContentLayout = "centered";
export const DEFAULT_NAVBAR_STYLE: NavbarStyle = "sticky";

// --- Theme Defaults ---

export const DEFAULT_THEME_MODE: ThemeMode = "light";
export const DEFAULT_THEME_PRESET: ThemePreset = "tangerine";

// --- Font Defaults ---

export const DEFAULT_FONT: FontKey = "geist";

// --- Locale Defaults ---

export const DEFAULT_LOCALE = "en";
export const SUPPORTED_LOCALES = ["en", "ar"] as const;

// --- Dashboard Defaults ---

/** Temporary org slug for testing - will be replaced with actual org resolution */
export const TEMP_ORG_SLUG = "reimaginy";

// --- Cookie Names ---

export const SIDEBAR_STATE_COOKIE = "sidebar_state";
export const CHAT_PANEL_STATE_COOKIE = "chat_panel_state";

// --- Export all as a single object for convenience ---

export const UI_DEFAULTS = {
	layout: {
		sidebarVariant: DEFAULT_SIDEBAR_VARIANT,
		sidebarCollapsible: DEFAULT_SIDEBAR_COLLAPSIBLE,
		contentLayout: DEFAULT_CONTENT_LAYOUT,
		navbarStyle: DEFAULT_NAVBAR_STYLE,
	},
	theme: {
		mode: DEFAULT_THEME_MODE,
		preset: DEFAULT_THEME_PRESET,
	},
	font: DEFAULT_FONT,
	locale: DEFAULT_LOCALE,
	supportedLocales: SUPPORTED_LOCALES,
	tempOrgSlug: TEMP_ORG_SLUG,
	cookies: {
		sidebarState: SIDEBAR_STATE_COOKIE,
		chatPanelState: CHAT_PANEL_STATE_COOKIE,
	},
} as const;

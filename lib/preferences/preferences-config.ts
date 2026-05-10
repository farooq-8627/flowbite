/**
 * Preferences configuration — defaults, persistence strategy, and type map.
 * Source: arhamkhnz/next-shadcn-admin-dashboard (adapted for Orbitly)
 *
 * Cookie-based persistence ensures SSR can read layout-critical values
 * on the server to prevent flash-of-unstyled-content (FOUC).
 */

import type { FontKey } from "../fonts/registry";
import type { ContentLayout, NavbarStyle, SidebarCollapsible, SidebarVariant } from "./layout";
import type { ThemeMode, ThemePreset } from "./theme";

// --- Persistence Strategies ---

/**
 * Where each preference is stored:
 * - "cookie": SSR-safe, read on server (layout-critical)
 * - "localStorage": Client-only, non-layout-critical
 */
export type PersistenceStrategy = "cookie" | "localStorage";

// --- Preference Keys ---

export const PREFERENCE_KEYS = [
	"sidebar_variant",
	"sidebar_collapsible",
	"content_layout",
	"navbar_style",
	"theme_preset",
	"theme_mode",
	"radius",
	"font",
] as const;
export type PreferenceKey = (typeof PREFERENCE_KEYS)[number];

// --- Type Map ---

/** Maps each preference key to its value type */
export interface PreferenceTypeMap {
	sidebar_variant: SidebarVariant;
	sidebar_collapsible: SidebarCollapsible;
	content_layout: ContentLayout;
	navbar_style: NavbarStyle;
	theme_preset: ThemePreset;
	theme_mode: ThemeMode;
	radius: string;
	font: FontKey;
}

// --- Defaults ---

/** Default values for all preferences */
export const PREFERENCE_DEFAULTS: PreferenceTypeMap = {
	sidebar_variant: "inset",
	sidebar_collapsible: "icon",
	content_layout: "centered",
	navbar_style: "sticky",
	theme_preset: "tangerine",
	theme_mode: "system",
	radius: "0.5",
	font: "nunito-sans",
} as const;

// --- Persistence Config ---

/** Which storage mechanism each preference uses */
export const PREFERENCE_PERSISTENCE: Record<PreferenceKey, PersistenceStrategy> = {
	sidebar_variant: "cookie", // layout-critical: affects SidebarProvider
	sidebar_collapsible: "cookie", // layout-critical: affects sidebar rendering
	content_layout: "cookie", // layout-critical: affects max-width
	navbar_style: "cookie", // layout-critical: affects sticky behavior
	theme_preset: "cookie", // layout-critical: CSS custom properties
	theme_mode: "cookie", // layout-critical: dark mode
	radius: "cookie", // layout-critical: border-radius
	font: "cookie", // layout-critical: font-family on <html>
} as const;

// --- Cookie Config ---

export const COOKIE_PREFIX = "orbitly-pref-";
export const COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // 1 year

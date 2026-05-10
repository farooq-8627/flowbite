/**
 * Zustand vanilla store for user preferences.
 * Source: arhamkhnz/next-shadcn-admin-dashboard (adapted for Orbitly)
 *
 * Uses zustand/vanilla (not React) so it can be used in server components
 * and initialized from cookie values before hydration.
 *
 * Usage:
 *   import { usePreferencesStore } from "@/lib/stores/preferences-store";
 *   const { sidebar_variant, setSidebarVariant } = usePreferencesStore();
 */

import { create } from "zustand";
import type { FontKey } from "@/lib/fonts/registry";
import { getAllPreferences, setPreference } from "@/lib/preferences/preferences-storage";
import type {
	ContentLayout,
	NavbarStyle,
	SidebarCollapsible,
	SidebarVariant,
} from "@/lib/preferences/layout";
import type { ThemeMode, ThemePreset } from "@/lib/preferences/theme";
import { PREFERENCE_DEFAULTS } from "@/lib/preferences/preferences-config";

// --- State Shape ---

interface PreferencesState {
	// Layout
	sidebar_variant: SidebarVariant;
	sidebar_collapsible: SidebarCollapsible;
	content_layout: ContentLayout;
	navbar_style: NavbarStyle;
	// Theme
	theme_preset: ThemePreset;
	theme_mode: ThemeMode;
	resolvedThemeMode: ThemeMode | null;
	// Styling
	radius: string;
	font: FontKey;
	// Hydration flag
	_hydrated: boolean;
	// Sync flag - indicates if preferences are synced with storage
	isSynced: boolean;
}

// --- Actions Shape ---

interface PreferencesActions {
	setSidebarVariant: (value: SidebarVariant) => void;
	setSidebarCollapsible: (value: SidebarCollapsible) => void;
	setContentLayout: (value: ContentLayout) => void;
	setNavbarStyle: (value: NavbarStyle) => void;
	setThemePreset: (value: ThemePreset) => void;
	setThemeMode: (value: ThemeMode) => void;
	setRadius: (value: string) => void;
	setFont: (value: FontKey) => void;
	/** Initialize from cookies — call once on client mount */
	hydrate: () => void;
}

type PreferencesStore = PreferencesState & PreferencesActions;

// --- Store ---

export const usePreferencesStore = create<PreferencesStore>()((set) => ({
	// Defaults (will be overwritten by hydrate())
	...PREFERENCE_DEFAULTS,
	resolvedThemeMode: null,
	_hydrated: false,
	isSynced: true,

	// Actions
	setSidebarVariant: (value) => {
		setPreference("sidebar_variant", value);
		set({ sidebar_variant: value, isSynced: true });
	},
	setSidebarCollapsible: (value) => {
		setPreference("sidebar_collapsible", value);
		set({ sidebar_collapsible: value, isSynced: true });
	},
	setContentLayout: (value) => {
		setPreference("content_layout", value);
		set({ content_layout: value, isSynced: true });
	},
	setNavbarStyle: (value) => {
		setPreference("navbar_style", value);
		set({ navbar_style: value, isSynced: true });
	},
	setThemePreset: (value) => {
		setPreference("theme_preset", value);
		document.documentElement.setAttribute("data-theme-preset", value);
		set({ theme_preset: value, isSynced: true });
	},
	setThemeMode: (value) => {
		setPreference("theme_mode", value);
		// Apply theme mode to document
		if (value === "system") {
			const systemTheme = window.matchMedia("(prefers-color-scheme: dark)").matches
				? "dark"
				: "light";
			document.documentElement.classList.toggle("dark", systemTheme === "dark");
			set({ theme_mode: value, resolvedThemeMode: systemTheme, isSynced: true });
		} else {
			document.documentElement.classList.toggle("dark", value === "dark");
			set({ theme_mode: value, resolvedThemeMode: value, isSynced: true });
		}
	},
	setRadius: (value) => {
		setPreference("radius", value);
		document.documentElement.style.setProperty("--radius", `${value}rem`);
		set({ radius: value, isSynced: true });
	},
	setFont: (value) => {
		setPreference("font", value);
		document.documentElement.setAttribute("data-font", value);
		set({ font: value, isSynced: true });
	},

	/** Read all preferences from cookies and populate store */
	hydrate: () => {
		if (typeof window === "undefined") return;
		const prefs = getAllPreferences();

		// Resolve theme mode
		let resolvedMode: ThemeMode | null = null;
		if (prefs.theme_mode === "system") {
			resolvedMode = window.matchMedia("(prefers-color-scheme: dark)").matches
				? "dark"
				: "light";
		} else {
			resolvedMode = prefs.theme_mode;
		}

		set({ ...prefs, resolvedThemeMode: resolvedMode, _hydrated: true, isSynced: true });
	},
}));

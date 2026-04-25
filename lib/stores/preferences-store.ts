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
import {
  getAllPreferences,
  setPreference,
} from "@/lib/preferences/preferences-storage";
import type {
  ContentLayout,
  NavbarStyle,
  SidebarCollapsible,
  SidebarVariant,
} from "@/lib/preferences/layout";
import type { ThemePreset } from "@/lib/preferences/theme";
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
  // Font
  font: string;
  // Hydration flag
  _hydrated: boolean;
}

// --- Actions Shape ---

interface PreferencesActions {
  setSidebarVariant: (value: SidebarVariant) => void;
  setSidebarCollapsible: (value: SidebarCollapsible) => void;
  setContentLayout: (value: ContentLayout) => void;
  setNavbarStyle: (value: NavbarStyle) => void;
  setThemePreset: (value: ThemePreset) => void;
  setFont: (value: string) => void;
  /** Initialize from cookies — call once on client mount */
  hydrate: () => void;
}

type PreferencesStore = PreferencesState & PreferencesActions;

// --- Store ---

export const usePreferencesStore = create<PreferencesStore>()((set) => ({
  // Defaults (will be overwritten by hydrate())
  ...PREFERENCE_DEFAULTS,
  _hydrated: false,

  // Actions
  setSidebarVariant: (value) => {
    setPreference("sidebar_variant", value);
    set({ sidebar_variant: value });
  },
  setSidebarCollapsible: (value) => {
    setPreference("sidebar_collapsible", value);
    set({ sidebar_collapsible: value });
  },
  setContentLayout: (value) => {
    setPreference("content_layout", value);
    set({ content_layout: value });
  },
  setNavbarStyle: (value) => {
    setPreference("navbar_style", value);
    set({ navbar_style: value });
  },
  setThemePreset: (value) => {
    setPreference("theme_preset", value);
    document.documentElement.setAttribute("data-theme-preset", value);
    set({ theme_preset: value });
  },
  setFont: (value) => {
    setPreference("font", value);
    document.documentElement.setAttribute("data-font", value);
    set({ font: value });
  },

  /** Read all preferences from cookies and populate store */
  hydrate: () => {
    if (typeof window === "undefined") return;
    const prefs = getAllPreferences();
    set({ ...prefs, _hydrated: true });
  },
}));

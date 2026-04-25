/**
 * Theme type definitions and preset metadata.
 * Source: arhamkhnz/next-shadcn-admin-dashboard (adapted for Orbitly)
 *
 * Theme modes use next-themes. Theme presets load CSS custom properties
 * via data-theme-preset attribute on <html>.
 */

// --- Theme Mode ---

/** Light/dark mode, resolved by next-themes */
export const THEME_MODES = ["light", "dark", "system"] as const;
export type ThemeMode = (typeof THEME_MODES)[number];

// --- Theme Presets ---

/** Available theme preset identifiers */
export const THEME_PRESETS = [
  "default",
  "tangerine",
  "brutalist",
  "soft-pop",
  "orbitly",
] as const;
export type ThemePreset = (typeof THEME_PRESETS)[number];

/** Metadata for rendering theme preset picker UI */
export interface ThemePresetOption {
  id: ThemePreset;
  label: string;
  description: string;
  /** Primary color swatch for preview (oklch) */
  primaryColor: string;
}

/** Registry of all available theme presets */
export const THEME_PRESET_OPTIONS: ThemePresetOption[] = [
  {
    id: "default",
    label: "Default",
    description: "Clean neutral palette",
    primaryColor: "oklch(0.21 0.006 285.89)",
  },
  {
    id: "tangerine",
    label: "Tangerine",
    description: "Warm orange energy",
    primaryColor: "oklch(0.64 0.17 36.44)",
  },
  {
    id: "brutalist",
    label: "Brutalist",
    description: "Bold monochrome",
    primaryColor: "oklch(0 0 0)",
  },
  {
    id: "soft-pop",
    label: "Soft Pop",
    description: "Gentle pastel tones",
    primaryColor: "oklch(0.65 0.15 340)",
  },
  {
    id: "orbitly",
    label: "Orbitly",
    description: "Orbitly brand theme",
    primaryColor: "oklch(0.55 0.2 260)",
  },
];

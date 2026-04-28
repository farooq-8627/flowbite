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
export const THEME_PRESETS = ["default", "tangerine", "brutalist", "soft-pop", "orbitly"] as const;
export type ThemePreset = (typeof THEME_PRESETS)[number];

/** Metadata for rendering theme preset picker UI */
export interface ThemePresetOption {
	value: ThemePreset;
	label: string;
	description: string;
	/** Primary color swatch for preview (oklch) */
	primary: {
		light: string;
		dark: string;
	};
}

/** Registry of all available theme presets */
export const THEME_PRESET_OPTIONS: ThemePresetOption[] = [
	{
		value: "default",
		label: "Default",
		description: "Clean neutral palette",
		primary: {
			light: "oklch(0.21 0.006 285.89)",
			dark: "oklch(0.89 0.006 285.89)",
		},
	},
	{
		value: "tangerine",
		label: "Tangerine",
		description: "Warm orange energy",
		primary: {
			light: "oklch(0.64 0.17 36.44)",
			dark: "oklch(0.74 0.17 36.44)",
		},
	},
	{
		value: "brutalist",
		label: "Brutalist",
		description: "Bold monochrome",
		primary: {
			light: "oklch(0 0 0)",
			dark: "oklch(1 0 0)",
		},
	},
	{
		value: "soft-pop",
		label: "Soft Pop",
		description: "Gentle pastel tones",
		primary: {
			light: "oklch(0.65 0.15 340)",
			dark: "oklch(0.75 0.15 340)",
		},
	},
	{
		value: "orbitly",
		label: "Orbitly",
		description: "Orbitly brand theme",
		primary: {
			light: "oklch(0.55 0.2 260)",
			dark: "oklch(0.65 0.2 260)",
		},
	},
];

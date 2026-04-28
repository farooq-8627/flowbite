/**
 * Theme utility functions — preset loading and dark mode resolution.
 * Source: arhamkhnz/next-shadcn-admin-dashboard (adapted for Orbitly)
 */

import { THEME_PRESETS, type ThemePreset } from "./theme";

/**
 * Validate that a string is a valid theme preset.
 */
export function isValidThemePreset(value: string): value is ThemePreset {
	return (THEME_PRESETS as readonly string[]).includes(value);
}

/**
 * Apply a theme preset by setting the data-theme-preset attribute on <html>.
 * The CSS files in styles/presets/ use this attribute as a selector.
 *
 * Example: :root[data-theme-preset="tangerine"] { --primary: oklch(...); }
 */
export function applyThemePreset(preset: ThemePreset): void {
	if (typeof document === "undefined") return;
	document.documentElement.setAttribute("data-theme-preset", preset);
}

/**
 * Apply a font by setting the data-font attribute on <html>.
 * The font registry's CSS variables are applied via this attribute.
 */
export function applyFont(fontKey: string): void {
	if (typeof document === "undefined") return;
	document.documentElement.setAttribute("data-font", fontKey);
}

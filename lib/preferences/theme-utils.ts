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

/**
 * Apply theme mode (light/dark/system) with smooth transitions disabled during change
 * @param mode - Theme mode to apply
 * @returns The resolved theme mode (light or dark)
 */
export function applyThemeMode(mode: "light" | "dark" | "system"): "light" | "dark" {
	if (typeof document === "undefined") return "light";

	// Disable transitions during theme change
	document.documentElement.classList.add("disable-transitions");

	let resolvedMode: "light" | "dark";

	if (mode === "system") {
		const systemTheme = window.matchMedia("(prefers-color-scheme: dark)").matches
			? "dark"
			: "light";
		document.documentElement.classList.toggle("dark", systemTheme === "dark");
		document.documentElement.setAttribute("data-theme-mode", "system");
		resolvedMode = systemTheme;
	} else {
		document.documentElement.classList.toggle("dark", mode === "dark");
		document.documentElement.setAttribute("data-theme-mode", mode);
		resolvedMode = mode;
	}

	// Re-enable transitions after a frame
	requestAnimationFrame(() => {
		requestAnimationFrame(() => {
			document.documentElement.classList.remove("disable-transitions");
		});
	});

	return resolvedMode;
}

/**
 * Subscribe to system theme changes
 * @param callback - Function to call when system theme changes
 * @returns Cleanup function to remove the listener
 */
export function subscribeToSystemTheme(callback: (isDark: boolean) => void): () => void {
	if (typeof window === "undefined") return () => {};

	const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
	const handler = (e: MediaQueryListEvent) => callback(e.matches);

	mediaQuery.addEventListener("change", handler);

	return () => mediaQuery.removeEventListener("change", handler);
}

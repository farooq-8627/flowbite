/**
 * Layout utility functions — build CSS classes and data attributes
 * from preference values.
 * Source: arhamkhnz/next-shadcn-admin-dashboard (adapted for Orbitly)
 */

import type { ContentLayout, NavbarStyle, SidebarVariant } from "./layout";

/**
 * Build the className for the main content wrapper based on content layout.
 * Used by SidebarInset's inner content div.
 */
export function getContentLayoutClass(layout: ContentLayout): string {
	switch (layout) {
		case "centered":
			return "mx-auto w-full max-w-screen-xl";
		case "full-width":
			return "w-full";
		default:
			return "mx-auto w-full max-w-screen-xl";
	}
}

/**
 * Build the className for the navbar based on navbar style.
 * Used by the TopNav header element.
 */
export function getNavbarClass(style: NavbarStyle): string {
	switch (style) {
		case "sticky":
			return "sticky top-0 z-50";
		case "scroll":
			return "";
		default:
			return "sticky top-0 z-50";
	}
}

/**
 * Data attributes to set on <html> for CSS-driven layout switching.
 * The theme presets CSS files use these selectors.
 */
export function getLayoutDataAttributes(preferences: {
	sidebar_variant: SidebarVariant;
	content_layout: ContentLayout;
	navbar_style: NavbarStyle;
	theme_preset: string;
	font: string;
}): Record<string, string> {
	return {
		"data-sidebar-variant": preferences.sidebar_variant,
		"data-content-layout": preferences.content_layout,
		"data-navbar-style": preferences.navbar_style,
		"data-theme-preset": preferences.theme_preset,
		"data-font": preferences.font,
	};
}

/**
 * Apply sidebar variant by setting data attribute on <html>
 */
export function applySidebarVariant(variant: SidebarVariant): void {
	if (typeof document === "undefined") return;
	document.documentElement.setAttribute("data-sidebar-variant", variant);
}

/**
 * Apply sidebar collapsible mode by setting data attribute on <html>
 */
export function applySidebarCollapsible(collapsible: string): void {
	if (typeof document === "undefined") return;
	document.documentElement.setAttribute("data-sidebar-collapsible", collapsible);
}

/**
 * Apply content layout by setting data attribute on <html>
 */
export function applyContentLayout(layout: ContentLayout): void {
	if (typeof document === "undefined") return;
	document.documentElement.setAttribute("data-content-layout", layout);
}

/**
 * Apply navbar style by setting data attribute on <html>
 */
export function applyNavbarStyle(style: NavbarStyle): void {
	if (typeof document === "undefined") return;
	document.documentElement.setAttribute("data-navbar-style", style);
}



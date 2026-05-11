"use client";

import posthog from "posthog-js";
import { useEffect, useRef } from "react";
import { usePreferencesStore } from "@/lib/stores/preferences-store";

/**
 * PreferencesAnalytics - Tracks user preference changes in PostHog
 *
 * Tracks:
 * - Theme preset changes
 * - Theme mode changes (light/dark/system)
 * - Font changes
 * - Layout preference changes
 * - Sidebar variant changes
 */
export function PreferencesAnalytics() {
	const theme_preset = usePreferencesStore((s) => s.theme_preset);
	const theme_mode = usePreferencesStore((s) => s.theme_mode);
	const font = usePreferencesStore((s) => s.font);
	const sidebar_variant = usePreferencesStore((s) => s.sidebar_variant);
	const content_layout = usePreferencesStore((s) => s.content_layout);
	const radius = usePreferencesStore((s) => s.radius);

	// Track initial load (only once)
	const hasTrackedInitial = useRef(false);

	// biome-ignore lint/correctness/useExhaustiveDependencies: Initial-load tracker — intentionally fires on mount with the snapshot of preferences at that moment. Including each preference as a dep would re-fire the effect on every change and defeat the `hasTrackedInitial.current` guard; per-change tracking is handled by the effects below.
	useEffect(() => {
		if (!hasTrackedInitial.current) {
			posthog.capture("preferences_loaded", {
				theme_preset,
				theme_mode,
				font,
				sidebar_variant,
				content_layout,
				radius,
			});
			hasTrackedInitial.current = true;
		}
	}, []);

	// Track theme preset changes
	const prevThemePreset = useRef(theme_preset);
	useEffect(() => {
		if (prevThemePreset.current !== theme_preset && hasTrackedInitial.current) {
			posthog.capture("theme_preset_changed", {
				from: prevThemePreset.current,
				to: theme_preset,
			});
			prevThemePreset.current = theme_preset;
		}
	}, [theme_preset]);

	// Track theme mode changes
	const prevThemeMode = useRef(theme_mode);
	useEffect(() => {
		if (prevThemeMode.current !== theme_mode && hasTrackedInitial.current) {
			posthog.capture("theme_mode_changed", {
				from: prevThemeMode.current,
				to: theme_mode,
			});
			prevThemeMode.current = theme_mode;
		}
	}, [theme_mode]);

	// Track font changes
	const prevFont = useRef(font);
	useEffect(() => {
		if (prevFont.current !== font && hasTrackedInitial.current) {
			posthog.capture("font_changed", {
				from: prevFont.current,
				to: font,
			});
			prevFont.current = font;
		}
	}, [font]);

	// Track sidebar variant changes
	const prevSidebarVariant = useRef(sidebar_variant);
	useEffect(() => {
		if (prevSidebarVariant.current !== sidebar_variant && hasTrackedInitial.current) {
			posthog.capture("sidebar_variant_changed", {
				from: prevSidebarVariant.current,
				to: sidebar_variant,
			});
			prevSidebarVariant.current = sidebar_variant;
		}
	}, [sidebar_variant]);

	// Track content layout changes
	const prevContentLayout = useRef(content_layout);
	useEffect(() => {
		if (prevContentLayout.current !== content_layout && hasTrackedInitial.current) {
			posthog.capture("content_layout_changed", {
				from: prevContentLayout.current,
				to: content_layout,
			});
			prevContentLayout.current = content_layout;
		}
	}, [content_layout]);

	// Track radius changes
	const prevRadius = useRef(radius);
	useEffect(() => {
		if (prevRadius.current !== radius && hasTrackedInitial.current) {
			posthog.capture("radius_changed", {
				from: prevRadius.current,
				to: radius,
			});
			prevRadius.current = radius;
		}
	}, [radius]);

	return null;
}

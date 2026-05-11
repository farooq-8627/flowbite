"use client";

import { useEffect } from "react";
import { applyFont, applyThemeMode, applyThemePreset } from "@/lib/preferences/theme-utils";
import { usePreferencesStore } from "@/stores/preferences/preferences-provider";

export function PreferencesInitializer() {
	const theme_preset = usePreferencesStore((s) => s.theme_preset);
	const theme_mode = usePreferencesStore((s) => s.theme_mode);
	const radius = usePreferencesStore((s) => s.radius);
	const font = usePreferencesStore((s) => s.font);

	useEffect(() => {
		// Apply theme preset
		applyThemePreset(theme_preset);

		// Apply theme mode
		applyThemeMode(theme_mode);

		// Listen for system theme changes when in system mode
		const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
		const handleSystemThemeChange = () => {
			if (theme_mode === "system") {
				applyThemeMode("system");
			}
		};

		mediaQuery.addEventListener("change", handleSystemThemeChange);

		// Apply radius
		document.documentElement.style.setProperty("--radius", `${radius}rem`);

		// Apply font
		applyFont(font);

		return () => {
			mediaQuery.removeEventListener("change", handleSystemThemeChange);
		};
	}, [theme_preset, theme_mode, radius, font]);

	return null;
}

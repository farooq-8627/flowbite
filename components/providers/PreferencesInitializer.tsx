"use client";

import { useEffect } from "react";
import { usePreferencesStore } from "@/stores/preferences/preferences-provider";
import { applyThemePreset, applyFont } from "@/lib/preferences/theme-utils";

export function PreferencesInitializer() {
	const theme_preset = usePreferencesStore((s) => s.theme_preset);
	const theme_mode = usePreferencesStore((s) => s.theme_mode);
	const radius = usePreferencesStore((s) => s.radius);
	const font = usePreferencesStore((s) => s.font);

	useEffect(() => {
		// Apply theme preset
		applyThemePreset(theme_preset);

		// Apply theme mode
		const applyThemeMode = (mode: string) => {
			if (mode === "system") {
				const systemTheme = window.matchMedia("(prefers-color-scheme: dark)").matches
					? "dark"
					: "light";
				document.documentElement.classList.toggle("dark", systemTheme === "dark");
				document.documentElement.setAttribute("data-theme-mode", "system");
			} else {
				document.documentElement.classList.toggle("dark", mode === "dark");
				document.documentElement.setAttribute("data-theme-mode", mode);
			}
		};

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

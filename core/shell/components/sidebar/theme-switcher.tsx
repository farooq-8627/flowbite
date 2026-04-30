"use client";

import { Monitor, Moon, Sun } from "lucide-react";

import { Button } from "@/components/ui/button";
import { persistPreference } from "@/lib/preferences/preferences-storage";
import { usePreferencesStore } from "@/stores/preferences/preferences-provider";

const THEME_CYCLE = ["light", "dark", "system"] as const;

/**
 * ThemeSwitcher - Button to cycle through light, dark, and system theme modes
 * Updates both store state and persists preference to storage
 */
export function ThemeSwitcher() {
	const theme_mode = usePreferencesStore((s) => s.theme_mode);
	const setThemeMode = usePreferencesStore((s) => s.setThemeMode);

	const cycleTheme = () => {
		const currentIndex = THEME_CYCLE.indexOf(theme_mode);
		const nextTheme = THEME_CYCLE[(currentIndex + 1) % THEME_CYCLE.length];

		setThemeMode(nextTheme);
		void persistPreference("theme_mode", nextTheme);
	};

	return (
		<Button
			size="icon"
			onClick={cycleTheme}
			aria-label={`Current theme: ${theme_mode}. Click to cycle themes`}
		>
			{/* SYSTEM */}
			<Monitor className="hidden [html[data-theme-mode=system]_&]:block" />

			{/* DARK (resolved) */}
			<Sun className="hidden dark:block [html[data-theme-mode=system]_&]:hidden" />

			{/* LIGHT (resolved) */}
			<Moon className="block dark:hidden [html[data-theme-mode=system]_&]:hidden" />
		</Button>
	);
}

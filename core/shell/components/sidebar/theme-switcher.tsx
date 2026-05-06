"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SidebarMenuButton } from "@/components/ui/sidebar";
import { usePreferencesStore } from "@/stores/preferences/preferences-provider";
import { persistPreference } from "@/lib/preferences/preferences-storage";

const THEME_CYCLE = ["light", "dark", "system"] as const;
const THEME_ICONS = { light: Moon, dark: Sun, system: Monitor } as const;
const THEME_LABELS = { light: "Light", dark: "Dark", system: "System" } as const;

/**
 * ThemeSwitcher — cycles through light/dark/system.
 * Renders as a Button (default) or SidebarMenuButton (sidebar variant).
 */
export function ThemeSwitcher({ variant = "button" }: { variant?: "button" | "sidebar" }) {
	const theme_mode = usePreferencesStore((s) => s.theme_mode);
	const setThemeMode = usePreferencesStore((s) => s.setThemeMode);

	const cycleTheme = () => {
		const idx = THEME_CYCLE.indexOf(theme_mode);
		const next = THEME_CYCLE[(idx + 1) % THEME_CYCLE.length];
		setThemeMode(next);
		void persistPreference("theme_mode", next);
	};

	const Icon = THEME_ICONS[theme_mode];
	const label = `Theme: ${THEME_LABELS[theme_mode]}`;

	if (variant === "sidebar") {
		return (
			<SidebarMenuButton onClick={cycleTheme} tooltip={label}>
				<Icon />
				<span>{label}</span>
			</SidebarMenuButton>
		);
	}

	return (
		<Button size="icon" variant="ghost" onClick={cycleTheme} aria-label={label}>
			<Icon className="size-4" />
		</Button>
	);
}

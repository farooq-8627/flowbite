"use client";

import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { setClientCookie } from "@/lib/cookie.client";
import { COOKIE_PREFIX } from "@/lib/preferences/preferences-config";

/**
 * Theme toggle for the marketing site.
 *
 * Self-contained: flips the `.dark` class on <html> and persists the choice
 * to the SAME cookie (`orbitly-pref-theme_mode`) that `ThemeBootScript`
 * reads on load — so the preference carries over to the app and survives a
 * refresh with no flash.
 */
export function ThemeToggle() {
	const [isDark, setIsDark] = useState(false);

	useEffect(() => {
		setIsDark(document.documentElement.classList.contains("dark"));
	}, []);

	function toggle() {
		const next = !isDark;
		const root = document.documentElement;
		root.classList.toggle("dark", next);
		root.style.colorScheme = next ? "dark" : "light";
		root.setAttribute("data-theme-mode", next ? "dark" : "light");
		setClientCookie(`${COOKIE_PREFIX}theme_mode`, next ? "dark" : "light", 365);
		setIsDark(next);
	}

	return (
		<Button variant="ghost" size="icon" onClick={toggle} aria-label="Toggle dark mode">
			<Sun className="size-5 dark:hidden" />
			<Moon className="hidden size-5 dark:block" />
		</Button>
	);
}

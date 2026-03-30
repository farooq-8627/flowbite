/**
 * ThemeProvider — wraps next-themes for dark/light/system theme support.
 *
 * Sources:
 * - https://github.com/pacocoursey/next-themes/blob/main/README.md — official setup
 * - https://github.com/StevanFreeborn/conve-x/blob/main/src/providers/index.tsx — Convex + next-themes pattern
 */
"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";
import type { ReactNode } from "react";

export function ThemeProvider({ children }: { children: ReactNode }) {
	return (
		<NextThemesProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
			{children}
		</NextThemesProvider>
	);
}

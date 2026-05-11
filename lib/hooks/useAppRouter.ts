/**
 * Locale-aware router hook — wraps next-intl's navigation utilities.
 *
 * WHY THIS EXISTS:
 *   R9: Never hardcode locale in paths. This hook auto-prefixes the current locale.
 *   All navigation in the app should go through this hook.
 *
 * USAGE:
 *   ```ts
 *   const { push, replace, back } = useAppRouter();
 *   push("/dashboard/connections"); // → auto prefixes /en/dashboard/connections
 *   ```
 *
 * Sources:
 * - https://next-intl.dev/docs/routing/navigation — official next-intl navigation docs
 */
"use client";

import { usePathname, useRouter } from "next/navigation";
import { useLocale } from "next-intl";
import { useCallback } from "react";

export function useAppRouter() {
	const router = useRouter();
	const locale = useLocale();
	const pathname = usePathname();

	const push = useCallback(
		(path: string) => {
			const localePrefix = `/${locale}`;
			const prefixedPath = path.startsWith(localePrefix) ? path : `${localePrefix}${path}`;
			router.push(prefixedPath);
		},
		[router, locale],
	);

	const replace = useCallback(
		(path: string) => {
			const localePrefix = `/${locale}`;
			const prefixedPath = path.startsWith(localePrefix) ? path : `${localePrefix}${path}`;
			router.replace(prefixedPath);
		},
		[router, locale],
	);

	const back = useCallback(() => {
		router.back();
	}, [router]);

	return { push, replace, back, pathname, locale };
}

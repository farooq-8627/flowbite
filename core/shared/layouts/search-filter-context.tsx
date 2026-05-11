"use client";

import { createContext, useContext, type ReactNode } from "react";

/**
 * While a shell's search input has a query, every <SettingsSection> (and any
 * future <ShellSection>) reads this context. If the section's id is NOT in
 * `matchingIds`, the section returns null — so search filtering happens inline
 * in the main content area, without mounting an alternative "results screen".
 *
 * Sections that aren't in a search context render normally (matchingIds=null).
 *
 * Lives in `core/shared/layouts/` because profile, settings, and future shells
 * all share the same pattern.
 */
type SearchFilterContextValue = {
	matchingIds: Set<string> | null;
};

const SearchFilterContext = createContext<SearchFilterContextValue>({
	matchingIds: null,
});

export function useSearchFilter(): SearchFilterContextValue {
	return useContext(SearchFilterContext);
}

export function SearchFilterProvider({
	matchingIds,
	children,
}: {
	matchingIds: Set<string>;
	children: ReactNode;
}) {
	return (
		<SearchFilterContext.Provider value={{ matchingIds }}>
			{children}
		</SearchFilterContext.Provider>
	);
}

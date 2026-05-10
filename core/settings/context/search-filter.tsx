"use client";

import { createContext, useContext, type ReactNode } from "react";

/**
 * While the settings search input has a query, every <SettingsSection>
 * consumes this context. If the section's id is NOT in `matchingIds`,
 * the section returns null — so search filtering happens inline, in the
 * main content area, without mounting alternative UI.
 *
 * `matchingIds === null` → not searching; every section renders normally.
 */
type Ctx = {
	matchingIds: Set<string> | null;
};

const SearchFilterContext = createContext<Ctx>({ matchingIds: null });

export function useSearchFilter(): Ctx {
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

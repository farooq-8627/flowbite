"use client";

/**
 * Preferences Provider
 * Hydrates the preferences store from cookies on client mount
 */

import { useEffect } from "react";
import { usePreferencesStore } from "@/lib/stores/preferences-store";

export function PreferencesProvider({ children }: { children: React.ReactNode }) {
	useEffect(() => {
		usePreferencesStore.getState().hydrate();
	}, []);

	return <>{children}</>;
}

// Re-export the hook for convenience
export { usePreferencesStore };

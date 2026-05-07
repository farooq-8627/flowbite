"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";

/**
 * useModuleEnabled — returns true if a feature flag is enabled for the current org.
 * Returns false while loading (safe default — hides feature-gated items until confirmed).
 */
export function useModuleEnabled(featureFlag: string): boolean {
	const flags = useQuery(api.featureFlags.queries.getForOrg);
	return flags?.[featureFlag] ?? false;
}

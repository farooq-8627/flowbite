"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useFeatureFlags } from "@/core/shell/shared/hooks/useCurrentOrg";

/**
 * useModuleEnabled — returns true if a feature flag is enabled for the current org.
 *
 * Returns `false` while loading (safe default — hides feature-gated items
 * until confirmed). Returns `false` if the flag key isn't present in the
 * map.
 *
 * Performance
 * ───────────
 * Inside the dashboard shell, this reads from the shared `OrgProvider`
 * context — zero new subscriptions. Outside the shell (auth pages,
 * onboarding, super-admin views) it falls back to its own `useQuery`.
 * Same pattern as `useEntityLabels` / `useOrgDefaultCurrency` — see
 * AGENTS.md "Identity/auth/labels via context, not subscriptions".
 *
 * Hook-rule note: we *always* call `useQuery(...)` to keep the call order
 * stable, but we pass `"skip"` when the context already has the flags so
 * Convex never registers a duplicate subscription.
 */
export function useModuleEnabled(featureFlag: string): boolean {
	const ctx = useFeatureFlags();
	const fallback = useQuery(api.featureFlags.queries.getForOrg, ctx ? "skip" : {});
	const flags = ctx ?? fallback;
	return flags?.[featureFlag] ?? false;
}

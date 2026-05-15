"use client";

import { useQuery } from "convex/react";
import { createContext, type ReactNode, useContext, useMemo } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

/**
 * OrgContext — resolves `orgSlug → orgId` once at the layout level.
 *
 * WHY THIS EXISTS:
 *   Before this hook, every entity view independently called
 *   `useQuery(api.orgs.queries.listMyOrgs)` and then did
 *   `orgs?.find(o => o.org.slug === orgSlug)?.org._id`. This created a
 *   query waterfall: the real data queries (leads, deals, etc.) couldn't
 *   start until `listMyOrgs` resolved. With 9+ views doing this
 *   independently, the pattern was duplicated everywhere.
 *
 *   Now: `DashboardLayoutClient` mounts `<OrgProvider orgSlug={...}>` once.
 *   Every child calls `useCurrentOrg()` to get `{ orgId, org, isLoading }`.
 *   The Convex subscription is shared (single network call), and `orgId` is
 *   available immediately on subsequent navigations (warm cache).
 *
 * USAGE:
 *   ```tsx
 *   // In any entity view:
 *   const { orgId } = useCurrentOrg();
 *   const leads = useQuery(api.crm.entities.leads.queries.list, orgId ? { orgId } : "skip");
 *   ```
 */

type OrgContextValue = {
	orgSlug: string;
	orgId: Id<"orgs"> | undefined;
	org: { name: string; slug: string; plan: string } | undefined;
	isLoading: boolean;
};

const OrgContext = createContext<OrgContextValue | null>(null);

export function OrgProvider({ orgSlug, children }: { orgSlug: string; children: ReactNode }) {
	const orgs = useQuery(api.orgs.queries.listMyOrgs);
	const value = useMemo<OrgContextValue>(() => {
		const entry = orgs?.find((o) => o.org.slug === orgSlug);
		return {
			orgSlug,
			orgId: entry?.org._id,
			org: entry?.org
				? { name: entry.org.name, slug: entry.org.slug, plan: entry.org.plan }
				: undefined,
			isLoading: orgs === undefined,
		};
	}, [orgs, orgSlug]);

	return <OrgContext.Provider value={value}>{children}</OrgContext.Provider>;
}

/**
 * Returns the current org context. Must be used inside `<OrgProvider>`.
 *
 * Returns `{ orgId, org, orgSlug, isLoading }`.
 * - `orgId` is `undefined` while loading or if the slug doesn't match.
 * - `isLoading` is `true` until the first `listMyOrgs` response arrives.
 */
export function useCurrentOrg(): OrgContextValue {
	const ctx = useContext(OrgContext);
	if (!ctx) throw new Error("useCurrentOrg must be used inside <OrgProvider>");
	return ctx;
}

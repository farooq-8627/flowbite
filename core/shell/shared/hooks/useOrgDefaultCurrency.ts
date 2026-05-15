"use client";

/**
 * useOrgDefaultCurrency — read the org-level default currency code (USD/AED/
 * EUR/INR/…) from `orgs.settings.defaultCurrency`. Resolves the active org
 * from the URL exactly like `useEntityLabels`.
 *
 * Why this exists
 * ───────────────
 * Every place that formats a money value (deal value cell, kanban column
 * total, custom-field currency renderer, AI summaries) was hardcoded to USD.
 * That broke for AED / EUR / INR workspaces. This hook resolves the org
 * setting once and returns a stable string so callers can pass it into
 * `Intl.NumberFormat` or a `formatCurrency()` helper.
 *
 * Contract
 * ────────
 *   - Returns `"USD"` as the safe fallback while the query loads or when no
 *     setting is configured.
 *   - Hook flavour because Convex queries are reactive — we want updates to
 *     ripple through every consumer when the admin saves a new currency.
 *   - Accepts an explicit orgId override for places that already know it
 *     (settings, mutations) — same shape as `useEntityLabels(orgId?)`.
 */

import { useQuery } from "convex/react";
import { usePathname } from "next/navigation";
import { useMemo } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

/** Canonical fallback used when no org setting / query still loading. */
export const FALLBACK_CURRENCY = "USD";

function extractOrgSlug(pathname: string | null): string | null {
	if (!pathname) return null;
	const segments = pathname.split("/").filter(Boolean);
	if (segments.length < 2) return null;
	const candidate = segments[1];
	const RESERVED = new Set([
		"signin",
		"signup",
		"forgot-password",
		"verify-email",
		"join",
		"onboarding",
		"pricing",
	]);
	if (RESERVED.has(candidate)) return null;
	return candidate;
}

export function useOrgDefaultCurrency(orgId?: Id<"orgs">): string {
	const pathname = usePathname();
	const orgSlugFromUrl = useMemo(() => extractOrgSlug(pathname), [pathname]);

	const myOrgs = useQuery(api.orgs.queries.listMyOrgs, !orgId && orgSlugFromUrl ? {} : "skip");
	const resolvedOrgId = useMemo<Id<"orgs"> | undefined>(() => {
		if (orgId) return orgId;
		if (!myOrgs || !orgSlugFromUrl) return undefined;
		return myOrgs.find((m) => m.org.slug === orgSlugFromUrl)?.org._id;
	}, [orgId, myOrgs, orgSlugFromUrl]);

	const org = useQuery(api.orgs.queries.get, resolvedOrgId ? { orgId: resolvedOrgId } : "skip");

	return org?.settings?.defaultCurrency ?? FALLBACK_CURRENCY;
}

/**
 * Format a numeric value as currency using the active org's default currency.
 * Pure helper — accepts the currency code so it can be used in non-component
 * contexts (e.g. inside a `useMemo` formatter).
 */
export function formatCurrency(
	value: number | string | null | undefined,
	currencyCode: string = FALLBACK_CURRENCY,
	options?: Intl.NumberFormatOptions,
): string {
	if (value === null || value === undefined || value === "") return "";
	const num = typeof value === "number" ? value : Number(value);
	if (Number.isNaN(num)) return String(value);
	try {
		return new Intl.NumberFormat(undefined, {
			style: "currency",
			currency: currencyCode,
			maximumFractionDigits: 0,
			...options,
		}).format(num);
	} catch {
		// Bad currency code — fall back to plain number with the code prefix.
		return `${currencyCode} ${num}`;
	}
}

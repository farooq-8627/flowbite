"use client";

/**
 * useOrgDefaultCurrency — read the org-level default currency code (USD/AED/
 * EUR/INR/…) from `orgs.settings.defaultCurrency`.
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
 *
 * Performance
 * ───────────
 * Two flavours are exported so dashboard renderers don't pay for an extra
 * subscription:
 *
 *   - `useCurrentOrgCurrency()` — preferred inside the dashboard. Reads from
 *     the shared `OrgProvider` context. Zero new subscriptions.
 *   - `useOrgDefaultCurrency(orgId)` — non-dashboard fallback. Fires its own
 *     `orgs.get` subscription for the explicit id (settings save handlers,
 *     standalone components like `FileUpload`).
 */

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useCurrentOrg } from "./useCurrentOrg";

/** Canonical fallback used when no org setting / query still loading. */
export const FALLBACK_CURRENCY = "USD";

/** Explicit-id flavour — fires its own subscription. */
export function useOrgDefaultCurrency(orgId?: Id<"orgs">): string {
	const explicit = useQuery(api.orgs.queries.get, orgId ? { orgId } : "skip");
	return explicit?.settings?.defaultCurrency ?? FALLBACK_CURRENCY;
}

/** Dashboard flavour — zero new subscriptions, reads OrgProvider context. */
export function useCurrentOrgCurrency(): string {
	const { fullOrgEntry } = useCurrentOrg();
	return fullOrgEntry?.org.settings?.defaultCurrency ?? FALLBACK_CURRENCY;
}

/**
 * Format a numeric value as currency using the active org's default currency.
 * Pure helper — accepts the currency code so it can be used in non-component
 * contexts (e.g. inside a `useMemo` formatter).
 *
 * Defaults to `currencyDisplay: "narrowSymbol"` which renders the most
 * compact symbol available for the active locale. Without it,
 * `Intl.NumberFormat` shows "US$0" in en-GB / en-CA / en-AU instead of
 * "$0" — a confusing rendering when the user clearly chose USD. The
 * narrow form falls back to the canonical symbol when no narrow form
 * exists (e.g. INR → ₹, AED → د.إ).
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
			currencyDisplay: "narrowSymbol",
			maximumFractionDigits: 0,
			...options,
		}).format(num);
	} catch {
		// Bad currency code — fall back to plain number with the code prefix.
		return `${currencyCode} ${num}`;
	}
}

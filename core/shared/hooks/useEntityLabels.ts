/**
 * useEntityLabels — Single source of truth for entity names across the app.
 *
 * WHY THIS EXISTS:
 *   Every entity name ("Lead", "Contact", "Deal", "Company") in the UI must come
 *   from the org's saved labels, NEVER be hardcoded. When an admin renames
 *   "Lead" → "Inquiry" in Settings, the sidebar, page titles, descriptions,
 *   dropdowns, empty states, and AI prompts all update instantly via Convex
 *   reactivity. This hook is the one-stop hook for that lookup.
 *
 * WHY TWO SIGNATURES:
 *   - `useEntityLabels()` — auto-detects the active org from the current URL
 *     (/{locale}/{orgSlug}/...). Use this from anywhere inside the dashboard
 *     shell (sidebar, topnav, entity views) where we don't want to pass orgId
 *     through 10 layers of props.
 *   - `useEntityLabels(orgId)` — explicit lookup by orgId. Use this in the
 *     settings page and anywhere else that already holds the orgId.
 *
 * WHY FALLBACK TO DEFAULTS ON EVERY LAYER:
 *   Convex queries return `undefined` while loading. The UI must render SOMETHING
 *   during that moment (sidebar can't show blank items). We return safe English
 *   defaults as a placeholder — the real labels arrive within milliseconds.
 *
 * Sources:
 *   - Existing pattern in SettingsView.tsx: listMyOrgs → find by slug → orgId
 *   - `resolveEntityLabels` helper in core/settings/types.ts (same fallback merge)
 *   - convex/orgs/queries.ts::getEntityLabels — server-side canonical defaults
 */
"use client";

import { useQuery } from "convex/react";
import { usePathname } from "next/navigation";
import { useMemo } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

// ── Types ────────────────────────────────────────────────────────────────────

export type EntityLabel = { singular: string; plural: string; slug: string };
export type EntitySlot = "lead" | "contact" | "deal" | "company";
export type EntityLabels = Record<EntitySlot, EntityLabel>;

// ── Defaults (used as fallback only) ─────────────────────────────────────────

export const ENTITY_LABEL_DEFAULTS: EntityLabels = {
	lead: { singular: "Lead", plural: "Leads", slug: "leads" },
	contact: { singular: "Contact", plural: "Contacts", slug: "contacts" },
	deal: { singular: "Deal", plural: "Deals", slug: "deals" },
	company: { singular: "Company", plural: "Companies", slug: "companies" },
};

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Extract orgSlug from the current pathname.
 * Expected pattern: `/{locale}/{orgSlug}/...` — locale is always the first segment.
 * Returns null if we're on a public or auth route that doesn't include an org slug.
 */
function extractOrgSlug(pathname: string | null): string | null {
	if (!pathname) return null;
	const segments = pathname.split("/").filter(Boolean);
	// segments[0] = locale (e.g. "en", "ar"), segments[1] = orgSlug
	if (segments.length < 2) return null;
	const candidate = segments[1];
	// Reject known non-org routes — keeps the hook safe on auth/public pages.
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

/** Merge server labels with defaults so every slot is always fully populated. */
function mergeWithDefaults(raw?: Partial<EntityLabels> | null | undefined): EntityLabels {
	return {
		lead: { ...ENTITY_LABEL_DEFAULTS.lead, ...(raw?.lead ?? {}) },
		contact: { ...ENTITY_LABEL_DEFAULTS.contact, ...(raw?.contact ?? {}) },
		deal: { ...ENTITY_LABEL_DEFAULTS.deal, ...(raw?.deal ?? {}) },
		company: { ...ENTITY_LABEL_DEFAULTS.company, ...(raw?.company ?? {}) },
	};
}

// ── Public Hook ──────────────────────────────────────────────────────────────

/**
 * Returns the active org's entity labels with defaults as fallback.
 *
 * @example
 *   // Inside the dashboard shell — auto-detects org from URL
 *   const labels = useEntityLabels();
 *   <h1>{labels.lead.plural}</h1>          // "Inquiries" (or "Leads" default)
 *   <Link href={`/${labels.deal.slug}`}>   // "/opportunities" (or "/deals")
 *
 * @example
 *   // When you already have an orgId (settings, mutations, etc.)
 *   const labels = useEntityLabels(orgId);
 */
export function useEntityLabels(orgId?: Id<"orgs">): EntityLabels {
	const pathname = usePathname();

	// When no orgId provided, resolve it from URL → listMyOrgs lookup.
	// The `"skip"` pattern is how Convex lets us conditionally fire queries.
	const orgSlugFromUrl = useMemo(() => extractOrgSlug(pathname), [pathname]);
	const needsSlugLookup = !orgId && orgSlugFromUrl !== null;

	const myOrgs = useQuery(api.orgs.queries.listMyOrgs, needsSlugLookup ? {} : "skip");

	const resolvedOrgId = useMemo<Id<"orgs"> | undefined>(() => {
		if (orgId) return orgId;
		if (!myOrgs || !orgSlugFromUrl) return undefined;
		return myOrgs.find((m) => m.org.slug === orgSlugFromUrl)?.org._id;
	}, [orgId, myOrgs, orgSlugFromUrl]);

	// Pull labels once we have an orgId.
	const labels = useQuery(
		api.orgs.queries.getEntityLabels,
		resolvedOrgId ? { orgId: resolvedOrgId } : "skip",
	);

	// Memoise the merged result so re-renders don't churn referential equality.
	return useMemo(() => mergeWithDefaults(labels ?? undefined), [labels]);
}

/**
 * Convenience lookup for the singular form of a specific slot.
 * Useful in JSX where you only need one label and don't want to destructure.
 *
 * @example
 *   <p>Add a new {useEntityLabel("lead").singular.toLowerCase()}</p>
 */
export function useEntityLabel(slot: EntitySlot): EntityLabel {
	const labels = useEntityLabels();
	return labels[slot];
}

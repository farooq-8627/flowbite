"use client";

/**
 * useEntityHref — build entity URLs that respect the org's renamed slugs.
 *
 * Why this exists
 * ───────────────
 * The CRM lets admins rename "Company" → "Agency", "Lead" → "Inquiry",
 * etc. The path slug for that entity (`/companies/CO-001`) tracks the
 * rename — it becomes `/agencies/CO-001`. Any UI code that hardcodes
 * `/companies/...` breaks the moment a workspace renames the slot.
 *
 * Single source of truth: `useEntityLabels()` returns the active org's
 * label map. This hook is a tiny wrapper that turns
 * `(slot, entityCode)` into the correctly-prefixed path, including
 * locale + orgSlug from `useParams()`.
 *
 * For people (lead/contact) the URL convention is /profile/{personCode}
 * — the four entities that share a person have one profile page. Deals
 * also redirect to a profile page in `EntityDetailRedirect`, but the
 * URL the user types/clicks is still `/{deal-slug}/{dealCode}` so the
 * outer router can do the redirect.
 *
 * Usage
 * ─────
 *   const buildHref = useEntityHref();
 *   const href = buildHref("company", "CO-001");
 *   // → "/en/{orgSlug}/agencies/CO-001"  (when "agencies" is the renamed slug)
 *
 *   // Or for people:
 *   const href = buildHref("lead", "P-007");
 *   // → "/en/{orgSlug}/profile/P-007"
 */

import { useParams } from "next/navigation";
import { useCallback } from "react";
import { type EntityLabels, type EntitySlot, useEntityLabels } from "./useEntityLabels";

export type EntityHrefBuilder = (
	slot: EntitySlot,
	code: string | undefined | null,
) => string | null;

/**
 * Hook variant — pulls locale + orgSlug + labels from React context.
 * Returns `null` when the context isn't ready yet (so callers can render
 * a non-link fallback without crashing during SSR / first paint).
 */
export function useEntityHref(): EntityHrefBuilder {
	const params = useParams();
	const orgSlug = params?.orgSlug as string | undefined;
	const locale = params?.locale as string | undefined;
	const labels = useEntityLabels();

	return useCallback(
		(slot: EntitySlot, code: string | undefined | null) => {
			if (!orgSlug || !code) return null;
			return buildEntityHref({ orgSlug, locale, labels, slot, code });
		},
		[orgSlug, locale, labels],
	);
}

/**
 * `useEntityHref` for callers that already have access to `params` /
 * `orgSlug` / `locale` and only want the labels-aware string builder.
 */
export function useEntityHrefBuilderFromLabels(
	orgSlug: string | undefined,
	locale: string | undefined,
): EntityHrefBuilder {
	const labels = useEntityLabels();
	return useCallback(
		(slot, code) => {
			if (!orgSlug || !code) return null;
			return buildEntityHref({ orgSlug, locale, labels, slot, code });
		},
		[orgSlug, locale, labels],
	);
}

/**
 * Hook that returns ONLY the labels — useful for components that already
 * pull their own params and just need the raw string.
 */
export function useEntityHrefLabels(): EntityLabels {
	return useEntityLabels();
}

// ─── Pure builders (no hooks) — for places that already have everything ──

interface BuildArgs {
	orgSlug: string;
	locale: string | undefined;
	labels: EntityLabels;
	slot: EntitySlot;
	code: string;
}

/**
 * Pure URL builder. Call this from components that already have
 * `orgSlug` + `locale` + `labels` in scope (e.g. `useParams` + the
 * labels hook). Centralizes the rule:
 *
 *   - Lead/Contact → `/profile/{code}` (single shared page)
 *   - Deal/Company → `/{slug}/{code}` (slug = labels[slot].slug)
 *
 * Always returns a path that starts with `/`. If a locale is provided,
 * the path is prefixed with it; otherwise it's just `/{orgSlug}/...`.
 */
export function buildEntityHref({ orgSlug, locale, labels, slot, code }: BuildArgs): string {
	const prefix = locale ? `/${locale}/${orgSlug}` : `/${orgSlug}`;
	if (slot === "lead" || slot === "contact") {
		return `${prefix}/profile/${code}`;
	}
	const segment = labels[slot].slug;
	return `${prefix}/${segment}/${code}`;
}

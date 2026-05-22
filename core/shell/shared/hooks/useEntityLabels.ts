/**
 * useEntityLabels — Single source of truth for entity names across the app.
 *
 * WHY THIS EXISTS:
 *   Every entity name ("Lead", "Contact", "Deal", "Company") in the UI must
 *   come from the org's saved labels, NEVER be hardcoded. When an admin
 *   renames "Lead" → "Inquiry" in Settings, the sidebar, page titles,
 *   dropdowns, AI prompts all update instantly via Convex reactivity.
 *
 * 2026-05-18 — read from `OrgProvider` context first:
 *   - Inside the dashboard shell, the labels are already in scope via
 *     `useCurrentOrg().entityLabels` — no extra subscription needed.
 *   - When called *outside* the shell (e.g. signed-out preview, the
 *     standalone /onboarding flow, super-admin views) WITH an explicit
 *     orgId, this hook fires its own `useQuery`. That's the legacy path.
 *
 * Returns the labels with English defaults pre-merged so every slot is
 * always populated, even during the first render when the server query
 * hasn't resolved.
 *
 * Sources:
 *   - convex/orgs/queries.ts::getEntityLabels — server-side canonical defaults
 *   - core/shell/shared/hooks/useCurrentOrg.tsx::OrgProvider — the
 *     subscription owner inside the dashboard
 */
"use client";

import { useQuery } from "convex/react";
import { useContext, useMemo } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
	ENTITY_LABEL_DEFAULTS,
	type EntityLabel,
	type EntityLabels,
	type EntitySlot,
	mergeEntityLabelDefaults,
} from "./entity-labels-types";
import { OrgEntityLabelsContext } from "./org-entity-labels-context";

// Re-export types & defaults so existing callers don't have to update imports.
export { ENTITY_LABEL_DEFAULTS, type EntityLabel, type EntityLabels, type EntitySlot };

/**
 * Returns the active org's entity labels with defaults as fallback.
 *
 * Inside `<OrgProvider>` (every dashboard route), this reads from context
 * — no extra Convex subscription. Outside it, when called with an explicit
 * `orgId`, it fires its own subscription.
 *
 * @example
 *   const labels = useEntityLabels();
 *   <h1>{labels.lead.plural}</h1>          // "Inquiries" (or "Leads" default)
 *   <Link href={`/${labels.deal.slug}`}>   // "/opportunities" (or "/deals")
 */
export function useEntityLabels(orgId?: Id<"orgs">): EntityLabels {
	// FAST PATH — read from OrgProvider when available.
	const ctx = useContext(OrgEntityLabelsContext);

	// SLOW PATH — explicit orgId outside the shell. We always call
	// `useQuery` (with `"skip"` when not needed) to keep hook order stable.
	const explicit = useQuery(api.orgs.queries.getEntityLabels, orgId && !ctx ? { orgId } : "skip");

	return useMemo(() => {
		if (ctx) return ctx;
		return mergeEntityLabelDefaults(explicit);
	}, [ctx, explicit]);
}

/** Convenience getter for a single slot's label. */
export function useEntityLabel(slot: EntitySlot): EntityLabel {
	return useEntityLabels()[slot];
}

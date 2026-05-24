"use client";
/**
 * core/ai/hooks/useChatRouteContext.ts
 *
 * Phase 4 Part 1 P1.13 — every chat turn now passes a `pageContext` field
 * alongside the optional entity-context. This hook is the SSOT for
 * deriving:
 *
 *   { mode, path, label }   — broad page mode (always non-null)
 *   entity?                 — entity-specific context (when on /profile/P-X etc.)
 *
 * Modes:
 *
 *   "entity"    — /profile/P-XXX, /deals/D-XXX, /companies/CO-XXX
 *   "list"      — /leads, /contacts, /deals (list views)
 *   "dashboard" — /dashboard
 *   "calendar"  — /calendar
 *   "settings"  — anything under /settings
 *   "reports"   — /reports, /analytics
 *   "other"     — fallback
 *
 * RTL-safe + locale-stripped: the `path` we surface to the model strips
 * the leading locale + orgSlug segments so the model reads
 * "/profile/P-001" rather than "/en/acme/profile/P-001".
 */
import { usePathname } from "next/navigation";
import { useMemo } from "react";
import type { RouteEntityContext } from "../types";
import { useRouteContext } from "./useRouteContext";

export type PageMode =
	| "entity"
	| "list"
	| "dashboard"
	| "calendar"
	| "settings"
	| "reports"
	| "other";

export type PageContext = {
	mode: PageMode;
	path: string;
	label?: string;
};

export type ChatRouteContext = {
	page: PageContext;
	entity: RouteEntityContext | null;
};

/**
 * Strip the leading `/<locale>/<orgSlug>` so the model sees a stable,
 * org-agnostic path. Returns the original pathname when the format
 * doesn't match (e.g. tests, login, root).
 */
function stripLocaleAndOrg(path: string): string {
	// /[locale]/[orgSlug]/<rest>  (Next.js App Router format used by this app)
	const match = path.match(/^\/[a-z]{2}(?:-[A-Z]{2})?\/[^/]+(\/.*)?$/);
	if (match) return match[1] ?? "/";
	// /[locale]/<rest>
	const fallback = path.match(/^\/[a-z]{2}(?:-[A-Z]{2})?(\/.*)?$/);
	if (fallback) return fallback[1] ?? "/";
	return path;
}

function deriveMode(stripped: string): { mode: PageMode; label?: string } {
	if (stripped === "/" || stripped === "/dashboard" || stripped.startsWith("/dashboard/")) {
		return { mode: "dashboard" };
	}
	if (
		stripped.startsWith("/profile/") ||
		stripped.startsWith("/deals/") ||
		stripped.startsWith("/companies/")
	) {
		return { mode: "entity" };
	}
	if (
		stripped === "/leads" ||
		stripped === "/contacts" ||
		stripped === "/deals" ||
		stripped === "/companies" ||
		stripped === "/people"
	) {
		return { mode: "list", label: stripped.slice(1) };
	}
	if (stripped.startsWith("/calendar")) return { mode: "calendar" };
	if (stripped.startsWith("/settings")) return { mode: "settings" };
	if (stripped.startsWith("/reports") || stripped.startsWith("/analytics")) {
		return { mode: "reports" };
	}
	if (stripped.startsWith("/timeline")) return { mode: "list", label: "timeline" };
	return { mode: "other" };
}

export function useChatRouteContext(): ChatRouteContext {
	const pathname = usePathname() ?? "/";
	const entity = useRouteContext();

	return useMemo<ChatRouteContext>(() => {
		const stripped = stripLocaleAndOrg(pathname);
		// Entity routes always get mode=entity (overrides path-based mode).
		if (entity) {
			return {
				page: { mode: "entity", path: stripped, label: entity.name },
				entity,
			};
		}
		const { mode, label } = deriveMode(stripped);
		return {
			page: { mode, path: stripped, label },
			entity: null,
		};
	}, [pathname, entity]);
}

// Test-only export (kept simple — module is `"use client"` so the test
// runner imports it as ESM). Used by useChatRouteContext.test.tsx if
// added later.
export const __test = { stripLocaleAndOrg, deriveMode };

"use client";

/**
 * useOwnerPublicPrefix — derive the public owner-panel URL prefix from
 * the current browser pathname.
 *
 * The browser URL is always the operator-chosen slug (`/superadmin/...`,
 * `/{whatever}/...`); Next.js' `usePathname()` returns that exact path
 * because middleware does an INTERNAL rewrite (the URL bar is preserved).
 * We strip the trailing section to recover the prefix.
 *
 * Why not import the slug from env?
 * ─────────────────────────────────
 * The slug is server-only (locked decision §9.3). Importing it into a
 * client component would inline it into the JS bundle. Reading it from
 * the visible URL is safer — the browser already has it.
 *
 * Returns `"/<slug>"` (no trailing slash). If the user hits a route that
 * doesn't appear to be under the panel (no slug found), returns `""` so
 * callers can fall back to absolute paths.
 *
 * Spec: PLATFORM-OWNER-PANEL.md §3.2.
 */
import { usePathname } from "next/navigation";

/**
 * The set of section names the panel exposes. Used to detect where the
 * slug ends and the section path begins. Mirrors `OWNER_NAV` + special
 * routes (`auth`, panel root).
 */
const SECTION_NAMES = new Set([
	"overview",
	"users",
	"tiers",
	"billing",
	"flags",
	"ai-context",
	"audit",
	"settings",
	"auth",
]);

export function useOwnerPublicPrefix(): string {
	const pathname = usePathname() ?? "";
	if (!pathname.startsWith("/")) return "";

	// Pathname looks like "/<slug>" or "/<slug>/<section>[/...]". The
	// slug is the FIRST segment unless we're on a section root that
	// somehow lost the slug (shouldn't happen via the rewrite).
	const segments = pathname.split("/").filter(Boolean);
	if (segments.length === 0) return "";

	// If the FIRST segment is a known section name (e.g. someone direct-
	// hit `/xowner/...` and routing slipped through), we have no slug.
	const first = segments[0];
	if (!first || first === "xowner" || SECTION_NAMES.has(first)) return "";

	return `/${first}`;
}

/**
 * Build a public owner-panel URL for use in `<Link href>` /
 * `router.push()`. Falls back to the section path on its own when the
 * prefix is unavailable.
 */
export function useOwnerHref(section: string): string {
	const prefix = useOwnerPublicPrefix();
	const tail = section.startsWith("/") ? section : `/${section}`;
	return prefix ? `${prefix}${tail}` : tail;
}

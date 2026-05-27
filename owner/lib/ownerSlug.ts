/**
 * Owner-panel slug helper — SERVER ONLY.
 *
 * Reads `OWNER_PANEL_SLUG` from process.env. Never imported into a client
 * component (the slug must not ship in the JS bundle). Safe to import in:
 *   - Server components (`app/xowner/**`)
 *   - Middleware (`middleware.ts`)
 *   - Convex functions (server runtime)
 *
 * Importing this from a "use client" file is a bug — Next.js will inline
 * the value into the client bundle. If you need to know "am I on the owner
 * panel" client-side, read the `is_owner_panel=1` cookie instead (set by
 * middleware on every owner-panel rewrite).
 *
 * Spec: PLATFORM-OWNER-PANEL.md L1, §9.3.
 */
import "server-only";

/**
 * Returns the configured owner-panel slug, or `undefined` if unset. When
 * unset, the panel is fully disabled (middleware returns 404 for every
 * candidate path).
 */
export function getOwnerSlug(): string | undefined {
	const value = process.env.OWNER_PANEL_SLUG?.trim();
	return value && value.length > 0 ? value : undefined;
}

/**
 * Build a public-facing owner-panel URL from a section path. Throws if
 * the slug is unset (caller should have already gated on `getOwnerSlug`).
 *
 * Examples:
 *   buildOwnerUrl("/overview") → "/<slug>/overview"
 *   buildOwnerUrl("/users")    → "/<slug>/users"
 */
export function buildOwnerUrl(sectionPath: string): string {
	const slug = getOwnerSlug();
	if (!slug) {
		throw new Error(
			"OWNER_PANEL_SLUG is not set — buildOwnerUrl must not be called when the panel is disabled.",
		);
	}
	const tail = sectionPath.startsWith("/") ? sectionPath : `/${sectionPath}`;
	return `/${slug}${tail}`;
}

/**
 * Owner-panel path builder.
 *
 * The owner panel is rendered under the literal `/xowner` route tree but
 * the public URL uses the operator-configured slug. Any URL the BROWSER
 * sees (server `redirect()`, `<Link href>`, client `router.push()`) must
 * use the **public slug-prefixed path** because middleware blocks direct
 * hits on `/xowner/...`. Only Next.js' internal route tree references
 * `/xowner/...` directly.
 *
 * Server components read the slug via `getOwnerPublicPrefix()` (forwarded
 * by middleware as the `x-owner-public-prefix` request header). Client
 * components derive it from `usePathname()` via the `useOwnerPublicPrefix`
 * hook in `owner/hooks/`. Don't put the public slug in the client JS
 * bundle (locked decision §9.3 — slug is server-only).
 *
 * Spec: PLATFORM-OWNER-PANEL.md §3.2.
 */

const OWNER_ROOT = "/xowner";

/**
 * Build an internal owner-panel path. Used for `<Link href>` and
 * `router.push()` inside the owner-panel route tree.
 */
export function ownerPath(section: string = ""): string {
	if (!section || section === "/") return OWNER_ROOT;
	const tail = section.startsWith("/") ? section : `/${section}`;
	return `${OWNER_ROOT}${tail}`;
}

export const OWNER_PATHS = {
	root: ownerPath(),
	overview: ownerPath("/overview"),
	users: ownerPath("/users"),
	tiers: ownerPath("/tiers"),
	billing: ownerPath("/billing"),
	flags: ownerPath("/flags"),
	aiContext: ownerPath("/ai-context"),
	industries: ownerPath("/industries"),
	reservedSlugs: ownerPath("/reserved-slugs"),
	audit: ownerPath("/audit"),
	settings: ownerPath("/settings"),
	auth: ownerPath("/auth"),
} as const;

/**
 * Industries route helpers — produce the public slug-prefixed path
 * via the same `ownerPath()` builder so they pass through middleware.
 *
 * NOTE: client-side `<Link>` should compose these with the
 * `useOwnerPublicPrefix()` hook output. See OwnerSidebar.tsx for the
 * pattern. Server-side `redirect()` should use `ownerPublicPath()`.
 */
export function industryTemplatePath(templateKey: string): string {
	return ownerPath(`/industries/${encodeURIComponent(templateKey)}`);
}

export function industryGroupPath(groupKey: string): string {
	return ownerPath(`/industries/groups/${encodeURIComponent(groupKey)}`);
}

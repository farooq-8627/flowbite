/**
 * Server-only helpers that read the public slug-prefix from the
 * `x-owner-public-prefix` request header set by `proxy.ts` on every
 * owner-panel rewrite.
 *
 * Why a header (and not env)?
 * ─────────────────────────────
 * The slug is server-only by policy (locked decision §9.3 — must not
 * leak into the JS bundle). Reading `process.env.OWNER_PANEL_SLUG`
 * directly inside a layout or server component WOULD work but couples
 * every render to env access, and any accidental "use client" upgrade
 * of that file would silently leak the slug. Routing the value through
 * a request header keeps the surface area to one place (middleware) and
 * makes the dependency explicit.
 *
 * Spec: PLATFORM-OWNER-PANEL.md §2.5 redirect-target rule.
 */
import "server-only";

import { headers } from "next/headers";

const HEADER = "x-owner-public-prefix";

/**
 * Returns the public slug prefix, e.g. `"/superadmin"`. Falls back to
 * an empty string when the header is missing — every owner-panel page
 * runs behind a middleware rewrite, so a missing header indicates the
 * page was reached without going through middleware (a bug — log loudly
 * in dev so we notice).
 */
export async function getOwnerPublicPrefix(): Promise<string> {
	const h = await headers();
	const raw = h.get(HEADER);
	if (!raw || raw.length === 0) {
		if (process.env.NODE_ENV !== "production") {
			console.warn(
				`[owner-panel] ${HEADER} header missing — middleware rewrite did not run. Redirects will fall back to "/".`,
			);
		}
		return "";
	}
	return raw;
}

/**
 * Builds a public-facing owner-panel URL for use in `redirect()` calls
 * from server components / layouts.
 *
 * @example
 * ```ts
 * redirect(await ownerPublicPath("/auth"));
 * ```
 */
export async function ownerPublicPath(section: string = ""): Promise<string> {
	const prefix = await getOwnerPublicPrefix();
	if (!section || section === "/") return prefix || "/";
	const tail = section.startsWith("/") ? section : `/${section}`;
	return `${prefix}${tail}`;
}

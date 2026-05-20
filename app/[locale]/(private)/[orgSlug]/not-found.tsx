/**
 * Org-scoped 404 — rendered when `notFound()` is invoked inside the
 * `[orgSlug]` segment (e.g. `EntitySlugView` couldn't resolve a dynamic
 * entity slug). Wrapped by `[orgSlug]/layout.tsx` so the dashboard sidebar +
 * topnav stay visible — users get a friendly recovery surface without losing
 * navigation context.
 *
 * Without this file, `notFound()` falls through to Next.js's default
 * fallback which throws `NEXT_HTTP_ERROR_FALLBACK;404` and trips the parent
 * `error.tsx` boundary — surfacing a raw stack trace instead of a 404 UI.
 *
 * Note: `not-found.tsx` cannot receive props (no `params`/`searchParams`),
 * so we can't render `/{orgSlug}` directly here. The "Go to dashboard"
 * button points at `/` which redirects to the user's default org via
 * `app/[locale]/page.tsx`.
 */

import { DashboardNotFound } from "@/components/errors/DashboardNotFound";

export default function OrgNotFound() {
	return (
		<DashboardNotFound
			title="We couldn't find that page"
			description="The link you followed may be broken, the page may have been renamed, or you may not have access. Use the sidebar to navigate, or jump back to your dashboard."
		/>
	);
}

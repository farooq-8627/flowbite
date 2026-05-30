import type { ReactNode } from "react";

/**
 * Root-redirect layout — minimal `<html>` / `<body>` scaffold for the
 * `app/(root)/page.tsx` server component that redirects bare-domain
 * traffic to the default locale.
 *
 * Why this exists as a separate route-group root layout
 * ─────────────────────────────────────────────────────
 * The codebase uses Next.js' "multiple root layouts" pattern (route
 * groups, each with its own `<html>`/`<body>`):
 *
 *   - `app/[locale]/layout.tsx` — full provider stack for the
 *     localised app (i18n, theme, Convex, PostHog, etc.).
 *   - `app/xowner/layout.tsx` — minimal owner-panel root (English-only,
 *     no telemetry, locked decisions L9 + L10).
 *
 * Adding a top-level `app/layout.tsx` would force a single shared root,
 * which would conflict with both files above — they both render their
 * own `<html>` / `<body>`, and Next.js disallows nesting those.
 *
 * Instead we put the redirect under a route group `(root)` so it gets
 * its own root layout that only applies to `(root)/page.tsx`.
 *
 * The redirect throws `NEXT_REDIRECT` server-side BEFORE any layout
 * body renders, so this layout's `<body>` is never seen by the
 * browser — the response is an HTTP 307. We still need the layout to
 * exist for Next.js to compile the `(root)` segment.
 *
 * Spec: user-reported 2026-05-30 — `https://orbitly.dev` returned 404
 * on the bare domain.
 */
export default function RootRedirectLayout({ children }: Readonly<{ children: ReactNode }>) {
	return (
		<html lang="en" suppressHydrationWarning>
			<body>{children}</body>
		</html>
	);
}

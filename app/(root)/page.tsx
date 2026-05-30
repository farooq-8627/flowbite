import { redirect } from "next/navigation";
import { routing } from "@/i18n/routing";

/**
 * Root page (`/`) — redirects to the default locale.
 *
 * Why this file exists
 * ────────────────────
 * Bare-domain traffic (e.g. `https://orbitly.dev`) was returning 404
 * because the codebase has no top-level `app/layout.tsx` /
 * `app/page.tsx` — every route lives under `app/[locale]/...` or
 * `app/xowner/...`. The next-intl middleware is supposed to redirect
 * `/` to `/<defaultLocale>` automatically, but production reporting
 * (2026-05-30) showed it failing on the apex domain.
 *
 * This page is the durable belt-and-suspenders fix: a literal server
 * component that throws `redirect()` before any HTML is rendered.
 * Whether next-intl's middleware does its job or not, hitting `/`
 * always returns a 307 to `/<defaultLocale>` from this file.
 *
 * The localised page at `app/[locale]/page.tsx` then handles the rest
 * of the routing tree (auth → onboarding → org dashboard).
 *
 * Notes
 * ─────
 *   - We use `routing.defaultLocale` rather than hardcoding "en" so the
 *     redirect target stays in lockstep with `i18n/routing.ts`.
 *   - Arabic-preferring users land on `/en` first and can switch via
 *     the locale toggle in settings or by visiting `/ar` directly. This
 *     mirrors what next-intl's `localePrefix: "always"` would do for
 *     unmatched Accept-Language requests.
 *   - `redirect()` from `next/navigation` throws `NEXT_REDIRECT` which
 *     Next.js converts to an HTTP 307. Nothing below this line runs.
 */
export default function Page() {
	redirect(`/${routing.defaultLocale}`);
}

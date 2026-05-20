/**
 * Root locale-level 404. Rendered by Next.js when a URL under `/[locale]/…`
 * doesn't match any route, or when a public-side server component calls
 * `notFound()`.
 *
 * Segment-scoped 404s (e.g. inside the dashboard) live alongside their
 * layouts so the surrounding shell is preserved. This file is the universal
 * fallback for everything else (auth pages, marketing, unknown locales, …).
 */

import { DashboardNotFound } from "@/components/errors/DashboardNotFound";

export default function LocaleNotFound() {
	return <DashboardNotFound homeHref="/" />;
}

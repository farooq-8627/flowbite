/**
 * Dashboard view barrel — single import path.
 *
 * `app/[locale]/(private)/[orgSlug]/page.tsx` imports `DashboardHomeView`
 * from this barrel. Cards are accessible via `./cards`.
 */

export { DashboardHomeView } from "./DashboardHomeView";
export type { ActivityItem, DashboardStats } from "./types";

/**
 * Org-scoped 403 page — rendered when `forbidden()` from `next/navigation`
 * is invoked inside the `[orgSlug]` segment, OR when a route guard chooses
 * to render `<DashboardUnauthorized>` directly (e.g. plan-tier gate).
 *
 * Mounted alongside the dashboard layout so the sidebar + topnav stay
 * visible — users keep their navigation context while seeing the friendly
 * recovery surface instead of a raw 403.
 */

import { DashboardUnauthorized } from "@/components/errors/DashboardUnauthorized";

export default function OrgForbidden() {
	return <DashboardUnauthorized />;
}

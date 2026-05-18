import { RemindersView } from "@/core/scheduling/reminders/views/RemindersView";

/**
 * Reminders page — `/{locale}/{orgSlug}/reminders`. Thin wrapper.
 *
 * Hosts three views toggled inside `<RemindersView>`:
 *   - List (DataTable)
 *   - Calendar (embedded calendar grid)
 *   - Today (compact dashboard-style)
 *
 * The standalone `/calendar` route was removed; the calendar lives here
 * as `?view=calendar` since both views read the same data and the user
 * wanted them under one sidebar entry.
 */
export default async function RemindersPage({ params }: { params: Promise<{ orgSlug: string }> }) {
	const { orgSlug } = await params;
	return <RemindersView orgSlug={orgSlug} />;
}

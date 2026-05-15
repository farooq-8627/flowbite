import { RemindersView } from "@/core/scheduling/reminders/views/RemindersView";

/**
 * Reminders page — `/{locale}/{orgSlug}/reminders`. Thin wrapper.
 */
export default async function RemindersPage({ params }: { params: Promise<{ orgSlug: string }> }) {
	await params;
	return <RemindersView />;
}

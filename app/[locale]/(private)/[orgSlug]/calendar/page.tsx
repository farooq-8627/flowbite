import { CalendarView } from "@/core/scheduling/calendar/views/CalendarView";

/**
 * Calendar page — `/{locale}/{orgSlug}/calendar`. Thin wrapper.
 */
export default async function CalendarPage({ params }: { params: Promise<{ orgSlug: string }> }) {
	await params;
	return <CalendarView />;
}

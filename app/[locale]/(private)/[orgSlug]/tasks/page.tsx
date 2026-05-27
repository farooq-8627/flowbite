import { TasksView } from "@/core/scheduling/tasks/views/TasksView";

/**
 * Tasks page — `/{locale}/{orgSlug}/tasks`. Thin wrapper.
 *
 * Hosts three views toggled inside `<TasksView>`:
 *   - List (DataTable)
 *   - Calendar (embedded calendar grid)
 *   - Today (compact dashboard-style)
 *
 * Replaces the legacy `/reminders` and `/followups` routes per
 * TASKS-RENAME-PLAN.md (Stage 4B). Both old routes were deleted in the
 * same change — there's no redirect because dev has no production
 * traffic yet (Decision #8 in the plan).
 */
export default async function TasksPage({ params }: { params: Promise<{ orgSlug: string }> }) {
	const { orgSlug } = await params;
	return <TasksView orgSlug={orgSlug} />;
}

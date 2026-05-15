"use client";

import { useRemindersDueToday } from "@/core/scheduling/reminders/hooks";
/**
 * RemindersView — org-wide reminders (placeholder, no UI yet).
 *
 * Backend supports per-person + due-today queries. UI will use the existing
 * DataTable from `core/data-display/datatable/` per CORE-FEATURES-ARCHITECTURE.md §3.4.
 *
 * Status: backend wired (`useRemindersDueToday`). UI pending.
 */
import { useCurrentOrg } from "@/core/shell/shared/hooks/useCurrentOrg";

export function RemindersView() {
	const { orgId, orgSlug } = useCurrentOrg();
	const dueToday = useRemindersDueToday({ orgId });

	return (
		<div data-status="reminders-pending-ui" className="p-6">
			<h1 className="text-xl font-semibold">Reminders</h1>
			<p className="text-sm text-muted-foreground">
				Backend connected — {dueToday?.length ?? 0} due today. UI pending.
			</p>
			<pre className="mt-4 max-h-[40vh] overflow-auto rounded-[var(--radius)] border bg-muted p-3 text-xs">
				{JSON.stringify(
					{ orgSlug, dueToday: dueToday?.length, sample: dueToday?.slice(0, 3) },
					null,
					2,
				)}
			</pre>
		</div>
	);
}

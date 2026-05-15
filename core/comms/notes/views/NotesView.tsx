"use client";

/**
 * NotesView — org-wide notes browser (placeholder, no UI yet).
 *
 * Backend already supports per-entity notes; an org-wide listing query
 * isn't strictly needed yet — agents typically scope notes per entity. This
 * view will render filters (author / entity / pinned) once UI lands.
 *
 * Status: skeleton wired, UI pending.
 */
import { useCurrentOrg } from "@/core/shell/shared/hooks/useCurrentOrg";

export function NotesView() {
	const { orgId, orgSlug } = useCurrentOrg();

	return (
		<div data-status="notes-pending-ui" className="p-6">
			<h1 className="text-xl font-semibold">Notes</h1>
			<p className="text-sm text-muted-foreground">
				Org-wide notes browser — UI pending. Notes are also embedded in the
				Profile/Deal/Company tabs via <code>NotesPanel</code>.
			</p>
			<pre className="mt-4 max-h-[40vh] overflow-auto rounded-[var(--radius)] border bg-muted p-3 text-xs">
				{JSON.stringify({ orgSlug, orgId }, null, 2)}
			</pre>
		</div>
	);
}

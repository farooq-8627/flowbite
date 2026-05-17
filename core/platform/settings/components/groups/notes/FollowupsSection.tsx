"use client";

/**
 * Settings → Notes → Follow-up Defaults — placeholder.
 *
 * The Followups module ships in a later slice. This section reserves its
 * settings slot so the toolbar / search index find it today and so the
 * eventual editor can drop in without rewiring the nav. Until the module
 * lands, the section just describes what's coming.
 */

import { CalendarClock } from "lucide-react";
import { SettingsSection } from "../../shared/SettingsSection";

export function FollowupsSection() {
	return (
		<SettingsSection
			id="notes.followups"
			title="Follow-up Defaults"
			description="Default cadences for follow-up nudges sent from sticky notes and entity panels."
		>
			<div className="flex items-start gap-3 rounded-[var(--radius)] border border-dashed bg-muted/30 px-4 py-4 text-sm">
				<CalendarClock className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
				<div className="space-y-1">
					<p className="font-medium">Coming soon</p>
					<p className="text-xs text-muted-foreground">
						Follow-up cadence + SLA settings land with the Follow-ups module.
						Today, follow-ups created via the note-card "Set reminder" action
						use the workspace defaults you set under
						<span className="font-medium"> Notes → Reminders</span>.
					</p>
				</div>
			</div>
		</SettingsSection>
	);
}

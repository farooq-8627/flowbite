"use client";

/**
 * Settings → Notes → Timeline Display — placeholder.
 *
 * The Timeline module ships in a later slice. This section reserves its
 * settings slot so the search index / nav surface it today and the
 * eventual editor (event-type filters, default look-back window, etc.)
 * can drop in without rewiring.
 */

import { Activity } from "lucide-react";
import { SettingsSection } from "../../shared/SettingsSection";

export function TimelineSection() {
	return (
		<SettingsSection
			id="notes.timeline"
			title="Timeline Display"
			description="Choose which event types surface on entity and org-wide timelines."
		>
			<div className="flex items-start gap-3 rounded-[var(--radius)] border border-dashed bg-muted/30 px-4 py-4 text-sm">
				<Activity className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
				<div className="space-y-1">
					<p className="font-medium">Coming soon</p>
					<p className="text-xs text-muted-foreground">
						Event-type filters, default look-back window, and per-entity
						timeline preferences land with the Timeline module. The activity
						feed is always written; this section will only control what's
						<em> visible</em> in the UI.
					</p>
				</div>
			</div>
		</SettingsSection>
	);
}

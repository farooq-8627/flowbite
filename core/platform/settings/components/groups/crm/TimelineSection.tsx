"use client";

/**
 * Settings → CRM → Timeline — per-user display preferences.
 *
 * What this controls
 * ──────────────────
 * The activity log is always written to the database (every state change,
 * note, reminder, AI action, etc.). This section only tweaks what the
 * CURRENT user sees in their timeline feeds (org-wide, profile, and
 * entity timelines all read from the same `<TimelineFeed>` component).
 *
 * Storage
 * ───────
 * Per-device localStorage via `useTimelinePreferences()`. No Convex
 * round-trip, no schema migration — preferences travel with the device.
 *
 * Default behaviour
 * ─────────────────
 * The "Note created/edited", "Reminder created/completed", and "Follow-up
 * created/completed" rows are hidden by default. Reason: the timeline
 * already shows the actual note/reminder card (with content + timestamps),
 * so the parallel bare "Note added · 5m ago" row is just noise. Users who
 * want a strict audit feed can re-enable them here.
 */

import { Activity, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
	TIMELINE_EVENT_GROUPS,
	useTimelinePreferences,
} from "@/core/comms/timeline/hooks/useTimelinePreferences";
import { SettingsSection } from "../../shared/SettingsSection";

export function TimelineSection() {
	const { isHidden, toggleGroup, resetToDefaults, hiddenGroups } = useTimelinePreferences();

	return (
		<SettingsSection
			id="notes.timeline"
			title="Timeline Display"
			description="Choose which event types surface on entity, profile, and org-wide timelines. Only affects what YOU see. The activity log is always written. Stored on this device."
			action={
				<Button
					type="button"
					variant="ghost"
					size="sm"
					onClick={resetToDefaults}
					className="text-xs"
				>
					<RotateCcw className="me-1.5 size-3" />
					Reset to defaults
				</Button>
			}
		>
			{/* Pinned context block — explains why this exists. */}
			<div className="mb-4 flex items-start gap-3 rounded-[var(--radius)] border border-dashed bg-muted/30 px-3 py-2.5 text-xs text-muted-foreground">
				<Activity className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" aria-hidden />
				<div className="space-y-1">
					<p>
						Notes and reminders show as their own cards in the timeline. The parallel
						"Note added" / "Reminder set" activity rows are hidden by default to avoid
						duplicate entries — toggle them back on here for a strict audit feed.
					</p>
				</div>
			</div>

			<ul className="flex flex-col divide-y rounded-[var(--radius)] border bg-background">
				{TIMELINE_EVENT_GROUPS.map((group) => {
					const isVisible = !isHidden(group.id);
					return (
						<li
							key={group.id}
							className="flex flex-col gap-3 px-3 py-3 sm:flex-row sm:items-start sm:justify-between"
						>
							<div className="flex min-w-0 flex-1 flex-col gap-0.5">
								<div className="flex items-center gap-2">
									<span className="text-sm font-medium">{group.label}</span>
									{group.defaultHidden && (
										<span className="rounded-[calc(var(--radius)-2px)] bg-muted px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wider text-muted-foreground">
											Hidden by default
										</span>
									)}
								</div>
								<p className="text-xs leading-snug text-muted-foreground">
									{group.description}
								</p>
							</div>
							<div className="flex items-center gap-2 self-start sm:self-auto">
								<span
									className={
										isVisible
											? "text-[10px] font-medium uppercase tracking-wider text-emerald-700"
											: "text-[10px] font-medium uppercase tracking-wider text-muted-foreground"
									}
								>
									{isVisible ? "Visible" : "Hidden"}
								</span>
								<Switch
									checked={isVisible}
									onCheckedChange={() => toggleGroup(group.id)}
									aria-label={`${isVisible ? "Hide" : "Show"} ${group.label}`}
								/>
							</div>
						</li>
					);
				})}
			</ul>

			<p className="mt-3 text-[11px] text-muted-foreground">
				{hiddenGroups.length} of {TIMELINE_EVENT_GROUPS.length} event groups currently
				hidden.
			</p>
		</SettingsSection>
	);
}

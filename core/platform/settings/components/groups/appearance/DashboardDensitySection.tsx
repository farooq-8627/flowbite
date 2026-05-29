"use client";

/**
 * core/platform/settings/components/groups/appearance/DashboardDensitySection.tsx
 *
 * Settings → Appearance → Dashboard density — per-user control for how
 * many rows the dashboard's Recent activity + Recent messages widgets
 * preview at a glance.
 *
 * Migrated out of the hardcoded `DASHBOARD_RECENT_ACTIVITY_LIMIT` /
 * `DASHBOARD_RECENT_MESSAGES_LIMIT` constants in
 * `core/shell/shell/views/dashboard/DashboardHomeView.tsx` (2026-05-30).
 * Bounds + clamp + default come from the SSOT
 * `convex/_shared/dashboardDensity.ts` so the slider can never be in a
 * different range than what the server clamp accepts.
 *
 * Persists via `users.mutations:updatePreferences` —
 * `dashboardActivityRowLimit` is the patched key. The same slot is
 * read by `<DashboardHomeView>` through `resolveActivityRowLimit`.
 *
 * RTL: uses logical `me-` for the value badge spacing. The slider is
 * direction-agnostic.
 */

import { useMutation } from "convex/react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { api } from "@/convex/_generated/api";
import {
	DASHBOARD_ACTIVITY_ROW_LIMIT_DEFAULT,
	DASHBOARD_ACTIVITY_ROW_LIMIT_MAX,
	DASHBOARD_ACTIVITY_ROW_LIMIT_MIN,
	resolveActivityRowLimit,
} from "@/convex/_shared/dashboardDensity";
import { normalizeErrorDescription } from "@/lib/normalizeError";

interface DashboardDensitySectionProps {
	currentLimit: number | undefined;
}

export function DashboardDensitySection({ currentLimit }: DashboardDensitySectionProps) {
	const updatePreferences = useMutation(api.users.mutations.updatePreferences);
	const resolved = resolveActivityRowLimit(currentLimit);

	// Local optimistic value so the slider feels snappy. The number badge +
	// helper line read off this; only `Save` persists.
	const [value, setValue] = useState<number>(resolved);
	const [saving, setSaving] = useState(false);

	// Sync external changes (e.g. the user opened settings on another tab
	// or the AI bumped the slot via a future tool — there isn't one today
	// but the listener is cheap insurance).
	useEffect(() => {
		setValue(resolveActivityRowLimit(currentLimit));
	}, [currentLimit]);

	const isDirty = value !== resolved;
	const handleReset = () => setValue(DASHBOARD_ACTIVITY_ROW_LIMIT_DEFAULT);

	const handleSave = async () => {
		setSaving(true);
		try {
			await updatePreferences({ dashboardActivityRowLimit: value });
			toast.success("Dashboard density saved", {
				description: `Recent activity and messages will now show ${value} ${value === 1 ? "row" : "rows"}.`,
			});
		} catch (err) {
			toast.error("Failed to save", {
				description: normalizeErrorDescription(err),
			});
		} finally {
			setSaving(false);
		}
	};

	return (
		<div className="flex flex-col gap-3">
			<div className="flex items-center gap-3">
				<Slider
					min={DASHBOARD_ACTIVITY_ROW_LIMIT_MIN}
					max={DASHBOARD_ACTIVITY_ROW_LIMIT_MAX}
					step={1}
					value={[value]}
					onValueChange={(next) => {
						const n = next[0];
						if (typeof n === "number") setValue(n);
					}}
					aria-label="Dashboard preview rows"
					className="w-full"
				/>
				<span
					className="me-1 inline-flex h-7 min-w-[2.5rem] items-center justify-center rounded-[var(--radius)] border border-border bg-muted px-2 text-xs font-medium tabular-nums text-foreground"
					aria-live="polite"
				>
					{value}
				</span>
			</div>
			<p className="text-xs text-muted-foreground">
				Applies to <span className="font-medium text-foreground">Recent activity</span> and{" "}
				<span className="font-medium text-foreground">Recent messages</span> on your
				dashboard. Range {DASHBOARD_ACTIVITY_ROW_LIMIT_MIN}–
				{DASHBOARD_ACTIVITY_ROW_LIMIT_MAX} rows; default{" "}
				{DASHBOARD_ACTIVITY_ROW_LIMIT_DEFAULT}.
			</p>
			<div className="flex items-center justify-end gap-2">
				<Button
					type="button"
					size="sm"
					variant="ghost"
					className="h-7 text-xs"
					onClick={handleReset}
					disabled={saving || value === DASHBOARD_ACTIVITY_ROW_LIMIT_DEFAULT}
				>
					Reset to default
				</Button>
				<Button
					type="button"
					size="sm"
					className="h-7 text-xs"
					onClick={handleSave}
					disabled={saving || !isDirty}
				>
					{saving ? "Saving…" : "Save"}
				</Button>
			</div>
		</div>
	);
}

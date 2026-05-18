"use client";

/**
 * ReminderEmptyState — empty placard rendered when no reminders match.
 *
 * STATUS: IMPLEMENTED.
 *
 * Wraps the shared `EmptyState` from `core/shell/shared/entity-layout/`
 * with a reminder-themed icon + a CTA button that opens the create
 * drawer.
 *
 * Two configurations:
 *   - `variant="org"` — used inside `RemindersView` when the org has no
 *     reminders at all. Encourages creating the very first reminder.
 *   - `variant="filtered"` — used when search/filter returned 0 rows;
 *     the message tells the user to clear filters rather than create
 *     more data.
 *   - `variant="panel"` — used inside the entity profile panel where
 *     the layout is much smaller. Shows just the icon + a 1-line
 *     prompt.
 */

import { BellIcon, BellPlusIcon, FilterXIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/core/shell/shared/entity-layout";

interface ReminderEmptyStateProps {
	variant?: "org" | "filtered" | "panel";
	onCreate?: () => void;
	onResetFilters?: () => void;
	className?: string;
}

export function ReminderEmptyState({
	variant = "org",
	onCreate,
	onResetFilters,
	className,
}: ReminderEmptyStateProps) {
	if (variant === "panel") {
		return (
			<div className="flex flex-col items-center gap-2 rounded-[var(--radius)] border border-dashed bg-muted/30 px-4 py-8 text-center">
				<BellIcon className="size-5 text-muted-foreground" aria-hidden />
				<p className="text-xs text-muted-foreground">No reminders for this profile.</p>
				{onCreate && (
					<Button size="sm" variant="outline" onClick={onCreate} className="h-7 text-xs">
						<BellPlusIcon className="me-1.5 size-3.5" />
						Add reminder
					</Button>
				)}
			</div>
		);
	}

	if (variant === "filtered") {
		return (
			<EmptyState
				className={className}
				icon={<FilterXIcon className="size-5" aria-hidden />}
				title="No reminders match"
				description="Try clearing your filters or searching for something else."
				action={
					onResetFilters ? (
						<Button size="sm" variant="outline" onClick={onResetFilters}>
							<FilterXIcon className="me-2 size-3.5" />
							Clear filters
						</Button>
					) : null
				}
			/>
		);
	}

	return (
		<EmptyState
			className={className}
			icon={<BellIcon className="size-5" aria-hidden />}
			title="No reminders yet"
			description="Set follow-ups so you never miss a deal. Reminders attach to people, deals, and companies — and surface across your dashboard, profiles, and calendar."
			action={
				onCreate ? (
					<Button onClick={onCreate}>
						<BellPlusIcon className="me-2 size-4" />
						Create your first reminder
					</Button>
				) : null
			}
		/>
	);
}

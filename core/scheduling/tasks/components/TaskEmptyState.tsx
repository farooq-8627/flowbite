"use client";

/**
 * TaskEmptyState — empty placard rendered when no tasks match.
 *
 * Wraps the shared `EmptyState` from `core/shell/shared/entity-layout/`
 * with a task-themed icon + a CTA button that opens the create drawer.
 *
 * Three configurations:
 *   - `variant="org"` — used inside `TasksView` when the org has no
 *     tasks at all. Encourages creating the very first task.
 *   - `variant="filtered"` — used when search/filter returned 0 rows;
 *     the message tells the user to clear filters rather than create.
 *   - `variant="panel"` — used inside the entity profile panel where
 *     the layout is much smaller. Shows just the icon + a 1-line prompt.
 */

import { CalendarPlusIcon, CheckCircle2Icon, FilterXIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/core/shell/shared/entity-layout";

interface TaskEmptyStateProps {
	variant?: "org" | "filtered" | "panel";
	onCreate?: () => void;
	onResetFilters?: () => void;
	className?: string;
}

export function TaskEmptyState({
	variant = "org",
	onCreate,
	onResetFilters,
	className,
}: TaskEmptyStateProps) {
	if (variant === "panel") {
		return (
			<div className="flex flex-col items-center gap-2 rounded-[var(--radius)] border border-dashed bg-muted/30 px-4 py-8 text-center">
				<CheckCircle2Icon className="size-5 text-muted-foreground" aria-hidden />
				<p className="text-xs text-muted-foreground">No tasks for this profile.</p>
				{onCreate && (
					<Button size="sm" variant="outline" onClick={onCreate} className="h-7 text-xs">
						<CalendarPlusIcon className="me-1.5 size-3.5" />
						Add task
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
				title="No tasks match"
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
			icon={<CheckCircle2Icon className="size-5" aria-hidden />}
			title="No tasks yet"
			description="Track your work — calls, emails, meetings, follow-ups, and to-dos all in one place. Tasks attach to people, deals, and companies, and surface across your dashboard, profiles, and calendar."
			action={
				onCreate ? (
					<Button onClick={onCreate}>
						<CalendarPlusIcon className="me-2 size-4" />
						Create your first task
					</Button>
				) : null
			}
		/>
	);
}

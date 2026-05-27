"use client";

/**
 * core/ai/components/results/TaskResultCard.tsx
 *
 * Compact task preview rendered inline in chat when a tool result emits
 * `display: { kind: "task", taskId }`. Uses the org-wide
 * tasks.getById query for live state.
 *
 * Replaces ReminderResultCard per TASKS-RENAME-PLAN.md (Stage 4B).
 */

import { useQuery } from "convex/react";
import {
	BellIcon,
	CalendarClockIcon,
	CalendarIcon,
	CheckCircle2Icon,
	MailIcon,
	PhoneIcon,
	Trash2Icon,
	UsersIcon,
} from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { cn } from "@/lib/utils";

type TaskResultCardProps = { taskId: string; orgId: string };

const ICON_BY_TYPE: Record<string, typeof BellIcon> = {
	todo: BellIcon,
	call: PhoneIcon,
	email: MailIcon,
	meeting: UsersIcon,
	followup: CalendarClockIcon,
};

export function TaskResultCard({ taskId, orgId }: TaskResultCardProps) {
	const task = useQuery(
		api.crm.shared.tasks.queries.getById,
		taskId && orgId ? { taskId: taskId as Id<"tasks">, orgId: orgId as Id<"orgs"> } : "skip",
	);

	const params = useParams();
	const orgSlug = params?.orgSlug as string | undefined;
	const locale = params?.locale as string | undefined;

	if (task === undefined) {
		return <Skeleton className="h-14 w-full rounded-[var(--radius)]" />;
	}
	if (task === null) {
		return (
			<div
				className={cn(
					"flex items-center gap-2 rounded-[var(--radius)] border border-dashed",
					"bg-muted/30 px-3 py-2 text-xs text-muted-foreground",
				)}
			>
				<Trash2Icon className="size-3.5" />
				<span>Task no longer exists.</span>
			</div>
		);
	}

	const isComplete = task.completedAt !== undefined;
	const isOverdue = !isComplete && task.dueAt < Date.now();
	const href = buildTaskHref({ orgSlug, locale });

	const TypeIcon = ICON_BY_TYPE[task.type] ?? BellIcon;
	const Icon = isComplete ? CheckCircle2Icon : isOverdue ? TypeIcon : CalendarIcon;
	const tone = isComplete
		? "text-muted-foreground"
		: isOverdue
			? "text-destructive"
			: "text-primary";

	const card = (
		<div
			className={cn(
				"flex items-start gap-2 rounded-[var(--radius)] border bg-card px-3 py-2 text-xs shadow-xs",
				"transition-shadow hover:border-ring/40 hover:shadow-sm cursor-pointer",
			)}
		>
			<Icon className={cn("mt-0.5 size-3.5 shrink-0", tone)} />
			<div className="flex min-w-0 flex-col gap-0.5">
				<div className={cn("font-medium", isComplete && "line-through opacity-70")}>
					{task.title}
				</div>
				<div className="text-[11px] text-muted-foreground">
					{isComplete
						? `Completed ${formatRelativeTime(task.completedAt as number)}`
						: isOverdue
							? `Overdue · was due ${formatRelativeTime(task.dueAt)}`
							: `Due ${formatRelativeTime(task.dueAt)}`}
					<span className="ms-2 font-mono">{task.taskCode}</span>
				</div>
			</div>
		</div>
	);

	if (href) {
		return (
			<Link
				href={href}
				className="block rounded-[var(--radius)] no-underline outline-none focus-visible:ring-1 focus-visible:ring-ring hover:no-underline"
				title="Open in CRM"
				style={{ textDecoration: "none" }}
			>
				{card}
			</Link>
		);
	}
	return card;
}

function formatRelativeTime(ts: number): string {
	const diff = ts - Date.now();
	const abs = Math.abs(diff);
	const min = Math.floor(abs / 60_000);
	const dir = diff >= 0 ? "in " : "";
	const tail = diff >= 0 ? "" : " ago";
	if (min < 1) return diff >= 0 ? "soon" : "just now";
	if (min < 60) return `${dir}${min}m${tail}`;
	const hr = Math.floor(min / 60);
	if (hr < 24) return `${dir}${hr}h${tail}`;
	const day = Math.floor(hr / 24);
	if (day < 30) return `${dir}${day}d${tail}`;
	return new Date(ts).toLocaleDateString();
}

function buildTaskHref(args: { orgSlug?: string; locale?: string }): string | null {
	if (!args.orgSlug) return null;
	const prefix = args.locale ? `/${args.locale}/${args.orgSlug}` : `/${args.orgSlug}`;
	return `${prefix}/tasks`;
}

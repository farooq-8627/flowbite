"use client";

/**
 * TimelineCardEntry — content-bearing entry (note / reminder).
 *
 * Visual contract (same header pattern as TimelineBareEntry, with a
 * framed body card immediately below the title row):
 *   ┌──────────────────────────────────────────────────────────────────┐
 *   │ ⏰  Reminder set                          5m ago · by Umar        │
 *   │      ┌────────────────────────────────────────────────────────┐  │
 *   │      │ Follow up with Acme on Q3 expansion                    │  │
 *   │      │ Due Mon, May 27 · FU-007 · P-001 · D-002               │  │
 *   │      └────────────────────────────────────────────────────────┘  │
 *   └──────────────────────────────────────────────────────────────────┘
 *
 * Same action node + trailing meta as the bare entry (so the user reads
 * "what happened" first), but with a framed body card carrying the
 * note / reminder content. The body is intentionally a sub-card with
 * its own border + softer background — visually distinct from the
 * bare-line activity entries so the user knows they're looking at
 * agent content, not an audit log.
 */

import { format } from "date-fns";
import { CheckCircle2, Clock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { IdentityBadge } from "@/core/entities/shared/components/IdentityBadge";
import { useOrgMemberMap } from "@/core/shell/shared/hooks/useCurrentOrg";
import { cn } from "@/lib/utils";
import { resolveActionTheme } from "./action-theme";
import { ActionNode, TrailingMeta } from "./TimelineBareEntry";
import type { TimelineNoteEntry, TimelineReminderEntry } from "./types";

interface TimelineCardEntryProps {
	entry: TimelineNoteEntry | TimelineReminderEntry;
	isLast?: boolean;
	gapPx?: number;
}

export function TimelineCardEntry({ entry, isLast, gapPx }: TimelineCardEntryProps) {
	const memberMap = useOrgMemberMap();
	const authorId =
		entry._entryType === "note" ? entry.authorId : (entry as TimelineReminderEntry).assignedTo;
	const member = memberMap.get(String(authorId));
	const actorName = member?.user?.name ?? member?.user?.email ?? "Someone";
	const avatarUrl = member?.user?.avatarUrl;

	// Synthesise an action so the theme resolver works uniformly.
	const synthesisedAction = entry._entryType === "note" ? "note_created" : "reminder_created";

	const theme = resolveActionTheme({
		entityType: entry._entryType,
		action: synthesisedAction,
	});

	return (
		<div className="relative flex items-start gap-3">
			<ActionNode theme={theme} isLast={isLast} gapPx={gapPx} />

			<div className="flex min-w-0 flex-1 flex-col gap-1.5 pt-1">
				{/* Title row — same pattern as bare entry */}
				<div className="flex items-baseline justify-between gap-3">
					<div className="text-sm font-semibold text-foreground">{theme.titleVerb}</div>
					<TrailingMeta
						time={entry.createdAt}
						actorName={actorName}
						actorAvatarUrl={avatarUrl}
					/>
				</div>

				{/* Body card — content frame */}
				<div className="rounded-[var(--radius)] border bg-muted/30 px-3 py-2.5 text-sm">
					{entry._entryType === "note" ? (
						<NoteBody entry={entry} />
					) : (
						<ReminderBody entry={entry} />
					)}
				</div>
			</div>
		</div>
	);
}

// ─── Note body ───────────────────────────────────────────────────────────────

function NoteBody({ entry }: { entry: TimelineNoteEntry }) {
	return (
		<div className="flex min-w-0 flex-col gap-1.5">
			{entry.title && (
				<div className="text-sm font-medium text-foreground">{entry.title}</div>
			)}
			<div className="whitespace-pre-wrap text-foreground/90">{entry.content}</div>

			{/* Meta — internal flag + person/entity context */}
			<NoteMeta entry={entry} />
		</div>
	);
}

function NoteMeta({ entry }: { entry: TimelineNoteEntry }) {
	const hasMeta = entry.isInternal || entry.personCode;
	if (!hasMeta) return null;

	return (
		<div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
			{entry.isInternal && (
				<Badge
					variant="outline"
					className="h-4 rounded-[calc(var(--radius)-2px)] border-amber-300 bg-amber-50 px-1.5 text-[9px] font-normal text-amber-700"
				>
					Internal
				</Badge>
			)}
			{entry.personCode && (
				<>
					{entry.isInternal && <span aria-hidden>·</span>}
					<IdentityBadge
						entityType="person"
						code={entry.personCode}
						layout="code"
						size="xs"
					/>
				</>
			)}
		</div>
	);
}

// ─── Reminder body ───────────────────────────────────────────────────────────

function ReminderBody({ entry }: { entry: TimelineReminderEntry }) {
	const isCompleted = entry.status === "completed";
	const isFollowup = entry.type === "followup";
	const dueDate = new Date(entry.dueAt);

	return (
		<div className="flex min-w-0 flex-col gap-1.5">
			<div className="flex items-start gap-2">
				{isCompleted ? (
					<CheckCircle2
						className="mt-0.5 size-4 shrink-0 text-emerald-600"
						aria-label="Completed"
					/>
				) : (
					<Clock className="mt-0.5 size-4 shrink-0 text-amber-600" aria-label="Pending" />
				)}
				<div className="min-w-0 flex-1">
					<div
						className={cn(
							"font-medium text-foreground",
							isCompleted && "text-muted-foreground line-through",
						)}
					>
						{entry.title}
					</div>
					{entry.note && <div className="mt-0.5 text-foreground/80">{entry.note}</div>}
				</div>
			</div>

			{/* Meta row: due · code · person · deal · follow-up flag */}
			<div className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
				<span title={format(dueDate, "PPP p")} className="tabular-nums">
					{isCompleted ? "Was due " : "Due "}
					{format(dueDate, "MMM d, h:mm a")}
				</span>
				{isFollowup && (
					<>
						<span aria-hidden>·</span>
						<Badge
							variant="outline"
							className="h-4 rounded-[calc(var(--radius)-2px)] border-orange-300 bg-orange-50 px-1.5 text-[9px] font-normal text-orange-700"
						>
							Follow-up
						</Badge>
					</>
				)}
				{entry.taskCode && (
					<>
						<span aria-hidden>·</span>
						<span className="font-mono">{entry.taskCode}</span>
					</>
				)}
				{entry.personCode && (
					<>
						<span aria-hidden>·</span>
						<IdentityBadge
							entityType="person"
							code={entry.personCode}
							layout="code"
							size="xs"
						/>
					</>
				)}
				{entry.dealCode && (
					<>
						<span aria-hidden>·</span>
						<IdentityBadge
							entityType="deal"
							code={entry.dealCode}
							layout="code"
							size="xs"
						/>
					</>
				)}
			</div>
		</div>
	);
}

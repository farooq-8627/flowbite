"use client";

/**
 * core/ai/components/results/NoteResultCard.tsx
 *
 * Compact note preview rendered inline in chat when a tool result emits
 * `display: { kind: "note", noteId }`. Uses the org-wide notes.getById
 * query to fetch live state. The full NoteCard from `core/comms/notes/`
 * is deliberately NOT reused here because it expects a full
 * board-context (drag handle, reorder, attachments, category editor)
 * that doesn't make sense in a chat bubble.
 *
 * What this card shows:
 *   - Author + timestamp header
 *   - Title (when present)
 *   - First ~3 lines of content (clamped)
 *   - "Pinned" + category badges when relevant
 *   - Click anywhere → navigates to the parent entity's notes tab
 */

import { useQuery } from "convex/react";
import { PinIcon, StickyNoteIcon, Trash2Icon } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useEntityLabels } from "@/core/shell/shared/hooks/useEntityLabels";
import { cn } from "@/lib/utils";

type NoteResultCardProps = { noteId: string; orgId: string };

export function NoteResultCard({ noteId, orgId }: NoteResultCardProps) {
	const note = useQuery(
		api.crm.shared.notes.queries.getById,
		noteId && orgId ? { noteId: noteId as Id<"notes">, orgId: orgId as Id<"orgs"> } : "skip",
	);

	const params = useParams();
	const orgSlug = params?.orgSlug as string | undefined;
	const locale = params?.locale as string | undefined;
	const labels = useEntityLabels();

	if (note === undefined) {
		return <Skeleton className="h-16 w-full rounded-[var(--radius)]" />;
	}
	if (note === null) {
		return (
			<div
				className={cn(
					"flex items-center gap-2 rounded-[var(--radius)] border border-dashed",
					"bg-muted/30 px-3 py-2 text-xs text-muted-foreground",
				)}
			>
				<Trash2Icon className="size-3.5" />
				<span>Note no longer exists.</span>
			</div>
		);
	}

	const href = buildNoteHref({
		entityType: note.entityType,
		entityId: note.entityId,
		personCode: note.personCode,
		orgSlug,
		locale,
		labels,
	});

	const card = (
		<div
			className={cn(
				"flex flex-col gap-1.5 rounded-[var(--radius)] border bg-card px-3 py-2 text-xs shadow-xs",
				"transition-shadow hover:border-ring/40 hover:shadow-sm cursor-pointer",
			)}
		>
			{/* Header — author + timestamp + pin badge */}
			<div className="flex items-center gap-2 text-[11px] text-muted-foreground">
				<StickyNoteIcon className="size-3" />
				<span>{formatRelativeTime(note.createdAt)}</span>
				{note.isPinned && (
					<span className="ms-auto inline-flex items-center gap-1 text-primary">
						<PinIcon className="size-3" />
						<span>Pinned</span>
					</span>
				)}
			</div>

			{/* Title */}
			{note.title && <div className="font-medium">{note.title}</div>}

			{/* Content */}
			<p className="line-clamp-3 leading-snug text-foreground/90">{note.content}</p>
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

// Helpers

function formatRelativeTime(ts: number): string {
	const diff = Date.now() - ts;
	const min = Math.floor(diff / 60_000);
	if (min < 1) return "just now";
	if (min < 60) return `${min}m ago`;
	const hr = Math.floor(min / 60);
	if (hr < 24) return `${hr}h ago`;
	const day = Math.floor(hr / 24);
	if (day < 30) return `${day}d ago`;
	return new Date(ts).toLocaleDateString();
}

type LabelsLike = ReturnType<typeof useEntityLabels>;

function buildNoteHref(args: {
	entityType: string;
	entityId: string;
	personCode?: string;
	orgSlug?: string;
	locale?: string;
	labels: LabelsLike;
}): string | null {
	const { entityType, personCode, orgSlug, locale } = args;
	if (!orgSlug) return null;
	const prefix = locale ? `/${locale}/${orgSlug}` : `/${orgSlug}`;
	if (personCode && (entityType === "lead" || entityType === "contact")) {
		return `${prefix}/profile/${personCode}?group=notes`;
	}
	return null;
}

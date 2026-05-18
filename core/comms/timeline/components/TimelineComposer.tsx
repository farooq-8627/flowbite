"use client";

/**
 * TimelineComposer — bottom-of-feed note composer.
 *
 * Visual:
 *   ┌─────────────────────────────────────────────┐
 *   │ Write your comment...                       │
 *   │                                             │
 *   │                            [📎]  [Comment]  │
 *   └─────────────────────────────────────────────┘
 *
 * Submits a note via `useCreateNote`. The note inherits the timeline
 * scope's entity binding, so a comment on a person's timeline is
 * automatically attached to that person.
 *
 * For the org-wide timeline (no specific entity), the composer is
 * **hidden** because there's no canonical entity to attach the note to.
 * The parent feed decides whether to render it.
 *
 * Why this is a thin wrapper over `useCreateNote`
 *   - Notes are the canonical "agent-written annotation" primitive in
 *     this app. Every comment-on-timeline IS a note.
 *   - We don't add a separate `comments` table — that would split notes
 *     across two surfaces with the same lifecycle.
 *
 * Phase B notes
 *   - Attachments are stubbed (icon disabled). The notes module already
 *     supports attached files; wiring it here is a follow-up because it
 *     needs the file-upload buffer pattern.
 *   - "Mark internal" toggle is also a follow-up — for now every comment
 *     posted from the timeline is non-internal.
 */

import { PaperclipIcon, SendHorizonalIcon } from "lucide-react";
import { useCallback, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { Id } from "@/convex/_generated/dataModel";
import { useCreateNote } from "@/core/comms/notes/hooks";
import { useCurrentOrg, useOrgPermissions } from "@/core/shell/shared/hooks/useCurrentOrg";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";

interface TimelineComposerProps {
	/** Entity to attach the note to. Required — composer is hidden when absent. */
	entityType: string;
	entityId: string;
	/** Optional personCode — set on `notes.personCode` for cross-entity threading. */
	personCode?: string;
	className?: string;
}

export function TimelineComposer({
	entityType,
	entityId,
	personCode,
	className,
}: TimelineComposerProps) {
	const { orgId } = useCurrentOrg();
	const permissions = useOrgPermissions();
	const canCreate = permissions.includes("notes.create");

	const createNote = useCreateNote();
	const [content, setContent] = useState("");
	const [submitting, setSubmitting] = useState(false);

	const submit = useCallback(async () => {
		const trimmed = content.trim();
		if (!trimmed || !orgId) return;
		setSubmitting(true);
		try {
			await createNote({
				orgId: orgId as Id<"orgs">,
				entityType,
				entityId,
				personCode,
				content: trimmed,
				authorType: "user",
				isInternal: false,
			});
			setContent("");
			toast.success("Comment added");
		} catch (err) {
			toast.mutationError(err, "Couldn't post comment");
		} finally {
			setSubmitting(false);
		}
	}, [content, orgId, entityType, entityId, personCode, createNote]);

	if (!canCreate) return null;

	return (
		<div
			className={cn(
				"flex flex-col gap-2 rounded-[var(--radius)] border bg-card p-3",
				className,
			)}
		>
			<Textarea
				value={content}
				onChange={(e) => setContent(e.target.value)}
				onKeyDown={(e) => {
					// ⌘/Ctrl-Enter submits — same convention as Slack / Linear.
					if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
						e.preventDefault();
						void submit();
					}
				}}
				placeholder="Write your comment…"
				rows={3}
				className="min-h-[68px] resize-none border-0 bg-transparent p-0 text-sm shadow-none focus-visible:ring-0"
				aria-label="Write a comment"
			/>
			<div className="flex items-center justify-end gap-2">
				<Button
					type="button"
					variant="ghost"
					size="icon"
					disabled
					className="size-8"
					aria-label="Attach file (coming soon)"
					title="Attachments — coming soon"
				>
					<PaperclipIcon className="size-4" />
				</Button>
				<Button
					type="button"
					size="sm"
					onClick={() => void submit()}
					disabled={!content.trim() || submitting}
					className="h-8 gap-1.5 px-3 text-xs"
				>
					<SendHorizonalIcon className="size-3.5" />
					{submitting ? "Posting…" : "Comment"}
				</Button>
			</div>
		</div>
	);
}

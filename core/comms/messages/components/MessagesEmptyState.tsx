"use client";

/**
 * MessagesEmptyState — shown on the org-wide page before a conversation is
 * selected. Embedded panels (profile/deal/company tab) use a different empty
 * state passed via `<MessagesThread emptyState=…>` because their context is
 * always entity-scoped.
 */
import { MessageSquare } from "lucide-react";

export function MessagesEmptyState() {
	return (
		<div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
			<div className="flex size-12 items-center justify-center rounded-full bg-muted">
				<MessageSquare className="size-6 text-muted-foreground" aria-hidden="true" />
			</div>
			<div className="flex flex-col gap-1">
				<p className="text-sm font-medium text-foreground">Pick a conversation</p>
				<p className="text-xs text-muted-foreground">
					Choose a thread from the list to read or reply.
				</p>
			</div>
		</div>
	);
}

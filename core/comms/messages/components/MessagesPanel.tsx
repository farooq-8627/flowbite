"use client";

/**
 * MessagesPanel — embedded chat thread for profile/deal/company tabs.
 *
 * Per IMPLEMENTATION.md §4 ("build once, use everywhere"), this is a thin
 * wrapper around `MessagesThread` that supplies the `(orgId, entityType,
 * entityId)` triple the thread needs to auto-resolve the conversation.
 *
 * Usage:
 *   • Profile (Messages tab):  <MessagesPanel entityType="person"  entityId={personCode} />
 *   • Deal detail page:        <MessagesPanel entityType="deal"    entityId={dealCode} />
 *   • Company detail page:     <MessagesPanel entityType="company" entityId={companyCode} />
 *
 * If no conversation exists yet, `MessagesThread` shows the empty state +
 * composer; the first send auto-creates the conversation server-side.
 *
 * No sidebar by design — embedded panels show ONE thread per entity. Users
 * looking for the org-wide multi-conversation inbox open `/{orgSlug}/messages`.
 */
import type { Id } from "@/convex/_generated/dataModel";
import type { ChatEntityType } from "@/core/comms/messages/hooks";
import { useCurrentOrg } from "@/core/shell/shared/hooks/useCurrentOrg";
import { cn } from "@/lib/utils";
import { MessagesThread } from "./MessagesThread";

type Props = {
	entityType: ChatEntityType;
	entityId: string;
	threadId?: string;
	emptyState?: string;
	className?: string;
};

export function MessagesPanel({ entityType, entityId, threadId, emptyState, className }: Props) {
	const { orgId, isLoading } = useCurrentOrg();

	if (isLoading || !orgId) {
		return (
			<div className={cn("flex h-72 items-center justify-center", className)}>
				<p className="text-sm text-muted-foreground">Loading workspace…</p>
			</div>
		);
	}

	return (
		<div
			className={cn(
				"flex h-[28rem] min-h-0 w-full flex-col overflow-hidden rounded-[var(--radius)] border border-border",
				className,
			)}
		>
			<MessagesThread
				orgId={orgId as Id<"orgs">}
				entityType={entityType}
				entityId={entityId}
				threadId={threadId}
				emptyState={emptyState}
			/>
		</div>
	);
}

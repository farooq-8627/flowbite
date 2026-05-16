"use client";

/**
 * MessagesThread — composes the active thread (header + list + input).
 *
 * Per IMPLEMENTATION.md §4 ("the canonical 'build once, use everywhere'
 * pattern"), this component takes EITHER:
 *   - `conversationId` (org-wide inbox after the user picks one), OR
 *   - `entityType + entityId (+ threadId?)` (embedded panel — auto-resolves
 *     and auto-creates the conversation on first send).
 *
 * Reply state lives here (lifted out of MessageBubble) so it survives
 * scrolling and the reply-target chip can render in the composer.
 *
 * Authors are resolved via `api.orgs.queries.listMembers` (one query per
 * org, cached). For messages from people who left the org we fall back to
 * "Unknown" — see MessageBubble.
 *
 * 2026-05-17 (batch 5): switched to cursor-based pagination. Once the
 * conversation is known (either passed in or resolved from entity coords),
 * we use `useMessagesForConversationPaginated`. The list receives `loadMore`
 * + status flags and lazy-loads older messages as the user scrolls up.
 */
import { useQuery } from "convex/react";
import { useEffect, useMemo, useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import {
	type ChatEntityType,
	useConversationForEntity,
	useConversationParticipants,
	useMarkConversationRead,
	useMessagesForConversationPaginated,
} from "@/core/comms/messages/hooks";
import { cn } from "@/lib/utils";
import { MessageInput } from "./MessageInput";
import { MessageList } from "./MessageList";
import { ThreadHeader } from "./ThreadHeader";

type MessagesThreadByConversationProps = {
	orgId: Id<"orgs">;
	conversationId: Id<"conversations">;
	entityType?: never;
	entityId?: never;
	threadId?: never;
	emptyState?: string;
	/** Mobile-only: when supplied, ThreadHeader shows a hamburger that opens the sidebar Sheet. */
	onOpenSidebar?: () => void;
	className?: string;
};

type MessagesThreadByEntityProps = {
	orgId: Id<"orgs">;
	conversationId?: never;
	entityType: ChatEntityType;
	entityId: string;
	threadId?: string;
	emptyState?: string;
	onOpenSidebar?: () => void;
	className?: string;
};

export type MessagesThreadProps = MessagesThreadByConversationProps | MessagesThreadByEntityProps;

export function MessagesThread(props: MessagesThreadProps) {
	const { orgId, className } = props;

	// Step 1 — resolve the conversation. Either it's passed in directly
	// (org-wide inbox case) or we look it up from the entity coords (embedded
	// panel case). The entity-path query returns `null` until the user sends
	// the first message; in that case the conversation is auto-created
	// server-side on first `messages.send`.
	const byEntity = useConversationForEntity({
		orgId,
		entityType: "entityType" in props && props.entityType ? props.entityType : "person",
		entityId: "entityId" in props && props.entityId ? props.entityId : "",
		threadId: "threadId" in props ? props.threadId : undefined,
		// We only need the conversation lookup; the messages live in the
		// paginated hook below. Cap the embedded query at 1 row.
		limit: 1,
	});
	const convoForId = useQuery(
		api.crm.shared.conversations.queries.getById,
		"conversationId" in props && props.conversationId
			? { orgId, conversationId: props.conversationId }
			: "skip",
	);

	const conversation: Doc<"conversations"> | null =
		"conversationId" in props && props.conversationId
			? (convoForId?.conversation ?? null)
			: (byEntity?.conversation ?? null);

	// Step 2 — paginated thread feed. Skipped while conversation is null.
	const paginated = useMessagesForConversationPaginated({
		orgId,
		conversationId: conversation?._id,
		initialNumItems: 30,
	});
	// `usePaginatedQuery` returns an empty array while skipped or loading;
	// distinguish that from "loaded with zero messages" via `status`.
	const messages: Doc<"messages">[] | undefined =
		conversation && paginated.status !== "LoadingFirstPage"
			? (paginated.results as Doc<"messages">[])
			: conversation
				? undefined
				: [];

	const canLoadOlder = paginated.status === "CanLoadMore" || paginated.status === "LoadingMore";
	const isLoadingOlder = paginated.status === "LoadingMore";
	const loadOlder = useMemo(() => {
		return () => paginated.loadMore(30);
	}, [paginated]);

	const members = useQuery(api.orgs.queries.listMembers, { orgId });
	const me = useQuery(api.users.queries.me);
	const myMembership = useQuery(api.orgs.queries.getMyMembership, me ? { orgId } : "skip");

	const authorsById = useMemo(() => {
		const map = new Map<string, { name: string; avatarUrl?: string }>();
		for (const m of members ?? []) {
			map.set(String(m.user._id), {
				name: m.user.name ?? m.user.email ?? "Member",
				avatarUrl: m.user.avatarUrl,
			});
		}
		return map;
	}, [members]);

	const canDeleteAny = useMemo(
		() => Boolean(myMembership?.permissions?.includes("messages.deleteAny")),
		[myMembership],
	);

	// 2-participant conversations are direct messages — bubbles hide names.
	const participants = useConversationParticipants({
		orgId,
		conversationId: conversation?._id,
	});
	const isDirect = useMemo(
		() => (participants ? participants.length === 2 : false),
		[participants],
	);

	const [replyTo, setReplyTo] = useState<Doc<"messages"> | null>(null);
	// Clear reply target when the conversation switches. Listing the id as a
	// dep is INTENTIONAL even though the body doesn't read it — biome is
	// over-eager here.
	const conversationKey = conversation?._id;
	// biome-ignore lint/correctness/useExhaustiveDependencies: dep is the trigger, not a read
	useEffect(() => {
		setReplyTo(null);
	}, [conversationKey]);

	// Mark-read.
	const markRead = useMarkConversationRead();
	// `paginated.results` is newest-first; the first element is the latest message.
	const lastMessageId = (paginated.results as Doc<"messages">[] | undefined)?.[0]?._id;
	// biome-ignore lint/correctness/useExhaustiveDependencies: see MessageList for rationale
	useEffect(() => {
		if (!conversation) return;
		void markRead({ orgId, conversationId: conversation._id }).catch(() => {});
	}, [conversation, lastMessageId, markRead, orgId]);

	// No conversation yet, but we have entity coords → composer that auto-creates.
	if (!conversation && "entityType" in props && props.entityType && props.entityId) {
		return (
			<div className={cn("flex h-full flex-1 flex-col bg-background", className)}>
				<header className="flex h-14 shrink-0 items-center border-b border-border px-4">
					<h2 className="truncate text-sm font-semibold text-foreground">
						New conversation
					</h2>
				</header>
				<div className="flex flex-1 items-center justify-center p-6">
					<p className="text-center text-sm text-muted-foreground">
						{props.emptyState ??
							"No messages yet. Send the first one to start the conversation."}
					</p>
				</div>
				<MessageInput
					orgId={orgId}
					entityType={props.entityType}
					entityId={props.entityId}
					threadId={props.threadId}
					replyTo={replyTo}
					onClearReply={() => setReplyTo(null)}
				/>
			</div>
		);
	}

	if (!conversation) {
		return (
			<div className={cn("flex h-full flex-1 flex-col bg-background", className)}>
				<header className="flex h-14 shrink-0 items-center border-b border-border px-4">
					<span className="text-sm text-muted-foreground">Loading…</span>
				</header>
			</div>
		);
	}

	const inputProps =
		"conversationId" in props && props.conversationId
			? {
					orgId,
					conversationId: props.conversationId,
					replyTo,
					onClearReply: () => setReplyTo(null),
				}
			: {
					orgId,
					entityType: (props as MessagesThreadByEntityProps).entityType,
					entityId: (props as MessagesThreadByEntityProps).entityId,
					threadId: (props as MessagesThreadByEntityProps).threadId,
					replyTo,
					onClearReply: () => setReplyTo(null),
				};

	return (
		<div className={cn("flex h-full flex-1 flex-col bg-background", className)}>
			<ThreadHeader
				orgId={orgId}
				conversation={conversation}
				onOpenSidebar={props.onOpenSidebar}
			/>
			<MessageList
				messages={messages}
				authorsById={authorsById}
				currentUserId={me?._id}
				canDeleteAny={canDeleteAny}
				isDirect={isDirect}
				onReply={(m) => setReplyTo(m)}
				loadOlder={loadOlder}
				canLoadOlder={canLoadOlder}
				isLoadingOlder={isLoadingOlder}
				className="min-h-0 flex-1"
			/>
			<MessageInput {...inputProps} />
		</div>
	);
}

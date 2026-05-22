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
import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import {
	type ChatEntityType,
	useConversationForEntity,
	useConversationParticipants,
	useMarkConversationRead,
	useMessagesForConversationPaginated,
} from "@/core/comms/messages/hooks";
import { useCurrentOrg, useMe, useOrgMembers } from "@/core/shell/shared/hooks/useCurrentOrg";
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
	const isEntityMode =
		"entityType" in props && Boolean(props.entityType) && Boolean(props.entityId);
	const byEntity = useConversationForEntity({
		orgId: isEntityMode ? orgId : undefined,
		entityType: isEntityMode ? (props as MessagesThreadByEntityProps).entityType : "person",
		entityId: isEntityMode ? (props as MessagesThreadByEntityProps).entityId : "",
		threadId: isEntityMode ? (props as MessagesThreadByEntityProps).threadId : undefined,
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

	const liveConversation: Doc<"conversations"> | null =
		"conversationId" in props && props.conversationId
			? (convoForId?.conversation ?? null)
			: (byEntity?.conversation ?? null);

	// User-intent key — what the parent is asking us to render. Used both for
	// the SWR cache invalidation rules and for resetting the reply target on
	// intent change.
	const intentKey =
		"conversationId" in props && props.conversationId
			? `c:${String(props.conversationId)}`
			: `e:${(props as MessagesThreadByEntityProps).entityType ?? ""}:${(props as MessagesThreadByEntityProps).entityId ?? ""}:${(props as MessagesThreadByEntityProps).threadId ?? ""}`;
	const isConversationMode = "conversationId" in props && Boolean(props.conversationId);

	// Step 2 — paginated thread feed. Skipped while conversation is null.
	const paginated = useMessagesForConversationPaginated({
		orgId,
		conversationId: liveConversation?._id,
		initialNumItems: 30,
	});
	const liveMessages: Doc<"messages">[] | undefined =
		paginated.status === "LoadingFirstPage"
			? undefined
			: (paginated.results as Doc<"messages">[]);

	// ─── Stale-while-revalidate render cache ─────────────────────────────────
	// When the user switches threads, the new conversation's `getById` and
	// the new pagination's first page both go through a brief loading window.
	// Without intervention the entire thread blanks back to a "Loading…"
	// header + "Loading messages…" body for every single switch — a UX
	// regression on top of otherwise-live subscriptions.
	//
	// We cache the last successfully-rendered { conversation, messages } pair
	// across this MessagesThread instance and render it as a stale fallback
	// while the next thread's queries hydrate. The moment fresh data arrives
	// we swap atomically. Convex's own query cache makes "switch back to a
	// recent thread" instant, so this fallback only fires for cold threads.
	//
	// Live subscriptions are untouched — `useQuery` / `usePaginatedQuery`
	// keep streaming updates; we only override which snapshot the JSX renders
	// during the brief loading window. Mutating `stableRef.current` during
	// render is safe because the render output is derived from it on the same
	// pass, so the component remains idempotent.
	//
	// Cache rule: in conversation-mode (org-wide inbox) the cache is reused
	// across intent changes — that's the SWR feature. In entity-mode (embedded
	// panel) the cache is only reused for the SAME entity intent, so an entity
	// without a conversation yet never inherits the previous entity's chat.
	const stableRef = useRef<{
		intentKey: string;
		conversation: Doc<"conversations">;
		messages: Doc<"messages">[];
	} | null>(null);
	const isCurrentReady = liveConversation !== null && liveMessages !== undefined;
	if (isCurrentReady) {
		stableRef.current = {
			intentKey,
			conversation: liveConversation,
			messages: liveMessages,
		};
	}
	const cacheUsable =
		stableRef.current !== null &&
		(isConversationMode || stableRef.current.intentKey === intentKey);
	const conversation: Doc<"conversations"> | null = isCurrentReady
		? liveConversation
		: cacheUsable
			? (stableRef.current?.conversation ?? null)
			: null;
	const messages: Doc<"messages">[] | undefined = isCurrentReady
		? liveMessages
		: cacheUsable
			? stableRef.current?.messages
			: undefined;

	const canLoadOlder = paginated.status === "CanLoadMore" || paginated.status === "LoadingMore";
	const isLoadingOlder = paginated.status === "LoadingMore";
	const loadOlder = useMemo(() => {
		return () => paginated.loadMore(30);
	}, [paginated]);

	const members = useOrgMembers();
	const me = useMe();
	const { membership: orgMembership } = useCurrentOrg();

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
		() => Boolean(orgMembership?.permissions?.includes("messages.deleteAny")),
		[orgMembership],
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
	// Reset the reply target when the user's INTENT changes (sidebar selection
	// or new entity coords). Tracking the displayed conversation here would
	// feel laggy: the chip would linger across the SWR window. The intent key
	// (declared above with the cache rules) fires the reset immediately on
	// click.
	// biome-ignore lint/correctness/useExhaustiveDependencies: dep is the trigger, not a read
	useEffect(() => {
		setReplyTo(null);
	}, [intentKey]);

	// Mark-read.
	//
	// OCC fix (2026-05-18): The previous implementation depended on
	// `liveLastMessageId` which changes reference on every pagination
	// revalidation — not just on genuinely new messages. This caused
	// `markRead` to fire on every subscription tick, producing 45 OCC
	// failures + 223 retries per minute on `conversationMembers`.
	//
	// New approach: depend on the conversation's `lastMessageAt` timestamp
	// (a primitive number that only changes when a NEW message is sent) and
	// the conversation id. Additionally, debounce with a ref so rapid
	// conversation switches don't fire multiple concurrent mutations.
	const markRead = useMarkConversationRead();
	const liveConversationId = liveConversation?._id;
	const liveLastMessageAt = liveConversation?.lastMessageAt;
	const markReadInFlight = useRef(false);
	// biome-ignore lint/correctness/useExhaustiveDependencies: deps are intentionally narrow — see comment above
	useEffect(() => {
		if (!liveConversationId || markReadInFlight.current) return;
		markReadInFlight.current = true;
		void markRead({ orgId, conversationId: liveConversationId })
			.catch(() => {})
			.finally(() => {
				markReadInFlight.current = false;
			});
	}, [liveConversationId, liveLastMessageAt, orgId]);

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

	// Resolve conversation-level membership from the getById query to pass
	// to ThreadHeader, avoiding a duplicate subscription.
	const conversationMembership = convoForId?.myMembership ?? null;

	return (
		<div className={cn("flex h-full flex-1 flex-col bg-background", className)}>
			<ThreadHeader
				orgId={orgId}
				conversation={conversation}
				participants={participants ?? undefined}
				myMembership={conversationMembership}
				onOpenSidebar={props.onOpenSidebar}
			/>
			<MessageList
				orgId={orgId}
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

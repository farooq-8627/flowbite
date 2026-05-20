"use client";

/**
 * MessageBubble — one message in the thread.
 *
 * Donor: shadboard `apps/chat/_components/message-bubble.tsx`. Adapted to
 * our schema (`Doc<"messages">`) and rules:
 *   - RTL-safe (`flex-row-reverse` for own messages, `me-*`/`ms-*`).
 *   - URLs auto-linkify.
 *   - Own messages render on the end side with `bg-primary`; others on the
 *     start side with `bg-accent`.
 *
 * 2026-05-16 update (per user direction):
 *   - DM mode: when `isDirect === true` (2-participant conversation) the
 *     sender label is suppressed. The user already knows who they're
 *     chatting with — left/right alignment is enough. Group chats keep
 *     names.
 *   - WhatsApp-style reactions: when a message has exactly ONE reaction
 *     entry with count 1, the emoji is rendered as a small floating chip
 *     attached to the bubble's outer-end-bottom corner. Multiple emojis
 *     or any count > 1 falls back to the original pill row beneath the
 *     bubble (so it still scales for group chats).
 *   - Avatars are clickable when a user `href` resolves — clicks navigate
 *     to the org member's profile page.
 *
 * 2026-05-17 update (per user direction):
 *   - WhatsApp / Telegram-style consecutive grouping: when `showHeader` is
 *     false the bubble hides BOTH the avatar and the displayName/edited/
 *     channel label. The author + the run-leader's avatar are still visible
 *     above; the follow-ups are spatially attached and tighter (`mt-0.5`
 *     instead of `mt-3`). MessageList computes `showHeader` per message
 *     using a 5-minute / same-author / same-day window.
 *   - Exact clock time replaces the "about 1 hour ago" relative string. We
 *     keep `formatDistanceToNow` available (still imported via date-fns at
 *     the call sites that need it — Recent Activity widget, etc.) — only
 *     the chat surface switched. Hover tooltip shows full date+time.
 *   - The "Open member profile" links no longer point at the broken
 *     `/{orgSlug}/settings/members/{userId}` route. They now route to the
 *     existing settings members section (`/{orgSlug}/settings?group=team#
 *     team.members`) AND are suppressed entirely when the avatar belongs
 *     to the current user (clicking your own avatar in a chat is a no-op).
 *   - New "Forward" action in the actions menu — opens `<ForwardDialog>`
 *     with the message preselected so the user can pick a target
 *     conversation or entity to copy the message + attachments into.
 */
import { useQuery } from "convex/react";
import { CornerUpLeft, Forward, MoreHorizontal, Pencil, Smile, Trash2 } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { useDeleteMessage, useEditMessage, useToggleReaction } from "@/core/comms/messages/hooks";
import { formatChatDateTime, formatChatTime } from "@/lib/datetime";
import { normalizeError } from "@/lib/normalizeError";
import { cn } from "@/lib/utils";
import { ChatAvatar } from "./ChatAvatar";
import { ForwardDialog } from "./ForwardDialog";
import { type MediaFile, MediaViewerModal } from "./MediaViewerModal";

const EDIT_WINDOW_MS = 15 * 60 * 1000; // mirrors backend (mutations.ts)
const REACTION_PALETTE = ["👍", "❤️", "🎉", "🙌", "✅", "🔥", "🚀", "👀", "😂", "😮", "🤔", "👎"];

type MessageAuthor = {
	name: string;
	avatarUrl?: string;
};

type MessageBubbleProps = {
	message: Doc<"messages">;
	author: MessageAuthor | undefined;
	isByCurrentUser: boolean;
	currentUserId: Id<"users"> | undefined;
	authorsById: Map<string, MessageAuthor>;
	canDeleteAny: boolean;
	/** When true (2-participant conversation), hide the displayName above the bubble. */
	isDirect: boolean;
	/**
	 * When false, the bubble is a "continuation" of the previous message from
	 * the same author. Avatar + name are hidden; top margin is tighter so the
	 * run reads as a single block.
	 * Defaults to true (single-message rendering, e.g. when consumed outside
	 * MessageList).
	 */
	showHeader?: boolean;
	/**
	 * When true, the previous message had a single floating reaction whose
	 * chip pokes BELOW the bubble. We bump our top margin so the chip never
	 * collides with our content. (batch 5)
	 */
	prevHasFloatingReaction?: boolean;
	/**
	 * Pre-resolved attachment files keyed by `Id<"files">`, supplied by the
	 * parent `MessageList` so every visible bubble shares ONE conversation-
	 * level subscription instead of opening its own per-bubble `listByIds`
	 * subscription.
	 *
	 * Tri-state contract:
	 *   - `undefined` (prop omitted) — standalone consumer outside the list.
	 *     `MessageAttachments` falls back to its own `listByIds` subscription.
	 *   - `null` — list-batched mode, parent's query is still loading.
	 *     Render nothing until the record arrives (matches the old
	 *     "loading frame" behaviour of the per-bubble subscription).
	 *   - `Record<string, …>` — list-batched mode, data ready. Slice it.
	 */
	attachmentFilesById?: Record<string, Doc<"files"> & { url: string | null }> | null;
	/** Called when the user clicks "Reply" on this message. */
	onReply?: (message: Doc<"messages">) => void;
};

const URL_REGEX = /(https?:\/\/[^\s]+)/g;

/**
 * Layout classes shared by BOTH the invisible ghost and the absolute meta
 * span. Keeping them identical guarantees that the ghost reserves the exact
 * same width that the absolute span consumes — without this, the absolute
 * was 4–6px wider than the ghost (different display modes, missing
 * `tabular-nums`) and could poke over the last word of text.
 */
const META_LAYOUT_CLASSES =
	"inline-flex items-center gap-1 whitespace-nowrap text-[10px] leading-none tabular-nums";

/**
 * MessageText — bubble body. WhatsApp-style timestamp anchored to the
 * bottom-end of the bubble (NOT inline with text).
 *
 * Implementation = the WhatsApp web "ghost spacer" trick:
 *   - The ghost is an INVISIBLE element rendered AFTER the text run with
 *     EXACTLY the same layout classes as the visible time. It reserves
 *     layout space at the end of the last text line so that:
 *       • Short text → ghost sits next to the last word, reserving width
 *         for the absolute time at the same position.
 *       • Long last line → ghost wraps to its own new line at the bottom
 *         of the bubble, reserving an entire line for the time.
 *   - The visible time is `position: absolute` at `bottom-1 end-2` —
 *     anchored to the bottom-end corner of the `<p>` no matter how many
 *     text lines wrap above it.
 *
 * 2026-05-17 (batch 6, per user direction): the previous batch-5 attempt
 * to put time INLINE after text was reverted — the user wants the
 * WhatsApp-look (time at bottom-end, separate from the text flow), not
 * the Telegram/Signal-look (time inline at end of last word).
 *
 * Width-matching fix vs the original ghost-spacer:
 *   - Both ghost and absolute now share `META_LAYOUT_CLASSES` exactly.
 *     Previously the ghost was `inline-block` (no flex gap) while the
 *     absolute was `inline-flex items-center gap-1` — that 4px gap
 *     difference + missing tabular-nums on the ghost caused the absolute
 *     to overflow the ghost reserve in some fonts / locales, producing
 *     the overlap the user reported.
 */
function MessageText({
	text,
	meta,
}: {
	text: string;
	/** Optional bottom-end metadata (timestamp + edited indicator). */
	meta?: React.ReactNode;
}) {
	if (!text && !meta) return null;
	const parts = text ? text.split(URL_REGEX) : [];
	return (
		<p className="relative whitespace-pre-wrap break-words px-2 py-1 text-sm leading-relaxed">
			{parts.map((part, idx) => {
				const key = `${idx}:${part.slice(0, 32)}`;
				if (URL_REGEX.test(part)) {
					return (
						<a
							key={key}
							href={part}
							target="_blank"
							rel="noopener noreferrer"
							className="underline-offset-4 hover:underline"
						>
							{part}
						</a>
					);
				}
				return <span key={key}>{part}</span>;
			})}
			{meta && (
				<>
					{/*
					 * Ghost spacer — invisible, reserves the layout space the
					 * absolute time will visually occupy. MUST share layout
					 * classes with the absolute (incl. tabular-nums + flex gap)
					 * so its width is byte-identical to the visible span.
					 *
					 * The leading `\u00A0` non-breaking space gives the ghost a
					 * little physical gap from the last text glyph so cursor
					 * selection / accessibility tools don't render the ghost as
					 * "stuck" to the last word.
					 */}
					<span
						aria-hidden="true"
						className={cn(META_LAYOUT_CLASSES, "invisible select-none ms-2")}
					>
						{meta}
					</span>
					<span className={cn(META_LAYOUT_CLASSES, "absolute bottom-1 end-2 opacity-70")}>
						{meta}
					</span>
				</>
			)}
		</p>
	);
}

/**
 * Group reactions by emoji for display + count, marking "mine" if the
 * caller has reacted with that emoji.
 */
function groupReactions(
	reactions: Doc<"messages">["reactions"],
	currentUserId: Id<"users"> | undefined,
) {
	if (!reactions || reactions.length === 0) return [];
	const map = new Map<string, { count: number; mine: boolean }>();
	for (const r of reactions) {
		const cur = map.get(r.emoji) ?? { count: 0, mine: false };
		cur.count += 1;
		if (currentUserId && String(r.userId) === String(currentUserId)) cur.mine = true;
		map.set(r.emoji, cur);
	}
	return Array.from(map.entries()).map(([emoji, info]) => ({ emoji, ...info }));
}

export function MessageBubble({
	message,
	author,
	isByCurrentUser,
	currentUserId,
	authorsById,
	canDeleteAny,
	isDirect,
	showHeader = true,
	prevHasFloatingReaction = false,
	attachmentFilesById,
	onReply,
}: MessageBubbleProps) {
	const router = useRouter();
	const params = useParams<{ orgSlug?: string }>();
	const orgSlug = params?.orgSlug;

	const isAI = message.authorType === "ai";
	const isContact = message.authorType === "contact";
	const displayName = author?.name ?? (isAI ? "AI" : isContact ? "Contact" : "Unknown");
	const createdAtIso = new Date(message.createdAt).toISOString();
	const exactTime = formatChatTime(message.createdAt);
	const fullDateTime = formatChatDateTime(message.createdAt);

	// Edit state
	const [isEditing, setIsEditing] = useState(false);
	const [draft, setDraft] = useState(message.content);
	const [busy, setBusy] = useState(false);
	const editTextRef = useRef<HTMLTextAreaElement>(null);

	// Forward dialog
	const [forwardOpen, setForwardOpen] = useState(false);

	const editMessage = useEditMessage();
	const deleteMessage = useDeleteMessage();
	const toggleReaction = useToggleReaction();

	const canEditOwn =
		isByCurrentUser && Date.now() - message.createdAt < EDIT_WINDOW_MS && !isAI && !isContact;
	// "Delete for me" is always available to anyone who can read the message —
	// hide-from-my-view is a per-user action, not a moderation action.
	// "Delete for everyone" requires authorship within the edit window OR a
	// member with `messages.deleteAny` (moderator).
	const within = Date.now() - message.createdAt < EDIT_WINDOW_MS;
	const canDeleteForMe = true;
	const canDeleteForEveryone = (isByCurrentUser && within) || canDeleteAny;
	const canDelete = canDeleteForMe || canDeleteForEveryone;
	const canForward = !isAI || message.content.length > 0; // forwarding works for any message
	const showActions = canEditOwn || canDelete || canForward || onReply !== undefined;

	const handleStartEdit = useCallback(() => {
		setDraft(message.content);
		setIsEditing(true);
		setTimeout(() => editTextRef.current?.focus(), 0);
	}, [message.content]);

	const handleCancelEdit = useCallback(() => {
		setDraft(message.content);
		setIsEditing(false);
	}, [message.content]);

	const handleSubmitEdit = useCallback(async () => {
		const trimmed = draft.trim();
		if (trimmed.length === 0 || trimmed === message.content) {
			setIsEditing(false);
			return;
		}
		setBusy(true);
		try {
			await editMessage({
				orgId: message.orgId,
				messageId: message._id,
				content: trimmed,
			});
			setIsEditing(false);
		} catch (err) {
			toast.error(normalizeError(err, "Couldn't save edit."));
		} finally {
			setBusy(false);
		}
	}, [draft, editMessage, message._id, message.content, message.orgId]);

	const handleDelete = useCallback(
		async (mode: "self" | "everyone") => {
			if (busy) return;
			setBusy(true);
			try {
				await deleteMessage({
					orgId: message.orgId,
					messageId: message._id,
					mode,
				});
			} catch (err) {
				toast.error(normalizeError(err, "Couldn't delete."));
			} finally {
				setBusy(false);
			}
		},
		[busy, deleteMessage, message._id, message.orgId],
	);

	const handleToggleReaction = useCallback(
		async (emoji: string) => {
			try {
				await toggleReaction({
					orgId: message.orgId,
					messageId: message._id,
					emoji,
				});
			} catch (err) {
				toast.error(normalizeError(err, "Couldn't update reaction."));
			}
		},
		[message._id, message.orgId, toggleReaction],
	);

	// Reply quote — fetch the parent (server enforces same-org).
	const replyTo = useQuery(
		api.crm.shared.messages.queries.getById,
		message.replyToId ? { orgId: message.orgId, messageId: message.replyToId } : "skip",
	);
	const replyAuthorName = replyTo
		? (authorsById.get(String(replyTo.authorId))?.name ?? "Unknown")
		: undefined;

	const reactions = useMemo(
		() => groupReactions(message.reactions, currentUserId),
		[message.reactions, currentUserId],
	);

	// WhatsApp-style: a single emoji (count 1) renders attached to the bubble.
	// Anything else (multi-emoji or count > 1) keeps the existing pill row.
	const singleReaction =
		reactions.length === 1 && reactions[0]!.count === 1 ? reactions[0] : null;
	const showPillRow = reactions.length > 0 && !singleReaction;

	const channelLabel = useMemo(() => {
		if (!message.channel || message.channel === "internal") return null;
		switch (message.channel) {
			case "whatsapp":
				return "WhatsApp";
			case "email":
				return "Email";
			case "sms":
				return "SMS";
			default:
				return null;
		}
	}, [message.channel]);

	const showSenderLabel = showHeader && (!isDirect || isAI || isContact || channelLabel);

	// Inline meta = "(edited) 2:45 PM" rendered inside the bubble at bottom-end
	// (WhatsApp-style). When the bubble has no text content we render an
	// external time chip below the attachments instead.
	const hasText = message.content.trim().length > 0;
	const inlineMeta = (
		<>
			{message.editedAt ? <span className="me-0.5 italic">edited</span> : null}
			<span>{exactTime}</span>
		</>
	);

	// Members route: link to the existing settings members section. The
	// previous `/{orgSlug}/settings/members/{userId}` route doesn't exist
	// (404). Self-avatars never link — clicking your own avatar is a no-op.
	const isOwnAvatar =
		currentUserId !== undefined && String(message.authorId) === String(currentUserId);
	const senderHref =
		!isAI && !isContact && !isOwnAvatar && orgSlug
			? `/${orgSlug}/settings?group=team#team.members`
			: undefined;

	return (
		<li
			className={cn(
				"group flex w-full gap-2",
				isByCurrentUser ? "flex-row-reverse" : "flex-row",
				// Tighter top margin when this bubble continues a same-author run.
				showHeader ? "mt-3 first:mt-0" : "mt-0.5",
				// When the previous bubble has a floating reaction chip poking
				// below it, give ourselves enough room so the chip can't crash
				// into our content. (batch 5)
				prevHasFloatingReaction && "mt-4",
			)}
		>
			{!showHeader || (isDirect && !isAI && !isContact) ? (
				// Continuation OR DM mode → invisible spacer that matches the
				// avatar's footprint so the bubble lines up under the run leader.
				<div
					aria-hidden="true"
					className="shrink-0"
					style={{ width: "1.75rem", height: "0.25rem" }}
				/>
			) : (
				<ChatAvatar
					name={displayName}
					src={author?.avatarUrl}
					size={1.75}
					isAI={isAI}
					onClick={senderHref ? () => router.push(senderHref) : undefined}
					clickLabel={`Open ${displayName}'s profile`}
				/>
			)}

			<div className="flex max-w-[min(75%,32rem)] flex-col gap-1">
				{showSenderLabel && (
					<span
						className={cn(
							"text-xs font-semibold text-foreground",
							isByCurrentUser && "text-end",
						)}
					>
						{!isDirect && displayName}
						{channelLabel && (
							<span className="ms-1 rounded-full bg-muted px-1.5 py-0.5 font-mono text-[9px] text-muted-foreground">
								{channelLabel}
							</span>
						)}
					</span>
				)}

				{/* Reply quote */}
				{message.replyToId && (
					<div
						className={cn(
							"max-w-full truncate rounded-[var(--radius)] border-s-2 bg-muted/50 px-2 py-1 text-xs",
							isByCurrentUser ? "self-end border-primary/50" : "border-accent",
						)}
					>
						<span className="font-medium text-foreground">
							{replyAuthorName ?? "…"}:
						</span>{" "}
						<span className="text-muted-foreground">
							{replyTo === undefined
								? "loading…"
								: replyTo === null
									? "(message removed)"
									: replyTo.content.slice(0, 120) +
										(replyTo.content.length > 120 ? "…" : "")}
						</span>
					</div>
				)}

				{/* Bubble + actions row */}
				<div
					className={cn(
						"flex items-center gap-1",
						isByCurrentUser ? "flex-row-reverse" : "flex-row",
					)}
				>
					{isEditing ? (
						<div className="flex flex-col gap-1">
							<textarea
								ref={editTextRef}
								value={draft}
								onChange={(e) => setDraft(e.target.value)}
								onKeyDown={(e) => {
									if (e.key === "Enter" && !e.shiftKey) {
										e.preventDefault();
										void handleSubmitEdit();
									} else if (e.key === "Escape") {
										e.preventDefault();
										handleCancelEdit();
									}
								}}
								disabled={busy}
								className="min-h-16 w-72 max-w-full resize-none rounded-[var(--radius)] border border-input bg-background p-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:opacity-50"
							/>
							<div className="flex gap-1">
								<Button
									type="button"
									size="sm"
									variant="ghost"
									onClick={handleCancelEdit}
									disabled={busy}
									className="h-6 px-2 text-xs"
								>
									Cancel
								</Button>
								<Button
									type="button"
									size="sm"
									onClick={() => void handleSubmitEdit()}
									disabled={busy || draft.trim().length === 0}
									className="h-6 px-2 text-xs"
								>
									Save
								</Button>
							</div>
						</div>
					) : (
						<div className="relative">
							<div
								className={cn(
									"min-w-0 rounded-[var(--radius)] text-sm",
									singleReaction && "mb-4",
									isByCurrentUser
										? "rounded-se-none bg-primary text-primary-foreground"
										: "rounded-ss-none bg-accent text-accent-foreground",
								)}
							>
								<MessageText
									text={message.content}
									meta={hasText ? inlineMeta : undefined}
								/>
							</div>

							{/* WhatsApp-style attached reaction (single, count 1) */}
							{singleReaction && (
								<button
									type="button"
									onClick={() => void handleToggleReaction(singleReaction.emoji)}
									aria-label={`Toggle reaction ${singleReaction.emoji}`}
									className={cn(
										"absolute -bottom-0.5 z-10 flex size-5 items-center justify-center rounded-full border bg-background text-[11px] leading-none shadow-sm transition-transform hover:scale-110",
										isByCurrentUser ? "-end-0.5" : "-start-0.5",
										singleReaction.mine ? "border-primary" : "border-border",
									)}
								>
									<span aria-hidden="true">{singleReaction.emoji}</span>
								</button>
							)}
						</div>
					)}

					{!isEditing && showActions && (
						/*
						 * Action visibility:
						 *   - On hover-capable devices (mouse, trackpad) the
						 *     icons are hidden by default and reveal on row
						 *     hover / focus-within. Keeps the chat clean.
						 *   - On touch-only devices (phones, iPads) `(hover:
						 *     hover)` doesn't match → the icons stay at
						 *     opacity-100 so users can tap them directly.
						 *     Tap is the only input gesture we have on these
						 *     devices, so an always-visible row is the right
						 *     trade-off (matches Slack / Linear mobile).
						 */
						<div className="flex items-center gap-0.5 opacity-100 transition-opacity [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 [@media(hover:hover)]:focus-within:opacity-100">
							<Popover>
								<PopoverTrigger asChild>
									<Button
										type="button"
										size="icon"
										variant="ghost"
										className="size-6"
										aria-label="Add reaction"
									>
										<Smile className="size-3.5" aria-hidden="true" />
									</Button>
								</PopoverTrigger>
								<PopoverContent
									className="w-auto p-1"
									align={isByCurrentUser ? "end" : "start"}
								>
									<div className="grid grid-cols-6 gap-0.5">
										{REACTION_PALETTE.map((emoji) => (
											<button
												type="button"
												key={emoji}
												onClick={() => void handleToggleReaction(emoji)}
												className="flex size-7 items-center justify-center rounded-full text-base transition-colors hover:bg-accent"
												aria-label={`React with ${emoji}`}
											>
												{emoji}
											</button>
										))}
									</div>
								</PopoverContent>
							</Popover>

							{onReply && (
								<Button
									type="button"
									size="icon"
									variant="ghost"
									className="size-6"
									aria-label="Reply"
									onClick={() => onReply(message)}
								>
									<CornerUpLeft className="size-3.5" aria-hidden="true" />
								</Button>
							)}

							{(canEditOwn || canDelete || canForward) && (
								<DropdownMenu>
									<DropdownMenuTrigger asChild>
										<Button
											type="button"
											size="icon"
											variant="ghost"
											className="size-6"
											aria-label="More actions"
										>
											<MoreHorizontal
												className="size-3.5"
												aria-hidden="true"
											/>
										</Button>
									</DropdownMenuTrigger>
									<DropdownMenuContent align={isByCurrentUser ? "end" : "start"}>
										{canForward && (
											<DropdownMenuItem onSelect={() => setForwardOpen(true)}>
												<Forward className="size-3.5" aria-hidden="true" />
												Forward
											</DropdownMenuItem>
										)}
										{canEditOwn && (
											<DropdownMenuItem onSelect={handleStartEdit}>
												<Pencil className="size-3.5" aria-hidden="true" />
												Edit
											</DropdownMenuItem>
										)}
										{(canEditOwn || canForward) && canDelete && (
											<DropdownMenuSeparator />
										)}
										{canDeleteForMe && (
											<DropdownMenuItem
												onSelect={() => void handleDelete("self")}
											>
												<Trash2 className="size-3.5" aria-hidden="true" />
												Delete for me
											</DropdownMenuItem>
										)}
										{canDeleteForEveryone && (
											<DropdownMenuItem
												variant="destructive"
												onSelect={() => void handleDelete("everyone")}
											>
												<Trash2 className="size-3.5" aria-hidden="true" />
												Delete for everyone
											</DropdownMenuItem>
										)}
									</DropdownMenuContent>
								</DropdownMenu>
							)}
						</div>
					)}
				</div>

				{/* Pill-style reactions (multi-emoji or count > 1) */}
				{showPillRow && (
					<div className={cn("flex flex-wrap gap-1", isByCurrentUser && "justify-end")}>
						{reactions.map((r) => (
							<button
								type="button"
								key={r.emoji}
								onClick={() => void handleToggleReaction(r.emoji)}
								className={cn(
									"flex h-6 items-center gap-1 rounded-full border px-2 text-xs transition-colors",
									r.mine
										? "border-primary bg-primary/10 text-primary"
										: "border-border bg-muted/50 text-muted-foreground hover:bg-muted",
								)}
							>
								<span aria-hidden="true">{r.emoji}</span>
								<span className="tabular-nums">{r.count}</span>
							</button>
						))}
					</div>
				)}

				{/* Attachments */}
				{message.attachments && message.attachments.length > 0 && (
					<MessageAttachments
						orgId={message.orgId}
						attachmentIds={message.attachments}
						alignEnd={isByCurrentUser}
						prefetchedFilesById={attachmentFilesById}
					/>
				)}

				{/*
				 * Time-below-bubble is only rendered for ATTACHMENT-ONLY
				 * messages — when there's text, the inline timestamp inside
				 * the bubble (rendered by `<MessageText meta={…}>` above) is
				 * the only time element. Avoids double-announcement to
				 * screen readers.
				 */}
				{!hasText && (
					<time
						dateTime={createdAtIso}
						title={fullDateTime}
						className={cn(
							"text-[10px] tabular-nums text-muted-foreground",
							isByCurrentUser && "text-end",
						)}
					>
						{message.editedAt ? <span className="me-1 italic">edited</span> : null}
						{exactTime}
					</time>
				)}
			</div>

			{forwardOpen && (
				<ForwardDialog
					orgId={message.orgId}
					message={message}
					open={forwardOpen}
					onOpenChange={setForwardOpen}
				/>
			)}
		</li>
	);
}

// ─── MessageAttachments — image/video previews + file chips ─────────────────

/**
 * Renders the bubble's attachment row.
 *
 * Two data sources, in priority order:
 *   1. **`prefetchedFilesById`** — supplied by `MessageList` from the
 *      conversation-level batched query (`useMessageAttachmentsForThread`).
 *      When present (or `null` for "batched but loading"), we slice the
 *      record by this bubble's `attachmentIds` and avoid opening any
 *      subscription of our own. This is the hot path for the live chat
 *      thread.
 *   2. **`useQuery(api.files.queries.listByIds, …)` fallback** — used by
 *      single-bubble consumers outside the thread (e.g. `ForwardDialog`'s
 *      preview, future widgets) so they keep working without piping the
 *      prefetched map through.
 *
 * `prefetchedFilesById === undefined` ⇒ standalone mode, use fallback.
 * `prefetchedFilesById === null`      ⇒ batched but loading, render nothing.
 * `prefetchedFilesById === record`    ⇒ batched + ready, slice the record.
 *
 * The conditional `useQuery` is gated by an unconditional `"skip"` arg
 * branch so the hooks order is stable across renders.
 */
function MessageAttachments({
	orgId,
	attachmentIds,
	alignEnd,
	prefetchedFilesById,
}: {
	orgId: Id<"orgs">;
	attachmentIds: Id<"files">[];
	alignEnd: boolean;
	prefetchedFilesById?: Record<string, Doc<"files"> & { url: string | null }> | null;
}) {
	// Standalone mode? Fall back to a per-bubble subscription. When the
	// prefetched map (or its loading sentinel) IS supplied we pass `"skip"`
	// so hooks order stays stable and no extra subscription is opened.
	const isBatched = prefetchedFilesById !== undefined;
	const fallbackFiles = useQuery(
		api.files.queries.listByIds,
		isBatched ? "skip" : { orgId, ids: attachmentIds },
	);

	// Resolve the bubble's slice of the attachments — either by indexing
	// the prefetched record (no subscription) or by reading the fallback
	// subscription's array. Order matches `attachmentIds` so the media
	// viewer's index lookups stay stable.
	const files = useMemo(() => {
		if (isBatched) {
			// `null` means "batched but the parent's query is still loading"
			// — render nothing until the record arrives.
			if (prefetchedFilesById === null) return undefined;
			const resolved: Array<Doc<"files"> & { url: string | null }> = [];
			for (const id of attachmentIds) {
				const f = prefetchedFilesById[String(id)];
				if (f) resolved.push(f);
			}
			return resolved;
		}
		return fallbackFiles ?? undefined;
	}, [isBatched, prefetchedFilesById, attachmentIds, fallbackFiles]);

	const [viewerOpen, setViewerOpen] = useState(false);
	const [viewerStartIndex, setViewerStartIndex] = useState(0);

	const mediaFiles = useMemo<MediaFile[]>(() => {
		if (!files) return [];
		return files
			.filter(
				(f) =>
					f.url && (f.mimeType?.startsWith("image/") || f.mimeType?.startsWith("video/")),
			)
			.map((f) => ({
				id: String(f._id),
				name: f.name,
				url: f.url as string,
				mimeType: f.mimeType,
			}));
	}, [files]);

	if (!files || files.length === 0) return null;

	const openMediaAt = (id: string) => {
		const idx = mediaFiles.findIndex((m) => m.id === id);
		if (idx < 0) return;
		setViewerStartIndex(idx);
		setViewerOpen(true);
	};

	return (
		<>
			<div className={cn("flex flex-wrap gap-1.5", alignEnd && "justify-end")}>
				{files.map((f) => {
					const isImage = f.mimeType?.startsWith("image/");
					const isVideo = f.mimeType?.startsWith("video/");
					const isAudio = f.mimeType?.startsWith("audio/");
					const isVoice = f.tags?.includes("kind:voice");

					if (isImage && f.url) {
						return (
							<button
								type="button"
								key={String(f._id)}
								onClick={() => openMediaAt(String(f._id))}
								className="block max-w-60 overflow-hidden rounded-[var(--radius)] border border-border bg-muted/50 transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
								aria-label={`Open ${f.name}`}
							>
								{/* biome-ignore lint/performance/noImgElement: Convex signed storage URLs can't use next/image */}
								<img
									src={f.url}
									alt={f.name}
									className="h-auto max-h-60 w-auto object-cover"
									loading="lazy"
								/>
							</button>
						);
					}

					if (isVideo && f.url) {
						return (
							<button
								type="button"
								key={String(f._id)}
								onClick={() => openMediaAt(String(f._id))}
								className="relative block max-w-60 overflow-hidden rounded-[var(--radius)] border border-border bg-muted/50 transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
								aria-label={`Open ${f.name}`}
							>
								<video
									src={f.url}
									className="h-auto max-h-60 w-auto"
									preload="metadata"
									muted
								>
									<track kind="captions" />
								</video>
								<span className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/20">
									<span className="flex size-10 items-center justify-center rounded-full bg-black/60 text-white">
										▶
									</span>
								</span>
							</button>
						);
					}

					if (isAudio && f.url) {
						return (
							<div
								key={String(f._id)}
								className="max-w-72 overflow-hidden rounded-[var(--radius)] border border-border bg-muted/50 p-2"
							>
								<audio src={f.url} controls className="w-full">
									<track kind="captions" />
								</audio>
								<p className="mt-1 truncate text-[10px] text-muted-foreground">
									{isVoice ? "Voice note" : f.name}
								</p>
							</div>
						);
					}

					return (
						<a
							key={String(f._id)}
							href={f.url ?? "#"}
							target="_blank"
							rel="noopener noreferrer"
							className="flex max-w-60 items-center gap-1.5 rounded-[var(--radius)] border border-border bg-muted/50 px-2 py-1 text-xs hover:bg-muted"
						>
							<span className="truncate text-foreground">{f.name}</span>
							<span className="shrink-0 text-[10px] text-muted-foreground">
								{formatBytes(f.size)}
							</span>
						</a>
					);
				})}
			</div>

			{mediaFiles.length > 0 && (
				<MediaViewerModal
					files={mediaFiles}
					startIndex={viewerStartIndex}
					open={viewerOpen}
					onOpenChange={setViewerOpen}
				/>
			)}
		</>
	);
}

function formatBytes(n: number): string {
	if (n < 1024) return `${n} B`;
	if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
	return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

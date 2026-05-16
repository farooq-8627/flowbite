"use client";

/**
 * MessageInput — composer for new messages.
 *
 * Donor: shadboard `apps/chat/_components/text-message-form.tsx`. Adapted:
 *   - Replaces the local reducer dispatch with `useSendMessage` + idempotency
 *     (IMPLEMENTATION.md §1).
 *   - Optimistic clear-on-submit; restores the draft if the mutation rejects.
 *   - Enter sends, Shift+Enter inserts a newline.
 *
 * Tier B3 — Mentions:
 *   - Detects an `@` token at the cursor and pops a member picker; selecting
 *     a member rewrites the token to `@<displayName>` and pushes their
 *     userId into the local `mentionedIds` array. The backend uses
 *     `mentions[]` to (a) auto-add them to the conversation and
 *     (b) override their `notificationLevel`.
 *
 * Tier C2 — Attachments:
 *   - Paperclip button opens the OS file picker. Each selected file goes
 *     through the standard 3-step upload (`generateUploadUrl` → PUT bytes →
 *     `record`) and lands in local `pendingAttachments`. They render as
 *     chips under the textarea and get sent via `attachments: Id<"files">[]`.
 *
 * Reply support (Tier B1):
 *   - Parent passes `replyTo` (a Doc<"messages"> | null). When set, a
 *     dismissible "Replying to {author}" chip renders above the textarea.
 *     Clearing it is a callback to the parent.
 *
 * Phase 3 / WhatsApp readiness:
 *   - The send mutation accepts `channel`. We pass nothing here (defaults to
 *     internal); a future Phase 3 toggle will let users compose directly to
 *     WhatsApp from the same input — same hook, same idempotency, same fan-out.
 */
import { useMutation, useQuery } from "convex/react";
import { File as FileIcon, Image as ImageIcon, Loader2, Mic, Paperclip, Send, Video, X } from "lucide-react";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { type ChatEntityType, useSendMessage } from "@/core/comms/messages/hooks";
import { cn } from "@/lib/utils";
import { ChatAvatar } from "./ChatAvatar";
import { VoiceRecorder } from "./VoiceRecorder";

type MessageInputProps = {
	orgId: Id<"orgs">;
	/** Either pass an existing conversation… */
	conversationId?: Id<"conversations">;
	/** …or pass an entity reference; the backend auto-creates the conversation. */
	entityType?: ChatEntityType;
	entityId?: string;
	threadId?: string;
	/** Reply target — when set, a chip renders and `replyToId` is sent. */
	replyTo?: Doc<"messages"> | null;
	onClearReply?: () => void;
	placeholder?: string;
	disabled?: boolean;
	className?: string;
};

type PendingAttachment = {
	fileId: Id<"files">;
	name: string;
	size: number;
	mimeType: string;
	/** Object URL created with `URL.createObjectURL` for instant preview. */
	previewUrl?: string;
};

const MENTION_TOKEN_REGEX = /@(\w*)$/;

/**
 * Map an entityType to a file `scope`. The valid scope set lives in
 * `convex/files/mutations.ts` (`VALID_SCOPES`). Phase 4 will add project/task.
 */
function fileScopeForEntity(entityType: ChatEntityType): {
	scope: string;
	usable: boolean;
} {
	switch (entityType) {
		case "lead":
		case "contact":
		case "person":
			return { scope: "person", usable: true };
		case "deal":
			return { scope: "deal", usable: true };
		case "company":
			return { scope: "company", usable: true };
		default:
			// project/task — not yet a valid file scope (Phase 4).
			return { scope: "org", usable: false };
	}
}

export function MessageInput({
	orgId,
	conversationId,
	entityType,
	entityId,
	threadId,
	replyTo,
	onClearReply,
	placeholder = "Type a message…",
	disabled = false,
	className,
}: MessageInputProps) {
	const sendMessage = useSendMessage();
	const generateUploadUrl = useMutation(api.files.mutations.generateUploadUrl);
	const recordFile = useMutation(api.files.mutations.record);

	const [draft, setDraft] = useState("");
	const [isSending, setIsSending] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [mentionedIds, setMentionedIds] = useState<Id<"users">[]>([]);
	const [pendingAttachments, setPendingAttachments] = useState<PendingAttachment[]>([]);
	const [uploadingNames, setUploadingNames] = useState<string[]>([]);
	const [recorderOpen, setRecorderOpen] = useState(false);
	const [attachMenuOpen, setAttachMenuOpen] = useState(false);

	const textareaRef = useRef<HTMLTextAreaElement>(null);
	const formId = useId();

	// Need conversation context to resolve a file scope for the upload.
	const convoForEntity = useQuery(
		api.crm.shared.messages.queries.listForEntity,
		entityType && entityId ? { orgId, entityType, entityId, threadId, limit: 1 } : "skip",
	);
	const convoForId = useQuery(
		api.crm.shared.conversations.queries.getById,
		conversationId ? { orgId, conversationId } : "skip",
	);
	const conversation: Doc<"conversations"> | null = conversationId
		? (convoForId?.conversation ?? null)
		: (convoForEntity?.conversation ?? null);

	const fileScope = useMemo(() => {
		const t: ChatEntityType =
			entityType ?? (conversation?.entityType as ChatEntityType | undefined) ?? "person";
		return fileScopeForEntity(t);
	}, [entityType, conversation]);
	const fileScopeId = entityId ?? conversation?.entityId;

	const canSend =
		!disabled &&
		!isSending &&
		(draft.trim().length > 0 || pendingAttachments.length > 0) &&
		(conversationId !== undefined || (entityType !== undefined && entityId !== undefined));

	// ─── Mention picker ───────────────────────────────────────────────────────

	const members = useQuery(api.orgs.queries.listMembers, { orgId });
	const [mentionAnchor, setMentionAnchor] = useState<{
		query: string;
		start: number;
		end: number;
	} | null>(null);
	const [mentionIndex, setMentionIndex] = useState(0);

	const detectMention = useCallback((text: string, caret: number) => {
		const before = text.slice(0, caret);
		const match = before.match(MENTION_TOKEN_REGEX);
		if (!match) return null;
		const start = caret - match[0].length;
		return { query: match[1] ?? "", start, end: caret };
	}, []);

	const mentionCandidates = useMemo(() => {
		if (!mentionAnchor || !members) return [];
		const needle = mentionAnchor.query.toLowerCase();
		return members
			.filter((m) => {
				const hay = `${m.user.name ?? ""} ${m.user.email ?? ""}`.toLowerCase();
				return needle.length === 0 || hay.includes(needle);
			})
			.slice(0, 6);
	}, [members, mentionAnchor]);

	// biome-ignore lint/correctness/useExhaustiveDependencies: query change is the trigger, not a read
	useEffect(() => {
		setMentionIndex(0);
	}, [mentionAnchor?.query]);

	const insertMention = useCallback(
		(member: { user: { _id: Id<"users">; name?: string; email?: string } }) => {
			if (!mentionAnchor) return;
			const display = (member.user.name ?? member.user.email ?? "user").replace(/\s+/g, " ");
			const before = draft.slice(0, mentionAnchor.start);
			const after = draft.slice(mentionAnchor.end);
			const insert = `@${display} `;
			const next = `${before}${insert}${after}`;
			setDraft(next);
			setMentionedIds((prev) =>
				prev.includes(member.user._id) ? prev : [...prev, member.user._id],
			);
			setMentionAnchor(null);
			// Restore cursor position after the inserted text.
			const newCaret = before.length + insert.length;
			setTimeout(() => {
				const ta = textareaRef.current;
				if (ta) {
					ta.focus();
					ta.setSelectionRange(newCaret, newCaret);
				}
			}, 0);
		},
		[draft, mentionAnchor],
	);

	// ─── Attachments ──────────────────────────────────────────────────────────

	const fileInputRef = useRef<HTMLInputElement>(null);
	const acceptRef = useRef<string>("");

	const openPicker = useCallback((accept: string) => {
		const el = fileInputRef.current;
		if (!el) return;
		acceptRef.current = accept;
		el.accept = accept;
		// Allow re-clicking the same file by clearing the value first.
		el.value = "";
		el.click();
	}, []);

	const handleFiles = useCallback(
		async (files: FileList | null) => {
			if (!files || files.length === 0) return;
			if (!fileScope.usable) {
				toast.error("Attachments aren't available for this thread yet.");
				return;
			}
			if (!fileScopeId) {
				toast.error("Couldn't resolve where to save the attachment.");
				return;
			}
			for (const file of Array.from(files)) {
				setUploadingNames((p) => [...p, file.name]);
				// Build a local preview URL for images/videos so the user sees
				// the asset immediately, not just the filename. Cleaned up in
				// `removePending` and on unmount (see useEffect below).
				const isPreviewable =
					file.type.startsWith("image/") || file.type.startsWith("video/");
				const previewUrl = isPreviewable ? URL.createObjectURL(file) : undefined;
				try {
					// 1. Get a one-time upload URL.
					const uploadUrl = await generateUploadUrl();
					// 2. PUT the bytes.
					const res = await fetch(uploadUrl, {
						method: "POST",
						headers: { "Content-Type": file.type || "application/octet-stream" },
						body: file,
					});
					if (!res.ok) throw new Error(`Upload failed (${res.status})`);
					const { storageId } = (await res.json()) as { storageId: Id<"_storage"> };
					// 3. Record the file row + tag with conversation entity.
					const fileId = await recordFile({
						orgId,
						storageId,
						scope: fileScope.scope,
						scopeId: fileScopeId,
						name: file.name,
						size: file.size,
						mimeType: file.type || "application/octet-stream",
						tags: [`message:${fileScope.scope}:${fileScopeId}`],
					});
					setPendingAttachments((p) => [
						...p,
						{
							fileId,
							name: file.name,
							size: file.size,
							mimeType: file.type,
							previewUrl,
						},
					]);
				} catch (err) {
					if (previewUrl) URL.revokeObjectURL(previewUrl);
					toast.error(
						err instanceof Error ? err.message : `Couldn't upload ${file.name}.`,
					);
				} finally {
					setUploadingNames((p) => p.filter((n) => n !== file.name));
				}
			}
		},
		[fileScope, fileScopeId, generateUploadUrl, orgId, recordFile],
	);

	const removePending = useCallback((fileId: Id<"files">) => {
		setPendingAttachments((p) => {
			const removed = p.find((a) => a.fileId === fileId);
			if (removed?.previewUrl) URL.revokeObjectURL(removed.previewUrl);
			return p.filter((a) => a.fileId !== fileId);
		});
	}, []);

	// Revoke any remaining object URLs on unmount to avoid leaks.
	const pendingRef = useRef<PendingAttachment[]>(pendingAttachments);
	pendingRef.current = pendingAttachments;
	useEffect(() => {
		return () => {
			for (const a of pendingRef.current) {
				if (a.previewUrl) URL.revokeObjectURL(a.previewUrl);
			}
		};
	}, []);

	// ─── Voice notes ─────────────────────────────────────────────────────────

	const handleVoiceSend = useCallback(
		async (file: File, durationMs: number) => {
			if (!fileScope.usable) {
				toast.error("Voice notes aren't available for this thread yet.");
				return;
			}
			if (!fileScopeId) {
				toast.error("Couldn't resolve where to save the voice note.");
				return;
			}
			try {
				const uploadUrl = await generateUploadUrl();
				const res = await fetch(uploadUrl, {
					method: "POST",
					headers: { "Content-Type": file.type || "audio/webm" },
					body: file,
				});
				if (!res.ok) throw new Error(`Upload failed (${res.status})`);
				const { storageId } = (await res.json()) as { storageId: Id<"_storage"> };
				const seconds = Math.max(1, Math.round(durationMs / 1000));
				const fileId = await recordFile({
					orgId,
					storageId,
					scope: fileScope.scope,
					scopeId: fileScopeId,
					name: file.name,
					size: file.size,
					mimeType: file.type || "audio/webm",
					tags: [
						`message:${fileScope.scope}:${fileScopeId}`,
						"kind:voice",
						`duration:${seconds}s`,
					],
				});
				const idempotencyKey = crypto.randomUUID();
				await sendMessage({
					orgId,
					conversationId,
					entityType,
					entityId,
					threadId,
					content: "",
					attachments: [fileId],
					idempotencyKey,
				});
			} catch (err) {
				toast.error(err instanceof Error ? err.message : "Couldn't send voice note.");
				throw err;
			}
		},
		[
			conversationId,
			entityId,
			entityType,
			fileScope,
			fileScopeId,
			generateUploadUrl,
			orgId,
			recordFile,
			sendMessage,
			threadId,
		],
	);

	// ─── Send ─────────────────────────────────────────────────────────────────

	const handleSend = useCallback(async () => {
		const trimmed = draft.trim();
		if (!canSend || (trimmed.length === 0 && pendingAttachments.length === 0)) return;

		// Optimistic clear; restore on failure.
		const draftSnapshot = draft;
		const mentionsSnapshot = mentionedIds;
		const attachmentsSnapshot = pendingAttachments;
		setDraft("");
		setMentionedIds([]);
		setPendingAttachments([]);
		setError(null);
		setIsSending(true);
		const idempotencyKey = crypto.randomUUID();
		try {
			await sendMessage({
				orgId,
				conversationId,
				entityType,
				entityId,
				threadId,
				content: trimmed,
				mentions: mentionsSnapshot.length > 0 ? mentionsSnapshot : undefined,
				attachments:
					attachmentsSnapshot.length > 0
						? attachmentsSnapshot.map((a) => a.fileId)
						: undefined,
				replyToId: replyTo?._id,
				idempotencyKey,
			});
			onClearReply?.();
		} catch (err) {
			// Restore everything so the user can retry without losing context.
			setDraft(draftSnapshot);
			setMentionedIds(mentionsSnapshot);
			setPendingAttachments(attachmentsSnapshot);
			const message =
				err instanceof Error ? err.message : "Couldn't send message. Please try again.";
			setError(message);
		} finally {
			setIsSending(false);
			textareaRef.current?.focus();
		}
	}, [
		canSend,
		conversationId,
		draft,
		entityId,
		entityType,
		mentionedIds,
		onClearReply,
		orgId,
		pendingAttachments,
		replyTo?._id,
		sendMessage,
		threadId,
	]);

	const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
		// Mention nav
		if (mentionAnchor && mentionCandidates.length > 0) {
			if (e.key === "ArrowDown") {
				e.preventDefault();
				setMentionIndex((i) => (i + 1) % mentionCandidates.length);
				return;
			}
			if (e.key === "ArrowUp") {
				e.preventDefault();
				setMentionIndex((i) => (i === 0 ? mentionCandidates.length - 1 : i - 1));
				return;
			}
			if (e.key === "Enter" || e.key === "Tab") {
				e.preventDefault();
				insertMention(mentionCandidates[mentionIndex]);
				return;
			}
			if (e.key === "Escape") {
				e.preventDefault();
				setMentionAnchor(null);
				return;
			}
		}
		// Default Enter sends, Shift+Enter newline.
		if (e.key === "Enter" && !e.shiftKey) {
			e.preventDefault();
			void handleSend();
		}
	};

	const onChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
		const value = e.target.value;
		setDraft(value);
		const caret = e.target.selectionStart ?? value.length;
		setMentionAnchor(detectMention(value, caret));
	};

	return (
		<div className={cn("flex flex-col gap-1 border-t border-border p-3", className)}>
			{/* Reply chip */}
			{replyTo && (
				<div className="flex items-center gap-2 rounded-[var(--radius)] border-s-2 border-primary bg-muted/50 px-2 py-1 text-xs">
					<span className="truncate text-muted-foreground">
						Replying to:{" "}
						<span className="text-foreground">
							{replyTo.content.slice(0, 80)}
							{replyTo.content.length > 80 ? "…" : ""}
						</span>
					</span>
					<Button
						type="button"
						size="icon"
						variant="ghost"
						className="ms-auto size-5"
						aria-label="Cancel reply"
						onClick={() => onClearReply?.()}
					>
						<X className="size-3" aria-hidden="true" />
					</Button>
				</div>
			)}

			{/* Voice recorder panel — shown above the form while recording / previewing */}
			{recorderOpen && (
				<VoiceRecorder
					onSend={handleVoiceSend}
					onClose={() => setRecorderOpen(false)}
					disabled={disabled}
				/>
			)}

			{/* Pending attachment chips / previews */}
			{(pendingAttachments.length > 0 || uploadingNames.length > 0) && (
				<ul className="flex flex-wrap gap-2">
					{uploadingNames.map((n) => (
						<li
							key={`uploading:${n}`}
							className="flex items-center gap-1 rounded-[var(--radius)] border border-border bg-muted/50 px-2 py-1 text-xs"
						>
							<Loader2 className="size-3 animate-spin" aria-hidden="true" />
							<span className="max-w-32 truncate">{n}</span>
						</li>
					))}
					{pendingAttachments.map((a) => {
						const isImage = a.mimeType?.startsWith("image/");
						const isVideo = a.mimeType?.startsWith("video/");
						if ((isImage || isVideo) && a.previewUrl) {
							return (
								<li
									key={String(a.fileId)}
									className="relative size-20 overflow-hidden rounded-[var(--radius)] border border-border bg-muted/50"
								>
									{isImage ? (
										// biome-ignore lint/performance/noImgElement: object URL previews can't use next/image
										<img
											src={a.previewUrl}
											alt={a.name}
											className="size-full object-cover"
										/>
									) : (
										<video
											src={a.previewUrl}
											className="size-full object-cover"
											muted
											preload="metadata"
										>
											<track kind="captions" />
										</video>
									)}
									<Button
										type="button"
										size="icon"
										variant="secondary"
										className="absolute end-1 top-1 size-5 rounded-full p-0 shadow-sm"
										aria-label={`Remove ${a.name}`}
										onClick={() => removePending(a.fileId)}
									>
										<X className="size-2.5" aria-hidden="true" />
									</Button>
								</li>
							);
						}
						return (
							<li
								key={String(a.fileId)}
								className="flex items-center gap-1 rounded-[var(--radius)] border border-border bg-muted/50 px-2 py-1 text-xs"
							>
								<Paperclip className="size-3" aria-hidden="true" />
								<span className="max-w-32 truncate">{a.name}</span>
								<Button
									type="button"
									size="icon"
									variant="ghost"
									className="size-4"
									aria-label={`Remove ${a.name}`}
									onClick={() => removePending(a.fileId)}
								>
									<X className="size-2.5" aria-hidden="true" />
								</Button>
							</li>
						);
					})}
				</ul>
			)}

			<form
				id={formId}
				onSubmit={(e) => {
					e.preventDefault();
					void handleSend();
				}}
				className="relative flex w-full items-end gap-2"
			>
				<input
					ref={fileInputRef}
					type="file"
					multiple
					className="hidden"
					onChange={(e) => {
						void handleFiles(e.target.files);
						// Reset so the same file can be re-selected.
						e.target.value = "";
					}}
				/>

				<Popover open={attachMenuOpen} onOpenChange={setAttachMenuOpen}>
					<PopoverTrigger asChild>
						<Button
							type="button"
							size="icon"
							variant="ghost"
							disabled={disabled || !fileScope.usable || recorderOpen}
							aria-label="Attach"
							title={fileScope.usable ? "Attach" : "Attachments not available here"}
							className="shrink-0"
						>
							<Paperclip className="size-4" aria-hidden="true" />
						</Button>
					</PopoverTrigger>
					<PopoverContent
						className="w-48 p-1"
						align="start"
						side="top"
					>
						<button
							type="button"
							onClick={() => {
								setAttachMenuOpen(false);
								openPicker("image/*");
							}}
							className="flex w-full items-center gap-2 rounded-[var(--radius)] px-2 py-2 text-start text-sm hover:bg-accent hover:text-accent-foreground"
						>
							<ImageIcon className="size-4 text-muted-foreground" aria-hidden="true" />
							Image
						</button>
						<button
							type="button"
							onClick={() => {
								setAttachMenuOpen(false);
								openPicker("video/*");
							}}
							className="flex w-full items-center gap-2 rounded-[var(--radius)] px-2 py-2 text-start text-sm hover:bg-accent hover:text-accent-foreground"
						>
							<Video className="size-4 text-muted-foreground" aria-hidden="true" />
							Video
						</button>
						<button
							type="button"
							onClick={() => {
								setAttachMenuOpen(false);
								openPicker("*/*");
							}}
							className="flex w-full items-center gap-2 rounded-[var(--radius)] px-2 py-2 text-start text-sm hover:bg-accent hover:text-accent-foreground"
						>
							<FileIcon className="size-4 text-muted-foreground" aria-hidden="true" />
							File
						</button>
					</PopoverContent>
				</Popover>

				<label htmlFor={`${formId}-input`} className="sr-only">
					Type a message
				</label>
				<textarea
					id={`${formId}-input`}
					ref={textareaRef}
					value={draft}
					onChange={onChange}
					onKeyDown={onKeyDown}
					placeholder={placeholder}
					rows={1}
					disabled={disabled || recorderOpen}
					className={cn(
						"min-h-9 max-h-32 flex-1 resize-none rounded-[var(--radius)] border border-input bg-background px-3 py-2 text-sm",
						"placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
						"disabled:cursor-not-allowed disabled:opacity-50",
					)}
					aria-label="Message"
				/>

				{!recorderOpen && draft.trim().length === 0 && pendingAttachments.length === 0 ? (
					<Button
						type="button"
						size="icon"
						variant="ghost"
						disabled={disabled || !fileScope.usable}
						aria-label="Record voice note"
						title="Record voice note"
						onClick={() => setRecorderOpen(true)}
						className="shrink-0"
					>
						<Mic className="size-4" aria-hidden="true" />
					</Button>
				) : (
					<Button
						type="submit"
						size="icon"
						disabled={!canSend || recorderOpen}
						aria-label="Send message"
						className="shrink-0"
					>
						<Send className="size-4" aria-hidden="true" />
					</Button>
				)}

				{/* Mention picker */}
				{mentionAnchor && mentionCandidates.length > 0 && (
					<div
						role="listbox"
						aria-label="Mention member"
						className="absolute bottom-full mb-2 max-h-56 w-64 overflow-y-auto rounded-[var(--radius)] border border-border bg-popover p-1 shadow-md"
					>
						{mentionCandidates.map((m, idx) => (
							<button
								key={String(m.user._id)}
								type="button"
								role="option"
								aria-selected={idx === mentionIndex}
								onMouseDown={(e) => {
									// Prevent textarea blur before insert runs.
									e.preventDefault();
									insertMention(m);
								}}
								className={cn(
									"flex w-full items-center gap-2 rounded-[calc(var(--radius)-2px)] px-2 py-1.5 text-start text-sm",
									idx === mentionIndex
										? "bg-accent text-accent-foreground"
										: "text-foreground hover:bg-accent/50",
								)}
							>
								<ChatAvatar
									name={m.user.name ?? m.user.email ?? "Member"}
									src={m.user.avatarUrl}
									size={1.5}
								/>
								<div className="flex min-w-0 flex-1 flex-col">
									<span className="truncate text-sm">
										{m.user.name ?? m.user.email}
									</span>
									{m.user.name && m.user.email && (
										<span className="truncate text-xs text-muted-foreground">
											{m.user.email}
										</span>
									)}
								</div>
							</button>
						))}
					</div>
				)}
			</form>
			{error && (
				<p role="alert" className="text-xs text-destructive">
					{error}
				</p>
			)}
		</div>
	);
}

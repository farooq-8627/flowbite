"use client";
/**
 * core/ai/components/ChatComposer.tsx
 *
 * Chat input area for the AI sidebar.
 *
 * Layout:
 *   ┌─ rounded composer card ──────────────────────────┐
 *   │  [pending file chips] (shown only when files attached)
 *   │  textarea (auto-grow, full width)                │
 *   │  ─────────────────────────────                   │
 *   │  [📎 attach] [model picker]                      │
 *   │                                          [send]  │
 *   └──────────────────────────────────────────────────┘
 *
 * Behaviour:
 *   - Enter to send, Shift+Enter for newline.
 *   - Auto-grows the textarea up to 160px tall, scrolls beyond that.
 *   - Reads the selected model from the SAME persisted preference the
 *     Settings → AI page writes to, so the two pickers stay in sync.
 *   - When `hasNoKeys` is true (no platform env keys AND no BYOK keys), the
 *     composer disables itself and shows a "Add an API key in Settings → AI"
 *     hint instead of letting the user fire requests that would just bounce
 *     back as red error bubbles in the thread.
 *   - Phase 4 Part 2 — file attach affordance. Uploaded files render as
 *     chips above the textarea; on send, their fileIds are injected into
 *     the body as `[Attached file:abc123 "name.jpg" (image/jpeg, 240 KB)]`
 *     so the AI can see them and call `analyze_file` when relevant.
 */
import { ArrowUp, KeyRound, Square, XIcon } from "lucide-react";
import Link from "next/link";
import { useCallback, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import type { Id } from "@/convex/_generated/dataModel";
import { useCurrentOrg } from "@/core/shell/shared/hooks/useCurrentOrg";
import { useModelPreference } from "../hooks/useModelPreference";
import { useChatPrefillListener } from "../lib/chatPrefill";
import { ChatModelPicker } from "./ChatModelPicker";
import { ChatAttachButton } from "./composer/ChatAttachButton";
import { SlashCommands } from "./composer/SlashCommands";

type PendingAttachment = {
	fileId: Id<"files">;
	name: string;
	mimeType: string;
	size: number;
};

interface Props {
	onSend: (body: string, model?: string, provider?: string) => void;
	onCancel?: () => void;
	disabled?: boolean;
	isStreaming?: boolean;
	placeholder?: string;
	/**
	 * Active conversation id. When `null`, the attach button still works —
	 * `onEnsureConversation` is invoked to create one before upload.
	 */
	conversationId?: Id<"aiConversations"> | null;
	/**
	 * Lazily create a conversation when the user attaches a file before
	 * sending their first message. Returns the new conversation id.
	 */
	onEnsureConversation?: () => Promise<Id<"aiConversations">>;
}

const MAX_HEIGHT_PX = 160;

function formatSize(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
	return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function ChatComposer({
	onSend,
	onCancel,
	disabled,
	isStreaming,
	placeholder,
	conversationId = null,
	onEnsureConversation,
}: Props) {
	// Single source of truth — same hook the settings page writes to.
	const { defaultModel, defaultProvider, hasNoKeys, isReady } = useModelPreference();
	const { fullOrgEntry } = useCurrentOrg();
	const orgSlug = fullOrgEntry?.org.slug;
	const orgId = fullOrgEntry?.org._id;

	const [draft, setDraft] = useState("");
	const [attachments, setAttachments] = useState<PendingAttachment[]>([]);
	const textareaRef = useRef<HTMLTextAreaElement>(null);

	// P1.14 — receive pre-fills from the proactive suggestions panel.
	// Drops the intent into the composer + focuses the textarea so the
	// user can edit-or-send without a click. See `core/ai/lib/chatPrefill.ts`.
	const onPrefill = useCallback((intent: string) => {
		setDraft(intent);
		const el = textareaRef.current;
		if (el) {
			el.focus();
			el.style.height = "auto";
			el.style.height = `${Math.min(el.scrollHeight, MAX_HEIGHT_PX)}px`;
			// Move the caret to the end so the user can keep typing.
			requestAnimationFrame(() => {
				el.setSelectionRange(intent.length, intent.length);
			});
		}
	}, []);
	useChatPrefillListener(onPrefill);

	function resetTextareaHeight() {
		const el = textareaRef.current;
		if (!el) return;
		el.style.height = "auto";
	}

	function handleSend() {
		const trimmed = draft.trim();
		if (disabled || hasNoKeys) return;
		if (!trimmed && attachments.length === 0) return;

		// Prepend a clear, machine-friendly attachment manifest the AI
		// can parse to discover fileIds. The model is instructed in
		// system prompt + tool docs that `[file:<id>]` is a real
		// fileId it can pass to analyze_file.
		let body = trimmed;
		if (attachments.length > 0) {
			const manifest = attachments
				.map(
					(a) =>
						`[file:${a.fileId} "${a.name.replace(/"/g, "'")}" (${a.mimeType}, ${formatSize(a.size)})]`,
				)
				.join("\n");
			body = body ? `${manifest}\n\n${body}` : manifest;
		}

		onSend(body, defaultModel, defaultProvider ?? undefined);
		setDraft("");
		setAttachments([]);
		resetTextareaHeight();
	}

	function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
		if (e.key === "Enter" && !e.shiftKey) {
			e.preventDefault();
			handleSend();
		}
	}

	function handleInput(e: React.ChangeEvent<HTMLTextAreaElement>) {
		setDraft(e.target.value);
		const el = e.target;
		el.style.height = "auto";
		el.style.height = `${Math.min(el.scrollHeight, MAX_HEIGHT_PX)}px`;
	}

	const composerDisabled = !!disabled || hasNoKeys;
	const canSend = (draft.trim().length > 0 || attachments.length > 0) && !composerDisabled;

	// Pre-flight: no AI key configured anywhere.
	// Show a clear actionable banner in place of the input.
	if (isReady && hasNoKeys) {
		return (
			<div className="shrink-0 border-t border-sidebar-border bg-sidebar p-3">
				<div className="flex flex-col gap-2 rounded-[var(--radius)] border border-amber-300/60 bg-amber-50/60 px-3 py-3 text-sm dark:border-amber-700/40 dark:bg-amber-950/20">
					<div className="flex items-start gap-2">
						<KeyRound className="size-4 mt-0.5 flex-none text-amber-700 dark:text-amber-300" />
						<div className="min-w-0">
							<p className="font-medium text-amber-900 dark:text-amber-100">
								No AI key configured
							</p>
							<p className="mt-0.5 text-xs text-amber-800/80 dark:text-amber-200/80 leading-relaxed">
								Add an API key (Anthropic, OpenAI, Google, Groq, Moonshot…) in{" "}
								<strong>Settings → AI</strong>, or ask an admin to set a platform
								env var on the Convex dashboard. Once added, the chat works
								immediately — no reload needed.
							</p>
						</div>
					</div>
					{orgSlug && (
						<Button asChild size="sm" variant="outline" className="self-start">
							<Link href={`/${orgSlug}/settings?group=ai`}>Open AI settings</Link>
						</Button>
					)}
				</div>
			</div>
		);
	}

	return (
		<div className="shrink-0 border-t border-sidebar-border bg-sidebar p-3">
			<div className="relative flex flex-col gap-2 rounded-[var(--radius)] border border-input bg-background px-3 py-2.5 shadow-xs transition-colors focus-within:border-ring">
				{attachments.length > 0 && (
					<div className="flex flex-wrap gap-1.5">
						{attachments.map((a) => (
							<span
								key={a.fileId}
								className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2 py-0.5 text-xs"
							>
								<span className="max-w-[220px] truncate" title={a.name}>
									{a.name}
								</span>
								<span className="text-muted-foreground">
									· {formatSize(a.size)}
								</span>
								<button
									type="button"
									className="text-muted-foreground hover:text-foreground"
									onClick={() =>
										setAttachments((prev) =>
											prev.filter((p) => p.fileId !== a.fileId),
										)
									}
									aria-label={`Remove ${a.name}`}
								>
									<XIcon className="size-3" />
								</button>
							</span>
						))}
					</div>
				)}
				<SlashCommands
					draft={draft}
					onPick={(expansion) => {
						setDraft(expansion);
						// Refocus + place caret at end after expansion.
						const el = textareaRef.current;
						if (el) {
							requestAnimationFrame(() => {
								el.focus();
								el.value = expansion;
								el.setSelectionRange(expansion.length, expansion.length);
								el.style.height = "auto";
								el.style.height = `${Math.min(el.scrollHeight, MAX_HEIGHT_PX)}px`;
							});
						}
					}}
				/>
				<textarea
					ref={textareaRef}
					value={draft}
					onChange={handleInput}
					onKeyDown={handleKeyDown}
					placeholder={placeholder ?? "Ask anything…"}
					disabled={composerDisabled}
					rows={1}
					className="w-full resize-none bg-transparent text-sm leading-relaxed outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50"
					style={{ minHeight: 24, maxHeight: MAX_HEIGHT_PX }}
				/>

				<div className="flex items-center justify-between gap-2">
					<div className="flex items-center gap-1">
						{onEnsureConversation && (
							<ChatAttachButton
								orgId={orgId}
								conversationId={conversationId}
								disabled={composerDisabled}
								onAttached={(att) => setAttachments((prev) => [...prev, att])}
								onEnsureConversation={onEnsureConversation}
							/>
						)}
						<ChatModelPicker />
					</div>

					<div className="flex items-center gap-2">
						{isStreaming && onCancel ? (
							<Button
								size="icon"
								variant="destructive"
								className="size-8 shrink-0 rounded-full animate-pulse"
								onClick={onCancel}
								aria-label="Stop generating (Ctrl+C / Esc)"
								title="Stop generating  ·  Ctrl+C  ·  Esc"
							>
								<Square className="size-3.5 fill-current" />
							</Button>
						) : (
							<Button
								size="icon"
								className="size-8 shrink-0 rounded-full"
								onClick={handleSend}
								disabled={!canSend}
								aria-label="Send message"
							>
								<ArrowUp className="size-4" />
							</Button>
						)}
					</div>
				</div>
			</div>
		</div>
	);
}

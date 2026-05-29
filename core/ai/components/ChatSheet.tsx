"use client";
/**
 * core/ai/components/ChatSheet.tsx
 *
 * Orchestrates the AI chat panel. Composes:
 *   - ChatHistoryDropdown (thread selector)
 *   - ChatContextCard (zero-token entity context)
 *   - Message list (ChatMessage for each message)
 *   - ChatComposer (input + model picker)
 *
 * Replaces the static stub in ai-chat-panel.tsx.
 * Mounts inside both the desktop Sidebar slot and mobile Sheet.
 */
import { useMutation } from "convex/react";
import { anyApi } from "convex/server";
import { Plus, Settings } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { APP_CONFIG } from "@/config/app-config";
import type { Id } from "@/convex/_generated/dataModel";
import { useCurrentOrg } from "@/core/shell/shared/hooks/useCurrentOrg";
import { useAIChat } from "../hooks/useAIChat";
import { useChatRouteContext } from "../hooks/useChatRouteContext";
import { usePersistedConversationId } from "../hooks/usePersistedConversationId";
import { AIMark } from "./AIMark";
import { AssistantTurn } from "./AssistantTurn";
import { ChatComposer } from "./ChatComposer";
import { ChatContextCard } from "./ChatContextCard";
import { ChatHistoryDropdown } from "./ChatHistoryDropdown";
import { ChatLandingPane } from "./ChatLandingPane";
import { ChatMessage } from "./ChatMessage";
import { Suggestions } from "./composer/Suggestions";

interface Props {
	/** Called when user navigates to Settings → AI */
	onOpenSettings?: () => void;
}

export function ChatSheet({ onOpenSettings }: Props) {
	const { fullOrgEntry } = useCurrentOrg();
	const orgId = fullOrgEntry?.org._id;

	// Stage 3-A H3 — Persist active conversationId across refresh, keyed
	// by orgId. The hook returns null until layout effect has read
	// storage (SSR-safe) and validates against the live conversations
	// list once it's loaded (see `validIds` plumbing below).
	const [conversationId, setConversationId] = usePersistedConversationId(orgId);
	const [autoContextLoad, setAutoContextLoad] = useState(true);
	const [contextCollapsed, setContextCollapsed] = useState(false);

	const { page: pageContext, entity: routeContext } = useChatRouteContext();

	const { messages, conversations, isStreaming, send, createConversation } = useAIChat({
		conversationId,
		routeContext,
		pageContext,
		autoContextLoad,
	});

	// Header label — show the active conversation's title if any, otherwise
	// fall back to the app brand name. The auto-titler (`convex/ai/titleGeneration.ts`)
	// patches `aiConversations.title` ~2s after the first assistant turn ends,
	// so a brand-new conversation briefly shows the brand label before the
	// real title arrives.
	const activeConversation = useMemo(
		() =>
			conversationId ? (conversations.find((c) => c._id === conversationId) ?? null) : null,
		[conversationId, conversations],
	);
	const headerTitle = (activeConversation?.title ?? "").trim() || APP_CONFIG.name;

	// Stage 3-A H3 — once the conversations query lands, drop a persisted
	// conversationId that no longer exists (deleted/archived between
	// sessions). One-shot per (orgId, conversationId) pair via a ref so
	// we never feed conversationId back into deps and trigger a feedback
	// loop (AGENTS.md → "RULE: Never put hook-returned objects in
	// useEffect deps").
	const staleCleanupRef = useRef<string | null>(null);
	useEffect(() => {
		if (!conversationId) return;
		if (conversations.length === 0) return; // query still loading or true-empty
		const key = `${orgId ?? ""}:${conversationId}`;
		if (staleCleanupRef.current === key) return;
		staleCleanupRef.current = key;
		const stillExists = conversations.some((c) => c._id === conversationId);
		if (!stillExists) {
			setConversationId(null);
		}
	}, [conversationId, conversations, orgId, setConversationId]);

	const scrollViewportRef = useRef<HTMLDivElement>(null);

	// Auto-scroll behaviour: whenever the messages array length changes (new
	// turn) OR the last message's content / thinkingState changes (mid-stream
	// updates), scroll the ScrollArea viewport itself to the bottom. We do
	// NOT use `Element.scrollIntoView()` here — the dashboard shell nests
	// 3+ scroll containers and scrollIntoView would walk up the DOM and
	// shift the outer layout (banned by AGENTS.md → "RULE: Never use
	// Element.scrollIntoView() inside nested scroll containers").
	const lastMessage = messages.at(-1);
	const lastContent = lastMessage?.content ?? "";
	const lastState = lastMessage?.thinkingState ?? "done";
	const messageCount = messages.length;
	useEffect(() => {
		// Read the trigger values so biome sees them as deps (the value is not
		// otherwise used — the effect's purpose is to react to *any* of them
		// changing). `void` keeps the expression a statement.
		void messageCount;
		void lastContent;
		void lastState;
		const wrapper = scrollViewportRef.current;
		if (!wrapper) return;
		// shadcn's <ScrollArea> wraps a Radix Viewport (the actual scroll
		// container) tagged with data-slot. Query for it once per effect.
		const viewport = wrapper.querySelector<HTMLElement>('[data-slot="scroll-area-viewport"]');
		if (!viewport) return;
		// rAF so the layout has settled before we measure scrollHeight.
		const id = requestAnimationFrame(() => {
			viewport.scrollTo({ top: viewport.scrollHeight, behavior: "smooth" });
		});
		return () => cancelAnimationFrame(id);
	}, [messageCount, lastContent, lastState]);

	const handleSend = useCallback(
		async (body: string, model?: string, provider?: string) => {
			if (!orgId) return;
			const result = await send(body, model, provider);
			if (result && !conversationId) {
				setConversationId(result.conversationId);
			}
		},
		[orgId, send, conversationId, setConversationId],
	);

	// Phase 4 Part 2 — file attach. ChatComposer needs a conversationId
	// before it can scope an upload, so we expose a lazy-create helper
	// that yields the existing id or creates a new one on demand. We
	// also flip the local `conversationId` state so future messages
	// land on the same thread.
	const handleEnsureConversation = useCallback(async () => {
		if (!orgId) throw new Error("Org not loaded");
		if (conversationId) return conversationId;
		const newId = (await createConversation({ orgId })) as Id<"aiConversations">;
		setConversationId(newId);
		return newId;
	}, [orgId, conversationId, createConversation, setConversationId]);

	const handleNew = useCallback(() => {
		setConversationId(null);
	}, [setConversationId]);

	// Cancel — wired to the Stop button + global keyboard shortcut.
	const cancelStream = useMutation(anyApi.ai.messages.cancelStream);
	const lastMessageId = lastMessage?._id;
	const handleCancel = useCallback(() => {
		if (!orgId || !lastMessageId || !isStreaming) return;
		cancelStream({ orgId, messageId: lastMessageId }).catch(() => {
			// non-fatal — UI will still settle when the stream loop exits.
		});
	}, [orgId, lastMessageId, isStreaming, cancelStream]);

	// Global keyboard shortcuts to stop a running stream:
	//   Ctrl+C (Win/Linux) / Cmd+C (Mac) — only when there's no text selection
	//     (so the user can still copy chat content normally).
	//   Esc                              — unconditional stop.
	//
	// We listen at window-level so the shortcut works regardless of where
	// focus is, except inside the composer textarea / contentEditable —
	// there we let the browser handle copy normally.
	useEffect(() => {
		if (!isStreaming) return;
		const onKey = (e: KeyboardEvent) => {
			const target = e.target as HTMLElement | null;
			const inEditable =
				target instanceof HTMLTextAreaElement ||
				target instanceof HTMLInputElement ||
				target?.isContentEditable === true;

			const isCtrlC = (e.ctrlKey || e.metaKey) && (e.key === "c" || e.key === "C");
			const isEsc = e.key === "Escape";

			if (isEsc) {
				// Esc never has a "copy" meaning — always cancel.
				e.preventDefault();
				handleCancel();
				return;
			}

			if (isCtrlC) {
				// Don't steal copy when the user has text selected, or when
				// they're typing in the composer (browser default = copy).
				if (inEditable) return;
				const sel = window.getSelection?.();
				if (sel && sel.toString().length > 0) return;
				e.preventDefault();
				handleCancel();
			}
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [isStreaming, handleCancel]);

	if (!orgId) return null;

	return (
		<div className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
			{/* Header */}
			<div className="flex shrink-0 items-center gap-2 border-b border-sidebar-border px-3 py-2">
				<AIMark size="size-4" tone="brand" className="shrink-0" aria-hidden="true" />
				<span className="flex-1 truncate font-semibold text-sm" title={headerTitle}>
					{headerTitle}
				</span>
				<ChatHistoryDropdown
					conversations={conversations}
					activeConversationId={conversationId}
					orgId={orgId}
					onSelect={(id) => setConversationId(id)}
					onNew={handleNew}
				/>
				<button
					type="button"
					title="New chat"
					onClick={handleNew}
					className="p-1 hover:text-foreground text-muted-foreground rounded cursor-pointer"
				>
					<Plus className="size-4" />
				</button>
				{onOpenSettings && (
					<button
						type="button"
						title="AI settings"
						onClick={onOpenSettings}
						className="p-1 hover:text-foreground text-muted-foreground rounded"
					>
						<Settings className="size-4" />
					</button>
				)}
			</div>

			{/* Context card — zero tokens, free preview of entity context */}
			{routeContext && (
				<ChatContextCard
					context={routeContext}
					autoContextLoad={autoContextLoad}
					onToggleAutoLoad={() => setAutoContextLoad((v) => !v)}
					collapsed={contextCollapsed}
					onToggleCollapsed={() => setContextCollapsed((v) => !v)}
				/>
			)}

			{/* Messages */}
			<div ref={scrollViewportRef} className="flex-1 min-h-0 chat-sheet-wrapper">
				<ScrollArea className="h-full">
					<div className="flex w-full min-w-0 flex-col py-2">
						{messages.length === 0 && conversationId === null && (
							<ChatLandingPane
								orgId={orgId}
								conversations={conversations}
								onSelectConversation={(id) => setConversationId(id)}
								onSend={(body) => void handleSend(body)}
								routeContext={routeContext}
							/>
						)}
						{(() => {
							// Group the flat message list into turns. Each
							// assistant message claims the tool messages that
							// follow it (up to the next non-tool message) so
							// the timeline UX (see AssistantTurn / ThinkingTimeline)
							// can render them inside a single working dropdown.
							//
							// Anything that doesn't fit (orphan tool message
							// without a preceding assistant — shouldn't normally
							// happen, but defensively) falls through to the
							// legacy <ChatMessage> branch so we never lose data.
							const items: Array<
								| { kind: "user"; msg: (typeof messages)[number] }
								| {
										kind: "assistantTurn";
										assistant: (typeof messages)[number];
										tools: Array<(typeof messages)[number]>;
								  }
								| { kind: "orphanTool"; msg: (typeof messages)[number] }
							> = [];
							let cursor = 0;
							while (cursor < messages.length) {
								const m = messages[cursor];
								if (m.role === "user") {
									items.push({ kind: "user", msg: m });
									cursor += 1;
									continue;
								}
								if (m.role === "assistant") {
									const tools: typeof messages = [];
									let j = cursor + 1;
									while (j < messages.length && messages[j].role === "tool") {
										tools.push(messages[j]);
										j += 1;
									}
									items.push({ kind: "assistantTurn", assistant: m, tools });
									cursor = j;
									continue;
								}
								// Orphan tool message — render via legacy path
								items.push({ kind: "orphanTool", msg: m });
								cursor += 1;
							}
							return items.map((item, idx) => {
								const isLast = idx === items.length - 1;
								if (item.kind === "user") {
									return (
										<ChatMessage
											key={item.msg._id}
											message={item.msg}
											orgId={orgId}
											isLast={isLast}
										/>
									);
								}
								if (item.kind === "assistantTurn") {
									return (
										<AssistantTurn
											key={item.assistant._id}
											assistant={item.assistant}
											tools={item.tools}
											orgId={orgId}
											isLast={isLast}
										/>
									);
								}
								return (
									<ChatMessage
										key={item.msg._id}
										message={item.msg}
										orgId={orgId}
										isLast={isLast}
									/>
								);
							});
						})()}
					</div>
				</ScrollArea>
			</div>

			{/* Sprint 5 — follow-up suggestion chips, populated from the
			    latest assistant message's `suggestions` field. Hidden
			    while streaming (chips are stale fast). */}
			{(() => {
				// Find the most recent assistant message regardless of how many
				// tool messages followed it. Assistant messages are rare relative
				// to tool calls so a small reverse-walk is cheap.
				const latestAssistant = [...messages].reverse().find((m) => m.role === "assistant");
				return (
					<Suggestions
						suggestions={latestAssistant?.suggestions ?? undefined}
						disabled={isStreaming}
						onPick={(s) => handleSend(s)}
					/>
				);
			})()}

			{/* Composer */}
			<ChatComposer
				onSend={handleSend}
				onCancel={handleCancel}
				disabled={isStreaming}
				isStreaming={isStreaming}
				conversationId={conversationId}
				onEnsureConversation={handleEnsureConversation}
				placeholder={
					routeContext
						? `Ask about ${routeContext.name ?? routeContext.personCode}…`
						: undefined
				}
			/>
		</div>
	);
}

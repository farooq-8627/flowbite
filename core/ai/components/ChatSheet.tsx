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
import { Bot, Plus, Settings } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { Id } from "@/convex/_generated/dataModel";
import { useCurrentOrg } from "@/core/shell/shared/hooks/useCurrentOrg";
import { useAIChat } from "../hooks/useAIChat";
import { useRouteContext } from "../hooks/useRouteContext";
import { ChatComposer } from "./ChatComposer";
import { ChatContextCard } from "./ChatContextCard";
import { ChatHistoryDropdown } from "./ChatHistoryDropdown";
import { ChatMessage } from "./ChatMessage";

interface Props {
	/** Called when user navigates to Settings → AI */
	onOpenSettings?: () => void;
}

export function ChatSheet({ onOpenSettings }: Props) {
	const { fullOrgEntry } = useCurrentOrg();
	const orgId = fullOrgEntry?.org._id;

	const [conversationId, setConversationId] = useState<Id<"aiConversations"> | null>(null);
	const [autoContextLoad, setAutoContextLoad] = useState(true);
	const [contextCollapsed, setContextCollapsed] = useState(false);

	const routeContext = useRouteContext();

	const { messages, conversations, isStreaming, send } = useAIChat({
		conversationId,
		routeContext,
		autoContextLoad,
	});

	const endRef = useRef<HTMLDivElement>(null);

	// Auto-scroll to bottom when new messages arrive
	useEffect(() => {
		endRef.current?.scrollIntoView({ behavior: "smooth" });
	}, []);

	const handleSend = useCallback(
		async (body: string, model?: string) => {
			if (!orgId) return;
			const result = await send(body, model);
			if (result && !conversationId) {
				setConversationId(result.conversationId);
			}
		},
		[orgId, send, conversationId],
	);

	const handleNew = useCallback(() => {
		setConversationId(null);
	}, []);

	if (!orgId) return null;

	return (
		<div className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
			{/* Header */}
			<div className="flex shrink-0 items-center gap-2 border-b border-sidebar-border px-3 py-2">
				<Bot className="size-4 text-primary shrink-0" />
				<span className="flex-1 font-semibold text-sm">AI Assistant</span>
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
			<ScrollArea className="flex-1">
				<div className="flex flex-col py-2">
					{messages.length === 0 && (
						<div className="flex flex-col items-center justify-center gap-3 px-6 py-12 text-center">
							<div className="flex size-12 items-center justify-center rounded-full bg-primary/10">
								<Bot className="size-6 text-primary" />
							</div>
							<div>
								<p className="font-medium text-sm">AI Assistant</p>
								<p className="mt-1 text-xs text-muted-foreground">
									Ask me to search records, create leads, set reminders, or
									explain your pipeline.
								</p>
							</div>
						</div>
					)}
					{messages.map((msg, i) => (
						<ChatMessage
							key={msg._id}
							message={msg}
							orgId={orgId}
							isLast={i === messages.length - 1}
						/>
					))}
					<div ref={endRef} />
				</div>
			</ScrollArea>

			{/* Composer */}
			<ChatComposer
				onSend={handleSend}
				disabled={isStreaming}
				placeholder={
					routeContext
						? `Ask about ${routeContext.name ?? routeContext.personCode}…`
						: undefined
				}
			/>
		</div>
	);
}

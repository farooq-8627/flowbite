"use client";
/**
 * core/ai/components/ChatMessage.tsx
 *
 * Renders a single chat message (user, assistant, tool, or tool-result).
 * Markdown rendered for assistant messages. Tool calls collapsed by default.
 */
import { Bot, CheckCircle2, Loader2, User, WrenchIcon, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AIMessage } from "../types";
import { ChatConfirmation } from "./ChatConfirmation";

interface ChatMessageProps {
	message: AIMessage;
	orgId: string;
	isLast?: boolean;
}

export function ChatMessage({ message, orgId, isLast }: ChatMessageProps) {
	const isUser = message.role === "user";
	const isAssistant = message.role === "assistant";
	const isTool = message.role === "tool";

	// Two-step confirmation card
	if (isTool && message.confirmationState === "pending") {
		return <ChatConfirmation message={message} orgId={orgId} />;
	}

	if (isTool) {
		const toolCalls = message.toolCalls as Array<{ name: string; status: string }> | null;
		if (!toolCalls?.length) return null;
		const tc = toolCalls[0];
		return (
			<div className="flex items-center gap-2 px-4 py-1.5 text-xs text-muted-foreground">
				<WrenchIcon className="size-3 flex-none" />
				<span className="truncate">
					{tc.status === "completed" ? (
						<CheckCircle2 className="inline size-3 text-emerald-500 me-1" />
					) : tc.status === "failed" ? (
						<XCircle className="inline size-3 text-rose-500 me-1" />
					) : null}
					{tc.name.replace(/_/g, " ")}
				</span>
			</div>
		);
	}

	if (isAssistant && message.content === "" && isLast) {
		// Streaming — show spinner
		return (
			<div className="flex items-start gap-3 px-4 py-3">
				<div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 mt-0.5">
					<Bot className="size-3.5 text-primary" />
				</div>
				<div className="flex-1 pt-1">
					<Loader2 className="size-4 animate-spin text-muted-foreground" />
				</div>
			</div>
		);
	}

	return (
		<div className={cn("flex items-start gap-3 px-4 py-3", isUser && "flex-row-reverse")}>
			<div
				className={cn(
					"flex size-7 shrink-0 items-center justify-center rounded-full mt-0.5",
					isUser ? "bg-muted" : "bg-primary/10",
				)}
			>
				{isUser ? (
					<User className="size-3.5 text-muted-foreground" />
				) : (
					<Bot className="size-3.5 text-primary" />
				)}
			</div>
			<div
				className={cn(
					"flex-1 min-w-0 rounded-[var(--radius)] px-3 py-2 text-sm",
					isUser ? "bg-muted ms-8" : "bg-background border border-border",
				)}
			>
				{message.content ? (
					<p className="whitespace-pre-wrap break-words leading-relaxed">
						{message.content}
					</p>
				) : (
					<span className="text-muted-foreground italic text-xs">Empty message</span>
				)}
				{isAssistant && message.model && (
					<p className="mt-1.5 text-[10px] text-muted-foreground/60">
						{message.model}
						{message.usageMode === "byok" ? " · 🔑" : ""}
					</p>
				)}
			</div>
		</div>
	);
}

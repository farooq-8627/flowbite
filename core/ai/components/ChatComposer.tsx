"use client";
/**
 * core/ai/components/ChatComposer.tsx
 *
 * Chat input area for the AI sidebar.
 *
 * Layout:
 *   ┌─ rounded composer card ──────────────────────────┐
 *   │  textarea (auto-grow, full width)                │
 *   │  ─────────────────────────────                   │
 *   │  [model picker]                                  │
 *   │                                          [send]  │
 *   └──────────────────────────────────────────────────┘
 *
 * Behaviour:
 *   - Enter to send, Shift+Enter for newline.
 *   - Auto-grows the textarea up to 160px tall, scrolls beyond that.
 *   - Reads the selected model from the SAME persisted preference the
 *     Settings → AI page writes to, so the two pickers stay in sync.
 */
import { ArrowUp } from "lucide-react";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { useModelPreference } from "../hooks/useModelPreference";
import { ChatModelPicker } from "./ChatModelPicker";

interface Props {
	onSend: (body: string, model?: string) => void;
	disabled?: boolean;
	placeholder?: string;
}

const MAX_HEIGHT_PX = 160;

export function ChatComposer({ onSend, disabled, placeholder }: Props) {
	// Single source of truth — same hook the settings page writes to.
	const { defaultModel } = useModelPreference();

	const [draft, setDraft] = useState("");
	const textareaRef = useRef<HTMLTextAreaElement>(null);

	function resetTextareaHeight() {
		const el = textareaRef.current;
		if (!el) return;
		el.style.height = "auto";
	}

	function handleSend() {
		const trimmed = draft.trim();
		if (!trimmed || disabled) return;
		// Always pass the freshly-read preference — never a stale local copy.
		onSend(trimmed, defaultModel);
		setDraft("");
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

	const canSend = draft.trim().length > 0 && !disabled;

	return (
		<div className="shrink-0 border-t border-sidebar-border bg-sidebar p-3">
			<div className="flex flex-col gap-2 rounded-[var(--radius)] border border-input bg-background px-3 py-2.5 shadow-xs transition-colors focus-within:border-ring">
				<textarea
					ref={textareaRef}
					value={draft}
					onChange={handleInput}
					onKeyDown={handleKeyDown}
					placeholder={placeholder ?? "Ask anything…"}
					disabled={disabled}
					rows={1}
					className="w-full resize-none bg-transparent text-sm leading-relaxed outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50"
					style={{ minHeight: 24, maxHeight: MAX_HEIGHT_PX }}
				/>

				<div className="flex items-center justify-between gap-2">
					<ChatModelPicker />

					<div className="flex items-center gap-2">
						<Button
							size="icon"
							className="size-8 shrink-0 rounded-full"
							onClick={handleSend}
							disabled={!canSend}
							aria-label="Send message"
						>
							<ArrowUp className="size-4" />
						</Button>
					</div>
				</div>
			</div>
		</div>
	);
}

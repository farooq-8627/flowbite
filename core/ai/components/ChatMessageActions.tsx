"use client";
/**
 * core/ai/components/ChatMessageActions.tsx
 *
 * Per-message hover actions row. Icons-only — labels live in the
 * `title` + `aria-label` attributes for screen readers and tooltips.
 *
 *   user message:        [edit] [copy]
 *   assistant message:   [copy] [regenerate]   ← regenerate only on the LAST turn
 *
 * The whole row is opacity-0 by default and reveals on the parent
 * `.group` hover. Timestamps are rendered separately by the parent
 * (always visible) so this component is purely action affordances.
 */
import { useMutation } from "convex/react";
import { anyApi } from "convex/server";
import { CheckCircle2, Copy, Pencil, RefreshCw } from "lucide-react";
import { useState } from "react";
import type { Id } from "@/convex/_generated/dataModel";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import type { AIMessage } from "../types";

interface Props {
	message: AIMessage;
	orgId: string;
	/** True if this is the very last message in the conversation. */
	isLast: boolean;
	/** Called when the user clicks Edit on a user message. */
	onEdit?: (m: AIMessage) => void;
}

export function ChatMessageActions({ message, orgId, isLast, onEdit }: Props) {
	const [copied, setCopied] = useState(false);
	const [regenerating, setRegenerating] = useState(false);
	const regenerate = useMutation(anyApi.ai.messages.regenerate);

	const isAssistant = message.role === "assistant";
	const isUser = message.role === "user";

	function handleCopy() {
		const txt = (message.content ?? "").replace(/\n\n_\[cancelled\]_$/, "");
		if (!txt) return;
		navigator.clipboard?.writeText(txt).then(() => {
			setCopied(true);
			setTimeout(() => setCopied(false), 1200);
		});
	}

	async function handleRegenerate() {
		setRegenerating(true);
		try {
			await regenerate({
				orgId: orgId as Id<"orgs">,
				conversationId: message.conversationId,
			});
		} catch (err) {
			toast.mutationError(err, "Couldn't regenerate the response.");
		} finally {
			setRegenerating(false);
		}
	}

	const hasContent = !!message.content && message.content.trim().length > 0;
	if (!hasContent) return null;

	return (
		<div className="inline-flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
			<IconButton
				onClick={handleCopy}
				title={copied ? "Copied!" : "Copy"}
				ariaLabel="Copy message"
			>
				{copied ? (
					<CheckCircle2 className="size-3.5 text-emerald-500" />
				) : (
					<Copy className="size-3.5" />
				)}
			</IconButton>
			{isAssistant && isLast && (
				<IconButton
					onClick={handleRegenerate}
					disabled={regenerating}
					title={regenerating ? "Regenerating…" : "Regenerate"}
					ariaLabel="Regenerate response"
				>
					<RefreshCw className={cn("size-3.5", regenerating && "animate-spin")} />
				</IconButton>
			)}
			{isUser && onEdit && (
				<IconButton
					onClick={() => onEdit(message)}
					title="Edit & resend"
					ariaLabel="Edit message"
				>
					<Pencil className="size-3.5" />
				</IconButton>
			)}
		</div>
	);
}

function IconButton({
	children,
	onClick,
	disabled,
	title,
	ariaLabel,
}: {
	children: React.ReactNode;
	onClick: () => void;
	disabled?: boolean;
	title: string;
	ariaLabel: string;
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			disabled={disabled}
			title={title}
			aria-label={ariaLabel}
			className={cn(
				"inline-flex size-6 items-center justify-center rounded-[var(--radius)]",
				"text-muted-foreground hover:text-foreground hover:bg-muted/80",
				"transition-colors",
				"disabled:cursor-default disabled:opacity-50 disabled:hover:bg-transparent",
			)}
		>
			{children}
		</button>
	);
}

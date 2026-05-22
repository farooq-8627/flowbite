"use client";
/**
 * core/ai/components/ChatContextCard.tsx
 *
 * Zero-token context card shown at the top of the chat panel when the user
 * is on an entity page. Displays the pre-computed aiContext.summary + keyFacts.
 * No LLM call — pure DB read already cached by the entity page.
 */
import { Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { RouteEntityContext } from "../types";

interface Props {
	context: RouteEntityContext;
	autoContextLoad: boolean;
	onToggleAutoLoad: () => void;
	collapsed: boolean;
	onToggleCollapsed: () => void;
}

export function ChatContextCard({
	context,
	autoContextLoad,
	onToggleAutoLoad,
	collapsed,
	onToggleCollapsed,
}: Props) {
	if (collapsed) {
		return (
			<button
				type="button"
				onClick={onToggleCollapsed}
				className="flex w-full items-center gap-2 border-b border-border bg-primary/5 px-3 py-1.5 text-xs text-primary hover:bg-primary/10 transition-colors"
			>
				<Sparkles className="size-3 flex-none" />
				<span className="truncate font-medium">
					{context.name ?? context.personCode ?? context.entityType} · context loaded
				</span>
			</button>
		);
	}

	return (
		<div className="border-b border-border bg-primary/5 px-3 py-3">
			<div className="mb-1.5 flex items-center gap-2">
				<Sparkles className="size-3.5 flex-none text-primary" />
				<span className="flex-1 truncate text-xs font-medium text-primary">
					{context.name ?? context.personCode} · {context.entityType}
					{context.personCode && (
						<span className="ms-1 text-muted-foreground font-normal">
							{context.personCode}
						</span>
					)}
				</span>
				<div className="flex items-center gap-1">
					<Button
						variant="ghost"
						size="icon"
						className="size-5"
						onClick={onToggleCollapsed}
						title="Collapse context"
					>
						<X className="size-3" />
					</Button>
				</div>
			</div>

			{context.aiContextSummary && (
				<p className="mb-1.5 text-xs leading-relaxed text-foreground line-clamp-3">
					{context.aiContextSummary}
				</p>
			)}

			{context.aiContextKeyFacts && context.aiContextKeyFacts.length > 0 && (
				<ul className="mb-2 space-y-0.5">
					{context.aiContextKeyFacts.slice(0, 4).map((fact) => (
						<li
							key={fact}
							className="text-[11px] text-muted-foreground before:content-['·'] before:me-1"
						>
							{fact}
						</li>
					))}
				</ul>
			)}

			<div className="flex items-center gap-2">
				<button
					type="button"
					onClick={onToggleAutoLoad}
					className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium transition-colors ${
						autoContextLoad
							? "bg-primary/10 text-primary"
							: "bg-muted text-muted-foreground"
					}`}
				>
					{autoContextLoad ? "Using context ✓" : "Context off"}
				</button>
			</div>
		</div>
	);
}

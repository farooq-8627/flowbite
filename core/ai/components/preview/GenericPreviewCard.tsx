"use client";
/**
 * core/ai/components/preview/GenericPreviewCard.tsx
 *
 * Fallback preview card for two-step tools that don't yet have a custom
 * layout. Renders the `{label, value}` list that `propose()` generated.
 *
 * Used by ChatConfirmation when `getPreviewCard(toolName)` returns no
 * specific card. Keeps the original (pre-Phase-3B-rich-cards) layout
 * intact so existing tools don't regress visually.
 */
import { Sparkles } from "lucide-react";
import type { PreviewCardProps } from "./index";

export function GenericPreviewCard({ fields, title }: PreviewCardProps) {
	const list = fields ?? [];
	return (
		<div className="space-y-2.5">
			{title && (
				<div className="flex items-center gap-2">
					<Sparkles className="size-3.5 text-primary" />
					<p className="font-semibold text-sm">{title}</p>
				</div>
			)}
			<dl className="space-y-1">
				{list.length === 0 ? (
					<div className="text-[11px] italic text-muted-foreground">
						(no preview details)
					</div>
				) : (
					list.map((f) => (
						<div key={f.label} className="flex gap-2 text-[11px]">
							<dt className="min-w-24 shrink-0 text-muted-foreground">{f.label}</dt>
							<dd className="min-w-0 flex-1 truncate font-medium">
								{String(f.value ?? "—")}
							</dd>
						</div>
					))
				)}
			</dl>
		</div>
	);
}

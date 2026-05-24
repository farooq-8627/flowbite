"use client";
/**
 * core/ai/components/code/CodeBlock.tsx
 *
 * Reusable code/text block with copy button + scrollbar policy.
 *
 * Visual contract (PHASE-3-AI-AUDIT.md §6 Week 1 spec 1.5b):
 *   - Rounded card with `border` + muted background.
 *   - Header bar (24px tall): label on the start, language pill optional,
 *     <CopyButton/> on the end.
 *   - Body: <pre><code>…</code></pre>. Horizontal scroll always allowed;
 *     vertical scroll only when content exceeds `maxHeight` (default 360).
 *   - Scrollbars: vertical hidden (`scrollbar-y-hidden`); horizontal stays
 *     visible because the user needs the affordance to know they can
 *     scroll right.
 *   - No line wrap by default — long lines scroll horizontally rather
 *     than wrapping (matches Claude / ChatGPT behaviour).
 *   - RTL-safe: padding via `ps-/pe-` only.
 *
 * The matching CSS lives in `app/[locale]/globals.css` under the
 * `.code-block-body` and `.code-block-body::-webkit-scrollbar` rules.
 */
import { cn } from "@/lib/utils";
import { CopyButton } from "./CopyButton";

interface Props {
	/** Raw code / text. Rendered verbatim — no markdown, no syntax highlight. */
	code: string;
	/** Optional language hint shown as a small pill ("json", "ts", "bash"). */
	language?: string;
	/** Optional left-aligned label ("args", "result", "stderr"). */
	label?: string;
	/** Maximum body height in pixels. Defaults to 360. */
	maxHeight?: number;
	/** When true, hide the copy button (e.g. for empty placeholders). */
	hideCopy?: boolean;
	className?: string;
}

export function CodeBlock({
	code,
	language,
	label,
	maxHeight = 360,
	hideCopy = false,
	className,
}: Props) {
	const showHeader = Boolean(label || language || !hideCopy);

	return (
		<div
			className={cn(
				"w-full max-w-lg min-w-0 overflow-hidden rounded-[var(--radius)] border border-border/60 bg-muted/40",
				"text-[12px] leading-relaxed",
				className,
			)}
		>
			{showHeader && (
				<div className="flex items-center justify-between gap-2 border-b border-border/50 bg-muted/60 ps-2.5 pe-1 py-1">
					<div className="flex items-center gap-2 min-w-0">
						{label && (
							<span className="truncate text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
								{label}
							</span>
						)}
						{language && (
							<span className="text-[10px] font-mono lowercase text-muted-foreground/70 px-1.5 py-0.5 rounded bg-muted">
								{language}
							</span>
						)}
					</div>
					{!hideCopy && <CopyButton value={code} />}
				</div>
			)}
			<div className="code-block-body overflow-x-auto overflow-y-auto" style={{ maxHeight }}>
				<pre className="m-0 ps-3 pe-3 py-2 text-[12px] font-mono whitespace-pre">
					<code>{code}</code>
				</pre>
			</div>
		</div>
	);
}

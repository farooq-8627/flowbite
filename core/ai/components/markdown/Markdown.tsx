"use client";
/**
 * core/ai/components/markdown/Markdown.tsx
 *
 * Markdown renderer for assistant chat bodies.
 *
 * We use [`streamdown`](https://streamdown.ai) — Vercel's official streaming-
 * aware markdown renderer (the same component AI Elements ships with). It
 * handles every edge case our homemade renderer didn't:
 *
 *   - Partial / unterminated fenced code blocks during streaming
 *   - GitHub Flavoured Markdown (tables, task lists, strikethrough)
 *   - Code syntax highlighting via Shiki
 *   - LaTeX math via KaTeX (opt-in plugin)
 *   - Mermaid diagrams (opt-in plugin)
 *   - Built-in security via rehype-harden — safe-by-default link / image /
 *     iframe filtering, so prompt-injected markdown can't escape the panel
 *
 * What we render:
 *   - Standard markdown with GFM (built into streamdown)
 *   - Inline code, fenced code with language detection
 *   - Tables, lists, blockquotes, headings
 *   - Links open in a new tab (rel="noopener noreferrer" enforced by streamdown)
 *
 * What we deliberately DON'T enable (yet):
 *   - Math / Mermaid / CJK plugins — add per-org if a use case appears.
 *
 * Sizing rules:
 *   - Outer wrapper clamps to parent width (`max-w-full min-w-0`) so a long
 *     inline code token can't push the chat sidebar wider.
 *   - Inner content uses `prose-sm` style sizing via the className prop.
 *   - Code blocks have their own scroll containers via streamdown defaults.
 */
import { Streamdown } from "streamdown";
import { cn } from "@/lib/utils";

interface Props {
	source: string;
	className?: string;
	/** True while the message is still streaming — enables animated rendering. */
	isStreaming?: boolean;
}

export function Markdown({ source, className, isStreaming }: Props) {
	return (
		<div
			className={cn(
				"max-w-full min-w-0 text-sm leading-relaxed",
				// Tailwind doesn't generate prose styles for arbitrary children
				// from streamdown; we apply the basic typography manually.
				"[&_h1]:text-base [&_h1]:font-semibold [&_h1]:mt-2",
				"[&_h2]:text-sm [&_h2]:font-semibold [&_h2]:mt-2",
				"[&_h3]:text-sm [&_h3]:font-medium [&_h3]:mt-1",
				"[&_p]:my-1 [&_p]:leading-relaxed",
				"[&_ul]:ms-4 [&_ul]:list-disc [&_ul]:space-y-0.5 [&_ul]:my-1",
				"[&_ol]:ms-4 [&_ol]:list-decimal [&_ol]:space-y-0.5 [&_ol]:my-1",
				"[&_blockquote]:border-s-2 [&_blockquote]:border-border [&_blockquote]:ps-3 [&_blockquote]:text-muted-foreground [&_blockquote]:italic",
				"[&_a]:text-primary [&_a]:underline [&_a]:underline-offset-2 hover:[&_a]:no-underline",
				"[&_:not(pre)>code]:rounded [&_:not(pre)>code]:bg-muted [&_:not(pre)>code]:px-1 [&_:not(pre)>code]:py-0.5 [&_:not(pre)>code]:font-mono [&_:not(pre)>code]:text-[12px]",
				"[&_table]:w-full [&_table]:my-2 [&_table]:border-collapse [&_table]:text-xs",
				"[&_th]:border [&_th]:border-border [&_th]:bg-muted/50 [&_th]:px-2 [&_th]:py-1 [&_th]:text-start [&_th]:font-semibold",
				"[&_td]:border [&_td]:border-border [&_td]:px-2 [&_td]:py-1",
				className,
			)}
		>
			<Streamdown animated={isStreaming} isAnimating={isStreaming}>
				{source}
			</Streamdown>
		</div>
	);
}

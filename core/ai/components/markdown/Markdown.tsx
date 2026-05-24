"use client";
import { useMemo } from "react";
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
 *   - Built-in security via rehype-harden
 *
 * Sizing rules:
 *   - The outer wrapper clamps to `100%` of its parent and uses `min-w-0`
 *     so flex / grid ancestors don't grow it past the panel edge.
 *   - Block-level descendants (`<pre>`, `<table>`, embedded media) get
 *     `max-w-full` + `overflow-x-auto` so they SCROLL inside their box
 *     instead of pushing the chat panel wider.
 *
 * Defensive markdown normalisation (2026-05-24):
 *   - Small models routinely emit a markdown table without a blank line
 *     before the closing prose. GFM then absorbs that prose into the
 *     table's last cell — see `aw3.png`. `normalizeAssistantMarkdown`
 *     scans the source, detects the boundary between a `|…|` table row
 *     and the next non-pipe line, and injects a blank line so the
 *     parser closes the table cleanly.
 *   - Same fix for the boundary between two adjacent tables that share
 *     no separator (the user's "Leads + Contacts merged into one
 *     table" report in `aw3.png` and `aw4.png`).
 */
import { Streamdown } from "streamdown";
import { cn } from "@/lib/utils";

interface Props {
	source: string;
	className?: string;
	/** True while the message is still streaming — enables animated rendering. */
	isStreaming?: boolean;
}

/**
 * True if a line looks like a markdown table row — starts with `|` and
 * contains another `|`. We accept leading whitespace so indented tables
 * are still detected.
 */
function isTableRow(line: string): boolean {
	const trimmed = line.trimStart();
	if (!trimmed.startsWith("|")) return false;
	// Any second pipe further in confirms it's a row, not a leading literal.
	return trimmed.indexOf("|", 1) !== -1;
}

/**
 * Insert blank lines around table boundaries so the GFM parser closes
 * tables cleanly. Run once per render; cheap (single linear pass over
 * the lines, no regex backtracking).
 */
export function normalizeAssistantMarkdown(source: string): string {
	if (!source) return source;
	// Skip when the source has no tables at all — common for short
	// conversational replies.
	if (source.indexOf("|") === -1) return source;

	const lines = source.split("\n");
	const out: string[] = [];
	let insideFence = false;
	let prevWasTableRow = false;

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		const trimmed = line.trim();

		// Don't touch fenced code — `|` inside ``` is literal.
		if (trimmed.startsWith("```") || trimmed.startsWith("~~~")) {
			insideFence = !insideFence;
			out.push(line);
			prevWasTableRow = false;
			continue;
		}
		if (insideFence) {
			out.push(line);
			continue;
		}

		const isRow = isTableRow(line);

		// Boundary: previous line WAS a table row, this line is NOT and
		// is non-empty. Inject a blank line to close the table.
		if (prevWasTableRow && !isRow && trimmed.length > 0) {
			out.push("");
		}

		out.push(line);
		prevWasTableRow = isRow;
	}

	return out.join("\n");
}

/**
 * P1.2 — Mid-stream polish (`PHASE-3-AI-AUDIT.md §5 Phase 4 Part 1`).
 *
 * `streamdown` already covers partial fences, GFM, Shiki, KaTeX,
 * Mermaid, and rehype-harden. The two remaining bits of mid-stream
 * jank are:
 *
 *   1. **Incomplete tables.** Once `streamdown` sees `| Foo |` it
 *      renders a 1-cell table. When `| --- |` arrives next, it
 *      reflows. When the data row arrives, it reflows again. The user
 *      sees a flickering placeholder. Defer: while the trailing
 *      contiguous block of table rows lacks a `|---|---|` separator,
 *      hide those rows.
 *
 *   2. **Mid-stream headings.** A heading like `# Section` mid-typing
 *      first renders as `<h1>S</h1>`, then `<h1>Se</h1>`, etc. Same
 *      flickering. Defer: if the LAST line of the source is a heading
 *      AND the source does not end with `\n` (= line still in
 *      progress), replace it with an empty string until the line ends.
 *
 * Pure function — no React state, no side effects. Run only when
 * streaming.
 */
export function normalizeStreamingMarkdown(source: string): string {
	if (!source) return source;
	const endsWithNewline = source.endsWith("\n");
	const lines = source.split("\n");

	// 1. Defer incomplete trailing table block.
	let firstTrailingTableRow = lines.length;
	for (let i = lines.length - 1; i >= 0; i--) {
		if (isTableRow(lines[i])) {
			firstTrailingTableRow = i;
		} else if (lines[i].trim().length === 0) {
		} else {
			break;
		}
	}
	if (firstTrailingTableRow < lines.length) {
		const trailing = lines.slice(firstTrailingTableRow);
		const hasSeparator = trailing.some((l) => /^\s*\|?\s*:?-{3,}/.test(l));
		if (!hasSeparator) {
			// Drop the trailing block — the table is too incomplete to render usefully.
			lines.length = firstTrailingTableRow;
		}
	}

	// 2. Defer in-progress trailing heading.
	if (!endsWithNewline && lines.length > 0) {
		const last = lines[lines.length - 1];
		if (/^#{1,6}\s+\S/.test(last)) {
			lines[lines.length - 1] = "";
		}
	}

	return lines.join("\n");
}

export function Markdown({ source, className, isStreaming }: Props) {
	// Mid-stream: apply `normalizeStreamingMarkdown` to defer incomplete
	// tables + half-typed headings (avoids the flicker described in
	// `PHASE-3-AI-AUDIT.md §5 P1.2`). Once streaming is complete, fall
	// back to `normalizeAssistantMarkdown` which fixes the table-boundary
	// bug we hit on 2026-05-24.
	const normalised = useMemo(
		() =>
			isStreaming ? normalizeStreamingMarkdown(source) : normalizeAssistantMarkdown(source),
		[source, isStreaming],
	);

	return (
		<div
			className={cn(
				// `w-full` not `max-w-full` so `min-w-0` actually has effect
				// inside flex parents. `overflow-x-clip` is the fail-safe so
				// even if a child still escapes, it's clipped to the panel
				// edge rather than forcing the whole page to scroll right.
				"w-full min-w-0 overflow-x-clip text-sm leading-relaxed",
				// Headings / paragraphs / lists.
				"[&_h1]:text-base [&_h1]:font-semibold [&_h1]:mt-2",
				"[&_h2]:text-sm [&_h2]:font-semibold [&_h2]:mt-2",
				"[&_h3]:text-sm [&_h3]:font-medium [&_h3]:mt-1",
				"[&_p]:my-1 [&_p]:leading-relaxed [&_p]:break-words [&_p]:[text-wrap:pretty]",
				"[&_ul]:ms-4 [&_ul]:list-disc [&_ul]:space-y-0.5 [&_ul]:my-1",
				"[&_ol]:ms-4 [&_ol]:list-decimal [&_ol]:space-y-0.5 [&_ol]:my-1",
				"[&_li]:break-words",
				"[&_blockquote]:border-s-2 [&_blockquote]:border-border [&_blockquote]:ps-3 [&_blockquote]:text-muted-foreground [&_blockquote]:italic",
				"[&_a]:text-primary [&_a]:underline [&_a]:underline-offset-2 [&_a]:break-all hover:[&_a]:no-underline",
				// Inline code.
				"[&_:not(pre)>code]:rounded [&_:not(pre)>code]:bg-muted [&_:not(pre)>code]:px-1 [&_:not(pre)>code]:py-0.5 [&_:not(pre)>code]:font-mono [&_:not(pre)>code]:text-[12px] [&_:not(pre)>code]:break-all",
				// Fenced code blocks: streamdown wraps the rendered Shiki output
				// in `<div data-streamdown="code-block">` (the outer card with
				// header + body) and `<div data-streamdown="code-block-body">`
				// (the scrollable body that contains the <pre>). Constrain BOTH
				// to the parent width and let the body scroll horizontally —
				// otherwise a long line establishes the wrapper's intrinsic
				// width and the wrapper drags the chat panel wider than the
				// viewport. The legacy `[&_pre]` rules below are kept as a
				// belt-and-braces safety net for any unwrapped <pre>.
				'[&_[data-streamdown="code-block"]]:max-w-full [&_[data-streamdown="code-block"]]:min-w-0 [&_[data-streamdown="code-block"]]:overflow-hidden',
				'[&_[data-streamdown="code-block-body"]]:max-w-full [&_[data-streamdown="code-block-body"]]:min-w-0 [&_[data-streamdown="code-block-body"]]:overflow-x-auto',
				"[&_pre]:max-w-full [&_pre]:min-w-0 [&_pre]:overflow-x-auto [&_pre]:whitespace-pre",
				"[&_pre_code]:whitespace-pre",
				// Tables: wrap via display:block so wide tables scroll
				// horizontally INSIDE the chat panel instead of breaking
				// the layout.
				"[&_table]:block [&_table]:w-full [&_table]:max-w-full [&_table]:overflow-x-auto [&_table]:my-2 [&_table]:text-xs",
				"[&_thead]:bg-muted/50",
				"[&_th]:border [&_th]:border-border [&_th]:px-2 [&_th]:py-1 [&_th]:text-start [&_th]:font-semibold [&_th]:whitespace-nowrap",
				"[&_td]:border [&_td]:border-border [&_td]:px-2 [&_td]:py-1 [&_td]:break-words",
				// Streamdown wraps tables in <div data-streamdown="table-wrapper">;
				// make sure that wrapper also scrolls inside the panel.
				'[&_[data-streamdown="table-wrapper"]]:max-w-full [&_[data-streamdown="table-wrapper"]]:min-w-0 [&_[data-streamdown="table-wrapper"]]:overflow-x-auto',
				// Images.
				"[&_img]:max-w-full [&_img]:h-auto",
				className,
			)}
		>
			<Streamdown animated={isStreaming} isAnimating={isStreaming}>
				{normalised}
			</Streamdown>
		</div>
	);
}

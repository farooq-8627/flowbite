"use client";
/**
 * core/ai/components/SourcesRail.tsx
 *
 * B.44 — surfaces the citations attached to an assistant message under the
 * prose body. Each citation chip shows a numbered marker + title (or
 * hostname when the title is missing) and opens the source URL in a new
 * tab on click. Renders nothing when the message has no `metadata.citations`
 * (the common case for CRM-only turns).
 *
 * Acceptance criteria from `Future-Enhancements.md §B.44`:
 *  - Click-through opens the source URL in a new tab.
 *  - Falls back to the existing markdown rendering when there are no
 *    citations (Groq / Mistral / NVIDIA models that don't support native
 *    web search and the user didn't trigger Firecrawl `web_search`).
 *
 * Sources used:
 *  - Anthropic web_search citations: https://docs.anthropic.com/en/docs/agents-and-tools/tool-use/web-search-tool
 *  - OpenAI Responses web_search: https://platform.openai.com/docs/guides/tools-web-search
 *  - Google Gemini grounding metadata: https://ai.google.dev/gemini-api/docs/grounding#response-metadata
 *  - AI SDK provider tools doc: https://ai-sdk.dev/providers/ai-sdk-providers/anthropic#web-search
 */

import { ExternalLink } from "lucide-react";

/**
 * Per-citation shape persisted on `aiMessages.metadata.citations` by
 * `convex/ai/runtime/host.ts` after every turn whose model used native
 * search OR our Firecrawl-backed `web_search` capability. Mirrors the
 * `Citation` type in `convex/ai/runtime/host.ts` — kept here so the UI
 * doesn't reach across the convex/ boundary for a frontend-only render.
 */
export type Citation = {
	url: string;
	title?: string;
	snippet?: string;
	source: "firecrawl" | "anthropic" | "openai" | "google";
};

interface Props {
	citations: Citation[];
}

/**
 * Best-effort hostname extractor for the chip's fallback label. Returns
 * the original string when `URL` parsing fails so we never render an
 * empty chip — defends against odd citation URLs the AI SDK / providers
 * occasionally emit (relative URLs, non-http schemes, etc.).
 */
function hostnameOf(url: string): string {
	try {
		return new URL(url).hostname.replace(/^www\./, "");
	} catch {
		return url;
	}
}

export function SourcesRail({ citations }: Props) {
	if (!citations || citations.length === 0) return null;

	return (
		<div className="mt-3 border-t border-border/50 pt-2">
			<div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">
				Sources
			</div>
			<ol className="flex flex-col gap-1">
				{citations.map((c, idx) => {
					const label = c.title?.trim() || hostnameOf(c.url);
					return (
						<li key={c.url} className="flex items-start gap-2 min-w-0">
							<span
								className="text-[10px] font-mono text-muted-foreground/80 mt-0.5 shrink-0 select-none"
								aria-hidden="true"
							>
								[{idx + 1}]
							</span>
							<a
								className="group flex flex-col gap-0.5 min-w-0 text-xs hover:bg-muted/40 rounded-[var(--radius)] px-1.5 py-1 -mx-1.5 -my-1 transition-colors"
								href={c.url}
								target="_blank"
								rel="noopener noreferrer"
								aria-label={`Open source [${idx + 1}] — ${label}`}
							>
								<span className="flex items-center gap-1 min-w-0">
									<span className="truncate font-medium text-foreground">
										{label}
									</span>
									<ExternalLink
										aria-hidden="true"
										className="size-3 shrink-0 text-muted-foreground/60 group-hover:text-muted-foreground transition-colors"
									/>
								</span>
								<span className="truncate text-[10px] text-muted-foreground/70">
									{hostnameOf(c.url)}
								</span>
								{c.snippet && (
									<span className="line-clamp-2 text-[11px] text-muted-foreground/80 leading-snug mt-0.5">
										{c.snippet}
									</span>
								)}
							</a>
						</li>
					);
				})}
			</ol>
		</div>
	);
}

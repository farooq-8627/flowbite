"use node";
/**
 * convex/ai/actions/webScrape.ts
 *
 * Stage 9 of `/SPRINT-PLAN.md` — Creative layer / web grounding.
 *
 * Pairs with the existing `web_search` tool (`convex/ai/webSearchAction.ts`).
 * Where `web_search` returns {title, url, description} triples,
 * `web_scrape` fetches the actual page contents from a single URL so
 * the model can ground a draft / answer in a real source.
 *
 * Provider: Firecrawl `/v1/scrape`. We isolate the `@mendable/firecrawl-js`
 * Node-only dependency in this action; the V8 tool layer talks to it
 * via `ctx.runAction`. Same pattern as the existing webSearchAction.
 *
 * Auth: this is an `internalAction`, only callable from the orchestrator
 * via `ctx.runAction`. The tool itself enforces `ai.use` permission
 * upstream + a 30/min rate limit on the (userId, orgId) pair.
 *
 * Behaviour:
 *   - When `FIRECRAWL_API_KEY` is unset, return `WEB_SCRAPE_NOT_CONFIGURED`.
 *   - On 401 / 429 / 5xx, return a clean structured error so the model
 *     can apologise instead of looping.
 *   - Truncate content at `maxChars` (default 8000) so we don't blow
 *     the context window with a 200KB page.
 *
 * Cost class on the calling tool: `normal` (~$0.001 per scrape via
 * Firecrawl).
 */

import Firecrawl from "@mendable/firecrawl-js";
import { v } from "convex/values";
import { internalAction } from "../../_generated/server";

export const SCRAPE_DEFAULT_MAX_CHARS = 8000;
export const SCRAPE_HARD_MAX_CHARS = 32000;

export type ScrapeResult =
	| {
			ok: true;
			url: string;
			title?: string;
			contentMarkdown: string;
			links?: string[];
			lengthChars: number;
			truncated: boolean;
	  }
	| { ok: false; error: string; code: string };

/**
 * Pure URL validator extracted so tests can exercise the WEB_SCRAPE_BAD_URL
 * + WEB_SCRAPE_NOT_CONFIGURED gates without invoking the "use node"
 * action (convex-test can't run "use node" modules in its V8 sandbox).
 *
 * Returns null when valid; returns a ready-to-emit error envelope when
 * invalid. The action also calls this so the validation logic is the
 * single source of truth.
 */
export function validateScrapeUrl(url: string): { ok: false; error: string; code: string } | null {
	try {
		const parsed = new URL(url);
		if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
			return {
				ok: false,
				error: "Only http(s) URLs can be scraped.",
				code: "WEB_SCRAPE_BAD_URL",
			};
		}
	} catch {
		return {
			ok: false,
			error: `Not a valid URL: ${url.slice(0, 100)}`,
			code: "WEB_SCRAPE_BAD_URL",
		};
	}
	return null;
}

export function checkScrapeConfigured(
	apiKey: string | undefined,
): { ok: false; error: string; code: string } | null {
	if (!apiKey) {
		return {
			ok: false,
			error: "Web scrape is not configured for this deployment. Ask the workspace admin to set FIRECRAWL_API_KEY.",
			code: "WEB_SCRAPE_NOT_CONFIGURED",
		};
	}
	return null;
}

export const runWebScrape = internalAction({
	args: {
		url: v.string(),
		mode: v.optional(v.union(v.literal("markdown"), v.literal("text"), v.literal("links"))),
		maxChars: v.optional(v.number()),
	},
	handler: async (_ctx, args): Promise<ScrapeResult> => {
		const key = process.env.FIRECRAWL_API_KEY;
		const notConfigured = checkScrapeConfigured(key);
		if (notConfigured) return notConfigured;

		const badUrl = validateScrapeUrl(args.url);
		if (badUrl) return badUrl;

		const mode = args.mode ?? "markdown";
		const maxChars = Math.max(
			1000,
			Math.min(SCRAPE_HARD_MAX_CHARS, args.maxChars ?? SCRAPE_DEFAULT_MAX_CHARS),
		);

		try {
			const fc = new Firecrawl({ apiKey: key });
			// Firecrawl v2 surface: scrape(url, options) returns
			// { markdown?, html?, links?, metadata }. Stick to the markdown
			// + links surface — it's what the model can ground on.
			// biome-ignore lint/suspicious/noExplicitAny: Firecrawl SDK types are loose
			const formats: any[] = mode === "links" ? ["links", "markdown"] : ["markdown", "links"];
			// biome-ignore lint/suspicious/noExplicitAny: Firecrawl SDK return is dynamic
			const res = (await fc.scrape(args.url, { formats })) as any;

			const rawMarkdown =
				typeof res?.markdown === "string"
					? res.markdown
					: typeof res?.data?.markdown === "string"
						? res.data.markdown
						: "";
			const links: string[] = Array.isArray(res?.links)
				? res.links.filter((l: unknown): l is string => typeof l === "string")
				: Array.isArray(res?.data?.links)
					? res.data.links.filter((l: unknown): l is string => typeof l === "string")
					: [];
			const title: string | undefined =
				(typeof res?.metadata?.title === "string" ? res.metadata.title : undefined) ??
				(typeof res?.data?.metadata?.title === "string"
					? res.data.metadata.title
					: undefined);

			const contentMarkdown =
				rawMarkdown.length > maxChars ? `${rawMarkdown.slice(0, maxChars)}…` : rawMarkdown;
			const truncated = rawMarkdown.length > maxChars;

			return {
				ok: true,
				url: args.url,
				title,
				contentMarkdown,
				links: mode === "links" || mode === "markdown" ? links.slice(0, 50) : undefined,
				lengthChars: contentMarkdown.length,
				truncated,
			};
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			// Best-effort status mapping; Firecrawl SDK throws Error subclasses.
			const lower = message.toLowerCase();
			let code = "WEB_SCRAPE_FAILED";
			if (lower.includes("401") || lower.includes("unauthor"))
				code = "WEB_SCRAPE_UNAUTHORIZED";
			else if (lower.includes("429") || lower.includes("rate"))
				code = "WEB_SCRAPE_RATE_LIMITED";
			else if (lower.includes("404") || lower.includes("not found"))
				code = "WEB_SCRAPE_NOT_FOUND";
			else if (lower.includes("500") || lower.includes("502") || lower.includes("503"))
				code = "WEB_SCRAPE_PROVIDER_ERROR";
			return {
				ok: false,
				error: `Web scrape failed: ${message.slice(0, 240)}`,
				code,
			};
		}
	},
});

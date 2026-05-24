/**
 * convex/ai/tools/webSearch.ts
 *
 * Phase 4 Part 2 — Always-on `web_search` tool. Lets the chat answer
 * questions whose answers are NOT in the workspace ("what's happening
 * in the SaaS market today?", "lookup the company's news").
 *
 * Pattern mirrors `tools/search.ts` (Convex CRM search). The Firecrawl
 * call lives in `convex/ai/webSearchAction.ts` (Node-only) and is
 * dispatched via `ctx.runAction`.
 *
 * Behaviour:
 *   - When `FIRECRAWL_API_KEY` is unset, the tool returns a clean
 *     `WEB_SEARCH_NOT_CONFIGURED` error so the model can apologise
 *     instead of looping.
 *   - Permissions: `ai.use` (anyone with chat access). No PII leaves
 *     the workspace beyond the user's literal query string.
 *   - Cap: 5 results / call (max 10). Each result is `{ title, url,
 *     description }` only — we never crawl the page bodies (that
 *     belongs in a deeper "fetch_url" tool the model can opt into
 *     later).
 */
import { z } from "zod";
import { internal } from "../../_generated/api";
import { registerTool } from "../toolRegistry";
import { coerceInt, runTool, type ToolContext } from "./_shared";

let _ctx: ToolContext | null = null;
export function setWebSearchToolContext(c: ToolContext): void {
	_ctx = c;
}
function getCtx(): ToolContext {
	if (!_ctx) throw new Error("web search ctx not bound");
	return _ctx;
}

registerTool({
	name: "web_search",
	layer: "always",
	permission: "ai.use",
	confirmation: "none",
	description: `
Search the public web via Firecrawl. Use when the user asks for
information that is NOT in the workspace data — market news, public
company information, recent events, definitions of unfamiliar terms,
research for a sales talk-track. Don't use this for CRM lookups —
use search_crm / get_entity_detail instead.

Returns a short list of {title, url, description}. The model should
synthesise an answer + cite the URLs as sources rather than restating
result snippets verbatim.
	`.trim(),
	instruction: {
		whenToCall:
			"User asks about the public web — market news, a company's recent press, definitions, anything outside the CRM.",
		whenNotToCall:
			"the question can be answered from the workspace (call search_crm / get_entity_detail) OR is opinion / advice (answer from your own knowledge).",
		requiredClarifications: ["query"],
		synonyms: [
			"google",
			"look up online",
			"search the web",
			"find an article",
			"what's the latest",
		],
		goodExample: {
			description: "User: 'What's the latest news on Stripe's pricing?'",
			args: { query: "Stripe pricing changes 2026", limit: 5 },
		},
		badExample: {
			description: "User: 'Find me a contact named Sarah.'",
			args: { query: "Sarah", limit: 5 },
			whyBad: "That's a CRM lookup. Use search_crm.",
		},
	},
	runbook: {
		onSuccess:
			"Synthesise a concise answer that cites the result URLs. Don't dump raw snippets — paraphrase + link.",
		onEmpty: "Tell the user the search returned nothing useful and offer to refine the query.",
		onValidationError:
			"If query was empty or malformed, ask the user for a clearer search term.",
	},
	example: { query: "Convex pricing 2026", limit: 5 },
	schema: z.object({
		query: z.string().min(2).max(300).describe("Search query (2–300 chars)."),
		limit: coerceInt((n) => n.int().min(1).max(10).default(5).catch(10)).optional(),
	}),
	execute: async ({ query, limit }) =>
		runTool(async () => {
			const tc = getCtx();
			const result = (await tc.ctx.runAction(internal.ai.webSearchAction.runWebSearch, {
				query,
				limit,
			})) as
				| {
						ok: true;
						results: Array<{ title: string; url: string; description: string }>;
						query: string;
				  }
				| { ok: false; error: string; code: string };

			if (!result.ok) {
				return { ok: false as const, error: result.error, code: result.code };
			}
			return {
				ok: true as const,
				data: {
					query: result.query,
					count: result.results.length,
					results: result.results,
				},
				display: {
					kind: "text" as const,
					text:
						result.results.length === 0
							? `No web results for "${query}".`
							: `Found ${result.results.length} web result(s) for "${query}".`,
				},
			};
		}),
});

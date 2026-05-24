"use node";
/**
 * convex/ai/webSearchAction.ts
 *
 * Phase 4 Part 2 — Web search internal action for the chat tool.
 *
 * Wraps Firecrawl's `search()` so the always-on `web_search` tool can call
 * it from inside the orchestrator's internalAction. Keeps the Node-only
 * dependency (`@mendable/firecrawl-js`) isolated from the V8 runtime where
 * the rest of the AI tool layer runs.
 *
 * Auth: this is an `internalAction`, only callable from the orchestrator
 * via `ctx.runAction`. The tool itself enforces `ai.use` permission
 * upstream.
 *
 * Cost: ~$0.005 per Firecrawl search call. Quota / rate limiting is
 * tracked via the existing `aiToolEvents` telemetry pipeline.
 */
import Firecrawl from "@mendable/firecrawl-js";
import { v } from "convex/values";
import { internalAction } from "../_generated/server";

export const runWebSearch = internalAction({
	args: {
		query: v.string(),
		limit: v.optional(v.number()),
	},
	handler: async (
		_ctx,
		args,
	): Promise<
		| {
				ok: true;
				results: Array<{ title: string; url: string; description: string }>;
				query: string;
		  }
		| { ok: false; error: string; code: string }
	> => {
		const key = process.env.FIRECRAWL_API_KEY;
		if (!key) {
			return {
				ok: false as const,
				error: "Web search is not configured for this deployment. Ask the workspace admin to set FIRECRAWL_API_KEY.",
				code: "WEB_SEARCH_NOT_CONFIGURED",
			};
		}

		try {
			const fc = new Firecrawl({ apiKey: key });
			const limit = Math.max(1, Math.min(10, args.limit ?? 5));
			const res = await fc.search(args.query, { limit, sources: ["web"] });
			const web = ((res?.web ?? []) as Array<Record<string, unknown>>).map((r) => ({
				title: typeof r.title === "string" ? r.title : "",
				url: typeof r.url === "string" ? r.url : "",
				description:
					"description" in r && typeof r.description === "string" ? r.description : "",
			}));
			return { ok: true as const, results: web, query: args.query };
		} catch (err) {
			return {
				ok: false as const,
				error: `Web search failed: ${String(err).slice(0, 200)}`,
				code: "WEB_SEARCH_FAILED",
			};
		}
	},
});

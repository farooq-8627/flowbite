/**
 * convex/ai/tools/creative/webScrape.ts
 *
 * Stage 9 of `/SPRINT-PLAN.md` — Creative layer / web grounding.
 *
 * `web_scrape` (atomic, costClass `normal`): fetches the contents of a
 * single URL via Firecrawl's `/v1/scrape`. Pairs with the existing
 * `web_search` tool — typical flow:
 *
 *   1. `web_search { query }` → returns 5 result URLs.
 *   2. Model picks the most relevant URL.
 *   3. `web_scrape { url }` → returns the page contents as Markdown
 *      so the model can ground the next draft / answer in real text.
 *
 * Auth: `ai.use` (anyone with chat access). The scrape itself doesn't
 * leak workspace data — only the model's URL choice. We do NOT include
 * the user's CRM data in the request body.
 *
 * Limits:
 *   - 30/min/user via `enforceRateLimit`. Firecrawl pricing kicks in
 *     well above that; the rate-limit is the cheap pre-cap.
 *   - `maxChars` default 8000, hard cap 32000 — protects the LLM
 *     context window when a page is huge.
 *
 * Lives in the `creative` layer (with the drafting tools) because the
 * primary use case is grounding LLM-generated drafts.
 */

import { z } from "zod";
import { internal } from "../../../_generated/api";
import { registerTool } from "../../toolRegistry";
import { coerceInt, requirePermission, runTool, toolMutation } from "../_shared";
import { getCreativeCtx } from "./_context";

registerTool({
	name: "web_scrape",
	layer: "creative",
	permission: "ai.use",
	confirmation: "none",
	costClass: "normal",
	description: "Stub — overridden by buildToolDescription via instruction.",
	instruction: {
		whenToCall:
			"Use to fetch the contents of a SPECIFIC URL when grounding a draft / answer in a real source. Typical flow: web_search returns URLs → pick the best one → web_scrape it for the page text.",
		whenNotToCall:
			"Don't use when the user asks a search / lookup question (use web_search). Don't use to fetch a CRM record (use search_crm + get_entity_detail). Don't use to summarise a conversation (use summarise_conversation).",
		preflight: ["web_search"],
		requiredClarifications: ["url"],
		synonyms: [
			"scrape a page",
			"read this URL",
			"fetch the content of",
			"get the article text",
			"open the link",
		],
		goodExample: {
			description:
				"After web_search returned a Stripe pricing page URL, the model fetches it.",
			args: { url: "https://stripe.com/pricing", mode: "markdown" },
		},
		badExample: {
			description: "User: 'What does the company do?' (about a CRM contact)",
			args: { url: "https://acme.example/about" },
			whyBad: "We have aiContext on the contact + can call enrich_record. Don't burn a Firecrawl call to learn what's already in the workspace.",
		},
	},
	runbook: {
		onSuccess:
			"Synthesise a concise answer / draft FROM the page contents. Cite the URL as a source. Don't dump raw Markdown — paraphrase + link.",
		onValidationError:
			"If the URL is malformed, ask the user to confirm the link. Never retry with the same args.",
		onPermissionDenied:
			"Tell the user they need ai.use to scrape pages. Suggest contacting an admin.",
	},
	example: { url: "https://example.com" },
	schema: z.object({
		url: z
			.string()
			.url({ message: "Must be a valid http(s) URL." })
			.describe("Absolute URL to scrape (http or https)."),
		mode: z
			.enum(["markdown", "text", "links"])
			.default("markdown")
			.describe(
				"What to extract. 'markdown' (default) returns the page as Markdown; 'text' is plain prose; 'links' returns a list of links.",
			),
		maxChars: coerceInt((n) => n.int().min(1000).max(32000).default(8000)).optional(),
	}),
	execute: async ({ url, mode, maxChars }) =>
		runTool(async () => {
			const tc = getCreativeCtx();
			requirePermission(tc.permissions, "ai.use");

			// Light rate limit — 30/min/user. Below the per-org Firecrawl
			// quota; well above any sane chat cadence.
			await toolMutation(tc, "ai/creativeHelpers:enforceWebScrapeRateLimit", {
				orgId: tc.orgId,
			});

			const result = (await tc.ctx.runAction(internal.ai.actions.webScrape.runWebScrape, {
				url,
				mode,
				maxChars,
			})) as
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

			if (!result.ok) {
				return { ok: false as const, error: result.error, code: result.code };
			}

			const preview =
				result.contentMarkdown.length > 600
					? `${result.contentMarkdown.slice(0, 600)}…`
					: result.contentMarkdown;

			return {
				ok: true as const,
				data: result,
				summary: {
					headline: result.title ? `Scraped: ${result.title}` : `Scraped ${result.url}`,
					table: [
						{ label: "URL", value: result.url },
						...(result.title ? [{ label: "Title", value: result.title }] : []),
						{ label: "Length", value: `${result.lengthChars} chars` },
						...(result.truncated
							? [
									{
										label: "Truncated",
										value: "Yes — increase maxChars if you need more.",
									},
								]
							: []),
						{ label: "Preview", value: preview },
						...(result.links && result.links.length > 0
							? [
									{
										label: `Links (${Math.min(result.links.length, 10)})`,
										value: result.links.slice(0, 10).join("\n"),
									},
								]
							: []),
					],
				},
				display: {
					kind: "text" as const,
					text: result.contentMarkdown,
				},
			};
		}),
});

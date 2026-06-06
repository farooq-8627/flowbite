/**
 * Creative capabilities — the AI-callable surface for LLM-backed
 * drafting + scraping. Wraps the existing `internalAction`s under
 * `convex/ai/actions/`; the actions are `"use node"` so the
 * capability runs inside the runtime host's action context (which
 * has `runAction`).
 *
 * Surface (4 caps in the `creative` group):
 *
 *   draft_message            outbound message draft (follow-up / thank-you / custom)
 *   draft_proposal           deal proposal draft (sectioned markdown)
 *   summarise_conversation   extract decisions + action-items from a thread
 *   web_scrape               fetch + clean a URL via Firecrawl
 *
 * Group invariants (mirrored in the playbook below):
 *
 *   1. Every creative cap is QUOTA-GATED implicitly via the underlying
 *      action's model picker (BYOK → platform → env). When no key is
 *      configured the action returns a deterministic fallback the
 *      capability surfaces unchanged.
 *   2. Drafting NEVER auto-sends. The result envelope carries
 *      `suggestedSendMessageArgs` which the chat UI exposes as a
 *      "Send" button — the user reviews before commit.
 *   3. Risk: `reversible` for drafts (they don't write user-visible
 *      rows; the draft is returned inline). `safe` for web_scrape
 *      (no DB write at all).
 *   4. Permission: every cap requires `ai.use`. The legacy approval
 *      tier (free / starter / pro) was the V1 model; V2 uses the
 *      runtime's quota gate (`orchestrator/quotaGate.ts`) per turn.
 */
import { z } from "zod";
import { internal } from "../../_generated/api";
import { defineCapability } from "../registry/define";
import { defineGroup } from "../registry/groups";
import { failed, ok } from "../registry/result";

// ─── Closed unions ──────────────────────────────────────────────────────────

const DRAFT_INTENT = z.enum(["follow-up", "thank-you", "custom"]);
const DRAFT_TARGET_KIND = z.enum(["person", "deal", "company"]);
const SCRAPE_MODE = z.enum(["markdown", "text", "links"]);

// ─── Group playbook ─────────────────────────────────────────────────────────

defineGroup({
	name: "creative",
	playbook: `Read first → \`describe_entity\` for the target's facts before drafting; \`list_messages\` for prior context. Keep drafting NEVER auto-sends — the user reviews before commit.

Draft a message → \`draft_message\` with target (person / deal / company), intent (follow-up / thank-you / custom), optional customPrompt. Returns a body + channel + \`suggestedSendMessageArgs\` the chat UI surfaces as a Send button.

Draft a proposal → \`draft_proposal\` with the dealCode + optional customInstructions. Returns sectioned markdown ready for the user to refine + send.

Summarise → \`summarise_conversation\` against an array of message records (body / authorType / createdAt). Returns decisions, openQuestions, actionItems. Use after a long thread to capture the next steps.

Scrape → \`web_scrape\` fetches + cleans a URL via Firecrawl. Modes: \`markdown\` (default), \`text\`, \`links\`. URL must be http(s); robots.txt is honoured by Firecrawl.

Search → \`web_search\` runs a free-form public-web query and returns up to 10 {title, url, description} triples (Firecrawl-backed). On models that support it (Claude / GPT / Gemini), the model may also use a native server-side search inline — both surfaces feed the same downstream \`web_scrape\` flow. Always cite URLs you cite; never fabricate one.

Quota: every creative call is metered. The deterministic fallback ships when no model key is configured — drafts still appear, just without LLM polish.`,
});

// ─── draft_message ──────────────────────────────────────────────────────────

const draftMessage = defineCapability<{
	target: { kind: "person" | "deal" | "company"; code: string; displayName: string };
	intent: "follow-up" | "thank-you" | "custom";
	customPrompt?: string;
}>({
	name: "draft_message",
	module: "creative",
	group: "creative",
	permission: "ai.use",
	risk: "reversible",
	channels: ["chat", "mcp", "rest"],
	spec: {
		whenToCall:
			"Draft an outbound message to a person / deal / company. Pass `intent: 'follow-up' | 'thank-you' | 'custom'` and the target's display name + code. The draft is RETURNED inline — never auto-sent. Use `customPrompt` to pass user-supplied context for the `custom` intent.",
		whenNotToCall:
			"the user wants to SEND immediately — use send_message directly. The user wants a PROPOSAL — use draft_proposal.",
		requiredClarifications: ["target", "intent"],
		synonyms: ["draft message", "compose message", "write follow-up", "write thank-you"],
		goodExample: {
			target: { kind: "person", code: "P-007", displayName: "Sarah Khan" },
			intent: "follow-up",
		},
	},
	drive: {
		onSuccess: "Surface the draft + the suggested-send args. Don't auto-send.",
	},
	input: z.object({
		target: z.object({
			kind: DRAFT_TARGET_KIND,
			code: z.string().min(1),
			displayName: z.string().min(1),
		}),
		intent: DRAFT_INTENT,
		customPrompt: z.string().max(2000).optional(),
	}),
	run: async (cap, args) => {
		const { ctx, principal } = cap;
		const result = (await ctx.runAction(internal.ai.actions.draftMessage.run, {
			orgId: principal.orgId,
			userId: principal.userId,
			target: args.target,
			intent: args.intent,
			customPrompt: args.customPrompt,
		})) as {
			draft: {
				subject?: string;
				body: string;
				channel: string;
				suggestedSendMessageArgs: unknown;
			};
			modelUsed: string;
		};
		return ok({
			headline: `Draft for ${args.target.displayName} (${args.target.code}).`,
			facts: [result.draft.body],
			data: { ...result, target: args.target, intent: args.intent },
			suggestedNext: [
				{
					label: "Send this draft",
					intent: `Send the draft we just generated to ${args.target.code}`,
				},
			],
		});
	},
});

// ─── draft_proposal ─────────────────────────────────────────────────────────

const draftProposal = defineCapability<{
	dealCode: string;
	customInstructions?: string;
}>({
	name: "draft_proposal",
	module: "creative",
	group: "creative",
	permission: "ai.use",
	risk: "reversible",
	channels: ["chat", "mcp", "rest"],
	spec: {
		whenToCall:
			"Draft a structured proposal for a deal. Reads the deal + counterparty, returns a multi-section markdown draft. Pass `customInstructions` to bias tone / scope (e.g. 'emphasise security').",
		whenNotToCall:
			"the user wants a short message — use draft_message. The deal hasn't been created yet — call create_deal first.",
		requiredClarifications: ["dealCode"],
		synonyms: ["draft proposal", "write proposal", "deal proposal", "quote"],
		goodExample: { dealCode: "D-007" },
	},
	drive: {
		onSuccess:
			"Surface the deal context (dealCode → counterparty) + the proposal markdown. Don't auto-send.",
	},
	input: z.object({
		dealCode: z.string().min(1),
		customInstructions: z.string().max(2000).optional(),
	}),
	run: async (cap, args) => {
		const { ctx, principal } = cap;
		try {
			const result = (await ctx.runAction(internal.ai.actions.draftProposal.run, {
				orgId: principal.orgId,
				userId: principal.userId,
				dealCode: args.dealCode,
				customInstructions: args.customInstructions,
			})) as {
				draft: { bodyMarkdown: string };
				modelUsed: string;
				dealCode: string;
				dealTitle: string;
				counterparty: string;
			};
			return ok({
				headline: `Proposal for ${result.dealCode} → ${result.counterparty}.`,
				facts: [result.draft.bodyMarkdown],
				data: result,
			});
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			if (message.includes("not found") || message.includes("not accessible")) {
				return failed("not_found", `Deal ${args.dealCode} not found or not accessible.`);
			}
			return failed("business_error", message);
		}
	},
});

// ─── summarise_conversation ─────────────────────────────────────────────────

const summariseConversation = defineCapability<{
	messages: Array<{
		body: string;
		authorType: string;
		authorName?: string;
		createdAt: number;
	}>;
}>({
	name: "summarise_conversation",
	module: "creative",
	group: "creative",
	permission: "ai.use",
	risk: "reversible",
	channels: ["chat", "mcp", "rest"],
	spec: {
		whenToCall:
			"Summarise a thread / activity transcript into decisions, open questions, and action items. Pass an array of message records (body / authorType / createdAt). Capped at the most-recent 50 messages.",
		whenNotToCall:
			"the user wants a per-deal retrospective — call analyse_deal_close (out of v1 surface; the action exists internally but isn't yet ported).",
		requiredClarifications: ["messages"],
		synonyms: ["summarise conversation", "summarize chat", "extract decisions"],
		goodExample: {
			messages: [
				{ body: "Reviewed the proposal", authorType: "user", createdAt: 1730000000000 },
			],
		},
	},
	drive: {
		onSuccess:
			"Surface decisions + open questions + action items. The card carries the full structured summary.",
	},
	input: z.object({
		messages: z
			.array(
				z.object({
					body: z.string().min(1),
					authorType: z.string().min(1),
					authorName: z.string().optional(),
					createdAt: z.number().int(),
				}),
			)
			.min(1)
			.max(200),
	}),
	run: async (cap, args) => {
		const { ctx, principal } = cap;
		const result = (await ctx.runAction(internal.ai.actions.summariseConversation.run, {
			orgId: principal.orgId,
			userId: principal.userId,
			messages: args.messages,
		})) as {
			summary: {
				summary: string;
				bullets: string[];
				agreements: string[];
				openQuestions: string[];
				actionItems: Array<{ body: string; suggestedDueDate?: string }>;
			};
			modelUsed: string;
			messageCount: number;
		};
		return ok({
			headline: `Summary of ${result.messageCount} message${result.messageCount === 1 ? "" : "s"}.`,
			facts: [result.summary.summary, ...result.summary.bullets.slice(0, 3)],
			data: result,
			suggestedNext: result.summary.actionItems.slice(0, 3).map((a) => ({
				label: a.body.slice(0, 60),
				intent: a.body,
			})),
		});
	},
});

// ─── web_scrape ─────────────────────────────────────────────────────────────

const webScrape = defineCapability<{
	url: string;
	mode?: "markdown" | "text" | "links";
	maxChars?: number;
}>({
	name: "web_scrape",
	module: "creative",
	group: "creative",
	permission: "ai.use",
	risk: "safe",
	channels: ["chat", "mcp", "rest"],
	spec: {
		whenToCall:
			"Fetch a URL and return clean text / markdown / links. Pass `mode: 'markdown' | 'text' | 'links'`. Hard-capped at 32KB output. Requires `FIRECRAWL_API_KEY` deployment env.",
		whenNotToCall:
			"the user wants to attach a file — use the upload flow (browser-only). The URL is private (no public crawl) — Firecrawl will surface a friendly failure.",
		requiredClarifications: ["url"],
		synonyms: ["scrape", "fetch URL", "read website", "summarise webpage"],
		goodExample: { url: "https://example.com/about", mode: "markdown" },
		badExample: {
			args: { url: "ftp://example.com" },
			why: "URL must be http(s).",
		},
	},
	drive: {
		onSuccess: "Surface the fetched content + any title; don't echo more than ~1KB inline.",
		onValidationError:
			"If FIRECRAWL_API_KEY is not configured, the action returns a clear admin-only error — surface it plainly.",
	},
	input: z.object({
		url: z.string().url(),
		mode: SCRAPE_MODE.optional(),
		maxChars: z.number().int().min(1000).max(32_000).optional(),
	}),
	run: async (cap, args) => {
		const { ctx } = cap;
		const result = (await ctx.runAction(internal.ai.actions.webScrape.runWebScrape, {
			url: args.url,
			mode: args.mode,
			maxChars: args.maxChars,
		})) as
			| {
					ok: false;
					code: string;
					error: string;
			  }
			| {
					ok: true;
					contentMarkdown?: string;
					title?: string;
					links?: string[];
			  };
		if (!result.ok) {
			return failed("business_error", result.error);
		}
		const headline = result.title ? `Scraped: ${result.title}` : `Scraped: ${args.url}`;
		const preview = result.contentMarkdown?.slice(0, 1000) ?? "";
		return ok({
			headline,
			facts: preview ? [preview] : undefined,
			data: result,
		});
	},
});

// ─── web_search ─────────────────────────────────────────────────────────────

const webSearch = defineCapability<{
	query: string;
	limit?: number;
}>({
	name: "web_search",
	module: "creative",
	group: "creative",
	permission: "ai.use",
	risk: "safe",
	channels: ["chat", "mcp", "rest"],
	spec: {
		whenToCall:
			"Search the public web for live facts the workspace doesn't know — recent news, competitor pricing, public-company snippets, addresses, social profiles. Returns up to 10 {title, url, description} triples. Pair with `web_scrape` to read a specific URL in full. Powered by Firecrawl (deterministic, structured) on every provider; on Anthropic / OpenAI Responses / Gemini, the model may ALSO use a native server-side search tool inline.",
		whenNotToCall:
			"the data lives in the workspace already — call `search_crm` / `describe_entity` / `read_conversation` first; web_search is for facts the model has no other way to learn. The user wants to read ONE specific URL — call `web_scrape` directly. The query is a code (P-001 / D-001) — that's an internal CRM lookup, not a web search.",
		requiredClarifications: ["query"],
		synonyms: ["search the web", "google", "look online", "find on the internet"],
		goodExample: { query: "Acme Corp recent funding round", limit: 5 },
		badExample: {
			args: { query: "P-007" },
			why: "Codes never appear on the public web. Use search_crm for internal records.",
		},
	},
	drive: {
		onSuccess:
			"Surface the top 1-3 results with title + 1-line excerpt; cite the URL. If a result looks promising, follow up with `web_scrape` for the full page before grounding any claim. Never fabricate a URL.",
		onEmpty:
			"Tell the user the search returned nothing. Offer to broaden the query (drop quoted phrases / add synonyms).",
		onValidationError:
			"If the action returns `WEB_SEARCH_NOT_CONFIGURED`, surface the admin-only message verbatim — the workspace owner needs to set FIRECRAWL_API_KEY in Convex env.",
	},
	input: z.object({
		query: z
			.string()
			.min(2)
			.max(300)
			.describe("Free-form web search query (e.g. 'Acme Corp recent funding')."),
		limit: z
			.number()
			.int()
			.min(1)
			.max(10)
			.optional()
			.default(5)
			.describe("Max results (1-10). Default 5."),
	}),
	run: async (cap, args) => {
		const { ctx } = cap;
		const result = (await ctx.runAction(internal.ai.webSearchAction.runWebSearch, {
			query: args.query,
			limit: args.limit ?? 5,
		})) as
			| {
					ok: true;
					query: string;
					results: Array<{ title: string; url: string; description: string }>;
			  }
			| { ok: false; error: string; code: string };

		if (!result.ok) {
			return failed("business_error", result.error);
		}
		const count = result.results.length;
		if (count === 0) {
			return ok({
				headline: `No web results for "${args.query}".`,
				facts: [
					"Try broader terms, drop quoted phrases, or remove site: filters.",
					"For workspace records use search_crm instead.",
				],
				data: { query: args.query, results: [] },
			});
		}
		// Surface up to 3 lines as facts so the chat card renders without
		// echoing every URL inline. Full payload stays on `data` for the
		// model to ground its answer.
		const preview = result.results.slice(0, 3).map((r) => {
			const desc =
				r.description.length > 140 ? `${r.description.slice(0, 140)}…` : r.description;
			return `${r.title} — ${desc} (${r.url})`;
		});
		return ok({
			headline: `${count} web result${count === 1 ? "" : "s"} for "${args.query}".`,
			facts: preview,
			data: { query: args.query, results: result.results },
			suggestedNext: result.results.slice(0, 3).map((r) => ({
				label: `Read: ${r.title.slice(0, 60)}`,
				intent: `Scrape ${r.url}`,
			})),
		});
	},
});

// ─── Public surface ─────────────────────────────────────────────────────────

export const CREATIVE_CAPABILITIES = [
	draftMessage,
	draftProposal,
	summariseConversation,
	webScrape,
	webSearch,
];

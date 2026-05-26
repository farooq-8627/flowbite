"use node";
/**
 * convex/ai/actions/draftProposal.ts
 *
 * Stage 9 of `/SPRINT-PLAN.md` — Creative layer.
 *
 * Subagent that turns a deal into a structured proposal Markdown
 * document. Input: a `dealCode`. Output: `{title, sections[], bodyMarkdown}`
 * which the `commit_draft_proposal` tool wraps in a ToolSummary card so
 * the user can copy / save-as-note / pass to send_message themselves.
 *
 * The proposal is NEVER persisted by the AI — drafts are ephemeral.
 *
 * Pipeline:
 *
 *   1. Resolve deal + linked company + primary person via the existing
 *      `getByDealCodeForAI` (Stage 1) + `getByCompanyCodeForAI` +
 *      `getByPersonCodeForAI` queries.
 *   2. Pull org persona (`identity` + `summary` + `keyFacts`) for
 *      positioning / value-prop grounding.
 *   3. Run LLM with structured-output enforcement; on any failure use
 *      a deterministic 5-section template so tests / non-LLM
 *      deployments still surface a useful skeleton.
 *
 * Cost class: `expensive`. Quota gated by `enforceCreativeQuota` in
 * the calling tool.
 */

import { generateText } from "ai";
import { v } from "convex/values";
import { z } from "zod";
import { internalAction } from "../../_generated/server";
import type { ProviderId } from "../encryptionTypes";
import {
	buildLanguageModel,
	getPlatformKey,
	MODEL_REGISTRY,
	PLATFORM_BRIEFING_MODEL,
} from "../models";

// biome-ignore lint/suspicious/noExplicitAny: Convex pre-codegen forward ref pattern
const _ref = (path: string) => path as any;

// ─── Schemas ────────────────────────────────────────────────────────────

const SECTION_SCHEMA = z.object({
	heading: z.string().min(1).max(80),
	body: z.string().min(1).max(4000),
});

export const DraftProposalSchema = z.object({
	title: z.string().min(1).max(140),
	sections: z.array(SECTION_SCHEMA).min(3).max(10),
	bodyMarkdown: z.string().min(1).max(16000),
});

export type DraftProposal = z.infer<typeof DraftProposalSchema>;

// ─── Pure helpers (exported for tests) ──────────────────────────────────

const _DEFAULT_SECTION_HEADINGS = [
	"Summary",
	"Pricing",
	"Timeline",
	"Next steps",
	"Terms",
] as const;

export function buildDeterministicProposal(args: {
	deal: {
		title: string;
		dealCode: string;
		value?: number;
		currency?: string;
	};
	company?: { name: string };
	person?: { displayName: string };
	customInstructions?: string;
	orgPersona: string;
}): DraftProposal {
	const valueLine =
		args.deal.value && args.deal.currency
			? `${args.deal.currency} ${args.deal.value.toLocaleString()}`
			: "TBD";
	const counterparty = args.company?.name ?? args.person?.displayName ?? "the customer";

	const sections = [
		{
			heading: "Summary",
			body: `Proposal for **${args.deal.title}** (${args.deal.dealCode}) prepared for ${counterparty}.${
				args.orgPersona ? `\n\n${args.orgPersona.slice(0, 600)}` : ""
			}`,
		},
		{
			heading: "Pricing",
			body: `Total: ${valueLine}. Payment terms negotiated separately. Final pricing confirmed at signature.`,
		},
		{
			heading: "Timeline",
			body: `Kickoff within 2 weeks of signature. Implementation in 4-6 weeks. Quarterly reviews thereafter.`,
		},
		{
			heading: "Next steps",
			body: `1. Review this proposal.\n2. Confirm scope on a 30-min call.\n3. Counter-sign + return.\n4. Kickoff scheduling.`,
		},
		{
			heading: "Terms",
			body: `Standard terms apply. Custom clauses negotiated separately. Subject to mutual NDA.${
				args.customInstructions ? `\n\nNotes: ${args.customInstructions}` : ""
			}`,
		},
	];

	const bodyMarkdown =
		`# Proposal — ${args.deal.title}\n\n_Prepared for ${counterparty} — ${args.deal.dealCode}_\n\n` +
		sections.map((s) => `## ${s.heading}\n\n${s.body}`).join("\n\n");

	return {
		title: `Proposal — ${args.deal.title}`,
		sections,
		bodyMarkdown,
	};
}

const PROPOSAL_PROMPT = (args: {
	deal: { title: string; dealCode: string; value?: number; currency?: string };
	company?: { name: string };
	person?: { displayName: string };
	customInstructions?: string;
	orgPersona: string;
}): string => `You are a senior CRM specialist drafting a B2B proposal. Reply with ONLY a JSON object — no prose, no code fences.

DEAL CONTEXT
- Title: ${args.deal.title}
- Code: ${args.deal.dealCode}
- Value: ${args.deal.value && args.deal.currency ? `${args.deal.currency} ${args.deal.value}` : "TBD"}
- Counterparty: ${args.company?.name ?? args.person?.displayName ?? "the customer"}

ORG POSITIONING
${args.orgPersona || "(not configured)"}

${args.customInstructions ? `CUSTOM INSTRUCTIONS\n${args.customInstructions}\n` : ""}
OUTPUT SHAPE (must match exactly):
{
  "title": "≤140 char title",
  "sections": [
    { "heading": "Summary", "body": "1-2 paragraphs of context + value prop" },
    { "heading": "Pricing", "body": "Pricing block — concrete numbers when available" },
    { "heading": "Timeline", "body": "When kickoff / when delivery / milestones" },
    { "heading": "Next steps", "body": "Numbered list — what the customer does next" },
    { "heading": "Terms", "body": "Brief boilerplate; reference standard MSA when applicable" }
  ],
  "bodyMarkdown": "Full proposal as Markdown (combine title + sections in order)"
}

Rules:
- 5 sections by default. Add more (max 10) only if the deal complexity demands it.
- Keep prose tight — proposal must read in <90 seconds.
- Use the org's positioning ONLY when it adds value; don't paste persona text verbatim.
- Concrete numbers > vague claims. If a number isn't known, write "TBD" — don't invent.
- DO NOT include autosend instructions or "I'll email this for you" — drafts are user-reviewed.
- bodyMarkdown MUST be the same content as sections joined under their headings.
- JSON only — nothing else.`;

// ─── Action ─────────────────────────────────────────────────────────────

export const run = internalAction({
	args: {
		orgId: v.id("orgs"),
		userId: v.id("users"),
		dealCode: v.string(),
		customInstructions: v.optional(v.string()),
	},
	handler: async (
		ctx,
		args,
	): Promise<{
		draft: DraftProposal;
		modelUsed: string;
		inputTokens?: number;
		outputTokens?: number;
		// Returned to the tool layer so the propose card can show
		// "Proposal for D-007 → Acme Corp" without a re-fetch.
		dealCode: string;
		dealTitle: string;
		counterparty: string;
	}> => {
		const deal = (await ctx.runQuery(_ref("crm/entities/deals/queries:getByDealCodeForAI"), {
			orgId: args.orgId,
			userId: args.userId,
			dealCode: args.dealCode,
		})) as {
			_id: string;
			title?: string;
			dealCode: string;
			value?: number;
			currency?: string;
			companyCode?: string;
			personCode?: string;
		} | null;

		if (!deal) {
			throw new Error(`Deal ${args.dealCode} not found or not accessible.`);
		}

		const dealView = {
			title: deal.title ?? args.dealCode,
			dealCode: deal.dealCode,
			value: deal.value,
			currency: deal.currency,
		};

		// Best-effort enrichment — both queries return null on miss.
		const company = deal.companyCode
			? ((await ctx.runQuery(_ref("crm/entities/companies/queries:getByCompanyCodeForAI"), {
					orgId: args.orgId,
					userId: args.userId,
					companyCode: deal.companyCode,
				})) as { name?: string } | null)
			: null;

		const person = deal.personCode
			? ((await ctx.runQuery(_ref("crm/people/queries:getByPersonCodeForAI"), {
					orgId: args.orgId,
					userId: args.userId,
					personCode: deal.personCode,
				})) as { displayName?: string } | null)
			: null;

		const orgPersona = (await ctx.runQuery(_ref("ai/personaContext:getOrgPersonaForAI"), {
			orgId: args.orgId,
		})) as { summary?: string; identity?: string; keyFacts?: string[] } | null;

		const orgPersonaText =
			[orgPersona?.identity, orgPersona?.summary, ...(orgPersona?.keyFacts ?? [])]
				.filter((s): s is string => Boolean(s?.trim()))
				.join(" • ") || "";

		const fallback = buildDeterministicProposal({
			deal: dealView,
			company: company?.name ? { name: company.name } : undefined,
			person: person?.displayName ? { displayName: person.displayName } : undefined,
			customInstructions: args.customInstructions,
			orgPersona: orgPersonaText,
		});

		const counterparty = company?.name ?? person?.displayName ?? "the customer";

		const modelKey = process.env.AI_DEFAULT_MODEL ?? PLATFORM_BRIEFING_MODEL;
		const info = MODEL_REGISTRY[modelKey] ?? MODEL_REGISTRY[PLATFORM_BRIEFING_MODEL];
		const apiKey = getPlatformKey(info.provider as ProviderId);
		if (!apiKey) {
			return {
				draft: fallback,
				modelUsed: "deterministic:fallback",
				dealCode: deal.dealCode,
				dealTitle: dealView.title,
				counterparty,
			};
		}

		try {
			const model = buildLanguageModel({
				provider: info.provider as ProviderId,
				modelId: info.modelId,
				apiKey,
			});
			const result = await generateText({
				model: model as Parameters<typeof generateText>[0]["model"],
				prompt: PROPOSAL_PROMPT({
					deal: dealView,
					company: company?.name ? { name: company.name } : undefined,
					person: person?.displayName ? { displayName: person.displayName } : undefined,
					customInstructions: args.customInstructions,
					orgPersona: orgPersonaText,
				}),
				temperature: 0.4,
				maxOutputTokens: 2400,
			});
			const cleaned = result.text
				.trim()
				.replace(/^```(?:json)?\s*/i, "")
				.replace(/```\s*$/i, "")
				.trim();
			const parsed = DraftProposalSchema.parse(JSON.parse(cleaned));
			return {
				draft: parsed,
				modelUsed: `${info.provider}:${modelKey}`,
				inputTokens: result.usage?.inputTokens,
				outputTokens: result.usage?.outputTokens,
				dealCode: deal.dealCode,
				dealTitle: dealView.title,
				counterparty,
			};
		} catch (err) {
			console.warn("[draftProposal] LLM pass failed — using deterministic fallback", err);
			return {
				draft: fallback,
				modelUsed: "deterministic:fallback",
				dealCode: deal.dealCode,
				dealTitle: dealView.title,
				counterparty,
			};
		}
	},
});

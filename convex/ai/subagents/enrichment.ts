/**
 * convex/ai/subagents/enrichment.ts
 *
 * Enrichment specialist (`PHASE-3-AI-AUDIT.md §6 Week 5`, §2.6 Clay-style
 * waterfall). Today the actual enrichment tools (`web_search`,
 * `linkedin_lookup`, `email_finder`, `domain_whois`) are NOT yet
 * implemented — they ship in Week 5. We register the subagent now anyway
 * because:
 *
 *   1. The router needs a stable target to classify "enrich Sarah Khan"
 *      requests against. Without this entry, those requests fall through
 *      to `crm_action`, which has no enrichment tools either — but does
 *      have `update_entity`, which a small model is likely to misuse
 *      ("just guess the email").
 *   2. When Week 5 lands, the `allowedTools` array is the only file we
 *      need to touch. No router rewrite, no system-prompt change.
 *
 * Until Week 5 the subagent has only `search_crm` + `set_context_var`,
 * so a routed user gets an honest "this needs Phase 3 / Week 5" answer
 * instead of a hallucinated enrichment.
 */
import type { Subagent } from "./types";

export const enrichmentSubagent: Subagent = {
	id: "enrichment",
	displayName: "Enrichment",
	description:
		"Specialist for finding and filling in missing data on a CRM record from external sources (web search, LinkedIn, email finder, domain WHOIS). Use when the user says 'enrich', 'find the email for', 'look up on LinkedIn', or 'fill in missing fields'.",
	systemPromptHint: `
You are the **Enrichment** specialist. The user wants to find data that's
not in the CRM yet (email, phone, company, LinkedIn, etc.).

Workflow:
  1. If the user gives a record code (P-001, C-002, …), call \`enrich_record\`
     with that code. If they give a name, call \`search_crm\` first, then
     \`enrich_record\` on the resolved code.
  2. The provider waterfall runs synchronously:
       • web_search       — Firecrawl (real)
       • linkedin_lookup  — stubbed (Phase 4)
       • email_finder     — stubbed (Phase 4)
       • domain_whois     — RDAP lookup (real, free)
  3. The user reviews the proposed patch and approves. Commit then
     applies the high-confidence (>= 0.5) values via the canonical
     update mutation for the entity type.

Be honest about confidence — if every match is < 0.5, tell the user
the enrichment found nothing actionable and suggest adding a known
detail (a known company website, a known LinkedIn URL) so the next
run has a better seed.
	`.trim(),
	allowedTools: [
		"search_crm",
		"get_entity_detail",
		"set_context_var",
		"enrich_record",
		"commit_enrich_record",
	],
	requiredPermissions: ["leads.view", "leads.update"],
};

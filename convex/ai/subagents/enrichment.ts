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
not in the CRM yet. As of Phase 3 / Week 5, the enrichment tools are
under construction (web_search, linkedin_lookup, email_finder,
domain_whois). For now: tell the user enrichment is coming in Phase 3
Week 5; offer to record what they've already gathered via update_entity
(if they switch back to the CRM Action specialist).
	`.trim(),
	allowedTools: [
		"search_crm",
		"get_entity_detail",
		"set_context_var",
		// Week 5 will add: "web_search", "linkedin_lookup", "email_finder",
		// "domain_whois", and a guarded `commit_update_entity`.
	],
	requiredPermissions: ["leads.view"],
};

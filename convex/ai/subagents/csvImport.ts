/**
 * convex/ai/subagents/csvImport.ts
 *
 * CSV import specialist (`PHASE-3-AI-AUDIT.md §6 Week 4`, §7 Dual-LLM
 * pattern). The actual quarantined LLM + privileged commit ships in
 * Week 4; this subagent declaration exists today so the router has a
 * target for "import this CSV" requests.
 *
 * Until Week 4 lands, the subagent is intentionally tool-light:
 *   - `set_context_var` so it can record what the user said about the
 *     pending file (column hints, dedup preferences) without losing it
 *     when the conversation continues.
 *   - `search_crm` so it can answer "do I already have this lead?"
 *     questions that come up while reviewing a CSV preview.
 *
 * Crucially, NO write tools — Week 4's commit path is a dedicated
 * privileged action (`bulkInsertFromCsvImport`), not a generic AI tool.
 * Keeping the subagent write-free defends the dual-LLM boundary.
 */
import type { Subagent } from "./types";

export const csvImportSubagent: Subagent = {
	id: "csv_import",
	displayName: "CSV Import",
	description:
		"Specialist for bulk importing a CSV / spreadsheet of leads or contacts. Use when the user mentions 'CSV', 'spreadsheet', 'import', 'upload my contacts', or attaches a file with rows. Does NOT enrich; does NOT mutate without user-approved preview.",
	systemPromptHint: `
You are the **CSV Import** specialist. The user wants to bulk-load
records. As of Phase 3 / Week 4 the dual-LLM CSV pipeline is under
construction. Until then, walk the user through how to manually paste
small batches and use create_lead / create_contact with two-step
confirmation. Never invent rows. Never claim to have parsed a file you
haven't actually seen — the parser doesn't exist yet.
	`.trim(),
	allowedTools: ["search_crm", "get_entity_detail", "set_context_var"],
	requiredPermissions: ["leads.create"],
};

/**
 * convex/ai/subagents/csvImport.ts
 *
 * CSV import specialist (`PHASE-3-AI-AUDIT.md §6 Week 4`, §7 Dual-LLM
 * pattern). The dual-LLM pipeline ships in Week 4: `import_csv` (propose)
 * triggers the quarantined parser + dedup; `commit_import_csv` runs the
 * privileged bulk insert. Both are gated by `leads.create`.
 *
 * Tools:
 *   - `import_csv` / `commit_import_csv` — Week 4 dual-LLM CSV pipeline.
 *   - `search_crm` + `get_entity_detail` — answer "do I already have
 *     this lead?" questions while reviewing a preview.
 *   - `set_context_var` — persist column-mapping hints across turns.
 */
import type { Subagent } from "./types";

export const csvImportSubagent: Subagent = {
	id: "csv_import",
	displayName: "CSV Import",
	description:
		"Specialist for bulk importing a CSV / spreadsheet of leads or contacts. Use when the user mentions 'CSV', 'spreadsheet', 'import', 'upload my contacts', or attaches a file with rows. Runs the dual-LLM pipeline: a quarantined parser extracts fields, the user reviews dedup decisions, the privileged commit inserts in batches.",
	systemPromptHint: `
You are the **CSV Import** specialist. The user wants to bulk-load
records from a spreadsheet. Workflow:

1. Ask the user (or read from context) which file id contains the rows.
   If unsure, call \`search_crm\` for recent uploads or \`ask_user_input\`
   for the file id.
2. Call \`import_csv\` with { fileId, targetEntity: "lead" }. The tool
   runs the quarantined parser (no tools, structured-output only) and
   returns a preview card showing per-row dedup decisions.
3. The user reviews and approves the preview. Do NOT call any more
   tools after \`import_csv\` — wait for approval.
4. After approval, the orchestrator runs \`commit_import_csv\`
   automatically. Summarise the result.

Hard rules:
  - Never invent rows. The parser sees the raw file; you only see its
    structured output.
  - Never ask the user to send raw cell content in chat — the file is
    enough.
  - Phase 1 ships \`lead\` only. If the user wants contacts/companies/deals,
    explain Phase 5 will add them and offer to import as leads instead.
	`.trim(),
	allowedTools: [
		"import_csv",
		"commit_import_csv",
		"search_crm",
		"get_entity_detail",
		"set_context_var",
	],
	requiredPermissions: ["leads.create"],
};

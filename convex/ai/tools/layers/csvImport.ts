/**
 * convex/ai/tools/layers/csvImport.ts
 *
 * Week 4 — CSV import AI tools (`PHASE-3-AI-AUDIT.md §6 Week 4` & §7
 * Dual-LLM safety).
 *
 * Two tools, both two-step:
 *
 *   `import_csv`         — propose. Creates a `csvImports` row, runs the
 *                          quarantined parser, returns a propose() shape
 *                          whose preview is the per-row dedup decision
 *                          set. The user approves; `resume.ts` calls the
 *                          commit twin.
 *   `commit_csv_import`  — privileged commit. Calls
 *                          `bulkInsertFromCsvImport` (auth-bridge) which
 *                          runs the actual inserts/merges/skips.
 *
 * Why a separate tool layer: keeps the dual-LLM boundary obvious. The
 * `bulk` layer is for OPERATING on existing rows (bulk_update,
 * bulk_close); the `csvImport` layer is for INGESTING new rows from
 * untrusted content. Different threat model, different runbook, deserves
 * its own home.
 *
 * **Auth bridge**: every public mutation an AI tool calls must have a
 * `*ForAI` internal twin. `bulkInsertFromCsvImportForAI` ships in the
 * same change as this tool — see `crm/entities/leads/mutations.ts`.
 */

import { z } from "zod";
import { internal } from "../../../_generated/api";
import { registerTool } from "../../toolRegistry";
import { propose, requirePermission, runTool, type ToolContext, toolMutation } from "../_shared";

let _ctx: ToolContext | null = null;
export function setCsvImportContext(c: ToolContext): void {
	_ctx = c;
}
function getCtx(): ToolContext {
	if (!_ctx) throw new Error("csvImport ctx not bound");
	return _ctx;
}

// ─── propose: import_csv ─────────────────────────────────────────────────────
//
// Steps performed inside execute() (BEFORE returning the propose payload):
//   1. RBAC check — user must hold `leads.create`.
//   2. Insert a `csvImports` row with status: "parsing".
//   3. Run the quarantined parser action SYNCHRONOUSLY. The chat UI shows
//      the "calling tool..." spinner during this wait.
//   4. Reload the import row to read the parser's result (status, errors,
//      rowCount, previewRows).
//   5. Return propose() with `{ csvImportId, summary, previewRows }`.
//
// `streamLoop.wrapToolsForApprovalSanitisation` (Day 1 T1.1) hides the
// JSON from the model. The user sees the rich preview card via
// `core/ai/components/preview/CsvImportPreviewCard.tsx`.

const TARGET_ENTITY = z.enum(["lead"]); // Phase 5 widens to contact/company/deal

registerTool({
	name: "import_csv",
	layer: "bulk", // re-uses the existing layer — no new LayerId migration
	permission: "leads.create",
	confirmation: "twoStep",
	description: `
Bulk import a CSV file of leads. The user must have already uploaded the file —
pass its file id (\`fileId\`) here. The parser runs inside a quarantined LLM
that has NO write tools, so prompt-injection text inside cells cannot escape
to the privileged tool layer.

PRE-FLIGHT FIRST: ALWAYS pass the SAME fileId the user just attached. If they
say "import the file I just shared" without an explicit id, ask via
ask_user_input which file (list recent uploads with scope="csvImport").
	`.trim(),
	runbook: {
		onSuccess:
			"After the user approves and the commit runs, summarise: N inserted, M merged, K skipped, F failed. Suggest the user open the leads board to review.",
		onValidationError:
			"If the parser returns errors, surface them verbatim and offer to retry once the user fixes the file.",
		onPermissionDenied:
			"Tell the user they need leads.create permission to import leads. Suggest contacting an admin.",
		suggestNext: "search_crm",
	},
	example: { fileId: "files_id_here", targetEntity: "lead" },
	schema: z.object({
		fileId: z.string().min(1),
		targetEntity: TARGET_ENTITY.default("lead"),
	}),
	execute: async (args) =>
		runTool(async () => {
			const tc = getCtx();
			requirePermission(tc.permissions, "leads.create");

			// Step 1: create the csvImports row. Done via a dedicated
			// internal mutation in csvImportTools_internal.ts so the
			// auth-bridge rule is honoured.
			const csvImportId = (await tc.ctx.runMutation(
				internal.ai.tools.layers.csvImportInternal._createCsvImportRowInternal,
				{
					orgId: tc.orgId,
					userId: tc.userId,
					fileId: args.fileId as never,
					targetEntity: args.targetEntity,
				},
			)) as string;

			// Step 2: run the quarantined parser SYNCHRONOUSLY. The chat
			// UI shows the spinner during this wait — typical 1k-row file
			// is parsed in 4-15 seconds depending on the model.
			await tc.ctx.runAction(internal.ai.quarantined.csvParser.parseCsvImport, {
				csvImportId: csvImportId as never,
			});

			// Step 3: reload to inspect the parser result.
			const parsed = (await tc.ctx.runQuery(
				internal.ai.tools.layers.csvImportInternal._readCsvImportRowInternal,
				{ csvImportId: csvImportId as never, orgId: tc.orgId },
			)) as {
				status: string;
				rowCount: number;
				previewRows: Array<{
					idemKey: string;
					fields: Record<string, string | null>;
					dedupDecision: "insert" | "merge" | "skip";
					dedupTargetCode?: string;
					validationError?: string;
				}>;
				errors?: string[];
			} | null;

			if (!parsed || parsed.status !== "ready") {
				const errors = parsed?.errors ?? ["Parser failed to produce a preview."];
				return {
					ok: false as const,
					error: errors.join(" "),
					code: "CSV_PARSE_FAILED",
				};
			}

			// Build the summary the model sees in the propose() preview.
			const decisions = {
				insert: 0,
				merge: 0,
				skip: 0,
				error: 0,
			};
			for (const r of parsed.previewRows) {
				if (r.validationError) decisions.error++;
				else decisions[r.dedupDecision]++;
			}

			return propose(
				"import_csv",
				{
					csvImportId,
					targetEntity: args.targetEntity,
					rowCount: parsed.rowCount,
				},
				{
					title: `Import ${parsed.rowCount} ${args.targetEntity}s from CSV`,
					fields: [
						{ label: "Total rows", value: parsed.rowCount },
						{ label: "Will insert", value: decisions.insert },
						{ label: "Will merge with existing", value: decisions.merge },
						{ label: "Will skip (duplicate email)", value: decisions.skip },
						{ label: "Validation errors", value: decisions.error },
					],
				},
			);
		}),
});

// ─── commit_csv_import ───────────────────────────────────────────────────────
//
// Runs inside `processChat.resume` after the user approves the preview.
// The args are { csvImportId, targetEntity, rowCount } from the original
// propose() — we re-read the rows from the DB (NOT from the model) so a
// malicious model can't tamper with them between propose and commit.

registerTool({
	name: "commit_import_csv",
	layer: "bulk",
	permission: "leads.create",
	confirmation: "none",
	description: "Internal: commit a previously-proposed CSV import.",
	schema: z.object({
		csvImportId: z.string().min(1),
		targetEntity: TARGET_ENTITY.default("lead"),
		rowCount: z.number().optional(),
	}),
	execute: async (args) =>
		runTool(async () => {
			const tc = getCtx();
			requirePermission(tc.permissions, "leads.create");

			// Re-read the import row from the DB. The model passed
			// {csvImportId} only; everything else (rows, dedup decisions)
			// comes from the trusted DB row.
			const parsed = (await tc.ctx.runQuery(
				internal.ai.tools.layers.csvImportInternal._readCsvImportRowInternal,
				{ csvImportId: args.csvImportId as never, orgId: tc.orgId },
			)) as {
				status: string;
				rowCount: number;
				previewRows: Array<{
					idemKey: string;
					fields: Record<string, string | null>;
					dedupDecision: "insert" | "merge" | "skip";
					dedupTargetCode?: string;
					validationError?: string;
				}>;
			} | null;

			if (!parsed || parsed.status === "completed") {
				return {
					ok: false as const,
					error: "This CSV import was already committed or no longer exists. Open the Leads board to review the imported records.",
					code: "CSV_ALREADY_COMMITTED",
				};
			}
			if (parsed.status !== "ready") {
				return {
					ok: false as const,
					error: `CSV import is in status "${parsed.status}", not "ready". Re-run import_csv if the parse failed.`,
					code: "CSV_NOT_READY",
				};
			}

			const result = (await toolMutation(
				tc,
				"crm/entities/leads/mutations:bulkInsertFromCsvImport",
				{
					orgId: tc.orgId,
					csvImportId: args.csvImportId,
					rows: parsed.previewRows,
				},
			)) as {
				inserted: number;
				merged: number;
				skipped: number;
				failedRows: Array<{ idemKey: string; error: string }>;
			};

			const display = `✅ CSV import complete: ${result.inserted} inserted, ${result.merged} merged, ${result.skipped} skipped${result.failedRows.length > 0 ? `, ${result.failedRows.length} failed` : ""}.`;

			return {
				ok: true as const,
				data: result,
				display,
			};
		}),
});

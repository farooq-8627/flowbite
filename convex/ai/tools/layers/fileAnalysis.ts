/**
 * convex/ai/tools/layers/fileAnalysis.ts
 *
 * Week 5.2 — File analysis AI tools (`PHASE-3-AI-AUDIT.md §6 Week 5`).
 *
 * Two tools, mirroring the CSV-import pattern:
 *
 *   `analyze_file`         — propose. Creates a fileAnalyses row, runs the
 *                            quarantined vision parser synchronously, returns
 *                            a propose() with the per-field extracted data.
 *   `commit_analyze_file`  — privileged commit. Either creates a NEW lead/
 *                            contact (if no target was supplied) or patches
 *                            the existing target record.
 */

import { z } from "zod";
import { internal } from "../../../_generated/api";
import { codeString } from "../../../_shared/synonyms";
import { registerTool } from "../../toolRegistry";
import { propose, requirePermission, runTool, type ToolContext } from "../_shared";

let _ctx: ToolContext | null = null;
export function setFileAnalysisContext(c: ToolContext): void {
	_ctx = c;
}
function getCtx(): ToolContext {
	if (!_ctx) throw new Error("fileAnalysis ctx not bound");
	return _ctx;
}

const KIND = z.enum(["passport", "listing_photo", "invoice"]);
const TARGET_ENTITY = z.enum(["lead", "contact", "company", "deal"]);

// ─── analyze_file ────────────────────────────────────────────────────────────

registerTool({
	name: "analyze_file",
	layer: "data",
	permission: "leads.update",
	confirmation: "twoStep",
	description: `
Extract structured fields from an uploaded file using a vision-capable model.
Three kinds are supported in Phase 3:

  passport       — biographical data (firstName, lastName, DOB, nationality,
                   document number, expiry).
  listing_photo  — RE-specific (propertyType, bedrooms, bathrooms, hasPool,
                   condition).
  invoice        — vendor, invoice number, date, total, currency.

PRE-FLIGHT FIRST: ALWAYS pass the SAME fileId the user just attached. If
they say "analyse the photo I just shared" without an explicit id, ask
which file via ask_user_input (list recent uploads with scope="fileAnalysis"
or scope="generic").

If the user identifies a target record (P-001 / C-002 / etc.), pass it as
\`targetEntity + code\` so the commit step patches that record. Otherwise
leave both blank and the commit step will surface the extracted fields
without writing.
	`.trim(),
	instruction: {
		whenToCall:
			"User uploads a file (passport, ID card, listing photo, invoice) and asks the AI to extract data from it. Pass the file's `fileId` from the upload. If the kind is obvious from the user's words ('passport', 'invoice'), pass that explicitly; otherwise let the model auto-detect.",
		whenNotToCall:
			"the user wants the AI to *summarise* a text doc (call a different tool when one exists) or open a saved view of files (use `view_trash` / standard list). Don't call when no fileId is in scope — ask via `ask_user_input` first.",
		preflight: ["search_crm"],
		requiredClarifications: ["fileId", "kind"],
		synonyms: ["extract", "scan", "read this file", "analyse passport", "OCR"],
		goodExample: {
			description:
				"User: 'Extract data from the passport I just uploaded.' (fileId from prior turn)",
			args: { fileId: "abc123", kind: "passport" },
		},
		badExample: {
			description: "User: 'Process the file.'",
			args: { fileId: "", kind: "passport" },
			whyBad: "fileId is required. If the user didn't reference one, call ask_user_input to surface recent uploads.",
		},
	},
	runbook: {
		onSuccess:
			"After commit, summarise what fields were extracted and where they were applied. If no target was set, show the user the structured fields and ask whether to attach to a record.",
		onValidationError:
			"If extraction fails (illegible scan, wrong document type), surface the error and offer to retry with a clearer image.",
		onPermissionDenied:
			"Tell the user they need leads.update permission to apply extracted fields. They can still extract without a target.",
		suggestNext: "search_crm",
	},
	example: { fileId: "file_id_here", kind: "passport" },
	schema: z.object({
		fileId: z.string().min(1),
		kind: KIND,
		targetEntity: TARGET_ENTITY.optional(),
		code: codeString().optional(),
	}),
	execute: async (args) =>
		runTool(async () => {
			const tc = getCtx();
			requirePermission(tc.permissions, "leads.update");

			const fileAnalysisId = (await tc.ctx.runMutation(
				internal.ai.quarantined.fileAnalyzerInternal._createAnalysis,
				{
					orgId: tc.orgId,
					userId: tc.userId,
					fileId: args.fileId as never,
					kind: args.kind,
					targetEntity: args.targetEntity,
					targetEntityId: args.code, // we use the user-supplied code as the id placeholder
					targetCode: args.code,
				},
			)) as string;

			await tc.ctx.runAction(internal.ai.quarantined.fileAnalyzer.analyzeFile, {
				fileAnalysisId: fileAnalysisId as never,
			});

			const fa = (await tc.ctx.runQuery(
				internal.ai.quarantined.fileAnalyzerInternal._readAnalysis,
				{ fileAnalysisId: fileAnalysisId as never, orgId: tc.orgId },
			)) as {
				status: string;
				kind: string;
				extracted?: Record<string, unknown>;
				proposedPatch?: Array<{ field: string; value: string | null; confidence: number }>;
				errors?: string[];
			} | null;

			if (!fa || fa.status !== "ready") {
				const errors = fa?.errors ?? ["Vision parser failed."];
				return {
					ok: false as const,
					error: errors.join(" "),
					code: "VISION_PARSE_FAILED",
				};
			}

			const fields = fa.proposedPatch ?? [];
			if (fields.length === 0) {
				return {
					ok: false as const,
					error: "No fields could be extracted from this file. Try a clearer image or a different document type.",
					code: "EMPTY_EXTRACT",
				};
			}

			return propose(
				"analyze_file",
				{
					fileAnalysisId,
					kind: args.kind,
					targetEntity: args.targetEntity,
					code: args.code,
				},
				{
					title: `Analyze ${args.kind.replace("_", " ")} ${args.code ? `→ ${args.code}` : "(no target)"}`,
					fields: fields.map((f) => ({
						label: f.field,
						value: `${f.value ?? "—"} (${Math.round(f.confidence * 100)}%)`,
					})),
				},
			);
		}),
});

// ─── commit_analyze_file ─────────────────────────────────────────────────────

registerTool({
	name: "commit_analyze_file",
	layer: "data",
	permission: "leads.update",
	confirmation: "none",
	description: "Internal: commit a previously-proposed file analysis to a CRM record.",
	schema: z.object({
		fileAnalysisId: z.string().min(1),
		kind: KIND,
		targetEntity: TARGET_ENTITY.optional(),
		code: codeString().optional(),
	}),
	execute: async (args) =>
		runTool(async () => {
			const tc = getCtx();
			requirePermission(tc.permissions, "leads.update");

			const fa = (await tc.ctx.runQuery(
				internal.ai.quarantined.fileAnalyzerInternal._readAnalysis,
				{ fileAnalysisId: args.fileAnalysisId as never, orgId: tc.orgId },
			)) as {
				status: string;
				kind: string;
				proposedPatch?: Array<{ field: string; value: string | null; confidence: number }>;
			} | null;

			if (!fa || fa.status !== "ready") {
				return { ok: false as const, error: "Analysis not ready", code: "NOT_READY" };
			}

			const patches = (fa.proposedPatch ?? []).filter((p) => p.confidence >= 0.5);

			// No target → just record extracted state, return a structured
			// summary without patching. UI can decide what to do with it.
			if (!args.targetEntity || !args.code) {
				await tc.ctx.runMutation(
					internal.ai.quarantined.fileAnalyzerInternal._patchAnalysis,
					{
						fileAnalysisId: args.fileAnalysisId as never,
						patch: { status: "completed" },
					},
				);
				const summary = patches.map((p) => `${p.field}=${p.value ?? "—"}`).join(", ");
				return {
					ok: true as const,
					data: { extracted: patches, applied: false as boolean, appliedFieldCount: 0 },
					display: `Extracted ${patches.length} fields from ${fa.kind}: ${summary}. No target record was given — review and apply manually if needed.`,
				};
			}

			// Build a flat patch from the high-confidence extractions, then
			// hand off to the shared helper. The helper splits canonical
			// column fields from custom (`fieldValues`) fields automatically,
			// so vision-extracted overflow fields like `dateOfBirth` /
			// `expiryDate` / `hasPool` now LAND on the record (P1.3) instead
			// of being surfaced as raw text in chat.
			const patch: Record<string, string | null> = {};
			for (const p of patches) {
				patch[p.field] = p.value;
			}

			const result = (await tc.ctx.runMutation(
				internal.ai.aiEntityPatch.applyEntityPatchByCode,
				{
					orgId: tc.orgId,
					userId: tc.userId,
					entityType: args.targetEntity,
					code: args.code,
					patch,
				},
			)) as {
				canonicalCode: string;
				columnsApplied: string[];
				customFieldsApplied: Array<{ name: string; value: unknown }>;
				unknownFields: string[];
			};

			await tc.ctx.runMutation(internal.ai.quarantined.fileAnalyzerInternal._patchAnalysis, {
				fileAnalysisId: args.fileAnalysisId as never,
				patch: { status: "completed" },
			});

			const appliedSummary: string[] = [];
			if (result.columnsApplied.length > 0) {
				appliedSummary.push(`canonical: ${result.columnsApplied.join(", ")}`);
			}
			if (result.customFieldsApplied.length > 0) {
				appliedSummary.push(
					`custom: ${result.customFieldsApplied.map((f) => f.name).join(", ")}`,
				);
			}
			const skipped =
				result.unknownFields.length > 0
					? ` Skipped (no matching field): ${result.unknownFields.join(", ")}.`
					: "";

			return {
				ok: true as const,
				data: {
					extracted: patches,
					applied: true as boolean,
					appliedFieldCount:
						result.columnsApplied.length + result.customFieldsApplied.length,
					...result,
				},
				display: `Updated ${args.targetEntity} ${result.canonicalCode} from ${fa.kind} — ${appliedSummary.join(" · ") || "no fields applied"}.${skipped}`,
			};
		}),
});

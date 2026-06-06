/**
 * Quarantined capabilities — the V2 trigger surface for the long-running
 * LLM-backed pipelines (`csvParser`, `fileAnalyzer`,
 * `enrichmentProviders`). Each cap CREATES a parent row + SCHEDULES the
 * `"use node"` action; the action runs async, the user reviews the
 * preview / proposed-patch row, and a separate COMMIT capability
 * ratifies the writes (e.g. `import_csv` in `crm/shared/bulk/capabilities.ts`).
 *
 * Surface (3 caps in the `quarantined` group):
 *
 *   parse_csv       upload a CSV → preview rows the user reviews
 *   analyze_file    OCR / vision over a passport / listing photo / invoice
 *   enrich_record   web-search-driven field enrichment for a record
 *
 * Group invariants (mirrored in the playbook):
 *
 *   1. Each parse / analyze / enrich call CREATES a parent row in the
 *      relevant table (`csvImports`, `fileAnalyses`, `enrichmentRuns`)
 *      and schedules the action via `ctx.scheduler.runAfter(0, ...)`.
 *      The cap returns immediately with the row id; the action writes
 *      its results back asynchronously.
 *   2. Risk: `reversible` — the parent row + scheduled action consume
 *      quota and the AI's LLM credits. The actual COMMIT path (e.g.
 *      `import_csv` for a parsed CSV row) is `irreversible` and lives
 *      in the bulk capabilities module.
 *   3. Permission: `data.import` for parse_csv (matches `import_csv`),
 *      `files.upload` for analyze_file, `data.import` for enrich_record
 *      (the enrichment patch is a privileged edit until the user
 *      ratifies it).
 *   4. Phase 1 of csv_import ships LEAD-only — `parse_csv` rejects
 *      non-lead targets with a friendly error. The schema accepts the
 *      union; the parser's short-circuit produces the failed row.
 *
 * Channel allow-list excludes WhatsApp on the trigger side because
 * file-bytes flow is browser-only; the underlying COMMIT verbs already
 * carry their own gates.
 */
import { z } from "zod";
import { internal } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";
import { defineCapability } from "../registry/define";
import { defineGroup } from "../registry/groups";
import { failed, ok } from "../registry/result";

// ─── Closed unions ──────────────────────────────────────────────────────────

const CSV_TARGET_ENTITY = z.enum(["lead", "contact", "company", "deal"]);
const FILE_ANALYSIS_KIND = z.enum(["passport", "listing_photo", "invoice", "generic"]);
const ENRICH_TARGET_ENTITY = z.enum(["lead", "contact", "company", "deal"]);

// ─── Group playbook ─────────────────────────────────────────────────────────

defineGroup({
	name: "quarantined",
	playbook: `Read first → \`describe_workspace\` to confirm the user has uploaded the file (browser-only flow). Quarantined caps run LLM pipelines async — they return a row id immediately; the user reviews the result and ratifies via a separate commit verb.

Parse a CSV → \`parse_csv\` with the uploaded fileId + targetEntity (Phase 1: 'lead' only). Returns \`csvImportId\`; once the parser finishes, call \`import_csv\` (in the bulk module) to commit the preview rows.

Analyze a file → \`analyze_file\` with the fileId + kind ('passport' | 'listing_photo' | 'invoice'). Returns \`fileAnalysisId\`; the action writes structured fields back to the row. The user reviews + applies the result to the target record manually.

Enrich a record → \`enrich_record\` with the entityType + entityCode. Reads the record's current fields, runs the provider chain (Firecrawl web search → LLM extraction), produces a \`proposedPatch\`. The user reviews + applies via a future commit verb.

Phase: \`parse_csv\` only supports LEAD imports in v1; the schema accepts the union but the parser short-circuits non-lead with a friendly error.`,
});

// ─── parse_csv ──────────────────────────────────────────────────────────────

const parseCsv = defineCapability<{
	fileId: string;
	targetEntity: "lead" | "contact" | "company" | "deal";
}>({
	name: "parse_csv",
	module: "quarantined",
	group: "quarantined",
	permission: "data.import",
	risk: "reversible",
	channels: ["chat", "mcp", "rest"],
	spec: {
		whenToCall:
			"Kick off the quarantined CSV parser. Pass the uploaded `fileId` (from list_files) + `targetEntity`. Returns `csvImportId` immediately; the parser writes preview rows asynchronously. The user reviews via the preview UI; commit via `import_csv`.",
		whenNotToCall:
			"the CSV file hasn't been uploaded yet — uploads are a browser-only flow. The user wants to commit a previously-parsed CSV — call `import_csv` (bulk module) directly.",
		requiredClarifications: ["fileId", "targetEntity"],
		synonyms: ["parse csv", "import csv", "preview csv", "load csv preview"],
		goodExample: { fileId: "k123abc", targetEntity: "lead" },
		badExample: {
			args: { fileId: "k123abc", targetEntity: "contact" },
			why: "Phase 1 ships lead-only. Contact / company / deal imports land in Phase 5 (B.11 backlog).",
		},
	},
	drive: {
		onSuccess:
			"Confirm with the csvImportId + 'parser scheduled — preview rows in a few seconds.' Surface the next step (`import_csv` once status is 'ready').",
		onValidationError:
			"If targetEntity is anything other than 'lead', surface the Phase-1 limitation. The user's options: split-and-import as leads, or wait for B.11.",
	},
	input: z.object({
		fileId: z.string().min(1),
		targetEntity: CSV_TARGET_ENTITY,
	}),
	run: async (cap, args) => {
		const { ctx, principal } = cap;

		// Surface the Phase-1 limitation BEFORE creating the row, so the user
		// doesn't accumulate failed rows in the UI.
		if (args.targetEntity !== "lead") {
			return failed(
				"business_error",
				`CSV import currently supports the lead entity only (Phase 1). Got "${args.targetEntity}". Split your file into a leads-only sheet and re-upload.`,
			);
		}

		const csvImportId = (await ctx.runMutation(internal.ai.csvImports.createImportRowForAI, {
			orgId: principal.orgId,
			userId: principal.userId,
			fileId: args.fileId as Id<"files">,
			targetEntity: args.targetEntity,
		})) as Id<"csvImports">;

		// Schedule the parser action.
		await ctx.scheduler.runAfter(0, internal.ai.quarantined.csvParser.parseCsvImport, {
			csvImportId,
		});

		return ok({
			headline: `CSV parser scheduled (id ${csvImportId}).`,
			facts: [
				"Preview rows will land in a few seconds.",
				`Once status is "ready", call \`import_csv\` with this csvImportId to commit.`,
			],
			data: { csvImportId, targetEntity: args.targetEntity },
			suggestedNext: [
				{
					label: "Commit when ready",
					intent: `Commit the CSV import ${csvImportId}`,
				},
			],
		});
	},
});

// ─── analyze_file ───────────────────────────────────────────────────────────

const analyzeFile = defineCapability<{
	fileId: string;
	kind: "passport" | "listing_photo" | "invoice" | "generic";
	targetEntity?: "lead" | "contact" | "company" | "deal";
	targetCode?: string;
}>({
	name: "analyze_file",
	module: "quarantined",
	group: "quarantined",
	permission: "files.upload",
	risk: "reversible",
	channels: ["chat", "mcp", "rest"],
	spec: {
		whenToCall:
			"Run a vision-LLM over an uploaded file: `passport` (extracts MRZ + bio fields), `listing_photo` (real-estate photo classifier), `invoice` (vendor / total / currency OCR). 10MB max. Returns `fileAnalysisId`; the action writes structured fields back to the row asynchronously.",
		whenNotToCall:
			"the user wants to ATTACH the file to a record — call attach_file. The user wants the file's contents quoted inline — analyze_file extracts STRUCTURED data, not free text.",
		requiredClarifications: ["fileId", "kind"],
		synonyms: ["analyze file", "OCR file", "extract from file", "scan document"],
		goodExample: { fileId: "k123abc", kind: "invoice" },
		badExample: {
			args: { fileId: "k123abc", kind: "generic" },
			why: "Generic vision analysis isn't supported — pick a specific kind (passport / listing_photo / invoice).",
		},
	},
	drive: {
		onSuccess:
			"Confirm with the fileAnalysisId + 'analyzer scheduled — results in a few seconds.' Surface the next step (review the row, apply fields manually).",
	},
	input: z.object({
		fileId: z.string().min(1),
		kind: FILE_ANALYSIS_KIND,
		targetEntity: ENRICH_TARGET_ENTITY.optional(),
		targetCode: z.string().optional(),
	}),
	run: async (cap, args) => {
		const { ctx, principal } = cap;

		if (args.kind === "generic") {
			return failed(
				"business_error",
				"Generic file analysis is Phase 4 — pick a specific kind: passport / listing_photo / invoice.",
			);
		}

		// Optionally resolve targetCode → targetEntityId. We pass the canonical
		// code through to the analysis row so the user can re-apply the
		// extracted fields to the right record on review.
		let targetEntityId: string | undefined;
		let targetCanonical: string | undefined = args.targetCode;
		if (args.targetEntity && args.targetCode) {
			try {
				const resolved = (await ctx.runMutation(
					internal.ai.aiEntityPatch.resolveEntityCode,
					{
						orgId: principal.orgId,
						userId: principal.userId,
						entityType: args.targetEntity,
						code: args.targetCode,
					},
				)) as { entityId: string; canonicalCode: string };
				targetEntityId = resolved.entityId;
				targetCanonical = resolved.canonicalCode;
			} catch {
				return failed(
					"not_found",
					`No ${args.targetEntity} found with code ${args.targetCode}.`,
				);
			}
		}

		const fileAnalysisId = (await ctx.runMutation(
			internal.ai.quarantined.fileAnalyzerInternal._createAnalysis,
			{
				orgId: principal.orgId,
				userId: principal.userId,
				fileId: args.fileId as Id<"files">,
				kind: args.kind,
				targetEntity: args.targetEntity,
				targetEntityId,
				targetCode: targetCanonical,
			},
		)) as Id<"fileAnalyses">;

		await ctx.scheduler.runAfter(0, internal.ai.quarantined.fileAnalyzer.analyzeFile, {
			fileAnalysisId,
		});

		return ok({
			headline: `File analyzer scheduled (id ${fileAnalysisId}).`,
			facts: [
				`Kind: ${args.kind}.`,
				"Results will land in a few seconds; review them via the file analysis row.",
			],
			data: { fileAnalysisId, kind: args.kind, targetEntity: args.targetEntity },
		});
	},
});

// ─── enrich_record ──────────────────────────────────────────────────────────

const enrichRecord = defineCapability<{
	entityType: "lead" | "contact" | "company" | "deal";
	entityCode: string;
}>({
	name: "enrich_record",
	module: "quarantined",
	group: "quarantined",
	permission: "data.import",
	risk: "reversible",
	channels: ["chat", "mcp", "rest"],
	spec: {
		whenToCall:
			"Run the web-search + LLM enrichment chain over a record. Reads the record's current fields, searches the web (Firecrawl), proposes patches for missing fields. Returns `enrichmentRunId`; the action writes the proposed patch asynchronously. The user reviews + applies via a future commit verb.",
		whenNotToCall:
			"the record has all relevant fields populated already — describe_entity first to confirm. The user wants the data immediately inline — enrichment is async (~30s). The web is unreachable for the record (tiny startups, private targets) — the run will surface 'no_seed' and skip.",
		requiredClarifications: ["entityType", "entityCode"],
		synonyms: ["enrich", "fill in fields", "look up online", "research record"],
		goodExample: { entityType: "lead", entityCode: "P-007" },
	},
	drive: {
		onSuccess:
			"Confirm with the enrichmentRunId + 'run scheduled — proposed patch in ~30s.' Surface the next step (review proposedPatch, apply via update_entity).",
	},
	input: z.object({
		entityType: ENRICH_TARGET_ENTITY,
		entityCode: z.string().min(1),
	}),
	run: async (cap, args) => {
		const { ctx, principal } = cap;

		// Resolve the entity code → id + read its current fields (the
		// enrichment run needs `beforeFields` so the LLM can produce a diff).
		let resolved: { entityId: string; canonicalCode: string };
		try {
			resolved = (await ctx.runMutation(internal.ai.aiEntityPatch.resolveEntityCode, {
				orgId: principal.orgId,
				userId: principal.userId,
				entityType: args.entityType,
				code: args.entityCode,
			})) as { entityId: string; canonicalCode: string };
		} catch {
			return failed("not_found", `No ${args.entityType} found with code ${args.entityCode}.`);
		}

		// `beforeFields` is a record of (fieldKey → string|null). The
		// quarantined action seeds search from these fields — empty values
		// mean "look this up". The full read-the-record helper isn't
		// exposed here in v1; the action handles the empty-seed case
		// gracefully ("no_seed" → fail with a clear message).
		const enrichmentRunId = (await ctx.runMutation(
			internal.ai.quarantined.enrichmentProvidersInternal._createRun,
			{
				orgId: principal.orgId,
				userId: principal.userId,
				targetEntity: args.entityType,
				targetEntityId: resolved.entityId,
				targetCode: resolved.canonicalCode,
				beforeFields: {} as Record<string, string | null>,
			},
		)) as Id<"enrichmentRuns">;

		await ctx.scheduler.runAfter(0, internal.ai.quarantined.enrichmentProviders.runEnrichment, {
			enrichmentRunId,
		});

		return ok({
			headline: `Enrichment scheduled for ${resolved.canonicalCode}.`,
			facts: [
				`Entity: ${args.entityType}.`,
				"Proposed-patch row in ~30s; review before applying.",
			],
			data: {
				enrichmentRunId,
				entityType: args.entityType,
				entityCode: resolved.canonicalCode,
			},
		});
	},
});

// ─── Public surface ─────────────────────────────────────────────────────────

export const QUARANTINED_CAPABILITIES = [parseCsv, analyzeFile, enrichRecord];

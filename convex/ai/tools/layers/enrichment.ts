/**
 * convex/ai/tools/layers/enrichment.ts
 *
 * Week 5.1 — Enrichment AI tools (`PHASE-3-AI-AUDIT.md §6 Week 5`,
 * §2.6 Clay-style waterfall pattern).
 *
 * Two tools:
 *
 *   `enrich_record`         — propose. Snapshots the target record's fields,
 *                              kicks off the quarantined provider waterfall
 *                              (web_search → linkedin_lookup → email_finder
 *                              → domain_whois) synchronously, returns a
 *                              propose() with the suggested patch.
 *   `commit_enrich_record`  — privileged commit. Applies the approved
 *                              patch via `update_entity` (auth-bridge ForAI
 *                              twin, so we inherit its RBAC + activity log).
 *
 * Dual-LLM defence: the provider waterfall is a separate `internalAction`
 * with no tools (`convex/ai/quarantined/enrichmentProviders.ts`). The
 * commit step re-reads `proposedPatch` from the trusted DB row, never from
 * model args.
 */

import { z } from "zod";
import { internal } from "../../../_generated/api";
import { codeString } from "../../../_shared/synonyms";
import { registerTool } from "../../toolRegistry";
import { propose, requirePermission, runTool, type ToolContext } from "../_shared";

let _ctx: ToolContext | null = null;
export function setEnrichmentContext(c: ToolContext): void {
	_ctx = c;
}
function getCtx(): ToolContext {
	if (!_ctx) throw new Error("enrichment ctx not bound");
	return _ctx;
}

const TARGET_ENTITY = z.enum(["lead", "contact", "company", "deal"]);

// ─── enrich_record ───────────────────────────────────────────────────────────

registerTool({
	name: "enrich_record",
	layer: "data", // re-uses an existing layer — no new LayerId migration
	permission: "leads.update",
	confirmation: "twoStep",
	description: `
Find missing fields on a CRM record using a 4-step provider waterfall (web
search → LinkedIn lookup → email finder → domain WHOIS). The user reviews
the suggested patch and approves before any field is written.

PRE-FLIGHT FIRST: ALWAYS pass an existing record code (P-001, C-002, …).
If you don't have one, call \`search_crm\` first to find the record. Pass
the SAME entity type the search returned — never guess. The provider
waterfall is rate-limited (5 enrichments / minute / org).
	`.trim(),
	instruction: {
		whenToCall:
			"User asks to fill in missing data on a record ('enrich P-001', 'find Sarah's LinkedIn', 'lookup the company website'). Pass the record's code (P-XXX / C-XXX). The provider waterfall returns suggested values that the user reviews + approves.",
		whenNotToCall:
			"the user wants to MANUALLY set a field — call `update_entity` with explicit values instead. Don't call when the record code wasn't already resolved (call `search_crm` first).",
		preflight: ["search_crm"],
		requiredClarifications: ["entityType", "code"],
		synonyms: ["enrich", "lookup", "find missing data", "auto-fill"],
		goodExample: {
			description: "User: 'Enrich P-001 — find their email and LinkedIn.'",
			args: { entityType: "lead", code: "P-001" },
		},
		badExample: {
			description: "User: 'Find Sarah's email.'",
			args: { entityType: "lead", code: "Sarah" },
			whyBad: "code must be P-XXX. Resolve via search_crm first.",
		},
	},
	runbook: {
		onSuccess:
			"After commit, summarise which fields were filled in and from which provider. Suggest reviewing the record on the CRM detail page.",
		onValidationError:
			"If the record doesn't exist, surface the error verbatim and ask the user for the right code.",
		onPermissionDenied:
			"Tell the user they need leads.update / contacts.update permission to enrich records. Suggest contacting an admin.",
		suggestNext: "search_crm",
	},
	example: { entityType: "lead", code: "P-001" },
	schema: z.object({
		entityType: TARGET_ENTITY,
		code: codeString().describe(
			"personCode for lead/contact, dealCode for deal, or company code",
		),
	}),
	execute: async (args) =>
		runTool(async () => {
			const tc = getCtx();
			requirePermission(tc.permissions, "leads.update");

			// 1. Resolve target → snapshot its current fields.
			const snapshot = (await tc.ctx.runQuery(
				internal.ai.tools.layers.enrichmentInternal._snapshotEntityFields,
				{
					orgId: tc.orgId,
					userId: tc.userId,
					entityType: args.entityType,
					code: args.code,
				},
			)) as {
				entityId: string;
				code: string;
				beforeFields: Record<string, string | null>;
			} | null;

			if (!snapshot) {
				return {
					ok: false as const,
					error: `Record ${args.code} not found.`,
					code: "NOT_FOUND",
				};
			}

			// 2. Create the enrichment-run row.
			const enrichmentRunId = (await tc.ctx.runMutation(
				internal.ai.quarantined.enrichmentProvidersInternal._createRun,
				{
					orgId: tc.orgId,
					userId: tc.userId,
					targetEntity: args.entityType,
					targetEntityId: snapshot.entityId,
					targetCode: snapshot.code,
					beforeFields: snapshot.beforeFields,
				},
			)) as string;

			// 3. Run the quarantined provider waterfall synchronously.
			await tc.ctx.runAction(internal.ai.quarantined.enrichmentProviders.runEnrichment, {
				enrichmentRunId: enrichmentRunId as never,
			});

			// 4. Reload to read the result.
			const run = (await tc.ctx.runQuery(
				internal.ai.quarantined.enrichmentProvidersInternal._readRunInternal,
				{ enrichmentRunId: enrichmentRunId as never, orgId: tc.orgId },
			)) as {
				status: string;
				proposedPatch: Array<{
					field: string;
					value: string | null;
					source: string;
					confidence: number;
				}>;
				providerTrace: Array<{
					provider: string;
					ok: boolean;
					summary?: string;
					error?: string;
				}>;
				errors?: string[];
			} | null;

			if (!run || run.status !== "ready") {
				const errors = run?.errors ?? ["Enrichment failed before reaching ready state"];
				return {
					ok: false as const,
					error: errors.join(" "),
					code: "ENRICHMENT_FAILED",
				};
			}

			if (run.proposedPatch.length === 0) {
				return {
					ok: false as const,
					error: "No new fields could be discovered for this record. Try a different record or add a company website / LinkedIn URL first.",
					code: "NO_PATCHES",
				};
			}

			return propose(
				"enrich_record",
				{
					enrichmentRunId,
					entityType: args.entityType,
					code: snapshot.code,
				},
				{
					title: `Enrich ${args.entityType} ${snapshot.code}`,
					fields: run.proposedPatch.map((p) => ({
						label: p.field,
						value: `${p.value ?? "—"} (${Math.round(p.confidence * 100)}%, ${p.source.slice(0, 60)})`,
					})),
				},
			);
		}),
});

// ─── commit_enrich_record ────────────────────────────────────────────────────

registerTool({
	name: "commit_enrich_record",
	layer: "data",
	permission: "leads.update",
	confirmation: "none",
	description: "Internal: commit a previously-proposed record enrichment.",
	schema: z.object({
		enrichmentRunId: z.string().min(1),
		entityType: TARGET_ENTITY,
		code: codeString(),
	}),
	execute: async (args) =>
		runTool(async () => {
			const tc = getCtx();
			requirePermission(tc.permissions, "leads.update");

			// Re-read the run from the DB. The model's args carry only the
			// run id; the actual patch comes from the trusted DB row —
			// defends against tampering between propose and commit.
			const run = (await tc.ctx.runQuery(
				internal.ai.quarantined.enrichmentProvidersInternal._readRunInternal,
				{ enrichmentRunId: args.enrichmentRunId as never, orgId: tc.orgId },
			)) as {
				status: string;
				targetCode?: string;
				proposedPatch: Array<{
					field: string;
					value: string | null;
					source: string;
					confidence: number;
				}>;
			} | null;

			if (!run || run.status !== "ready") {
				return { ok: false as const, error: "Enrichment run not ready", code: "NOT_READY" };
			}

			// Build the field patch — only fields with confidence >= 0.5.
			const patch: Record<string, string | null> = {};
			for (const p of run.proposedPatch) {
				if (p.confidence >= 0.5) patch[p.field] = p.value;
			}

			if (Object.keys(patch).length === 0) {
				return {
					ok: false as const,
					error: "No high-confidence patches to apply",
					code: "EMPTY_PATCH",
				};
			}

			// Single helper handles canonical / custom / unknown routing
			// and rate-limiting. Same call shape as `commit_update_entity`,
			// so enrichment and direct updates share an identical write path.
			const result = (await tc.ctx.runMutation(
				internal.ai.aiEntityPatch.applyEntityPatchByCode,
				{
					orgId: tc.orgId,
					userId: tc.userId,
					entityType: args.entityType,
					code: args.code,
					patch,
				},
			)) as {
				canonicalCode: string;
				columnsApplied: string[];
				customFieldsApplied: Array<{ name: string; value: unknown }>;
				unknownFields: string[];
			};

			// Mark the run completed (use the patch helper from the providers internal file).
			await tc.ctx.runMutation(
				internal.ai.quarantined.enrichmentProvidersInternal._patchRun,
				{
					enrichmentRunId: args.enrichmentRunId as never,
					patch: {
						status: "completed",
						committedPatch: Object.entries(patch).map(([field, value]) => ({
							field,
							value,
						})),
					},
				},
			);

			const summary = Object.entries(patch)
				.map(([k, v]) => `${k}=${v ?? "—"}`)
				.join(", ");
			const trailer =
				result.unknownFields.length > 0
					? ` Skipped (unknown): ${result.unknownFields.join(", ")}.`
					: "";

			return {
				ok: true as const,
				data: { fieldsUpdated: Object.keys(patch).length, summary, ...result },
				display: `Updated ${args.entityType} ${result.canonicalCode}: ${summary}.${trailer}`,
			};
		}),
});

function _unused_resolveUpdateMutation_kept_for_future_enrichment_routing(
	entity: "lead" | "contact" | "company" | "deal",
): string | null {
	// Reserved hook — when enrichment grows beyond canonical fields (e.g.
	// applying enriched custom-field values via a different mutation path),
	// this is where the resolver lives. Today we use ENTITY_UPDATE_MUTATION
	// directly above. Keeping the export so the diff stays focused.
	void entity;
	return null;
}

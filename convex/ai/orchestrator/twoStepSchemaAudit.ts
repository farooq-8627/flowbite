/**
 * convex/ai/orchestrator/twoStepSchemaAudit.ts
 *
 * Programmatic audit of every twoStep tool's propose-vs-commit schema
 * pair. Catches the class of bug behind the 2026-05-24 incident
 * (propose carries `notes`, commit's underlying mutation rejects it,
 * user sees the dreaded "An unexpected error occurred").
 *
 * Behaviour at runtime:
 *   - The resume.ts zod-strip already protects every twoStep tool
 *     from the silent-loss case. This file is the design-time check
 *     that surfaces NEW mismatches early — the moment a tool author
 *     adds a propose-only field that the commit doesn't declare, an
 *     `audit()` run flags it and a unit test pins the finding.
 *
 * Output shape:
 *   - `auditTwoStepSchemas()` returns one entry per twoStep tool with:
 *     - the propose-only fields (stripped at runtime — usually fine)
 *     - the commit-only fields (would need to come from somewhere
 *       OTHER than the propose payload — usually fine for tools that
 *       follow the "DB-row id → re-read in commit" gold pattern)
 *     - a verdict: 'ok' | 'preview-only-fields' | 'commit-only-fields'
 *
 * Use the report from `convex/ai/agentScorer.test.ts` to assert no new
 * silent-loss case slips in.
 */

import type { z } from "zod";
import { getRegisteredTool } from "../toolRegistry";

export interface SchemaDiff {
	proposeName: string;
	commitName: string;
	/** Fields in propose but not in commit. Stripped at runtime. */
	proposeOnly: string[];
	/** Fields in commit but not in propose. Must come from a server-side rebuild path. */
	commitOnly: string[];
	verdict: "ok" | "preview-only-fields" | "commit-only-fields" | "both-mismatched";
}

/**
 * Pull the top-level field names off a zod object schema.
 * Returns [] for non-object schemas (e.g. z.array(...)) — those are
 * never used as the top-level shape of a tool schema in this codebase.
 */
function fieldNames(schema: z.ZodTypeAny): string[] {
	const def = (schema as unknown as { _def?: { shape?: unknown } })._def;
	if (!def) return [];
	const shape = def.shape;
	if (typeof shape === "function") {
		try {
			return Object.keys(shape() as Record<string, unknown>);
		} catch {
			return [];
		}
	}
	if (shape && typeof shape === "object") {
		return Object.keys(shape as Record<string, unknown>);
	}
	return [];
}

/**
 * Audit every `commit_X` tool against its sibling propose tool `X`.
 * Caller must have imported every tool module so the registry is
 * populated — vitest auto-imports happen via `agentScorer.test.ts`'s
 * top-level import.
 */
export function auditTwoStepSchemas(toolNames: string[]): SchemaDiff[] {
	const out: SchemaDiff[] = [];
	const commitNames = toolNames.filter((n) => n.startsWith("commit_"));
	for (const commitName of commitNames) {
		const proposeName = commitName.slice("commit_".length);
		const propose = getRegisteredTool(proposeName);
		const commit = getRegisteredTool(commitName);
		if (!propose || !commit) continue;
		const proposeFields = new Set(fieldNames(propose.schema));
		const commitFields = new Set(fieldNames(commit.schema));
		const proposeOnly = [...proposeFields].filter((f) => !commitFields.has(f));
		const commitOnly = [...commitFields].filter((f) => !proposeFields.has(f));
		const hasProposeOnly = proposeOnly.length > 0;
		const hasCommitOnly = commitOnly.length > 0;
		const verdict: SchemaDiff["verdict"] =
			hasProposeOnly && hasCommitOnly
				? "both-mismatched"
				: hasProposeOnly
					? "preview-only-fields"
					: hasCommitOnly
						? "commit-only-fields"
						: "ok";
		out.push({ proposeName, commitName, proposeOnly, commitOnly, verdict });
	}
	return out;
}

/**
 * Audit IDs of tools where mismatch is INTENTIONAL by design — never
 * surface as a regression. Each entry documents WHY the mismatch is
 * safe (e.g. preview-only field stripped at runtime, or DB-row id
 * pattern where commit reads from the trusted row not from model args).
 *
 * Don't add a tool here without a one-line rationale + a cross-ref to
 * the audit doc. The list is the SSOT for "these mismatches are
 * known and safe".
 */
export const KNOWN_SAFE_MISMATCHES: Record<
	string,
	{ kind: "preview-only" | "db-row-id"; reason: string }
> = {
	cancel_invitation: {
		kind: "preview-only",
		reason: "`email` is shown in the approval card; stripped at runtime.",
	},
	remove_member: {
		kind: "preview-only",
		reason: "`name` is shown in the approval card; stripped at runtime.",
	},
	remove_field: {
		kind: "preview-only",
		reason: "`label` is shown in the approval card; commit also accepts label optionally.",
	},
	delete_saved_view: {
		kind: "preview-only",
		reason: "`name` is shown in the approval card; stripped at runtime.",
	},
	apply_template: {
		kind: "preview-only",
		reason: "`templateName` is shown in the approval card; stripped at runtime.",
	},
	delete_tag: {
		kind: "preview-only",
		reason: "`name` is shown in the approval card; stripped at runtime.",
	},
	archive_note_category: {
		kind: "preview-only",
		reason: "`name` is shown in the approval card; stripped at runtime.",
	},
	restore_entity: {
		kind: "preview-only",
		reason: "`name` is shown in the approval card; stripped at runtime.",
	},
	import_csv: {
		kind: "db-row-id",
		reason: "Propose returns {csvImportId, targetEntity, rowCount}; commit re-reads previewRows from the DB. The user input shape (fileId) is intentionally distinct.",
	},
	analyze_file: {
		kind: "db-row-id",
		reason: "Propose returns {fileAnalysisId, kind, targetEntity, code}; commit re-reads proposedPatch from the DB.",
	},
	enrich_record: {
		kind: "db-row-id",
		reason: "Propose returns {enrichmentRunId, entityType, code}; commit re-reads proposedPatch from the DB.",
	},
};

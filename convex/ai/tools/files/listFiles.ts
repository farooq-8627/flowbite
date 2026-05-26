/**
 * convex/ai/tools/files/listFiles.ts
 *
 * Stage 4 of /SPRINT-PLAN.md (2026-05-26). Read-only list_files tool.
 *
 * Routes to one of three internal queries based on the supplied target:
 *   - `personCode` / `dealCode` / `companyCode` → listForEntityForAI
 *     (which deduplicates direct + tagged + person-scope files)
 *   - `scope` + `scopeId`                       → listByScopeForAI
 *
 * Atomic — no propose / commit. Permission gate: `files.view`.
 */
import { z } from "zod";
import { registerTool } from "../../toolRegistry";
import { coerceInt, optionalString, requirePermission, runTool, toolQuery } from "../_shared";
import { getFilesCtx } from "./_context";

type FileRow = {
	_id: string;
	name: string;
	scope: string;
	scopeId: string;
	mimeType: string;
	size: number;
	tags?: string[];
	createdAt: number;
	uploadedBy?: string;
};

const schema = z
	.object({
		personCode: optionalString().describe(
			"Person code (P-001). Lists files attached to this person AND any cross-entity tags pointing at them.",
		),
		dealCode: optionalString().describe(
			"Deal code (D-001). Lists files attached directly to the deal + person-scope files tagged 'deal:D-001'.",
		),
		companyCode: optionalString().describe(
			"Company code (C-001). Lists files attached directly to the company + cross-tagged files.",
		),
		scope: optionalString().describe(
			"Raw scope literal — 'org' / 'lead' / 'contact' / 'deal' / 'company' / 'user' / 'field'. Use only when you have an exact (scope, scopeId) pair.",
		),
		scopeId: optionalString().describe(
			"Raw scope id — pairs with `scope`. Power-user escape hatch.",
		),
		limit: coerceInt((n) => n.min(1).max(100).default(20)).describe(
			"Maximum number of files to return. Default 20.",
		),
	})
	.refine(
		(v) =>
			[v.personCode, v.dealCode, v.companyCode, v.scope || v.scopeId].filter(Boolean)
				.length >= 1,
		{
			message:
				"Provide one of personCode / dealCode / companyCode, or both scope + scopeId together.",
		},
	)
	.refine((v) => !v.scope === !v.scopeId, {
		message: "scope and scopeId must be supplied together.",
	});

registerTool({
	name: "list_files",
	layer: "files",
	permission: "files.view",
	confirmation: "none",
	description: "List files attached to a person, deal, company, or any (scope, scopeId) pair.",
	instruction: {
		whenToCall:
			"Use when the user asks to see / list / show / find files / attachments / documents linked to a record.",
		whenNotToCall:
			"the user wants to upload a file (not supported — files are uploaded via the UI). For raw bytes / extracted text, use analyze_file instead.",
		preflight: ["search_crm"],
		synonyms: [
			"show files",
			"list attachments",
			"what files",
			"any documents",
			"contracts on this deal",
		],
		goodExample: {
			description: "User: 'Show me all files attached to deal D-007.'",
			args: { dealCode: "D-007" },
		},
		badExample: {
			description: "User: 'List files.' — no target supplied.",
			args: {},
			whyBad: "list_files requires a target. Call ask_user_input to ask which entity / scope to list, or default to a specific record from the current routeContext.",
		},
	},
	runbook: {
		onSuccess:
			"Reply with one short sentence stating how many files were found ('3 files attached.'); the structured display already lists them.",
		onValidationError:
			"If both scope + scopeId AND personCode/dealCode were given, ask the user which one they meant.",
		onEmpty:
			"Tell the user no files are attached, then suggest using analyze_file or upload via the UI.",
		onPermissionDenied:
			"Tell the user they need files.view permission. Suggest contacting an admin.",
	},
	schema,
	execute: async (args) =>
		runTool(async () => {
			const tc = getFilesCtx();
			requirePermission(tc.permissions, "files.view");

			const cap = args.limit ?? 20;

			let rows: FileRow[];
			if (args.personCode) {
				rows = (await toolQuery(tc, "files/queries:listForEntity", {
					orgId: tc.orgId,
					scope: "person",
					scopeId: args.personCode,
					personCode: args.personCode,
				})) as FileRow[];
			} else if (args.dealCode) {
				rows = (await toolQuery(tc, "files/queries:listForEntity", {
					orgId: tc.orgId,
					scope: "deal",
					scopeId: args.dealCode,
				})) as FileRow[];
			} else if (args.companyCode) {
				rows = (await toolQuery(tc, "files/queries:listForEntity", {
					orgId: tc.orgId,
					scope: "company",
					scopeId: args.companyCode,
				})) as FileRow[];
			} else {
				// raw scope path
				rows = (await toolQuery(tc, "files/queries:listByScope", {
					orgId: tc.orgId,
					scope: args.scope ?? "org",
					scopeId: args.scopeId ?? String(tc.orgId),
				})) as FileRow[];
			}

			const limited = rows.slice(0, cap);

			const target = args.personCode
				? `Person ${args.personCode}`
				: args.dealCode
					? `Deal ${args.dealCode}`
					: args.companyCode
						? `Company ${args.companyCode}`
						: `${args.scope}:${args.scopeId}`;

			const headline =
				limited.length === 0
					? `No files attached to ${target}.`
					: `${limited.length} file${limited.length === 1 ? "" : "s"} attached to ${target}.`;

			return {
				ok: true as const,
				data: { count: limited.length, files: limited },
				summary: {
					headline,
					table: limited.slice(0, 8).map((f) => ({
						label: f.name,
						value: `${f.mimeType} · ${formatSize(f.size)} · ${formatTags(f.tags)}`,
					})),
				},
			};
		}),
});

function formatSize(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatTags(tags?: string[]): string {
	if (!tags || tags.length === 0) return "no tags";
	return tags.slice(0, 4).join(", ");
}

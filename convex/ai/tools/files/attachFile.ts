/**
 * convex/ai/tools/files/attachFile.ts
 *
 * 2026-05-27 — User-reported `P-005` bug. Closes the gap that the
 * previous toolkit had: "the AI cannot upload files (UI-only)" was
 * literally true, BUT the user's real intent — "take this file the user
 * just uploaded via the chat composer and put it on profile P-001's
 * Files tab" — was unreachable because no tool re-scoped a file from
 * its staging scope (org/user) to a target entity scope.
 *
 * This tool fills that gap. It does NOT generate upload URLs or accept
 * raw bytes — those still live on the UI. Instead it takes a fileId
 * (from a chat-message marker `[file:<id> ...]` or from list_files) and
 * re-scopes it onto a (lead/contact/deal/company) target by code.
 *
 * Two-step:
 *
 *   attach_file (propose) → confirmation card with file name + new target
 *      ↓ user approves
 *   commit_attach_file    → calls files/mutations:attachForAI
 *
 * Pre-flight: the target code is verified to exist. If the user passes
 * a non-existent personCode, the propose tool returns ok:false with a
 * clear "no <entity> with code X exists" error — same shape as the
 * 2026-05-27 list_files fix.
 *
 * Permission: `files.upload` (the public mutation also accepts
 * `files.deleteAny` moderators — re-checked at the mutation layer).
 * Approval category: `files`.
 */
import { z } from "zod";
import { registerTool } from "../../toolRegistry";
import {
	optionalString,
	propose,
	requirePermission,
	runTool,
	toolMutation,
	toolQuery,
} from "../_shared";
import { getFilesCtx } from "./_context";

const schema = z
	.object({
		fileId: z
			.string()
			.describe(
				"Convex file _id. Pulled from a chat-message marker `[file:<id> ...]` or from list_files.",
			),
		personCode: optionalString().describe(
			"Person code (P-001). The file will appear on this person's Files tab.",
		),
		dealCode: optionalString().describe(
			"Deal code (D-001). The file will appear on this deal's Files tab.",
		),
		companyCode: optionalString().describe(
			"Company code (C-001). The file will appear on this company's Files tab.",
		),
		extraTags: z
			.array(z.string().min(1))
			.max(10)
			.optional()
			.describe(
				"Additional tags to add (existing tags are kept). Use cross-entity attribution markers like 'deal:D-001' for files that should also surface on the deal page.",
			),
		displayName: z
			.string()
			.optional()
			.describe(
				"File name for the propose card. Look up via list_files first, or read it from the chat-message marker.",
			),
	})
	.refine((v) => [v.personCode, v.dealCode, v.companyCode].filter(Boolean).length === 1, {
		message:
			"Provide exactly one of personCode / dealCode / companyCode — files attach to one primary entity. Use extraTags for cross-attribution.",
	});

registerTool({
	name: "attach_file",
	layer: "files",
	permission: "files.upload",
	confirmation: "twoStep",
	approvalCategory: "files",
	description:
		"Attach an already-uploaded file to a person, deal, or company. Two-step — shows the file + new target before writing.",
	instruction: {
		whenToCall:
			"User uploaded a file via the chat composer and asks to attach / add / move / put it onto a person / deal / company. The chat-message includes a `[file:<id> ...]` marker carrying the fileId; pass that as `fileId`. Pass exactly one of personCode / dealCode / companyCode for the destination.",
		whenNotToCall:
			"the user wants to retag a file in place (use update_file_tags) OR upload a brand-new file (UI-only — tell the user to use the upload button on the entity's Files tab) OR delete a file (use remove_file).",
		preflight: ["search_crm"],
		requiredClarifications: ["fileId", "destination code"],
		synonyms: [
			"attach this file",
			"add file to profile",
			"put this on person",
			"link file to deal",
			"move file to company",
			"file should go to",
		],
		goodExample: {
			description:
				"User: 'Add this PDF to deal D-007.' Chat-message marker carried the fileId.",
			args: {
				fileId: "abc123def456",
				dealCode: "D-007",
				displayName: "Proposal v3.pdf",
			},
		},
		badExample: {
			description:
				"User: 'Add this video to P-005.' but no person P-005 exists in the workspace.",
			args: { fileId: "abc123", personCode: "P-005" },
			whyBad: "attach_file pre-flight will reject this with 'no person with code P-005 exists'. Always run search_crm first when the user gives a code, OR call get_entity_detail to confirm.",
		},
	},
	runbook: {
		onSuccess:
			"Confirm in one short sentence with the file name and the entity it now lives on. The Files tab on that record will show the file on next render.",
		onValidationError:
			"If the destination code doesn't resolve, surface the error verbatim and ask the user to confirm the code (or call search_crm by name).",
		onPermissionDenied:
			"Tell the user they need files.upload permission. Suggest contacting an admin.",
	},
	schema,
	execute: async (args) =>
		runTool(async () => {
			const tc = getFilesCtx();
			requirePermission(tc.permissions, "files.upload");

			// ── Entity-existence pre-flight ─────────────────────────────
			// Mirrors the 2026-05-27 list_files fix: surface a clean
			// "no <entity> with code X exists" before the propose card
			// goes to the user, so we don't waste an approval round-trip
			// on a doomed mutation.
			let scope: "person" | "deal" | "company";
			let scopeId: string;
			let targetLabel: string;

			if (args.personCode) {
				const person = (await toolQuery(tc, "crm/people/queries:getByPersonCode", {
					orgId: tc.orgId,
					personCode: args.personCode,
				}).catch(() => null)) as { displayName?: string } | null;
				if (!person) {
					return {
						ok: false as const,
						error: `No person found with code ${args.personCode}. Use search_crm to find the right code, or ask the user to confirm the personCode.`,
					};
				}
				scope = "person";
				scopeId = args.personCode;
				targetLabel = `${person.displayName ?? "person"} (${args.personCode})`;
			} else if (args.dealCode) {
				const deal = (await toolQuery(tc, "crm/entities/deals/queries:getByDealCode", {
					orgId: tc.orgId,
					dealCode: args.dealCode,
				}).catch(() => null)) as { title?: string } | null;
				if (!deal) {
					return {
						ok: false as const,
						error: `No deal found with code ${args.dealCode}. Use search_crm to find the right code, or ask the user to confirm the dealCode.`,
					};
				}
				scope = "deal";
				scopeId = args.dealCode;
				targetLabel = `${deal.title ?? "deal"} (${args.dealCode})`;
			} else if (args.companyCode) {
				const company = (await toolQuery(
					tc,
					"crm/entities/companies/queries:getByCompanyCode",
					{ orgId: tc.orgId, companyCode: args.companyCode },
				).catch(() => null)) as { name?: string } | null;
				if (!company) {
					return {
						ok: false as const,
						error: `No company found with code ${args.companyCode}. Use search_crm to find the right code, or ask the user to confirm the companyCode.`,
					};
				}
				scope = "company";
				scopeId = args.companyCode;
				targetLabel = `${company.name ?? "company"} (${args.companyCode})`;
			} else {
				// Unreachable — schema.refine() guarantees exactly one is set.
				return {
					ok: false as const,
					error: "Internal error: no destination code provided.",
				};
			}

			// All good — render the propose card. Carry the resolved scope
			// + scopeId + targetLabel through to commit so we don't have
			// to re-resolve.
			return propose(
				"attach_file",
				{
					fileId: args.fileId,
					scope,
					scopeId,
					extraTags: args.extraTags,
					displayName: args.displayName,
					targetLabel,
				},
				{
					title: `Attach ${args.displayName ?? "file"} to ${targetLabel}`,
					fields: [
						{ label: "File", value: args.displayName ?? args.fileId },
						{ label: "Attach to", value: targetLabel },
						...(args.extraTags && args.extraTags.length > 0
							? [{ label: "Extra tags", value: args.extraTags.join(", ") }]
							: []),
					],
				},
			);
		}),
});

const commitSchema = z.object({
	fileId: z.string(),
	scope: z.enum(["person", "deal", "company"]),
	scopeId: z.string(),
	extraTags: z.array(z.string()).optional(),
	displayName: z.string().optional(),
	targetLabel: z.string().optional(),
});

registerTool({
	name: "commit_attach_file",
	layer: "files",
	permission: "files.upload",
	confirmation: "none",
	description: "Internal: commit a pre-approved file attachment.",
	schema: commitSchema,
	execute: async (args) =>
		runTool(async () => {
			const tc = getFilesCtx();
			requirePermission(tc.permissions, "files.upload");
			const result = (await toolMutation(tc, "files/mutations:attach", {
				orgId: tc.orgId,
				fileId: args.fileId,
				scope: args.scope,
				scopeId: args.scopeId,
				tags: args.extraTags,
			})) as { fileId: string; scope: string; scopeId: string; tags: string[] };

			const target = args.targetLabel ?? `${args.scope} ${args.scopeId}`;
			return {
				ok: true as const,
				data: result,
				summary: {
					headline: `Attached ${args.displayName ?? "file"} to ${target}`,
					table: [
						{ label: "File", value: args.displayName ?? args.fileId },
						{ label: "Now on", value: target },
					],
					suggestedNext: [
						{
							label: "List files on this record",
							intent: `Show me the files attached to ${target}`,
						},
					],
				},
			};
		}),
});

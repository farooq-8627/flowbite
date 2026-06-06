/**
 * Files capabilities — the AI-callable surface for the `files` table.
 * Wraps the existing `*ForAI` internal twins under `convex/files/`;
 * never re-implements business logic (max-size, MIME whitelist, scope
 * validation all live in the underlying mutations).
 *
 * Surface (4 caps in the `files` group):
 *
 *   list_files            list files attached to a person/deal/company
 *   attach_file           re-scope a file to a new entity (or add tags)
 *   update_file_tags      patch the tags array on a file row
 *   remove_file           soft-delete a file (purges bytes from storage)
 *
 * Group invariants (mirrored in the playbook below):
 *
 *   1. Files are SCOPED on (scope, scopeId) where scope is one of
 *      "org" | "person" | "lead" | "contact" | "deal" | "company"
 *      | "user" | "field". The AI capability always passes a
 *      USER-friendly entity-code (P-NNN / D-NNN / C-NNN) and the
 *      capability resolves it to the scope+scopeId pair internally.
 *      "person" scope keys on personCode (P-NNN string), NOT a Convex Id.
 *   2. Uploading bytes is OUT OF SCOPE for the AI (the storage upload
 *      URL flow is browser-side via `generateUploadUrl` + `record`
 *      mutation). The AI surface only re-scopes / tags / removes
 *      EXISTING file rows; uploads come from the user.
 *   3. `attach_file` does NOT re-validate MIME type — re-scoping is a
 *      metadata-only edit; the original upload's MIME check is the
 *      authoritative gate.
 *   4. `remove_file` is a soft-delete (sets `deletedAt`) that ALSO
 *      purges the bytes from Convex File Storage. Classified
 *      `reversible` (matches V1 policy) — the activity log preserves
 *      the audit trail; if S10 widens the irreversible fence to
 *      single-row destructive ops, flip the classification here.
 *   5. Permission keys: `files.view` for reads, `files.upload` for
 *      attach + tag patches, `files.delete` for remove (own files),
 *      `files.deleteAny` admin override.
 */
import { z } from "zod";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { defineCapability } from "../ai/registry/define";
import { defineGroup } from "../ai/registry/groups";
import { failed, ok } from "../ai/registry/result";
import type { CapabilityCtx } from "../ai/registry/types";

// ─── Closed unions ──────────────────────────────────────────────────────────

const FILE_ENTITY_TYPE = z.enum(["lead", "contact", "deal", "company", "person"]);
type FileEntityType = z.infer<typeof FILE_ENTITY_TYPE>;

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Resolve an entity-code (P-NNN / D-NNN / C-NNN) to a (scope, scopeId,
 * personCode) triple the underlying `files` mutations key on. The schema
 * scopes a file row by a string scopeId — for person-scope it's the
 * personCode; for deal/company it's the public code. The resolveEntityCode
 * helper returns the canonical code (e.g. "P-007"), which is exactly what
 * the scopeId should be.
 */
async function resolveFileScope(
	ctx: CapabilityCtx,
	args: { entityType: FileEntityType; entityCode: string },
): Promise<{ scope: string; scopeId: string; personCode?: string } | { error: string }> {
	// "person" maps to "lead" for resolution purposes — personCode is on the lead row.
	const resolverType =
		args.entityType === "person"
			? "lead"
			: (args.entityType as "lead" | "contact" | "deal" | "company");
	try {
		const resolved = (await ctx.ctx.runMutation(internal.ai.aiEntityPatch.resolveEntityCode, {
			orgId: ctx.principal.orgId,
			userId: ctx.principal.userId,
			entityType: resolverType,
			code: args.entityCode,
		})) as { entityType: string; canonicalCode: string };

		if (args.entityType === "person") {
			return { scope: "person", scopeId: resolved.canonicalCode };
		}
		if (args.entityType === "lead" || args.entityType === "contact") {
			// Persons (lead + contact) share the personCode-keyed bucket; surface
			// the canonicalCode as the personCode so list_files can fold person-scope
			// rows into the result.
			return {
				scope: args.entityType,
				scopeId: resolved.canonicalCode,
				personCode: resolved.canonicalCode,
			};
		}
		// deal / company
		return { scope: args.entityType, scopeId: resolved.canonicalCode };
	} catch (err) {
		return {
			error: `Could not resolve ${args.entityType} ${args.entityCode}: ${err instanceof Error ? err.message : String(err)}`,
		};
	}
}

// ─── Group playbook ─────────────────────────────────────────────────────────

defineGroup({
	name: "files",
	playbook: `Read first → \`list_files\` with \`{entityType, entityCode}\` to find a file's _id BEFORE \`update_file_tags\` / \`attach_file\` / \`remove_file\`. Files are scoped on (scope, scopeId); the capability translates from the user-friendly entity-code to the underlying scope+scopeId pair.

Attach → \`attach_file\` re-scopes an existing file to a new entity. Use when the user uploaded a file under one record and now wants it surfaced under another (e.g. uploaded the contract on the lead, wants it under the deal). Tag merging is automatic.

Tag → \`update_file_tags\` REPLACES the tags array (not merge). Read existing tags via list_files first if you want to preserve them.

Remove → \`remove_file\` soft-deletes the row + purges the bytes. The activity log preserves "this file existed". Owner of the file can remove with \`files.delete\`; admin can with \`files.deleteAny\`.

Out of scope: uploading bytes (browser-only flow via generateUploadUrl + record). The AI never invents fileIds — always list first.`,
});

// ─── list_files ─────────────────────────────────────────────────────────────

const listFiles = defineCapability<{
	entityType: FileEntityType;
	entityCode: string;
}>({
	name: "list_files",
	module: "files",
	group: "files",
	permission: "files.view",
	risk: "safe",
	channels: ["chat", "whatsapp", "mcp", "rest"],
	spec: {
		whenToCall:
			"List files attached to a record. Pass `{entityType, entityCode}` (P-NNN / D-NNN / C-NNN). Person-scope files are folded in for lead/contact reads via the canonical personCode.",
		whenNotToCall:
			"the user wants to UPLOAD a file — uploads happen in the browser via the file picker, not the AI surface. The user wants files attached to a CHAT MESSAGE — those flow via the message's `attachments` array (handled by send_message).",
		requiredClarifications: ["entityType", "entityCode"],
		synonyms: ["list attachments", "files for", "show files"],
		goodExample: { entityType: "deal", entityCode: "D-007" },
		badExample: {
			args: { entityType: "deal", entityCode: "Acme deal" },
			why: "entityCode must be the public code (D-NNN). Resolve via `search_crm` first.",
		},
	},
	drive: {
		onSuccess:
			"Narrate the count + the top 3 by recency. The result card carries the full list with download URLs.",
		onEmpty: "No files attached yet. The user can upload one via the record's drop-zone.",
	},
	input: z.object({
		entityType: FILE_ENTITY_TYPE,
		entityCode: z.string().min(1),
	}),
	run: async (cap, args) => {
		const { ctx, principal } = cap;
		const resolved = await resolveFileScope(cap, args);
		if ("error" in resolved) return failed("not_found", resolved.error);

		const rows = (await ctx.runQuery(internal.files.queries.listForEntityForAI, {
			orgId: principal.orgId,
			userId: principal.userId,
			scope: resolved.scope,
			scopeId: resolved.scopeId,
			personCode: resolved.personCode,
		})) as Array<{
			_id: string;
			name: string;
			size: number;
			mimeType: string;
			tags?: string[];
			createdAt: number;
			url?: string | null;
		}>;
		if (rows.length === 0) {
			return ok({
				headline: `No files attached to ${args.entityCode}.`,
				data: { files: [] as unknown[] },
			});
		}
		const top = rows.slice(0, 5);
		return ok({
			headline: `${rows.length} file${rows.length === 1 ? "" : "s"} on ${args.entityCode}.`,
			changes: top.map((f) => ({
				label: f.name,
				value: `${(f.size / 1024).toFixed(1)} KB · ${f.mimeType}${f.tags && f.tags.length > 0 ? ` · ${f.tags.slice(0, 2).join(", ")}` : ""}`,
				emphasis: "unchanged" as const,
			})),
			data: { files: rows },
		});
	},
});

// ─── attach_file ────────────────────────────────────────────────────────────

const attachFile = defineCapability<{
	fileId: string;
	entityType: FileEntityType;
	entityCode: string;
	tags?: string[];
}>({
	name: "attach_file",
	module: "files",
	group: "files",
	permission: "files.upload",
	risk: "reversible",
	channels: ["chat", "mcp", "rest"],
	spec: {
		whenToCall:
			"Re-scope an existing file to a different entity. Surfaces the file under the destination's `list_files` view; tags are MERGED with the existing tag list (not replaced). Owner of the file OR admin (`files.deleteAny`) may move.",
		whenNotToCall:
			"the user wants to TAG a file without moving it — call update_file_tags. The user wants to upload a fresh file — that's a browser-side flow.",
		requiredClarifications: ["fileId", "entityType", "entityCode"],
		synonyms: ["link file", "attach to", "move file", "re-attach"],
		goodExample: {
			fileId: "k123abc",
			entityType: "deal",
			entityCode: "D-007",
			tags: ["contract"],
		},
	},
	drive: {
		onSuccess: "Confirm with the destination entityCode and the new tag set if any.",
	},
	input: z.object({
		fileId: z.string().min(1).describe("File _id."),
		entityType: FILE_ENTITY_TYPE,
		entityCode: z.string().min(1),
		tags: z
			.array(z.string().min(1))
			.optional()
			.describe("Tags to UNION with the existing tags. Empty array = no tag change."),
	}),
	run: async (cap, args) => {
		const { ctx, principal } = cap;
		const resolved = await resolveFileScope(cap, args);
		if ("error" in resolved) return failed("not_found", resolved.error);

		const result = (await ctx.runMutation(internal.files.mutations.attachForAI, {
			orgId: principal.orgId,
			userId: principal.userId,
			fileId: args.fileId as Id<"files">,
			scope: resolved.scope,
			scopeId: resolved.scopeId,
			tags: args.tags,
		})) as { fileId: string; scope: string; scopeId: string; tags: string[] };

		return ok({
			headline: `Attached file to ${args.entityCode}.`,
			changes: [
				{ label: "File", value: result.fileId, emphasis: "unchanged" },
				{ label: "Attached to", value: args.entityCode, emphasis: "changed" },
				...(result.tags.length > 0
					? [
							{
								label: "Tags",
								value: result.tags.join(", "),
								emphasis: "added" as const,
							},
						]
					: []),
			],
			data: result,
		});
	},
});

// ─── update_file_tags ───────────────────────────────────────────────────────

const updateFileTags = defineCapability<{ fileId: string; tags: string[] }>({
	name: "update_file_tags",
	module: "files",
	group: "files",
	permission: "files.upload",
	risk: "reversible",
	channels: ["chat", "mcp", "rest"],
	spec: {
		whenToCall:
			"Replace the tags array on a file. Pass the COMPLETE new tag list — this is a REPLACE, not a merge. Read existing tags via list_files first if you want to preserve any.",
		whenNotToCall:
			"the user wants to MOVE the file to a different record — call attach_file (which also unions tags).",
		requiredClarifications: ["fileId", "tags"],
		synonyms: ["tag file", "label file", "update file labels"],
		goodExample: { fileId: "k123abc", tags: ["contract", "signed"] },
	},
	drive: {
		onSuccess: "Confirm with the new tag set.",
	},
	input: z.object({
		fileId: z.string().min(1),
		tags: z.array(z.string().min(1)).max(20),
	}),
	run: async (cap, args) => {
		const { ctx, principal } = cap;
		await ctx.runMutation(internal.files.mutations.updateTagsForAI, {
			orgId: principal.orgId,
			userId: principal.userId,
			fileId: args.fileId as Id<"files">,
			tags: args.tags,
		});
		return ok({
			headline: "File tags updated.",
			changes: [
				{ label: "File", value: args.fileId, emphasis: "unchanged" },
				{
					label: "Tags",
					value: args.tags.length > 0 ? args.tags.join(", ") : "(cleared)",
					emphasis: "changed",
				},
			],
			data: { fileId: args.fileId, tags: args.tags },
		});
	},
});

// ─── remove_file ────────────────────────────────────────────────────────────

const removeFile = defineCapability<{ fileId: string }>({
	name: "remove_file",
	module: "files",
	group: "files",
	permission: "files.delete",
	risk: "reversible",
	channels: ["chat", "mcp", "rest"],
	spec: {
		whenToCall:
			"Soft-delete a file by its Convex _id. Sets `deletedAt` on the row AND purges the bytes from Convex File Storage. Owner-gated (`files.delete`); admin override (`files.deleteAny`).",
		whenNotToCall:
			"the user wants to UNATTACH a file (move back to user-scope) — call attach_file with `entityType:'lead'` etc. as appropriate. The user wants to TAG a file as 'archived' — call update_file_tags.",
		requiredClarifications: ["fileId"],
		synonyms: ["delete file", "trash file", "remove attachment"],
		goodExample: { fileId: "k123abc" },
	},
	drive: {
		onSuccess: "Confirm in one short sentence. Mention deletion is permanent.",
		onDenied:
			"Tell the user they need files.delete (own file) or files.deleteAny (admin override).",
	},
	input: z.object({
		fileId: z.string().min(1),
	}),
	run: async (cap, args) => {
		const { ctx, principal } = cap;
		await ctx.runMutation(internal.files.mutations.removeForAI, {
			orgId: principal.orgId,
			userId: principal.userId,
			fileId: args.fileId as Id<"files">,
		});
		return ok({
			headline: "File deleted (permanent).",
			changes: [
				{ label: "File", value: args.fileId, emphasis: "unchanged" },
				{ label: "State", value: "deleted", emphasis: "changed" },
			],
			facts: ["Bytes purged from storage; the activity log preserves the audit trail."],
			data: { fileId: args.fileId },
		});
	},
});

// ─── Public surface ─────────────────────────────────────────────────────────

export const FILES_CAPABILITIES = [listFiles, attachFile, updateFileTags, removeFile];

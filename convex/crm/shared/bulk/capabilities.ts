/**
 * Bulk + destructive capabilities (S10).
 *
 * One file for the four cross-entity tools that the V1 layer split
 * across `tools/layers/{bulk,csvImport}.ts` — the V2 path collapses
 * them into a single `bulk` group + always rides the irreversible
 * gate (per-row update is harmless; per-row trash is not — when a
 * batch is involved we treat it as one decision the user has to
 * confirm twice).
 *
 * Surface:
 *   - bulk_update_entities    patch many records of one type
 *   - bulk_delete_entities    soft-delete many records of one type
 *   - bulk_close_deals        close many deals as won / lost
 *   - hard_delete_entity      physically remove a soft-deleted row
 *   - import_csv              parse a CSV upload + commit insertions
 *
 * Risk policy: every capability here is `irreversible` and channels
 * exclude `whatsapp`. The single execution path means there is no
 * propose/commit twin — `runCapability` performs the work after the
 * user has supplied a stepUpToken (see `convex/aiStepUp.ts`).
 */

import { z } from "zod";
import { internal } from "../../../_generated/api";
import type { Id } from "../../../_generated/dataModel";
import { defineCapability } from "../../../ai/registry/define";
import { defineGroup } from "../../../ai/registry/groups";
import { failed, ok, partial } from "../../../ai/registry/result";
import type { CapabilityCtx } from "../../../ai/registry/types";
import { buildCustomFieldKeyResolver } from "../customFieldKeys";

// ─── Group playbook ─────────────────────────────────────────────────────────

defineGroup({
	name: "bulk",
	playbook: `Bulk + destructive operations are IRREVERSIBLE — they require the user to confirm twice (2FA step-up) and are blocked over WhatsApp. Always summarise the proposed operation in plain text BEFORE the tool returns its envelope ("I'll soft-delete 5 leads (P-001..P-005) — confirm twice to proceed"). Reading first is mandatory: \`search_crm\` to enumerate the matching records, then call the bulk tool with the explicit ids.

\`bulk_create_entities\` inserts up to 50 NEW rows of one entity type at once. Use for seeding sample data ("create 5 leads to explore"), porting a list the user pasted, or generating a starter dataset. Each row carries the entity's minimum-viable fields (lead/contact: \`displayName\`; company: \`name\`; deal: \`title\`); \`customFields\` is passed through for leads. \`bulk_create_tasks\` creates up to 50 tasks at once — use for seeding a checklist after a meeting. Both inherit the irreversible 2FA fence + WhatsApp block.

**Custom field key vs label (locked 2026-06-06):** When you fill \`customFields\` from a lead row, use the field's internal **\`key\`** from \`describe_entity\`'s payload — NEVER the user-facing **\`label\`**. Example: \`describe_entity\` returns \`{ key: "property_type", label: "Property Type", ... }\` — pass \`{ property_type: "Apartment" }\`, NOT \`{ "Property Type": "Apartment" }\`. The bulk runner now coerces label-shaped keys to canonical names as a safety net, but the model should still aim for the canonical key on the first try so unknown-field warnings stay meaningful.

\`bulk_update_entities\` patches column + custom fields across many records of ONE entity type. \`bulk_delete_entities\` soft-deletes records (recoverable from trash). \`bulk_close_deals\` flips a deal's stage to a final-positive / final-negative outcome. \`hard_delete_entity\` PHYSICALLY removes a single soft-deleted row from trash — the row must already be in trash; never call this without the user explicitly asking to "delete forever". \`import_csv\` runs the quarantined CSV parser then commits the inserts.

After 2FA confirm, expect the same args to come back through a fresh turn — re-call the same tool name with the same args, and the wrapper consumes the step-up token + runs the operation.`,
});

// ─── Shared maps (mirror of the legacy V1 layer) ────────────────────────────

const ENTITY_UPDATE_PERM: Record<string, string> = {
	lead: "leads.update",
	contact: "contacts.update",
	deal: "deals.update",
	company: "companies.update",
};

const ENTITY_UPDATE_MUTATION = {
	lead: internal.crm.entities.leads.mutations.updateForAI,
	contact: internal.crm.entities.contacts.mutations.updateForAI,
	deal: internal.crm.entities.deals.mutations.updateForAI,
	company: internal.crm.entities.companies.mutations.updateForAI,
} as const;

const ENTITY_DELETE_PERM: Record<string, string> = {
	lead: "leads.delete",
	contact: "contacts.delete",
	deal: "deals.delete",
	company: "companies.delete",
};

const ENTITY_DELETE_MUTATION = {
	lead: internal.crm.entities.leads.mutations.softDeleteForAI,
	contact: internal.crm.entities.contacts.mutations.softDeleteForAI,
	deal: internal.crm.entities.deals.mutations.softDeleteForAI,
	company: internal.crm.entities.companies.mutations.softDeleteForAI,
} as const;

type EntityKey = "lead" | "contact" | "deal" | "company";

/**
 * Resolve a code (P-NNN / D-NNN / CO-NNN) OR raw `_id` to the entity's
 * Convex `_id`. Codes always contain a hyphen; raw `_id`s don't.
 * Returns null when the code didn't match — bulk loops surface that as
 * a per-row failure.
 */
async function resolveEntityId(
	cap: CapabilityCtx,
	orgId: Id<"orgs">,
	userId: Id<"users">,
	entityType: EntityKey,
	codeOrId: string,
): Promise<string | null> {
	if (!codeOrId.includes("-")) return codeOrId;
	if (entityType === "lead" || entityType === "contact") {
		const queryRef =
			entityType === "lead"
				? internal.crm.entities.leads.queries.getByPersonCodeForAI
				: internal.crm.entities.contacts.queries.getByPersonCodeForAI;
		try {
			const row = (await cap.ctx.runQuery(queryRef, {
				orgId,
				userId,
				personCode: codeOrId,
			})) as { _id: string } | null;
			return row?._id ?? null;
		} catch {
			return null;
		}
	}
	if (entityType === "deal") {
		try {
			const row = (await cap.ctx.runQuery(
				internal.crm.entities.deals.queries.getByDealCodeForAI,
				{ orgId, userId, dealCode: codeOrId },
			)) as { _id: string } | null;
			return row?._id ?? null;
		} catch {
			return null;
		}
	}
	if (entityType === "company") {
		try {
			const row = (await cap.ctx.runQuery(
				internal.crm.entities.companies.queries.getByCompanyCodeForAI,
				{ orgId, userId, companyCode: codeOrId },
			)) as { _id: string } | null;
			return row?._id ?? null;
		} catch {
			return null;
		}
	}
	return null;
}

// ─── bulk_update_entities ───────────────────────────────────────────────────

const bulkUpdateEntities = defineCapability<{
	entityType: EntityKey;
	entityIds: string[];
	patch: Record<string, unknown>;
}>({
	name: "bulk_update_entities",
	module: "core",
	group: "bulk",
	permission: "data.bulkActions",
	risk: "irreversible",
	channels: ["chat", "mcp", "rest"],
	spec: {
		whenToCall:
			"Patch many records of ONE entity type in a single batch. `entityIds` accepts raw Convex _ids OR public codes (P-XXX / D-XXX / CO-XXX) — mix-and-match. Underlying mutation re-checks per-entity-type RBAC.",
		whenNotToCall:
			"single record (call update_entity), mixed entity types (one bulk call per type), or user wants to fake a delete by clearing fields (use bulk_delete_entities instead).",
		requiredClarifications: ["entityType", "entityIds", "patch"],
		synonyms: ["bulk update", "mass update", "patch many"],
		goodExample: {
			entityType: "lead",
			entityIds: ["P-001", "P-002"],
			patch: { status: "qualified" },
		},
	},
	drive: {
		onSuccess: "Confirm with `<count> of <total>` updated. List the per-row failures verbatim.",
	},
	input: z.object({
		entityType: z.enum(["lead", "contact", "deal", "company"]),
		entityIds: z.array(z.string().min(1)).min(1).max(200),
		patch: z.record(z.string(), z.unknown()).refine((r) => Object.keys(r).length > 0, {
			message: "patch must have at least one key.",
		}),
	}),
	run: async (cap, args) => {
		const { ctx, principal } = cap;
		const perm = ENTITY_UPDATE_PERM[args.entityType] ?? "leads.update";
		if (!principal.permissions.includes(perm)) {
			return failed("denied", `Requires ${perm}.`);
		}
		const mutation = ENTITY_UPDATE_MUTATION[args.entityType];
		const errors: { item: string; reason: string }[] = [];
		const succeededIds: string[] = [];
		const idArg = `${args.entityType}Id` as "leadId" | "contactId" | "dealId" | "companyId";
		for (const codeOrId of args.entityIds) {
			try {
				const resolved = await resolveEntityId(
					cap,
					principal.orgId,
					principal.userId,
					args.entityType,
					codeOrId,
				);
				if (!resolved) {
					errors.push({
						item: codeOrId,
						reason: `No ${args.entityType} with code "${codeOrId}".`,
					});
					continue;
				}
				await ctx.runMutation(
					mutation as never,
					{
						orgId: principal.orgId,
						userId: principal.userId,
						[idArg]: resolved,
						...args.patch,
					} as never,
				);
				succeededIds.push(resolved);
			} catch (err) {
				errors.push({
					item: codeOrId,
					reason: err instanceof Error ? err.message : String(err),
				});
			}
		}
		const succeeded = succeededIds.length;
		const total = args.entityIds.length;
		// Audit §2 fix — emit `kind:"entityList"` so the timeline can
		// render <EntityList> with chips for every successfully-updated
		// row. The `data:` payload still carries succeeded/failed/total
		// for the model's narrative; `display` drives the rich card.
		const display = {
			kind: "entityList" as const,
			entityType: args.entityType,
			entityIds: succeededIds,
		};
		if (errors.length === 0) {
			return ok({
				headline: `Updated ${succeeded} ${args.entityType}${succeeded === 1 ? "" : "s"}.`,
				data: { succeeded, failed: 0, total, entityIds: succeededIds },
				display,
			});
		}
		if (succeeded === 0) {
			return failed(
				"business_error",
				`Updated 0 of ${total} ${args.entityType}s — every row failed.`,
				errors,
			);
		}
		return partial({
			headline: `Updated ${succeeded} of ${total} ${args.entityType}s — ${errors.length} failed.`,
			data: { succeeded, failed: errors.length, total, entityIds: succeededIds },
			errors,
			display,
		});
	},
});

// ─── bulk_delete_entities ───────────────────────────────────────────────────

const bulkDeleteEntities = defineCapability<{
	entityType: EntityKey;
	entityIds: string[];
}>({
	name: "bulk_delete_entities",
	module: "core",
	group: "bulk",
	permission: "data.bulkActions",
	risk: "irreversible",
	channels: ["chat", "mcp", "rest"],
	spec: {
		whenToCall:
			"Soft-delete MANY records of ONE entity type at once. Every row goes to trash and can be restored via the trash UI. `entityIds` accepts codes or raw _ids.",
		whenNotToCall:
			"single record (use a per-entity soft_delete capability), mixed entity types (one call per type), or the user wants HARD delete (use hard_delete_entity per-row from trash).",
		requiredClarifications: ["entityType", "entityIds"],
		synonyms: ["bulk delete", "trash all", "remove these", "clean up duplicates"],
		goodExample: { entityType: "lead", entityIds: ["P-001", "P-002", "P-003"] },
	},
	drive: {
		onSuccess: "Confirm 'Trashed N <entity>s. Restorable via the trash UI.'",
	},
	input: z.object({
		entityType: z.enum(["lead", "contact", "deal", "company"]),
		entityIds: z.array(z.string().min(1)).min(1).max(200),
	}),
	run: async (cap, args) => {
		const { ctx, principal } = cap;
		const perm = ENTITY_DELETE_PERM[args.entityType] ?? "leads.delete";
		if (!principal.permissions.includes(perm)) {
			return failed("denied", `Requires ${perm}.`);
		}
		const mutation = ENTITY_DELETE_MUTATION[args.entityType];
		const errors: { item: string; reason: string }[] = [];
		const succeededIds: string[] = [];
		const idArg = `${args.entityType}Id` as "leadId" | "contactId" | "dealId" | "companyId";
		for (const codeOrId of args.entityIds) {
			try {
				const resolved = await resolveEntityId(
					cap,
					principal.orgId,
					principal.userId,
					args.entityType,
					codeOrId,
				);
				if (!resolved) {
					errors.push({
						item: codeOrId,
						reason: `No ${args.entityType} with code "${codeOrId}".`,
					});
					continue;
				}
				await ctx.runMutation(
					mutation as never,
					{
						orgId: principal.orgId,
						userId: principal.userId,
						[idArg]: resolved,
					} as never,
				);
				succeededIds.push(resolved);
			} catch (err) {
				errors.push({
					item: codeOrId,
					reason: err instanceof Error ? err.message : String(err),
				});
			}
		}
		const succeeded = succeededIds.length;
		const total = args.entityIds.length;
		// Audit §2 fix — soft-deleted rows are reversible; surface them
		// as an entityList so the user can click into trash state and
		// restore. Hard-delete uses `hard_delete_entity` (no display
		// because the row is gone).
		const display = {
			kind: "entityList" as const,
			entityType: args.entityType,
			entityIds: succeededIds,
		};
		if (errors.length === 0) {
			return ok({
				headline: `Trashed ${succeeded} ${args.entityType}${succeeded === 1 ? "" : "s"}. Restorable via the trash UI.`,
				data: { succeeded, failed: 0, total, entityIds: succeededIds },
				display,
			});
		}
		if (succeeded === 0) {
			return failed(
				"business_error",
				`Trashed 0 of ${total} ${args.entityType}s — every row failed.`,
				errors,
			);
		}
		return partial({
			headline: `Trashed ${succeeded} of ${total} ${args.entityType}s — ${errors.length} failed.`,
			data: { succeeded, failed: errors.length, total, entityIds: succeededIds },
			errors,
			display,
		});
	},
});

// ─── bulk_close_deals ───────────────────────────────────────────────────────

const bulkCloseDeals = defineCapability<{
	dealIds: string[];
	outcome: "won" | "lost";
}>({
	name: "bulk_close_deals",
	module: "core",
	group: "bulk",
	permission: "deals.close",
	risk: "irreversible",
	channels: ["chat", "mcp", "rest"],
	spec: {
		whenToCall:
			"Close many deals as won OR lost in one batch. `dealIds` accepts codes (D-NNN) or raw _ids.",
		whenNotToCall:
			"a single deal (use close_deal) or moving across deal stages without closing (use move_stage).",
		requiredClarifications: ["dealIds", "outcome"],
		goodExample: { dealIds: ["D-001", "D-002"], outcome: "won" },
	},
	drive: {
		onSuccess: "Confirm 'Closed N deals as <outcome>'.",
	},
	input: z.object({
		dealIds: z.array(z.string().min(1)).min(1).max(100),
		outcome: z.enum(["won", "lost"]),
	}),
	run: async (cap, args) => {
		const { ctx, principal } = cap;
		if (!principal.permissions.includes("deals.close")) {
			return failed("denied", "Requires deals.close.");
		}
		const errors: { item: string; reason: string }[] = [];
		const succeededIds: string[] = [];
		for (const codeOrId of args.dealIds) {
			try {
				const resolved = await resolveEntityId(
					cap,
					principal.orgId,
					principal.userId,
					"deal",
					codeOrId,
				);
				if (!resolved) {
					errors.push({ item: codeOrId, reason: `No deal with code "${codeOrId}".` });
					continue;
				}
				if (args.outcome === "won") {
					await ctx.runMutation(internal.crm.entities.deals.mutations.closeAsDoneForAI, {
						orgId: principal.orgId,
						userId: principal.userId,
						dealId: resolved as Id<"deals">,
						finalType: "positive",
					});
				} else {
					// Use closeAsDoneForAI with negative finalType — markAsLost
					// requires a per-deal `deleteCodeConfirmation` string match
					// that the bulk path can't carry, and the bulk caller has
					// already double-confirmed via the 2FA step-up token.
					await ctx.runMutation(internal.crm.entities.deals.mutations.closeAsDoneForAI, {
						orgId: principal.orgId,
						userId: principal.userId,
						dealId: resolved as Id<"deals">,
						finalType: "negative",
					});
				}
				succeededIds.push(resolved);
			} catch (err) {
				errors.push({
					item: codeOrId,
					reason: err instanceof Error ? err.message : String(err),
				});
			}
		}
		const succeeded = succeededIds.length;
		const total = args.dealIds.length;
		// Audit §2 fix — closed deals stay in the DB (with wonAt/lostAt
		// stamped); surface them as an entityList so the user can click
		// through to verify the close.
		const display = {
			kind: "entityList" as const,
			entityType: "deal" as const,
			entityIds: succeededIds,
		};
		if (errors.length === 0) {
			return ok({
				headline: `Closed ${succeeded} deal${succeeded === 1 ? "" : "s"} as ${args.outcome}.`,
				data: {
					succeeded,
					failed: 0,
					total,
					outcome: args.outcome,
					entityIds: succeededIds,
				},
				display,
			});
		}
		if (succeeded === 0) {
			return failed(
				"business_error",
				`Closed 0 of ${total} deals — every row failed.`,
				errors,
			);
		}
		return partial({
			headline: `Closed ${succeeded} of ${total} deals as ${args.outcome} — ${errors.length} failed.`,
			data: {
				succeeded,
				failed: errors.length,
				total,
				outcome: args.outcome,
				entityIds: succeededIds,
			},
			errors,
			display,
		});
	},
});

// ─── hard_delete_entity ─────────────────────────────────────────────────────

const hardDeleteEntity = defineCapability<{
	entityType: EntityKey;
	entityId: string;
}>({
	name: "hard_delete_entity",
	module: "core",
	group: "bulk",
	permission: "data.hardDelete",
	risk: "irreversible",
	channels: ["chat", "mcp", "rest"],
	spec: {
		whenToCall:
			"Permanently remove a single record from trash. The record must ALREADY be soft-deleted (in trash). Cascades fieldValues + entityTags + counters; the row is gone afterwards.",
		whenNotToCall:
			"a record that hasn't been trashed yet — soft-delete first via the per-entity capability, then call this only when the user explicitly says 'delete forever' / 'purge'.",
		requiredClarifications: ["entityType", "entityId"],
		synonyms: ["delete forever", "purge", "permanent delete", "hard delete"],
		goodExample: { entityType: "lead", entityId: "<rowId>" },
	},
	drive: {
		onSuccess:
			"Confirm 'Permanently deleted <entity> <code/id>. The record is gone.' Mention this is irreversible.",
	},
	input: z.object({
		entityType: z.enum(["lead", "contact", "deal", "company"]),
		entityId: z.string().min(1).describe("Convex _id of the soft-deleted row."),
	}),
	run: async (cap, args) => {
		const { ctx, principal } = cap;
		if (!principal.permissions.includes("data.hardDelete")) {
			return failed("denied", "Requires data.hardDelete (Owner only by default).");
		}
		await ctx.runMutation(internal.trash.mutations.hardDeleteForAI, {
			orgId: principal.orgId,
			userId: principal.userId,
			entityType: args.entityType,
			entityId: args.entityId,
		});
		return ok({
			headline: `Permanently deleted ${args.entityType}.`,
			changes: [{ label: "entityId", value: args.entityId, emphasis: "changed" }],
		});
	},
});

// ─── import_csv ─────────────────────────────────────────────────────────────

const importCsv = defineCapability<{
	csvImportId: string;
}>({
	name: "import_csv",
	module: "core",
	group: "bulk",
	permission: "data.import",
	risk: "irreversible",
	channels: ["chat", "mcp", "rest"],
	spec: {
		whenToCall:
			"Commit a previously-parsed CSV import. The user must have already uploaded the file + run the parser action (the parser produces a `csvImports` row with `status:'ready'` + `previewRows`). Pass that row's id; the wrapper re-reads the rows from the trusted DB and runs the inserts.",
		whenNotToCall:
			"the file hasn't been parsed yet — the parser action lives outside this capability and must run first; the dedup decisions need to be present on `previewRows` before any commit can happen.",
		requiredClarifications: ["csvImportId"],
		synonyms: ["import csv", "commit csv", "load csv data"],
		goodExample: { csvImportId: "<csvImportsId>" },
	},
	drive: {
		onSuccess:
			"Summarise the result: 'N inserted, M merged, K skipped, F failed.' Mention the trash UI for any failed-row recovery.",
	},
	input: z.object({
		csvImportId: z.string().min(1),
	}),
	run: async (cap, args) => {
		const { ctx, principal } = cap;
		if (!principal.permissions.includes("data.import")) {
			return failed("denied", "Requires data.import.");
		}
		// Re-read the import row server-side. The model only passed an id.
		const parsed = (await ctx.runQuery(internal.ai.csvImports.readImportRowForAI, {
			csvImportId: args.csvImportId as Id<"csvImports">,
			orgId: principal.orgId,
		})) as {
			status: string;
			rowCount: number;
			previewRows: Array<{
				idemKey: string;
				fields: Record<string, string | null>;
				dedupDecision: "insert" | "merge" | "skip";
				dedupTargetCode?: string;
				validationError?: string;
			}>;
			targetEntity?: string;
		} | null;
		if (!parsed) {
			return failed("not_found", `No CSV import row with id ${args.csvImportId}.`);
		}
		if (parsed.status === "completed") {
			return failed(
				"business_error",
				"This CSV import was already committed. Open the leads list to review the imported rows.",
			);
		}
		if (parsed.status !== "ready") {
			return failed(
				"business_error",
				`CSV import is in status "${parsed.status}", not "ready". Re-run the parser if it failed.`,
			);
		}
		// Phase 1 only supports lead imports (mirrors the V1 path).
		const result = (await ctx.runMutation(
			internal.crm.entities.leads.mutations.bulkInsertFromCsvImportForAI,
			{
				orgId: principal.orgId,
				userId: principal.userId,
				csvImportId: args.csvImportId as Id<"csvImports">,
				rows: parsed.previewRows,
			},
		)) as {
			inserted: number;
			merged: number;
			skipped: number;
			failedRows: Array<{ idemKey: string; error: string }>;
		};
		const headline = `CSV import complete — ${result.inserted} inserted, ${result.merged} merged, ${result.skipped} skipped${result.failedRows.length > 0 ? `, ${result.failedRows.length} failed` : ""}.`;
		return ok({
			headline,
			data: result,
			errors:
				result.failedRows.length > 0
					? result.failedRows.map((r) => ({ item: r.idemKey, reason: r.error }))
					: undefined,
		});
	},
});

// ─── bulk_create_entities ───────────────────────────────────────────────────

// Per-entity create permission. Mirrors ENTITY_UPDATE_PERM. The wrapper
// re-checks each per-row mutation; this is the "fast deny" before any
// row runs.
const ENTITY_CREATE_PERM: Record<EntityKey, string> = {
	lead: "leads.create",
	contact: "contacts.create",
	deal: "deals.create",
	company: "companies.create",
};

// Per-entity create mutation. Each `*ForAI` twin handles its own RBAC +
// dedup + activity log; the bulk runner is a thin loop. Per-row args
// validators differ wildly between entities — leads need `displayName +
// source`, deals need `title + pipelineId?`, companies need `name`,
// contacts need `displayName`. We don't try to unify the row schema;
// the per-entity wrapper threads the row through to the right mutation.
const ENTITY_CREATE_MUTATION = {
	lead: internal.crm.entities.leads.mutations.createForAI,
	contact: internal.crm.entities.contacts.mutations.createForAI,
	deal: internal.crm.entities.deals.mutations.createForAI,
	company: internal.crm.entities.companies.mutations.createForAI,
} as const;

/**
 * Build the per-row arg payload for the right `createForAI` mutation.
 * Each entity has its own minimum-viable shape — leads/contacts need a
 * `displayName`, companies need `name`, deals need `title`. We pass
 * `customFields` through for leads (the only entity whose `createForAI`
 * accepts the custom-field map directly today; the others fall through
 * to their built-in columns until B.45 ports `customFields` for them).
 *
 * `customFieldsResolver` (built once per `bulkCreateEntities.run`) maps
 * label-shaped keys to internal names so a model that emitted
 * `"Property Type": "Apartment"` doesn't kill the whole batch.
 */
function buildCreateArgs(
	entityType: EntityKey,
	row: Record<string, unknown>,
	orgId: Id<"orgs">,
	userId: Id<"users">,
	customFieldsResolver: (customFields: unknown) => Record<string, unknown> | undefined,
): Record<string, unknown> | { error: string } {
	const base = { orgId, userId };
	switch (entityType) {
		case "lead": {
			const displayName = row.displayName;
			const source = row.source ?? "ai";
			if (typeof displayName !== "string" || displayName.trim().length === 0) {
				return { error: "lead row missing displayName" };
			}
			if (typeof source !== "string" || source.trim().length === 0) {
				return { error: "lead row missing source" };
			}
			const resolvedCustomFields = customFieldsResolver(row.customFields);
			return {
				...base,
				displayName,
				source,
				...(typeof row.email === "string" ? { email: row.email } : {}),
				...(typeof row.phone === "string" ? { phone: row.phone } : {}),
				...(typeof row.assignedTo === "string"
					? { assignedTo: row.assignedTo as Id<"users"> }
					: {}),
				...(row.aiContext !== undefined ? { aiContext: row.aiContext } : {}),
				...(resolvedCustomFields ? { customFields: resolvedCustomFields } : {}),
			};
		}
		case "contact": {
			const displayName = row.displayName;
			if (typeof displayName !== "string" || displayName.trim().length === 0) {
				return { error: "contact row missing displayName" };
			}
			return {
				...base,
				displayName,
				...(typeof row.email === "string" ? { email: row.email } : {}),
				...(typeof row.phone === "string" ? { phone: row.phone } : {}),
				...(typeof row.assignedTo === "string"
					? { assignedTo: row.assignedTo as Id<"users"> }
					: {}),
				...(typeof row.companyId === "string"
					? { companyId: row.companyId as Id<"companies"> }
					: {}),
				...(typeof row.leadId === "string" ? { leadId: row.leadId as Id<"leads"> } : {}),
				...(typeof row.personCode === "string" ? { personCode: row.personCode } : {}),
				...(row.aiContext !== undefined ? { aiContext: row.aiContext } : {}),
			};
		}
		case "company": {
			const name = row.name;
			if (typeof name !== "string" || name.trim().length === 0) {
				return { error: "company row missing name" };
			}
			return {
				...base,
				name,
				...(typeof row.industry === "string" ? { industry: row.industry } : {}),
				...(typeof row.website === "string" ? { website: row.website } : {}),
				...(typeof row.size === "string" ? { size: row.size } : {}),
				...(typeof row.assignedTo === "string"
					? { assignedTo: row.assignedTo as Id<"users"> }
					: {}),
			};
		}
		case "deal": {
			const title = row.title;
			if (typeof title !== "string" || title.trim().length === 0) {
				return { error: "deal row missing title" };
			}
			return {
				...base,
				title,
				...(typeof row.pipelineId === "string"
					? { pipelineId: row.pipelineId as Id<"pipelines"> }
					: {}),
				...(typeof row.currentStageId === "string"
					? { currentStageId: row.currentStageId }
					: {}),
				...(typeof row.contactId === "string"
					? { contactId: row.contactId as Id<"contacts"> }
					: {}),
				...(typeof row.companyId === "string"
					? { companyId: row.companyId as Id<"companies"> }
					: {}),
				...(typeof row.personCode === "string" ? { personCode: row.personCode } : {}),
				...(typeof row.companyCode === "string" ? { companyCode: row.companyCode } : {}),
				...(typeof row.value === "number" ? { value: row.value } : {}),
				...(typeof row.currency === "string" ? { currency: row.currency } : {}),
				...(typeof row.assignedTo === "string"
					? { assignedTo: row.assignedTo as Id<"users"> }
					: {}),
				...(typeof row.source === "string" ? { source: row.source } : {}),
				...(typeof row.expectedCloseDate === "number"
					? { expectedCloseDate: row.expectedCloseDate }
					: {}),
			};
		}
	}
}

const bulkCreateEntities = defineCapability<{
	entityType: EntityKey;
	rows: Array<Record<string, unknown>>;
}>({
	name: "bulk_create_entities",
	module: "core",
	group: "bulk",
	permission: "data.bulkActions",
	risk: "irreversible",
	channels: ["chat", "mcp", "rest"],
	spec: {
		whenToCall:
			"Insert MANY rows of ONE entity type in a single batch. Pass `entityType` + `rows[]` (max 50). Each row carries the entity's minimum-viable fields: leads/contacts need `displayName`; companies need `name`; deals need `title`. Optional `email`, `phone`, `assignedTo`, `companyId`, `pipelineId`, `value`, `currency`, etc. are passed through. Lead rows additionally accept `customFields: { [fieldName]: value }` for org-defined custom fields; the underlying mutation validates them against live `fieldDefinitions`.",
		whenNotToCall:
			"a single row (call create_lead / create_contact / create_company / create_deal — they carry richer dedup + preview surfaces). The user wants to import a CSV (call `parse_csv` → `import_csv`). Mixed entity types in one call (one bulk call per type). Tasks (use `bulk_create_tasks`).",
		requiredClarifications: ["entityType", "rows"],
		synonyms: [
			"bulk create",
			"mass insert",
			"add many",
			"create several",
			"seed sample data",
			"explore with a few",
		],
		goodExample: {
			entityType: "lead",
			rows: [
				{ displayName: "Sarah Khan", source: "manual", email: "sarah@x.com" },
				{ displayName: "Omar Zayed", source: "manual" },
			],
		},
		badExample: {
			args: {
				entityType: "lead",
				rows: [{ source: "manual" }],
			},
			why: "Each lead row needs a displayName; rows missing it land as per-row errors.",
		},
	},
	drive: {
		onSuccess:
			"Confirm with `Created N of M <entity>s`. List per-row failures verbatim (the row's index + reason). Surface the entityList card so the user can click into each new record.",
	},
	input: z.object({
		entityType: z.enum(["lead", "contact", "deal", "company"]),
		rows: z.array(z.record(z.string(), z.unknown())).min(1).max(50),
	}),
	run: async (cap, args) => {
		const { ctx, principal } = cap;
		const perm = ENTITY_CREATE_PERM[args.entityType];
		if (!principal.permissions.includes(perm)) {
			return failed("denied", `Requires ${perm}.`);
		}
		const mutation = ENTITY_CREATE_MUTATION[args.entityType];
		// Build the customFields key resolver ONCE per call. Smaller
		// models (Gemini Flash, NVIDIA Llama) frequently emit field
		// LABELS where the mutation expects internal names; the resolver
		// rewrites label-shaped keys to canonical names before each row
		// is forwarded. Single fieldDefinitions read; cheap.
		const customFieldsResolver = await buildCustomFieldKeyResolver(cap, args.entityType);
		const errors: { item: string; reason: string }[] = [];
		const succeededIds: string[] = [];
		for (const [index, row] of args.rows.entries()) {
			const payload = buildCreateArgs(
				args.entityType,
				row,
				principal.orgId,
				principal.userId,
				customFieldsResolver,
			);
			if ("error" in payload && typeof payload.error === "string") {
				errors.push({ item: `row[${index}]`, reason: payload.error });
				continue;
			}
			try {
				const result = (await ctx.runMutation(mutation as never, payload as never)) as
					| {
							id?: string;
							_id?: string;
							leadId?: string;
							contactId?: string;
							dealId?: string;
							companyId?: string;
							duplicates?: unknown[];
					  }
					| string
					| null;
				// Each entity's createForAI returns its own shape — leads/contacts
				// can return `{ id: null, duplicates: [...] }` when dedup matched;
				// companies / deals always return the new id directly. We probe
				// every plausible shape rather than tightly coupling to one.
				let createdId: string | null = null;
				if (typeof result === "string") createdId = result;
				else if (result && typeof result === "object") {
					const r = result as Record<string, unknown>;
					if (typeof r.id === "string") createdId = r.id;
					else if (typeof r._id === "string") createdId = r._id;
					else if (typeof r.leadId === "string") createdId = r.leadId;
					else if (typeof r.contactId === "string") createdId = r.contactId;
					else if (typeof r.dealId === "string") createdId = r.dealId;
					else if (typeof r.companyId === "string") createdId = r.companyId;
					if (
						createdId === null &&
						Array.isArray(r.duplicates) &&
						r.duplicates.length > 0
					) {
						errors.push({
							item: `row[${index}]`,
							reason: `Skipped — possible duplicate of an existing ${args.entityType}.`,
						});
						continue;
					}
				}
				if (!createdId) {
					errors.push({
						item: `row[${index}]`,
						reason: `Mutation returned no id; row may have been blocked by dedup.`,
					});
					continue;
				}
				succeededIds.push(createdId);
			} catch (err) {
				errors.push({
					item: `row[${index}]`,
					reason: err instanceof Error ? err.message : String(err),
				});
			}
		}
		const succeeded = succeededIds.length;
		const total = args.rows.length;
		// Audit §2 fix — every successful insert lands in the entityList
		// chip card so the user can click through.
		const display = {
			kind: "entityList" as const,
			entityType: args.entityType,
			entityIds: succeededIds,
		};
		if (errors.length === 0) {
			return ok({
				headline: `Created ${succeeded} ${args.entityType}${succeeded === 1 ? "" : "s"}.`,
				data: { succeeded, failed: 0, total, entityIds: succeededIds },
				display,
			});
		}
		if (succeeded === 0) {
			return failed(
				"business_error",
				`Created 0 of ${total} ${args.entityType}s — every row failed.`,
				errors,
			);
		}
		return partial({
			headline: `Created ${succeeded} of ${total} ${args.entityType}s — ${errors.length} failed.`,
			data: { succeeded, failed: errors.length, total, entityIds: succeededIds },
			errors,
			display,
		});
	},
});

// ─── bulk_create_tasks ──────────────────────────────────────────────────────

const TASK_TYPE_VALUES = ["todo", "call", "email", "meeting", "followup"] as const;
const TASK_PRIORITY_VALUES = ["low", "normal", "high", "urgent"] as const;

const bulkCreateTasks = defineCapability<{
	rows: Array<{
		title: string;
		type?: (typeof TASK_TYPE_VALUES)[number];
		note?: string;
		dueAt?: number;
		assignedTo?: string;
		priority?: (typeof TASK_PRIORITY_VALUES)[number];
		personCode?: string;
		dealCode?: string;
		entityType?: string;
		entityId?: string;
	}>;
}>({
	name: "bulk_create_tasks",
	module: "core",
	group: "bulk",
	permission: "data.bulkActions",
	risk: "irreversible",
	channels: ["chat", "mcp", "rest"],
	spec: {
		whenToCall:
			"Create MANY tasks in one batch (max 50). Pass `rows[]` where each row carries `title` (required) + optional `type` (default `todo`), `note`, `dueAt` (epoch ms), `assignedTo`, `priority`, `personCode` / `dealCode` to bind the task to a CRM record. Useful when seeding a follow-up checklist after a meeting or generating a project's task list at once.",
		whenNotToCall:
			"a single task (call `create_task` — it carries richer dedup + the human preview card). A standing follow-up cadence (call `create_followup_chain` once it ships in B.46).",
		requiredClarifications: ["rows"],
		synonyms: ["bulk create tasks", "create many tasks", "seed checklist"],
		goodExample: {
			rows: [
				{ title: "Send proposal", type: "todo", dueAt: 1735689600000 },
				{ title: "Follow-up call", type: "followup", personCode: "P-007" },
			],
		},
	},
	drive: {
		onSuccess:
			"Confirm with `Created N of M tasks`. List per-row failures verbatim. Suggest opening the tasks list to review.",
	},
	input: z.object({
		rows: z
			.array(
				z.object({
					title: z.string().min(1).max(300),
					type: z.enum(TASK_TYPE_VALUES).optional(),
					note: z.string().max(2000).optional(),
					dueAt: z.number().int().positive().optional(),
					assignedTo: z.string().optional(),
					priority: z.enum(TASK_PRIORITY_VALUES).optional(),
					personCode: z.string().optional(),
					dealCode: z.string().optional(),
					entityType: z.string().optional(),
					entityId: z.string().optional(),
				}),
			)
			.min(1)
			.max(50),
	}),
	run: async (cap, args) => {
		const { ctx, principal } = cap;
		if (!principal.permissions.includes("tasks.create")) {
			return failed("denied", "Requires tasks.create.");
		}
		const errors: { item: string; reason: string }[] = [];
		const succeededIds: string[] = [];
		for (const [index, row] of args.rows.entries()) {
			try {
				const taskId = (await ctx.runMutation(
					internal.crm.shared.tasks.mutations.createForAI,
					{
						orgId: principal.orgId,
						userId: principal.userId,
						type: row.type ?? "todo",
						title: row.title,
						...(row.note !== undefined ? { note: row.note } : {}),
						...(row.dueAt !== undefined ? { dueAt: row.dueAt } : {}),
						...(row.assignedTo !== undefined
							? { assignedTo: row.assignedTo as Id<"users"> }
							: {}),
						...(row.priority !== undefined ? { priority: row.priority } : {}),
						...(row.personCode !== undefined ? { personCode: row.personCode } : {}),
						...(row.dealCode !== undefined ? { dealCode: row.dealCode } : {}),
						...(row.entityType !== undefined ? { entityType: row.entityType } : {}),
						...(row.entityId !== undefined ? { entityId: row.entityId } : {}),
					},
				)) as { taskCode?: string; taskId?: string } | string | Id<"tasks">;
				let createdId: string | null = null;
				if (typeof taskId === "string") createdId = taskId;
				else if (taskId && typeof taskId === "object") {
					const r = taskId as { taskId?: string };
					if (typeof r.taskId === "string") createdId = r.taskId;
				}
				if (!createdId) {
					errors.push({
						item: `row[${index}]`,
						reason: "Mutation returned no taskId.",
					});
					continue;
				}
				succeededIds.push(createdId);
			} catch (err) {
				errors.push({
					item: `row[${index}]`,
					reason: err instanceof Error ? err.message : String(err),
				});
			}
		}
		const succeeded = succeededIds.length;
		const total = args.rows.length;
		if (errors.length === 0) {
			return ok({
				headline: `Created ${succeeded} task${succeeded === 1 ? "" : "s"}.`,
				data: { succeeded, failed: 0, total, taskIds: succeededIds },
			});
		}
		if (succeeded === 0) {
			return failed(
				"business_error",
				`Created 0 of ${total} tasks — every row failed.`,
				errors,
			);
		}
		return partial({
			headline: `Created ${succeeded} of ${total} tasks — ${errors.length} failed.`,
			data: { succeeded, failed: errors.length, total, taskIds: succeededIds },
			errors,
		});
	},
});

export const BULK_CAPABILITIES = [
	bulkCreateEntities,
	bulkCreateTasks,
	bulkUpdateEntities,
	bulkDeleteEntities,
	bulkCloseDeals,
	hardDeleteEntity,
	importCsv,
];

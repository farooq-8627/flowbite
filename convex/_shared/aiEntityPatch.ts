/**
 * convex/_shared/aiEntityPatch.ts
 *
 * Single source of truth for "AI wants to patch an entity by code."
 *
 * Why this exists (PHASE-3-AI-AUDIT.md §6.5 incident-class B)
 * ─────────────────────────────────────────────────────────────
 *
 * Before this helper landed, three AI tools (`commit_update_entity`,
 * `commit_enrich_record`, `commit_analyze_file`) all hand-rolled the
 * same broken pattern:
 *
 *     await toolMutation(tc, "crm/entities/leads/mutations:update", {
 *       orgId, code, ...patch,    // ← `code` is rejected by the validator
 *     });
 *
 * The leads/contacts/deals/companies update mutations only accept their
 * internal id (`leadId`, `contactId`, …) — never `personCode`. So
 * EVERY twoStep-driven update threw `ArgumentValidationError` and the
 * user saw "❌ The tool tried to save with an unexpected field."
 *
 * Worse, those mutations only accept *canonical column fields*
 * (displayName, email, phone, status, source, assignedTo, …). When the
 * model included a custom field like `company_size` (stored in the
 * `fieldValues` table, not on the entity row), the same validator
 * rejected it.
 *
 * This helper consolidates all three concerns:
 *
 *  1. **Code → row resolution.** Indexed lookup against
 *     `by_org_and_personCode` / `by_org_and_dealCode` /
 *     `by_org_and_companyCode`. O(log N), exact-match.
 *  2. **Whitelist split.** Per-entity `COLUMN_KEYS` set decides which
 *     patch keys go to the row. Everything else is treated as a custom
 *     field — but only if a `fieldDefinitions` row exists for
 *     `(orgId, entityType, name)`. Unknown keys are surfaced in the
 *     return value so the caller can mention them in chat without
 *     silently dropping data.
 *  3. **Apply.** Column keys → `ctx.db.patch(row)`. Custom keys →
 *     upsert into `fieldValues`. One unified before/after snapshot is
 *     returned for the diff card.
 *
 * The helper is a plain TS function (no Convex registration) so it can
 * be called from any internal mutation that already has a `MutationCtx`.
 * It assumes auth has already been validated by the caller — typically
 * via `requireOrgMemberByIds` in the wrapping `*ForAI` mutation.
 */

import { ConvexError } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { logActivity } from "../activityLogs/helpers";
import { logFieldUpdates } from "./fieldUpdateLog";
import { normaliseCode } from "./synonyms";

// ─── Per-entity routing tables ──────────────────────────────────────────────
//
// COLUMN_KEYS is the SSOT — keep in lock-step with the entity update
// mutation validators. A patch key in this set is forwarded to
// `ctx.db.patch`; everything else is routed through `fieldValues`.

export type AIEntityType = "lead" | "contact" | "deal" | "company";

const COLUMN_KEYS: Record<AIEntityType, ReadonlySet<string>> = {
	lead: new Set(["displayName", "email", "phone", "status", "source", "assignedTo", "sortOrder"]),
	contact: new Set(["displayName", "email", "phone", "companyId", "assignedTo", "sortOrder"]),
	deal: new Set(["title", "value", "currency", "assignedTo", "expectedCloseDate", "sortOrder"]),
	company: new Set(["name", "industry", "website", "size", "assignedTo", "sortOrder"]),
};

const PERMISSION_KEY: Record<AIEntityType, string> = {
	lead: "leads.update",
	contact: "contacts.update",
	deal: "deals.update",
	company: "companies.update",
};

const TABLE_NAME: Record<AIEntityType, "leads" | "contacts" | "deals" | "companies"> = {
	lead: "leads",
	contact: "contacts",
	deal: "deals",
	company: "companies",
};

const CODE_FIELD: Record<AIEntityType, string> = {
	lead: "personCode",
	contact: "personCode",
	deal: "dealCode",
	company: "companyCode",
};

const CODE_INDEX: Record<AIEntityType, string> = {
	lead: "by_org_and_personCode",
	contact: "by_org_and_personCode",
	deal: "by_org_and_dealCode",
	company: "by_org_and_companyCode",
};

// Phone normalisation duplicates the per-entity helper. Leads + contacts
// keep `normalizedPhone` in sync with `phone`; deals + companies don't.
function normalizePhone(phone: string): string {
	return phone.replace(/\D/g, "");
}

// ─── Row resolution ─────────────────────────────────────────────────────────

export type ResolvedRecord = {
	entityType: AIEntityType;
	row: Doc<"leads"> | Doc<"contacts"> | Doc<"deals"> | Doc<"companies">;
	code: string;
	canonicalCode: string;
};

/**
 * Resolve a raw user-supplied code (`P001`, `p-001`, `P-001`) to the
 * canonical record. Returns `null` if no record exists. The caller is
 * responsible for surfacing a `NOT_FOUND` to the model.
 */
export async function resolveCodeToRecordForAI(
	ctx: MutationCtx,
	args: { orgId: Id<"orgs">; entityType: AIEntityType; code: string },
): Promise<ResolvedRecord | null> {
	const canonicalCode = String(normaliseCode(args.code));
	const codeField = CODE_FIELD[args.entityType];
	const indexName = CODE_INDEX[args.entityType];
	const tableName = TABLE_NAME[args.entityType];

	// biome-ignore lint/suspicious/noExplicitAny: dynamic table + index forces a cast — every concrete combination is enumerated above.
	const row = (await (ctx.db.query(tableName) as any)
		// biome-ignore lint/suspicious/noExplicitAny: same reason
		.withIndex(indexName, (q: any) => q.eq("orgId", args.orgId).eq(codeField, canonicalCode))
		.first()) as Doc<"leads"> | Doc<"contacts"> | Doc<"deals"> | Doc<"companies"> | null;

	if (!row) return null;
	if ((row as { deletedAt?: number }).deletedAt !== undefined) return null;

	return {
		entityType: args.entityType,
		row,
		code: args.code,
		canonicalCode,
	};
}

// ─── Patch splitting ────────────────────────────────────────────────────────

export interface SplitPatchResult {
	columnPatch: Record<string, unknown>;
	customFields: Array<{ name: string; value: unknown; fieldId: Id<"fieldDefinitions"> }>;
	unknownFields: string[];
}

/**
 * Decide for each key in `patch` whether it's a column write, a custom
 * `fieldValues` write, or an unknown key (no matching column AND no
 * matching `fieldDefinitions` row). Unknown keys are surfaced — never
 * silently dropped.
 *
 * `definitionsByName` is the org's full field-definitions index for the
 * entityType, keyed by `name`. The caller pre-fetches it once.
 */
export function splitPatchForEntity(args: {
	entityType: AIEntityType;
	patch: Record<string, unknown>;
	definitionsByName: Map<string, Doc<"fieldDefinitions">>;
}): SplitPatchResult {
	const columnSet = COLUMN_KEYS[args.entityType];
	const columnPatch: Record<string, unknown> = {};
	const customFields: SplitPatchResult["customFields"] = [];
	const unknownFields: string[] = [];

	for (const [key, value] of Object.entries(args.patch)) {
		if (value === undefined) continue;
		// Defensive: never let a code-shaped key bleed into the column patch.
		// This is what the original incident did — `code: "P-001"` got passed
		// to `leads.update` and exploded. The helper catches it explicitly.
		if (
			key === "code" ||
			key === "personCode" ||
			key === "dealCode" ||
			key === "companyCode" ||
			key === "leadId" ||
			key === "contactId" ||
			key === "dealId" ||
			key === "companyId"
		) {
			continue;
		}

		if (columnSet.has(key)) {
			columnPatch[key] = value;
			continue;
		}

		const def = args.definitionsByName.get(key);
		if (def && (def.storage === "fieldValues" || def.storage === undefined)) {
			customFields.push({ name: key, value, fieldId: def._id });
			continue;
		}

		// Some templates store certain things on the row but expose them
		// under the same name in fieldDefinitions (e.g. system "displayName").
		// We've already handled the column case above, so anything left
		// either lacks a definition (unknown) or is wired to "join" / "column"
		// without a matching column key — surface it.
		unknownFields.push(key);
	}

	return { columnPatch, customFields, unknownFields };
}

// ─── Custom-field upsert ────────────────────────────────────────────────────

/**
 * Idempotent upsert into `fieldValues`. Looks up by
 * (orgId, fieldId, entityId); patches when present, inserts otherwise.
 */
async function upsertFieldValue(
	ctx: MutationCtx,
	args: {
		orgId: Id<"orgs">;
		entityType: AIEntityType;
		entityId: string;
		fieldId: Id<"fieldDefinitions">;
		fieldName: string;
		value: unknown;
	},
): Promise<void> {
	const now = Date.now();
	const existing = await ctx.db
		.query("fieldValues")
		.withIndex("by_field_and_entity", (q) =>
			q.eq("orgId", args.orgId).eq("fieldId", args.fieldId).eq("entityId", args.entityId),
		)
		.first();

	if (existing) {
		await ctx.db.patch(existing._id, { value: args.value, updatedAt: now });
		return;
	}
	await ctx.db.insert("fieldValues", {
		orgId: args.orgId,
		entityType: args.entityType,
		entityId: args.entityId,
		fieldId: args.fieldId,
		fieldName: args.fieldName,
		value: args.value,
		updatedAt: now,
	});
}

// ─── Apply (the main entry point) ───────────────────────────────────────────

export interface ApplyResult {
	entityType: AIEntityType;
	entityId: string;
	canonicalCode: string;
	before: Record<string, unknown>;
	after: Record<string, unknown>;
	columnsApplied: string[];
	customFieldsApplied: Array<{ name: string; value: unknown }>;
	unknownFields: string[];
}

/**
 * Resolve a code, split + apply the patch, return the diff. The caller
 * (typically a `*ForAI` internal mutation) is expected to have already
 * validated the user is a member of the org and holds the right
 * permission. This helper does NOT call `requireOrgMemberByIds`.
 *
 * Throws `NOT_FOUND` (ConvexError) when the code can't be resolved.
 */
export async function applyEntityPatchByCodeImpl(
	ctx: MutationCtx,
	args: {
		orgId: Id<"orgs">;
		userId: Id<"users">;
		entityType: AIEntityType;
		code: string;
		patch: Record<string, unknown>;
	},
): Promise<ApplyResult> {
	const resolved = await resolveCodeToRecordForAI(ctx, {
		orgId: args.orgId,
		entityType: args.entityType,
		code: args.code,
	});
	if (!resolved) {
		throw new ConvexError({
			code: "NOT_FOUND",
			message: `No ${args.entityType} found with code ${args.code}.`,
		});
	}

	// Pre-fetch field definitions once.
	const fieldDefRows = await ctx.db
		.query("fieldDefinitions")
		.withIndex("by_org_and_entity", (q) =>
			q.eq("orgId", args.orgId).eq("entityType", args.entityType),
		)
		.collect();
	const defByName = new Map<string, Doc<"fieldDefinitions">>();
	for (const def of fieldDefRows) {
		// First-write-wins: if the table accidentally contains duplicates
		// (the `records` bug), keep the OLDEST row's id stable so the
		// existing fieldValues already pointing at it stay attached.
		if (!defByName.has(def.name)) defByName.set(def.name, def);
	}

	const split = splitPatchForEntity({
		entityType: args.entityType,
		patch: args.patch,
		definitionsByName: defByName,
	});

	const before = resolved.row as unknown as Record<string, unknown>;
	const now = Date.now();
	const rowPatch: Record<string, unknown> = { ...split.columnPatch };

	// Mirror the per-entity normalisation rules that the public update
	// mutations apply. Today only leads + contacts keep `normalizedPhone`
	// in sync with `phone`; the others don't carry a normalised column.
	if (
		(args.entityType === "lead" || args.entityType === "contact") &&
		typeof split.columnPatch.phone === "string" &&
		split.columnPatch.phone.length > 0
	) {
		rowPatch.normalizedPhone = normalizePhone(split.columnPatch.phone as string);
	}

	if (Object.keys(rowPatch).length > 0) {
		rowPatch.updatedAt = now;
		await ctx.db.patch(resolved.row._id as never, rowPatch);
	}

	for (const cf of split.customFields) {
		await upsertFieldValue(ctx, {
			orgId: args.orgId,
			entityType: args.entityType,
			entityId: resolved.row._id as unknown as string,
			fieldId: cf.fieldId,
			fieldName: cf.name,
			value: cf.value,
		});
	}

	const after: Record<string, unknown> = { ...before, ...rowPatch };
	for (const cf of split.customFields) {
		after[cf.name] = cf.value;
	}

	// Per-field activity logging — matches the pattern used by the
	// public update mutations so the timeline reads identically whether
	// a human or the AI made the change.
	const colKeys = Object.keys(split.columnPatch);
	if (colKeys.length > 0) {
		await logFieldUpdates(ctx, {
			orgId: args.orgId,
			userId: args.userId,
			entityType: args.entityType,
			entityId: resolved.row._id as never,
			personCode: (resolved.row as { personCode?: string }).personCode,
			displayName:
				(resolved.row as { displayName?: string; title?: string; name?: string })
					.displayName ??
				(resolved.row as { title?: string }).title ??
				(resolved.row as { name?: string }).name ??
				"",
			before,
			after,
			fields: colKeys,
		});
	}

	if (split.customFields.length > 0) {
		await logActivity(ctx, {
			orgId: args.orgId,
			userId: args.userId,
			action: "field_updated",
			entityType: args.entityType,
			entityId: resolved.row._id as never,
			personCode: (resolved.row as { personCode?: string }).personCode,
			description: `${args.entityType} custom fields updated: ${split.customFields
				.map((f) => f.name)
				.join(", ")}`,
		});
	}

	return {
		entityType: args.entityType,
		entityId: resolved.row._id as unknown as string,
		canonicalCode: resolved.canonicalCode,
		before,
		after,
		columnsApplied: colKeys,
		customFieldsApplied: split.customFields.map((cf) => ({
			name: cf.name,
			value: cf.value,
		})),
		unknownFields: split.unknownFields,
	};
}

/**
 * Same shape as `applyEntityPatchByCodeImpl` but for a record we already
 * know the id of (e.g. just created via `commit_create_lead`). Applies
 * only the custom-field portion — the column portion is assumed to have
 * been written by the create mutation already.
 */
export async function applyCustomFieldsForRecordImpl(
	ctx: MutationCtx,
	args: {
		orgId: Id<"orgs">;
		userId: Id<"users">;
		entityType: AIEntityType;
		entityId: string;
		customFields: Record<string, unknown>;
	},
): Promise<{ applied: Array<{ name: string; value: unknown }>; unknown: string[] }> {
	const fieldDefRows = await ctx.db
		.query("fieldDefinitions")
		.withIndex("by_org_and_entity", (q) =>
			q.eq("orgId", args.orgId).eq("entityType", args.entityType),
		)
		.collect();
	const defByName = new Map<string, Doc<"fieldDefinitions">>();
	for (const def of fieldDefRows) {
		if (!defByName.has(def.name)) defByName.set(def.name, def);
	}

	const applied: Array<{ name: string; value: unknown }> = [];
	const unknown: string[] = [];
	for (const [name, value] of Object.entries(args.customFields)) {
		if (value === undefined || value === null) continue;
		const def = defByName.get(name);
		if (!def || (def.storage !== "fieldValues" && def.storage !== undefined)) {
			unknown.push(name);
			continue;
		}
		await upsertFieldValue(ctx, {
			orgId: args.orgId,
			entityType: args.entityType,
			entityId: args.entityId,
			fieldId: def._id,
			fieldName: name,
			value,
		});
		applied.push({ name, value });
	}

	if (applied.length > 0) {
		await logActivity(ctx, {
			orgId: args.orgId,
			userId: args.userId,
			action: "field_updated",
			entityType: args.entityType,
			entityId: args.entityId as never,
			description: `${args.entityType} custom fields updated: ${applied
				.map((f) => f.name)
				.join(", ")}`,
		});
	}

	return { applied, unknown };
}

export const PERMISSION_FOR_ENTITY = PERMISSION_KEY;

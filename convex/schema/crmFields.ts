/**
 * Schema — CRM fields domain.
 *
 * Tables: pipelines, fieldDefinitions, fieldValues, entityCodeCounters, orbitLinks.
 *
 * These tables drive the dynamic field system + pipelines + cross-entity links.
 * Field definitions are the single source of truth — every form, table column,
 * card highlight, and AI tool reads from here.
 */

import { defineTable } from "convex/server";
import { v } from "convex/values";
import { orgScoped, timestamps } from "../_shared/validators";

/**
 * Deal pipelines with inline stages. Seeded on industry selection.
 */
export const pipelines = defineTable({
	...orgScoped,
	name: v.string(),
	entityType: v.string(),
	isDefault: v.boolean(),
	/**
	 * Per-pipeline policy controlling what happens when a deal moves to a
	 * stage but is missing one or more `required` fields that are scoped
	 * to that stage (via `fieldDefinitions.showInStages`).
	 *
	 *   - `"block"` — mutation throws `MISSING_REQUIRED_FIELDS`; the move
	 *     does not happen. UI prompts the user to fill the gaps and
	 *     auto-retries. Best for compliance-heavy stages.
	 *   - `"warn"`  — move succeeds; an `stage_changed_with_missing_fields`
	 *     activity row is logged; UI shows an amber pill on the card and
	 *     highlights the gaps in the deal-detail form. **Default.**
	 *   - `"off"`   — no checks at all. Use when stage-aware required
	 *     fields don't apply to this pipeline.
	 *
	 * Optional for backwards compatibility — when missing, treated as `"warn"`.
	 */
	stageTransitionPolicy: v.optional(
		v.union(v.literal("block"), v.literal("warn"), v.literal("off")),
	),
	/**
	 * Whether deals can skip stages (jump from Default → 3rd → Final), or
	 * must advance one stage at a time. Only enforced when
	 * `stageTransitionPolicy === "block"` — under "warn" / "off" there is
	 * no enforcement at all so this flag is irrelevant.
	 *
	 * Default `false` (one-stage-at-a-time when policy is "block").
	 */
	allowSkipStages: v.optional(v.boolean()),
	/**
	 * Whether *all* required fields across every non-final stage must be
	 * filled before a deal can be marked as done (won/neutral). Lost is
	 * NEVER gated by this — owners can mark a deal lost from any stage.
	 *
	 * Default `true` — closing a deal demands a complete record.
	 */
	markDoneRequiresAllFields: v.optional(v.boolean()),
	stages: v.array(
		v.object({
			id: v.string(),
			name: v.string(),
			/**
			 * Short, human-typeable, org-pipeline-unique stage code.
			 *
			 * Format: `^[A-Z0-9_-]{2,16}$` (validated server-side in
			 * mutations + helpers). Owner-typed, auto-suggested from the
			 * stage name on first save, freely renameable.
			 *
			 * Used everywhere ambiguity must collapse to one value:
			 * activity-log entries, AI tool calls, WhatsApp voice notes,
			 * URL hash filters, saved-view filters.
			 *
			 * REQUIRED — see `convex/crm/fields/pipelines/MODULE.md`.
			 */
			code: v.string(),
			order: v.number(),
			color: v.optional(v.string()),
			/**
			 * The "Default" stage of the pipeline.
			 *
			 *   - Auto-created on `pipelines.create` (one per pipeline).
			 *   - Cannot be removed.
			 *   - Holds the **default fields** that show on every stage of
			 *     the pipeline (every deal carries them regardless of
			 *     where it currently is).
			 *   - Other stages cannot have `isDefaultStage = true`.
			 *   - Label is editable (default = "Default") but the role is
			 *     fixed.
			 *   - Always sits at `order = 0`.
			 */
			isDefaultStage: v.optional(v.boolean()),
			isFinal: v.optional(v.boolean()),
			finalType: v.optional(
				v.union(v.literal("positive"), v.literal("negative"), v.literal("neutral")),
			),
			staleAfterDays: v.optional(v.number()),
			staleColor: v.optional(v.string()),
			warningAfterDays: v.optional(v.number()),
			warningColor: v.optional(v.string()),
			/**
			 * Stage 8 — Autonomous layer (`/SPRINT-PLAN.md`). Optional
			 * per-stage automation block. When `autoFollowupTemplate` is
			 * set AND the deal-owner has flipped
			 * `users.preferences.aiAutonomy.autoTaskOnStageMove` on,
			 * `moveToStageImpl` schedules a follow-up task via
			 * `internal.crm.shared.tasks.mutations.createForAI` after
			 * the move lands. The task's due date is `now +
			 * (autoFollowupAfterDays ?? 3)` days, type: "followup",
			 * priority: "normal". Audit row written with
			 * `triggeredBy: "automation:onStageMove"`.
			 *
			 * Both fields are optional — when unset, no automation fires.
			 */
			onEnter: v.optional(
				v.object({
					autoFollowupTemplate: v.optional(v.string()),
					autoFollowupAfterDays: v.optional(v.number()),
				}),
			),
		}),
	),
	...timestamps,
})
	.index("by_org", ["orgId"])
	.index("by_org_and_entity", ["orgId", "entityType"])
	.index("by_org_and_default", ["orgId", "isDefault"])
	.index("by_org_and_entity_and_default", ["orgId", "entityType", "isDefault"]);

/**
 * Per-org, per-type atomic counters for personCode, dealCode, etc.
 */
export const entityCodeCounters = defineTable({
	orgId: v.id("orgs"),
	entityType: v.string(),
	count: v.number(),
	createdAt: v.number(),
}).index("by_org_and_type", ["orgId", "entityType"]);

/**
 * Universal junction table for lateral connections between entities.
 * personCode handles vertical (everything → person). orbitLinks handles lateral.
 * Examples: deal ↔ company, contact ↔ whatsapp thread, document ↔ contact.
 */
export const orbitLinks = defineTable({
	orgId: v.id("orgs"),
	fromCode: v.string(),
	fromType: v.string(),
	toCode: v.string(),
	toType: v.string(),
	linkType: v.string(),
	metadata: v.optional(v.any()),
	createdAt: v.number(),
	createdBy: v.optional(v.id("users")),
})
	.index("by_org_and_from", ["orgId", "fromCode"])
	.index("by_org_and_to", ["orgId", "toCode"])
	.index("by_org_and_type", ["orgId", "linkType"]);

/**
 * Admin-defined custom fields per entity type. AI reads these to know what
 * fields exist. System (seeded) fields and admin-created custom fields share
 * this table — distinguished by `system: true` (seeded by an industry
 * template) and `protected: true` (cannot be deleted or hidden).
 */
export const fieldDefinitions = defineTable({
	...orgScoped,
	entityType: v.string(),
	name: v.string(),
	label: v.string(),
	labelAr: v.optional(v.string()),
	type: v.string(),
	kind: v.optional(v.string()),
	storage: v.optional(v.string()),
	columnKey: v.optional(v.string()),
	system: v.optional(v.boolean()),
	protected: v.optional(v.boolean()),
	hidden: v.optional(v.boolean()),
	options: v.optional(v.array(v.string())),
	required: v.boolean(),
	order: v.number(),
	groupName: v.optional(v.string()),
	sensitive: v.optional(v.boolean()),
	defaultValue: v.optional(v.any()),
	showInStages: v.optional(v.array(v.string())),
	/**
	 * For `type === "file"` / `type === "files"` fields ONLY.
	 *
	 * Whitelist of file-category ids (`image`, `pdf`, `document`,
	 * `spreadsheet`, `video`, `audio`, `archive`, `other`) that this
	 * field accepts. `undefined` / `[]` means "any file type allowed".
	 *
	 * Replaces the legacy org-wide `org.settings.fileUpload
	 * .allowedMimeCategories` knob — file restrictions are now declared
	 * **per field** at field-creation time so different fields on the
	 * same record can demand different file types (e.g. an "ID photo"
	 * field accepts only images while a "contract" field accepts only
	 * PDFs + Word).
	 *
	 * Source of truth: `core/data-io/files/file-categories.ts` —
	 * `FILE_CATEGORIES[].id` are the only legal entries here.
	 *
	 * Server enforcement: `convex/files/mutations.ts::record` looks up
	 * the field definition by `fieldKey` and rejects uploads whose
	 * mime type doesn't match one of the listed categories.
	 */
	allowedFileTypes: v.optional(v.array(v.string())),
	...timestamps,
}).index("by_org_and_entity", ["orgId", "entityType"]);

/**
 * Actual field-value data per record. One row per field per entity.
 * Indexed by `by_field_and_entity` (orgId, fieldId, entityId) — supports
 * 2-key prefix queries for "all values for this field" and 3-key full
 * queries for "value of this field on this entity".
 */
export const fieldValues = defineTable({
	...orgScoped,
	entityType: v.string(),
	entityId: v.string(),
	fieldId: v.id("fieldDefinitions"),
	fieldName: v.string(),
	value: v.any(),
	updatedAt: v.number(),
})
	.index("by_entity", ["orgId", "entityType", "entityId"])
	.index("by_field_and_entity", ["orgId", "fieldId", "entityId"]);

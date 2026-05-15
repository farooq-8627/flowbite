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
	stages: v.array(
		v.object({
			id: v.string(),
			name: v.string(),
			order: v.number(),
			color: v.optional(v.string()),
			isFinal: v.optional(v.boolean()),
			finalType: v.optional(
				v.union(v.literal("positive"), v.literal("negative"), v.literal("neutral")),
			),
			staleAfterDays: v.optional(v.number()),
			staleColor: v.optional(v.string()),
			warningAfterDays: v.optional(v.number()),
			warningColor: v.optional(v.string()),
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

# convex/fieldValues — MODULE.md

> **Ownership:** `convex/fieldValues/` | **Phase:** 2 | **Consumers:** entity detail pages, entity forms, AI tools, CSV import, WhatsApp voice processor

---

## Purpose

Stores actual field data for entities. Part of the EAV (Entity-Attribute-Value) system. Each row represents one field value for one entity. Uses an **upsert pattern** (create or update) to ensure exactly one row per entity+field combination.

---

## Schema

```typescript
fieldValues: defineTable({
  orgId: v.id("orgs"),
  entityType: v.string(),
  entityId: v.string(),            // the entity record ID
  fieldId: v.id("fieldDefinitions"),
  fieldName: v.string(),           // denormalized for fast lookup
  value: v.any(),                  // actual value (string, number, array, etc.)
  source: v.optional(v.string()),  // "manual" | "ai" | "csv" | "whatsapp" | "web_enrichment"
  updatedAt: v.number(),
})
.index("by_entity", ["orgId", "entityType", "entityId"])
.index("by_field", ["orgId", "fieldId"])
.index("by_entity_and_field", ["orgId", "entityType", "entityId", "fieldId"]),
```

### Index Usage

| Index | Purpose |
|-------|---------|
| `by_entity` | Load all field values for a single entity (detail pages, forms) |
| `by_field` | Query all values for a specific field across entities (reports, range queries) |
| `by_entity_and_field` | Upsert lookup — find existing row for entity+field combo |

---

## Queries

### `getForEntity(entityType, entityId)`

Returns a key-value map of all field values for a given entity.

- **Index used:** `by_entity`
- **Returns:** `Record<string, any>` keyed by `fieldName`
- **Consumers:** entity detail pages, entity forms, AI read tools

### `getByFieldInRange(fieldId, from, to)`

Returns field value rows where `value` falls within a numeric/date range.

- **Index used:** `by_field`
- **Returns:** array of field value documents matching the range
- **Consumers:** rent alert system, date-based reminders, scheduled notifications

---

## Mutations

### `upsert(entityType, entityId, fieldId, value)`

Creates or updates a single field value for an entity.

**Upsert pattern:**
1. Query `by_entity_and_field` index for existing row matching `orgId + entityType + entityId + fieldId`
2. If row exists → `ctx.db.patch(existingId, { value, updatedAt, source })`
3. If no row → `ctx.db.insert("fieldValues", { ...allFields })`

- **Consumers:** AI update tool, manual form edits, single-field updates

### `batchUpsert(entityType, entityId, fieldValues[])`

Upserts multiple field values for a single entity in one mutation call.

- **Input:** array of `{ fieldId, fieldName, value, source }`
- **Logic:** iterates and applies the upsert pattern for each entry
- **Consumers:** WhatsApp voice processor, CSV import, AI bulk updates

### `copyFieldValues(fromType, fromId, toType, toId)`

Copies all field values from one entity to another (e.g., template duplication).

- **Logic:** queries all values for source entity via `by_entity`, inserts new rows for target entity
- **Consumers:** entity duplication, template instantiation

---

## AI Integration

| Caller | Mutation Used | Notes |
|--------|--------------|-------|
| AI update tool | `upsert` | Single field update from AI extraction |
| WhatsApp voice processor | `batchUpsert` | Multiple fields parsed from voice message |
| CSV import | `batchUpsert` | Bulk row import maps columns to fields |
| Web enrichment | `upsert` | Single field populated from external data |

---

## Rules

1. Every mutation must validate `orgId` matches the authenticated user's org.
2. Always set `updatedAt` to `Date.now()` on every write.
3. Always set `source` to indicate the origin of the write.
4. `fieldName` must be denormalized from the `fieldDefinitions` table at write time.
5. Use the `by_entity_and_field` index for upsert lookups — never scan.
6. Batch mutations must not exceed 100 field values per call.

---

## Avoids

- Do NOT store computed/derived values — compute them at read time or in a separate table.
- Do NOT nest objects inside `value` deeper than 2 levels — keep values flat or simple arrays.
- Do NOT query `by_entity` without `orgId` — always scope to org.
- Do NOT bypass the upsert pattern with raw inserts — duplicates break the system.

---

## Never-Do List

- ❌ **Never** delete field values without also checking dependent automations (alerts, workflows).
- ❌ **Never** write to `fieldValues` without a valid `fieldId` reference in `fieldDefinitions`.
- ❌ **Never** trust client-supplied `fieldName` — always resolve from `fieldDefinitions` server-side.
- ❌ **Never** allow cross-org reads — every query must filter by authenticated `orgId`.
- ❌ **Never** store file blobs in `value` — use Convex file storage and store the storage ID.
- ❌ **Never** mutate `fieldValues` in a query function — mutations only.

# convex/fieldDefinitions — MODULE.md

> **Ownership:** `convex/fieldDefinitions/` | **Phase:** 2 | **Consumers:** DynamicFieldRenderer, entity forms, AI system prompt, CSV import mapping

---

## Purpose

Defines the schema for **custom fields per entity type per org**. Part of the EAV (Entity-Attribute-Value) system.

- **Field DEFINITIONS** (this module) → define _what fields exist_
- **Field VALUES** (separate module) → store _the actual data_

Each org can define unlimited custom fields for any entity type. Fields are grouped, ordered, and optionally stage-aware.

---

## Schema

```typescript
fieldDefinitions: defineTable({
  orgId: v.id("orgs"),
  entityType: v.string(),       // "lead" | "contact" | "deal" | "company" | "entity5" | "entity6"
  name: v.string(),             // internal name (snake_case, no spaces)
  label: v.string(),            // display label
  type: v.string(),             // "text" | "textarea" | "number" | "currency" | "date" | "datetime"
                                // | "select" | "multiselect" | "checkbox" | "email" | "phone"
                                // | "url" | "file" | "user_picker"
  groupName: v.string(),        // "Financial" | "Property" | "Documents" | "Custom"
  order: v.number(),
  options: v.optional(v.array(v.string())),       // for select/multiselect
  isRequired: v.optional(v.boolean()),
  showInStages: v.optional(v.array(v.string())),  // stage IDs — empty/undefined = show always
  sensitive: v.optional(v.boolean()),             // hidden from AI context for non-admin
  visibleToRoles: v.optional(v.array(v.string())), // future: role-based visibility
  validation: v.optional(v.any()),                // regex, min/max, etc.
  createdAt: v.number(),
  updatedAt: v.number(),
})
  .index("by_org_and_entity", ["orgId", "entityType"])
  .index("by_org_and_name", ["orgId", "entityType", "name"]),
```

### Indexes

| Index | Fields | Use Case |
|-------|--------|----------|
| `by_org_and_entity` | `orgId`, `entityType` | List all field definitions for an entity type |
| `by_org_and_name` | `orgId`, `entityType`, `name` | Unique lookup by internal name |

---

## Queries

| Function | Args | Returns | Notes |
|----------|------|---------|-------|
| `listByEntity` | `entityType` | All field definitions for that entity type in the current org, ordered by `order` | No stage filtering — used by admin/settings UI |
| `listForEntity` | `entityType`, `currentStageId` | Filtered field definitions visible at the given stage | Backend filters by `showInStages` BEFORE returning to client |
| `getByName` | `entityType`, `name` | Single field definition or `null` | Used by CSV import mapping and AI tools |

### Stage-Aware Filtering Logic

```
if field.showInStages is undefined or empty → include (show always)
if field.showInStages contains currentStageId → include
otherwise → exclude
```

The **backend** performs this filtering. The frontend renders exactly what it receives — no client-side stage logic.

---

## Mutations

| Function | Args | RBAC | Notes |
|----------|------|------|-------|
| `create` | Field definition object | `fields.manage` | Validates unique `name` per org+entityType. Auto-sets `createdAt`/`updatedAt`. |
| `update` | `id`, partial field definition | `fields.manage` | Cannot change `orgId`, `entityType`, or `name`. Updates `updatedAt`. |
| `delete` | `id` | `fields.manage` | Cascades: also deletes all field VALUES for this definition. |
| `reorder` | `entityType`, `orderedIds[]` | `fields.manage` | Bulk updates `order` field for all provided IDs. |
| `batchCreate` | `entityType`, `definitions[]` | `fields.manage` | Used by AI workspace setup and org templates. Skips duplicates by `name`. |

---

## RBAC

| Permission | Who | What |
|------------|-----|------|
| `fields.view` | All authenticated org members | Read field definitions (queries) |
| `fields.manage` | Admin+ | Create, update, delete, reorder field definitions |

---

## AI Integration

- **System prompt injection:** All non-sensitive (`sensitive !== true`) field definitions for the current entity type are serialized and injected into the AI system prompt. This gives the AI context about what fields exist and their types.
- **AI workspace.setupFields tool:** Calls `batchCreate` to provision default field definitions when setting up a new workspace/entity type.
- **Sensitive fields:** Fields marked `sensitive: true` are excluded from AI context for non-admin users. Admin users see all fields in AI context.

---

## Consumers

| Consumer | How it uses field definitions |
|----------|------------------------------|
| **DynamicFieldRenderer** | Reads `listForEntity` → renders form controls based on `type` |
| **Entity forms** (create/edit) | Uses field definitions to build dynamic form sections grouped by `groupName` |
| **AI system prompt** | Injects non-sensitive definitions for entity context |
| **CSV import mapping** | Uses `getByName` to map CSV columns to field definitions |
| **Admin settings** | Uses `listByEntity` + mutations to manage field definitions |

---

## Rules

1. Field `name` must be unique per `orgId` + `entityType` — enforced at mutation level.
2. Field `name` must be `snake_case` with no spaces — validated on create.
3. `options` array is required when `type` is `select` or `multiselect` — validated on create/update.
4. `order` is a positive integer. Gaps are allowed (reorder normalizes).
5. Deleting a field definition MUST cascade-delete all associated field values.
6. `showInStages` filtering happens server-side only — never trust client filtering.
7. All mutations require `fields.manage` permission — checked before any write.
8. `createdAt` is set once on creation; `updatedAt` is set on every mutation.

---

## Avoids

- ❌ Do NOT store field values in this table — values live in a separate `fieldValues` table.
- ❌ Do NOT allow duplicate `name` per org+entityType — enforce uniqueness.
- ❌ Do NOT perform stage filtering on the client — always server-side.
- ❌ Do NOT expose sensitive fields to AI for non-admin users.
- ❌ Do NOT allow renaming `name` after creation — it's an internal identifier used by CSV import and AI.
- ❌ Do NOT use `entityType` values outside the allowed set — validate against enum.

---

## Never-Do List

- 🚫 **NEVER** return unfiltered field definitions from `listForEntity` — always apply stage filter.
- 🚫 **NEVER** delete a field definition without cascading to field values.
- 🚫 **NEVER** allow `fields.manage` mutations without RBAC check.
- 🚫 **NEVER** trust client-provided `orgId` — always derive from authenticated session.
- 🚫 **NEVER** allow spaces or uppercase in `name` field — enforce snake_case.
- 🚫 **NEVER** skip `updatedAt` timestamp on mutations.
- 🚫 **NEVER** expose `validation` internals to non-admin users in query responses.

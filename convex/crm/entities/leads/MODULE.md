# convex/leads — MODULE.md

> **Ownership:** `convex/leads/` | **Phase:** 2 | **Consumers:** `core/entities/leads/`, AI tools, CSV import, WhatsApp, integrations

---

## Purpose

Lead entity backend. Leads are the **entry point for every person** in the CRM. `personCode` is generated HERE and only here. Leads use a simple status field (not pipeline stages). Conversion to contact passes `personCode` — it is never regenerated.

---

## Schema

```typescript
leads: defineTable({
  orgId: v.id("orgs"),
  personCode: v.string(),        // "P-001" — generated on create, NEVER regenerated
  displayName: v.string(),
  email: v.optional(v.string()),
  phone: v.optional(v.string()),
  status: v.string(),            // "new" | "contacted" | "qualified" | "converted" | "lost"
  source: v.string(),            // "manual" | "ai" | "csv" | "whatsapp" | "gmail" | "zapier" | "rest_api"
  assignedTo: v.optional(v.id("users")),
  convertedAt: v.optional(v.number()),
  contactId: v.optional(v.id("contacts")), // set on conversion
  aiContext: v.optional(v.any()),
  createdAt: v.number(),
  updatedAt: v.number(),
})
.index("by_org", ["orgId"])
.index("by_org_and_status", ["orgId", "status"])
.index("by_org_and_assignee", ["orgId", "assignedTo"])
.index("by_org_and_personCode", ["orgId", "personCode"])
.searchIndex("search_displayName", { searchField: "displayName", filterFields: ["orgId"] })
```

---

## Queries

| Function | Description |
|----------|-------------|
| `list(filters, pagination)` | Paginated list with optional filters (status, assignedTo, source, search) |
| `getById(id)` | Single lead by `_id` |
| `getByPersonCode(orgId, personCode)` | Single lead by org-scoped personCode |

---

## Mutations

| Function | Description |
|----------|-------------|
| `create()` | Generates `personCode` via `generatePersonCode()`, runs dedup, inserts lead |
| `update()` | Partial update of mutable fields |
| `convertToContact()` | Sets status to `"converted"`, creates contact with existing `personCode` |
| `bulkUpdate()` | Batch status/assignee changes |
| `updateAiContext()` | Overwrites `aiContext` field for AI enrichment |

---

## Critical Invariants

### personCode Generation

- `create()` calls `generatePersonCode(orgId)` — this is the **ONLY** place `personCode` is generated for a person.
- Format: `"P-001"`, `"P-002"`, etc. Sequential per org.
- Once assigned, `personCode` is **immutable**. No mutation may overwrite it.

### Conversion Flow

- `convertToContact()` reads `lead.personCode` and passes it to `contacts.create()`.
- The contact inherits the same `personCode` — it is **NEVER** regenerated.
- Sets `lead.status = "converted"`, `lead.convertedAt = Date.now()`, `lead.contactId = newContactId`.

### Deduplication

- `create()` calls `runDedup(orgId, email, phone)` before inserting.
- If a match is found, the mutation throws with the existing lead's `personCode`.

### Activity Logging

- Every mutation calls `logActivity()` with the `personCode` field.
- Activity types: `lead.created`, `lead.updated`, `lead.converted`, `lead.bulk_updated`, `lead.ai_context_updated`.

### AI Context Rebuild

- Every significant mutation (`create`, `update`, `convertToContact`) schedules `rebuildEntityContext` via `ctx.scheduler`.
- This keeps the AI context vector fresh for semantic search and AI tools.

---

## RBAC Permissions

| Permission | Guards |
|------------|--------|
| `leads.view` | `list`, `getById`, `getByPersonCode` |
| `leads.create` | `create` |
| `leads.update` | `update`, `bulkUpdate`, `updateAiContext` |
| `leads.delete` | (soft-delete, future) |
| `leads.convert` | `convertToContact` |
| `leads.import` | CSV/bulk import entry point |

All mutations and queries check RBAC via `assertPermission(ctx, orgId, permission)` before executing.

---

## Rules

1. Every query/mutation receives `orgId` and scopes all DB access to that org.
2. All timestamps use `Date.now()` (epoch ms).
3. `updatedAt` is set on every mutation.
4. Mutations are idempotent where possible (dedup on create, no-op on duplicate convert).
5. All errors throw `ConvexError` with structured `{ code, message, personCode? }`.

---

## Avoids

- ❌ Do NOT put pipeline/stage logic in leads — that belongs in `deals`.
- ❌ Do NOT store full conversation history in `aiContext` — store summaries only.
- ❌ Do NOT query without org scoping — every index starts with `orgId`.
- ❌ Do NOT return raw `_id` to frontend without also returning `personCode`.

---

## Never-Do List

- 🚫 **NEVER** regenerate `personCode` after creation — not in update, not in convert, not anywhere.
- 🚫 **NEVER** generate `personCode` outside of `convex/leads/create` — no other module may mint person codes.
- 🚫 **NEVER** delete a lead record permanently — use status `"lost"` or soft-delete flag.
- 🚫 **NEVER** skip `logActivity()` in a mutation — every state change must be auditable.
- 🚫 **NEVER** skip RBAC checks — no "internal-only" bypass for user-facing mutations.
- 🚫 **NEVER** allow `convertToContact()` on an already-converted lead (status === "converted").

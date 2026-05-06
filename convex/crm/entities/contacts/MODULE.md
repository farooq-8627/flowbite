# convex/contacts — MODULE.md

> **Ownership:** `convex/contacts/` | **Phase:** 2 | **Consumers:** `core/entities/contacts/`, AI tools, CSV import, WhatsApp, integrations

---

## Purpose

Contact entity backend. Contacts are created from **lead conversion** OR **directly** (CSV, integration). `personCode` is PASSED from lead on conversion — never regenerated. Contacts have richer data than leads.

---

## Schema

```typescript
contacts: defineTable({
  orgId: v.id("orgs"),
  personCode: v.string(),        // "P-001" - passed from lead OR generated if direct create
  displayName: v.string(),
  email: v.optional(v.string()),
  phone: v.optional(v.string()),
  leadId: v.optional(v.id("leads")),       // traceability - which lead this came from
  companyId: v.optional(v.id("companies")),
  companyCode: v.optional(v.string()),
  assignedTo: v.optional(v.id("users")),
  aiContext: v.optional(v.any()),
  createdAt: v.number(),
  updatedAt: v.number(),
})
.index("by_org", ["orgId"])
.index("by_org_and_personCode", ["orgId", "personCode"])
.index("by_org_and_company", ["orgId", "companyId"])
.index("by_org_and_assignee", ["orgId", "assignedTo"])
.searchIndex("search_displayName", { searchField: "displayName", filterFields: ["orgId"] })
```

---

## Queries

| Function | Description |
|----------|-------------|
| `list(filters, pagination)` | Paginated list with filters (org, company, assignee, search) |
| `getById(id)` | Single contact by `_id` |
| `getByPersonCode(orgId, personCode)` | Lookup by org-scoped person code |

---

## Mutations

| Function | Description |
|----------|-------------|
| `create()` | `personCode` passed in args (from lead conversion) OR generated via `generatePersonCode()` if direct create. Calls `runDedup()`. |
| `update()` | Partial update, sets `updatedAt` |
| `merge(primaryId, secondaryId)` | Combines two contact records — primary wins on conflicts, creates `contactMergeHistory` entry |
| `updateAiContext(id, aiContext)` | Patches AI context blob for AI tools |

---

## Critical Rules

### personCode Handling

- **Lead conversion:** `personCode` comes from the lead record. Never regenerate.
- **Direct create (CSV, integration):** `generatePersonCode()` is called to mint a new code.

### Deduplication

- `create()` calls `runDedup()` — same dedup engine as leads.
- Dedup checks: email, phone, displayName similarity within the org.

### Merge

- `merge()` combines two contact records into one.
- **Primary wins** on all field conflicts.
- Creates a `contactMergeHistory` entry for audit trail.
- Secondary record is soft-deleted (or tombstoned).

---

## RBAC Permissions

| Permission | Description |
|------------|-------------|
| `contacts.view` | Read contact records |
| `contacts.create` | Create new contacts |
| `contacts.update` | Edit existing contacts |
| `contacts.delete` | Delete/archive contacts |
| `contacts.merge` | Merge two contacts into one |

All mutations enforce RBAC via `assertPermission()` before execution.

---

## Rules

1. Always scope queries by `orgId` — no cross-org data leaks.
2. `personCode` is immutable after creation.
3. `createdAt` set once on insert; `updatedAt` set on every mutation.
4. Dedup runs on every `create()` — no silent duplicates.
5. Merge always produces an audit entry in `contactMergeHistory`.
6. `aiContext` is opaque — only AI tools write to it.

---

## Avoids

- Do NOT regenerate `personCode` on update or merge.
- Do NOT allow create without `orgId`.
- Do NOT skip dedup on any creation path (CSV, integration, manual).
- Do NOT hard-delete contacts — use soft-delete/archive pattern.

---

## Never-Do List

- ❌ Never expose contacts across orgs (multi-tenant boundary).
- ❌ Never allow merge without `contacts.merge` permission.
- ❌ Never overwrite `personCode` after initial assignment.
- ❌ Never skip `runDedup()` in `create()`.
- ❌ Never store PII in `aiContext` — only AI-generated summaries/tags.

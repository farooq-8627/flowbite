# convex/companies — MODULE.md

> **Ownership:** `convex/companies/` | **Phase:** 2 | **Consumers:** `core/entities/companies/`, AI tools, deal forms (company picker)

---

## Purpose

Company entity backend. Optional per industry — freelancers hide it via `entityVisibility` org setting. B2B first-class entity. Each company gets a sequential `companyCode` (e.g. `CO-001`). Contacts and deals can link to a company via foreign key.

---

## Schema

```typescript
companies: defineTable({
  orgId: v.id("orgs"),
  companyCode: v.string(),       // "CO-001" — auto-generated, sequential per org
  name: v.string(),
  industry: v.optional(v.string()),
  website: v.optional(v.string()),
  assignedTo: v.optional(v.id("users")),
  aiContext: v.optional(v.any()), // AI-generated context/summary
  createdAt: v.number(),
  updatedAt: v.number(),
})
.index("by_org", ["orgId"])
.index("by_org_and_companyCode", ["orgId", "companyCode"])
.searchIndex("search_name", { searchField: "name", filterFields: ["orgId"] }),
```

### Indexes

| Index | Fields | Use |
|-------|--------|-----|
| `by_org` | `orgId` | List all companies for an org |
| `by_org_and_companyCode` | `orgId`, `companyCode` | Lookup by code (unique per org) |
| `search_name` | search: `name`, filter: `orgId` | Full-text search within org |

---

## API Surface

### Queries

| Function | Args | Returns | RBAC |
|----------|------|---------|------|
| `list()` | `orgId`, optional filters/pagination | Paginated company list | `companies.view` |
| `getById()` | `orgId`, `companyId` | Single company doc | `companies.view` |
| `getByCompanyCode()` | `orgId`, `companyCode` | Single company doc | `companies.view` |

### Mutations

| Function | Args | Returns | RBAC |
|----------|------|---------|------|
| `create()` | `orgId`, `name`, optional fields | New company doc (auto-generates `companyCode`) | `companies.create` |
| `update()` | `orgId`, `companyId`, partial fields | Updated company doc | `companies.edit` |
| `delete()` | `orgId`, `companyId` | void | `companies.delete` |

### companyCode Generation

- Format: `CO-XXX` (zero-padded, e.g. `CO-001`, `CO-042`)
- Sequential per org — query latest `companyCode` via `by_org_and_companyCode` index (descending), increment
- Generated server-side in `create()` mutation — never client-supplied

---

## RBAC Permissions

| Permission | Description |
|------------|-------------|
| `companies.view` | Read company list and details |
| `companies.create` | Create new companies |
| `companies.edit` | Update existing companies |
| `companies.delete` | Delete companies |

All mutations validate org membership + permission before executing.

---

## Design Notes

- **Simpler than leads/contacts** — no `personCode`, no pipeline stages, no conversion flow
- **List-only view** — no Kanban board, no drag-and-drop
- **Optional entity** — visibility controlled by org-level `entityVisibility` setting
- **Relational** — contacts reference `companyId`; deals reference `companyId`
- **AI context** — `aiContext` field stores AI-generated summaries/enrichment (untyped `v.any()`)

---

## Rules

1. Every query/mutation receives `orgId` and validates org membership first
2. `companyCode` is immutable after creation — never updated
3. All writes set `updatedAt = Date.now()`; `create` also sets `createdAt`
4. Deletion is soft-delete if org has audit trail enabled, hard-delete otherwise
5. Search queries always filter by `orgId` — never cross-org results

---

## Avoids

- No pipeline/stage logic — that belongs to leads/deals
- No email/phone fields on company — those live on contacts
- No nested sub-documents — keep flat for index compatibility
- No client-side code generation — `companyCode` is always server-generated

---

## Never-Do List

- ❌ Never expose companies across orgs — always scope by `orgId`
- ❌ Never allow duplicate `companyCode` within the same org
- ❌ Never skip RBAC checks in any query or mutation
- ❌ Never store PII directly on company — contacts hold person-level data
- ❌ Never use `db.query` without the org index — full table scans are banned

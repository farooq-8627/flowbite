# convex/notes — MODULE.md

**Ownership:** `convex/notes/` | Phase 2  
**Purpose:** Rich text notes attached to any entity. Created by users and AI identically. `authorType` distinguishes them. Internal notes hidden from non-admin. Pinnable.

---

## Schema

| Field | Type | Notes |
|-------|------|-------|
| orgId | Id<"orgs"> | Required |
| entityType | string | e.g. "person", "deal", "company" |
| entityId | string | The entity's Convex ID |
| personCode | string | Person code for activity linking |
| content | string | TipTap JSON or plain text |
| authorId | Id<"users"> | Who created the note |
| authorType | "user" \| "ai" \| "portal_client" | Distinguishes creator type |
| isInternal | boolean | Hidden from non-admin when true |
| isPinned | boolean | Pinned notes surface first |
| createdAt | number | Timestamp |
| updatedAt | number | Timestamp |

---

## Indexes

| Name | Fields |
|------|--------|
| by_entity | orgId, entityType, entityId |
| by_personCode | orgId, personCode |

---

## Queries

| Function | Description |
|----------|-------------|
| `listForEntity()` | List all notes for a given entity (orgId + entityType + entityId) |
| `listForPerson(personCode)` | List all notes linked to a personCode within an org |

---

## Mutations

| Function | Description |
|----------|-------------|
| `create()` | Creates note, logs activity with personCode, schedules AI context rebuild |
| `update()` | Updates note content/fields, sets updatedAt |
| `delete()` | Soft or hard delete of a note |
| `togglePin()` | Toggles isPinned on a note |

---

## RBAC

| Permission | Minimum Role |
|------------|--------------|
| notes.create | member+ |
| notes.viewInternal | admin+ |
| notes.pin | admin+ |

---

## Rules

- All notes MUST have orgId, entityType, entityId, and authorType
- `authorType` is the single source of truth for who created the note — never infer from other fields
- Internal notes (`isInternal: true`) are filtered out for non-admin roles at the query level
- Pinned notes sort before unpinned in all list queries
- Every `create()` call logs an activity entry with the associated personCode
- Every `create()` call schedules an AI context rebuild for the linked entity

---

## Avoids

- Do NOT store rendered HTML — store TipTap JSON or plain text only
- Do NOT duplicate content across entityType + personCode — one note, one canonical location
- Do NOT bypass RBAC checks in any query or mutation
- Do NOT expose internal notes through any public-facing API or portal query

---

## Never-Do

- ❌ NEVER allow portal_client authorType to set `isInternal: true`
- ❌ NEVER delete notes without verifying org membership
- ❌ NEVER return internal notes to users without admin+ role check
- ❌ NEVER allow AI to pin notes — only human admins can pin
- ❌ NEVER skip activity logging on create

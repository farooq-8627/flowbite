# convex/savedViews — MODULE.md

**Ownership:** `convex/savedViews/` | Phase 2  
**Purpose:** Filter presets that can be pinned to sidebar. Scope: user (personal) or org (shared).

---

## Schema

### `savedViews` table

| Field      | Type         | Notes                                |
|------------|--------------|--------------------------------------|
| orgId      | Id<"orgs">   | Required                             |
| name       | string       | Display name                         |
| entityType | string       | e.g. "contact", "deal", "task"       |
| scope      | string       | `"user"` (personal) or `"org"` (shared) |
| filters    | string       | JSON-serialized filter config        |
| sortBy     | string       | Field to sort by                     |
| sortOrder  | string       | `"asc"` or `"desc"`                  |
| columns    | string[]     | Visible columns list                 |
| isPinned   | boolean      | Whether pinned to sidebar            |
| createdBy  | Id<"users">  | Owner of the view                    |
| createdAt  | number       | Timestamp                            |

---

## Queries

| Function                    | Description                                  |
|-----------------------------|----------------------------------------------|
| `listByEntity(entityType)`  | All views for an entity type (user's + org's)|
| `listPinned()`              | Pinned views for sidebar rendering           |

---

## Mutations

| Function       | Description                          |
|----------------|--------------------------------------|
| `create()`     | Create a new saved view              |
| `update()`     | Update view filters/columns/name     |
| `delete()`     | Delete a saved view                  |
| `togglePin()`  | Pin/unpin a view from sidebar        |

---

## RBAC

| Permission            | Access Level |
|-----------------------|--------------|
| `views.createPersonal`| all members  |
| `views.createOrg`     | admin+       |

---

## Tier Limits

- Max saved views per user/org are dynamically configurable from `platformTiers`.
- Enforce limits at mutation level before insert.

---

## Rules

1. User-scoped views are only visible/editable by their creator.
2. Org-scoped views are visible to all org members, editable by admin+.
3. `filters` field stores valid JSON — validate on create/update.
4. `togglePin()` respects scope: users can only pin their own or org views.
5. Tier limits checked on `create()` — reject if quota exceeded.

---

## Avoids

- Do NOT allow users to edit org-scoped views without admin+ role.
- Do NOT store raw filter objects — always serialize to JSON string.
- Do NOT return views from other orgs in any query.

---

## Never-Do

- ❌ Never allow cross-org view access.
- ❌ Never skip tier-limit checks on creation.
- ❌ Never let non-admin users create org-scoped views.
- ❌ Never expose another user's personal views.
- ❌ Never allow invalid JSON in the `filters` field.

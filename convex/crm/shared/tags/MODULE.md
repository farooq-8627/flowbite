# convex/tags — MODULE.md

**Ownership:** `convex/tags/` | Phase 2  
**Purpose:** Org-wide tag system. Tags apply to ANY entity type. Uses `tags` table (definitions) + `entityTags` junction table.

---

## Schema

### `tags` table

| Field     | Type      | Notes                  |
|-----------|-----------|------------------------|
| orgId     | Id<"orgs"> | Required              |
| name      | string    | Unique per org         |
| color     | string    | Hex color code         |
| createdBy | Id<"users"> | Who created it       |
| createdAt | number    | Timestamp              |

### `entityTags` junction table

| Field      | Type         | Notes                          |
|------------|--------------|--------------------------------|
| orgId      | Id<"orgs">   | Required                       |
| tagId      | Id<"tags">   | FK to tags table               |
| entityType | string       | e.g. "contact", "deal", "task" |
| entityId   | string       | ID of the tagged entity        |
| createdAt  | number       | Timestamp                      |

---

## Queries

| Function                          | Description                              |
|-----------------------------------|------------------------------------------|
| `listByOrg()`                     | All tags for the current org             |
| `getForEntity(entityType, entityId)` | All tags attached to a specific entity |

---

## Mutations

| Function            | Description                        |
|---------------------|------------------------------------|
| `create()`          | Create a new tag definition        |
| `update()`          | Update tag name/color              |
| `delete()`          | Delete tag + cascade entityTags    |
| `addToEntity()`     | Attach tag to an entity            |
| `removeFromEntity()`| Detach tag from an entity          |

---

## RBAC

| Permission    | Access Level |
|---------------|--------------|
| `tags.manage` | admin+       |
| `tags.view`   | all members  |

---

## Rules

1. Tag names are unique per org (enforce via index + validation).
2. Deleting a tag MUST cascade-delete all related `entityTags` rows.
3. All mutations require authenticated user + org membership.
4. `entityType` must be a known entity string (validated at mutation level).
5. Color must be a valid hex string.

---

## Avoids

- Do NOT store tag names with leading/trailing whitespace — trim on create/update.
- Do NOT allow duplicate `entityTags` rows (same tagId + entityType + entityId).
- Do NOT expose internal IDs in error messages.

---

## Never-Do

- ❌ Never allow cross-org tag access.
- ❌ Never hard-delete without cascading junction rows.
- ❌ Never skip RBAC checks — even internal helpers must validate permissions.
- ❌ Never allow empty tag names or names exceeding 50 characters.

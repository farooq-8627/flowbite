# convex/orbitLinks — MODULE.md

**Ownership:** `convex/orbitLinks/` | Phase 2

## Purpose

Universal entity connection graph. Lateral connections not captured by personCode.

- **personCode** handles vertical (everything → person)
- **OrbitLinks** handle lateral (deal↔company, contact↔whatsapp, note↔deal, document↔contact)

## Schema

| Field | Type | Description |
|-------|------|-------------|
| orgId | Id<"orgs"> | Tenant isolation |
| fromCode | string | Source entity code (P-001, D-007, CO-003) |
| fromType | string | Source entity type |
| toCode | string | Target entity code |
| toType | string | Target entity type |
| linkType | string | "converted_to" \| "has_deal" \| "works_at" \| "whatsapp_thread" \| "has_document" |
| metadata | object? | Optional extra context |
| createdAt | number | Timestamp |
| createdBy | string? | Optional actor reference |

## Indexes

- `by_org_and_from` — (orgId, fromCode)
- `by_org_and_to` — (orgId, toCode)
- `by_org_and_type` — (orgId, linkType)

## Queries

- `getEntityGraph(code)` — returns outgoing + incoming links for a given entity code

## Mutations

- `create()` — create a new orbit link
- `delete()` — remove an orbit link

## Used By

- AI `getPersonGraph` tool
- Entity detail connected records panel
- WhatsApp thread linking

## Rules

- All operations scoped to orgId — no cross-tenant links
- Links are directional but `getEntityGraph` returns both directions
- linkType must be from the allowed enum set
- fromCode and toCode must reference existing entities

## Avoids

- No circular self-links (fromCode === toCode)
- No duplicate links (same from/to/linkType combo)
- No cascading deletes — link removal is explicit only
- No storing data that belongs in the entity itself

## Never Do

- ❌ Never create links across orgs
- ❌ Never use orbitLinks for vertical person relationships (use personCode)
- ❌ Never allow arbitrary linkType strings — validate against enum
- ❌ Never auto-delete links when entities are archived
- ❌ Never store sensitive data in metadata — it's for structural context only

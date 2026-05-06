# convex/entity5 (+ entity6) — MODULE.md

Ownership: convex/entity5/, convex/entity6/ | Phase 2 | Consumers: core/entities/entity5/, core/entities/entity6/

## Purpose

Optional entity slots. Hidden by default. Activated + renamed per industry. Same schema as companies (name, orgId, assignedTo, fieldValues linkage). Uses the SAME scaffolds as other entities. Only difference is entityType value.

## Examples

- entity5 = "Property" for Real Estate, "Product" for E-commerce.
- entity6 = "Listing" for Real Estate, "Supplier" for E-commerce.

## Schema

Same as companies but with entityType-specific code (entity5Code/entity6Code).

Fields: orgId, code (string), name, assignedTo, aiContext, createdAt, updatedAt.

Indexes: `by_org`, `by_org_and_code`.

## Activation

```
orgSettings.entityVisibility.entity5 = true
orgSettings.entityLabels.entity5 = { singular: "Property", plural: "Properties" }
```

## Queries/Mutations

Identical pattern to companies. `create()` generates entity code, `update()`, `delete()`.

## RBAC

Uses generic permissions:
- `entity5.view`
- `entity5.create`
- `entity5.edit`
- `entity5.delete`

(Same pattern for entity6 with `entity6.*` permissions.)

## Rules

- entity5 and entity6 follow the EXACT same scaffold as companies.
- The only difference is the `entityType` value used for code generation and permissions.
- Never hardcode display labels — always read from `orgSettings.entityLabels`.
- Never show entity5/entity6 in UI unless `orgSettings.entityVisibility` is true for that slot.
- Code generation uses `generateEntityCode(ctx, orgId, "entity5")` / `"entity6"`.

## Never Do

- Never create a separate schema pattern — reuse the companies pattern exactly.
- Never assume entity5/entity6 are always active — always check visibility.
- Never rename the internal `entityType` value — "entity5"/"entity6" are permanent internal identifiers regardless of display label.

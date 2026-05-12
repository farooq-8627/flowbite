# Catalog — Products / Services / Line-items (Gap 1)

> **Status**: PLACEHOLDER — schema + UI not yet built. Documented here so every agent knows the module exists in the plan and why entity scaffolds reserve hooks for it.
> **Unlocks**: agency, freelance, construction, manufacturing, field service.
> **Source**: `core/entities/INDUSTRY_ADAPTABILITY_ANALYSIS.md` Gap 1.
> **Depends on**: Phase 2 Entity Scaffolds (this build) + `fieldDefinitions` backend (done).

## Purpose

Every service business needs a reusable catalog of things they sell with prices + descriptions. Deals attach line-items that reference catalog items. This module is also the prerequisite for invoicing (see `features/documents/MODULE.md`).

## Planned schema (add to `convex/schema.ts` when module starts)

```ts
catalogItems: defineTable({
  ...orgScoped,
  code: v.string(),              // "SKU-001" — auto-generated like personCode
  name: v.string(),
  description: v.optional(v.string()),
  unit: v.string(),              // "hour" | "month" | "unit" | "project" | "license"
  unitPrice: v.number(),
  currencyCode: v.string(),      // typically same as org default
  category: v.optional(v.string()),
  isActive: v.boolean(),
  ...timestamps,
  ...softDelete,
}).index("by_org", ["orgId"])
  .index("by_org_and_code", ["orgId", "code"])
  .index("by_org_and_category", ["orgId", "category"]),

dealLineItems: defineTable({
  ...orgScoped,
  dealId: v.id("deals"),
  itemId: v.id("catalogItems"),
  quantity: v.number(),
  unitPriceOverride: v.optional(v.number()),   // per-deal discount
  discountPct: v.optional(v.number()),
  notes: v.optional(v.string()),
  ...timestamps,
}).index("by_deal", ["dealId"])
  .index("by_org_and_item", ["orgId", "itemId"]),
```

## Planned UI

- `core/catalog/views/CatalogView.tsx` — list + board entity view (reuses `EntityListPage` scaffold)
- `core/catalog/components/AddCatalogItemDrawer.tsx` — reuses `FormDrawer`
- Deal detail → new "Line Items" tab consuming `dealLineItems` per deal
- Invoice/quote builder (inside `features/documents/`) pulls from catalog

## Integration hooks (reserved in this build)

- `EntityCard` supports a `lineItemCount` field kind (rendered as stub "0" until catalog ships)
- `FIELD_CATALOG.deal` has a placeholder for `totalValue` that will compute from line-items when they exist
- `orgs.settings.modules[].meta` free-form field accommodates future `catalog`-specific config

## Target phase

**Phase 2.5** — post Entity Scaffolds, before targeting freelance/agency customers.

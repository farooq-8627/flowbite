# Documents — Contracts / Proposals / Invoices / Quotes (Gap 2)

> **Status**: PLACEHOLDER — schema + UI not yet built.
> **Unlocks**: agency, legal, photography, events, serious freelance, construction estimates.
> **Source**: `core/entities/INDUSTRY_ADAPTABILITY_ANALYSIS.md` Gap 2.
> **Depends on**: `features/catalog/` (Gap 1) for line-items on invoices/quotes.

## Purpose

This is the stickiest feature in service-business CRMs (HoneyBook, Dubsado, PandaDoc). Once contracts and invoices live here, churn drops sharply. Without it we can't credibly serve agencies, legal firms, photographers, or any business whose deliverable is a signed document.

## Planned schema (add to `convex/schema.ts` when module starts)

```ts
documents: defineTable({
  ...orgScoped,
  docCode: v.string(),                            // "DOC-0001"
  type: v.union(
    v.literal("proposal"),
    v.literal("contract"),
    v.literal("invoice"),
    v.literal("quote"),
    v.literal("form"),
  ),
  status: v.union(
    v.literal("draft"),
    v.literal("sent"),
    v.literal("viewed"),
    v.literal("accepted"),
    v.literal("signed"),
    v.literal("paid"),
    v.literal("voided"),
  ),
  templateId: v.optional(v.id("documentTemplates")),

  // Connections — same pattern as every other entity in the app
  personCode: v.optional(v.string()),
  dealCode: v.optional(v.string()),
  projectCode: v.optional(v.string()),

  // Content (block-based for rich editing + PDF rendering)
  title: v.string(),
  description: v.optional(v.string()),
  body: v.any(),                                  // structured JSON blocks
  variables: v.optional(v.any()),                 // merge-field values

  // Financial (when type = invoice/quote/proposal)
  subtotal: v.optional(v.number()),
  taxRate: v.optional(v.number()),
  taxAmount: v.optional(v.number()),
  total: v.optional(v.number()),
  currencyCode: v.optional(v.string()),
  lineItems: v.optional(v.array(v.object({
    itemId: v.optional(v.id("catalogItems")),
    quantity: v.number(),
    unitPrice: v.number(),
    description: v.string(),
  }))),

  // E-signature
  signatureStatus: v.optional(v.string()),
  signatories: v.optional(v.array(v.object({
    email: v.string(),
    signedAt: v.optional(v.number()),
    ip: v.optional(v.string()),
  }))),

  // External delivery tracking
  sentAt: v.optional(v.number()),
  viewedAt: v.optional(v.number()),
  acceptedAt: v.optional(v.number()),
  paidAt: v.optional(v.number()),
  publicToken: v.optional(v.string()),            // for client-portal access

  ...timestamps,
  ...softDelete,
}).index("by_org", ["orgId"])
  .index("by_org_and_code", ["orgId", "docCode"])
  .index("by_org_and_person", ["orgId", "personCode"])
  .index("by_org_and_deal", ["orgId", "dealCode"])
  .index("by_org_and_type_and_status", ["orgId", "type", "status"])
  .index("by_publicToken", ["publicToken"]),

documentTemplates: defineTable({
  ...orgScoped,
  name: v.string(),
  type: v.string(),                               // matches `documents.type`
  body: v.any(),                                  // block JSON with merge fields
  variables: v.optional(v.array(v.string())),    // variable names for UI pickers
  isBuiltIn: v.boolean(),
  ...timestamps,
  ...softDelete,
}).index("by_org", ["orgId"])
  .index("by_org_and_type", ["orgId", "type"]),
```

## Integration hooks (reserved in this build)

- `EntityHoverCard` supports a `documentCount` field kind (rendered as stub until module ships)
- Profile page reserves a "Documents" tab (hidden until module ships)
- AI tool registry will add `documents.createFromTemplate` — uses same `FormDrawer` pattern

## Target phase

**Phase 2.5** — after `features/catalog/`. Both unlock the freelance/agency vertical together.

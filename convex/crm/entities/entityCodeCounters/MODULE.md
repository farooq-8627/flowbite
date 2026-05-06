# convex/entityCodeCounters — MODULE.md

Ownership: convex/ (shared table, helper in convex/_shared/recordCodes.ts) | Phase 2

## Purpose

Atomic counter table for generating sequential record codes. Per-org, per-entity-type. Ensures no collision even under concurrent writes.

## Schema

```typescript
entityCodeCounters: defineTable({
  orgId: v.id("orgs"),
  entityType: v.string(), // "person" | "deal" | "company" | "followup" | "project" | "task"
  count: v.number(),
  createdAt: v.number(),
}).index("by_org_and_type", ["orgId", "entityType"])
```

Also: `platformOrgIdCounter` (single global row for ORB-001 platform org IDs).

## Helper Functions (convex/_shared/recordCodes.ts)

- `generatePersonCode(ctx, orgId)` → "P-001" (reads prefix from orgSettings.codePrefixes)
- `generateEntityCode(ctx, orgId, entityType)` → "D-001", "CO-001", "FU-001", etc.
- `generatePlatformOrgId(ctx)` → "ORB-001"
- `incrementCounter(ctx, orgId, entityType)` → next number (atomic)

## Critical Rules

- `generatePersonCode` called ONLY in `leads.create`. On conversion, personCode is PASSED not regenerated.
- Prefix customization: `orgSettings.codePrefixes` stores custom prefixes. Background job patches all records when prefix changes.

## Rules

- Always use `incrementCounter` — never manually read+write the count.
- Counter is per-org, per-entityType — never share counters across orgs.
- Codes are zero-padded to 3 digits minimum (001, 002, ... 999, 1000).
- Prefix is read from `orgSettings.codePrefixes[entityType]` at generation time.

## Never Do

- Never regenerate a personCode on lead→person conversion — always pass the existing code.
- Never reset counters — they are monotonically increasing per org.
- Never bypass `incrementCounter` with a direct `ctx.db.patch` on the counter row outside the helper.
- Never assume a fixed prefix — always read from orgSettings.

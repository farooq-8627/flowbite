# convex/deals — MODULE.md

> **Ownership:** `convex/deals/` | **Phase:** 2 | **Consumers:** `core/entities/deals/`, AI tools, kanban board, project auto-creation

---

## Purpose

Deal entity backend. Deals use **PIPELINE STAGES** (not simple status). Each deal has a `dealCode` (D-001) and `personCode` (P-001) linking to the person. Kanban is the primary view. Won deals can trigger project auto-creation (Phase 8).

---

## Schema

```typescript
deals: defineTable({
  orgId: v.id("orgs"),
  dealCode: v.string(),              // "D-001" - own counter
  personCode: v.optional(v.string()), // "P-001" - links to person
  companyCode: v.optional(v.string()), // "CO-001"
  title: v.string(),
  value: v.optional(v.number()),      // monetary value
  currency: v.optional(v.string()),   // "AED" | "USD"
  pipelineId: v.id("pipelines"),
  currentStageId: v.string(),         // stage.id from pipeline.stages[]
  stageEnteredAt: v.number(),         // timestamp - for staleness calculation
  contactId: v.optional(v.id("contacts")),
  companyId: v.optional(v.id("companies")),
  assignedTo: v.optional(v.id("users")),
  source: v.string(),
  wonAt: v.optional(v.number()),
  lostAt: v.optional(v.number()),
  outcomeReason: v.optional(v.string()),
  expectedCloseDate: v.optional(v.number()),
  aiContext: v.optional(v.any()),
  createdAt: v.number(),
  updatedAt: v.number(),
})
.index("by_org", ["orgId"])
.index("by_org_and_pipeline", ["orgId", "pipelineId"])
.index("by_org_and_stage", ["orgId", "currentStageId"])
.index("by_org_and_personCode", ["orgId", "personCode"])
.index("by_org_and_dealCode", ["orgId", "dealCode"])
.index("by_org_and_assignee", ["orgId", "assignedTo"])
.searchIndex("search_title", { searchField: "title", filterFields: ["orgId"] }),
```

---

## Queries

| Function | Description |
|----------|-------------|
| `list()` | Returns all deals for the org, paginated/filtered |
| `listGroupedByStage()` | Returns `Record<stageId, Deal[]>` with `isStale` and `daysInStage` annotated on each deal |
| `getById()` | Single deal by `_id` |
| `getByDealCode()` | Single deal by `dealCode` within org |
| `getAllActive()` | All deals that are not won/lost |

---

## Mutations

| Function | Description |
|----------|-------------|
| `create()` | Creates a deal, auto-generates next `dealCode` (D-001, D-002…) |
| `update()` | Partial update of deal fields |
| `moveToStage()` | Updates `currentStageId` + resets `stageEnteredAt` + logs activity |
| `closeAsDone()` | Sets `wonAt` or `lostAt`, records `outcomeReason`, triggers project auto-creation on win |
| `bulkUpdate()` | Batch update multiple deals (e.g., reassign) |
| `updateAiContext()` | Patches the `aiContext` field for AI tool consumption |

---

## Staleness Calculation

Computed inside `listGroupedByStage()`:

```typescript
daysInStage = (Date.now() - deal.stageEnteredAt) / 86_400_000;
isStale = daysInStage > stage.staleAfterDays;
```

- `stageEnteredAt` resets every time `moveToStage()` is called.
- `staleAfterDays` comes from the pipeline stage definition.
- Staleness is **read-time only** — never stored on the deal document.

---

## Won Deal Flow

1. `closeAsDone({ dealId, finalType: "won", outcomeReason })` is called.
2. Sets `wonAt = Date.now()`, clears any previous `lostAt`.
3. Logs activity entry.
4. Schedules project auto-creation (Phase 8) via internal action.

Lost deals follow the same pattern but set `lostAt` and do **not** trigger project creation.

---

## Confetti (Client-Side Only)

- Uses `canvas-confetti` package.
- Triggered on the client after `moveToStage` resolves when the target stage is the final positive stage.
- **No backend involvement** — purely a UI celebration.

---

## RBAC Permissions

| Permission | Description |
|------------|-------------|
| `deals.view` | Can see deal cards (title, stage, assignee) |
| `deals.viewValues` | Can see monetary value/currency fields |
| `deals.create` | Can create new deals |
| `deals.update` | `editOwn` — own deals only; `editAny` — all deals |
| `deals.moveStage` | Can drag/move deals between pipeline stages |
| `deals.delete` | Can permanently delete a deal |
| `deals.close` | Can mark a deal as won or lost |

---

## Rules

1. Every deal **must** belong to a pipeline and have a valid `currentStageId`.
2. `dealCode` is auto-generated — never accept from client input.
3. `stageEnteredAt` is always set server-side on create and stage move.
4. `moveToStage()` must validate that the target stage exists in the deal's pipeline.
5. `closeAsDone()` is the **only** way to set `wonAt`/`lostAt` — never via generic `update()`.
6. All queries filter by `orgId` — no cross-org data leakage.
7. `value` field is only returned if caller has `deals.viewValues` permission.

---

## Avoids

- ❌ Do NOT store `isStale` or `daysInStage` on the document — compute at read time.
- ❌ Do NOT allow direct `currentStageId` writes via `update()` — use `moveToStage()`.
- ❌ Do NOT trigger confetti from the backend — it's client-only.
- ❌ Do NOT allow `wonAt`/`lostAt` to be set via `update()` — use `closeAsDone()`.

---

## Never-Do List

- 🚫 Never expose deals across orgs (always filter by `orgId`).
- 🚫 Never skip RBAC checks on value-sensitive fields.
- 🚫 Never allow stage moves to stages outside the deal's assigned pipeline.
- 🚫 Never delete a deal without `deals.delete` permission — prefer archiving.
- 🚫 Never auto-create projects for lost deals.
- 🚫 Never let `dealCode` be manually edited after creation.

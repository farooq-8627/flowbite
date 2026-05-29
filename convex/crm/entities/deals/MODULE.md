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

## AI-twin contract (locked 2026-05-30)

`createForAI` makes `pipelineId` and `source` **optional** — public `create` keeps both required.

| Decision | Outcome |
|---|---|
| Why pipelineId is optional on `createForAI` | The AI tool only needs `title` to create a deal. The twin resolves the org's default deal pipeline (`isDefault === true`, falling back to first deal pipeline) before calling `createImpl`. AddDealDrawer always passes pipelineId so the public mutation stays strict. This fixes the 2026-05-30 "Create 5 sample deals" regression where every row failed with `ArgumentValidationError: Object is missing the required field 'pipelineId'`. |
| Why source defaults to `"ai"` | Same story — AI tools shouldn't have to fabricate a source. Public `create` keeps `source: v.string()` required because every UI flow knows its source ("manual", "lead-conversion", "import", etc.). |
| Stage-aware required fields at create | NOT enforced on create — the deal lands in the pipeline's Default stage which carries minimal required fields by design. Stage-specific required-field gates run at `moveToStage` via `getRequiredFieldsForStage` (transition policy: `block` / `warn` / `off`). |

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

---

## Frontend Architecture Decisions (Locked)

| # | Decision | Value |
|---|---|---|
| 1 | Primary view | Kanban (grouped by pipeline stage) — list is secondary toggle (`?view=list`) |
| 2 | Deal value | Hidden from members by default — `deals.viewValues` permission required |
| 3 | Stale border | Color from `stage.staleColor` — configurable in Settings → Pipelines |
| 4 | Warning border | Color from `stage.warningColor` — configurable in Settings → Pipelines |
| 5 | Won deal | Confetti animation (canvas-confetti) — client-side only, after closeAsDone resolves |
| 6 | Stage move | `moveToStage()` called on drag-drop — NEVER generic update() |
| 7 | Close deal | `closeAsDone()` called from CloseAsDoneDialog — NEVER generic update() |
| 8 | Entity label | NEVER hardcode "Deal" — always from `orgSettings.entityLabels.deal` |
| 9 | Route slug | NEVER hardcode "/deals" — always from `orgSettings.entityLabels.deal.slug` |
| 10 | personCode on cards | Always shown — links to PersonDetailPage |
| 11 | `+` shortcut on deal cards | ONLY rendered when the deal has at least one EMPTY field pinned to its current stage (any pinned field — required OR optional). When everything pinned to the current stage is filled, there is NO `+` — drag the deal to the next stage and a fresh closed set of pinned-to-that-stage fields takes over. The yellow border on the card uses the same gate. Decided 2026-05-20 round 4 (Option A) in response to "in stage 1 i have ejari and i need a + button to come until the ejari is not saved its value once saved i don't need that at all. and in stage 2 i have records when i go to that stage i need only records when + button is clicked". |
| 12 | `+` shortcut form scope (`fillStage` mode) | Opens `EditDealDrawer` in `mode="fillStage"`. The drawer subscribes to `getStageFieldsToFill(orgId, dealId)` which returns ONLY the empty fields pinned to the deal's current stage. The form renders that exact set via `EntityFieldForm.includeOnly`. No defaults, no fields from earlier stages, no fields from later stages. Once the user saves, the empty set goes to zero, the `+` hides on the card, and the next stage's pinned fields wait their turn. |
| 13 | Overflow menu "Edit" entry (`edit` mode) | Opens `EditDealDrawer` in `mode="edit"`. The drawer subscribes to `getEditableFieldsUpToStage(orgId, dealId)` which returns the union of field names pinned to any stage at order ≤ currentStageId. So a stage-3 deal's Edit form shows defaults + stage-1 + stage-2 + stage-3 pinned fields (every field the deal has had a chance to interact with so far). Stage-N+ fields stay hidden until the deal advances. Decided 2026-05-20 round 4 in response to "and also the edit deal should work like if i'm in stage one it should show all defaults + ejari (stage 1 fields should not fill the stage 2 fields)". |
| 14 | EntityFieldForm column-bootstrapping | `columnValues` re-syncs from `entity` via `useEffect([entity, formFields])` once `useEntityFields` resolves. The original `useState(() => ...)` lazy initializer ran with `formFields = []` because the underlying Convex query was still loading, so column values like `title` started as undefined. The reactive sync re-fills them once the schema lands, with `touchedRef` protection so user-typed values are never clobbered. Without this fix the edit-mode form silently submitted blank `title` strings even when `entity.title` had a value. Decided 2026-05-20 round 3, retained in round 4. |
| 15 | `+` and Edit gates DON'T use `required` | The `+` button + yellow border + `fillStage` form scope all gate on "any empty pinned field" — they ignore `f.required`. The `required` flag continues to drive `moveToStage`'s block/warn policy (`stageTransitionPolicy`) — that's the admin's "must be filled to advance" enforcement. The two semantics are deliberately separate: the `+` is the user nudging themselves to fill what's relevant on this stage; the transition policy is the admin gating critical stage progression. Decided 2026-05-20 round 4. |

## See Also

- `FRONTEND-DECISIONS.md` — all locked frontend decisions
- `PHASE2-PROGRESS.md` — build plan and slice order
- `core/entities/deals/` — DealKanban, DealCard, DealDetail

# Deals Module — Refactor, Cleanup & Production-Grade Plan
> Written: 2026-05-20 | Status: Analysis complete, ready for execution

---

## 1. What you asked for (in plain terms)

1. Understand the full deal/pipeline flow and where every piece lives.
2. Identify what's bloated, duplicated, or wrongly structured.
3. Delete / reorganise — **not patch**.
4. Production-grade: no duplicate hooks, no 1200-LOC files, files stored correctly, stage-aware fields work on drag/fill/edit without permission or submission errors.
5. A prompt you can paste in the next session to execute in one shot.

---

## 2. Current state — what exists and its LOC

| File | LOC | Problem |
|---|---|---|
| `core/entities/_entities/deals/views/DealDetailView.tsx` | **1219** | Contains TWO components (DealsView + AddDealDrawer), inline column defs, inline board logic, inline nav slot, inline card-move handler |
| `core/entities/_entities/deals/components/EditDealDrawer.tsx` | 303 | OK size, but `handleSubmit` duplicates AddDealDrawer's column+custom submit logic |
| `core/entities/shared/components/EntityCard.tsx` | 1084 | Too large — needs separate audit (out of this scope) |
| `core/entities/shared/hooks/useEntityMutations.ts` | 450 | OK |
| `core/entities/_entities/deals/hooks/usePipelines.ts` | 159 | OK |
| `convex/crm/entities/deals/mutations.ts` | 795 | OK — backend is good |
| `convex/crm/entities/deals/queries.ts` | 458 | OK — backend is good |

---

## 3. Architecture — the full flow (reference for next session)

### 3.1 Data model

```
pipelines          ← one per org per entityType, has stages[]
  stages[]         ← id (immutable), name, code, order, isFinal, finalType, isDefaultStage
  stageTransitionPolicy  ← "block" | "warn" | "off" (per-pipeline)

fieldDefinitions   ← entityType="deal", showInStages=[] means "all stages"
  showInStages[]   ← stage ids this field is pinned to

deals              ← the row
  currentStageId   ← stage.id (immutable foreign key)
  pipelineId       ← pipeline._id
  title, value, dealCode, assignedTo, expectedCloseDate  ← column-storage fields

fieldValues        ← all custom fields live here (storage="fieldValues")
  entityType="deal", entityId=deal._id, fieldId, value

files              ← scope="deal", scopeId=dealCode, tags=["person:<personCode>"]
```

### 3.2 The complete user flow

```
SETTINGS → Pipelines
  ├─ Create/rename pipeline, set stageTransitionPolicy
  ├─ Add/reorder stages (id is immutable, code is owner-typed)
  └─ Stage Fields tab strip
       ├─ "All stages" tab → fields with showInStages=[]
       └─ Per-stage tab → fields pinned to that stage
            • Add field → EntityFieldForm-compatible, auto-pins to active stage
            • Edit field → "Visible on stages" multi-select (StageScopedEditFieldDialog)

DEALS PAGE (DealsView)
  ├─ Pipeline tabs in TopNav slot (if >1 pipeline)
  ├─ Board view (kanban) — columns = pipeline stages
  │    ├─ Each card has a yellow border if missingFieldsByDealId[card.id] > 0
  │    ├─ "+" shortcut on card → opens EditDealDrawer in "fillStage" mode
  │    │    └─ Renders ONLY empty fields pinned to currentStage
  │    ├─ Drag to next stage → moveToStage mutation
  │    │    ├─ policy="block" + missing fields → ConvexError MISSING_REQUIRED_FIELDS
  │    │    │    └─ Currently: rich toast. PENDING: FillMissingFieldsDialog
  │    │    ├─ policy="warn" + missing fields → succeeds, logs warning metadata
  │    │    └─ policy="off" → always succeeds, no check
  │    └─ Overflow menu → Edit → EditDealDrawer in "edit" mode
  │         └─ Shows: defaults + all stage fields at order ≤ currentStage
  └─ List view — TanStack table, same pipeline scope

ADD DEAL (AddDealDrawer)
  ├─ PersonSelect (required — every deal must belong to someone)
  ├─ EntityFieldForm filtered to defaultStageId fields
  │    └─ No file field hardcoded — add "files" field in Settings → Pipelines → Default stage
  └─ On submit:
       1. deals.create (with pipelineId, title, value, personCode, etc.)
       2. fieldValues.bulkSet (custom fields)
       3. fileBuffer.commitAll (scope="deal", scopeId=dealCode, tags=["person:<personCode>"])

EDIT DEAL (EditDealDrawer, mode="edit")
  ├─ useQuery getEditableFieldsUpToStage → set of field NAMES up to currentStage
  ├─ useQuery getForEntity → existing custom field values
  └─ On submit:
       1. deals.update (column fields)
       2. fieldValues.bulkSet (custom fields)
       NOTE: No file upload in edit mode — files should be added via person profile

FILL STAGE (EditDealDrawer, mode="fillStage")
  ├─ useQuery getStageFieldsToFill → missing fields at currentStage
  └─ Same submit path as edit mode
       NOTE: When all fields filled, "+" disappears on card (missingCount drops to 0)
```

---

## 4. Problems — root causes, not symptoms

### P1: DealDetailView.tsx is 1219 LOC — should be ~200

**Root cause**: `AddDealDrawer` was defined INSIDE the view file instead of its own component file. The list column definitions (100+ LOC `useMemo`), board column/item logic (100+ LOC), card-move handler (100+ LOC), and pipeline nav-slot logic (60 LOC) are all inline.

**Fix**: Extract each into its own file. The view becomes a thin orchestrator.

### P2: Duplicated submit logic across AddDealDrawer and EditDealDrawer

**Root cause**: Both components manually do:
```ts
// 1. await update({ title, value, currency, assignedTo, expectedCloseDate })
// 2. await bulkSetCustom({ orgId, entityType, entityId, values: payload })
```
This is copy-paste. If we ever add a new column field (e.g. `priority`) we update it in two places.

**Fix**: Extract `useDealFormSubmit(orgId)` hook that returns a single `save({ deal, formValues, fileBuffer? })` function.

### P3: Files in EditDealDrawer not wired

**Root cause**: `EditDealDrawer` has no `FileBufferProvider` or file commit step. If a user has a file field pinned to stage 2, and they try to upload via Edit, the upload fires but never commits.

**Fix**: Wrap EditDealDrawer in `FileBufferProvider`, commit files on save under `scope="deal" / scopeId=deal.dealCode`.

### P4: FillMissingFieldsDialog is missing (pending §6.1)

**Root cause**: When `policy="block"` fires `MISSING_REQUIRED_FIELDS` on drag, we only show a toast. The user asked for an inline dialog that lets them fill the fields right there and auto-retries the move.

**Fix**: `FillMissingFieldsDialog.tsx` — opens on `MISSING_REQUIRED_FIELDS` error, queries `getMissingFieldsForStage`, lets user fill, then calls `moveToStage` again.

### P5: The `+` button text says "Fill N stage fields" — ambiguous

**Root cause**: Current label doesn't tell the user which stage. Especially confusing in "warn" mode where the deal is already in stage 3 but stage 2 fields were never filled.

**Fix**: Label = `Fill "${stageName}" fields (N)`. Show in tooltip / on hover too.

### P6: No validation error feedback on required fields in forms

**Root cause**: `EntityFieldForm` does not mark required fields red on submit attempt. If a user clicks "Create" without filling a required field, nothing visual highlights the problem — only a server error (if the mutation validates it).

**Fix**: `EntityFieldForm` should accept a `submittedOnce` flag and show error state on required fields if empty when `submittedOnce=true`.

---

## 5. Target file structure after refactor

```
core/entities/_entities/deals/
  views/
    DealsView.tsx               ← ~200 LOC (was 1219) — thin orchestrator only
  components/
    AddDealDrawer.tsx           ← ~250 LOC (extracted from DealDetailView)
    EditDealDrawer.tsx          ← ~200 LOC (cleaned up, + file support)
    FillMissingFieldsDialog.tsx ← ~150 LOC (NEW — for block-policy drag)
    ChangePipelineDialog.tsx    ← unchanged (195 LOC)
    MarkAsLostDialog.tsx        ← unchanged (170 LOC)
    MarkAsDoneDialog.tsx        ← unchanged (173 LOC)
    DealPipelineTabs.tsx        ← ~60 LOC (extracted nav-slot tabs)
  hooks/
    usePipelines.ts             ← unchanged (159 LOC)
    useDealsBoard.ts            ← ~150 LOC (NEW — boardColumns + itemsByColumnId + handleCardMove)
    useDealsListColumns.tsx     ← ~100 LOC (NEW — TanStack ColumnDef array)
    useDealFormSubmit.ts        ← ~80 LOC  (NEW — shared submit logic)
```

---

## 6. What to keep unchanged (don't touch)

- `convex/crm/entities/deals/mutations.ts` — backend is solid
- `convex/crm/entities/deals/queries.ts` — all queries correct
- `core/entities/shared/hooks/useEntityMutations.ts` — clean
- `core/entities/shared/components/EntityFieldForm.tsx` — working correctly
- `core/entities/shared/components/FormDrawer.tsx` — works
- `core/entities/_entities/deals/hooks/usePipelines.ts` — correct
- All Convex field pipeline mutations/queries

---

## 7. Implementation plan — ordered tasks

### Task 1 — Extract `AddDealDrawer` to its own file
**File**: `core/entities/_entities/deals/components/AddDealDrawer.tsx`
- Move the entire `AddDealDrawer` function out of `DealDetailView.tsx`
- Keep the `EXCLUDED_FIELDS_FROM_CREATE_FORM` constant with it
- `DealDetailView.tsx` imports it

### Task 2 — Extract `useDealFormSubmit` hook
**File**: `core/entities/_entities/deals/hooks/useDealFormSubmit.ts`
```ts
// Returns: save(args) that runs update + bulkSet + fileBuffer.commitAll
export function useDealFormSubmit(orgId: Id<"orgs"> | undefined) {
  const update = useUpdateDeal();
  const bulkSetCustom = useMutation(api.crm.fields.fieldValues.mutations.bulkSet);
  return useCallback(async ({ deal, formValues, fileBuffer, personCode }) => { ... }, []);
}
```
- `AddDealDrawer` and `EditDealDrawer` both use this hook
- Removes the 60+ line duplicate submit block from each

### Task 3 — Add file support to `EditDealDrawer`
- Wrap in `FileBufferProvider`
- In `handleSubmit` (via `useDealFormSubmit`), call `fileBuffer.commitAll` if `deal.dealCode` exists
- Files are tagged `person:<personCode>` — need to pass `personCode` to the drawer

### Task 4 — Extract `useDealsBoard` hook
**File**: `core/entities/_entities/deals/hooks/useDealsBoard.ts`
- Move `boardColumns` useMemo out of `DealsView`
- Move `itemsByColumnId` useMemo out of `DealsView`
- Move `handleCardMove` useCallback out of `DealsView`
- Returns `{ boardColumns, itemsByColumnId, handleCardMove }`

### Task 5 — Extract `useDealsListColumns` hook
**File**: `core/entities/_entities/deals/hooks/useDealsListColumns.tsx`
- Move the entire `columns` ColumnDef array computation out of `DealsView`
- Returns `columns`

### Task 6 — Extract `DealPipelineTabs` component
**File**: `core/entities/_entities/deals/components/DealPipelineTabs.tsx`
- The JSX that renders pipeline tabs in the nav slot
- `DealsView` calls `useEffect(() => setSlot(<DealPipelineTabs ... />), [...])`

### Task 7 — Build `FillMissingFieldsDialog`
**File**: `core/entities/_entities/deals/components/FillMissingFieldsDialog.tsx`
```
Props: { open, onOpenChange, orgId, dealId, targetStageId, targetStageName, missingFields[], onFilled }
Flow:
  1. Renders EntityFieldForm with includeOnly = set of missingField names
  2. On save: bulkSetCustom + update column fields
  3. Calls onFilled() → parent retries moveToStage
```
- Wire into `handleCardMove` in `useDealsBoard`: catch `MISSING_REQUIRED_FIELDS` → set `fillDialog: { open:true, dealId, targetStageId, missingFields }`
- After `onFilled`, retry `moveToStage` automatically

### Task 8 — Clean up `DealsView`
After extracting tasks 1–7, `DealsView` should be:
```tsx
export function DealsView({ orgSlug }: { orgSlug: string }) {
  // ← hooks only: useCurrentOrg, useActiveDealPipeline, useDealsBoard, useDealsListColumns
  // ← state: view, search, stageFilter, addOpen, editingDeal
  // ← return: <EntityListPage ... /> + <AddDealDrawer ... /> + <EditDealDrawer ... /> + <FillMissingFieldsDialog ... />
}
```
Target: **~200 LOC**.

---

## 8. Specific bugs to fix during refactor

| Bug | Where | Fix |
|---|---|---|
| Required fields not highlighted on submit | `EntityFieldForm` | Add `submittedOnce` prop, show `border-destructive` on empty required field after first submit attempt |
| Files in EditDealDrawer silently not committed | `EditDealDrawer` | Add `FileBufferProvider` + `fileBuffer.commitAll` in submit |
| `+` button label doesn't say stage name | `DealsView` renderCard | Change to `Fill "${stageNameById.get(stageName)}" fields` or use `stageFieldsResult.stageName` |
| FillMissingFieldsDialog missing (block policy UX) | new component | Task 7 above |
| Deal moves don't pass `personCode` to `EditDealDrawer` | `DealsView` | Pass `deal.personCode` to `EditDealDrawer` |

---

## 9. Things NOT to change (locked decisions from CODE-ARCHITECTURE-PIPELINES-2026-05-20.md)

- Pipelines are deals-only. No `showInStages` on leads/contacts.
- Stage id is immutable. Never change a stage id.
- `stageTransitionPolicy` is per-pipeline only (not per-stage).
- Never use `useQuery` for pipelines directly — use `useDealPipelines(orgId)`.
- Never hardcode WON/LOST stage codes.
- Deal has no standalone detail page. It lives on the person profile under Deals tab.
- `fieldValues.bulkSet` is the only way to persist custom fields.
- File uploads: `scope="deal"`, `scopeId=dealCode`, tagged `person:<personCode>`.

---

## 10. Session prompt — paste this at the start of the next session

```
You are refactoring the deals module of this CRM codebase. Read this file first:
DEALS-REFACTOR-PLAN-2026-05-20.md

Then do these tasks IN ORDER. Do not skip any. Verify types after each task.

Before writing any code:
1. Read convex/_generated/ai/guidelines.md
2. Read AGENTS.md (RTL-safe tailwind, no hardcoded strings, dynamic radius, canonical mutation pattern)
3. Read CODE-ARCHITECTURE-PIPELINES-2026-05-20.md (full pipeline architecture)
4. Read core/entities/_entities/deals/views/DealDetailView.tsx (1219 LOC — the file you're refactoring)
5. Read core/entities/_entities/deals/components/EditDealDrawer.tsx (303 LOC)
6. Read core/entities/shared/hooks/useEntityMutations.ts (useMoveDealToStage, useUpdateDeal)
7. Read core/entities/shared/components/EntityFieldForm.tsx

TASK 1: Extract AddDealDrawer
  - Move the AddDealDrawer function + EXCLUDED_FIELDS_FROM_CREATE_FORM constant from
    DealDetailView.tsx into a new file: core/entities/_entities/deals/components/AddDealDrawer.tsx
  - Update DealDetailView.tsx to import from the new file
  - No logic changes — just move

TASK 2: Create useDealFormSubmit hook
  - File: core/entities/_entities/deals/hooks/useDealFormSubmit.ts
  - Encapsulates: update (column fields) + bulkSetCustom (custom fields) + fileBuffer.commitAll (files)
  - Signature: useDealFormSubmit(orgId) → save({ dealId?, formValues, fileBuffer?, personCode?, isCreate?, onCreate? })
  - AddDealDrawer and EditDealDrawer both call this hook instead of duplicating the logic

TASK 3: Add file support to EditDealDrawer
  - Import FileBufferProvider and useFileBuffer from core/data-io/files/components/CreateModeFileField
  - Wrap the drawer content in <FileBufferProvider value={fileBuffer}>
  - In handleSubmit (via useDealFormSubmit), call fileBuffer.commitAll({ scope: "deal", scopeId: deal.dealCode, tags: [`person:${deal.personCode}`] })
  - Pass deal.personCode through to useDealFormSubmit

TASK 4: Extract useDealsBoard hook
  - File: core/entities/_entities/deals/hooks/useDealsBoard.ts
  - Moves these computations OUT of DealsView:
    • boardColumns (useMemo over pipeline stages / assignees)
    • itemsByColumnId (useMemo, sorted + search-ranked)
    • handleCardMove (useCallback — drag logic, moveToStage + updateDeal + tag ops)
  - handleCardMove should catch MISSING_REQUIRED_FIELDS and call onBlockPolicy(data) callback
    instead of showing a toast directly (the parent decides what to show)
  - Returns: { boardColumns, itemsByColumnId, handleCardMove }

TASK 5: Extract useDealsListColumns hook
  - File: core/entities/_entities/deals/hooks/useDealsListColumns.tsx
  - Moves the `columns` ColumnDef<DealRow>[] useMemo out of DealsView
  - Returns columns
  - Depends on: listColumns, canViewValues, pipeline, orgId, customValuesByEntityId

TASK 6: Extract DealPipelineTabs component
  - File: core/entities/_entities/deals/components/DealPipelineTabs.tsx
  - Renders the <div role="tablist"> pipeline tabs markup
  - Props: { pipelines, activePipelineId, onSelect }
  - DealsView uses useEffect to setSlot(<DealPipelineTabs .../>) 

TASK 7: Build FillMissingFieldsDialog
  - File: core/entities/_entities/deals/components/FillMissingFieldsDialog.tsx
  - Props: { open, onOpenChange, orgId, dealId, targetStageId, targetStageName, missingFields: Array<{name:string, label:string}>, onFilled: () => void }
  - Uses EntityFieldForm with includeOnly = new Set(missingFields.map(f => f.name))
  - Submit: runs useDealFormSubmit.save for the missing field values only
  - After successful submit: calls onFilled() so the parent can retry moveToStage
  - Wire into useDealsBoard: when handleCardMove catches MISSING_REQUIRED_FIELDS,
    instead of showing a toast, call onBlockPolicy({ dealId, targetStageId, stageName, missingFields })
  - DealsView holds { fillDialog } state and renders <FillMissingFieldsDialog ... />
    with a handleFilled that retries moveToStage then closes

TASK 8: Clean up DealsView
  - DealsView.tsx should now be ~200 LOC
  - Remove all the extracted logic
  - Import and use: AddDealDrawer, EditDealDrawer, FillMissingFieldsDialog, DealPipelineTabs, useDealsBoard, useDealsListColumns, useDealFormSubmit
  - State remaining in DealsView: view, search, stageFilter, addOpen, editingDeal, editMode, fillDialog, cardFields, groupBy

TASK 9: Fix required field validation feedback in EntityFieldForm
  - Add prop: onSubmitAttempt?: boolean (rename to submittedOnce)
  - When submittedOnce=true and a required field is empty, show ring-destructive or border-destructive on that field
  - AddDealDrawer and EditDealDrawer both pass submittedOnce={isSubmitting || hasAttempted}
  - DO NOT change EntityFieldForm's internal state model — just add visual feedback

AFTER ALL TASKS:
  - Run: pnpm typecheck
  - Fix all TypeScript errors before calling done
  - Verify that: add deal works, edit deal works, drag to stage works, + button shows fillStage, block-policy shows FillMissingFieldsDialog, files attach to deal and person
  - Update core/entities/STATE.md with what was done
  - Update CODE-ARCHITECTURE-PIPELINES-2026-05-20.md §5 "Where every piece lives" with new file paths

RULES TO FOLLOW (from AGENTS.md):
  - RTL-safe: ms-*/me-* not ml-*/mr-*; ps-*/pe-* not pl-*/pr-*; start-*/end-* not left-*/right-*
  - rounded-[var(--radius)] not rounded-md/lg/xl
  - No hardcoded app strings
  - No useQuery for pipelines — use useDealPipelines(orgId)
  - Drag persistence = one mutation per drop (onCommit only, never onValueChange)
  - Per-row data on kanban = one batched query (no per-card useQuery)
  - Identity/auth via context not subscriptions
  - Every list-affecting mutation has withOptimisticUpdate
  - Never put hook return objects in useEffect deps
```

---

## 11. Verification checklist after refactor

- [ ] `pnpm typecheck` passes (zero errors)
- [ ] DealDetailView.tsx (or new DealsView.tsx) is ≤ 250 LOC
- [ ] AddDealDrawer.tsx is its own file
- [ ] EditDealDrawer.tsx supports file uploads
- [ ] `useDealFormSubmit` is used by both AddDealDrawer and EditDealDrawer
- [ ] Drag → block policy → FillMissingFieldsDialog opens → fill fields → drag succeeds
- [ ] Drag → warn policy → succeeds, no dialog
- [ ] `+` button on card → fillStage mode → only current-stage empty fields shown
- [ ] Edit from overflow → shows defaults + all stage fields up to currentStage
- [ ] Add deal → files stored with scope=deal, tagged person:<personCode>
- [ ] Edit deal → new file uploads committed with correct scope + person tag
- [ ] Pipeline tabs in TopNav appear when >1 pipeline exists
- [ ] Switch pipeline tab → kanban reloads to new pipeline's stages
- [ ] Required fields show visual error when form submitted without filling them
- [ ] All RTL-safe classes (no ml-, mr-, pl-, pr-, left-, right-, text-left, text-right)
- [ ] No rounded-md/lg/xl (use rounded-[var(--radius)])

# Entities — State

> Updated: 2026-05-21 (Website link bug fix + project-wide URL helper; pretty 404/error UIs restored).
> Status: 100% complete (Phase 2).

## 2026-05-21 — External-URL renderers normalize protocol; segment-scoped 404 added

**Problem reported:**
A user typed `reimaginy.com` (no protocol) in the company `website` field. Clicking
the Website link in the company hovercard navigated to
`/en/{orgSlug}/reimaginy.com` instead of opening the external site. That route
matched `[orgSlug]/[entitySlug]/page.tsx`, `EntitySlugView` couldn't resolve the
slug, called `notFound()`, and — because the project had no `not-found.tsx`
anywhere — Next.js's default fallback threw `NEXT_HTTP_ERROR_FALLBACK;404`. The
parent `(private)/error.tsx` boundary then rendered `<DashboardError>` with the
raw stack trace (the debug version that had been swapped in earlier).

**Root cause:**
Three renderers built `<a href={value} target="_blank">` directly from a
user-entered string, with no scheme normalization. Browsers treat scheme-less
strings as relative URLs.

**What was done:**

| File | Change |
|---|---|
| `lib/url.ts` | NEW. `normalizeExternalUrl(value)` prepends `https://` when missing, rejects `javascript:` / `data:` / `vbscript:` / `file:` / `about:`, validates with `new URL()`, returns `null` when the value can't be safely turned into an external link. `displayUrlLabel(url, max)` strips scheme + `www.` for tidy labels. |
| `core/entities/shared/components/EntityOverview.tsx` | Company hovercard "Website" row now goes through `normalizeExternalUrl`. Falls back to plain text when invalid. `rel="noopener noreferrer external"`. |
| `core/entities/shared/components/cells/cell-dispatcher.tsx` | `kind: "url"` cell renderer same treatment. |
| `core/entities/shared/components/FieldValueRenderer.tsx` | `kind: "link"` field-value renderer same treatment. |
| `core/entities/_entities/companies/views/CompaniesView.tsx` | Company detail "Details" card was rendering website as plain text — now also a clickable link via `normalizeExternalUrl`. |

### Rule of thumb (lock for future code)

Any place that renders a user-supplied URL as `<a href={…} target="_blank">` MUST go
through `normalizeExternalUrl`. If it returns `null`, render plain text — never
emit a relative `<a>` to a user-entered string. Audited via:
`rg "href=\{.*website|href=\{String\(value" --type tsx`.

### Verification

- `pnpm typecheck` → 0 errors.
- `pnpm exec biome check` on all 10 touched files → 0 issues.
- `pnpm build` → all 18 routes generated, including the new `/_not-found` static
  prerender.

---

## 2026-05-21 — Tables unified through `useEntityColumns`; deals tables become stage-aware

**Problem (3 separate symptoms reported):**
1. Headers on Contacts / Companies / Deals tables had no sort affordance — no buttons, no chevrons, clicking did nothing. Some headers showed lowercase keys (`phone`, `tags`) because the hand-rolled column switch's `default` branch used `header: key`.
2. Contacts table: assigning a company refetched on every operation. Tags column flashed empty per row.
3. Companies table: tags column was missing entirely; cards showed tags but the table never rendered them.
4. Deals table: stage filter narrowed *rows* but not *columns* — the user wanted "Default-stage fields + active-stage fields" when a stage was picked. Currency was hard-coded to USD instead of the org default.

**Root cause:** Three of the four CRM tables (Contacts, Companies, Deals) bypassed the central `useEntityColumns` factory and hand-rolled their own `useMemo<ColumnDef>` blocks. The factory uses `<DataTableColumnHeader>` for every column (giving you click-to-sort + hover chevrons); the hand-rolled blocks didn't. The factory's cell-dispatcher wires `prefetchedTags` / `prefetchedCompany` automatically; the hand-rolled blocks ignored the batched lookups even when the parent view computed them.

**What was done:**

### Modified files

| File | Was | Now | Change |
|---|---|---|---|
| `core/entities/_entities/contacts/views/ContactDetailView.tsx` | 619 LOC, hand-rolled columns | 459 LOC, `useEntityColumns` | Dropped `ColumnDef`, `Checkbox`, `DataTableRowActions`, `AssigneeCell`, `CompanyCell`, `TagsCell`, `PersonCodeBadge`, `formatDistanceToNow` imports. Added `useEntityColumns` + `useCompaniesByPersonCodes`. Eliminated per-row `getByPersonCode` storm. Edit + Revert-to-Lead live in `rowExtraActions`. |
| `core/entities/_entities/companies/views/CompaniesView.tsx` | 644 LOC, hand-rolled columns | 481 LOC, `useEntityColumns` | Dropped `ColumnDef`, `Badge`, `Checkbox`, `DataTableRowActions`, `AssigneeCell`, `formatDistanceToNow` imports. Tags column now appears (was missing). Cards + table read from the same `tagsByEntityId` batch — no more out-of-sync. Edit lives in `rowExtraActions`. |
| `core/entities/_entities/deals/views/DealDetailView.tsx` | 442 LOC, called `useDealsListColumns` | 446 LOC, calls `useEntityColumns` with computed `hiddenColumnIds` | Stage-aware table: when `StageFilter` is set, `hiddenColumnIds` hides every visible deal field whose `showInStages` doesn't include the active stage AND doesn't include the pipeline's Default stage. Empty `showInStages` is treated as "not pinned anywhere" → also hidden when stage filter is active. The `deals.viewValues` permission gate moves to `hiddenColumnIds` too. Currency now reads org default via the dispatcher. |
| `core/entities/shared/hooks/useEntityFields.ts` | doc said "tables are cross-stage views" | doc spells out the new contract | The hook still exposes `tableFields = visibleFields` (renderer-agnostic). The decision of whether to narrow by stage moves to the view layer. |
| `core/entities/MODULE.md` | — | new dated section (2026-05-21) | Three decision rows covering the unified table path, stage-aware deals, and the cell-import cleanup. |

### Files deleted

| File | Reason |
|---|---|
| `core/entities/_entities/deals/hooks/useDealsListColumns.tsx` | Replaced by `useEntityColumns`. Single canonical column factory across all four entities. |

### Key behaviours now working

- **Click-to-sort everywhere** on Contacts / Companies / Deals tables (was already working on Leads). Hover any header → chevron pair. Click cycles `none → asc → desc → none`. Driven by the existing `<DataTableColumnHeader>` and TanStack client-side sort (`manualSorting: false`).
- **`+ inline-edit` on every empty cell** for fields that support it (text / number / date / select / url / email / phone / file). Click → tight popover → Enter or Save → fires-and-forgets through `useUpdate{Lead,Contact,Deal,Company}` (column-storage) or `fieldValues.set` (custom-storage). Skipped for tags / assignee / status / personCode / entityCode / displayName / title / boolean by design.
- **Tags column on Companies table** now renders. Cards and table share the same `tagsByEntityId` batch — picking a tag in one updates the other on the same render.
- **Contacts company column** is single-batch, not per-row. Assigning a company on one row no longer triggers refetches across the rest of the table.
- **Deals table is stage-aware** — picking a stage in the toolbar `StageFilter` narrows columns to the admin-curated Default-stage set + the active stage's pinned fields. Picking "All stages" restores every visible field. No hardcoded list.
- **Deals currency** uses the org's default currency (read once from `useOrgDefaultCurrency`), not hard-coded USD.

### Verification

- `pnpm typecheck` clean (tsc --noEmit, no errors).
- `pnpm exec biome lint` scoped to the four touched files: clean.
- LSP `get_diagnostics` on all four files: empty.
- Greps: zero remaining references to `useDealsListColumns`. Direct `<AssigneeCell>` / `<CompanyCell>` / `<TagsCell>` imports in views/ removed everywhere they were redundant; the components themselves are still rendered (via the cell dispatcher) and still imported by `EntityCard`, `cell-dispatcher`, and `useReminderColumns`.

---

## 2026-05-20 — Deals module refactor (clean split, no duplication)

**Problem**: `DealDetailView.tsx` was 1219 LOC containing two components
(DealsView + AddDealDrawer), inline board logic, inline column defs, inline
nav slot, and a duplicated submit block between AddDealDrawer and
EditDealDrawer.

**What was done:**

### New files created

| File | LOC | Purpose |
|---|---|---|
| `deals/components/AddDealDrawer.tsx` | 211 | Extracted from DealDetailView; uses useDealFormSubmit |
| `deals/components/EditDealDrawer.tsx` | 180 | Rewritten with file support; uses useDealFormSubmit |
| `deals/components/FillMissingFieldsDialog.tsx` | 116 | NEW — block-policy drag fill + auto-retry moveToStage |
| `deals/components/DealPipelineTabs.tsx` | 45 | Extracted nav-slot pipeline tab strip |
| `deals/hooks/useDealFormSubmit.ts` | 121 | NEW — single submit path for add AND edit |
| `deals/hooks/useDealsBoard.ts` | 256 | Extracted: boardColumns + itemsByColumnId + handleCardMove |
| `deals/hooks/useDealsListColumns.tsx` | 160 | Extracted: TanStack ColumnDef array |

### Modified files

| File | Was | Now | Change |
|---|---|---|---|
| `deals/views/DealDetailView.tsx` | 1219 LOC | 442 LOC | Thin orchestrator — imports all extracted pieces |
| `shared/components/EntityFieldForm.tsx` | 436 LOC | 455 LOC | Added `submittedOnce` prop for required-field visual feedback |

### Key behaviours now working

- **Add deal**: PersonSelect + dynamic stage fields + file upload → `deals.create` + `fieldValues.bulkSet` + `fileBuffer.commitAll`
- **Edit deal**: shows defaults + all stage fields up to currentStage + file upload → `deals.update` + `bulkSet` + `fileBuffer.commitAll`
- **Fill stage**: `+` button on card → shows ONLY empty fields for current stage → same submit path
- **Block policy on drag**: catches `MISSING_REQUIRED_FIELDS` → opens `FillMissingFieldsDialog` → after save, auto-retries `moveToStage`
- **Files**: stored with `scope="deal"`, `scopeId=dealCode`, tagged `person:<personCode>` — shows on both deal and person profile
- **Required field feedback**: `submittedOnce=true` → red label + ring + error text on empty required fields



## 2026-05-20 round 4 hotfix — undefined-storage write-through bug

> Symptom: typing a value into Ejari (or any custom field whose seed
> omits `storage`) and clicking Save showed the "Deal updated" toast,
> but the value never persisted. Reopen the drawer → field empty.
> Yellow border + `+` button stayed.
>
> Root cause: `EntityFieldForm.handleChange` wrote undefined-storage
> fields into local `customValues` state (matching `valueFor`), but the
> per-keystroke `setFieldValue` mutation was gated on
> `field.storage === "fieldValues"` — strict equality. Undefined storage
> fell through that gate, so nothing ever hit the server.
> `EditDealDrawer.handleSubmit` only called `deals.update` (column
> fields), so Save didn't compensate either.
>
> Fix:
>
> 1. `core/entities/shared/components/EntityFieldForm.tsx` — relaxed the
>    write-through gate from `storage === "fieldValues"` to
>    `storage === "fieldValues" || !storage`. Undefined storage means
>    "fallback to fieldValues", consistent with how `valueFor` /
>    `handleChange` already bucketed those fields. Join fields (tags)
>    still own their own write path.
>
> 2. `core/entities/_entities/deals/components/EditDealDrawer.tsx` —
>    `handleSubmit` now also flushes the form's `valuesGetterRef` →
>    `customValues` via `fieldValues.bulkSet`. Same pattern AddDealDrawer
>    uses on create. Acts as a deterministic backstop for the cases
>    where per-keystroke write-through hadn't completed (e.g. user
>    typed and immediately clicked Save, or a renderer that fires
>    onChange only on blur).
>
> Verification: `pnpm typecheck` + `pnpm lint-check` clean. Manual test:
> drag a deal to the Documentation stage, click `+`, type the Ejari
> number, click Save. Reopen → value is there. `+` and yellow border
> are gone.

## 2026-05-20 round 4 — Option A: per-stage `+` gates, Edit shows defaults + every stage 0..current

> Round 3 made the `+` walk every stage 0..current and Edit show every stage-pinned field on the deal. The user wanted something narrower — closer to the original mental model:
>
>   - Each stage owns its own closed set of fields. The `+` for stage N is "fields pinned to stage N that are still empty." Once those are filled, the `+` disappears for that stage. Drag to stage N+1, a fresh closed set takes over.
>   - Edit mode shouldn't expose stage-N+1 fields — only what the deal has been "exposed to" up to its current stage (defaults + every stage at order ≤ current).
>   - Required vs optional doesn't matter for the `+` gate. If the field is pinned and empty, it counts.
>
> **Implementation (this session):**
>
> 1. **`convex/crm/fields/pipelines/helpers.ts`** — added two new helpers:
>    - `getStagePinnedFields(ctx, {orgId, entityType, stageId})` — returns every visible non-readonly field pinned to that stage (no `required` check).
>    - `pickEmptyPinnedFields({deal, fieldValuesByName, pinnedFields})` — pure helper that returns the empty subset, same "empty" rules as the existing `pickMissingFields`.
>    - The existing `getRequiredFieldsForStage` + `pickMissingFields` are retained for the transition-policy gate (`moveToStage` block/warn) — that's a separate semantic that keeps using `required`.
>
> 2. **`convex/crm/entities/deals/queries.ts`** — three changes:
>    - **NEW** `getStageFieldsToFill(orgId, dealId)` returns the empty pinned fields at the deal's current stage. Used by `EditDealDrawer.fillStage` mode.
>    - **NEW** `getEditableFieldsUpToStage(orgId, dealId)` returns the union of field NAMES pinned to any stage at order ≤ deal.currentStageId (excluding final stages). Used by `EditDealDrawer.edit` mode as `includeOnly`.
>    - **REPLACED** `listDealsMissingFieldsByPipeline`'s body to count empty pinned fields (no required filter) per deal at its current stage. Same query name + signature so the deals board's yellow-border + `+` gate stays wired. The "missing required fields" snapshot used by the transition-policy preview lives in `getMissingFieldsForStage` and is unchanged.
>    - **DELETED** `getMissingFieldsUpToStage` (the round-2 walk-up query). No remaining consumers.
>
> 3. **`core/entities/_entities/deals/components/EditDealDrawer.tsx`** — rewrote for round 4:
>    - `mode: "edit" | "fillStage"` (renamed from `fillMissing`).
>    - `fillStage` subscribes to `getStageFieldsToFill`. Form renders ONLY the empty pinned-to-current-stage fields via `includeOnly`. Header lists which stage we're filling.
>    - `edit` subscribes to `getEditableFieldsUpToStage` and passes those names as `includeOnly`. So opening Edit on a stage-3 deal shows defaults + stage-1 + 2 + 3 pinned fields. Stage-N+1 fields are hidden until the deal advances.
>    - Both modes pass `currentStageId={undefined}` to `EntityFieldForm` so the underlying `useEntityFields.formFields` returns every visible stage-pinned field; the `includeOnly` set narrows from there.
>    - Empty-state in `fillStage` when nothing's left to fill — friendly note suggesting to drag to the next stage.
>    - Bootstrap fix from round 3 (`useEffect([entity, formFields])` in `EntityFieldForm`) is unchanged and still fixes the "title required" false alarm.
>
> 4. **`core/entities/_entities/deals/views/DealDetailView.tsx`** — renamed the `editMode` state values from `"edit" | "fillMissing"` → `"edit" | "fillStage"`. Updated the `+` shortcut label from "Fill N required field(s)" to "Fill N stage field(s)" (mirrors the new mental model: it's all stage-aware fields, not just required ones). The `+` itself is still gated on `missingFieldsByDealId[item.id] > 0` — same wiring, broader gate.
>
> 5. **No schema migration required.** The fix is read-only — adds two helpers, two queries, replaces one query body. Deal data shape, `fieldDefinitions`, and `fieldValues` are unchanged.
>
> **Verification:** `pnpm typecheck` + `pnpm lint-check` both pass.
>
> **Manual test path:**
>   1. Real-estate template, fresh deal on Default stage. Default stage has defaults pinned (title, value, assignee, ...). User filled all of them at creation → no `+`. Drag to "New Inquiry" — no fields pinned to that stage in the seed → no `+`.
>   2. Drag to "Documentation". Ejari is pinned to DOC + EJ. The deal has no Ejari value → `+` shows with label "Fill 1 stage field". Click `+` → form shows ONLY Ejari Number (not title, not anything from the Default stage). Fill + Save → `+` disappears.
>   3. Drag to "Ejari / Registration". Ejari is already filled (the value persists across stages because it's the same deal row), so the `+` does NOT reappear. The empty-set rule (Option A) is honored.
>   4. Open Edit on the Documentation-stage deal → form shows: title + value + assignee + ... (defaults) + Ejari (stage DOC). Stage HO fields don't appear yet.

## 2026-05-20 round 3 — EntityFieldForm bootstrap fix + Edit mode shows all fields

> Two issues remained after round 2:
>
>  1. **"Title required" false alarm.** `EntityFieldForm` initialised
>     `columnValues` via `useState(() => { for (const f of formFields) ... })`
>     — but `formFields` comes from `useEntityFields(slot, orgId, ...)` which
>     is a Convex `useQuery`. On first render the query is loading, so
>     `formFields = []` and the lazy initializer produces `{}`. Then the
>     query resolves with title/value/etc. but there was no useEffect to
>     re-sync `columnValues` from `entity`; the only re-sync path was
>     `if (entity._id !== initedFor.current)`, which never fires when
>     editing the same deal. As a result `col.title` stayed `undefined`,
>     and the round-2 client-side guard `if (mode==="edit" && !title)` in
>     `EditDealDrawer` falsely fired the "title is required" toast even
>     though `entity.title` had a value.
>
>  2. **Stage-1 Edit form couldn't surface stage-pinned fields like Ejari.**
>     Round 2's `EditDealDrawer` passed `currentStageId={deal.currentStageId}`
>     in edit mode, so `useEntityFields.formFields` filtered by
>     `showInStages.includes(currentStageId)`. Since the real-estate
>     template pins Ejari to `["DOC", "EJ"]` only, opening Edit on a
>     Default-stage deal hid Ejari entirely — the user had to drag the
>     deal to Documentation first to even see the field, contradicting
>     the "one deal, many stages, fields are universal" mental model.
>
> **Fixes (this session):**
>
> 1. **`core/entities/shared/components/EntityFieldForm.tsx`** — added a
>    new `useEffect([entity, formFields])` that re-fills `columnValues`
>    from `entity` once `formFields` has at least one column-storage
>    entry, with the same `touchedRef` protection so the user's
>    in-flight edits are never clobbered. Pre-existing bug fix that
>    benefits every consumer (lead, contact, deal, company edit drawers
>    + AddDealDrawer's create flow).
>
> 2. **`core/entities/_entities/deals/components/EditDealDrawer.tsx`** —
>    dropped the round-2 client-side `title is required` toast. Title
>    now falls back to `deal.title` when the form's `col.title` is
>    blank (defensive belt-and-suspenders even with the bootstrap fix).
>    Both edit + fillMissing modes now pass `currentStageId={undefined}`
>    to `EntityFieldForm` — the two modes differ only in `includeOnly`:
>    fillMissing narrows to missing required fields; edit shows every
>    stage-pinned visible field. So the user can fill the Ejari Number
>    on a stage-1 deal via Edit without dragging the card first.
>
> 3. **MODULE.md decision rows 13 + 14** updated to reflect the new
>    edit-mode scope and the bootstrap-fix invariant.
>
> **Verification:** `pnpm typecheck` + `pnpm lint-check` both clean.
> Manual test path: open a real-estate-template stage-1 deal via the
> overflow menu's "Edit" entry — Ejari Number, Property Type, Budget
> should all be present in the form alongside Title/Value/Assignee.
> Save without changing anything should not toast "title required".

## 2026-05-20 round 2 — `+` shortcut hides when no gaps + fillMissing form aggregation

> The `+` shortcut on deal cards used to open `EditDealDrawer` scoped to
> the CURRENT stage's `formFields`, which meant:
>
>   - It always rendered (even when the deal had no missing required
>     fields), labelled "Edit deal" on filled cards. Users on the
>     Default stage saw a `+` even though they'd just filled every
>     required field at creation time.
>   - It re-asked already-filled fields (title, value, etc.) every time
>     because `EntityFieldForm` had no awareness of which fields were
>     missing — it just rendered every field whose `showInStages`
>     included the deal's current stage.
>   - It never surfaced gaps from earlier stages. A deal sitting on
>     stage 3 with a stage-2 required field still empty wouldn't
>     reveal that gap from the `+` shortcut on the card.
>
> **Fix (this session):**
>
> 1. **`convex/crm/entities/deals/queries.ts`** — added
>    `getMissingFieldsUpToStage(orgId, dealId)`. Walks every non-final
>    stage from `order=0` up to and INCLUDING the deal's
>    `currentStageId`, computes missing required fields per stage via
>    `getRequiredFieldsForStage` + `pickMissingFields`, dedupes by
>    field `name` (so a field pinned to multiple early stages appears
>    once, attributed to the EARLIEST stage). One subscription per
>    open drawer.
>
> 2. **`core/entities/_entities/deals/components/EditDealDrawer.tsx`** —
>    new `mode: "edit" | "fillMissing"` prop. In `fillMissing` mode:
>    - Subscribes to `getMissingFieldsUpToStage`.
>    - Passes `currentStageId={undefined}` to `EntityFieldForm` so
>      `useEntityFields.formFields` returns every stage-pinned field
>      (not just current-stage fields), then `includeOnly` narrows to
>      ONLY the missing names. This is critical: a field pinned only
>      to stage 2 needs to be reachable when the deal is on stage 3.
>    - Renders a stage-grouped header listing which stage each gap
>      came from ("Default: Title, Value", "Stage 2: Budget").
>    - Falls back to a friendly empty-state if the missing-fields
>      query resolves to zero gaps (rare race between click and
>      resolution).
>
> 3. **`core/entities/_entities/deals/views/DealDetailView.tsx`** —
>    `renderCard` now omits the `+` shortcut entirely when
>    `missingCount === 0`. New `editMode` state tracks whether the
>    user opened the drawer via the `+` (→ `fillMissing`) or via the
>    overflow menu's "Edit" entry (→ `edit`). The mode is passed to
>    `EditDealDrawer`.
>
> 4. **No schema migration needed.** The fix is read-only — it just
>    aggregates the existing `getMissingFieldsForStage` logic across
>    multiple stages. Deal data shape, `fieldDefinitions`, and
>    `fieldValues` stay unchanged.
>
> **Verification:** `pnpm typecheck` passes. `pnpm lint-check` clean.
> Manual test path: create a deal on a multi-stage pipeline, fill the
> default stage, drag to stage 3, mark a stage-2 field as required.
> The card should yellow-border + `+` should appear; opening `+` shows
> only the stage-2 missing field grouped under "Stage 2", with a
> "stage 2 missing field + stage 3 missing field" listing if both
> apply. Filling them and saving should make the `+` disappear.

## 2026-05-20 — Pipelines (frontend)

| # | Decision | Outcome |
|---|---|---|
| 1 | Centralized pipeline subscriptions live in `core/entities/_entities/deals/hooks/usePipelines.ts` (`usePipelines`, `useDealPipelines`, `useDefaultDealPipeline`, `useActiveDealPipeline`). | Single subscription per `(orgId)`. Components MUST NOT call `useQuery(api.crm.fields.pipelines.queries.*)` directly. Mirrors the `useCurrentOrg` pattern, but module-scoped (regular hook, not React context — pipelines aren't relevant on every route). |
| 2 | `useActiveDealPipeline` persists the user's chosen pipeline via `usePersistedState` under `viewopts:deal:activePipelineId`. Falls back to default if the persisted id was deleted. | Pipeline tab switch is purely client state — no server roundtrip until the next deal-touching action. |
| 3 | Compact pipeline tabs above the kanban use a custom pill row, not shadcn `<TabsList>`. Tab switch resets `stageFilter` + `search` + `activeSavedViewId`. | Sub-pipeline state never leaks across pipelines. Visually minimal, matches Pipedrive/HubSpot. |
| 4 | `AddDealDrawer` pipeline picker Select renders only when `pipelines.length > 1`. Empty-state ("Open Settings → Modules → Deal → Pipelines") stays unchanged. | Single-pipeline orgs see the same UX as before. |
| 5 | `ChangePipelineDialog` reuses the centralized `useDealPipelines` hook — no extra subscription. | Mounting the dialog adds zero queries. |
| 6 | `PipelineEditor` adds: stage code Input (regex `^[A-Z0-9_-]{2,16}$`, auto-uppercases), `Default` badge on first non-final stage, DropdownMenu with "Make this default" action. | Owner-typed codes; reserved suggestions WON/LOST/DONE for finals; no shipping a pipeline without codes. |

## 2026-05-19 round 3 — DealDetail + CompanyDetail get Timeline/Follow-ups, EntityFilesPanel duplicate row fix

> Status was ~99% complete. Detail pages for deals + companies now match the profile parity (Timeline + Follow-ups tabs, Overview embeds summary cards). EntityFilesPanel no longer renders a duplicate trash-less row. Forms, cards, and drawer UX remain at production-grade density.
>
> **2026-05-19 round 3 — detail-page parity + Files dedup.**
>
> 1. **DealDetailView gets Timeline + Follow-ups tabs.** Added two new
>    tabs (Timeline, Follow-ups) using `<EntityTimeline entityType="deal">`
>    and `<EntityFollowups entityType="deal">`. Overview tab gets two
>    embedded summary cards (Recent activity + Open follow-ups) with
>    `View all` links that switch tabs. Tabs: Overview / Timeline /
>    Follow-ups / Calendar / Reminders. File: `core/entities/_entities/deals/views/DealDetailView.tsx`.
>
> 2. **CompanyDetailView gets Timeline + Follow-ups tabs.** Same pattern
>    (passes `entityType="company"` + `entityId=company.companyCode`,
>    no `personCode` since companies don't have a primary person).
>    Tabs: Overview / Timeline / Follow-ups / Calendar.
>    File: `core/entities/_entities/companies/views/CompaniesView.tsx`.
>
> 3. **EntityFilesPanel — no more duplicate row.** Previously the panel
>    stacked `<FileUpload>` (which has its own internal `<FileList>`
>    from `useFileAttachments.listByScope`) on top of a separate merged
>    `<FileList>` from `listForEntity`. Direct-scope files appeared
>    twice — once with trash, once without. Refactored to render the
>    dropzone alone (`<FileDropzone>`) + a single merged `<FileList>`
>    wired to `useFileAttachments.remove`, so every row has a trash
>    icon and there are no duplicates. File:
>    `core/entities/shared/components/EntityFilesPanel.tsx`.
>
> **2026-05-19 round 2 — activity logs are now field-level + EntityHoverCard
> delegation.**
>
> 1. New helper `convex/_shared/fieldUpdateLog.ts::logFieldUpdates` diffs
>    the old document against the patch and emits ONE activity log per
>    actually-changed field with `action: "field_updated"` and metadata
>    `{ field, fromValue, toValue }`. `leads.update`,
>    `contacts.update`, `deals.update`, and `companies.update` all use
>    this in place of the old generic "Lead updated: name" entry.
>
> 2. `TimelineBareEntry` now uses `entry.description` as the headline for
>    `field_updated` rows so the user sees "Status: new → qualified"
>    directly instead of a generic "Lead updated" — `extractSubject`
>    skips its colon-split for `field_updated` to avoid mis-rendering
>    the change pair as a subject.
>
> 3. `convex/crm/entities/deals/queries.ts::listByPersonCode` added —
>    used by the new `OverviewCard` to surface the latest 3 deals on a
>    profile page or hover preview.
>
> 4. `EntityHoverCard` now delegates person previews to
>    `<OverviewCard compact />` so hover and the profile Overview tab
>    share one source of truth. Deal/company hover still uses the older
>    `EntityOverview`.
>
> **2026-05-19 — `EntityCard.statusDot` + LeadCard.** Added an optional
> `statusDot` prop on `EntityCard` rendered in the top-right of row 1,
> just before the tags slot. The dot is a small coloured circle with a
> tooltip; it shares row 1's `ms-auto` cluster with the tags so the
> layout is stable whether tags are present or not. `LeadCard` now
> always passes `statusDot` (computed from `item.status` via
> `getStatusColor("lead", status)`), so on the new All-Profiles page
> (which can't groupBy=status because it stacks two boards) every lead
> card still surfaces its lifecycle stage. ContactCard parity is
> automatic — both views render through the SAME `EntityCard`, so
> tags + assignee + AI summary + group-replacement strip all work
> identically on the profiles page.
>
> **2026-05-18 — Task 5 wiring + EntityCodeSelector.** Added
> `core/entities/shared/components/EntityCodeSelector.tsx`: a Combobox-style
> picker that reuses `useEntitySearch` from notes and renders avatar + name
> + code on the selected chip. `ReminderForm` now uses it to attach
> reminders to leads / contacts / deals / companies (replaces the old
> person-only `PersonSelect`). `DealDetailView` and `CompanyDetailView`
> shells now resolve via `getByDealCode` / `getByCompanyCode` and mount
> `EntityCalendarPanel` (deals + companies) and `RemindersPanel` (deals).
> Both views still need full Slice 2/3/4 detail content; the calendar +
> reminders tabs are testable today via the dashboard, the reminders
> page, and the profile route.
>
> **2026-05-18 perf fix #5 — TagsCell `listByOrg` lazy subscription**:
> `TagsCell` was firing `api.crm.shared.tags.queries.listByOrg` on EVERY
> visible board card on mount, even though that query (the org's full
> tag catalogue) is only needed inside the picker popover. Convex
> deduplicates the round-trip but the dashboard's "Function Calls"
> counter records every `useQuery` registration separately — with ~10
> cards on a board, that's 10 extra subscriptions per page mount. Fix:
> gate the subscription on `open && orgId` so it fires once on the first
> tag-edit and stays warm only as long as the user is in pick mode.
> The per-row `getTagsForEntity` was already prefetched via
> `useEntityTagsMap` — that path is unchanged.
>
> **2026-05-18 perf fix #4 — leads optimistic update no longer bumps
> `updatedAt`**: per AGENTS.md "Every list-affecting mutation has
> `withOptimisticUpdate`" rule, the optimistic patch must NOT bump
> `updatedAt: Date.now()` because that changes row identity on every
> render and cascades list invalidations. The leads board was doing
> exactly that. Fixed `LeadsView::updateLead.withOptimisticUpdate` to
> only patch the user-visible fields (`status`, `assignedTo`, `source`,
> `sortOrder`) and leave `updatedAt` to the server. Net effect: drag
> drop = 1 mutation + 1 optimistic patch + 0 list re-subscriptions
> until the server roundtrip lands and reactively refreshes the list.
>
> **2026-05-18 perf fix #3 — single-write drag (the "real" fix)**: the
> previous "one mutation per drop" change still fired ONE mutation per
> *displaced* card, not just the dragged one. So a drop into a column
> with 5 cards still emitted ~6 mutations + ~30 list re-runs. Fix: the
> dnd-kit primitive now passes `draggedItemId` to `onCommit`, and
> `KanbanBoard.onCommit` persists ONLY that card's new (column, index).
> The other cards' `sortOrder` values DO NOT need to change — the
> dragged card's fractional sortOrder slots between two existing
> values, displacing them visually without rewriting them. Net effect:
> N drops = N mutations, regardless of how many cards are in the
> destination column. Test: `convex/crm-hardening.test.ts::"notes.reorder
> (single-write invariant)"` locks this contract by asserting that
> reorder leaves sibling rows untouched.
>
> **2026-05-18 perf fix #2 — visual feedback during drag**: when the
> previous fix removed `onValueChange` as a persistence path, a side
> effect was that visual reorder during drag also stopped working
> (cards no longer made space, cross-column hover bg colour stopped
> changing). Root cause: the kanban primitive stored the in-flight
> layout in a `useRef`, which never triggers re-render. Fix: converted
> to `useState` (`pendingLayout`), exposed via `useKanbanItems()` hook,
> and lifted `<KanbanBoardBody>` / `<NotesSingleBoardCards>` into child
> components that subscribe to it. Drag visual feedback now works
> end-to-end without firing any Convex calls.
>
> **2026-05-18 perf fix — per-card tag subscription elimination**: every
> `EntityCard` rendered on a kanban was firing its own
> `crm.shared.tags.queries.getTagsForEntity` subscription. With ~10
> visible cards on the leads / contacts / deals / companies boards this
> manifested as 100+ Convex calls / minute on a single user's session
> (visible in the dashboard "Function Calls" chart as a tall green spike
> next to `notes:listForOrg`). Fix: added `prefetchedTags` prop to
> `EntityCard` (and the wrapper `LeadCard`), wired it from each board
> view (`LeadsView`, `ContactsView`, `DealDetailView`, `CompaniesView`)
> via `useEntityTagsMap(orgId, slot).tagsByEntityId[item.id]`. When
> provided, `<TagsCell>` reads from the prefetched array and skips the
> per-card `useQuery`. Embedded panels and standalone callers without a
> board-wide map fall back to the legacy per-card path — no breaking
> change for consumers.
>
> **2026-05-18 perf fix — server-side rate limit on drag mutations**:
> `notes.reorder`, `notes.setCategory`, `leads.update`, `contacts.update`,
> `deals.update`, `deals.moveToStage`, `companies.update` all now gate
> on `enforceRateLimit` with a 120/min budget (scoped per
> user+org pair). `notes.reorder` and `notes.setCategory` share the
> same scope so a user can't bypass by alternating across columns.
> `deals.update` and `deals.moveToStage` share scope for the same
> reason. Defensive: catches future regressions early instead of
> burning the free-tier quota.
>
> **2026-05-18 perf fix — kanban drag firing one mutation per frame**:
> the dnd-kit `Kanban` primitive in `components/ui/kanban.tsx` emits
> `onValueChange` on every `onDragOver` event (every time the dragged
> card crosses a sibling). The entity board's `KanbanBoard` consumer
> wired its persistence callback (`onCardMove` → server mutation) to
> `onValueChange`, which meant a single cross-column drag fired N+1
> mutations (one per frame) instead of one per drop. The visible
> symptom was leads/deals cards bouncing through several positions
> before settling on the dropped slot. Fix: added `onCommit` callback
> to the primitive (fires EXACTLY once per drop in `onDragEnd`,
> guaranteed via an internal `pendingLayoutRef` that mirrors the
> as-if-applied layout during drag). `KanbanBoard` now persists from
> `onCommit`, never from `onValueChange`. Same fix for
> `NotesSingleBoard`. `onValueChange` still emits during drag for
> visual reorder feedback but is no longer used for mutations.
>
> **2026-05-18 board UX fixes**:
>   1. `EntityCard` no longer renders an always-on built-in field strip.
>      Instead it surfaces a single `GroupReplacementStrip` (top-right or
>      bottom-left) **only** when the active `groupBy` vacates a layout
>      slot:
>        - `groupBy="tag" | "tags"` → tag chip slot vacated → strip in
>          top-right showing the revealed field (status for leads,
>          industry for companies, companyId for contacts, etc.).
>        - `groupBy="assignedTo"` → assignee avatar slot vacated → strip
>          in bottom-left where the avatar used to be.
>        - `groupBy="status" | "source" | "industry" | "companyId" |
>          "currentStageId"` → no slot vacated → tiny coloured dot
>          appended after the assignee avatar (with a Tooltip that
>          discloses the field name + label).
>      Wired by passing `groupBy` AND `resolveReplacementLabel` (a
>      `useCallback`-stable resolver that turns opaque ids — userId,
>      companyId, stageId — into human labels using the maps each view
>      already maintains: `memberNameById`, `companyNameById`,
>      `stageNameById`). Each view reads only data already in scope; no
>      extra Convex queries are fired from inside `EntityCard`. See
>      `GroupReplacementStrip` + `FIELD_DISPLAY_TITLES` at the bottom of
>      `core/entities/shared/components/EntityCard.tsx` and the reveal
>      matrix in `core/entities/shared/utils/board-grouping.ts`.
>
>      `viewopts:{slot}:cardFields` localStorage keys bumped to `:v2` for
>      all four slots so users with stale cardFields entries (that
>      assumed the always-on strip) get a fresh seed against the current
>      admin-visible field set on next visit.
>   2. `handleCardMove` in all four views (lead/contact/deal/company) now
>      handles `groupBy === "tag" | "tags"` properly. Cross-column tag
>      drops attach the destination tag and detach the source via
>      `tags.attachToEntity` + `tags.detachFromEntity`. Drops onto the
>      `__none__` (NO_GROUP_KEY) column detach the source without
>      attaching anything new (fully removes that tag from the entity).
>   3. `leads.update` / `contacts.update` now propagate `assignedTo`
>      changes to their linked counterpart — a kanban drag on the
>      contacts board updates the source lead too, and vice versa.
>      Idempotent: only fires when the value actually differs.

## What's shipped

### The dynamic field system

Every field — `displayName`, `email`, `phone`, `status`, `assignedTo`, `tags`,
`personCode`, plus admin-added custom fields — is a row in `fieldDefinitions`.
A single hook (`useEntityFields`) feeds:

- The table column builder (`useEntityColumns` / cells/cell-dispatcher).
- The generic form (`EntityFieldForm` / inputs/input-dispatcher).
- The view-options menu (per-user toggles).
- The card highlight chips (admin-flagged custom fields).

Adding a field once → it appears in form, table, view options, and (if flagged
in cardFields) the kanban card. Reorder once → everywhere updates. Hide once →
invisible everywhere for everyone (admin) or just one user (per-user toggle).

See `DYNAMIC_FIELDS_BLUEPRINT.md` for the full architecture summary.

### Per-entity views

| Entity | Path | Notes |
|---|---|---|
| Leads | `_entities/leads/views/LeadsView.tsx` | List + board. Single-click convert / double-click "with options". Mark-lost shortcut. First-time coachmarks. Highlight chips for admin-flagged custom fields. |
| Contacts | `_entities/contacts/views/ContactDetailView.tsx` | List + board (assignedTo). |
| Deals | `_entities/deals/views/DealDetailView.tsx` | Pipeline kanban with stage drag, won-confetti. |
| Companies | `_entities/companies/views/CompaniesView.tsx` | List + board (industry). CompanyDrawer with multi-assignee + multi-person picker. |

### Card system (`EntityCard`)

```
┌─────────────────────────────────────────────┐
│ ◎ Name                          [tag][tag]  │  identity + tags
│   email                                     │
├─────────────────────────────────────────────┤
│ AI: Short 1–2 line summary  ▾               │  aiSummary (optional)
├─────────────────────────────────────────────┤
│ [Budget: $1.5M]  [Property: Villa]          │  highlight chips (admin-flagged)
├─────────────────────────────────────────────┤
│ [P-001] ◎asgn        ⋮ [📎3] [+] [🗑]      │  code + assignee · menu + shortcuts
└─────────────────────────────────────────────┘
                                              ↑
                                grip (drag handle on right edge)
```

- Hand-designed slots: avatar/name/email (top-left), tags (top-right),
  personCode + assignee (bottom-left), menu + shortcuts (bottom-right).
- Drag handle is the vertical grip on the right edge — only that triggers
  drag, every other piece of the card behaves as expected (clicks, hovers).
- AI summary expands on click.
- Highlight chips render up to 3 admin-flagged custom fields with a
  bg-primary tint, formatted by kind (currency → USD, date → locale).
- Per-user `cardFields` from ViewOptionsMenu controls visibility of every
  toggleable piece — pinned slots ignore it.
- `displayName` toggle now correctly hides the name (was a bug pre-2026-05-15).

### First-time coachmarks (`<FirstTimeTour>`)

`components/ui/first-time-tour.tsx` — sequential overlay that points at DOM
elements tagged with `data-tour="…"`. Shows once per device (localStorage
under `flowbite:tours:seen`). Three steps live on the leads board:
single/double-click convert, drag-to-status, view-options. See AGENTS.md for
the usage rules.

### Forms (`EntityFieldForm`)

Round 5 redesign — production-grade density inspired by Linear / Attio /
Pipedrive:

- Section bands instead of `<details>` collapsibles: small-caps section
  header + hairline divider. Quieter, denser, more "premium".
- Tight spacing: `gap-2.5` between fields, `gap-1` between label + input,
  11px labels, h-9 inputs, subtle `text-destructive/60` required asterisk.
- Two-column auto-layout for short related fields (email + phone, value +
  assignee, industry + website). Detected by field kind/type.
- Tags + assignees + status / source always span full width.

Inputs come from `inputs/input-dispatcher`. The new MultiSelect (`components/
ui/multi-select.tsx`) drives every multi-pick: TagPicker, CompanyDrawer's
assignee + people pickers, ConvertLeadDrawer's lead picker. Pattern: trigger
shows summary text only (no chips), popover lists rows with left content +
right checkbox. `modal={true}` so it works inside the Sheet's focus trap
(which fixed the "can't select tags in form" bug).

### IdentityBadge

`core/entities/shared/components/IdentityBadge.tsx` — universal "this is a
record" component. Layouts: `code` (just the pill, primary-tinted), `row`
(avatar + name + subtitle), `stack` (avatar + name on row 1, subtitle on
row 2). Replaces PersonCodeBadge across the codebase (kept as deprecated
re-export). Pill colour is `bg-primary/10 text-primary border-primary/30`
so it stands out as a navigable identifier.

### Universal file storage

Round 5 update:

- Files attach only at **org-wide** (`scope="org"`) or **personCode**
  (`scope="person"`) level. No per-entity Files tab.
- Cross-entity attribution via `tags?: string[]` on the file row. Example:
  a contract uploaded "for deal D-001" lives at the personCode level with
  tags=`["deal:D-001"]`. The deal detail view (when wired) reads files via
  `files.queries.listByTag({ tag: "deal:D-001" })`.
- Org-level admin policy in **Settings → Workspace → File Policy**: pick
  allowed file categories (Image / PDF / Document / Spreadsheet / Video /
  Audio / Archive / Other) + max size MB. `core/files/file-categories.ts` is
  the single source of MIME mappings.
- **Create-mode uploads**: `useFileBuffer` hook + `<FileBufferProvider>`
  wraps the form drawer, `<CreateModeFileField>` is the buffered renderer
  used by the input dispatcher. Bytes upload to storage immediately; the
  `files` table row is recorded after entity creation by calling
  `fileBuffer.commitAll({scope, scopeId})`. AddLeadDrawer wires this with
  scope=`"person"`, scopeId=personCode.

### Stage-aware tables

Two new toolbar widgets:

- `<StageFilter>` — dropdown that scopes the deals table to a specific
  pipeline stage. Board view stays grouped by stage so the filter is
  list-only.
- `<SavedViewsMenu>` — per-user named column-set switcher. Persists to
  `users.preferences.savedViews[slot]` (schema + updatePreferences mutation
  extended in Round 5). Includes "Save current view…" and "Delete" actions.

### First-time coachmarks (`<FirstTimeTour>`)

Round 5 expansion: tours wired to leads board, contacts board, deals board,
companies board, AND the dashboard (highlights the QuickAdd + button). Per-
device localStorage gate per tour id. The grip + convert buttons no longer
show tooltips — the tour explains the gesture once.

## Pending

| Task | Priority | Notes |
|---|---|---|
| AI summary generator | MEDIUM | Card already shows `item.aiSummary` if present. Need the cron / on-update generator. **Deferred to AI phase.** |
| "Replay tutorials" button | LOW | Surface `resetAllTours()` in Appearance settings. |
| Card highlight admin picker | LOW | Today driven by cardFields. Later: dedicated "show on card" toggle in Fields manager. |
| Stage filter for non-deal entities | OPTIONAL | Only deals have stages today; contacts/leads use status. The current filter is deal-only by design. |

## Recent history

- 2026-05-15 — Round 5 redesign: production-grade form density, MultiSelect
  primitive (no pills, left-content + right-checkbox), IdentityBadge
  replaces PersonCodeBadge with primary-coloured pill, EntityCard supports
  company + deal slots with industry/value subtitles, avatar bug fixed,
  ConvertLeadDrawer rewritten as multi-select of unconverted leads,
  AddDealDrawer redesigned with empty-state CTA when no pipelines,
  CompanyDrawer redesigned, file upload system overhauled (org-wide +
  personCode-only scope, tag-based attribution, create-mode buffer,
  admin file-type policy), tooltips removed on tour-tagged buttons,
  FirstTimeTour expanded to dashboard + contacts + deals + companies,
  StageFilter + SavedViewsMenu shipped for table toolbars.
- 2026-05-15 — Round 4 polish: name-hide bug fixed, ModuleDisplay layout
  aligned to Settings style, ViewOptionsMenu strips protected fields,
  TagPicker switched to popover dropdown, PersonSelect resolves stubs, file
  field placeholder polished, EntityFieldForm switched to stacked layout,
  card highlight slot shipped, FirstTimeTour added.
- 2026-05-14 — Phases 0→9 of dynamic fields shipped. `useLeadColumns`,
  `FIELD_CATALOG`, `DEFAULT_LIST_COLUMNS`, `DEFAULT_CARD_FIELDS`,
  `BoardOptionsMenu`, `useCustomFields`, workspace `ModuleDisplaySection` all
  deleted. `useModuleDisplay` trimmed to `boardGroupBy` only.
- 2026-05-12 — Universal `ViewOptionsMenu`, dynamic board grouping across all
  slots, single-click instant convert, drag-and-drop status update, mark-lost
  shortcut.

## Architecture invariants

- All four entities render through the same scaffolds (EntityListPage,
  EntityFormDrawer, EntityCard). The toolbar chrome (`EntityPageLayout`,
  `ViewToggleIcons`, `EmptyState`, `ViewKind`) was lifted to
  `core/shell/shared/entity-layout/` on 2026-05-17 so Notes (and future
  shared views) reuse the exact same 40px toolbar. Import them via the
  barrel: `@/core/shell/shared/entity-layout`. `EntityListPage` +
  `EntityFormDrawer` stay here because they depend on entity-specific
  helpers (DataTable + Kanban entity-card rendering, dedup banner).
- View toggle uses nuqs (`?view=list|board`). Precedence: URL → workspace
  default → fallback constant.
- `fieldDefinitions` is the single source of metadata.
- All visible entity labels go through `useEntityLabels()` so renames flow
  through the UI live.
- RTL-safe classes (`me-*`/`ms-*`/`pe-*`/`ps-*`) and dynamic radius
  (`rounded-[var(--radius)]`) everywhere.
- One drag handle per card (right-edge grip). Every other interactive
  element is wrapped in an event-stop container so dnd-kit doesn't eat its
  click.

# Pipelines — State

> Updated: 2026-05-20 (Default stage + settings redesign + deals flow session)
> Status: ~98% Complete — backend done, settings UI redesigned (dropdown selector + Defaults tab), deals page redesigned (NavSlot tabs, dynamic form, mark-as-lost/done). Pending: AI tools (Phase 3), per-stage stale/final editor UI.

---

## ✅ Shipped — current

### Backend
- Schema: `pipelines.stages[]` carries required `code` (regex-validated), optional `staleAfterDays`/`warningAfterDays`, and the new `pipelines.stageTransitionPolicy` (block/warn/off, default "warn"). `fieldDefinitions.showInStages` is the per-field stage scope.
- Mutations: `pipelines.{create, update, addStage, updateStage, removeStage, reorderStages, setDefaultStage, deletePipeline}`. `fieldDefinitions.update` validates `showInStages` against the org's pipelines so admins can never persist references to non-existent stages. `deals.{create, update, moveToStage, changePipeline, closeAsDone, softDelete}`.
- Helpers: `deriveStageCode`, `validateStageCode`, `getRequiredFieldsForStage`, `pickMissingFields` in `convex/crm/fields/pipelines/helpers.ts`.
- Activity log: `moveToStage` distinguishes `"stage_changed"` from `"stage_changed_with_missing_fields"` and emits `missingFieldsCount`/`missingFieldNames`/`stageTransitionPolicy` in metadata when `policy === "warn"` and gaps exist.
- RBAC: `pipelines.{view,manage}`, `deals.{changeStage,changePipeline,viewValues}`. Owner/Admin defaults backfilled.
- Notifications: `deal_pipeline_changed`, `deal_stage_changed` (existing).
- Plan-limits SSOT: `convex/_platform/limits.ts`.
- Industry templates registry: `convex/crm/fields/templates/{registry.ts,definitions/*.ts}` (b2b-saas, freelancer, real-estate) + `setupWorkspaceFromTemplate`.
- Queries: `pipelines.{listByOrg, getDefault, getById}`, `deals.{list, listGroupedByStage, getById, getByDealCode, listByPersonCode, getMissingFieldsForStage}`.

### Frontend (settings)
- Top-level **Pipelines** settings group between Modules and CRM (`PipelinesGroup.tsx`). Lists every pipeline using `PipelineEditor`, with a "Create pipeline" input gated on `pipelines.manage`.
- **`PipelineEditor`** card layout (rebuilt this session):
  - Header — inline-editable pipeline name + default badge + plan-aware metadata + transition-policy picker (block/warn/off).
  - Stages list — drag-to-reorder, code field with regex validation, color picker, default badge on first non-final stage, dropdown actions ("Make this default" + "Remove stage").
  - **Stage fields section (NEW)** — pill-style stage tab strip + reused `SortableFieldsTable` editor scoped to the active stage. "All stages" tab manages fields with empty `showInStages`. Add field auto-pins to the active stage; edit dialog has a "Visible on stages" multi-select.
- **`StageFieldsTable.tsx`** + **`StageScopedEditFieldDialog.tsx`** — new components that wrap the existing `SortableFieldsTable` / `EditFieldDialog` primitives so the field-management UX is identical to lead/contact/company.
- **Modules → Deal Custom Fields** — replaced with a deep-link stub pointing to Pipelines (`SlotFieldsSection.tsx`). Lead/contact/company keep their own field editors (no pipelines).

### Frontend (deals views)
- Centralized hook family `usePipelines.ts` — single subscription per `(orgId)` shared across all consumers.
- Pipeline tabs above the deals kanban (pill row, persists active pipeline per device).
- Pipeline picker in the AddDealDrawer (hidden when org has only one pipeline).
- ChangePipelineDialog wired into the deal-detail header action menu.
- Block-policy error: when `MISSING_REQUIRED_FIELDS` fires from a kanban drag, the catch in `handleCardMove` extracts the structured error data and surfaces a rich toast naming the missing fields and target stage.

### Bug fixes shipped this week
- Kanban-empty-state: `EntityListPage` now reads `items` for both views, deals view derives `items` from the grouped query in board mode.
- 404-on-renamed-entity: `OrgProvider` derives `entityLabels` directly from `listMyOrgs.org.entityLabels` — no separate `getEntityLabels` subscription, no race.

---

## ⬜ Pending — ordered by leverage

| # | Task | Why it matters | Effort |
|---|---|---|---|
| 1 | In-deal **FillMissingFieldsDialog** — auto-opens on `MISSING_REQUIRED_FIELDS`, lets the user fill via `fieldValues.bulkSet`, then auto-retries `moveToStage`. Today we surface a toast only. | Block policy is unfriendly without an inline fill flow. | 1 day |
| 2 | **Warn-mode banner on the deal detail view** — amber pill at the top of the form when `policy === "warn"` AND the deal has missing-required at the current stage. | Visibility for managers without forcing a fill. | 0.5 days |
| 3 | **Per-stage advanced settings**: editor UI for `staleAfterDays`, `warningAfterDays`, `isFinal`/`finalType`. | Schema supports them; admins shouldn't need API access. | 0.5 days |
| 4 | **AI tool `move_deal_stage`** | Phase 3. Backend ready (logs `fromCode`/`toCode`/`pipelineId`). | 1 day |
| 5 | **AI tool `setup_workspace_from_template`** | Phase 3. Backend ready. | 1 day |
| 6 | **Pipeline templates picker UI** — "Create pipeline from template…" button next to the blank-create input. Consumes `convex/crm/fields/templates/registry.ts`. | Faster onboarding. | 0.5 days |
| 7 | **Drag-reorder pipelines themselves** | If an org has many pipelines a manual order beats alphabetical. | 0.5 days |
| 8 | **Stale-deal cron** firing `deal_stale` notifications | `staleAfterDays` is rendered on cards but no cron exists. | 0.5 days |
| 9 | **Tests for transition policy**: `block` blocks, `warn` succeeds + logs metadata, `off` no checks, policy-update RBAC. | Lock the contract before touching it again. | 0.5 days |
| 10 | Consolidate `convex/orgs/templates/pipelineStages.ts` with `convex/crm/fields/templates/registry.ts` | Two registries today, both seed pipelines. Pick one. | 0.5 days (paired with onboarding wizard rewrite) |

---

## Architecture notes (carry-forward — read these before touching code)

### Why the stage tab strip is a custom pill row, not shadcn `<TabsList>`
Matches the deal kanban's pipeline tabs above the board (locked decision: pill row, NOT shadcn TabsList). Consistency between settings and live views helps owners build a mental model. If shadcn Tabs gets richer features later we revisit, but the pill row is the contract today.

### Why no system stage-aware required fields
`seedFieldDefinitionsForOrg` provisions entity-column fields (title, value, dealCode, currentStageId, assignedTo) but **never sets `showInStages`** on any seeded row. Industry templates (real-estate, b2b-saas, freelancer) MAY seed `showInStages` on opt-in templates, but the user can edit them after onboarding. This makes the system industry-agnostic — Dubai real-estate's `ejari_no` only on Ejari, B2B SaaS's `signed_msa_url` only on Negotiation, Recruitment's `interview_panel` only on Interview — all driven by admins, none hardcoded.

### Why the transition policy is per-pipeline
Per-stage seemed appealing (3 modes × N stages = full control) but explodes UX complexity (decision fatigue) and rarely matches how owners think. Owners think about a workflow's strictness as a whole. Real-estate Ejari Registration = `block`. B2B SaaS pipeline = `warn`. Both can coexist for the same org. We can split policy to per-stage if a customer asks; the schema is shaped so a future migration would only touch the one field.

### Why `stage.id` is the foreign key, not `code`
Stage `id` is a stable nanoid. `code` is owner-typed and renamable. Deals reference `currentStageId` by id; activity log references stages by id; `showInStages` references stages by id. Codes appear in URLs, AI tool calls, and activity-log metadata as a `_code` pair (e.g., `toCode`, `fromCode`) so the human-readable handle is preserved without breaking the foreign key.

### Why `pipelines.update` exists (and lacks `entityType`)
`update` is a single mutation for top-level pipeline metadata (rename + transition policy). It deliberately does NOT accept `entityType` — that's set at create time and immutable. Stage edits go through their dedicated mutations (`addStage`, `updateStage`, `removeStage`, `reorderStages`, `setDefaultStage`) so code-uniqueness validation cannot be skipped.

### Why empty `showInStages` means "every stage"
Backwards-compatible default. A field created without specifying stages should appear everywhere. The hook `useEntityFields(slot, orgId, { currentStageId })` honors this rule: an empty/undefined `showInStages` always passes the filter. Setting `showInStages: ["stage_x"]` opts the field into a stage. Setting `showInStages: []` (empty array) is identical to undefined — the rule is "non-empty array means restricted to those stages, otherwise show everywhere".

### Why the stage-fields editor is in `PipelineEditor` not `PipelinesGroup`
Each pipeline has its own stages and its own field set; they don't make sense without each other. `PipelinesGroup` lists pipelines; `PipelineEditor` IS one pipeline's complete editor. Future pipelines may have very different field sets — keeping the editor scoped to a single pipeline avoids the "global deal fields" trap.

---

## File structure

```
convex/crm/fields/pipelines/
├── MODULE.md           — high-level spec
├── STATE.md            — this file
├── queries.ts          — listByOrg, getDefault, getById
├── mutations.ts        — create, update, addStage, updateStage, removeStage,
│                        reorderStages, setDefaultStage, deletePipeline
├── helpers.ts          — deriveStageCode, validateStageCode,
│                        getRequiredFieldsForStage, pickMissingFields,
│                        getDefaultStageId, validateStageTransition,
│                        seedFromTemplate (compat)
└── internal.ts         — internalMutation versions for AI/system

convex/crm/fields/fieldDefinitions/
├── mutations.ts        — create / update (incl. showInStages validation) /
│                        reorder / remove / ensureForOrg
├── queries.ts          — listByEntity / getById
└── internal.ts         — seed helper, cascade purge

convex/crm/entities/deals/
├── mutations.ts        — create / update / moveToStage (with policy enforcement) /
│                        changePipeline / closeAsDone / softDelete
└── queries.ts          — list, listGroupedByStage, getById, getByDealCode,
                          listByPersonCode, getMissingFieldsForStage

core/entities/_entities/deals/
├── hooks/usePipelines.ts                   — centralized hook family
├── components/ChangePipelineDialog.tsx     — header action: change pipeline mid-flight
└── views/DealDetailView.tsx                — DealsView (board) + DealDetailView (detail) +
                                              AddDealDrawer (with pipeline picker)

core/platform/settings/components/groups/
├── PipelinesGroup.tsx                      — top-level Pipelines settings group
├── crm/PipelineEditor.tsx                  — per-pipeline editor card (header,
│                                              stages list, stage fields tabs)
├── crm/StageFieldsTable.tsx                — per-stage scoped editor (NEW)
├── crm/StageScopedEditFieldDialog.tsx      — edit + multi-stage pin (NEW)
├── crm/SortableFieldsTable.tsx             — reused primitive
├── crm/CreateFieldDialog.tsx               — used by lead/contact/company
├── crm/EditFieldDialog.tsx                 — used by lead/contact/company
├── crm/FieldEditor.tsx                     — non-deal entity wrapper
└── modules/SlotFieldsSection.tsx           — Modules tab; deal slot deep-links to Pipelines
```

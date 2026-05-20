# PIPELINES — Architecture & Build State

> **File**: `CODE-ARCHITECTURE-PIPELINES-2026-05-20.md`
> **Last updated**: 2026-05-20 (end of stage-aware-fields + transition-policy session)
> **Status**: Backend ✅ COMPLETE · Frontend ✅ Stage-aware Field Editor + Transition Policy SHIPPED · Pending: in-deal "fill missing fields" dialog, AI tools (Phase 3), template picker UI
>
> Reading order for any future contributor:
> 1. This file (high-level architecture + current gaps).
> 2. `.github/agents/base/pipelines-plan.md` — locked decisions SSOT.
> 3. `convex/crm/fields/pipelines/STATE.md` — line-item shipped/pending list.
> 4. `convex/crm/fields/pipelines/MODULE.md` — per-mutation rules and avoids.

---

## 0. The 60-second model

A **pipeline** is an ordered set of named **stages** that a deal moves through. Pipelines are deals-only (locked decision §10 in `pipelines-plan.md`). Every pipeline has its own:

- ordered `stages` array (id, name, code, color, order, isFinal, finalType, staleAfterDays)
- `isDefault` flag (exactly one per `(orgId, entityType)`)
- `stageTransitionPolicy` ∈ `"block" | "warn" | "off"` — what happens when a deal moves to a stage and required fields are missing

A **stage-aware field** is a `fieldDefinitions` row whose `showInStages` array includes specific stage ids. Empty array means "show on every stage". Required + stage-aware = "must be filled before the deal moves into / out of this stage" (subject to the transition policy).

There are no system stage-aware fields. Owners decide everything. The system only seeds entity-column fields (`title`, `value`, `dealCode`, `currentStageId`, `assignedTo`) which are entity columns, never auto-pinned to any stage.

---

## 1. Architecture diagram

```
                       ┌─ stages list (drag, code, color, default, delete)
Settings → Pipelines ──┤
   │                   ├─ TRANSITION POLICY (block / warn / off) ← per-pipeline
   │                   │
   │                   └─ STAGE FIELDS section
   │                        ├─ stage tab strip (one tab per stage + "All stages")
   │                        └─ Active-stage editor — reuses SortableFieldsTable
   │                              • Add field auto-pins to the active stage
   │                              • Edit dialog has stage multi-select
   │                              • Reorder, hide, delete (existing primitives)
   │
   └─ /settings?group=pipelines is the only home for deal field management
                                                    │
                                                    ▼
              ┌──────────────────────────────────────────┐
              │  fieldDefinitions table                  │
              │    • entityType: "deal"                  │
              │    • showInStages: string[] (stage ids)  │
              │    • required: boolean                   │
              └──────────────────────────────────────────┘
                                                    │
                                                    ▼
                ┌────────────────────────────────────────────────────┐
                │  deals.moveToStage mutation                        │
                │    1. RBAC + rate limit                            │
                │    2. fetch pipeline (read policy)                 │
                │    3. if policy ≠ "off":                            │
                │         compute missingFields(deal, toStageId)      │
                │         if "block" + missing > 0 → throw            │
                │           ConvexError MISSING_REQUIRED_FIELDS       │
                │    4. patch deal                                    │
                │    5. logActivity:                                  │
                │         "stage_changed" or                          │
                │         "stage_changed_with_missing_fields" (warn)  │
                └────────────────────────────────────────────────────┘
```

---

## 2. Locked decisions (carry forward — do not reopen)

| # | Decision | Why it stays |
|---|---|---|
| L1 | Pipelines are deals-only. Leads use a flat `status` field. | Lifecycle vs. motion (`pipelines-plan.md` §10). |
| L2 | Stage `id` is immutable nanoid. `code` is owner-typed, renamable. `name` is a label. | Deal references survive renames. |
| L3 | `code` is required, regex `^[A-Z0-9_-]{2,16}$`, unique within one pipeline. | AI / WhatsApp / saved views need an unambiguous handle. |
| L4 | One `isDefault` pipeline per `(orgId, entityType)`. | Deal-create defaults need exactly one source of truth. |
| L5 | First non-final stage by `order` is the default starting stage. "Make this default" promotes any non-final stage to `order = 0`. | Single, predictable rule. |
| L6 | Stage-aware fields are deal-only. No `showInStages` semantics on lead/contact/company. | Pipelines own stage transitions; other entities don't move through stages. |
| L7 | No system stage-aware fields. The seeder never sets `showInStages`. Industry templates may, but the user can edit them after seeding. | Industry-agnostic; works for any vertical. |
| L8 | `stageTransitionPolicy` is per-pipeline (NOT per-stage). | Owners think about a workflow's strictness, not 12 individual decisions. |
| L9 | `WON` / `LOST` / `DONE` are auto-suggested final-stage codes (positive / negative / neutral). Overridable. | Smart defaults without lock-in. |
| L10 | Plan limits live in `convex/_platform/limits.ts`. Free 1 / Starter 3 / Pro 10 / Enterprise unlimited per `(org, entityType)`. | Single SSOT for billing. |

---

## 3. The transition-policy contract

Per-pipeline owner setting. Default `"warn"`.

| Mode | Server behaviour on `moveToStage` when required fields are missing | Owner picks when |
|---|---|---|
| `block` | Throws `ConvexError({ code: "MISSING_REQUIRED_FIELDS", missingFields, stageName, stageId })`. The deal does not move. Frontend shows a rich toast listing the missing fields; future enhancement opens an inline fill dialog. | Compliance-heavy stages (Ejari registration, signed contracts, regulatory checks). |
| `warn` (default) | Move succeeds. `activityLogs.action = "stage_changed_with_missing_fields"`. Metadata includes `missingFieldNames`, `missingFieldsCount`, `stageTransitionPolicy: "warn"`. Card / detail view will surface the warning (UI follow-up). | Fast-moving sales pipelines where managers want visibility but not friction. |
| `off` | No checks. Move always succeeds, no metadata. | Pipelines without field-level enforcement (e.g. exploratory funnels). |

`closeAsDone` is unaffected — it's a separate code path with its own outcome-reason flow.

---

## 4. Reusing the existing field editor

The Modules → Lead/Contact/Company tabs use `<FieldEditor>`. The Pipelines stage editor reuses the SAME primitives:

```
StageFieldsTable.tsx                      ← per-stage scoped wrapper
  ├─ Filters fieldDefinitions by showInStages
  ├─ Hosts CreateScopedFieldDialog        ← same FIELD_TYPES, same parseOptions
  │     • On submit: create() then update({ showInStages: [activeStageId] })
  │     • "everywhere" scope leaves showInStages empty
  └─ Hosts SortableFieldsTable             ← unchanged primitive (drag, hide, edit, delete)
        └─ on edit: opens StageScopedEditFieldDialog
              ├─ Same label / required / options edit
              └─ NEW: "Visible on stages" multi-select per stage
```

This guarantees the deal field editor experience is **identical** to the lead/contact/company editor — same buttons, same validation, same drag handle. Only difference: a stage-pinned context.

---

## 5. Where every piece lives

| Concern | File |
|---|---|
| Schema (incl. `stageTransitionPolicy`) | `convex/schema/crmFields.ts::pipelines` |
| Pipelines mutations (incl. `update`) | `convex/crm/fields/pipelines/mutations.ts` |
| Pipelines helpers (`deriveStageCode`, `getRequiredFieldsForStage`, `pickMissingFields`) | `convex/crm/fields/pipelines/helpers.ts` |
| Deals.moveToStage policy enforcement | `convex/crm/entities/deals/mutations.ts::moveToStage` |
| Deals.getMissingFieldsForStage | `convex/crm/entities/deals/queries.ts::getMissingFieldsForStage` |
| FieldDefinitions update (validates `showInStages` against pipelines) | `convex/crm/fields/fieldDefinitions/mutations.ts::update` |
| Permission catalog (`pipelines.manage`, `deals.changePipeline`, `deals.changeStage`) | `convex/_shared/permissions/catalog.ts` |
| Plan-limits SSOT | `convex/_platform/limits.ts` |
| Industry templates | `convex/crm/fields/templates/{registry.ts,definitions/*.ts}` |
| Template setup mutation | `convex/crm/fields/templates/mutations.ts::setupWorkspaceFromTemplate` |
| Centralized pipelines hook (frontend) | `core/entities/_entities/deals/hooks/usePipelines.ts` |
| PipelinesGroup (settings page entry) | `core/platform/settings/components/groups/PipelinesGroup.tsx` |
| PipelineEditor (per-pipeline card) | `core/platform/settings/components/groups/crm/PipelineEditor.tsx` |
| StageFieldsTable (the new per-stage editor) | `core/platform/settings/components/groups/crm/StageFieldsTable.tsx` |
| StageScopedEditFieldDialog (edit + multi-stage pin) | `core/platform/settings/components/groups/crm/StageScopedEditFieldDialog.tsx` |
| Pipeline tabs above the deals kanban | `core/entities/_entities/deals/views/DealDetailView.tsx::DealsView` |
| AddDealDrawer pipeline picker | `core/entities/_entities/deals/views/DealDetailView.tsx::AddDealDrawer` |
| ChangePipelineDialog | `core/entities/_entities/deals/components/ChangePipelineDialog.tsx` |
| Modules → Deal Custom Fields stub (deep-links to Pipelines) | `core/platform/settings/components/groups/modules/SlotFieldsSection.tsx` |

---

## 6. Pending — ordered by leverage

| # | Task | Where | Effort |
|---|---|---|---|
| 1 | **In-deal "fill missing fields" dialog**. When `MISSING_REQUIRED_FIELDS` fires from the kanban drag or change-pipeline action, open a dialog that uses `getMissingFieldsForStage` + `fieldValues.bulkSet`, then auto-retries `moveToStage`. Right now we surface a rich toast — full inline UX is a follow-up. | new component in `core/entities/_entities/deals/components/FillMissingFieldsDialog.tsx`; wire into `useMoveDealToStage` | 1 day |
| 2 | **Warn-mode banner on the deal detail view**. When `policy === "warn"` and the deal has missing-required fields at the current stage, show an amber pill at the top of the form with a list and a CTA to fill. | `DealDetailView` | 0.5 days |
| 3 | **Per-stage `staleAfterDays`, `warningAfterDays`, `isFinal`/`finalType` editor UI**. Schema supports them; the editor doesn't. Owners currently have to set these via the API. | `PipelineEditor.tsx::StageRow` advanced popover | 0.5 days |
| 4 | **AI tools** `move_deal_stage` and `setup_workspace_from_template`. Backend ready; needs Phase 3 wiring. | `convex/ai/tools/` | 1 day each |
| 5 | **Template picker UI**. "Create pipeline from template…" button next to the blank-create input. Consumes existing `convex/crm/fields/templates/registry.ts`. | `PipelinesGroup.tsx` | 0.5 days |
| 6 | **Drag-reorder pipelines themselves**. Today they're sorted alphabetically with default first. | `PipelinesGroup.tsx` | 0.5 days |
| 7 | **Stale-deal cron**. `staleAfterDays` is rendered on cards but no cron fires `deal_stale` notifications. | `convex/crons.ts` | 0.5 days |
| 8 | **Tests** for transition policy: `block` blocks; `warn` succeeds + logs metadata; `off` no checks; policy update RBAC. | `convex/crm-hardening.test.ts` | 0.5 days |

---

## 7. Avoids — read before touching pipeline / fields code

> Cross-reference `AGENTS.md` for the global avoids; these are pipeline-specific.

- ❌ **Never seed `showInStages` from the system seeder.** Industry templates may seed it (intentional — that's the template's job), but the lazy-seed `seedFieldDefinitionsForOrg` must not. If you find yourself adding a default mapping like "field X always required at stage Y", stop — the user said no.
- ❌ **Never hardcode `WON` / `LOST` as stage codes anywhere.** Use `stage.code === pipeline.stages.find(s => s.isFinal && s.finalType === "positive")?.code`. Owners can pick any code for final stages; the reserved suggestions are defaults, not invariants.
- ❌ **Never check stage transitions by `name`.** Use `id` (immutable foreign key) or `code` (owner-typed but unique within pipeline). Names are display-only.
- ❌ **Never add a per-stage policy field.** §L8 — per-pipeline only.
- ❌ **Never bypass `requireRole(member.permissions, "pipelines.manage")` on any pipeline mutation.** Including the new `update` mutation. The catalog drives RBAC; never inline a permission list.
- ❌ **Never use `useQuery(api.crm.fields.pipelines.queries.listByOrg)` directly in a component.** Use `useDealPipelines(orgId)` from `core/entities/_entities/deals/hooks/usePipelines.ts`. One subscription per org.
- ❌ **Never add `entityType: "deal"` fields via the Modules → Deal tab.** Custom Fields for deals live under Pipelines. The Modules → Deal tab now shows a deep-link stub — keep it that way.
- ❌ **Never mutate `pipelines.stages` outside the dedicated mutations** (`addStage`, `updateStage`, `removeStage`, `reorderStages`, `setDefaultStage`). Direct `ctx.db.patch({ stages })` skips code-uniqueness validation.
- ❌ **Never set `manualPagination: true` on the deal kanban or deals list.** Tan­Stack handles pagination client-side; manual mode silently breaks sort.
- ❌ **Never validate `code` client-side only.** The mutation's `validateStageCode` is the source of truth; client UI is best-effort.
- ❌ **Never change a stage `id` once issued.** Even on rename. The `id` is the foreign key in `deals.currentStageId`, `activityLogs.metadata.toStageId`, `fieldDefinitions.showInStages[]`.
- ❌ **Never let `stageTransitionPolicy` validation run AFTER `ctx.db.patch`.** The validation must be the gate; if it throws, no patch happens.

---

## 8. Migration history (so we don't migrate the same column twice)

| Date | Change | Migration |
|---|---|---|
| 2026-05-19 | Added required `code` to `pipelines.stages[]` | None — 0 pipelines existed in dev. Onboarding seeds + tests updated. |
| 2026-05-20 | Added optional `stageTransitionPolicy` to pipelines | None — optional field, defaults to `"warn"` at read time. |

If a future change touches existing rows, the rule from `AGENTS.md` applies: ship the migration in the SAME message as the schema change. No deferring.

---

## 9. How to verify in dev (manual smoke test)

1. **Settings → Pipelines** — verify each pipeline card shows: rename, default badge, transition-policy picker, stages list with drag/code, and a "Stage fields" tab strip.
2. **Click "All stages" tab** — should show fields whose `showInStages` is empty.
3. **Click a specific stage tab** — should show fields pinned there + "show on every stage" fields.
4. **Add field** — auto-pins to the active stage tab (visible on next reload of "All stages" filter).
5. **Edit field** → "Visible on stages" multi-select shows every stage of the pipeline; toggling pins / unpins.
6. **Mark a field required, set policy to `block`** → drag the deal to that stage on the kanban → toast shows the missing-field list, deal does not move.
7. **Switch policy to `warn`** → drag the deal → succeeds; check `activityLogs` for action `"stage_changed_with_missing_fields"`.
8. **Switch policy to `off`** → drag → succeeds, no warning, no metadata.

If any step doesn't behave as described, re-read §3 (transition policy contract) and check `convex/crm/entities/deals/mutations.ts::moveToStage`.

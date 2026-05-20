# Build Context — Current State

> OVERWRITE this file at end of every session. Never append.
> Last Updated: 2026-05-20 (late evening)

---

## Phase Status

| Phase | Status |
|---|---|
| 0 — Auth, RBAC, shell primitives | ✅ 100% Complete |
| 1 — Shell, sidebar, nav, onboarding, dashboard | ✅ 100% Complete |
| 2 Backend — all CRM tables, mutations, queries | ✅ 100% Complete |
| 2 Frontend — Slices 0–7 | ✅ 100% Complete |
| Pipelines — backend + multi-pipeline UI + per-stage field editor + transition policy | ✅ 100% Complete |
| 3 — AI Assistant + WhatsApp | ⬜ Next |

## Where to look first (in this order)

1. `AGENTS.md` (root) — global coding rules.
2. `CODE-ARCHITECTURE-PIPELINES-2026-05-20.md` — pipelines + stage-aware fields architecture (avoids, pending, file map).
3. `convex/crm/fields/pipelines/STATE.md` — line-item shipped/pending list for pipelines.
4. `.github/agents/base/pipelines-plan.md` — locked decisions SSOT.
5. `.github/agents/base/todos.md` — current task list.
6. `.github/agents/base/deep-plan.md` §15 (Pipelines), §16 (Dynamic Fields), §20 (Deals Module) — the original strategic decisions.

## Most recent work — 2026-05-20 evening (pipelines redesign + deals flow)

Complete pipeline settings + deals page redesign. All backend changes + migration shipped atomically.

**Backend:**
- Schema: added `isDefaultStage` to stage shape, `allowSkipStages` + `markDoneRequiresAllFields` to pipeline.
- `pipelines.create` auto-injects a Default stage at order 0. `addStage` never sets isDefaultStage. `removeStage` refuses to remove the Default stage. `reorderStages` keeps Default pinned to order 0. `setDefaultStage` is a deprecated no-op. `update` accepts the two new toggles.
- `deals.create` resolves to the Default stage automatically when no stageId provided.
- `deals.moveToStage` enforces allowSkipStages (one stage at a time forward when policy=block).
- `deals.closeAsDone` gates positive/neutral close on `markDoneRequiresAllFields` (default true).
- `deals.markAsLost` (NEW): confirmation gate via `deleteCodeConfirmation === dealCode`. Bypasses all-fields gate. From any stage.
- `deals.queries.listDealsMissingFieldsByPipeline` (NEW): batched per-pipeline missing-fields map for yellow-border indicator.
- Migration `_migrations/addDefaultStage.ts` ran on dev: 2 pipelines updated.

**Settings — Pipelines:**
- PipelinesGroup: single pipeline dropdown selector + single editor box. Persisted per device.
- PipelineEditor: "All stages" tab renamed "Defaults" mapped to the Default stage id. Three pipeline-level settings (policy / allowSkipStages / markDoneRequiresAllFields). StageRow: no "Make default" button, Default stage has disabled grip handle.
- StageFieldsTable: `defaults` scope kind added.

**Deals page:**
- Pipeline tabs injected into TopNav via `useNavSlot`. No more in-page tab strip row. "+ Pipeline" button removed.
- `flatDeals` scoped to active `pipelineId`.
- AddDealDrawer rebuilt with `EntityFieldForm`: Person picker only hardcoded, Default-stage fields render dynamically.
- EntityCard: `hasMissingRequiredFields` prop → yellow border (priority: red stale > yellow missing > amber warning > none).
- MarkAsLostDialog + MarkAsDoneDialog wired into deal-detail header action dropdown.

- **Stage-aware field editor** shipped at Settings → Pipelines → [pipeline]. Pill-style stage tab strip + reused `SortableFieldsTable` editor scoped to the active stage. Adding a field auto-pins it; edit dialog has a "Visible on stages" multi-select. Identical UX to the lead/contact/company editor.
- **Per-pipeline transition policy** — owners pick `block` (force fill) / `warn` (allow + flag) / `off` (no checks). Default `warn`. Enforced on `deals.moveToStage`. Activity log distinguishes warn-mode moves with missing fields.
- **Modules → Deal Custom Fields** removed and replaced with a deep-link stub. Deal fields live with their pipeline.
- Org plan upgraded to `enterprise` for multi-pipeline testing.
- 404-on-renamed-entity race + kanban-empty-state bug fixed (earlier in the day).

## Pipelines — pending (highest leverage first)

1. In-deal FillMissingFieldsDialog (auto-open on block-policy errors, fill + retry).
2. Warn-mode banner on the deal detail view.
3. Per-stage advanced settings UI (`staleAfterDays`, `isFinal` / `finalType`).
4. AI tools `move_deal_stage`, `create_deal`, `setup_workspace_from_template` (Phase 3).
5. Pipeline templates picker UI in `PipelinesGroup`.

Full list with effort + reasons: `convex/crm/fields/pipelines/STATE.md` and `CODE-ARCHITECTURE-PIPELINES-2026-05-20.md`.

## Verification before writing code

```bash
pnpm typecheck                              # 0 errors
pnpm exec biome check <touched files>       # 0 issues
pnpm test                                   # 113 pass (1 pre-existing unrelated failure)
pnpm build                                  # all 18 routes
pnpm guard:identity-subscriptions           # ✓ no leaks
```

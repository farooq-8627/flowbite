# Active Todos

> OVERWRITE this file — never append.
> Updated: 2026-05-20 (late evening — stage-aware fields editor + per-pipeline transition policy shipped)
> Status: Phase 2 ✅ · Pipelines (incl. stage-aware fields editor + transition policy) ✅ · Phase 3 AI is next

---

## ✅ Just shipped (2026-05-20 late evening) — Stage-aware fields editor

**The big one.** Settings → Pipelines → [pipeline] is now a complete per-pipeline editor:

- Inline-editable pipeline name + default badge.
- **Per-pipeline transition policy** picker — `block` (force fill before stage change) / `warn` (allow + log + flag) / `off` (no checks). Default `warn`. Stored on `pipelines.stageTransitionPolicy`.
- Stages list — drag-reorder, code field with regex validation, color picker, "Make this default", remove stage.
- **Stage fields section** — pill-style stage tab strip (one tab per stage + an "All stages" tab) with a reused `SortableFieldsTable` editor scoped to the active stage. Add field auto-pins to the active stage; edit dialog has a "Visible on stages" multi-select.

Backend honors the policy on `deals.moveToStage`:
- `block` + missing required fields → throws structured `MISSING_REQUIRED_FIELDS` ConvexError (caught in the kanban drag handler with a rich toast).
- `warn` + missing required fields → succeeds, logs `stage_changed_with_missing_fields` activity with `missingFieldsCount` / `missingFieldNames` / `stageTransitionPolicy` metadata.
- `off` → no checks at all.

New backend pieces:
- `pipelines.stageTransitionPolicy` schema field + `pipelines.update` mutation (rename + policy in one call).
- `getRequiredFieldsForStage` + `pickMissingFields` helpers in `convex/crm/fields/pipelines/helpers.ts`.
- `deals.queries.getMissingFieldsForStage` for the upcoming fill dialog.

New frontend pieces:
- `core/platform/settings/components/groups/crm/StageFieldsTable.tsx`
- `core/platform/settings/components/groups/crm/StageScopedEditFieldDialog.tsx`
- Modules → Deal Custom Fields tab now deep-links to Pipelines (no duplicate editor).

Files modified:
- `convex/schema/crmFields.ts`, `convex/crm/fields/pipelines/{helpers,mutations}.ts`, `convex/crm/entities/deals/{mutations,queries}.ts`
- `core/platform/settings/components/groups/crm/PipelineEditor.tsx` (rebuilt), `core/platform/settings/components/groups/modules/SlotFieldsSection.tsx`
- `core/entities/_entities/deals/views/DealDetailView.tsx` (rich error handling for `MISSING_REQUIRED_FIELDS`)

Verified: `pnpm typecheck` 0 errors · `pnpm exec biome check` 0 issues on touched files · `pnpm test` 113 pass (1 pre-existing unrelated failure) · `pnpm build` all 18 routes generated · `pnpm guard:identity-subscriptions` clean.

Org plan upgraded to `enterprise` via `_migrations/setOrgPlan:run` so multi-pipeline UI can be tested.

Architecture documented in `CODE-ARCHITECTURE-PIPELINES-2026-05-20.md` (rewritten — 204 lines, focused on architecture + avoids + pending). Pipelines line-item state in `convex/crm/fields/pipelines/STATE.md`.

---

## Pipelines — what's still pending (full list in `convex/crm/fields/pipelines/STATE.md`)

| # | Task | Priority | Effort |
|---|---|---|---|
| 1 | In-deal **FillMissingFieldsDialog** — auto-opens on `MISSING_REQUIRED_FIELDS`, lets the user fill via `fieldValues.bulkSet`, then auto-retries `moveToStage`. Today we surface a rich toast only. | High | 1 day |
| 2 | Warn-mode banner on the deal detail view — amber pill + missing-field list + CTA. | Medium | 0.5 days |
| 3 | Per-stage advanced settings UI: `staleAfterDays`, `warningAfterDays`, `isFinal`/`finalType`. Schema supports them; the editor doesn't. | Medium | 0.5 days |
| 4 | Pipeline templates picker UI — "Create from template…" button consuming the existing `convex/crm/fields/templates/registry.ts`. | Medium | 0.5 days |
| 5 | Drag-reorder pipelines themselves. | Low | 0.5 days |
| 6 | Stale-deal cron firing `deal_stale` notifications. | Low | 0.5 days |
| 7 | Tests for the transition policy: `block` blocks, `warn` succeeds + logs metadata, `off` no checks, policy-update RBAC. | High | 0.5 days |
| 8 | Consolidate `convex/orgs/templates/pipelineStages.ts` with `convex/crm/fields/templates/registry.ts`. | Low | 0.5 days |

---

## Phase 3 — AI Assistant (full plan in PHASE-3-NEXT.md)

| # | Task | Priority |
|---|---|---|
| 1 | `convex/ai/systemPrompt.ts` — 3-layer prompt builder. The pipelines section of the prompt should include each pipeline's stages with `{ code, name, staleAfterDays }` so the model emits codes deterministically. | HIGH |
| 2 | `convex/ai/toolRegistry.ts` — role → tool mapping. | HIGH |
| 3 | `convex/ai/tools/move_deal_stage` (uses `deals.moveToStage`, args `dealCode` + `stageCode`). Disambiguates by deal's pipeline. | HIGH |
| 4 | `convex/ai/tools/create_deal` (uses `deals.create`, args include `pipelineCode` resolved at runtime). | HIGH |
| 5 | `convex/ai/tools/setup_workspace_from_template` (uses existing `setupWorkspaceFromTemplate`). | HIGH |
| 6 | `convex/ai/internal.ts::rebuildEntityContext` — fill in body. | HIGH |
| 7 | `app/api/ai/chat/route.ts` — streaming proxy. | HIGH |
| 8 | `core/ai/components/` — ChatSheet, ChatMessage, ChatToolCall, ChatConfirmation. | HIGH |
| 9 | `core/ai/hooks/useAIChat.ts` + `useRouteContext.ts`. | HIGH |
| 10 | `app/api/channels/whatsapp/route.ts` — 360dialog webhook. | MEDIUM |
| 11 | `trigger/whatsapp/voiceProcessor.ts` — Whisper → Claude → fieldValues. | MEDIUM |

---

## Production hardening (before public launch)

| # | Task | Effort |
|---|---|---|
| 1 | Email send (Resend helper + invitation + password reset templates) | 1.5 days |
| 2 | Soft-delete recovery (`undelete` mutations for every entity) | 1 day |
| 3 | GDPR: user data export + delete cascade | 2 days |
| 4 | Billing (Stripe/LemonSqueezy webhook + checkout + plan gating) | 3 days |
| 5 | Security headers in `next.config.ts` (CSP, HSTS, X-Frame-Options) | 0.5 days |
| 6 | `activityLogs` archive cron (rows > 90 days old) | 0.5 days |
| 7 | Onboarding wizard: rewrite to call `setupWorkspaceFromTemplate` (registry) instead of `updateOrgIndustry` (legacy seed) | 0.5 days |
| 8 | Wire plan-limit checks on members.invite, fieldDefinitions.create, files.record (currently only on pipelines.create) | 1 day |

---

## Pre-existing issues (out of scope, flagged here for next pass)

| # | Issue | Severity |
|---|---|---|
| 1 | ~50 biome formatting issues in unrelated files (consolidatePersonConversations.ts, messages/MessagesSidebar.tsx, etc.). Not blocking — just stale. | Medium |
| 2 | `messages.send` test asserts `conversation.entityType === "lead"` but receives `"person"` post-`consolidatePersonConversations` migration. Test-only, not a runtime bug. | Low |

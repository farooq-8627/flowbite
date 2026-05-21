# Build Context — Current State

> OVERWRITE this file at end of every session. Never append.
> Last Updated: 2026-05-21 (invite-flow fix: ErrorBoundary now passes through Next.js navigation signals; accept marks onboardingCompleted)

---

## 2026-05-21 — Invite-flow fix: invited users no longer hit "Something went wrong"

A user reported that accepting an invitation succeeded server-side (the
inviter saw the invitee in their member list, role=admin) but the
redirected dashboard showed the generic error fallback. Two atomic fixes
shipped together; one user (webstor.official@gmail.com) was already in the
broken state and needed a backfill.

**Root cause:**
After accept, `JoinOrgPage` does `router.push("/${invitation.orgSlug}")`.
Brand-new invited users still have `users.onboardingCompleted: false`
(seeded by `convex/auth.ts`). The dashboard layout chain mounts
`<OnboardingGuard>` *inside* a user-defined `<ErrorBoundary>` and the
guard's `redirect("/onboarding")` throws Next.js's internal `NEXT_REDIRECT`
error. The boundary's `getDerivedStateFromError` had no filter and treated
that internal signal as a real crash, so the user saw `<DashboardError>`
("Something went wrong") instead of the navigation. Even the destination
would have been wrong UX — the wizard prompts you to create a new
workspace, but invited users are joining an existing one.

**Fix:**

| File | Change |
|---|---|
| `components/ErrorBoundary.tsx` | Imports `unstable_rethrow` from `next/navigation`; calls it in BOTH `getDerivedStateFromError` (matches Next.js's own `error-boundary.js` pattern — re-throws router errors before updating state) and `componentDidCatch` (belt-and-suspenders for wrapped errors with `cause` chains). The boundary is now a no-op for `redirect()`, `notFound()`, `permanentRedirect()`, and bailout-to-CSR signals. |
| `convex/invitations/mutations.ts` | `accept` patches `users.onboardingCompleted = true` in BOTH the new-member branch AND the alreadyMember-early-return branch. Idempotent. |
| `convex/_migrations/markOnboardedFromMembership.ts` | NEW. One-shot internal mutation that flips `onboardingCompleted: true` for any user with at least one active `orgMembers` row. Idempotent. Ran on dev: 1 user repaired. |
| `convex/invitations.test.ts` | Added regression test "flips onboardingCompleted=true on accept" (19/19 invitation tests pass). |

**Locked rule (added to project mental model):**
Any user-defined React `<ErrorBoundary>` mounted inside the App Router tree
MUST pass `unstable_rethrow(error)` through `getDerivedStateFromError` (and
ideally `componentDidCatch` too) so Next.js's `redirect()` / `notFound()`
control-flow throws aren't caught as crashes. Reference implementation:
`components/ErrorBoundary.tsx`.

**Verified:** `pnpm typecheck` 0 errors · `pnpm exec biome check` on the
3 modified/created files 0 issues · `pnpm test` 116 pass / 1 pre-existing
unrelated failure · `pnpm build` all 18 routes · migration idempotency
confirmed on dev.

---

## 2026-05-21 — Website-link 404 fix + project-wide URL safety + pretty 404/error UI

A user reported `NEXT_HTTP_ERROR_FALLBACK;404` after clicking a company's
Website link. Investigation found a 3-symptom bug, all fixed atomically:

**Symptom 1 — relative-URL navigation:**
Three renderers (`EntityOverview` company hovercard, `cell-dispatcher` `kind:"url"`,
`FieldValueRenderer` `kind:"link"`) were emitting `<a href={value} target="_blank">`
straight from a user-entered string. When the value lacked a scheme
(`reimaginy.com`), the browser treated it as a relative URL → routed to
`/en/{org}/reimaginy.com` inside the app instead of opening the external site.

**Symptom 2 — bad slug → notFound() → no 404 page:**
The fake-internal route matched `[orgSlug]/[entitySlug]/page.tsx`, `EntitySlugView`
couldn't resolve the slug, called `notFound()`. The project had no `not-found.tsx`
anywhere, so Next.js's default fallback threw `NEXT_HTTP_ERROR_FALLBACK;404`.

**Symptom 3 — error UI was a debug surface:**
`DashboardError` had been swapped out earlier in the session for a "show raw error"
version (to diagnose a different issue). The user wanted the pretty production UI back.

**Fix:**

| File | Change |
|---|---|
| `lib/url.ts` | NEW. `normalizeExternalUrl()` + `displayUrlLabel()`. Prepends `https://` when missing, rejects `javascript:` / `data:` / `vbscript:` / `file:` / `about:`, validates via `new URL()`. |
| `core/entities/shared/components/EntityOverview.tsx` | Company hovercard "Website" row goes through `normalizeExternalUrl`. Falls back to plain text if invalid. |
| `core/entities/shared/components/cells/cell-dispatcher.tsx` | `kind:"url"` cell renderer normalizes. |
| `core/entities/shared/components/FieldValueRenderer.tsx` | `kind:"link"` field-value renderer normalizes. |
| `core/entities/_entities/companies/views/CompaniesView.tsx` | Company detail "Details" card website is now also a clickable link via `normalizeExternalUrl` (was plain text). |
| `components/errors/DashboardError.tsx` | Restored the production-grade UI (calm icon, headline, recovery actions; raw stack tucked into a collapsed `<details>`). |
| `components/errors/DashboardNotFound.tsx` | NEW. Friendly 404 component (compass icon, headline, `usePathname` chip, "Go to dashboard" / "Go back" actions). |
| `app/[locale]/not-found.tsx` | NEW. Universal locale-root fallback. |
| `app/[locale]/(private)/[orgSlug]/not-found.tsx` | NEW. Segment-scoped — renders inside the dashboard shell so sidebar + topnav stay visible when `notFound()` fires. |
| `app/[locale]/(private)/error.tsx` | JSDoc updated — error boundary should never see 404 digests now; if it does, that means a `not-found.tsx` is missing somewhere in the route tree. |

**Locked rule (added to project mental model):**
Any `<a href={…} target="_blank">` rendering a user-entered URL MUST go through
`normalizeExternalUrl`. If it returns `null`, render plain text. Never emit a
relative `<a>` to user-entered text — it will navigate inside the app, hit a
404 fallback, and surface in the error boundary.

**Verified:** `pnpm typecheck` 0 errors · `pnpm exec biome check` on all 10
touched files 0 issues · `pnpm build` all 18 routes (incl. `/_not-found`).

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

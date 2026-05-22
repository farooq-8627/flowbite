# Onboarding Module — State

> Updated: 2026-05-21
> Status: **80% Complete** — 3-step wizard working. Errors via toasts. Product tour plan documented. Missing: pipeline seeding, resume from step.

---

## ✅ Completed

| Component | File | Notes |
|---|---|---|
| OnboardingPage | `core/onboarding/components/OnboardingPage.tsx` | 3-step wizard: Workspace → Industry → Complete |
| WorkspaceStep | inline in OnboardingPage | createOrg mutation, slug availability check, toast on error |
| IndustryStep | inline in OnboardingPage | updateOrgIndustry mutation, industry + team size selection, toast on error |
| CompleteStep | inline in OnboardingPage | markOnboardingComplete mutation, redirect to /${slug}/dashboard, toast on error |
| Toast error handling | `lib/toast.ts` | All mutations use toast.mutationError() — no inline error state |
| Product tour plan | `core/onboarding/MODULE.md` | Onborda library documented with integration steps, tour steps, state tracking |

---

## ⬜ Pending

| Task | Priority | Notes |
|---|---|---|
| Resume from last step | MEDIUM | Read org.onboardingStep on mount |
| Guard: redirect completed users away from /onboarding | LOW | Currently no guard |
| Product tour (post-onboarding) | LOW | See MODULE.md for full plan using onborda library |
| Sub-niche picker (Step 2b) | HIGH | Phase 3A — show sub-niche cards when industry = real-estate or b2b-saas |

---

## Architecture Notes

### Route
- `/onboarding` → `OnboardingPage` (single page, no sub-routes)
- Post-completion redirect: `/${slug}` (real slug from `markOnboardingComplete` return value)

### Seeding
- Industry selection calls `orgs.mutations.updateOrgIndustry` → `internal.crm.fields.templates.mutations.setupWorkspaceFromTemplate`
- Seeds 17 surfaces atomically: pipelines, fields, entity labels, note categories, tags, saved views, custom roles, AI persona, code prefixes, currency, timezone, modules, reminder defaults, follow-up defaults, file-upload policy
- Idempotent — safe to re-run with same template
- Phase 3A adds `seedMockEntities()` as surface #18 (2–3 deletable sample records)

### Error Handling
- All mutation errors use `toast.mutationError(err, fallback)` from `lib/toast.ts`
- No inline `useState<string | null>` error state in any step

### Border Radius
- All `rounded-lg`, `rounded-md` replaced with `rounded-[var(--radius)]`
- Team size pills use `rounded-full` (intentional — pill shape)

### Product Tour (Onborda)
- Library: `onborda` (https://github.com/uixmat/onborda)
- Triggers after first dashboard visit (checks `users.dismissedCards`)
- Key: `"product_tour_v1"` in `users.dismissedCards[]`
- Full plan in `core/onboarding/MODULE.md`


## 2026-05-21 — Invite-flow fix: invited users no longer hit "Something went wrong"

A user reported that accepting an invitation succeeded server-side (the
admin saw the invitee in their org) but the redirected dashboard showed the
generic error fallback. Two atomic fixes shipped together:

### Root cause

After accept, `JoinOrgPage` does `router.push("/${invitation.orgSlug}")`.
Brand-new invited users still have `users.onboardingCompleted: false`
(seeded by `convex/auth.ts`). The dashboard layout chain mounts
`<OnboardingGuard>` *inside* a user-defined `<ErrorBoundary>` and the
guard's `redirect("/onboarding")` throws Next.js's internal `NEXT_REDIRECT`
error. The boundary's `getDerivedStateFromError` had no filter and treated
that internal signal as a real crash, so the user saw `<DashboardError>`
("Something went wrong") instead of the navigation to `/onboarding` (and
even that destination would have been wrong UX — the wizard prompts you to
create a new workspace, but invited users are joining an existing one).

### Fix

| File | Change |
|---|---|
| `components/ErrorBoundary.tsx` | Imports `unstable_rethrow` from `next/navigation`; calls it in BOTH `getDerivedStateFromError` (matches Next.js's own `error-boundary.js` pattern — re-throws router errors before updating state) and `componentDidCatch` (belt-and-suspenders for wrapped errors with `cause` chains). Now the boundary is a no-op for `redirect()`, `notFound()`, `permanentRedirect()`, and bailout-to-CSR signals. |
| `convex/invitations/mutations.ts` | `accept` patches `users.onboardingCompleted = true` in BOTH the new-member branch AND the alreadyMember-early-return branch. Idempotent. The invited user joins an existing org; the workspace-creation wizard is irrelevant to them. |
| `convex/_migrations/markOnboardedFromMembership.ts` | NEW. One-shot internal mutation that flips `onboardingCompleted: true` for any user with at least one active `orgMembers` row. Returns `{ scanned, patched, skippedNoMembership, skippedAlreadyComplete }`. Idempotent. Ran on dev: 1 user (webstor.official@gmail.com) repaired. |
| `convex/invitations.test.ts` | Added regression test "flips onboardingCompleted=true on accept". |

**Locked rule (added to project mental model):**
Any user-defined React `<ErrorBoundary>` mounted inside the App Router tree
MUST pass `unstable_rethrow(error)` through `getDerivedStateFromError` (and
ideally `componentDidCatch` too) so Next.js's `redirect()`/`notFound()`
control-flow throws aren't caught as crashes.

**Verified:** `pnpm typecheck` 0 errors · `pnpm exec biome check` on the
3 modified/created files 0 issues · `pnpm test invitations` 19/19 ·
`pnpm build` 18/18 routes · migration ran on dev (idempotency confirmed).

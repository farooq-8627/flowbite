# Onboarding Module — State

> Updated: 2026-05-07
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
| Seed default pipeline on industry selection | HIGH | Pipeline seeding mutations not built |
| Resume from last step | MEDIUM | Read org.onboardingStep on mount |
| Guard: redirect completed users away from /onboarding | LOW | Currently no guard |
| Product tour (post-onboarding) | LOW | See MODULE.md for full plan using onborda library |

---

## Architecture Notes

### Route
- `/onboarding` → `OnboardingPage` (single page, no sub-routes)
- Post-completion redirect: `/${slug}/dashboard` (real slug from `markOnboardingComplete` return value)

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

# core/auth — MODULE.md

> Scan this file before writing any auth code. All decisions are final unless explicitly revised.

## Structure

```
core/auth/
  MODULE.md                        ← this file
  layouts/
    AuthShellLayout.tsx            ← shared v2 split-screen (left=form, right=branded panel)
  components/
    SignInPage.tsx                  ← login form + OAuth (Google, GitHub)
    SignUpPage.tsx                  ← register form + OAuth + join-existing-org toggle
```

## Decisions (from deep-plan.md Module 13 + session decisions)

| # | Decision | Outcome |
|---|---|---|
| A1 | Login page design | Use next-shadcn-admin-dashboard **Login v2 and Register v2** designs. Split-screen: left=form, right=branded panel. |
| A2 | Post-login redirect | Login → has org + onboardingCompleted? → `/dashboard/[lastVisitedSlug]`. No org or incomplete → `/onboarding`. Last-visited stored in cookie. No multi-org picker screen. |
| A3 | Remember me | "Remember me for 30 days" checkbox on login page. |
| A4 | Magic link | Skip for now. Can add later. |
| A5 | Account deletion | Soft-delete only. 30-day recovery window. Same email login after deletion → show recovery screen. After 30 days → platform_owner hard-deletes. |
| A6 | Auth methods | Google OAuth + GitHub OAuth + Email/Password. All via Convex Auth (`useAuthActions`). |
| A7 | Session management | 30-day refresh token, 1h access token, monthly hard re-auth. Handled by Convex Auth. |
| A8 | Join existing org | Toggle on signup page shows orgId input. "Request to Join" button disabled (coming soon). Flow: user enters orgId → mutation sends confirmation to org admin → admin approves → user gets roleId. Wire when RBAC invitations are ready. |
| A9 | Right panel is prop-driven | `AuthShellPanelProps` — each page passes its own panel content. Right side changes per page without touching the layout. |
| A10 | No hardcoded app strings | All app name/description/URL come from `APP_CONFIG`. Never hardcode "Orbitly" in JSX. |
| A11 | RTL-safe classes | All classes use logical properties (`ms-*`, `pe-*`, `start-*`, `border-e`). `dir="rtl"` on `<html>` for Arabic. |
| A12 | Border-radius | All `rounded-*` use `rounded-[--radius]`. Never `rounded-md`, `rounded-lg`, etc. |

## Post-Login Redirect Flow

```
User logs in
  → Has any org?
    → NO → /onboarding
    → YES → onboardingCompleted?
              → NO → /onboarding
              → YES → /dashboard/[lastVisitedSlug] (from cookie)
                       fallback: /dashboard/[defaultOrg.slug]
```

## Account Deletion Flow (pending — Phase 9)

```
User requests deletion (Settings → Danger Zone)
  → Confirm → soft-delete: user.deletedAt = now(), user.status = "deleted"
  → User logged out. All org memberships suspended.
  → For 30 days: login with same email → recovery screen
  → After 30 days: platform_owner hard-deletes
```

## Routing

| Route | Component | Notes |
|---|---|---|
| `/signin` | `app/[locale]/(auth)/signin/page.tsx` → `SignInPage` | Thin wrapper |
| `/signup` | `app/[locale]/(auth)/signup/page.tsx` → `SignUpPage` | Thin wrapper |

## What's NOT here

- Auth guards (pending — `app/[locale]/(private)/layout.tsx`)
- Convex auth config (`convex/auth.ts`)
- Session management (ConvexAuthProvider in root layout)
- Join-org mutation (pending — `convex/invitations/mutations.ts requestToJoin`)

# Auth Module — State

> Updated: 2026-05-07
> Status: **95% Complete** — All auth flows built. Email verification, password reset, join-org all done.

---

## ✅ Completed

| Component | File | Notes |
|---|---|---|
| SignInPage | `core/auth/components/SignInPage.tsx` | Email/password + Google/GitHub OAuth. toast.authError(). Forgot password link. |
| SignUpPage | `core/auth/components/SignUpPage.tsx` | Email/password + OAuth. Password mismatch check. toast.authError() |
| ForgotPasswordPage | `core/auth/components/ForgotPasswordPage.tsx` | Sends OTP via Convex Auth flow: "reset". Redirects to /reset-password?email=... |
| ResetPasswordPage | `core/auth/components/ResetPasswordPage.tsx` | OTP + new password. Convex Auth flow: "reset-verification". Resend button. |
| VerifyEmailPage | `core/auth/components/VerifyEmailPage.tsx` | OTP email verification. Convex Auth flow: "email-verification" + "resend-verification". |
| JoinOrgPage | `core/auth/components/JoinOrgPage.tsx` | Accept invitation by token. Shows org name, role, email. Handles expired/accepted/invalid. |
| AuthShellLayout | `core/auth/layouts/AuthShellLayout.tsx` | Split-screen layout. Panel uses rounded-[calc(var(--radius)*3)] |
| Toast error mapping | `lib/toast.ts` | authError() maps Convex codes → human-readable messages |
| Middleware auth guard | `middleware.ts` | Unauthenticated → /signin globally via convexAuthNextjsMiddleware |

---

## Routes

| Route | Component | Notes |
|---|---|---|
| `/signin` | `SignInPage` | Email/password + OAuth |
| `/signup` | `SignUpPage` | Email/password + OAuth |
| `/forgot-password` | `ForgotPasswordPage` | Enter email → sends OTP |
| `/reset-password?email=...` | `ResetPasswordPage` | Enter OTP + new password |
| `/verify-email?email=...` | `VerifyEmailPage` | Enter OTP to verify email |
| `/join` | `JoinPage` (inline) | Enter invite token manually |
| `/join/[token]` | `JoinOrgPage` | Accept invitation by token |

---

## ⬜ Pending

| Task | Priority | Notes |
|---|---|---|
| Wire email verification into SignUp flow | MEDIUM | After signup, redirect to /verify-email?email=... if Convex Auth requires it |
| OAuth error handling | LOW | Currently shows generic toast — could be more specific |

---

## Architecture Notes

### Error Handling Strategy
- All auth errors go through `toast.authError(err)` from `lib/toast.ts`
- No inline error state in auth components
- Error code mapping: `InvalidAccountId`, `InvalidSecret`, `AccountAlreadyExists`, `OAuthAccountNotLinked`

### Convex Auth Flows Used
- `signIn("password", { flow: "signIn", email, password })` — sign in
- `signIn("password", { flow: "signUp", email, password })` — sign up
- `signIn("password", { flow: "email-verification", email, code })` — verify email OTP
- `signIn("password", { flow: "resend-verification", email })` — resend verification OTP
- `signIn("password", { flow: "reset", email })` — send password reset OTP
- `signIn("password", { flow: "reset-verification", email, code, newPassword })` — complete reset

### Join-Org Flow
- `/join` → enter token → `/join/[token]`
- `/join/[token]` → `invitations.queries.getByToken` (public, no auth) → show details
- Accept → `invitations.mutations.accept({ token })` → redirect to `/${orgSlug}/dashboard`
- Handles: not found, expired, already accepted, email mismatch

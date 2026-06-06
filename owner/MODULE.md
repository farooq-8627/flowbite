# `owner/` — Platform Owner Panel

> **Phase**: separate sprint · **Status**: Stages 0–7 SHIPPED 2026-05-27 (full panel, including Stage 1 OTP step)
> **Read order**: this MODULE.md → `app/xowner/layout.tsx` → `convex/_platform/ownerAuth.ts`. (The original `PLATFORM-OWNER-PANEL.md` spec doc was deleted on 2026-05-27 once every stage shipped — Tier B/C deferrals now live in `Future-Enhancements.md §B.31`.)

A super-admin-only control surface mounted at a hidden, env-configured URL prefix.

## Hard scope (locked 2026-05-27)

- Platform-wide ONLY. Owner panel never reads org-scoped customer content (leads, contacts, deals, notes, messages, files, AI conversations).
- To inspect inside an org, the operator joins the org as a regular member.
- English-only (no i18n) — locked decision L9.
- Excluded from PostHog + Sentry — locked decision L10.

## URL strategy

- Public URL: `/${OWNER_PANEL_SLUG}/<section>` — operator chooses the slug; never randomised by code.
- Internal route: `app/xowner/<section>/page.tsx` (literal `xowner` segment — never linked to in any UI).
- `proxy.ts` rewrites the public URL to the internal path. Direct hits on `/xowner` always 404.
- If `OWNER_PANEL_SLUG` is unset, the panel is fully disabled.

## Layered gate

Five independent layers (one bug in any layer is not enough):

1. **Slug match** — `proxy.ts::classifyOwnerRequest`.
2. **Authenticated** — outer `app/xowner/layout.tsx` calls `convexAuthNextjsToken()`. No token → 404.
3. **Email allow-list + super-admin role** — outer layout calls `api._platform.auth.queries.getOwnerProfile`. Throws if `users.platformRole !== "super_admin"` OR email not in `PLATFORM_OWNER_EMAILS`.
4. **OTP step** — `app/xowner/(gated)/layout.tsx` reads `owner_otp_verified` cookie; HMAC-verifies it against `OWNER_OTP_COOKIE_SECRET`; cross-checks userId + `expiresAt`; redirects to `app/xowner/auth/page.tsx` (which lives OUTSIDE the gated group) on any failure.
5. **Convex mutations/queries** — every `_platform/*` handler begins with `await requirePlatformOwner(ctx)`. Defence-in-depth even if the layout is bypassed.

## Folder layout

```
owner/                                   ← THIS folder (sibling of app/, core/, convex/)
├── MODULE.md                            ← (you are here)
├── components/
│   ├── OwnerProvider.tsx                ← React context exposing { profile }
│   ├── OwnerSidebar.tsx                 ← left rail with 8 nav items
│   ├── OwnerTopNav.tsx                  ← header — section title + owner identity
│   ├── OwnerShell.tsx                   ← composes sidebar + topnav + scroll region
│   └── OwnerSettingsCard.tsx            ← card frame + "Coming soon" body for placeholder views
├── hooks/
│   └── useOwnerAccess.ts                ← reads is_owner_panel=1 cookie (client side)
├── lib/
│   ├── ownerSlug.ts                     ← server-only OWNER_PANEL_SLUG reader
│   ├── ownerNav.ts                      ← static 8-item nav config
│   └── owner-paths.ts                   ← typed `/xowner/<section>` builder
└── views/
    ├── overview/OverviewView.tsx
    ├── users/UsersListView.tsx
    ├── tiers/TiersView.tsx
    ├── billing/BillingSettingsView.tsx
    ├── flags/FeatureFlagsView.tsx
    ├── ai-context/AIContextView.tsx
    ├── audit/AuditLogView.tsx
    └── settings/OwnerSettingsView.tsx
```

`app/xowner/<section>/page.tsx` files are thin wrappers (`<View />`) — compliant with `AGENTS.md` "RULE: `app/` contains thin wrappers only".

## Decisions log

| # | Decision | Outcome |
|---|---|---|
| 1 | Owner panel mounted at `/xowner` literally; public URL rewritten by middleware. | Avoids the `[locale]` vs `[ownerSlug]` route collision. |
| 2 | Owner-panel layout is its OWN root layout (own html/body, own ConvexAuthNextjsServerProvider, own ConvexClientProvider). | Skips next-intl, theme cookies, fonts, PostHog — all of which the panel doesn't need. |
| 3 | Slug is server-only (`OWNER_PANEL_SLUG`), never read in client components. | Slug doesn't ship in JS bundle. Client telemetry filters use the cookie instead. |
| 4 | `is_owner_panel=1` cookie is set by middleware on every owner-panel rewrite (httpOnly: false, sameSite: lax, maxAge: 1h). | PostHog + Sentry browser configs read the cookie to drop owner-panel events without bundling the slug. |
| 5 | `requirePlatformOwner(ctx)` wraps `requireSuperAdmin` + env email allow-list. Fails closed if env unset. | An attacker who escalates `users.platformRole` in the DB still cannot enter the panel without redeploying the env. |
| 6 | Stage 1 (email OTP) is deferred to a follow-up session. | Schema migration + email send action + cron — material risk; better to ship in its own focused change. |
| 7 | Sidebar/topnav are minimal Tailwind components — NOT wrapping the org-aware `<Sidebar>` primitive. | Owner panel has no orgId, no member list, no AI panel, no preference store. The wrapper would import org-context coupling that breaks outside `[locale]`. |
| 8 | Owner shell mounts a minimal `sonner` Toaster (NOT the project's `components/ui/sonner.tsx` wrapper which depends on `next-themes`). | Lets owner-panel mutations show toast feedback without forcing the panel to wire up a theme provider. |
| 9 | Tier limits stored in a `platformTiers` DB table from Stage 4 onward. The sync `getPlanLimits(tier)` returns the in-code constants (back-compat for 7 existing call sites); a new async `getPlanLimitsFromDb(ctx, tier)` reads the table with the constants as a fallback. | Existing consumers don't need to change shape. New consumers honour owner-panel edits immediately. |
| 10 | `updateTier` and `setFlagEnabled` auto-create their row on first edit. | Operators don't have to remember to run the seed migration before the editor works. |
| 11 | Every owner-panel mutation follows the same 4-step pattern: `requirePlatformOwner` → `enforceRateLimit("owner.write")` → read-modify-write with `before` snapshot → `logPlatformAction`. The audit row is append-only. | Defence-in-depth + immutable trail for every change. Mirrors `logActivity()` shape but writes to a separate table because the panel has no `orgId`. |
| 12 | Per-org override editing in `FeatureFlagsView` requires pasting the orgId. A richer org picker is deferred. | Locked decision L7 says "no org list" — adding a search surface here would require breaking that scope. Operators are typically a small group with Convex dashboard access; copy/paste is fine for v1. |
| 13 | Billing settings is read-only in v1 — surfaces `{ key, present }` for each provider env var (NEVER values). Editing happens in the Convex dashboard. | Tier B feature; full editor is deferred per locked decision L11. |
| 14 | Stage 7 (`OwnerSettingsView`) ships profile + Active OTP sessions + Recent logins all wired to live data. | Stage 1 OTP shipped in the same session, so the previously-deferred placeholders are now real. |
| 15 | Internal route segment renamed `app/__owner` → `app/xowner` (2026-05-27). | Next.js excludes any `_`-prefixed folder from routing as a "private folder" — the original literal silently 404'd in production builds. The new segment is non-private and still hidden behind the operator slug. |
| 16 | Stage 1 OTP table layered as **outer layout (auth + role) → `(gated)/layout.tsx` (OTP cookie + shell)**. The auth route lives OUTSIDE the route group. | Without this split, the layout would redirect-loop on its own `/auth` page. |
| 17 | OTP cookie format: `v1.<userId>.<expiresAt>.<HMAC-SHA-256(secret, "v1.<userId>.<expiresAt>")>`. Web Crypto so the helper runs in any Next runtime (Node + Edge). | Stateless verification (no DB roundtrip on every page hit); cookie + OTP credential expire together; rotating `OWNER_OTP_COOKIE_SECRET` invalidates every active OTP session immediately. |
| 18 | OTP code stored as `sha256(salt + ":" + code)` per-row; constant-time compare on verify; previous unconsumed rows for the same user invalidated when a new code is issued. | DB-leak resistant + replay-resistant. Stops a stolen mailbox from racing to use an older code after a fresh request. |

## How to run / how to access

1. Set `OWNER_PANEL_SLUG` in your environment (Vercel / `.env.local`). Recommend ≥24 random characters.
2. Set `PLATFORM_OWNER_EMAILS` to a comma-separated list of allowed email addresses.
3. Set `OWNER_OTP_COOKIE_SECRET` to a long random string (`openssl rand -hex 32`). The cookie is invalidated every time this secret rotates.
4. `npx convex env set RESEND_API_KEY "re_xxx"` and `RESEND_FROM_EMAIL "Owner <no-reply@yourdomain.com>"` so OTP emails actually send (otherwise the row is created but the email send soft-fails — read the code from `npx convex logs` or `npx convex run`).
5. Run the existing `convex/_migrations/2026_05_23_setSuperAdmin.ts:run` (or its successor) to flip your user's `platformRole = "super_admin"`.
6. Visit `https://<your-app>/<OWNER_PANEL_SLUG>` while signed in with one of the allow-listed emails. You'll be redirected to `<slug>/auth` to enter the 6-digit OTP code from your inbox; on success you're taken to the overview.

If anything is wrong (missing env, wrong email, missing role, missing OTP cookie), every public surface returns a generic 404 / 4xx — the panel never confirms its own existence to non-owners.

## Cross-references

- `convex/_platform/MODULE.md` — Convex side of the panel (auth helper, future tier table, audit log).
- `AGENTS.md` — locked decisions + non-negotiable rules.
- `proxy.ts` — slug rewrite, direct-`xowner` block, cookie write.

# Build Context — Current State

> OVERWRITE this file at end of every session. Never append.
> Last Updated: 2026-05-22

---

## Status Summary

| Phase | Status |
|---|---|
| 0 — Auth, RBAC, shell primitives | ✅ Complete |
| 1 — Shell, sidebar, nav, onboarding, dashboard | ✅ Complete |
| 2 — All CRM tables + full frontend slices 0–7 | ✅ Complete |
| Pipelines — multi-pipeline, stage-aware fields, transition policy | ✅ Complete |
| 3A — Industry polish, mock data, sub-niche picker | ✅ Complete |
| 3B — AI Assistant | ⬜ Next |
| 3C — WhatsApp / voice | ⬜ After 3B |

---

## Phase 3A — What Was Built (2026-05-22)

### Schema additions
- `orgs.settings.dashboardMetrics` (ordered widget rank list)
- `orgs.settings.softDeleteRetentionDays` (per-org trash retention)
- `orgs.settings.mockDataSeededAt`, `mockDataDismissedAt`, `deletionScheduledAt`
- LemonSqueezy billing fields on `orgs` + 2 new indexes
- `excludeFromAI: v.optional(v.boolean())` on all 4 CRM entities + notes + reminders

### Templates (9 registered in registry)
| id | File | Status |
|---|---|---|
| `real-estate-dubai` | `dubai_real_estate.ts` | ✅ Full mock data |
| `real-estate-global` | `real_estate.ts` | ✅ Full mock data |
| `real-estate-saudi` | `real_estate_saudi.ts` | ✅ NEW — full mock data |
| `b2b-saas` | `b2b_saas.ts` | ✅ Full mock data |
| `freelancer` | `freelancer.ts` | ✅ REBUILT — lean solo |
| `agency-freelance` | `agency_freelance.ts` | ✅ Full mock data |
| `recruiting` | `recruiting.ts` | ✅ Full mock data incl. all candidate fields |
| `productivity` | `productivity.ts` | ✅ NEW — tasks/ideas, company hidden |
| `generic` | `generic.ts` | ✅ Full mock data |

Registry aliases: `dubai-real-estate→real-estate-dubai`, `real-estate→real-estate-global`, sub-niches (solo/student/side-project → productivity).

### Seeder
- `convex/crm/fields/templates/mockSeeder.ts` — NEW, fully wired
- `setupWorkspaceFromTemplate` calls `seedMockEntities()` after structural seed
- Idempotent: skips if `mockDataSeededAt` set or any leads/deals exist
- Every record: `source:"template_seed"`, `excludeFromAI:true`

### Mutations added to `convex/orgs/mutations.ts`
- `clearMockData` — hard-deletes all `source:"template_seed"` records
- `dismissMockDataBanner`

### Migrations
- `convex/_migrations/2026_05_22_renameRealEstateTemplateIds.ts`
- `convex/_migrations/2026_05_22_addOrgSettingsDashboardAndTrash.ts`

### UI defaults
- `theme_preset` default changed from `"tangerine"` → `"soft-pop"` in `lib/preferences/preferences-config.ts`

### Auth fix
- Root cause of `/en → /signin` loop: `JWKS` + `JWT_PRIVATE_KEY` missing on Convex deployment
- Fix: run `npx @convex-dev/auth` — generates keys; set `SITE_URL=http://localhost:3000` on Convex
- Code was always correct; pure environment config issue

---

## What's NOT Yet Done (Phase 3B next)

| Item | Status | Note |
|---|---|---|
| AI assistant (tools, chat, streaming) | ❌ Stub | `convex/ai/internal.ts` = 30-line no-op |
| WhatsApp / voice | ❌ | Phase 3C — after 3B |
| "Delete sample data" button | ❌ | `clearMockData` mutation exists; button missing in `WorkspaceTemplateSection.tsx` |
| `activityLogs` archive cron | ❌ | No cron; only `purge-old-trash` + `recompute-org-stats` exist |

## Confirmed Complete (scanned 2026-05-22)

- Email (Resend): `lib/email.ts` — `renderInvitationEmail` + `renderPasswordResetEmail` both exist and wired
- Trash UI: `convex/trash/queries.ts` + `mutations.ts`, `DataGroup.tsx` `TrashSection`, daily `purge-old-trash` cron ✅
- GDPR: `convex/gdpr/actions.ts` (fflate zip + signed URL), delete dialog in `DataGroup.tsx` ✅
- LemonSqueezy: webhook in `convex/http.ts`, `billing/internal.ts` event handlers, `billing/actions.ts` checkout, `BillingGroup.tsx` upgrade UI ✅
- Security headers: `next.config.ts` — CSP, HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy ✅
- `entityVisibility` in sidebar: `app-sidebar.tsx` lines 68–98 filter hidden modules ✅
- Switch template UI: `WorkspaceTemplateSection.tsx` with confirm dialog ✅

---

## Where to Look

1. `AGENTS.md` (root) — global coding rules
2. `.github/agents/base/todos.md` — active task list
3. `.github/agents/base/checklist.md` — phase checklists
4. `PHASE-3-PLAN.md` — §5 (3B spec), §6 (3C spec), §9 (production gap list)

## Verification Commands

```bash
pnpm typecheck                      # 0 errors
pnpm exec biome check <files>       # 0 issues
pnpm test                           # 116+ passing
pnpm build                          # all 18 routes
```

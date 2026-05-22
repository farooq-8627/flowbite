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
| 3A — Industry polish, mock data, sub-niche picker | ⬜ Next |
| 3B — AI Assistant | ⬜ After 3A |
| 3C — WhatsApp / voice | ⬜ After 3B |

## Completed in Last Session (2026-05-22)

- Pre-Phase-3A frontend fixes (tasks 2, 3, 5, 6, 7): Mark-Won/Lost in deal header, confetti on positive-final stage drops, MarkAsLostDialog, Unauthorized + Maintenance pages + forbidden segment, dashboard widgets gated by `org.settings.dashboardMetrics`, RecentActivity mini-card on profile Overview.
- Invite-flow fix: accepted invitees no longer hit error boundary. `ErrorBoundary` now calls `unstable_rethrow()`. Invitation `accept` mutation flips `onboardingCompleted=true`. Migration `markOnboardedFromMembership.ts` ran on dev.
- Website-link 404 fix: `lib/url.ts` with `normalizeExternalUrl()`, all 3 URL renderers updated, not-found pages added at all levels, `DashboardError` restored to production UI.

## Phase 3A Blocker Noted

Template seeder needs to copy `template.dashboardMetrics → org.settings.dashboardMetrics`. The field is on `platformTemplates` schema but not on `orgs.settings` schema — Phase 3A will add it.

## Where to look

1. `AGENTS.md` (root) — global coding rules.
2. `.github/agents/base/todos.md` — active task list.
3. `.github/agents/base/checklist.md` — phase checklists.

## Verification Commands

```bash
pnpm typecheck                      # 0 errors
pnpm exec biome check <files>       # 0 issues
pnpm test                           # 116+ passing
pnpm build                          # all 18 routes
pnpm guard:identity-subscriptions   # no leaks
```

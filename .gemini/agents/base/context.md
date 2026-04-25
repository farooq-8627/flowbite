# Build Context — Current State

> OVERWRITE this file at end of every session. Never create a new context file.
> Keep this file SHORT. No session history. No architecture explanations. Those live in PLAN.md.
> Last Updated: 2026-04-26 | Session 3 COMPLETE — Architecture cleanup done.

---

## Current Phase: 1 — Shell (PENDING — Next up)

**Phase 0: ✅ COMPLETE**
- Auth (Password, GitHub, Google), full RBAC (102 tests), invitations module ✅
- All 8 production quality gaps resolved ✅
- `pnpm typecheck` 0 errors | `pnpm test` 102 passing | `pnpm build` 0 errors ✅
- Architecture setup (MODULE.md, theme presets, preferences library, Zustand store) ✅
- All docs + folder structure cleaned and synced ✅

**Architecture (final):**
- `core/` — 11 modules (shell, entities, ai, settings, csv-import, kanban, datatable, timelines, notifications, onboarding, command-palette) — NEVER plan-gated
- `features/` — 5 modules (ai-automation, client-portal, integrations, industry-templates, project-management) — CAN be plan-gated
- `convex/ai/` — AI tools centralized, role-filtered before Claude call
- Two timelines: Unified (RBAC audit log) + Activity Chat (people + AI on-behalf)
- Entity scaffolds: 4 shared scaffolds for all 6 entity types

---

## What's Next (Phase 1 — in build order)

1. **BACKFIX**: Update `PLAN_FEATURES` in `constants.ts` (CRM plan features) — needed before any Phase 2 mutations
2. **SHELL-01**: `core/shell/config/navigation.ts` — single source of truth for nav
3. **SHELL-02**: `app/[locale]/dashboard/layout.tsx` — auth guard
4. **SHELL-03**: `app/[locale]/dashboard/[orgSlug]/layout.tsx` — org resolver
5. **SHELL-04–09**: DashboardLayout, AppSidebar, TopNav, NotificationBell, WorkspaceSwitcher, ModuleGuard
6. **ONBOARD-01–03**: 3-step onboarding wizard (org name → industry → complete)
7. **SHELL-11**: Quick Win Dashboard page (metric cards + Get Started card)
8. **SHELL-12**: Auth redirect → onboarding if not completed

Full todo list with IDs: `todos.md`
Full build checklist: `checklist.md`
Module rules: `core/shell/MODULE.md`

---

## Known Issues

| Issue | Status |
|---|---|
| `pnpm lint-check` fails — `biome lint --check .` invalid for Biome v2 | pending fix |
| Auth redirect (`P0-AUTH-REDIRECT`) blocked on shell being built | blocked → Phase 1 |
| Pre-existing next-intl TS error in `.next/dev/types/validator.ts` | not our code |

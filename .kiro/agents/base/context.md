# Build Context — Current State

> OVERWRITE this file at end of every session. Never create a new context file.
> Keep this file SHORT. No session history. No architecture explanations. Those live in PLAN.md.
> Last Updated: 2026-04-27 | Strategy V2 finalized. Phase 0 COMPLETE. Phase 1 Shell = NEXT.

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

## Strategy V2 Decisions (Locked 2026-04-27)

> These decisions are final. Do not revisit unless explicitly requested.

| Decision | Locked Value |
|---|---|
| First industry | Dubai Real Estate |
| Pipeline stages on | **Deals ONLY** (not leads). Leads have simple status: new/qualified/converted. |
| Architecture | Hybrid: Structured DB (EAV) + AI input layer (WhatsApp voice → auto-fill fieldValues) |
| WhatsApp phase | Phase 3 — ships WITH AI, not Phase 5 |
| WhatsApp provider | 360dialog (Gulf BSP). Apply for UAE number NOW — takes 1–2 weeks. |
| Voice transcription | OpenAI Whisper API (best Arabic + code-switching accuracy) |
| Schema additions (Phase 2) | `aiContext` on leads/contacts/deals. `quickCode` on leads/contacts. `showInStages` on fieldDefinitions. `entityDocuments` new table. |
| Stage-aware fields | Approach B — backend. Convex query filters `fieldDefinitions` by `showInStages` before returning to client. |
| RBAC | Dynamic — `orgMembers.roleId` references `orgRoles` table (not hardcoded string). Refactor in Phase 1. |
| Export layer | Agent-facing output layer (NOT platform export). Ejari PDF, property summary, CSV of any filtered view. Phase 2+. |
| Industry templates | Base is generic. Industry-specific fieldDefs + pipeline stages seeded via config files in `features/industry-templates/`. First: Dubai RE. |

---

## What's Next (Phase 1 — in build order)

1. **IMMEDIATE**: Apply for WhatsApp Business API via 360dialog (do this today — 1–2 week approval)
2. **BACKFIX**: Update `PLAN_FEATURES` in `constants.ts` (CRM plan features) — needed before any Phase 2 mutations
3. **SHELL-01**: `core/shell/config/navigation.ts` — single source of truth for nav
4. **SHELL-02**: `app/[locale]/dashboard/layout.tsx` — auth guard
5. **SHELL-03**: `app/[locale]/dashboard/[orgSlug]/layout.tsx` — org resolver
6. **SHELL-04–09**: DashboardLayout, AppSidebar, TopNav, NotificationBell, WorkspaceSwitcher, ModuleGuard
7. **ONBOARD-01–03**: 3-step onboarding wizard (org name → industry → complete). Industry picker seeds Dubai RE as default option.
8. **SHELL-11**: Quick Win Dashboard page (metric cards + Get Started card)
9. **SHELL-12**: Auth redirect → onboarding if not completed
10. **RBAC-REFACTOR-01–10**: Dynamic roles (`orgRoles` table, `roleId` on `orgMembers`)

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

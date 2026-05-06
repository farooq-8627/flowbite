# Build Checklists

> Phase gates only. Module-specific acceptance criteria live in each module's MODULE.md.
> Format: `[x]` = done, `[ ]` = pending, `[-]` = in progress
> **Phase 0 is COMPLETE. Phase 1 is NEXT.**

---

## Phase 0 — Foundation ✅ COMPLETE

Auth (Password + GitHub + Google) · Full RBAC (102 tests) · Invitations · 16 shadcn components · PostHog + Sentry · PermissionGate · features/_registry.ts · Theme presets · Preferences library · Zustand store · All MODULE.md files.

Remaining before Phase 1:
- [-] Fix `pnpm lint-check` — `biome lint --check .` invalid for Biome v2
- [ ] Auth redirect: authenticated user → org dashboard (blocked on shell)

---

## Phase 1 — Shell + Onboarding

> **Gate: v0.1 — Demo-ready.** → `core/shell/MODULE.md` | `core/onboarding/MODULE.md`

### RBAC Refactor (do first — unblocks everything)
- [ ] `orgRoles` table in `convex/schema.ts`
- [ ] `convex/orgRoles/` queries + mutations
- [ ] Seed 3 default roles on org creation (Owner, Admin, Member)
- [ ] `orgMembers.role` (string) → `orgMembers.roleId` (FK to orgRoles)
- [ ] Refactor `requireRole()` → `requirePermission()` using DB lookup
- [ ] Update `invitations/mutations.ts` — accept uses `roleId`
- [ ] Update `useOrgPermission` hook — load from DB
- [ ] Update all 102 tests

### Shell
- [ ] `core/shell/config/navigation.ts`
- [ ] `app/[locale]/(private)/layout.tsx` — auth guard
- [ ] `app/[locale]/(private)/dashboard/layout.tsx` — onboarding guard
- [ ] `app/[locale]/(private)/dashboard/[orgSlug]/layout.tsx` — org resolver
- [ ] `core/shell/layouts/DashboardLayout.tsx`
- [ ] `core/shell/components/AppSidebar.tsx`
- [ ] `core/shell/components/TopNav.tsx` + `UserMenu.tsx`
- [ ] `core/shell/components/NotificationBell.tsx`
- [ ] `core/shell/components/WorkspaceSwitcher.tsx`
- [ ] `core/shell/components/ModuleGuard.tsx` + `useModuleEnabled.ts`
- [ ] `core/shell/hooks/useViewToggle.ts`

### Onboarding
- [ ] `app/[locale]/(private)/onboarding/` route + layout
- [ ] Step 1: Org name + slug + role title
- [ ] Step 2: Industry picker → seeds pipeline from `platformTemplates`
- [ ] Step 3: Complete → `onboardingCompleted = true` → dashboard

### Dashboard Home
- [ ] `app/[locale]/(private)/dashboard/[orgSlug]/page.tsx`
- [ ] Get Started card (dismissible per-user)
- [ ] `app/[locale]/(public)/pricing/page.tsx` (ISR)

### ✅ Phase 1 Gate
- [ ] `pnpm typecheck` 0 errors | `pnpm build` 0 errors | `pnpm test` 102+ passing
- [ ] Sign up → onboarding (3 steps) → dashboard with Get Started card
- [ ] Unauthenticated → `/dashboard/*` redirects to `/signin`
- [ ] Invite flow: owner invites member → member accepts → sees workspace
- [ ] Arabic `<html dir="rtl">` switches layout correctly

---

## Phase 2 — CRM Core

> **Gate: v1.0 — First paying product.** → `core/entities/MODULE.md` | `core/kanban/MODULE.md` | `core/datatable/MODULE.md` | `core/csv-import/MODULE.md`

### Backend (do first)
- [ ] `convex/crm/fields/pipelines/` queries + mutations
- [ ] `convex/crm/fields/fieldDefinitions/` + `fieldValues/` queries + mutations
- [ ] `convex/crm/fields/dedup/helpers.ts`
- [ ] `convex/crm/leads/` queries + mutations (personCode generated here)
- [ ] `convex/crm/contacts/` queries + mutations
- [ ] `convex/crm/companies/` queries + mutations
- [ ] `convex/crm/deals/` queries + mutations
- [ ] `convex/crm/notes/` + `reminders/` + `tags/` + `savedViews/`
- [ ] `convex/crm/entityCodeCounters/` + `orbitLinks/`
- [ ] Schema: `aiContext` on leads/contacts/deals, `personCode` indexes, `showInStages` on fieldDefinitions

### Infrastructure
- [ ] Install `@dnd-kit/core` + `@dnd-kit/sortable` + `@tanstack/react-table`
- [ ] `core/kanban/` — KanbanBoard, KanbanColumn, KanbanCard
- [ ] `core/datatable/` — DataTable, DataTableToolbar, DataTableBulkBar
- [ ] `core/entities/scaffolds/` — EntityListPage, EntityDetailPage, EntityFormDialog, EntityCard

### CRM UI
- [ ] `core/entities/shared/` — DynamicFieldRenderer, TagPicker, AssigneeSelect, DedupBanner
- [ ] `core/entities/leads/` — types, hooks, components
- [ ] `core/entities/contacts/` — same pattern
- [ ] `core/entities/companies/` — list-only
- [ ] `core/entities/deals/` — kanban primary
- [ ] `core/timelines/` — UnifiedTimeline + ActivityChat
- [ ] `core/settings/pages/` — all settings pages
- [ ] `core/csv-import/` — ImportWizard
- [ ] `trigger/imports/processCSVImport.ts`
- [ ] `app/api/billing/` — LemonSqueezy webhook + checkout

### ✅ Phase 2 Gate
- [ ] `pnpm typecheck` 0 errors | `pnpm build` 0 errors | `pnpm test` 130+ passing
- [ ] Full CRM flow: lead → contact → deal → Won (confetti fires)
- [ ] Deal kanban: drag card → stageEnteredAt updated
- [ ] LemonSqueezy checkout → plan upgrades → features unlock
- [ ] CSV import (5 rows) → records visible in list
- [ ] Viewer role: cannot edit (UI gate + mutation rejection both verified)
- [ ] Mobile 390px: lead list, deal kanban, contact detail render correctly
- [ ] Cross-org isolation: org A member cannot query org B data

---

## Phase 3 — AI Assistant + WhatsApp

> **Gate: v2.0 — "Stop navigating your CRM. Just talk to it."** → `core/ai/MODULE.md`

- [ ] `convex/ai/processChat.ts` — internalAction, "use node"
- [ ] `convex/ai/systemPrompt.ts` — 3-layer prompt builder
- [ ] `convex/ai/toolRegistry.ts` — role → tool mapping
- [ ] `convex/ai/tools/` — 11 core tools
- [ ] `app/api/ai/chat/route.ts` — thin streaming proxy
- [ ] `core/ai/` — ChatSheet, ChatMessage, ChatToolCall, ChatConfirmation
- [ ] `app/api/channels/whatsapp/route.ts` — 360dialog webhook
- [ ] `trigger/whatsapp/voiceProcessor.ts` — Whisper → Claude → fieldValues
- [ ] Dubai RE template seeded in `platformTemplates`
- [ ] 95-day rent alert cron (Trigger.dev)

### ✅ Phase 3 Gate
- [ ] `pnpm typecheck` 0 errors | `pnpm build` 0 errors | `pnpm test` 160+ passing
- [ ] "Show me my top deals" → deal cards in AI panel
- [ ] "Create a lead for Sarah at Acme" → lead created with personCode
- [ ] Viewer: read-only tools only — no destructive actions available
- [ ] WhatsApp voice note → CRM updates in real time → visible on kanban
- [ ] First token < 2 seconds streaming latency

---

## Phases 4–9 — Future

| Phase | Name | Gate | MODULE.md |
|---|---|---|---|
| 4 | Communications | 15 clients | `features/` |
| 5 | External Channels | 25 clients | `features/integrations/` |
| 6 | Integration Bridges | 35 clients | `features/integrations/MODULE.md` |
| 7 | AI Automation | 40 clients | `features/ai-automation/MODULE.md` |
| 8 | Project Management | Enterprise | `features/project-management/MODULE.md` |
| 9 | Client Portal | Enterprise | `features/client-portal/MODULE.md` |

---

## Gulf Track (parallel through all phases)

- [ ] Phase 1: `dir="rtl"` on Arabic `<html>`, `messages/ar.json` bootstrapped
- [ ] Phase 2: RTL-safe inputs + kanban, Gulf phone validation
- [ ] Phase 3: AI responds in Arabic when `locale=ar`. 95-day rent alert.
- [ ] Phase 5: PDPL compliance (Saudi data regulation)

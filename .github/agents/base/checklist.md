# Build Checklists

> Updated: 2026-05-19
> Phase 0, 1, 2 are COMPLETE. Phase 3 is next.

---

## Phase 0 — Foundation ✅ COMPLETE

Auth (Password + GitHub + Google) · Full RBAC · Invitations · shadcn components · PostHog + Sentry · PermissionGate · Theme presets · Preferences · Zustand store.

---

## Phase 1 — Shell + Onboarding ✅ COMPLETE

Shell layout · Sidebar · TopNav · WorkspaceSwitcher · OnboardingGuard · 3-step wizard · Dashboard home · Notifications · Feature flags · Record codes.

---

## Phase 2 — CRM Core ✅ COMPLETE

**Backend**: 28 tables, all mutations canonical pattern, rate limits, RBAC SSOT, all indexes.

**Frontend**:
- [x] Slice 0: DataTable, KanbanBoard, EntityListPage, EntityDetailPage, EntityCard
- [x] Slice 1: Leads, Contacts, Deals, Companies list/board views
- [x] Slice 2: Profile detail (unified lead+contact, personCode URL)
- [x] Slice 3: Company detail
- [x] Slice 4: Deal detail + kanban drag-drop
- [x] Slice 5a: Messages (thread, sidebar, composer, voice, lightbox)
- [x] Slice 5b: Notes (category kanban, drag-drop)
- [x] Slice 5c: Calendar (month/week/day/list, create from grid)
- [x] Slice 5d: Reminders (DataTable, Today/Calendar/List modes, widgets)
- [x] Slice 5e: Follow-ups (org-wide cadence view + panel built)
- [x] Slice 5f: Timeline (person + entity + org-wide)
- [x] Slice 6: Settings (all groups, dynamic labels, RBAC, pipelines)
- [x] Slice 7: Dashboard (dense grid, real metrics, widgets)

**Phase 2 Gate**:
- [x] `pnpm typecheck` 0 errors
- [x] `pnpm exec biome check .` 0 issues
- [x] `pnpm test` 100+ passing
- [x] Full CRM flow: lead → contact → deal → Won
- [x] Deal kanban: drag → stage updated
- [x] RTL-safe: all Tailwind classes use ms-/me-/ps-/pe-/start-/end-
- [x] Cross-org isolation: orgId from ctx, never from request body
- [ ] Billing (Stripe) — deferred to production hardening
- [ ] CSV import — deferred to Phase 4+

---

## Phase 3 — AI Assistant + WhatsApp

> **Gate: "Stop navigating your CRM. Just talk to it."**

- [ ] `convex/ai/systemPrompt.ts`
- [ ] `convex/ai/toolRegistry.ts`
- [ ] `convex/ai/tools/` — 11 core tools
- [ ] `convex/ai/internal.ts::rebuildEntityContext` — fill in body
- [ ] `app/api/ai/chat/route.ts` — streaming proxy
- [ ] `core/ai/` components (ChatSheet, ChatMessage, ChatToolCall, ChatConfirmation)
- [ ] `core/ai/hooks/` (useAIChat, useRouteContext)
- [ ] `app/api/channels/whatsapp/route.ts`
- [ ] `trigger/whatsapp/voiceProcessor.ts`

**Phase 3 Gate**:
- [ ] `pnpm typecheck` 0 errors | `pnpm test` 160+ passing
- [ ] "Show me my top deals" → deal cards in AI panel
- [ ] "Create a lead for Sarah at Acme" → lead created with personCode
- [ ] Viewer: read-only tools only — no destructive actions exposed
- [ ] WhatsApp voice note → CRM updates in real time
- [ ] First token < 2 seconds streaming latency

# Orbitly — Project Pending Items

> **Scope**: What is NOT yet built, grouped by priority. Completed work has been
> moved into each module's `STATE.md` file — this doc only tracks open items.
> **Last Updated**: 2026-05-12

---

## ✅ Solid ground (do not rebuild)

- Backend: 100% complete — all CRM tables, queries, mutations, canonical pattern, 85 tests green
- RBAC: fully DB-backed (custom roles work from Settings without code changes)
- Shell: sidebar + topnav + AI panel slot + workspace switcher, ship-ready
- Auth: full password + OAuth + invitations + RBAC integration
- Preferences: SSR-safe cookies, 5 theme presets, 18 font options
- Settings UI: layout + 9 groups all built (see SETTINGS_FRONTEND_PLAN.md for exceptions)
- Entity labels: dynamic via `useEntityLabels()` hook — wired into sidebar + CRM group

Details of each ✅ item now live in the relevant `core/*/STATE.md` — not here.

---

## 🔴 Critical path to "sellable" (Phase 2 frontend, open)

The CRM cannot be demoed without these. Order matters.

| # | Item | Files (target) |
|---|---|---|
| 1 | **Entity scaffolds** (list/detail/form/card) | `core/entities/scaffolds/*` — see `core/entities/ENTITY_SCAFFOLDS_ARCHITECTURE.md` |
| 2 | **Leads + Contacts list views** | `core/entities/(entities)/leads/views/LeadsView.tsx` (and same for contacts) |
| 3 | **PersonDetailPage** (unified lead+contact) | `core/entities/(entities)/people/views/PersonDetailView.tsx` at `/profile/[personCode]` |
| 4 | **Companies** list + detail | `core/entities/(entities)/companies/*` |
| 5 | **Deals kanban** + detail | `core/entities/(entities)/deals/*` using `core/kanban/` |
| 6 | **Unified Timeline** | `core/timelines/*` (reads `api.crm.shared.timeline.getForPerson`) |
| 7 | **Dashboard home** with real metrics | `core/shell/views/DashboardHomeView.tsx` (replace placeholder) |

---

## 🟡 Settings polish (open)

See `SETTINGS_FRONTEND_PLAN.md` for the full list. Top 3:

1. **BillingGroup** — LemonSqueezy checkout + usage meters
2. **PipelineEditor** — stale color + warning threshold pickers per stage
3. **FieldEditor** — drag-reorder + `showInStages` stage scoping

---

## 🟡 Missing product features (open)

Ordered by market impact.

| # | Item | Why it matters |
|---|---|---|
| 1 | **Global Cmd+K command palette** | Every modern CRM has this — search entities + actions from any page |
| 2 | **Quick-add "+" button in TopNav** | < 10 seconds to add a lead — table stakes |
| 3 | **CSV import wizard** (`core/csv-import/`) | Data import on onboarding — every new org needs this |
| 4 | **AI Assistant (Phase 3)** — Vercel AI SDK + ToolLoopAgent + tool registry | Our differentiator |
| 5 | **Mobile PWA manifest** + bottom nav on < 768px | Gulf market is mobile-first, agents in the field |
| 6 | **Email integration** (outbound log at minimum) | CRM without email tracking is incomplete |

---

## 🟢 Future phases (not near-term)

| Phase | Feature | ETA gate |
|---|---|---|
| 3 | WhatsApp inbound pipeline (voice + text → fieldValues) | After Phase 3 AI lands |
| 4 | Communications tab (activity chat UI) | 15 paying customers |
| 5 | External channels (Ejari, RERA, Emirates ID) | 25 paying customers |
| 6 | Integration bridges (Zapier first, then native) | 35 paying customers |
| 7 | AI automation (morning briefing, proactive drafts) | 40 paying customers |
| 8 | Project Management (deal won → project) | Enterprise tier |
| 9 | Client Portal | Enterprise tier |

---

## Testing / Quality (open, before first paying customer)

| # | Item |
|---|---|
| 1 | Vitest setup + unit tests for hooks (`useEntityLabels`, `useSettingsForm`, `useSettingsSearch`) |
| 2 | Playwright E2E: sign up → onboarding → dashboard → add lead |
| 3 | Accessibility audit (axe-core on all settings groups) |
| 4 | Lighthouse / Core Web Vitals baseline |
| 5 | Mobile viewport QA (390 / 768 / 1024) |

---

## Docs to clean up when next session touches them

- `.github/agents/base/context.md` — 2 weeks stale (still says Phase 2 frontend NEXT; some shell work has happened since)
- `.github/agents/base/todos.md` — same staleness
- `.github/agents/base/deep-plan.md` — 94kb, likely a lot of it is stale
- `BUILD-ORDER.md` — may duplicate Phase-2-progress.md

---

## Architecture decisions to NOT revisit

These are locked. Don't open them up without explicit user permission.

| # | Decision |
|---|---|
| 1 | Convex for all server state; Zustand for UI-only state |
| 2 | Entity labels + slugs NEVER hardcoded — always DB-backed |
| 3 | `useEntityLabels()` is the one canonical hook (re-exported from `core/shell/hooks/` for back-compat) |
| 4 | Single `/settings` route with `?group=` query param — no sub-routes |
| 5 | Per-section save — no global save button |
| 6 | Appearance = all users (per-user cookies, zero org impact) |
| 7 | Activity log lives at `/{locale}/{orgSlug}/activity` — NOT in settings |
| 8 | Person detail page uses personCode as slug: `/profile/P-001` |
| 9 | Scaffolds handle ALL entities (4 core + 2 optional slots, UI only built for 4) |
| 10 | `Element.scrollIntoView()` is BANNED inside the dashboard shell (layout-shift bug) |

# Build Context — Current State

> OVERWRITE this file at end of every session. Never create a new context file.
> Last Updated: 2026-05-08

---

## Current Phase: 2 — CRM Core (Backend COMPLETE, Frontend NEXT)

**Phase 0: ✅ COMPLETE** — Auth, RBAC (70 tests), invitations, preferences, theme presets, Zustand store.
**Phase 1: ✅ COMPLETE** — Shell, sidebar, TopNav, WorkspaceSwitcher, onboarding, dashboard home, notifications, feature flags, record codes.
**Phase 2 Backend: ✅ 100% COMPLETE** — All CRM tables, all mutations + queries, canonical pattern steps 1-6.
**Phase 2 Frontend: ⬜ NEXT** — Vertical slices. Start with Slice 0 (shared primitives).

---

## MUST READ Before Any Frontend Work

1. `FRONTEND-DECISIONS.md` — ALL locked frontend decisions (20 rules)
2. `PHASE2-PROGRESS.md` — Backend status + frontend vertical slice plan
3. `CONVEX-ARCHITECTURE.md` — Convex patterns, caching, realtime, timeline, AI context
4. `.kiro/code-architecture-v.md` — Full architecture bible (36 modules)

---

## Key Decisions (Summary — Full Detail in FRONTEND-DECISIONS.md)

| Decision | Value |
|---|---|
| Entity labels | NEVER hardcoded — always from `orgSettings.entityLabels` (DB) |
| Route slugs | NEVER hardcoded — always from `orgSettings.entityLabels[slot].slug` (DB) |
| Person detail page | ONE page for lead + contact — `/people/[personCode]` |
| Notes | Inline in Unified Timeline — NOT a separate tab |
| AI capabilities | Everything the user has permission to do |
| Staleness colors | Configurable per stage (`stage.staleColor`, `stage.warningColor`) |
| Client portal | Permission gates on every section from day one |
| Platform timeline | `/settings/activity-log` — org-wide, admin only |
| Per-person timeline | `/people/[personCode]` → Timeline tab — scoped to personCode |

---

## App Route Structure (Current + Planned)

```
app/[locale]/
  (auth)/          ← signin, signup, forgot-password, verify-email, join  ✅
  (private)/       ← auth guard (client-side useConvexAuth)               ✅
    layout.tsx     ← redirects to /signin if not authenticated
    onboarding/    ← 3-step wizard
    [orgSlug]/     ← org resolver + DashboardLayout + OnboardingGuard     ✅
      page.tsx     ← dashboard home  →  /{locale}/{orgSlug}
      profile/     ← person detail + list  ✅ stub
        page.tsx   ← all profiles (leads + contacts combined)
        [personCode]/page.tsx  ← unified profile page (P-001)
      [entitySlug]/page.tsx    ← dynamic: leads, contacts, deals, companies + renamed  ✅ stub
      companies/[id]/page.tsx  ← company detail  ✅ stub
      deals/[id]/page.tsx      ← deal detail  ✅ stub
      notifications/page.tsx   ← all notifications  ✅ stub
      settings/    ← all settings pages (stubs → Slice 6)
```

**URL pattern**: `/{locale}/{orgSlug}/...` — orgSlug directly after locale, no "dashboard" segment.
**No separate /leads or /contacts directories** — `[entitySlug]` handles all entity list views.

## Key Decisions Locked This Session

- Profile page at `/profile/[personCode]` (not /people/)
- `[entitySlug]` dynamic route handles ALL entity lists (leads, contacts, deals, companies + renamed)
- No separate /leads and /contacts directories
- Profile page tabs: Overview | Messages | Timeline | Notes | Deals | Reminders | Files
- Overview tab = right sidebar content (no separate panel — space taken by AI chat panel)
- Notes = separate tab (editable, AI briefing at top)
- Messages = chat bubbles (human + AI on-behalf), stored in notes with isActivityChat: true
- Timeline = system log (activityLogs + reminders), AI scans this, feed UI with colored icons
- Staleness: same thresholds/colors for leads AND deals — configured per pipeline stage
- PersonCodeBadge = always a clickable link to /profile/[personCode]
- PersonCard = compact popover version of Overview tab (for deal cards etc.)
- Reserved slugs validated in orgs.create: platform, api, admin, billing, auth, onboarding, profile, settings, notifications, signin, signup, pricing, portal

---

## Backend State (100% Complete)

All tables: leads, contacts, companies, deals, notes, reminders, tags, entityTags,
fieldDefinitions, fieldValues, savedViews, pipelines, entityCodeCounters.

All mutations follow canonical pattern (steps 1-6). Step 7 (AI context rebuild) = TODO comment.

---

## Frontend — Next Steps (Exact Order)

```bash
# Install first:
pnpm add @dnd-kit/core @dnd-kit/sortable @tanstack/react-table canvas-confetti
pnpm add -D @types/canvas-confetti
```

```
Slice 0: Shared primitives (DataTable, KanbanBoard, scaffolds, shared components)
Slice 1: Leads list + Contacts list (separate list views)
Slice 2: PersonDetailPage (unified person hub — /people/[personCode])
Slice 3: Companies list + detail
Slice 4: Deals kanban + detail
Slice 5: Unified Timeline component
Slice 6: Settings pages
Slice 7: Dashboard home (real metrics)
```

Full file-by-file breakdown: `PHASE2-PROGRESS.md`

---

## Verification

```
pnpm tsc --noEmit  →  ✅ 0 errors
Tests              →  ✅ 70 passing, 1 skipped
```

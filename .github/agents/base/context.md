# Build Context — Current State

> OVERWRITE this file at end of every session. Never append.
> Last Updated: 2026-05-19

---

## Phase Status

| Phase | Status |
|---|---|
| 0 — Auth, RBAC, shell primitives | ✅ 100% Complete |
| 1 — Shell, sidebar, nav, onboarding, dashboard | ✅ 100% Complete |
| 2 Backend — all CRM tables, mutations, queries | ✅ 100% Complete |
| 2 Frontend — Slices 0–7 | ✅ 100% Complete |
| 3 — AI Assistant + WhatsApp | ⬜ Next |

## What Was Completed in Phase 2 (summary)

All entity list/board views (Leads, Contacts, Deals, Companies), all detail views, profile page (unified lead+contact by personCode), Messages UI (thread/sidebar/composer/voice), Notes UI (category kanban), Calendar (month/week/day/list), Reminders (DataTable + 3 view modes), Follow-ups (org-wide cadence view + panel built), Timeline (person + entity + org), Settings (all groups), Dashboard (dense grid + real metrics).

Backend: 28 tables, all mutations canonical pattern steps 1–6, step 7 wired as no-op for Phase 3. Follow-ups: `createFollowup` mutation + 3 list queries + UI surface + panel — all complete. Files: `listForEntity` query added (server-side merge).

Performance fixes landed 2026-05-18/19:
- ContactsView: `companies.list` scoped to `groupBy === "companyId"` only
- DealDetailView: `flatDeals` scoped to `view === "list"` only  
- EntityFilesPanel: 3 subscriptions → 1 `listForEntity` server-side query
- Tags batched via `useEntityTagsMap` on all list parents
- Identity/RBAC via `useCurrentOrg()` context only — no per-component subscriptions
- Drag: one mutation per drop via `onCommit`

## What Is Pending (Phase 2 leftovers)

1. **Mount FollowUpsPanel in 3 detail views** (panel is built, just needs wiring):
   - `core/platform/profile/views/ProfileContent.tsx` — add `<FollowUpsPanel personCode={personCode} />` beside RemindersPanel ~line 218
   - `core/entities/_entities/deals/views/DealDetailView.tsx` — add beside RemindersPanel ~line 1015
   - `core/entities/_entities/companies/views/CompanyDetailView.tsx` — add both RemindersPanel and FollowUpsPanel (neither exists there yet)

2. **Auto-close follow-ups cron** — `autoCloseAfterDays` setting exists in schema+UI but no cron. Details in PHASE-3-NEXT.md.

3. **Production hardening** — email send, soft-delete recovery, GDPR export, billing. Details in PHASE-3-NEXT.md.

## Root File Map

```
AGENTS.md              — Global coding rules (RTL, radius, labels, perf, etc.) — ALWAYS READ
PHASE-2-PROGRESS.md    — Phase 2 completed + pending + all architecture decisions
PHASE-3-NEXT.md        — Phase 3 AI plan + remaining perf improvements + future phases
README.md              — Convex+Next.js project README
```

Root-level files deleted 2026-05-19 (consolidated into PHASE-2-PROGRESS.md + PHASE-3-NEXT.md):
BUILD-ORDER.md, FRONTEND-DECISIONS.md, PRODUCTION-READINESS-AUDIT.md, SCHEDULING-IMPLEMENTATION.md, CORE-FEATURES-ARCHITECTURE.md, DYNAMIC_FIELDS_BLUEPRINT.md, INDUSTRY_ADAPTABILITY_ANALYSIS.md, CODE-ARCHITECTURE-TIMELINE-FOLLOWUPS.md, PERFORMANCE-AUDIT-2026-05-19.md, Phase-2-progress.md

## Next Steps (Phase 3)

1. Build AI tool registry (`convex/ai/toolRegistry.ts`)
2. Fill in `convex/ai/systemPrompt.ts` — 3-layer prompt builder
3. Build 11 core AI tools in `convex/ai/tools/`
4. Fill in `convex/ai/internal.ts::rebuildEntityContext` body
5. Build `core/ai/` frontend components (ChatSheet, ChatMessage, etc.)
6. Wire WhatsApp webhook

Full checklist in PHASE-3-NEXT.md.

## Verification Before Writing Code

```bash
pnpm typecheck        # must be 0 errors
pnpm exec biome check # must be 0 issues
pnpm test             # must be 100+ passing
```

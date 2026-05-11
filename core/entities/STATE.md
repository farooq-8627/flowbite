# Entities — State

> Updated: 2026-05-12
> Status: Backend 100% Complete — Frontend routing + dynamic dispatch now in place; per-entity scaffolds still pending.

## ✅ Completed — Backend

| Module | File | Notes |
|---|---|---|
| Schema (all CRM tables) | `convex/schema.ts` | leads, contacts, companies, deals, notes, reminders, tags, fieldDefinitions, fieldValues, savedViews, pipelines, entityCodeCounters, activityLogs, orbitLinks |
| Leads | `convex/crm/entities/leads/` | queries + mutations, canonical pattern complete |
| Contacts | `convex/crm/entities/contacts/` | personCode inherited from lead on conversion |
| Companies | `convex/crm/entities/companies/` | queries + mutations |
| Deals | `convex/crm/entities/deals/` | moveToStage + closeAsDone |
| Pipelines | `convex/crm/fields/pipelines/` | stages + stale config |
| Dedup engine | `convex/crm/fields/dedup/helpers.ts` | email/phone/name |
| People resolver | `convex/crm/people/queries.ts::getByPersonCode` | returns lead OR contact |
| Timeline | `convex/crm/shared/timeline/queries.ts` | getForPerson + getForOrg |

## ✅ Completed — Frontend (routing + dispatch + dynamic labels)

| Component | File | Notes |
|---|---|---|
| PersonCodeBadge | `core/entities/shared/PersonCodeBadge.tsx` | Shared component |
| useEntityLabels (canonical) | `core/shared/hooks/useEntityLabels.ts` | Auto-detects org from URL when no orgId provided |
| Dynamic list route | `app/[locale]/(private)/[orgSlug]/[entitySlug]/page.tsx` | ✅ Thin wrapper — delegates to `EntitySlugView` |
| Dynamic detail route | `app/[locale]/(private)/[orgSlug]/[entitySlug]/[id]/page.tsx` | ✅ Replaces the deleted `/deals/[id]` and `/companies/[id]` folders |
| EntitySlugView | `core/entities/views/EntitySlugView.tsx` | ✅ Resolves `entitySlug` → slot via `useEntityLabels`, honours `modules[].hidden`, dispatches to the right list view |
| LeadsView placeholder | `core/entities/leads/views/LeadsView.tsx` | ✅ Uses dynamic labels |
| ContactsView placeholder | `core/entities/contacts/views/ContactDetailView.tsx` | ✅ Uses dynamic labels (still exports `ContactsView` + `ContactDetailView`) |
| DealsView placeholder | `core/entities/deals/views/DealDetailView.tsx` | ✅ Uses dynamic labels; advertises `data-default-view="board"` |
| CompaniesView placeholder | `core/entities/companies/views/CompaniesView.tsx` | ✅ Uses dynamic labels; also exports `CompanyDetailView` |

## 🔒 Decisions Locked (2026-05-12 — see `ENTITY_SCAFFOLDS_ARCHITECTURE.md` + this session)

| # | Decision |
|---|---|
| 1 | Ship 4 entities in UI (lead, contact, deal, company). Entity5/Entity6 stay empty. |
| 2 | Folder layout: `core/entities/{scaffolds,shared,(entities)}/`. Parentheses are organizational, not Next.js route groups. |
| 3 | All 4 entities render through 4 shared scaffolds: `EntityListPage`, `EntityDetailPage`, `EntityFormDialog`, `EntityCard`. |
| 4 | **Single dynamic list route** `app/.../[entitySlug]/page.tsx` handles all entity list URLs — including renamed slugs (`/inquiries`, `/opportunities`). ✅ Implemented this session. |
| 5 | **Single dynamic detail route** `app/.../[entitySlug]/[id]/page.tsx` handles companies + deals + any future non-people detail. ✅ Implemented this session. |
| 6 | Unified person detail at `/profile/[personCode]` — one page for lead+contact — uses the shared shell layout (see `core/profile/`). Profile is NOT an entity. |
| 7 | Companies / any entity can be turned off per-workspace via `orgSettings.modules[].hidden`. The sidebar hides them and `EntitySlugView` returns `notFound()`. |
| 8 | Deals default view is **board** (kanban). List is secondary via toolbar toggle. |
| 9 | Pipeline stale colors NEVER hardcoded — always read from `stage.staleColor`. |
| 10 | `useEntityLabels()` is the single source of truth for entity names + slugs. |

## ⬜ Pending — Frontend Build Order (vertical slices)

| Slice | Task | Priority |
|---|---|---|
| 0 | Scaffolds + shared components/hooks (see ENTITY_SCAFFOLDS_ARCHITECTURE.md) | HIGH |
| 1 | Leads list + Contacts list — plug into scaffolds | HIGH |
| 2 | PersonDetailPage at `/profile/[personCode]` — replace placeholder tabs with real content | HIGH |
| 3 | Companies list + detail | MEDIUM |
| 4 | Deals kanban + detail (canvas-confetti on won) | HIGH |
| 5 | UnifiedTimeline component (consumed by slices 2–4) | HIGH |

Full spec: `core/entities/ENTITY_SCAFFOLDS_ARCHITECTURE.md`.

## Architecture Notes (this session — 2026-05-12)

- **Route structure is now fully dynamic.** Hardcoded `/deals` and `/companies` folders under `app/[locale]/(private)/[orgSlug]/` have been deleted. `EntitySlugView` resolves the URL slug against the org's saved labels on every render, honours `modules[].hidden`, and dispatches to the correct placeholder view. When renaming "Deals" → "Opportunities" in Settings, the URL `/opportunities` now works immediately — no file-system changes needed.
- **Profile is not an entity**, per FRONTEND-DECISIONS.md Rule 1. Moved to its own module `core/profile/`, uses the shared shell layout. The existing `/profile/page.tsx` (combined list) and `/profile/[personCode]/page.tsx` (detail) stay under `profile/` because a named folder wins over the dynamic `[entitySlug]` segment — which is exactly the routing behaviour we rely on.
- **Dynamic labels in every placeholder.** All four list/detail placeholders now call `useEntityLabels()` for their visible strings. When the real scaffolds land, they'll keep this behaviour.

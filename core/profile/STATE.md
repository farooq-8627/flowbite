# Profile — State

> Updated: 2026-05-12
> Status: Shell + tab dispatcher in place. All tab content is placeholder pending Slice 2.

## Why this module exists (separate from `core/entities/`)

- A **person** is one identity regardless of whether they are a lead or a contact. The backend resolves `personCode` → whichever table holds it (see `convex/crm/people/queries.ts::getByPersonCode`).
- The profile page is **not** an entity scaffold view. It uses the same "left rail + topnav pills + scrollable content" layout as Settings — which is now a shared shell layout in `core/shared/layouts/`.
- Content is organized as working groups (Overview, Messages, Timeline, Notes, Deals, Reminders, Calendar) rather than as list/detail rows.
- Rule reference: `FRONTEND-DECISIONS.md` Rule 1 ("Person page: one page for lead + contact") + Rule 2 (what the profile page shows).

## ✅ Completed

| Component | File | Notes |
|---|---|---|
| Groups + sections config | `core/profile/config/profile-sections.ts` | 7 groups × 12 sections; permission-gated where appropriate (`deals.view`, `reminders.view`) |
| ProfileDetailView | `core/profile/views/ProfileDetailView.tsx` | Thin wrapper over `ShellLayout` |
| ProfileContent (dispatcher) | `core/profile/views/ProfileContent.tsx` | Switches on `activeGroup`; each case returns stacked `ProfileSection` cards |
| ProfileSection | `core/profile/views/ProfileSection.tsx` | Card primitive matching SettingsSection — reads the shared `useSearchFilter()` context so search filtering is automatic |
| App route | `app/[locale]/(private)/[orgSlug]/profile/[personCode]/page.tsx` | Thin wrapper |

## ⬜ Pending — Slice 2 of ENTITY_SCAFFOLDS_ARCHITECTURE

| Task | Priority |
|---|---|
| Replace placeholder Overview → PersonHeader + contact info + company link + tag picker + DynamicFieldRenderer | HIGH |
| Replace placeholder Messages → activity-chat thread (notes where `isActivityChat===true`) | HIGH |
| Replace placeholder Timeline → `UnifiedTimeline` from `core/timelines/` | HIGH |
| Replace placeholder Notes → Note composer + list + AI briefing | HIGH |
| Replace placeholder Deals → deals list linked by personCode | MEDIUM |
| Replace placeholder Reminders → reminders list linked by personCode | MEDIUM |
| Replace placeholder Calendar → scheduled meetings + follow-up plan | LOW |
| Quick-view `PersonCard` popover (reuses Overview content) | MEDIUM |
| Convert-lead-to-contact dialog (lead-only action) | MEDIUM |

## Architecture Notes (2026-05-12)

- **Shell reused, UI identical in spirit to Settings.** Same breakpoints (`xl:flex` rail, `xl:hidden` inline toolbar), same mobile sheet, same Fuse search, same scroll-without-layout-shift.
- **Permission rules live in `PROFILE_GROUPS` + `PROFILE_SECTIONS`.** `deals.view` gates the Deals group + its section; `reminders.view` gates Reminders; every other group is accessible as long as the user can reach the profile page at all.
- **Internal-notes-only visibility is NOT a shell-level gate.** It belongs inside the individual tab (Notes / Timeline) alongside other filters, because the `isInternal` flag is per-note, not per-tab.
- **Entity-labeled sections now dynamic.** `OverviewGroup` "Company" and `DealsGroup` "Deals" section titles + descriptions now read from `useEntityLabels()` — rename "Company" → "Venue" in Settings and the Overview → Company section becomes "Venue" instantly. Other group labels (Overview, Messages, Timeline, Notes, Reminders, Calendar) stay fixed because they describe relational concepts that don't change with entity renames.

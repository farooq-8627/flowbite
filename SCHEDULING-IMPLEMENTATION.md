# SCHEDULING-IMPLEMENTATION.md

> Deep architecture for **Reminders** and **Calendar** UI build.
> Single source of truth — read this before touching `core/scheduling/*`.
> Owner: scheduling slice. Last refresh: 2026-05-18.

This file replaces ad-hoc planning docs. It explains:
1. What's already built (don't redo it).
2. What we copy from the donor template (and what we throw away).
3. The exact file tree we will create.
4. The Convex traffic budget — **one user gesture must equal one mutation**.
5. The 30+ minute end-to-end build plan, slice by slice, with verification gates.

If anything in this file conflicts with `AGENTS.md` global rules, AGENTS.md wins.

---

## 0. TL;DR — what we're building

| Surface | Source of truth | UI shape | Mounts at |
|---|---|---|---|
| Reminders org page | `reminders` table (Convex) | Stats grid + DataTable + drawer-form | `/{locale}/{orgSlug}/reminders` |
| Reminders embedded panel | same table | Compact list + inline form | Profile / Deal / Company tabs |
| Calendar org page | server-merged read (`reminders` + `activityLogs` + `deals.expectedCloseDate`) | Sidebar (mini-cal + filters + add) + Main grid (month/week/day/list) | `/{locale}/{orgSlug}/calendar` |
| Calendar embedded panel | same read-merge, scoped to person/entity | Main grid only — no sidebar | Profile / Deal / Company tabs |

Both views share **one** create-mutation: `useCreateReminder` (re-exported as `useCreateEventFromCalendar`). There is no `events` table. There never will be.

---

## 1. Backend status — IMPLEMENTED, do not modify

The scheduling backend is live and tested. UI work plugs into existing endpoints.

### 1.1 `reminders` table (`convex/schema/crmShared.ts`)

```ts
reminders: {
  orgId, followUpCode, personCode, dealCode?, entityType, entityId,
  title, note?, dueAt, assignedTo, status, source, completedAt?, createdAt,
  // indexes:
  by_org_and_due, by_org_and_person, by_org_and_status,
  by_org_and_status_and_due, by_user_and_due
}
```

`followUpCode` is `FU-001` style, generated server-side. Every reminder MUST have a `personCode`.

### 1.2 Reminders queries (`convex/crm/shared/reminders/queries.ts`)

| Function | Args | Returns | Index used |
|---|---|---|---|
| `listForPerson` | `{ orgId, personCode }` | `reminders[]` | `by_org_and_person` |
| `getDueToday` | `{ orgId }` | `reminders[]` (filtered to assignee unless `reminders.manage`) | `by_org_and_status_and_due` |
| `listOpen` | `{ orgId, personCode }` | `reminders[]` (status=pending) | `by_org_and_person` |

### 1.3 Reminders mutations (`convex/crm/shared/reminders/mutations.ts`)

All follow the canonical mutation pattern (RBAC → rate-limit → DB → logActivity → sendNotification).

| Function | Permission | Side-effects |
|---|---|---|
| `create` | `reminders.create` | logActivity `reminder_created`; notify assignee if not self |
| `complete` | assignee OR `reminders.manage` | patch `status: "completed"`, `completedAt`; logActivity; notify creator |
| `update` | assignee OR `reminders.manage` | patch fields; logActivity |
| `remove` | assignee OR `reminders.manage` | delete; logActivity |

### 1.4 Calendar query (`convex/crm/shared/calendar/queries.ts`)

ONE function: `getEvents({ orgId, rangeStart, rangeEnd, scope, personCode?, entityType?, entityId?, sources? })`.

Server-merges three sources into a tagged-union `CalendarEventDTO[]`:

```ts
type CalendarEventDTO = {
  id: string;          // "reminder:<docId>" | "activity:<docId>" | "deal:<docId>"
  source: "reminder" | "activity" | "deal";
  title: string;
  startsAt: number;
  endsAt?: number;
  color: string;       // #f97316 / #6366f1 / #3b82f6
  personCode?: string;
  entityType?: string;
  entityId?: string;
  meta?: Record<string, string | number | boolean>;
};
```

Activity logs surface only when `action ∈ {meeting_*, call_*, demo_*}`. Deals surface only when `expectedCloseDate` is set AND the deal is open (no `wonAt`/`lostAt`).

### 1.5 React hooks — IMPLEMENTED

```
core/scheduling/reminders/hooks/index.ts
  ✅ useRemindersForPerson, useRemindersDueToday, useRemindersOpen
  ✅ useCreateReminder, useCompleteReminder, useUpdateReminder, useDeleteReminder

core/scheduling/calendar/hooks/index.ts
  ✅ useCalendarEvents
  ✅ useCreateEventFromCalendar (re-export of useCreateReminder)
```

### 1.6 Routes & shells — IMPLEMENTED

```
app/[locale]/(private)/[orgSlug]/reminders/page.tsx → <RemindersView />
app/[locale]/(private)/[orgSlug]/calendar/page.tsx  → <CalendarView />
core/scheduling/reminders/views/RemindersView.tsx   ← placeholder (UI pending)
core/scheduling/calendar/views/CalendarView.tsx     ← placeholder (UI pending)
```

Sidebar nav already shows "Reminders" + "Calendar" entries (`core/shell/shell/config/navigation.ts`).

---

## 2. Donor template — what to take, what to skip

Donor: `/Users/shaikumarfarooq/Clones/Orbitly/shadcnstore/nextjs-version`.

### 2.1 Reminders donor — `src/app/(dashboard)/tasks/`

| Donor file | Take? | Notes |
|---|---|---|
| `tasks/page.tsx` | **Take layout shape** | Stats grid (Total / Due Today / Overdue / Completed) above DataTable. Replace `tasks.json` static loader with our hooks. |
| `tasks/components/data-table.tsx` | **DO NOT TAKE** | We already have `core/data-display/datatable/`. Pass our reminder rows through it. |
| `tasks/components/columns.tsx` | **Take patterns, not the file** | Title cell, badge cells (status / priority), checkbox row-actions — model `useReminderColumns.ts` after this. |
| `tasks/components/data-table-toolbar.tsx` | **DO NOT TAKE** | Our `EntityListView` already has a toolbar primitive. |
| `tasks/components/add-task-modal.tsx` | **DO NOT TAKE** | Different field model. We use the shared `EntityFormDrawer` shell with reminder-specific fields. |
| `tasks/data/*.json` | **Skip** | Mock data — we read from Convex. |

### 2.2 Calendar donor — `src/app/(dashboard)/calendar/`

| Donor file | Take? | Notes |
|---|---|---|
| `calendar/components/calendar-main.tsx` | **Take pattern** (~440 LOC) | Month/week/day/list grid logic. Drop the JSON event loader; consume the `events` prop only. Replace `event.type` colour map with our `event.color` (already on the DTO). |
| `calendar/components/calendar-sidebar.tsx` | **Take pattern** | Mini-cal + "Add New Event" button + filter list. Drop the placeholder console.log handlers — wire to our hooks. |
| `calendar/components/event-form.tsx` | **Take field shape** | Title / Date / Time / Type / Location / Description / Reminder switch. Map to our reminder fields below. |
| `calendar/components/calendars.tsx` | **Adapt as `CalendarFilters.tsx`** | The donor's "calendars" become our **source filters** (Reminders / Activities / Deal closes) — three checkboxes, not user-defined calendars. |
| `calendar/components/calendar.tsx` | **DO NOT TAKE** | It's a thin re-export. We compose Sidebar+Main directly. |
| `calendar/components/calendar-unified.tsx` | **DO NOT TAKE** | Mobile-only variant; we use shadcn `Sheet` from existing primitives. |
| `calendar/components/date-picker.tsx` | **DO NOT TAKE** | Use our existing `<Calendar>` component from `components/ui/calendar`. |
| `calendar/components/quick-actions.tsx` | **DO NOT TAKE** | Reminders is a purpose-built form; quick-actions menu is donor-specific. |
| `calendar/use-calendar.ts` | **Take the *state* shape only** | Keep `selectedDate` and `viewMode` (zustand). Throw away `handleSaveEvent` / `handleDeleteEvent` — we call Convex mutations directly from the form. |
| `calendar/data/*.json` | **Skip** | Mock data. |
| `calendar/types.ts` | **Skip** | Replace with our `CalendarEventDTO` (already exists). |

### 2.3 Field-mapping — donor → ours

Reminder form (was tasks/calendar event form):

| Donor field | Ours | Required |
|---|---|---|
| `title` | `title: string` | yes |
| `description` | `note: string` (optional) | no |
| `date` | `dueAt: number` (epoch ms) | yes |
| `time` (string) | merged into `dueAt` | yes |
| `type` (meeting/event/personal/task/reminder) | drop — we infer from `source` | n/a |
| `location` | drop or store in `note` | n/a |
| `attendees` | `assignedTo: Id<"users">` (single user, not array) | yes |
| `allDay` switch | drop — `dueAt` is exact, not all-day | n/a |
| `reminder` switch | drop — every record IS a reminder | n/a |

Donor field omissions are deliberate. Adding location / attendees / type to `reminders` would break the **single-source-of-truth** rule (calendar would no longer be a derived view of reminders + activities).

---

## 3. Target folder tree

> **Lock this list before writing any code.** No file outside this list gets created in this slice.

### 3.1 Reminders

```
core/scheduling/reminders/
├── views/
│   └── RemindersView.tsx              ← REWRITE (placeholder today)
├── panels/
│   └── RemindersPanel.tsx             ← NEW (entity tab embed)
├── widgets/
│   ├── DueTodayWidget.tsx             ← NEW (dashboard card)
│   └── MyOverdueWidget.tsx            ← NEW (dashboard card)
├── components/
│   ├── ReminderForm.tsx               ← NEW (drawer; create + edit)
│   ├── ReminderRow.tsx                ← NEW (table row cell renderer)
│   ├── ReminderCard.tsx               ← NEW (panel/widget card)
│   ├── ReminderStatusBadge.tsx        ← NEW (pending / completed / overdue)
│   ├── ReminderQuickComplete.tsx      ← NEW (one-click ✓ button)
│   ├── ReminderEmptyState.tsx         ← NEW (shared empty)
│   └── columns/
│       └── useReminderColumns.ts      ← NEW (TanStack ColumnDef[])
├── hooks/
│   └── index.ts                       ← KEEP (already wired)
├── lib/
│   ├── reminder-buckets.ts            ← NEW (group by due bucket)
│   └── reminder-status.ts             ← NEW (overdue/today/upcoming derivation)
├── MODULE.md                          ← UPDATE
└── STATE.md                           ← UPDATE
```

### 3.2 Calendar

```
core/scheduling/calendar/
├── views/
│   └── CalendarView.tsx               ← REWRITE (placeholder today)
├── panels/
│   ├── PersonCalendarPanel.tsx        ← NEW (person profile tab embed)
│   └── EntityCalendarPanel.tsx        ← NEW (deal/company tab embed)
├── widgets/
│   ├── WeekAheadWidget.tsx            ← NEW (dashboard 7-day strip)
│   └── MiniCalendarWidget.tsx         ← NEW (dashboard mini-cal)
├── components/
│   ├── CalendarMain.tsx               ← NEW (month/week/day/list grid; donor-derived)
│   ├── CalendarSidebar.tsx            ← NEW (mini-cal + add + filters)
│   ├── CalendarToolbar.tsx            ← NEW (view-mode tabs + nav arrows + today)
│   ├── CalendarFilters.tsx            ← NEW (three source toggles)
│   ├── EventChip.tsx                  ← NEW (single event pill)
│   ├── EventDetailPopover.tsx         ← NEW (click an event → show meta + click-through)
│   ├── EventForm.tsx                  ← NEW (drawer; thin wrapper around ReminderForm)
│   └── DatePicker.tsx                 ← REUSE (shadcn Calendar primitive — no new file)
├── hooks/
│   ├── index.ts                       ← KEEP (already wired)
│   └── useCalendarViewMode.ts         ← NEW (zustand: viewMode + selectedDate; UI-only)
├── lib/
│   ├── event-source-colors.ts         ← NEW (#f97316 / #6366f1 / #3b82f6 + label map)
│   ├── calendar-grid.ts               ← NEW (date-fns helpers: month grid, week range)
│   └── calendar-buckets.ts            ← NEW (group events by date for the grid)
├── MODULE.md                          ← UPDATE
└── STATE.md                           ← UPDATE
```

### 3.3 Wrappers (already exist — don't recreate)

```
app/[locale]/(private)/[orgSlug]/reminders/page.tsx   ← unchanged
app/[locale]/(private)/[orgSlug]/calendar/page.tsx    ← unchanged
```

---

## 4. The performance contract — "1 user gesture = 1 Convex call"

This is non-negotiable. Read `AGENTS.md` "PERFORMANCE-CRITICAL RULES" then come back. The rules below are the scheduling-specific tightening of those.

### 4.1 Org-wide views: **one** subscription each

| View | Hook | Subscriptions per render | Notes |
|---|---|---|---|
| `RemindersView` | `useRemindersDueToday({ orgId })` | 1 | Stats grid + table all derive from this single result. NO per-row queries. |
| `CalendarView` | `useCalendarEvents({ orgId, rangeStart, rangeEnd, scope: "org" })` | 1 | Sidebar mini-cal, Main grid, and Filters all consume the same array. NO per-day queries. |

Identity / RBAC / labels — **zero** new subscriptions: read from `useCurrentOrg()` / `useOrgPermissions()` / `useEntityLabels()` per AGENTS.md rules.

### 4.2 Embedded panels: scope tightly

| Panel | Hook args | Hard limit |
|---|---|---|
| `RemindersPanel` (profile tab) | `useRemindersForPerson({ orgId, personCode })` | personCode-indexed; no full-table scan |
| `EntityCalendarPanel` (deal/company tab) | `useCalendarEvents({ orgId, scope: "entity", entityType, entityId, ... })` | range clamped to ≤ 90 days |
| `PersonCalendarPanel` | `useCalendarEvents({ orgId, scope: "person", personCode, ... })` | range clamped to ≤ 90 days |

Range clamp lives in the panel, not the query. Backend will accept a 5-year range but it'd be wasteful.

### 4.3 Mutations: **no rapid-fire**

User gestures map exactly to one mutation. Rules:

| Gesture | Mutation | NO debounce, NO optimistic-then-server-stamp loops |
|---|---|---|
| Click quick-complete (✓) | `complete` | Fires once. Disable the button while pending. |
| Drag an event in the grid | `update({ dueAt })` | One mutation on `onDragEnd` (not `onDragOver`). Mirror `kanban.tsx::onCommit`. |
| Save form (create/edit) | `create` or `update` | One call per submit. Form disables submit button while pending. |
| Delete | `remove` | One call. Confirm dialog before firing. |

`update` MUST use `withOptimisticUpdate` to patch the local cache for `listForPerson` / `getDueToday` / the calendar event list. The optimistic patch MUST NOT bump `updatedAt`. Server stamps it. (Bumping it from the optimistic update would cascade-invalidate every list it appears in — see AGENTS.md "no updatedAt bump in optimistic updates".)

### 4.4 Calendar grid: cell renderers receive props, never call `useQuery`

The Main grid renders 35–42 cells (month) or 7×24 cells (week). Each cell renderer takes:

```tsx
type DayCellProps = {
  date: Date;
  events: ReadonlyArray<CalendarEventDTO>;  // already filtered for this day
  isCurrentMonth: boolean;
  isToday: boolean;
  isSelected: boolean;
  onSelectDate: (d: Date) => void;
  onSelectEvent: (e: CalendarEventDTO) => void;
};
```

NO `useQuery` inside cells. NO `useCurrentOrg` inside cells. The parent `CalendarMain` runs ONE `useCalendarEvents` and ONE `useMemo` to bucket events by day key.

### 4.5 Drag preview: server unaware

Mirror `components/ui/kanban.tsx`: `onDragOver` updates a local visual state. `onDragEnd` (and only `onDragEnd`) fires the mutation. This prevents the drag-over-50-cells = 50-mutations failure mode that took down `markRead` last week.

### 4.6 Dashboard widgets: piggyback the org-page query

`DueTodayWidget` and `WeekAheadWidget` mount on the dashboard. They MUST NOT issue their own subscriptions to `getDueToday` / `getEvents` — they consume the shared org provider's data when present, otherwise gracefully render an empty state. (If a user lands on the dashboard but has never visited Reminders, the widgets will still render — they re-use `useRemindersDueToday`/`useCalendarEvents` which dedupe within Convex. The point is: don't add 4 new bespoke queries.)

Update LATER if the dashboard becomes its own subscription hotspot. For now, deduplication is enough.

### 4.7 Rate-limit budget — already enforced server-side

`reminders.create` has `RATE_LIMITS.write` (60/min/user). `update` and `complete` should add the same scope. `remove` should add `RATE_LIMITS.write`. NO bursting from the UI is acceptable — keep buttons disabled during pending mutations.

---

## 5. RBAC matrix

| UI surface | Permission gate | Behaviour without it |
|---|---|---|
| RemindersView visible | `reminders.view` | 403 (sidebar entry hidden via `useOrgPermissions().includes(...)`) |
| `+ New Reminder` button | `reminders.create` | Button hidden |
| Quick-complete on a row | assignee OR `reminders.manage` | Button hidden |
| Edit row → drawer | assignee OR `reminders.manage` | Button hidden |
| Delete row | assignee OR `reminders.manage` | Menu item hidden |
| `getDueToday` filter | `reminders.manage` | Member sees only their own reminders (server filters) |
| Calendar event sources | `reminders.view` (always); `activityLogs.viewOrg` (gates org-wide activities); `deals.view` (gates deal close-dates) | Missing perms = those source rows just don't appear in the merged result. UI filters reflect what's available. |

Frontend never gates by role. Frontend reads the response — whatever the server returned. The server is the single auth source of truth (locked decision #16).

---

## 6. State management

### 6.1 Server state — Convex

Per locked decision #1: every reminder, every event, every list comes from Convex via the hooks above. Never mirror in Zustand.

### 6.2 UI state — Zustand or `nuqs`

| Concern | Where | Persistence |
|---|---|---|
| Calendar `viewMode` (month/week/day/list) | `useCalendarViewMode()` zustand | `?view=` URL param via `nuqs` |
| Calendar `selectedDate` | `useCalendarViewMode()` zustand | not persisted (resets on page-load to today) |
| Event source filters (3 toggles) | `useCalendarFilters()` zustand | `?sources=` URL param |
| Reminders table column visibility | `usePersistedState()` localStorage | persisted |
| Reminders table search input | local `useState` | not persisted |
| Open drawer (form / detail) | local `useState` in the parent view | not persisted |

**No Convex data lives in Zustand.** Zustand only holds UI knobs.

### 6.3 URL params (`nuqs`) — deep-linkable

| Param | Used by |
|---|---|
| `?view=month` / `?view=week` | calendar |
| `?sources=reminder,activity,deal` | calendar (default = all 3) |
| `?date=2026-05-18` | calendar (jump to a specific date on share) |
| `?status=pending` | reminders table |
| `?assigned=me` | reminders table |

---

## 7. Build sequence — do these slices in order

Each slice ends with `pnpm tsc --noEmit && pnpm test && pnpm test:frontend`. No slice ships if any test breaks.

### Slice A — Reminders foundations (90 min)

1. `lib/reminder-status.ts` — pure helpers: `getReminderState(reminder, now): "overdue"|"today"|"upcoming"|"completed"`.
2. `lib/reminder-buckets.ts` — `bucketByDue(reminders, now): { overdue, today, upcoming, completed }`.
3. `components/ReminderStatusBadge.tsx` — badge primitive (4 colours: red / amber / blue / green).
4. `components/ReminderQuickComplete.tsx` — single-button quick-complete with optimistic update.
5. **Verify:** typecheck + tests pass.

### Slice B — Reminders list view (3 h)

1. `components/columns/useReminderColumns.ts` — TanStack `ColumnDef<Reminder>[]`. Columns: code, title, due, assignee, status, actions.
2. `components/ReminderEmptyState.tsx`.
3. `components/ReminderForm.tsx` — drawer-based form (create + edit, controlled by `mode` prop).
4. `views/RemindersView.tsx` — full rewrite. Stats grid + DataTable + drawer. **One** `useRemindersDueToday` call powers everything.
5. **Verify:** open page in dev, confirm stats card numbers match table rowcount, confirm only 1 reminder query in the Convex logs.

### Slice C — Reminders embedded panel (1 h)

1. `panels/RemindersPanel.tsx` — compact list, no stats, sized for tab content.
2. `components/ReminderCard.tsx` — single-row card with title, due chip, ⋮ actions.
3. Wire into `core/entities/_entities/{contacts,leads,deals,companies}/views/*DetailView.tsx` → "Reminders" tab.
4. **Verify:** typecheck + tests pass + manually open a profile, see reminders list.

### Slice D — Calendar lib + filters (90 min)

1. `lib/event-source-colors.ts` — colour map + i18n labels.
2. `lib/calendar-grid.ts` — month-grid generator (date-fns), week range, day range.
3. `lib/calendar-buckets.ts` — `bucketByDay(events): Map<YMD, CalendarEventDTO[]>`.
4. `hooks/useCalendarViewMode.ts` — zustand store (viewMode + selectedDate).
5. `components/EventChip.tsx` — pill renderer; takes `CalendarEventDTO`.
6. `components/EventDetailPopover.tsx` — click → show details + click-through link.
7. `components/CalendarFilters.tsx` — 3 toggles bound to `?sources=` URL param.
8. `components/CalendarToolbar.tsx` — view mode tabs + nav arrows + today button.
9. **Verify:** typecheck + tests pass. (No live data yet — these are leaves.)

### Slice E — Calendar grid (3 h)

1. `components/CalendarMain.tsx` — donor-derived month/week/day/list grid. Takes `events: CalendarEventDTO[]` + `viewMode` + `selectedDate` props. Cells consume the bucket map. Renders `EventChip` per event. Click event → opens `EventDetailPopover`.
2. **Verify:** mock a 200-event array in storybook-style or a dev page, confirm zero per-cell queries fire.

### Slice F — Calendar sidebar (90 min)

1. `components/CalendarSidebar.tsx` — Add Event button + mini-cal date picker + `CalendarFilters`.
2. Add Event button opens `EventForm` drawer.
3. **Verify:** typecheck + tests pass.

### Slice G — Calendar event form (1 h)

1. `components/EventForm.tsx` — thin wrapper that renders `ReminderForm` with calendar-specific defaults (date pre-filled from `selectedDate`).
2. The label says "Save as Reminder" so the user understands the underlying model.
3. **Verify:** typecheck + tests pass + manually create an event, confirm it shows in `RemindersView`.

### Slice H — Calendar org page (1 h)

1. `views/CalendarView.tsx` — full rewrite. Composes `CalendarSidebar` + `CalendarMain` + `EventForm` (drawer).
2. ONE `useCalendarEvents` subscription. Sidebar + Main + Filters all derive from the same array.
3. Range = current view's date range (computed in the view, not the components).
4. **Verify:** open page in dev, drag the date forward, watch Convex logs — should see one query per real range change, not per-day.

### Slice I — Calendar embedded panels (1 h)

1. `panels/PersonCalendarPanel.tsx` — `CalendarMain` only (no sidebar).
2. `panels/EntityCalendarPanel.tsx` — `CalendarMain` only (no sidebar). Filters scoped to the entity.
3. Range hard-clamped to ≤ 90 days (panel wraps the hook's `rangeStart/rangeEnd`).
4. Wire into entity detail tabs.
5. **Verify:** open a profile → calendar tab → confirm reminders + meeting activities + (where applicable) deal close dates show.

### Slice J — Dashboard widgets (90 min)

1. `widgets/DueTodayWidget.tsx` — top 3–5 reminders due today; "View all" link.
2. `widgets/MyOverdueWidget.tsx` — count + top 3 overdue reminders.
3. `widgets/WeekAheadWidget.tsx` — 7-day horizontal strip with event counts.
4. `widgets/MiniCalendarWidget.tsx` — small month grid jump-to-date.
5. Wire into `DashboardHomeView`.
6. **Verify:** typecheck + tests pass + count Convex calls fired by the dashboard. Should NOT increase by 4 — widgets reuse existing org-page subscriptions (Convex dedupes).

### Slice K — Polish + docs (1 h)

1. Update `core/scheduling/reminders/STATE.md` and `core/scheduling/calendar/STATE.md` (✅ for everything new).
2. Update `core/scheduling/MODULE.md` (top-level scheduling overview).
3. Smoke-test on prod-like data: 50+ reminders, mixed assignees, mixed dates.
4. Run final Convex insights pull — must show 0 new spikes vs the 2026-05-18 baseline.

**Total budget: ~14 hours.** If a slice runs long, stop and reconcile against this doc instead of cutting corners.

---

## 8. Things to AVOID (lessons from prior incidents)

| ❌ Don't | ✅ Instead | Why |
|---|---|---|
| Add an `events` table | Keep `reminders` as SOT; calendar is read-merge | Single source of truth (decision #11) |
| Render `CalendarSidebar` inside an embedded panel | Embed `CalendarMain` only | No horizontal space; sidebar belongs to the org-wide view |
| Subscribe to a 5-year date range from a panel | Clamp `rangeEnd - rangeStart` to ≤ 90 days | Panel queries should be tight to keep transactions small |
| Bump `updatedAt: Date.now()` in `withOptimisticUpdate` | Let server stamp `updatedAt`; optimistic only writes the user-visible field | Cascading list invalidations (see notes/STATE.md notes-reorder fix) |
| Call `useQuery(api.users.queries.me)` in any new component | Use `useMe()` from `useCurrentOrg.tsx` | Per-component subscriptions to session data are a known regression — already cleaned up 2026-05-18 |
| Use `Element.scrollIntoView()` for "scroll to today" | Find scroll container, call `container.scrollTo` | Nested scroll containers shift the whole shell (decision #10) |
| Add ml-/mr-/pl-/pr- to any new component | Use ms-/me-/ps-/pe- | RTL safety (AGENTS.md global rule) |
| Hardcode `rounded-md` etc. | Use `rounded-[var(--radius)]` | Theme token system (AGENTS.md global rule) |
| Subscribe per-cell in the calendar grid | Bucket once at the parent, pass `events` prop down | Per-row data rule (AGENTS.md performance-critical) |
| Fire a mutation on `onDragOver` | Fire only on `onDragEnd` | Drag-persistence rule (AGENTS.md) |
| Subscribe to `listMyOrgs` to resolve `orgSlug → orgId` | Read `useCurrentOrg().orgId` | Auth/identity context rule (AGENTS.md). Cleaned up 2026-05-18 in entities, leads, deals, companies, contacts hooks. |

---

## 9. Verification gates

Before marking either feature done, run:

```bash
pnpm tsc --noEmit              # 0 errors
pnpm test                      # 110+ Convex tests
pnpm test:frontend             # 18+ frontend tests
pnpm exec biome check          # 0 lint errors
```

Manual checks:

1. Open Convex insights for the dev deployment. Filter for `crm.shared.reminders.*` and `crm.shared.calendar.*`. Confirm zero OCC retries / failures over the test session.
2. Open the Convex Function Calls dashboard, sort by call count. Reminders + Calendar functions must each be ≤ 1× the page-view count (meaning: one subscription per page mount, not per render).
3. Drag a reminder across the calendar grid — confirm exactly **one** `update` mutation fires (not one per drag-over event).
4. Open RemindersView with 50+ reminders — confirm zero per-row queries fire.

---

## 10. Locked decisions (add to AGENTS.md after this slice ships)

| # | Decision | Rationale |
|---|---|---|
| 21 | Reminders + Calendar UI uses the **donor pattern only** from shadcnstore, never the JSON mocks. | Keeps the UI coherent with existing scaffolds; removes parallel state machines. |
| 22 | Calendar grid is a pure renderer — `<CalendarMain>` accepts an `events` prop and never subscribes. | Decouples grid logic from data fetching; makes panels reusable. |
| 23 | EventForm is a thin wrapper around ReminderForm with calendar defaults. | One form to maintain; UX surfaces the "calendar event = reminder" model. |
| 24 | All scheduling mutations gate on `RATE_LIMITS.write`. | Same-class limits across writes (reminders.create / update / complete / remove). |
| 25 | Embedded calendar panels clamp to ≤ 90-day windows. | Bounds the read set; prevents 5-year scans. |

---

## Appendix A — Code-level tests to add

| File | Test |
|---|---|
| `lib/reminder-status.test.ts` | `getReminderState` returns "overdue" when `dueAt < now` and `status !== "completed"` |
| `lib/reminder-buckets.test.ts` | `bucketByDue` partitions correctly across DST boundaries |
| `lib/calendar-grid.test.ts` | Month grid handles month-start/end edge cases (Feb 29, week-starts-Sunday vs Monday) |
| `lib/calendar-buckets.test.ts` | `bucketByDay` keys by local YMD, not UTC |
| `lib/event-source-colors.test.ts` | Each source returns a stable hex code |
| `convex/crm-hardening.test.ts` (extend) | "calendar.getEvents respects scope=person filter even when caller has org-wide reminders.view" |
| `convex/crm-hardening.test.ts` (extend) | "reminders.update is rate-limited under RATE_LIMITS.write" |

---

## Appendix B — Telemetry baseline (2026-05-18)

Pre-slice baseline against which we measure UI-driven regressions:

```
crm/shared/notes/queries:listForOrg                15 docs / call,    9.1 KB,  ~150ms
crm/entities/leads/queries:list                    11 docs / call,    7.4 KB,  ~120ms
crm/shared/calendar/queries:getEvents              ?? docs / call (TBD post-build),   ~200ms target
crm/shared/reminders/queries:getDueToday           1-50 docs / call (depends on org), <100ms target
orgs/queries:getMyMembership                       3  docs / call,    2.5 KB,  ~100ms
users/queries:me                                   1  doc  / call,    0.6 KB,  ~100ms (now: 1× per session, not 9×)
```

Post-slice target: scheduling traffic adds at most 2 new query identifiers and ≤ 1 subscription per page mount.

---

> **End of file.** When you finish the slices, refresh `core/scheduling/{reminders,calendar}/STATE.md` and add a row to AGENTS.md "LOCKED DECISIONS" for entries 21–25 above.

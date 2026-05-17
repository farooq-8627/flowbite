# Core Features Architecture — Messages, Notes, Calendar, Reminders, Timeline

> **Scope.** Five cross-cutting workspace features (Messages, Notes, Calendar, Reminders, Timeline)
> + the 8-group `core/` regroup. They ship as org-wide pages, embedded panels in
> Profile/Deal/Company tabs, and dashboard widgets.
>
> **Status.** Messages feature is **complete** (backend + UI + panel + widget + Phase-3 hooks). Notes / Calendar / Reminders / Timeline UIs are still pending.
> **Last Updated.** 2026-05-17

---

## TL;DR

| Wave | Status | What |
|---|---|---|
| 1. Schema + permissions + reserved slugs | ✅ done | New `messages` table; `notes.isActivityChat` removed; 4 new permission keys; 6 new reserved slugs. |
| 2. Convex backend modules | ✅ done | `crm/shared/messages/{queries,mutations}.ts` and `crm/shared/calendar/queries.ts`. |
| 3. Folder regroup of `core/` into 8 groups | ✅ done | 73 files re-imported in one pass; pnpm typecheck green. |
| 4. Feature skeletons + hooks + thin route wrappers | ✅ done | 5 features (messages, notes, timeline, reminders, calendar) wired end-to-end through placeholder views. |
| 5a. Messages UI | ✅ done (2026-05-17) | Sidebar + thread + composer + voice notes + lightbox + mobile sheet + consecutive grouping + exact times + forward + RTL Sheet + SWR conversation switch + audio MIME backfill migration. See `core/comms/messages/STATE.md`. |
| 5b. Notes UI | ✅ done (2026-05-17) | Category Kanban + free-position drag-drop with persisted `sortOrder` + list ↔ board view toggle + per-card category & entity picker (context-aware) + ⋮ menu "Set reminder" wired to `useCreateReminder`. See `core/comms/notes/STATE.md`. |
| 5c. Calendar / Reminders / Timeline UI | ⬜ pending | This doc's remaining sections detail what's still to build. The `reminders.create` backend is fully wired and is already used by the note → reminder dialog; the Reminders UI just needs to render the existing rows. |

Reading order for the next session:
1. `FRONTEND-DECISIONS.md` (rules — esp. Rule 2, 12, 13, 14, 16, 20).
2. Each feature's `core/<group>/<feature>/STATE.md` for the pending task list.
3. This doc's §3 for **what UI to build, donor templates, sidebar/main split**.

---

## 0. Why six tables, not three (architectural rationale — keep)

Earlier draft reused the `notes` table for chat messages via an `isActivityChat: true` boolean.
On honest review, that decision was wrong — different concerns, different access patterns,
different schema needs. Six concepts → six dedicated tables (or read-merged views).

| Concept | Table | Lifecycle |
|---|---|---|
| Notes | `notes` | Edited, pinned, sometimes long-lived. Low volume. |
| Messages | `messages` (NEW) | Append-mostly. Status (sent/delivered/read). Reply/voice/attachments. High volume. |
| Notifications | `notifications` | Per-user alerts; mark-read, archive. |
| Activity Logs | `activityLogs` | Auto-fed audit trail; immutable. Very high volume. |
| Reminders | `reminders` | Date-tied; pending → completed. |
| Timeline | NO TABLE — UI view that merges activityLogs + notes + reminders. | n/a |
| Calendar | NO TABLE — UI view that merges reminders + activityLogs + deal close dates. | n/a |

**The killer argument is AI tool clarity.** Phase 3 gives the AI a tool registry where each
mutation maps 1:1 to a tool. With the `isActivityChat` flag, the AI would have to remember:

```
notes.create({ isActivityChat: true,  isInternal: false }) → message
notes.create({ isActivityChat: false, isInternal: true  }) → internal note
notes.create({ isActivityChat: false, isInternal: false }) → public note
```

With separate tables, the AI just calls `messages.send(...)` or `notes.create(...)`. Clean
semantics. Lower error rate. Independent indexes/RBAC/schema.

This decision **supersedes** the previous `FRONTEND-DECISIONS.md` Rule 2 (now updated).

---

## 1. Folder regroup — completed

`core/` is now organised into 8 group folders (alphabetical inside each group):

```
core/
├── shell/         ← shell/{auth,onboarding,shared,shell}        (boots + dashboard chrome)
├── platform/      ← platform/{profile,settings}                 (workspace pages)
├── entities/      ← entities/{_entities,scaffolds,shared,views}  (CRM records)
├── data-display/  ← data-display/{datatable,kanban,command-palette}
├── data-io/       ← data-io/{csv-import,files}
├── comms/         ← comms/{messages,notes,timeline}              (this revision)
├── scheduling/    ← scheduling/{reminders,calendar}              (this revision)
└── inbox/         ← inbox/{notifications,ai}                    (notifications UI pending)
```

**Note on the doubled `shell/shell/` path.** The group is `shell/`; the dashboard chrome submodule
is also `shell/`. Imports for chrome use `@/core/shell/shell/...`; auth/onboarding/shared use
`@/core/shell/{auth,onboarding,shared}/...`.

---

## 2. Backend additions — completed

### 2.1 Schema delta

| Change | Where | Notes |
|---|---|---|
| 🆕 `messages` table | `convex/schema/crmShared.ts` | 5 indexes: by_entity, by_org_and_personCode, by_org_and_created, by_org_and_thread, by_replyTo. |
| ➖ `notes.isActivityChat` field | `convex/schema/crmShared.ts` | Removed. No data existed (Phase-2 frontend hadn't been built). |
| 🆕 Wiring in schema index | `convex/schema.ts` | `messages: crmShared.messages`. |

### 2.2 Permissions delta (`convex/_shared/permissions/catalog.ts`)

| Key | Default roles |
|---|---|
| `messages.view` | Owner, Admin, Member, Viewer |
| `messages.send` | Owner, Admin, Member |
| `messages.delete` | Owner, Admin, Member |
| `messages.deleteAny` | Owner, Admin |

Module label "Messages" added to `PERMISSION_MODULE_LABELS` and `PERMISSION_MODULE_ORDER`.

### 2.3 Reserved slugs (`convex/_shared/reservedSlugs.ts`)

Added: `profile`, `messages`, `calendar`, `reminders`, `notes`, `timeline`. Orgs cannot rename a
CRM entity to any of these.

### 2.4 New Convex modules

| File | Exports |
|---|---|
| `convex/crm/shared/messages/queries.ts` | `listForEntity`, `listForPerson`, `listInbox`, `listRecent`, `getById` |
| `convex/crm/shared/messages/mutations.ts` | `send`, `markRead`, `markAllRead`, `remove` (each: requireOrgMember → requireRole → insert/patch → logActivity → sendNotification on assignee mismatch) |
| `convex/crm/shared/calendar/queries.ts` | `getEvents` — server-side merge of reminders + activityLogs (meeting/call/demo) + open-deal close dates. Returns typed `CalendarEventDTO[]`. |
| `convex/crm/shared/timeline/queries.ts` | (existing — `!r.isActivityChat` filter dropped). |

---

## 3. UI — what's left to build

Each feature has a placeholder `views/<X>View.tsx` that calls the right `useQuery` so data flows
end-to-end. The actual UI components, panels, and widgets are pending. Per-feature status lives
in each `STATE.md`; the table below is the cross-feature build map.

### 3.1 Sidebar/Main independence (LOCKED requirement)

Confirmed by user 2026-05-16: for Messages and Calendar, the **sidebar and the main section are
separate components**. Reason: embedded panels (Profile / Deal / Company tabs) have no horizontal
space for a sidebar.

| Feature | Sidebar component | Main component | Composition |
|---|---|---|---|
| Messages | `MessagesSidebar` (conversation list) | `MessagesThread` (active thread + input) | Org-wide view: both. Embedded panel: `MessagesThread` only. |
| Calendar | `CalendarSidebar` (mini-cal + filters + quick add) | `CalendarMain` (month/week/day grid) | Org-wide view: both. Embedded panel: `CalendarMain` only. |
| Reminders | (none — stats row + DataTable) | `RemindersTable` / `RemindersPanel` | Org-wide: stats + table. Embedded: compact list. |
| Notes | (filters chip — not a sidebar) | `NotesPanel` | Org-wide: filters + list. Embedded: composer + pinned + recent. |
| Timeline | (filters chip) | `PersonTimelinePanel` / `OrgTimelineView` | Org-wide: filters + feed. Embedded: feed only. |

### 3.2 Reuse map (build once, use four times)

| Surface | Messages | Notes | Timeline | Reminders | Calendar |
|---|---|---|---|---|---|
| Dashboard widget | `MessagesPreviewWidget` | `RecentNotesWidget` | `TimelineActivityWidget` | `DueTodayWidget`, `MyOverdueWidget` | `WeekAheadWidget`, `MiniCalendarWidget` |
| Org-wide page | `MessagesInboxView` (sidebar+main) | `NotesView` | `OrgTimelineView` | `RemindersView` (stats+table) | `CalendarView` (sidebar+main) |
| Profile tab | `MessagesPanel` (main only) | `NotesPanel` (+ `AIBriefingCard`) | `PersonTimelinePanel` | `RemindersPanel` | `PersonCalendarPanel` (main only) |
| Deal/Company tab | `MessagesPanel` | `NotesPanel` | `EntityTimelinePanel` | `RemindersPanel` | `EntityCalendarPanel` (main only) |
| Settings | — | — | `OrgTimelineView` (gated) | — | — |

### 3.3 Donor templates per feature

| Feature | Donor | Used for |
|---|---|---|
| Messages | **shadboard** `apps/chat/_components/*` (richer: text + images + files + voice + typed status) | `MessageBubble`, `MessageInput`, `MessagesSidebar`, `MessagesThread`, `ChatAvatar`. Drop the reducer/context/mock-data — replace with Convex live queries. |
| Messages — 3-pane shell | shadcnstore `(dashboard)/mail/components/mail.tsx` (`ResizablePanelGroup`) | Just the layout shell for `MessagesInboxView`. |
| Calendar | shadcnstore `(dashboard)/calendar/*` | `CalendarMain`, `CalendarSidebar`, `EventForm`, `EventChip`. Replace `use-calendar.ts` event handlers with Convex; keep only `viewMode`+`selectedDate` UI state. |
| Reminders | shadcnstore `(dashboard)/tasks/page.tsx` | Stats grid + DataTable. Reuses our existing `core/data-display/datatable/`. |
| Timeline | **NONE — custom UI** | Per user request 2026-05-16. Backend feeds `{icon, color, title, timestamp, body}`-shaped data. |
| Notes | **NONE — custom UI** | Per user request 2026-05-16 (no shadboard editor copy). |

### 3.4 Per-feature pending UI

See each `STATE.md` for the exact task list:
- `core/comms/messages/STATE.md`
- `core/comms/notes/STATE.md`
- `core/comms/timeline/STATE.md`
- `core/scheduling/reminders/STATE.md`
- `core/scheduling/calendar/STATE.md`

High-level cross-feature rules for UI work:
- RTL-safe Tailwind only (`ms-`, `me-`, `start-*`, `end-*`). No `ml-*`/`mr-*`/`pl-*`/`pr-*`/`left-*`/`right-*`.
- All `border-radius` via `rounded-[var(--radius)]`. No `rounded-md/lg/xl/full` except avatars.
- Real-time everywhere: `useQuery` is the source of truth. Drop any zustand-based event/message stores from donors.
- AI on-behalf messages: human's avatar + "AI" subscript badge (per FRONTEND-DECISIONS Rule 20).

---

## 4. Sidebar navigation — completed

`core/shell/shell/config/navigation.ts::buildNavigation` now returns three groups:

```
overview:
  - Dashboard      → /{orgSlug}
workspace (NEW):
  - Profile        → /{orgSlug}/profile          (UserCircle)
  - Messages       → /{orgSlug}/messages         (MessageSquare)
  - Calendar       → /{orgSlug}/calendar         (CalendarDays)
  - Reminders      → /{orgSlug}/reminders        (BellRing)
  - Notes          → /{orgSlug}/notes            (StickyNote)
  - Timeline       → /{orgSlug}/timeline         (Activity)
crm:
  - {entitySlot items, renamable per industry}
```

All workspace slugs are static and reserved.

---

## 5. Pending UI build order (suggested)

When UI work starts, do these in order to maximise reuse:

1. **Shared primitives** the user wants pre-built — pick from shadboard `components/{ui,dashboards}/`. Skipped intentionally: `ui/timeline.tsx` (custom), `ui/editor/*` (custom).
2. **Timeline UI** (smallest — backend already merges; just render).
3. **Notes UI** (custom; reuses no donor — fastest after Timeline).
4. **Messages UI** (largest — donor: shadboard chat).
5. **Reminders UI** (DataTable already exists in `core/data-display/datatable/`).
6. **Calendar UI** (donor: shadcnstore calendar).
7. **Dashboard widgets** (5 widgets composing the above).
8. **Profile detail page** Slice 2 — wire `ProfileContent` placeholders to real panels.

---

## 6. Acceptance criteria

This plan is complete when, after the pending UI work:

- [ ] `pnpm typecheck` 0 errors. (✅ already)
- [ ] `pnpm exec biome check .` 0 issues.
- [ ] `pnpm test` ≥ existing passing tests.
- [ ] Sidebar shows three groups: Dashboard / Workspace (6 items) / CRM. (✅ already)
- [ ] All six new workspace routes load without errors at `/{locale}/{orgSlug}/<route>`. (✅ data wired; UI pending)
- [ ] Profile tabs Messages, Timeline, Notes, Reminders, Calendar each render the real panel.
- [ ] Dashboard home shows live data via the 5–6 widgets.
- [ ] Two browser tabs open to the same org: action in one updates the other in <1s. (Convex live subscriptions — applies once UI lands.)
- [ ] Every new folder has `MODULE.md` and `STATE.md`. (✅ for the 5 features + 2 group folders touched in this revision.)
- [ ] Schema delta is exactly: +1 table (`messages`), -1 field (`notes.isActivityChat`), +2 modules (messages, calendar), +4 permission keys, +6 reserved slugs. (✅)
- [ ] `FRONTEND-DECISIONS.md` Rule 2 reflects the table split. (✅)

---

## 6b. Wave 5b — Notes (sticky board) + Reminders + Calendar

> Detailed build plan for the three remaining UI features that gate the Profile detail page.
> Timeline is deferred per user 2026-05-17.
> Schema deltas, migration steps, donor templates, file lists, and build order all live in this section.

### 6b.1 Notes — sticky-note board (NOT a long editor)

**Decision (2026-05-17):** Notes UI is a **sticky-note board** — colored cards arranged in a
responsive grid with filter chips, NOT a long-form editor.

**Why this is right for a CRM (honest pros/cons):**

| Question | Answer |
|---|---|
| Aren't notes typically long-form? | Not in a CRM. They're short observations: "called, voicemail", "wants pricing for premium", "demo'd Tuesday — interested". A long editor wastes vertical space and forces linear scrolling on a person with 50+ notes. |
| Why colors? | Instant visual scanning. Red = blocker, green = positive signal, yellow = follow-up, blue = info, purple = decision, pink/gray = idea/misc. The user filters by color and finds what they need without reading every card. |
| Why types in addition to colors? | Color is visual; type is semantic. AI sees `type: "blocker"` and treats it differently from `type: "general"`. Color is a UI choice; type is a data choice. They're decoupled (a `blocker` can be red OR yellow if the user prefers). |
| Will AI handle it cleanly? | Yes — `notes.create({ color: "red", type: "blocker", title?, content, scope })` is one tool call with finite enums. Better than a free-text "isImportant" boolean. |
| What about really long notes? | The card expands to show full content on click. Most stay short; long ones still work — but they shouldn't be the default scaffold. |
| Drag-to-reorder? | NO for v1. `isPinned` (already in schema) is the only ordering signal. Pinned cards float to the top of their color section. |
| Attachments / files? | Future. Not in v1. Attachments belong on the Files tab. |

**Sticky board > long editor for THIS app. Approved.**

#### 6b.1.1 Schema delta (BREAKING — needs migration)

Existing `notes` table already has: `content`, `isPinned`, `isInternal`, `authorId`,
`authorType`, `personCode`, `embedding`. We add **3 fields and 3 indexes**.

```ts
// convex/schema/crmShared.ts — `notes` table

export const notes = defineTable({
  ...orgScoped,
  entityType: v.string(),       // existing — "person"|"lead"|"contact"|"deal"|"company"|"org"|"project"|"task"
  entityId: v.string(),
  personCode: v.optional(v.string()),

  title: v.optional(v.string()),  // 🆕 short label (≤80 chars). Optional — most sticky cards are body-only.

  content: v.string(),

  color: v.union(                  // 🆕 fixed enum — drives card background + filter chip
    v.literal("yellow"),
    v.literal("blue"),
    v.literal("green"),
    v.literal("pink"),
    v.literal("purple"),
    v.literal("gray"),
  ),

  type: v.union(                   // 🆕 semantic classification (decoupled from color)
    v.literal("general"),          // default
    v.literal("follow_up"),        // soft hint that this should become a reminder
    v.literal("blocker"),          // negative signal
    v.literal("decision"),         // documented choice
    v.literal("idea"),             // brainstorm
    v.literal("ai_summary"),       // AI-generated context note
  ),

  authorId: v.id("users"),
  authorType: v.string(),
  isPinned: v.boolean(),
  isInternal: v.boolean(),
  embedding: v.optional(v.array(v.float64())),
  ...timestamps,
})
  .index("by_entity", ["orgId", "entityType", "entityId"])
  .index("by_entity_and_pinned", ["orgId", "entityType", "entityId", "isPinned", "createdAt"])  // 🆕 pinned-first
  .index("by_org_and_color", ["orgId", "color", "createdAt"])      // 🆕 board filter
  .index("by_org_and_type", ["orgId", "type", "createdAt"])        // 🆕 type filter
  .index("by_org_and_author", ["orgId", "authorId"])
  .index("by_org_and_personCode", ["orgId", "personCode"])
  .index("by_org_and_created", ["orgId", "createdAt"])
  .vectorIndex("by_embedding", { vectorField: "embedding", dimensions: 1536, filterFields: ["orgId"] });
```

**Migration (per AGENTS.md "Convex schema changes — migrate IN THE SAME MESSAGE"):**

```
File: convex/_migrations/2026-05-17-add-notes-color-and-type.ts
Action: internal mutation, paginated, idempotent.
For each existing notes row:
  if (!row.color) patch: { color: "yellow" }
  if (!row.type)  patch: { type: "general" }
Run on dev deployment, confirm row count, then ship.
```

#### 6b.1.2 Mutations delta

`convex/crm/shared/notes/mutations.ts::create` accepts new args:

```ts
create: args {
  orgId, entityType, entityId, personCode?, content,
  authorType, isInternal,
  title?: v.optional(v.string()),
  color: v.union(...),  // required
  type:  v.union(...),  // required
}
```

Add a new mutation:

```ts
update: now also accepts { title?, color?, type? } in addition to content.
setColor: orgMutation — fast path for the color-picker on the card.
setType:  orgMutation — fast path for the type dropdown.
```

`update` already exists; we extend it. `setColor` / `setType` are convenience mutations
(same RBAC as `update`) so the sticky-card can change one field without re-sending the whole body.

#### 6b.1.3 Permission catalog — no changes

`notes.view`, `notes.create`, `notes.updateOwn`, `notes.deleteOwn`, `notes.deleteAny`,
`notes.pin`, `notes.viewInternal` already exist. Color / type / title don't gate separately.

#### 6b.1.4 UI files (donor: NONE — custom)

```
core/comms/notes/
  components/
    NoteCard.tsx              ← sticky-note rendering. Pinned ribbon, color background, title (if any), body, footer (author + relative time + actions menu).
    NoteCardActions.tsx       ← ⋮ menu: Edit, Pin/Unpin, Change color (popover), Change type (dropdown), Internal toggle, Delete.
    NoteComposer.tsx          ← inline composer at top of board. Body textarea + optional title input + color swatch picker + type dropdown + Internal toggle + Save button. Cmd-Enter to save.
    NotesBoard.tsx            ← responsive grid (1 col on mobile, 2 on tablet, 3-4 on desktop). Renders: pinned-first, then by createdAt desc. Empty state.
    NotesFilterBar.tsx        ← chip row: All / By color (6 chips with the color swatch) / By type (dropdown) / By author / Pinned-only toggle. Filters compose. URL synced via nuqs.
    NotesPanel.tsx            ← embedded version for Profile/Deal/Company tabs. Composes Composer + FilterBar + Board. No org-wide nav.
    AIBriefingCard.tsx        ← sticky top of NotesPanel when on a person. Shows AI summary (Phase 3 fills it; Phase 2 placeholder).
    NoteAuthorBadge.tsx       ← user avatar OR AI subscript per FRONTEND-DECISIONS Rule 20.
  views/
    NotesView.tsx             ← org-wide board. Same FilterBar + Board, scoped to orgId only. Adds an "All entities" entity-type filter.
  widgets/
    RecentNotesWidget.tsx     ← dashboard card: last 5 notes across the org, color dots only.
  hooks/
    index.ts                  ← extend with: useNotesByColor, useNotesByType, useSetNoteColor, useSetNoteType.
```

**Color palette (6 fixed values mapped to CSS variables, NOT hex literals):**

```
yellow → bg-amber-100  text-amber-900   ring-amber-300/50
blue   → bg-sky-100    text-sky-900     ring-sky-300/50
green  → bg-emerald-100 text-emerald-900 ring-emerald-300/50
pink   → bg-pink-100    text-pink-900    ring-pink-300/50
purple → bg-violet-100  text-violet-900  ring-violet-300/50
gray   → bg-slate-100   text-slate-900   ring-slate-300/50
```

Dark-mode equivalents (`bg-amber-950/30 text-amber-200 ring-amber-700/40`) live in
`core/comms/notes/components/note-color-classes.ts`. UI components import from there —
no inline color logic.

#### 6b.1.5 RTL + theme rules (carry over from AGENTS.md)

- Use `ms-`, `me-`, `ps-`, `pe-`, `start-*`, `end-*` only.
- Card border-radius: `rounded-[var(--radius)]` (no `rounded-md`).
- Filter chips and color swatches: `rounded-full` (allowed for pills).
- All composer/card animations: `transition-colors duration-150`.

---

### 6b.2 Reminders + Followups

**Reminders == followups in this codebase.** The Convex table is `reminders`, the
generated code is `FU-001` (followUpCode), the user-facing label is "Reminder" / "Follow-up"
depending on locale. They're the SAME data; we never split them.

**Status:** backend complete, hooks complete, **UI is what's left**. Reminders **block**
Calendar — the Calendar's "Create Event" button calls `useCreateReminder`, so without a
working ReminderForm there's no way to create events from the calendar.

#### 6b.2.1 Build order inside Reminders

```
1. ReminderStatusBadge.tsx      ← pending / completed / overdue chip (used in 4 places).
2. ReminderForm.tsx (drawer)    ← Sheet drawer. Fields: title, note, dueAt (date+time picker),
                                  assignedTo (org member combo), source (enum), personCode
                                  (auto-filled when on profile), dealCode (optional).
                                  Used by: Calendar's "Create Event", Profile RemindersPanel,
                                  RemindersView "+ New" button.
3. useReminderColumns.ts        ← TanStack Table column defs for the DataTable:
                                  Title | Person | Due | Assigned to | Status | Actions.
4. ReminderRow.tsx              ← row component (used inside DataTable).
5. ReminderCard.tsx             ← compact card for the embedded panel.
6. RemindersPanel.tsx           ← profile/deal/company embed. List + "+ New" button.
                                  Filters: status (pending/completed/all). No stats row.
7. RemindersView.tsx (full UI)  ← org-wide. Stats grid (Due today / Overdue / This week / Completed)
                                  + DataTable. Donor: shadcnstore (dashboard)/tasks/page.tsx.
8. Dashboard widgets:
   DueTodayWidget.tsx     — top 5 due today.
   MyOverdueWidget.tsx    — top 5 overdue assigned to me.
```

#### 6b.2.2 ReminderForm details (the gating component)

```tsx
<ReminderForm
  open / onOpenChange
  defaultValues={{
    title?: string,
    dueAt?: number,          // calendar passes pre-selected date
    personCode?: string,     // profile passes current person
    dealCode?: string,       // deal panel passes current deal
    assignedTo?: Id<"users"> // defaults to current user
  }}
  onSaved={(reminderId) => ...}
/>
```

Internally calls `useCreateReminder` (already wired). On submit:
1. RBAC check inside the mutation (`reminders.create`).
2. `enforceRateLimit` (already in mutation).
3. `generateEntityCode` for `FU-001`.
4. `logActivity` with personCode.
5. `sendNotification` to assignee if not self.

#### 6b.2.3 No schema delta needed

The existing `reminders` table is already correct: `followUpCode`, `personCode`, `dealCode?`,
`title`, `note?`, `dueAt`, `assignedTo`, `status`, `source`, indexes for org/person/due/status.

#### 6b.2.4 Permission catalog — no changes

`reminders.view`, `reminders.create`, `reminders.manage` already exist.

---

### 6b.3 Calendar (donor: shadcnstore)

**Status:** `getEvents` query merging reminders + activityLogs + deal close-dates is
**already implemented**. Hooks wired. UI is what's left.

#### 6b.3.1 What we copy from shadcnstore (donor: `(dashboard)/calendar/`)

| Donor file | Take | Replace | Drop |
|---|---|---|---|
| `components/calendar-main.tsx` | Toolbar + 7-col grid + month/list view + detail dialog | Replace `eventsData` with `useCalendarEvents` (live Convex). Replace `event.color` Tailwind classes with our `event-source-colors` config. | `useState<CalendarEvent[]>` mock. |
| `components/calendar-sidebar.tsx` | Layout | Replace `<DatePicker>` with our shadcn Calendar primitive. Replace `<Calendars>` (mini-cal sources list) with our **source filters** (Reminders / Activity / Deals checkboxes). Drop "New Calendar" — single org calendar. | New Calendar button. |
| `components/event-form.tsx` | Drawer layout, date+time pickers, attendees UI | Replace entire body with `<ReminderForm>`. Show "Save as Reminder" copy. | Event types `meeting/event/personal/task/reminder` enum (we don't need it). |
| `components/quick-actions.tsx` | Stats grid layout | Pull stats from Convex (today's events, this week, pending) | Mock counts. |
| `components/date-picker.tsx` | Mini calendar + dot markers on event dates | Replace `events` mock with `useCalendarEvents` aggregated by day | mock data. |
| `use-calendar.ts` | `selectedDate` / `viewMode` / `showCalendarSheet` UI state | — | Everything else (event CRUD handlers — those are real Convex now). |
| `data.ts`, `data/*.json`, `types.ts` | nothing | — | All — we have our own `CalendarEventDTO`. |
| `components/calendar-unified.tsx` | nothing — confused unified version | — | All. |
| `components/calendars.tsx` | nothing — multi-calendar selector | — | All. |

#### 6b.3.2 UI files

```
core/scheduling/calendar/
  components/
    CalendarMain.tsx          ← month grid + toolbar + view-mode toggle (Month / List for v1).
    CalendarSidebar.tsx       ← mini-cal + source filters (Reminders / Activity / Deals checkboxes) + "Create Event" button.
    CalendarToolbar.tsx       ← extracted: prev / next / today / view-mode dropdown / search.
    EventChip.tsx             ← single event tile inside a day cell. Shows: color dot + time + title (truncate). Clicking opens EventDetailDialog.
    EventDetailDialog.tsx     ← read-only details for an existing event. "Edit" → opens ReminderForm (only for source=reminder).
    PersonCalendarPanel.tsx   ← profile embed. Renders only CalendarMain scoped to personCode.
    EntityCalendarPanel.tsx   ← deal/company embed. Same as Person but entity-scoped.
    event-source-colors.ts    ← {reminder: "amber", activity: "indigo", deal: "blue"} → Tailwind classes (no hex).
  views/
    CalendarView.tsx          ← already exists as placeholder. Replace with: CalendarSidebar + CalendarMain (sidebar+main two-pane layout). Mobile: CalendarMain only with a Sheet for sidebar.
  widgets/
    WeekAheadWidget.tsx       ← dashboard: 7-day rolling preview, max 5 events.
    MiniCalendarWidget.tsx    ← dashboard: month mini-cal with event-day dots.
  hooks/
    useCalendarUiState.ts     ← (NEW, page-local) viewMode + selectedDate (replaces use-calendar.ts UI state). Optionally synced to URL via nuqs.
```

#### 6b.3.3 "Create Event" wiring

Calendar's "Create Event" button does **not** create a calendar-event row — it opens
`<ReminderForm defaultValues={{ dueAt: selectedDate }}>`. This is locked
(FRONTEND-DECISIONS Rule 16) and visible to the user as "Save as Reminder" copy on the
button.

#### 6b.3.4 No schema delta needed

`calendar.getEvents` exists. `event-source-colors.ts` is a tiny config file, not a schema.

#### 6b.3.5 Permission catalog — no changes

`reminders.view` (gates calendar). `deals.view` and `activityLogs.viewOrg` are checked
inside `getEvents` to decide which layers to include.

---

### 6b.4 Profile-page integration (the gating slice)

`core/platform/profile/views/ProfileContent.tsx` already has placeholder groups for
Overview / Messages / Timeline / Notes / Deals / Files / Reminders / Calendar. Final wiring:

| Tab | Component | Source |
|---|---|---|
| Overview | `OverviewPanel` (existing) | personal info + relations |
| Messages | `MessagesPanel` (✅ done) | `core/comms/messages/components/MessagesPanel.tsx` |
| Notes | `NotesPanel` 🆕 | `core/comms/notes/components/NotesPanel.tsx` (sticky board) |
| Timeline | (deferred per user) | — |
| Reminders | `RemindersPanel` 🆕 | `core/scheduling/reminders/components/RemindersPanel.tsx` |
| Calendar | `PersonCalendarPanel` 🆕 | `core/scheduling/calendar/components/PersonCalendarPanel.tsx` |
| Deals | `DealsPanel` (existing scaffold) | per-person deals list |
| Files | `FilesPanel` (existing scaffold) | per-person files list |

Wiring step in `ProfileContent.tsx`: replace each placeholder block with the imported panel
inside `<TabsContent value="...">`. All panels accept `{ orgId, personCode }` and self-fetch
via their hooks — `ProfileContent` does no data work for them.

---

### 6b.5 Build order (the actual sequence)

```
PR 1 — Notes schema + migration
  1. Add color/type/title fields + 3 indexes to convex/schema/crmShared.ts::notes.
  2. Write convex/_migrations/2026-05-17-add-notes-color-and-type.ts (paginated, idempotent).
  3. Update convex/crm/shared/notes/mutations.ts::create + update to accept new fields.
  4. Add convex/crm/shared/notes/mutations.ts::setColor + setType helpers.
  5. Run migration on dev. Verify 0 schema errors.
  6. pnpm typecheck → 0. pnpm dev → no schema errors.

PR 2 — Notes UI (sticky board)
  Files: NoteCard, NoteCardActions, NoteComposer, NotesBoard, NotesFilterBar,
         NotesPanel, NoteAuthorBadge, AIBriefingCard, note-color-classes.ts.
  Hooks: extend index.ts with useNotesByColor/useNotesByType/useSetNoteColor/useSetNoteType.
  Update NotesView.tsx to render the board for org scope.

PR 3 — Reminders UI
  Files: ReminderStatusBadge, ReminderForm (drawer), useReminderColumns,
         ReminderRow, ReminderCard, RemindersPanel.
  Update RemindersView.tsx with stats grid + DataTable (donor: tasks/page.tsx).

PR 4 — Calendar UI (donor copy + rewire)
  Files: CalendarMain, CalendarSidebar, CalendarToolbar, EventChip,
         EventDetailDialog, PersonCalendarPanel, EntityCalendarPanel,
         event-source-colors.ts, useCalendarUiState.
  Update CalendarView.tsx to compose Sidebar + Main.
  "Create Event" → opens <ReminderForm>.

PR 5 — Profile-page wiring
  Replace placeholder blocks in core/platform/profile/views/ProfileContent.tsx
  with NotesPanel / RemindersPanel / PersonCalendarPanel / MessagesPanel.

PR 6 — Dashboard widgets (lowest priority)
  RecentNotesWidget, DueTodayWidget, MyOverdueWidget, WeekAheadWidget,
  MiniCalendarWidget. Add to DashboardLayoutClient.

Each PR ends with: pnpm typecheck → 0, pnpm exec biome check . → 0,
                   STATE.md updated for every touched module.
```

### 6b.6 Quick-reference: what blocks what

```
Notes UI    ← independent (schema delta first, then UI).
Reminders   ← independent (no schema; UI only).
Calendar    ← BLOCKED ON ReminderForm (PR 3 step 2). Calendar's "Create Event" calls
              <ReminderForm>; without it the calendar is read-only.
Profile     ← BLOCKED ON Notes UI + Reminders UI + Calendar UI. (Timeline deferred.)
Widgets     ← BLOCKED ON the panels they wrap.
```

So the strict sequence is: **Notes schema → Notes UI → Reminders UI → Calendar UI → Profile wiring → Widgets**.

### 6b.7 AI tool registry implications (Phase 3 forward-look)

When Phase 3 wires the AI tool registry, these mutations become tools 1:1:

| Tool | Schema | Notes |
|---|---|---|
| `notes.create` | `{ entityType, entityId, content, color, type, title?, isInternal? }` | Color + type are simple string enums — finite, AI-safe. |
| `notes.setColor` | `{ noteId, color }` | Fast path, AI can recolor on classification. |
| `notes.setType` | `{ noteId, type }` | Fast path, AI re-classifies. |
| `notes.togglePin` | `{ noteId }` | Existing. |
| `reminders.create` | `{ personCode, title, dueAt, assignedTo?, dealCode?, note?, source }` | source defaults to `"ai"` when AI calls it. |
| `reminders.complete` | `{ reminderId }` | Existing. |
| `calendar.getEvents` | `{ rangeStart, rangeEnd, scope, ... }` | Read-only — AI uses it to answer "what's on my calendar this week?". |

The sticky-board structure (color + type as enums, not free text) keeps AI tool calls
deterministic. This is the killer reason for the schema delta — beyond the UX win.

---
## 7. Open questions still to resolve

These were deferred per user 2026-05-16 ("first lets build these later we will decide them"):

1. **Industry-aware metric cards** — which industries get which metrics. Defer until Dashboard UI work begins.
2. **AI panel placement** — Option A (`core/inbox/ai/` slot in `DashboardLayoutClient`) is the working assumption; Option B (live inside `comms/messages/`) was rejected because per-entity message threads and the workspace assistant are different products.

Resolved this revision (no longer open):
- Profile slug: locked to `/profile/[personCode]`.
- AI scope: cross-app + route-aware (per FRONTEND-DECISIONS Rules 5, 20).
- Notes vs Timeline: separate tabs (Rule 14 superseded).
- Messages vs Notes: separate tables (Rule 2 split).
- AI on-behalf rendering: human's avatar + AI subscript.
- Sidebar/Main split for Messages and Calendar: independent components.
- Donor for chat: shadboard `apps/chat/` (NOT shadcnstore).
- Donor for Timeline + Notes editor: NONE — custom UI.

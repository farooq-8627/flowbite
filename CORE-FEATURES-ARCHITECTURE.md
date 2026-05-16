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
| 5b. Notes / Calendar / Reminders / Timeline UI | ⬜ pending | This doc's remaining sections detail what's still to build. |

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

# Tasks Module

> The canonical scheduling surface. Replaces the legacy `reminders` +
> `followups` modules per `TASKS-RENAME-PLAN.md` (Stage 4B — 2026-05-27).
> One table, one form, one route, one sidebar entry, one AI tool family.

## Why one module

Reminders and follow-ups were two surfaces over the same data. New
operators couldn't tell them apart, every row got a misleading
`FU-XXX` code regardless of source, and the AI inherited the confusion
(verb routing, error messages, prompt vocabulary). Industry-standard
CRMs (Salesforce, HubSpot, Pipedrive, Attio) use ONE noun (`Task` or
`Activity`) with a `type` discriminator. We adopted that pattern.

## Owned tables / data sources

| Source | Purpose |
|---|---|
| `tasks` (Convex table) | Indexes: `by_org_and_person`, `by_org_and_due`, `by_org_and_status_and_due`, `by_org_and_taskCode`, `by_org_and_type_and_due`, `by_user_and_due`. |

## Owned routes

| Route | View |
|---|---|
| `/{orgSlug}/tasks` | `views/TasksView.tsx` (org-wide stats + DataTable + Calendar + Today modes) |

## Owned settings

| Setting | Default | Purpose |
|---|---|---|
| `org.settings.codePrefixes.task` | `"T"` | Prefix for task codes (T-001…). |
| `org.settings.taskDefaults.defaultDueOffsetDays` | `3` | When the user creates a `type: "followup"` task without a date, default to today + N days. |
| `org.settings.taskDefaults.defaultPriority` | `"normal"` | Default priority on a new follow-up. |

## Layers

| Layer | Component | Purpose |
|---|---|---|
| `views/` | `TasksView` | Org-wide workspace — stats, tabs, DataTable, Calendar, Today |
| `panels/` | `TasksPanel` | Embedded in profile / deal / company tabs |
| `widgets/` | `DueTodayWidget`, `MyOverdueWidget` | Dashboard cards |
| `components/` | `TaskForm` | Single drawer for create + edit, type chip + priority always visible |
| `components/` | `TaskCard` | Compact card with type + priority + status chips |
| `components/` | `TaskTypeBadge`, `TaskStatusBadge`, `TaskQuickComplete`, `TaskEmptyState` | Building blocks |
| `components/columns/` | `useTaskColumns` | TanStack column defs |
| `hooks/` | `useTasksForPerson/Entity/Org`, `useCreateTask`, `useCompleteTask`, `useUpdateTask`, `useDeleteTask` | Convex bindings (with optimistic updates) |
| `lib/` | `task-buckets`, `task-status`, `task-type`, `task-priority` | Pure helpers |

## Permissions

| Action | Permission key |
|---|---|
| View | `tasks.view` |
| Create | `tasks.create` |
| Manage (update / complete / delete) | `tasks.manage` |

## Decisions

| # | Decision | Outcome |
|---|---|---|
| 1 | One Convex table, one form, one route, one AI tool family. | Decisions #1, #7, #8, #9, #10 in `TASKS-RENAME-PLAN.md`. |
| 2 | `type` is the closed-union discriminator (`todo / call / email / meeting / followup`). | Replaces the legacy `source` field. The `followup` type carries the CRM cadence semantics. |
| 3 | Type chip is the FIRST primary control on the form. | Operator scans it at a glance; selecting `followup` pulls org-default cadence. |
| 4 | Priority chip is ALWAYS visible. | Production-grade — every task carries urgency. |
| 5 | Three view modes (`list / calendar / today`) live inside `TasksView`. | URL-persisted via `?view=`. The calendar is a view of tasks, not a separate page. |
| 6 | Optimistic-update wrappers patch every cached list shape. | Per AGENTS.md "every list-affecting mutation has `withOptimisticUpdate`". The patcher walks 7 cached query shapes (getDueToday, getDueAndOverdue, getNextUpcoming, listAllForOrg, listForOrg, listForPerson, listOpen). |
| 7 | Cadence panel mode preserved via `<TasksPanel type="followup">`. | The Pipedrive-style 5-bucket cadence layout is still available where mounted (deal/company cadence-tab). The default 4-state buckets are used everywhere else. |
| 8 | (Stage 3 of `DASHBOARD-V2-PLAN.md`, 2026-05-29) `<TasksDataTable>` is the shared table chrome — used by `TasksView::ListMode` (full mode: `useTaskColumns` + `useDataTable` URL state + DataTableToolbar/ViewOptions) AND by the dashboard `<LiveTasksWidget>` (compact mode: plain `useReactTable`, no URL state, 5 cols, row click → onEdit). | The /tasks page and the dashboard widget had drifted: dashboard rendered a hand-rolled 8-row `<TasksCard>` with custom badges that didn't match the page's. Sharing the table component locks down "live tasks looks the same everywhere" forever; the `compact` prop is the only branch and lives in one file. The full-mode `useDataTable` URL writes are scoped to /tasks because compact mode uses a plain `useReactTable` — a dashboard remount never writes `?page=&perPage=&sort=`. |

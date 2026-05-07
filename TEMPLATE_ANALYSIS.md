# Template Analysis & Component Placement Map

> Written: 2026-05-07  
> Purpose: Map all usable components from 4 template repos into Orbitly's module structure.  
> Decision: Copy source → adapt to RTL + design system → place in correct module. Never import from template paths.

---

## Templates Scanned

| Repo | Path | Strength |
|---|---|---|
| `next-shadcn-admin-dashboard` | `/Clones/Orbitly/next-shadcn-admin-dashboard` | 5 industry dashboards (CRM, Analytics, Finance, Productivity, Default), data tables, charts |
| `shadcn-dashboard-2` | `/Clones/Orbitly/shadcn-dashboard-2` | Kanban (dnd-kit), notifications store, chat UI, form fields system, kbar command palette |
| `shadboard/full-kit` | `/Clones/Orbitly/shadboard/full-kit` | Notification bell dropdown, fullscreen toggle, language switcher, calendar app, email app, settings pages, design system showcase |
| `shadcnstore/nextjs-version` | `/Clones/Orbitly/shadcnstore/nextjs-version` | Calendar with sidebar, chat, dashboard-2 (metrics/charts), FAQ, error pages |

---

## The Core Problem: Industry Templates × Shared Components

You asked the right question. The challenge is:

> Different industries (Real Estate, B2B Sales, Freelancer, Healthcare) need different dashboards, different KPI cards, different pipeline stages — but they all share the same underlying UI primitives (charts, tables, kanban, calendar).

**The answer is a two-layer system:**

```
Layer 1: Shared UI primitives (industry-agnostic)
  → core/datatable/     — TanStack Table wrapper
  → core/kanban/        — dnd-kit board
  → core/timelines/     — activity feed
  → core/notifications/ — bell + store
  → core/settings/      — settings pages

Layer 2: Industry-specific dashboard compositions (use Layer 1 primitives)
  → features/industry-templates/dashboards/dubai-re/
  → features/industry-templates/dashboards/b2b-sales/
  → features/industry-templates/dashboards/freelancer/
  → features/industry-templates/dashboards/analytics/
  → features/industry-templates/dashboards/finance/
```

The `platformTemplates` DB table (already designed) controls WHICH dashboard a workspace sees. The dashboard page reads `org.templateKey` and renders the matching composition.

---

## Component Placement Map

### 1. TopNav additions → `core/shell/components/`

These 3 go directly into the existing TopNav. They are shell-level, not feature-level.

| Component | Source | Target file | Notes |
|---|---|---|---|
| Notification bell dropdown | `shadboard/full-kit/src/components/layout/notification-dropdown.tsx` | `core/shell/components/NotificationBell.tsx` | Replace static bell in TopNav. Reads from `convex/notifications`. RTL: use `end-*` for badge position |
| Fullscreen toggle | `shadboard/full-kit/src/components/layout/full-screen-toggle.tsx` | `core/shell/components/FullscreenToggle.tsx` | Pure client component, no data. Drop into TopNav next to theme switcher |
| Language switcher | `shadboard/full-kit/src/components/language-dropdown.tsx` | `core/shell/components/LanguageSwitcher.tsx` | Wraps `next-intl` routing. Already have `i18n/routing.ts`. RTL: `dir` prop on DropdownMenu |

**TopNav order after additions:**
```
[Search ⌘J] ··· [Language] [Fullscreen] [Bell] [Theme] [AI ⌘.]
```

---

### 2. Dashboard home page → `app/[locale]/[orgSlug]/dashboard/`

The dashboard home page is **industry-aware**. It reads `org.templateKey` and renders the matching dashboard composition.

| Component | Source | Target | Notes |
|---|---|---|---|
| Default metric cards | `next-shadcn-admin-dashboard/.../default/_components/metric-cards.tsx` | `features/industry-templates/dashboards/default/metric-cards.tsx` | Generic: Total Revenue, Active Users, New Leads, Conversion |
| Performance overview chart | `next-shadcn-admin-dashboard/.../default/_components/performance-overview.tsx` | `features/industry-templates/dashboards/default/performance-overview.tsx` | Recharts AreaChart, already have recharts installed |
| CRM KPI cards | `next-shadcn-admin-dashboard/.../crm/_components/kpi-cards.tsx` | `features/industry-templates/dashboards/crm/kpi-cards.tsx` | Leads, Pipeline Value, Win Rate, Avg Deal Size |
| CRM Pipeline activity | `next-shadcn-admin-dashboard/.../crm/_components/pipeline-activity.tsx` | `features/industry-templates/dashboards/crm/pipeline-activity.tsx` | Bar chart of stage counts |
| CRM Task reminders | `next-shadcn-admin-dashboard/.../crm/_components/task-reminders.tsx` | `features/industry-templates/dashboards/crm/task-reminders.tsx` | Upcoming follow-ups list |
| CRM Opportunities table | `next-shadcn-admin-dashboard/.../crm/_components/opportunities-table/` | `features/industry-templates/dashboards/crm/opportunities-table/` | TanStack Table, adapt columns to Convex data |
| Analytics overview | `next-shadcn-admin-dashboard/.../analytics/_components/analytics-overview.tsx` | `features/industry-templates/dashboards/analytics/overview.tsx` | Multi-chart layout |
| Finance KPIs | `next-shadcn-admin-dashboard/.../finance/_components/kpis/` | `features/industry-templates/dashboards/finance/kpis/` | Net worth, cash flow, savings rate cards |
| Finance cash flow chart | `next-shadcn-admin-dashboard/.../finance/_components/cash-flow-overview.tsx` | `features/industry-templates/dashboards/finance/cash-flow.tsx` | |
| Productivity summary | `next-shadcn-admin-dashboard/.../productivity/_components/summary-cards.tsx` | `features/industry-templates/dashboards/productivity/summary-cards.tsx` | Tasks done, focus time, streak |
| Productivity calendar panel | `next-shadcn-admin-dashboard/.../productivity/_components/calendar-panel.tsx` | `features/industry-templates/dashboards/productivity/calendar-panel.tsx` | Mini calendar widget |
| Productivity tasks section | `next-shadcn-admin-dashboard/.../productivity/_components/tasks-section.tsx` | `features/industry-templates/dashboards/productivity/tasks-section.tsx` | |
| Dashboard-2 metrics | `shadcnstore/.../dashboard-2/components/metrics-overview.tsx` | `features/industry-templates/dashboards/default/metrics-overview.tsx` | Alternative metric layout |
| Dashboard-2 sales chart | `shadcnstore/.../dashboard-2/components/sales-chart.tsx` | `features/industry-templates/dashboards/default/sales-chart.tsx` | |

**Dashboard page routing logic:**
```typescript
// app/[locale]/[orgSlug]/dashboard/page.tsx
const templateKey = org.templateKey ?? "default"
// Render matching dashboard composition
```

---

### 3. Kanban → `core/kanban/`

Already has a MODULE.md. The implementation goes here.

| Component | Source | Target | Notes |
|---|---|---|---|
| Board column | `shadcn-dashboard-2/src/features/kanban/components/board-column.tsx` | `core/kanban/components/BoardColumn.tsx` | dnd-kit SortableContext |
| Kanban board | `shadcn-dashboard-2/src/features/kanban/components/kanban-board.tsx` | `core/kanban/components/KanbanBoard.tsx` | DndContext wrapper |
| Task card | `shadcn-dashboard-2/src/features/kanban/components/task-card.tsx` | `core/kanban/components/TaskCard.tsx` | useSortable hook |
| New task dialog | `shadcn-dashboard-2/src/features/kanban/components/new-task-dialog.tsx` | `core/kanban/components/NewTaskDialog.tsx` | |
| Restrict to container | `shadcn-dashboard-2/src/features/kanban/utils/restrict-to-container.ts` | `core/kanban/utils/restrict-to-container.ts` | dnd-kit modifier |

**Used by:** CRM pipeline view, Project management board, any entity with stage-based workflow.

---

### 4. Notifications → `core/notifications/`

Already has MODULE.md and empty `components/` + `hooks/` dirs.

| Component | Source | Target | Notes |
|---|---|---|---|
| Notification bell + popover | `shadboard/full-kit/src/components/layout/notification-dropdown.tsx` | `core/notifications/components/NotificationBell.tsx` | Reads from `convex/notifications`. RTL: badge uses `-end-1` not `-right-1` |
| Notification center page | `shadcn-dashboard-2/src/features/notifications/components/notification-center.tsx` | `core/notifications/components/NotificationCenter.tsx` | Full page view |
| Notifications store | `shadcn-dashboard-2/src/features/notifications/utils/store.ts` | `core/notifications/hooks/useNotifications.ts` | Replace Zustand mock with Convex `useQuery` |

---

### 5. Data Tables → `core/datatable/`

Already has MODULE.md. The generic TanStack Table wrapper goes here. Feature-specific column definitions stay in their feature folder.

| Component | Source | Target | Notes |
|---|---|---|---|
| Generic data table | `shadcn-dashboard-2/src/features/products/components/product-tables/index.tsx` | `core/datatable/components/DataTable.tsx` | TanStack Table v8, server-side pagination |
| Cell action pattern | `shadcn-dashboard-2/src/features/products/components/product-tables/cell-action.tsx` | `core/datatable/components/CellActions.tsx` | Dropdown with Edit/Delete |
| Table toolbar | `shadcn-dashboard-2/src/features/users/components/users-table/options.tsx` | `core/datatable/components/TableToolbar.tsx` | Search + filter + column visibility |
| Form fields system | `shadcn-dashboard-2/src/components/forms/fields/` | `core/datatable/forms/` | checkbox, select, text, textarea, switch fields |

---

### 6. Calendar → `core/timelines/` or new `core/calendar/`

The calendar is complex enough to warrant its own module.

| Component | Source | Target | Notes |
|---|---|---|---|
| Full calendar app | `shadcnstore/.../calendar/components/calendar-unified.tsx` | `core/calendar/components/Calendar.tsx` | Full calendar with sidebar |
| Calendar sidebar | `shadcnstore/.../calendar/components/calendar-sidebar.tsx` | `core/calendar/components/CalendarSidebar.tsx` | Mini calendar + calendars list |
| Event form | `shadcnstore/.../calendar/components/event-form.tsx` | `core/calendar/components/EventForm.tsx` | Create/edit event |
| Productivity calendar panel | `next-shadcn-admin-dashboard/.../productivity/_components/calendar-panel.tsx` | `core/calendar/components/CalendarPanel.tsx` | Mini widget for dashboard |

**Decision:** Create `core/calendar/` module. Used by productivity dashboard, project management, and CRM follow-up scheduling.

---

### 7. Settings pages → `core/settings/`

Already has MODULE.md with empty `pages/` and `layouts/` dirs.

| Component | Source | Target | Notes |
|---|---|---|---|
| Profile settings | `shadboard/full-kit/.../pages/account/profile/page.tsx` + components | `core/settings/pages/profile.tsx` | Avatar upload, name, email |
| Account settings | `shadboard/full-kit/.../pages/account/settings/page.tsx` | `core/settings/pages/account.tsx` | Password, 2FA |
| Notification settings | `shadboard/full-kit/.../pages/account/settings/notifications/page.tsx` | `core/settings/pages/notifications.tsx` | Email/push prefs |
| Plan & billing | `shadboard/full-kit/.../pages/account/settings/plan-and-billing/page.tsx` | `core/settings/pages/billing.tsx` | |
| Security | `shadboard/full-kit/.../pages/account/settings/security/page.tsx` | `core/settings/pages/security.tsx` | Sessions, API keys |
| Settings layout | `shadboard/full-kit/src/components/layout/` | `core/settings/layouts/SettingsLayout.tsx` | Tabs sidebar layout |

---

### 8. Chat / AI Panel → `core/ai/`

Already has MODULE.md. The chat UI components go here.

| Component | Source | Target | Notes |
|---|---|---|---|
| Chat area | `shadcn-dashboard-2/src/features/chat/components/chat-area.tsx` | `core/ai/components/ChatArea.tsx` | Message list + composer |
| Message bubble | `shadcn-dashboard-2/src/features/chat/components/message-bubble.tsx` | `core/ai/components/MessageBubble.tsx` | User vs AI styling |
| Message composer | `shadcn-dashboard-2/src/features/chat/components/message-composer.tsx` | `core/ai/components/MessageComposer.tsx` | Textarea + send + attach |
| Conversation list | `shadcnstore/.../chat/components/conversation-list.tsx` | `core/ai/components/ConversationList.tsx` | History sidebar |

---

### 9. Error / Status pages → `app/[locale]/`

| Component | Source | Target | Notes |
|---|---|---|---|
| 404 not found | `shadboard/full-kit/.../pages/not-found-404.tsx` | `app/[locale]/not-found.tsx` | Already have this route |
| 401 unauthorized | `shadboard/full-kit/.../pages/unauthorized-401.tsx` | `app/[locale]/unauthorized/page.tsx` | |
| Maintenance | `shadboard/full-kit/.../pages/maintenance.tsx` | `app/[locale]/maintenance/page.tsx` | |
| Coming soon | `shadboard/full-kit/.../pages/coming-soon/` | `app/[locale]/coming-soon/page.tsx` | |

---

### 10. Form fields system → `components/forms/`

These are shared across all features. They belong in the global `components/` layer, not in any module.

| Component | Source | Target |
|---|---|---|
| TextField | `shadcn-dashboard-2/src/components/forms/fields/text-field.tsx` | `components/forms/fields/TextField.tsx` |
| SelectField | `shadcn-dashboard-2/src/components/forms/fields/select-field.tsx` | `components/forms/fields/SelectField.tsx` |
| CheckboxField | `shadcn-dashboard-2/src/components/forms/fields/checkbox-field.tsx` | `components/forms/fields/CheckboxField.tsx` |
| SwitchField | `shadcn-dashboard-2/src/components/forms/fields/switch-field.tsx` | `components/forms/fields/SwitchField.tsx` |
| TextareaField | `shadcn-dashboard-2/src/components/forms/fields/textarea-field.tsx` | `components/forms/fields/TextareaField.tsx` |
| FileUploadField | `shadcn-dashboard-2/src/components/forms/fields/file-upload-field.tsx` | `components/forms/fields/FileUploadField.tsx` |

---

## Industry Dashboard Compositions

This is the key architectural decision. Each industry gets a **composition file** that assembles shared primitives into an industry-specific layout. The `platformTemplates` DB row controls which composition renders.

```
features/industry-templates/
  dashboards/
    default/          ← Generic SaaS (fallback)
      page.tsx        ← Metric cards + area chart + recent table
    crm/              ← B2B Sales / Generic CRM
      page.tsx        ← KPI cards + pipeline activity + task reminders + opportunities table
    dubai-re/         ← Dubai Real Estate (PRIMARY — build first)
      page.tsx        ← Inquiry funnel + viewing pipeline + deal value + AI morning brief
    analytics/        ← Analytics-heavy businesses
      page.tsx        ← Multi-chart layout
    finance/          ← Finance / Accounting
      page.tsx        ← Net worth + cash flow + spending breakdown
    productivity/     ← Freelancers / Agencies
      page.tsx        ← Tasks + calendar panel + focus card + projects
```

**How the dashboard page selects the composition:**
```typescript
// app/[locale]/[orgSlug]/dashboard/page.tsx
import { getDashboardComposition } from "@/features/industry-templates/dashboards"

export default async function DashboardPage({ params }) {
  const org = await getOrg(params.orgSlug)
  const Dashboard = getDashboardComposition(org.templateKey ?? "default")
  return <Dashboard orgId={org._id} />
}
```

---

## AI Morning Brief — Where It Lives

From `core/ai/MODULE.md` decisions: The AI morning brief is a **dashboard widget**, not a full page. It lives in:

```
features/industry-templates/dashboards/[industry]/ai-morning-brief.tsx
```

Each industry's morning brief has different content:
- **Dubai RE**: Today's viewings, expiring listings, hot leads
- **B2B Sales**: Deals closing this week, stale leads, pipeline health
- **Freelancer**: Overdue tasks, upcoming deadlines, client messages
- **Finance**: Cash position, upcoming payments, budget alerts

The AI generates the brief via `convex/ai/processChat.ts` (internalAction) using the org's `aiPersona` from `platformTemplates`. The widget calls a Convex query that returns the cached brief (refreshed daily by Trigger.dev scheduled job).

---

## RTL Adaptation Rules for All Imported Components

Every component copied from templates needs these changes:

| Template pattern | Orbitly pattern |
|---|---|
| `ml-*`, `mr-*` | `ms-*`, `me-*` |
| `pl-*`, `pr-*` | `ps-*`, `pe-*` |
| `left-*`, `right-*` | `start-*`, `end-*` |
| `rounded-md/lg/xl` | `rounded-[--radius]` |
| Hardcoded `"Orbitly"` | `APP_CONFIG.name` |
| Static mock data | Convex `useQuery` |
| `react-query` / `fetch` | Convex queries/mutations |
| Clerk auth | Convex Auth (`useAuthActions`) |

---

## Implementation Order (Phase 1 → Phase 2)

### Phase 1 (Now — before CRM)
1. ✅ Shell sidebar/nav done
2. **P1-02**: Seed default pipeline mutation → `convex/crm/shared/pipelines/mutations.ts`
3. **P1-01**: Dashboard home page → `default` composition (metric cards + chart) + `crm` composition (KPI cards + pipeline activity)
4. **P1-03**: `invitations.accept` uses roleId
5. **P1-04**: `useOrgPermission` loads from DB
6. **TopNav additions**: NotificationBell + FullscreenToggle + LanguageSwitcher (from shadboard)

### Phase 2 (CRM)
1. Leads list page → `core/datatable` + `core/entities/leads`
2. Contacts list page → same pattern
3. Deals kanban → `core/kanban` + `core/entities/deals`
4. Pipeline settings → `core/settings`

### Phase 3 (Industry Dashboards)
1. Dubai RE dashboard composition
2. Analytics dashboard composition
3. Finance dashboard composition
4. Productivity dashboard composition

---

## What NOT to Import

| Template component | Reason to skip |
|---|---|
| Auth forms (all templates) | Already built with Convex Auth |
| Sidebar/nav (all templates) | Already built, better than templates |
| Theme system (shadboard) | Already have 5 presets + CSS vars |
| Clerk/NextAuth wrappers | Using Convex Auth |
| React Query / SWR | Using Convex reactive queries |
| Prisma models | Using Convex schema |
| Mock data files | Replace with Convex queries |
| `kbar` command palette (shadcn-dashboard-2) | Already have `core/command-palette` with cmdk |

---

## Summary

You have **4 templates with ~300+ components**. The strategy is:

1. **Don't import everything at once** — it creates dead code and confusion
2. **Import per feature, per phase** — when you build the kanban page, copy the kanban components then
3. **Two layers**: shared primitives in `core/`, industry compositions in `features/industry-templates/dashboards/`
4. **AI reduces work**: The AI morning brief + template generation means you don't need to manually build every industry dashboard — the AI can generate a `platformTemplates` row from a conversation, and the composition renders it
5. **RTL is non-negotiable**: Every import gets the RTL pass before committing

The 3 immediate wins from shadboard for the TopNav (notification bell, fullscreen toggle, language switcher) are self-contained and can be added in one session without touching any other module.
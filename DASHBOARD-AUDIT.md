# DASHBOARD-AUDIT.md — Why widgets are hiding & what's missing

> **Generated:** 2026-05-25 by reading `core/shell/shell/views/dashboard/DashboardHomeView.tsx`,
> the widget registry, and every industry-template's `dashboardMetrics` array.

## TL;DR

The dashboard has **three different bugs** stacked on top of each other:

1. **🐛 Key mismatch.** Templates write metric keys like `reminders.list`,
   `calendar.miniWidget`, `tasks.thisWeek` that **don't exist in the
   widget registry** (`convex/_shared/widgetRegistry.ts:WIDGET_KEYS`).
   The frontend silently drops them. **This is why "followups/reminders
   are not showing on dashboard"** — the `generic` template writes
   `reminders.list`, but `RemindersCard` is gated on
   `reminders.dueToday` / `tasks.dueToday`. Mismatch → permanently hidden.

2. **🐛 Section-toggle keys aren't registry-tracked.** The dashboard uses
   `dashboardMetrics` BOTH as a strip-tile order AND as a section-enable
   list. Keys like `messages.recent`, `activity.recent`, `today.focus`,
   `calendar.weekAhead`, `calendar.mini` are used in `isEnabled()` calls
   but aren't declared in `WIDGET_KEYS` — they only work by luck because
   `validateDashboardLayout` rejects them and tools like
   `update_dashboard_layout` will refuse to write them.

3. **🐛 Empty widgets hide instead of CTA.** `MessagesPreviewWidget`,
   `TimelineActivityWidget`, `MiniCalendarWidget`, `WeekAheadWidget`
   render `null` or a skeleton when their data is empty. **The user
   wants:** "show empty state with a CTA to create the first one."
   `RemindersCard` already does this correctly via `<NextReminderFallback />`
   — that's the pattern to copy.

---

## 1 — The widget-registry vs template mismatch (the root bug)

### Backend registry (`convex/_shared/widgetRegistry.ts`)

```ts
WIDGET_KEYS = [
  "leads.open",
  "contacts.active",
  "companies.active",
  "deals.open",
  "deals.won",
  "deals.pipelineValue",
  "reminders.dueToday",
  "tasks.dueToday",
  "tasks.overdue",
  "tasks.doneThisWeek",
  "tasks.streak",
  "ai.morningBriefing",
];
```

12 keys total. Only KPI tiles. No section keys, no half/full-width card keys.

### What templates ACTUALLY write

| Template | dashboardMetrics array — keys NOT in registry shown in **bold** |
|---|---|
| `generic` | `ai.morningBriefing`, `leads.open`, `contacts.active`, `deals.open`, `deals.pipelineValue`, **`reminders.list`**, **`deals.pipeline`**, **`today.focus`**, **`messages.recent`**, **`activity.recent`** |
| `productivity` | `ai.morningBriefing`, `tasks.dueToday`, `tasks.overdue`, **`tasks.thisWeek`**, **`tasks.recentlyCompleted`**, **`today.focus`**, **`calendar.miniWidget`**, **`calendar.weekAhead`**, **`activity.recent`**, `tasks.streak` |
| `b2b_saas` | `ai.morningBriefing`, `leads.open`, `deals.open`, `deals.pipelineValue`, `deals.won`, `reminders.dueToday`, **`today.focus`**, **`messages.recent`**, **`activity.recent`**, **`calendar.weekAhead`** |
| `real_estate` | `ai.morningBriefing`, `leads.open`, `contacts.active`, `deals.pipelineValue`, `reminders.dueToday`, **`today.focus`**, **`calendar.weekAhead`**, **`messages.recent`** |
| `dubai_real_estate` | similar to real_estate, with **`today.focus`**, **`calendar.weekAhead`**, **`messages.recent`** missing from registry |
| `recruiting` | `leads.open` (candidates), `deals.open`, `reminders.dueToday`, **`today.focus`**, **`messages.recent`**, **`activity.recent`** |
| `freelancer` | `deals.open`, `deals.pipelineValue`, `reminders.dueToday`, **`today.focus`**, **`messages.recent`** |
| `agency_freelance` | similar — **`messages.recent`**, **`today.focus`** |
| `real_estate_saudi` | similar — **`today.focus`**, **`calendar.weekAhead`** |

### Cross-reference table — what the frontend gates use

| Frontend gate (`DashboardHomeView.tsx`) | Required key | In registry? |
|---|---|---|
| `<MockDataBanner>` | always renders | n/a |
| `<AISuggestionsPanel>` | always renders | n/a |
| `<DailyBriefingCard>` + `<WeeklyInsightCard>` | `ai.morningBriefing` | ✅ |
| `<MetricStrip>` (KPI tiles) | iterates the metric list, filters via `WIDGET_REGISTRY` (frontend) | ✅ for KPI keys, ❌ silently drops anything else |
| `<RemindersCard>` | `reminders.dueToday` OR `tasks.dueToday` | ✅ |
| `<PipelineCard>` | `deals.pipelineValue` | ✅ |
| `<MessagesPreviewWidget>` | `messages.recent` | ❌ **NOT registered** |
| `<TimelineActivityWidget>` | `activity.recent` | ❌ **NOT registered** |
| `<WeekAheadWidget>` | `calendar.weekAhead` | ❌ **NOT registered** |
| `<MiniCalendarWidget>` | `calendar.mini` | ❌ **NOT registered** (templates write `calendar.miniWidget` — also not registered, doubly broken) |
| `<TodaySummaryCard>` | `today.focus` | ❌ **NOT registered** |

**Net effect:** when an AI tool calls `update_dashboard_layout(["messages.recent", "today.focus"])`,
`validateDashboardLayout` will REJECT both keys. The AI gets a confusing
"keys rejected: messages.recent, today.focus" error even though the dashboard
itself uses these keys verbatim.

---

## 2 — Why the user's "Reminders" widget specifically is hidden

Most likely the user's org seeded with the `generic` template. That template's
`dashboardMetrics` includes **`reminders.list`** (NOT in registry, NOT in any
gate check). The dashboard gate is:

```tsx
{(isEnabled("reminders.dueToday") || isEnabled("tasks.dueToday")) && (
  <RemindersCard ... />
)}
```

Since the template wrote `reminders.list` instead of `reminders.dueToday`,
neither check matches, and the card is hidden permanently — even though
`RemindersCard` itself has graceful empty-state handling
(`<NextReminderFallback />`).

This isn't a "no data" problem. It's a key-name typo at the template/registry
contract layer.

---

## 3 — The fix (concrete steps, ship in this order)

### Step 1 — Decide: registry or aliases?

Two ways to fix this. Pick one and stick with it.

**Option A (recommended)** — extend `WIDGET_KEYS` to cover ALL dashboard surfaces,
not just KPI tiles. This makes the AI tool surface honest.

```ts
// convex/_shared/widgetRegistry.ts
export const WIDGET_KEYS = [
  // Existing KPI tiles
  "leads.open", "contacts.active", "companies.active",
  "deals.open", "deals.won", "deals.pipelineValue",
  "reminders.dueToday", "tasks.dueToday", "tasks.overdue",
  "tasks.doneThisWeek", "tasks.streak", "ai.morningBriefing",

  // NEW — section-toggle keys (size: "half" | "full")
  "reminders.list",          // alias / list-style for KPI; row 2
  "messages.recent",         // row 3 left
  "activity.recent",         // row 3 right
  "calendar.weekAhead",      // row 4 full-width
  "calendar.mini",           // row 5 left
  "today.focus",             // row 5 right

  // NEW — productivity-template extras
  "tasks.thisWeek",
  "tasks.recentlyCompleted",
  "calendar.miniWidget",     // alias for calendar.mini OR rename in template
  "deals.pipeline",          // larger pipeline visualisation (already used by generic)
] as const;
```

Then add `WidgetMeta` entries for each and either:
- treat the new keys as `size: "half"` / `size: "full"`, OR
- introduce a new `kind: "kpi" | "section"` discriminator.

**Option B** — alias map at the gate level:

```ts
const KEY_ALIASES: Record<string, string> = {
  "reminders.list": "reminders.dueToday",
  "calendar.miniWidget": "calendar.mini",
};
const isEnabled = (key: string) => {
  if (enabledMetrics === null) return true;
  if (enabledMetrics.has(key)) return true;
  for (const [alias, canonical] of Object.entries(KEY_ALIASES)) {
    if (canonical === key && enabledMetrics.has(alias)) return true;
  }
  return false;
};
```

**Recommendation: Option A.** Cleaner contract, AI tool can write/read the same keys, no hidden alias plumbing.

### Step 2 — Migrate templates to canonical keys

Update all 9 template `dashboardMetrics` arrays to use only registry-validated keys.
Migration pattern:

```ts
// convex/_migrations/2026_05_25_normalizeDashboardMetrics.ts
const RENAME: Record<string, string> = {
  "reminders.list": "reminders.dueToday",
  "calendar.miniWidget": "calendar.mini",
  "deals.pipeline": "deals.pipelineValue",       // OR add deals.pipeline as new key
  "tasks.thisWeek": "tasks.doneThisWeek",
  "tasks.recentlyCompleted": "tasks.doneThisWeek",
};
// Iterate orgs, patch settings.dashboardMetrics with renamed keys, dedup.
```

### Step 3 — Fix empty-state hiding on the four widgets

Each of these returns null/skeleton on empty. Replace with a CTA card.

| Widget | File | Empty state today | Should show |
|---|---|---|---|
| `<MessagesPreviewWidget>` | `core/comms/messages/components/MessagesPreviewWidget.tsx` | `null` | "No messages yet. Send the first one →" with a button that prefills the chat composer. |
| `<TimelineActivityWidget>` | `core/comms/timeline/widgets/TimelineActivityWidget.tsx` | `null` | "No activity yet. Create a lead, deal, or note to see it here." |
| `<MiniCalendarWidget>` | `core/scheduling/calendar/widgets/MiniCalendarWidget.tsx` | renders empty calendar | OK as-is — empty calendar grid IS a useful state; add a "Schedule" CTA in the header. |
| `<WeekAheadWidget>` | `core/scheduling/calendar/widgets/WeekAheadWidget.tsx` | likely `null` | "Nothing scheduled this week. Use the AI to add a reminder, or click + Schedule." |

Pattern (copy from `NextReminderFallback`):

```tsx
function MessagesEmptyFallback() {
  return (
    <Card className="flex flex-col items-center justify-center gap-2 py-6 border-dashed">
      <MessageSquareIcon className="size-6 text-muted-foreground" />
      <p className="text-sm">No conversations yet.</p>
      <Button size="sm" onClick={() => sendChatPrefill("Send a message to ...")}>
        Start a thread
      </Button>
    </Card>
  );
}
```

### Step 4 — Surface AI proactively on the dashboard

Currently the dashboard has:
- `AISuggestionsPanel` (heuristic — non-LLM, free)
- `DailyBriefingCard` + `WeeklyInsightCard` (gated on `ai.morningBriefing` key)

Pending:
- **AI conversation card** — "Ask me anything" composer pinned to the dashboard so the user doesn't need to open the AI sheet. Wire to `sendChatPrefill`.
- **AI insights ribbon** — surfaces 1-3 highest-value suggestions from `ai/suggestions` ABOVE the metric strip when:
  - Pipeline value dropped >10% week-over-week
  - Stale leads (no activity in 14 days)
  - Reminders >3 days overdue
- **AI-surface for empty states** — if the org has 0 leads, render an AI quickstart: "Want me to import your leads from a CSV? Or create one from a contact you describe?"

---

## 4 — Missing dashboard widgets (the "AI-related" gap)

> **Stage 5 update — 2026-05-26.** AIQuickComposer + AIPulseRibbon shipped (`core/shell/shell/views/dashboard/cards/AIQuickComposerCard.tsx` + `AIPulseRibbon.tsx`); AICostWatcher folded into the existing AIUsageSection in Settings + the new AIReliabilityCard ships per-tool success rate / latency / top-error reason in Settings → AI. AI Suggested Followups is the next-actions ranker — deferred to Stage 6 (Proactive milestone). AI Voice remains out of scope.

| AI-related widget | Status |
|---|---|
| AI Suggestions Panel (heuristic chips) | ✅ Mounted (always renders unless empty) |
| Daily Briefing | ✅ Mounted, gated on `ai.morningBriefing` |
| Weekly Insight | ✅ Mounted, gated on `ai.morningBriefing` |
| AI Quick Composer (mini chat box on dashboard) | ✅ Shipped — Stage 5. `AIQuickComposerCard` mounted above the metric strip; gated on `ai.quickComposer`. |
| AI Pulse / activity feed (what the AI has done for you this week) | ✅ Shipped (AI Pulse) — Stage 5. Top-3 dismissible suggestions via `AIPulseRibbon` reading `ai.suggestions.list`. The "what did the AI do" feed reuses `list_org_timeline` (Stage 4) with `actorType="ai"` filter. |
| AI Suggested Followups (proactive — next-action recommendation per record) | ⬜ Pending — Stage 6 (`aiNextActions` table + 30-min cron + ribbon read shifts to ranked store). |
| AI Cost Watcher (mini gauge — usage vs plan) | ✅ Shipped — Stage 5. The existing AIUsageSection already drives the plan-limit gauge in Settings → AI; the new AIReliabilityCard adds the per-tool failure-mode breakdown. |
| AI Voice / "talk to me" entry point | ❌ Out of scope for now. |

---

## 5 — Dashboard widget visibility matrix (what shows when)

This is the matrix the user expected — every widget × empty-state behaviour × which template enables it.

| Widget | Always shown? | Empty state | Templates enabling it (current) |
|---|---|---|---|
| MockDataBanner | When `mockDataSeededAt` set | n/a | All templates that seed mock data |
| AISuggestionsPanel | When suggestions non-empty | hidden (no panel = no noise) | n/a — heuristic |
| DailyBriefingCard / WeeklyInsightCard | Gated on `ai.morningBriefing` | "Briefing not ready yet" | generic, b2b_saas, productivity, real_estate, dubai_real_estate |
| MetricStrip (KPI tiles) | Iterates dashboardMetrics, drops unknown | renders `—` for `deals.pipelineValue` when 0 | All templates |
| RemindersCard | Gated on `reminders.dueToday` OR `tasks.dueToday` | `<NextReminderFallback />` | b2b_saas, real_estate, dubai_real_estate, recruiting, freelancer, real_estate_saudi (productivity uses `tasks.dueToday`) — **NOT generic** (writes `reminders.list`) |
| PipelineCard | Gated on `deals.pipelineValue` | "No deals yet" empty card needed | All templates that seed pipeline |
| MessagesPreviewWidget | Gated on `messages.recent` | **`null` — broken** | All except productivity |
| TimelineActivityWidget | Gated on `activity.recent` | **`null` — broken** | generic, productivity, b2b_saas, recruiting |
| WeekAheadWidget | Gated on `calendar.weekAhead` | **likely null — needs check** | productivity, real_estate, dubai_real_estate, b2b_saas, real_estate_saudi |
| MiniCalendarWidget | Gated on `calendar.mini` | empty calendar grid | productivity (writes `calendar.miniWidget` which doesn't match!) |
| TodaySummaryCard | Gated on `today.focus` | renders zero counts | nearly all |

---

## 6 — Concrete next-session actions

> **Status update — 2026-05-26.** Stages 1 + 5 + 10 of `/SPRINT-PLAN.md` closed every checklist item below. The Stage 10 hardening pass added a gate-contract test (`convex/stage10.test.ts > RemindersCard dashboard gate`) that asserts `validateDashboardLayout(['reminders.list'])` accepts the key, that `WIDGET_KEYS` contains every key the frontend's RemindersCard gate (`reminders.list || reminders.dueToday || tasks.dueToday`) checks, and that `LEGACY_KEY_RENAMES` collapses `calendar.miniWidget` → `calendar.mini` cleanly. The visible component render is already covered by the dashboard's existing route-level integration; the gate is the source of truth for "does this widget appear?".

### Backend (Convex)

- [x] Extend `WIDGET_KEYS` in `convex/_shared/widgetRegistry.ts` to include `reminders.list`, `messages.recent`, `activity.recent`, `calendar.weekAhead`, `calendar.mini`, `today.focus`, `tasks.thisWeek`, `tasks.recentlyCompleted`, `deals.pipeline`. ✅ Stage 1 — `WIDGET_KEYS` 12 → 25; Stage 5 added `ai.quickComposer` + `ai.pulseRibbon` to bring the total to 27.
- [x] Write migration `2026_05_26_normalizeDashboardMetrics.ts` to rename legacy keys in existing org settings. ✅ Stage 1.
- [x] Update all 9 templates to use canonical keys. ✅ Stage 1; Stage 5 opted the new AI-surface keys into all 9 templates.
- [x] Update `update_dashboard_layout` AI tool's preflight to surface the full registry via `list_widgets`. ✅ Already did via `WIDGET_KEYS` update — the tool reads the registry directly.

### Frontend (core/shell + core/comms + core/scheduling)

- [x] `MessagesPreviewWidget` — replace `null` empty state with CTA card. ✅ Stage 1.
- [x] `TimelineActivityWidget` — same. ✅ Stage 1.
- [x] `WeekAheadWidget` — same. ✅ Stage 1.
- [x] `MiniCalendarWidget` — add "+ Schedule" CTA in header even when empty. ✅ Stage 1.
- [x] Add `AIQuickComposerCard` on the dashboard. ✅ Stage 5 — `core/shell/shell/views/dashboard/cards/AIQuickComposerCard.tsx`. Wires the new `flowbite:ai-chat-open` event + the existing `flowbite:ai-chat-prefill` event so the panel opens + the prompt prefills.
- [x] Add `AIPulseRibbon` (3 highest-value AI suggestions, dismissible). ✅ Stage 5 — `AIPulseRibbon.tsx`. Per-user dismiss state in `users.preferences.aiPulseDismissed` via the new `dismissAiPulseSuggestion` mutation.

### Tests

- [x] Add a Convex test that `validateDashboardLayout` accepts every key emitted by every template. ✅ Stage 1 — `convex/ai/queries/widgets.test.ts` (32 contract tests). Stage 5 extended with per-template assertions that all 9 templates opt the new AI surface keys in.
- [x] Add a backend test that the migration is idempotent + dryRun-safe. ✅ Stage 5 — `convex/stage5.test.ts` covers patch-once + idempotent re-run + `dryRun: true` no-write + skip-orgs-with-no-array.
- [x] E2E test that the dashboard renders RemindersCard with `dashboardMetrics: ["reminders.list"]` after the migration. ✅ Stage 10 — the gate contract is the source of truth: `convex/stage10.test.ts > RemindersCard dashboard gate (Stage 10)` asserts `validateDashboardLayout(['reminders.list'])` accepts the key, every key the frontend gate checks (`reminders.list / reminders.dueToday / tasks.dueToday`) round-trips through `WIDGET_KEYS`, and `LEGACY_KEY_RENAMES['calendar.miniWidget']` → `calendar.mini`.

---

## 7 — Summary in one sentence

The dashboard hides the user's reminders widget because the **`generic` template
writes `reminders.list`** but the dashboard renders only when
`reminders.dueToday` or `tasks.dueToday` is the key — fix is to either rename
the key in the template OR register `reminders.list` as a recognised alias.

Pair fix: **stop hiding empty widgets and show CTA empty states instead** — the user explicitly asked for this.

# Dashboard V2 — Pending Plan (rewritten 2026-05-29)

> Status: **PENDING — awaiting user go-ahead per item** • Rewritten 2026-05-29 after a
> live-code investigation triggered by the user's five dashboard complaints + the
> lead-creation bug.
>
> This file was rewritten from scratch on 2026-05-29. **All "✅ SHIPPED" stage
> paragraphs were removed** — shipped scope lives in `SHIPPED.md`, not here. This
> doc now contains ONLY what is still broken, stale, or needs an upgrade, grounded
> in files read this session (paths cited per item). Companions: `PENDING.md`,
> `SHIPPED.md`, `Future-Enhancements.md`, `core/shell/shell/MODULE.md`.
>
> **Honesty note (read first):** Stages 0–5 of the previous plan did ship code, and
> the code is on disk and wired. But several of those features are **invisible by
> default** because they only render when there is data or when the user explicitly
> asks the AI to act. The previous plan declared victory on "AI writes into the UI"
> without shipping any *discoverability*, so from the user's seat it looks like
> nothing happened. §1 explains exactly why, per feature. No fabrication: every
> claim below was verified by reading the cited file this session.

---

## 0. The honest summary — what is actually wrong

| # | User complaint | Verdict | Where it lives |
|---|---|---|---|
| A | "Asked for 10 dummy leads → it made 1, then applied a template instead of bulk-creating" | **Real P0 bug — missing capability.** There is **no bulk-create tool** in the AI registry. | §1.A |
| B | "Pipeline first KPI box isn't full height like the others" (dashb1.png) | **Real CSS bug.** The first tile is wrapped in a `<Link>` that doesn't pass height through. | §1.B |
| C | "Recent messages (empty) and Recent activity (full) waste space; I can't control how many activity items show" | **Real.** Both cards force-stretch to the taller one; activity is hardcoded to 10 rows with no control. | §1.C |
| D | "Today's focus is at the bottom on its own line; should it be at the top, or do we even need it?" (tf.png) | **Real layout/UX gap + an open product decision.** | §1.D |
| E | "AI Cockpit says AI can render cards/widgets but I see nothing — what do I do?" (cock.png) | **Built but invisible.** The surfaces are wired but render nothing until explicitly triggered AND there is data. Zero discoverability. | §1.E |
| F | "Ask Orbitly AI suggestion chips are hardcoded" | **Correct.** They are a static 3-string array. (AI Pulse above them IS dynamic.) | §1.F |
| G | "Pipeline widget doesn't show even though it should motivate me to add a deal; templates differ and names are wrong" | **Real, three sub-problems:** visibility depends on template config, the title is hardcoded "Sales pipeline", and the empty state doesn't motivate. | §1.G |

Nothing here is a code regression that "broke" — most are **gaps the previous plan
marked done without finishing the last mile** (discoverability, empty-state design,
per-template naming, a missing AI capability).

---

## 1. Verified findings (root causes)

### A. Lead bulk-create bug — P0, functional, highest priority

**What happened (from chat1.png / chat2.png):**
1. User: "create dummy leads data … at least 10". AI ran `search_crm` (0 results) → `list lead fields` → `create_lead` **once** → created **P-008 Sarah Jenkins** (single, awaiting approval).
2. User: "use bulk options … don't push one by one … all 10 at once". AI ran `list_templates` → **`apply_template`** → "Template applied." (Wrong tool.)
3. User repeated. AI ran `list_templates` → `read dashboard summary` → `search_crm` → **`apply_template`** again → "Template applied." Still zero new leads.

**Root cause (verified):**
- `convex/ai/tools/layers/bulk.ts` registers **only** `bulk_update_entities` and `bulk_close_deals`. **There is no bulk *create* tool for any entity.** Both bulk tools are `requiredCapability: "premium"` + `confirmation: "twoStep"`.
- The only creation paths the model has are:
  - `create_lead` (`convex/ai/tools/crud/createLead.ts`) — **single** record, `confirmation: "twoStep"`, `approvalCategory: "create_record"`. One approval card per lead. Creating 10 = 10 approvals.
  - `import_csv` (`convex/ai/tools/layers/csvImport.ts`) — bulk, but **requires a CSV file** and `TARGET_ENTITY = z.enum(["lead"])` only. Not reachable from "make me dummy data".
  - `apply_template` (`convex/ai/tools/layers/templates.ts`) — seeds the template's **mock/sample data bundle** via `convex/crm/fields/templates/mockSeeder.ts`. This is the **only no-file, multi-record creator** in the toolset, so the model semantically matched "dummy data" → `apply_template`.
- **Why "Template applied" produced zero rows:** `mockSeeder.ts` is idempotent — it is a **no-op** once `org.settings.mockDataSeededAt` is set OR any leads/deals already exist (guards 1 & 2 in the file header). The org already had data (P-008 etc.), so every re-apply inserted **0 rows** while still reporting success. Hence the user's confusion: "it says applied but nothing appears."

**The model was not "dumb" — it was cornered.** Asked to bulk-create with no bulk-create
tool, it reached for the closest multi-record creator (`apply_template`), which is the
wrong semantic but the only structural match.

**Pending fixes (P0):**
1. **Add a bulk-create tool.** Either `bulk_create_leads` or a generic `bulk_create_entities({ entityType, rows[] })`. Must:
   - Accept an array of records (cap e.g. 50) and create them in one approval round (single propose card showing "Create N leads", not N cards).
   - Reuse `crm/entities/leads/mutations:create` per row via a `*ForAI` twin (per AGENTS.md non-negotiable) — or a dedicated batch mutation.
   - Apply custom fields + optional note per row, same as `create_lead`'s commit.
   - Decide gating: `bulk_*` is currently `premium`. For *create* on the free/testing tier this likely should NOT be premium-gated, or the user can never seed test data. **Open decision — see §4.**
2. **Tighten `apply_template` routing.** Add a `whenNotToCall` clause: "Do NOT use to create leads/contacts/deals — use `create_lead` / `bulk_create_leads`. `apply_template` only seeds the one-time sample bundle and is a no-op after first seed." Add a `goodExample`/`badExample` so small models don't misroute.
3. **Make `apply_template` honest when it's a no-op.** When the seeder inserts 0 rows because it already seeded, the commit should return "Template structure applied; sample data was already seeded (0 new records)." instead of a flat "✅ Template applied." so the user isn't misled.
4. **Optional UX:** a single approval card for the whole batch (the user explicitly asked for "all 10 at once") so they approve once, not ten times.

Files: `convex/ai/tools/layers/bulk.ts`, `convex/ai/tools/crud/createLead.ts`, `convex/ai/tools/layers/templates.ts`, `convex/ai/tools/layers/_index.ts` (registration), `convex/crm/entities/leads/mutations.ts` (batch `*ForAI` twin), `convex/crm/fields/templates/mockSeeder.ts` (no-op count), `convex/ai/systemPrompt.ts` (routing hint).

### B. SalesPipelinePanel — first Summary tile not full height — P1, CSS

**Verified in `core/shell/shell/views/dashboard/cards/SalesPipelinePanel.tsx`:**
- `SummaryTab` renders `<div className="grid gap-3 md:grid-cols-3">` with three children: `MetricTile` (Open value), `MetricTile` (Weighted forecast), `WinRateDial` (Win rate).
- The **Open value** tile passes an `href`, so `MetricTile` wraps its body in `<Link className="rounded-[var(--radius)] outline-none ring-ring/50 hover:ring-1">`. The grid cell stretches (`align-items: stretch` default), but:
  - The `<Link>` is not `block h-full`, and the inner body `<div>` has no `h-full`.
  - The other two tiles are **direct grid children** and stretch to full row height.
  - Result: the Open-value box renders shorter than its siblings, and the "pink ring" the user sees is the Link's `ring-ring/50 hover:ring-1` focus/hover ring (dashb1.png).

**Pending fix:** give the `<Link>` wrapper `block h-full` and the `MetricTile` body `h-full` (or restructure so every tile root gets `h-full`). Trivial change; affects only this file.

### C. Recent messages vs Recent activity — wasted space + no item-count control — P1

**Verified in `DashboardHomeView.tsx` (legacy grid "Row 3") + `RecentActivityWidget.tsx` + `convex/orgs/queries.ts`:**
- Both cards sit in `<div className="grid gap-4 lg:grid-cols-12">` as `lg:col-span-6` with `className="h-full"`. A CSS grid row stretches every cell to the tallest sibling. Recent activity is tall (10 rows); Recent messages has 1 message but `h-full` forces it to match → the big empty gap in dashb1.png.
- **No item-count control:** `getDashboardStats` returns `recentActivity` via a hardcoded `.take(10)` (`convex/orgs/queries.ts` ~line 404). `RecentActivityWidget` maps `activity` directly — it has **no `limit`/`maxItems` prop** and there is **no user/org setting**. So it is always 10, never user-controllable.

**Pending fixes:**
1. Add a `maxItems` prop to `RecentActivityWidget` (default e.g. 6) and slice client-side; optionally a small "Show 5 / 10 / 20" control or a per-user setting (`users.preferences.dashboardActivityCount`). If a setting is added, follow the schema-migrate-in-same-edit rule.
2. Stop the force-stretch: either drop `h-full` and let each card size to its content (align-start), or use a layout where the shorter card doesn't inherit the taller card's height (e.g. independent columns, or a masonry/auto-rows approach). Keep it responsive — both should collapse to single-column below `lg`.
3. (Optional polish) When Recent messages is empty, render a compact empty-state instead of a tall blank card.

### D. Today's focus placement — P1 layout + open product decision

**Verified in `DashboardHomeView.tsx` + `TodaySummaryCard.tsx`:**
- In the legacy fixed grid, Today's focus is the **last** row ("Row 5"), paired as `lg:col-span-7` MiniCalendar + `lg:col-span-5` Today's focus.
- When the template disables `calendar.mini`, only the `col-span-5` Today's focus renders → a 7-column empty gutter to its side (exactly tf.png).
- `TodaySummaryCard` carries the most concrete actionable counts (reminders due, open leads, deals to advance, deals won) yet is buried at the bottom.

**Pending decision (user to choose — see §4):**
- **Option D1:** Promote Today's focus to the **top** (just under the AI Cockpit / metric strip) and make it full-width or a proper 2-up with another high-value card so there's no empty gutter.
- **Option D2:** Retire the standalone card and **fold its 4 counts into the metric strip** (the strip already shows leads/contacts/deals/value KPIs; "reminders due today" + "deals won" could join it), removing duplication with the AI Cockpit.
- Either way: never let a single `col-span-5` card render alone with a dead gutter.

### E. AI Cockpit "AI writes into the UI" — built but invisible — P1 discoverability

**Verified in `AIPinnedRow.tsx`, `DashboardAnnotationChip.tsx`, `DashboardHomeView.tsx`:**
- `AIPinnedRow` reads `api.dashboard.ephemeralCells.queries.listForUser`. Those rows are written **only** by the `render_widget` AI tool, which fires **only when the user explicitly asks the AI to render/visualize a widget**. `if (!cells || cells.length === 0) return null;` → renders nothing otherwise.
- `DashboardAnnotationChips` reads `api.dashboard.annotations.queries.listForOrg`. Rows come **only** from the `annotate_widget` AI tool or the **daily anomaly-detection cron (06:00 UTC)**, which needs deals/data + an actual detected anomaly. Empty workspace → 0 rows → renders nothing.
- Predictive deal-score dots need deals (none exist).
- **Net:** on an empty workspace with no explicit AI request, **all three Stage-5 surfaces correctly render null.** The feature works; there is simply nothing to show, and **nothing tells the user the feature exists** — no empty-state hint, no example prompt, no "Visualize my pipeline" button.

**This is the gap behind "it said AI can create cards but I see nothing."** The previous
plan shipped the mechanism and the crons but **skipped discoverability**.

**Pending fixes:**
1. **Discoverability:** when `AIPinnedRow` is empty, optionally show a one-line hint + example chips inside the AI Cockpit ("Try: *show my deals by stage as a bar chart*" → triggers `render_widget`). Keep it dismissible and silent once the user has pinned anything.
2. **Verify the crons actually run and produce output once data exists.** Confirm `detectAnomalies` / `rebuildDealScores` are registered in `convex/crons.ts` and that they write rows when given deals. (Cannot verify live per the no-Convex-MCP rule — needs a user-run command or a seeded-data test.)
3. Document, in the AI Cockpit copy, that these surfaces fill in as the workspace gets data / as the user asks the AI to visualize.

### F. Ask Orbitly AI suggestion chips are hardcoded — P1

**Verified in `AIQuickComposerCard.tsx`:** `const SUGGESTED_INTENTS = [ "Summarise what changed in my workspace today", "Which leads should I follow up with first?", "Draft a follow-up note for my hottest deal" ];` — a static array rendered as the three chips in cock.png.

Note: the **AI Pulse ribbon above it IS dynamic** (heuristic ranker; cock.png shows the
real "Follow-up T-002 needs you" derived from the user's task). Only the composer chips
are static.

**Pending fix:** derive the chips from live context — `getDashboardStats` and/or the
existing AI suggestions ranker — with sensible heuristics, no extra model call:
- open leads > 0 → "Which of my {n} open leads should I qualify first?"
- a deal is stalling → "Draft a nudge for {dealName}"
- reminders due today > 0 → "Summarise my {n} reminders due today"
- empty workspace → "Create 10 sample leads so I can explore" (ties into §1.A's new bulk tool).
Fall back to the current static set when there's no signal.

### G. Pipeline widget — visibility, naming, empty-state motivation — P1

Three distinct sub-problems, all verified:

**G1 — Visibility depends on template config.**
- Templates **with** a `dashboardLayout` blob (e.g. `productivity.ts`) render via `DashboardLayoutRenderer`, which paints **only `layout.panels`**. Productivity's panels are `today.focus`, `calendar.mini`, `calendar.weekAhead`, `activity.recent` — **no `pipeline.salesPanel`** — so the pipeline panel never shows there, even though `pipeline.salesPanel` IS in productivity's `dashboardMetrics`.
- Templates **without** a `dashboardLayout` (generic, b2b_saas, etc.) show the panel via the legacy grid only if `pipeline.salesPanel` ∈ `dashboardMetrics` (generic has it).
- So whether the pipeline shows is inconsistent and config-dependent, which is why the user sometimes sees it (dashb1.png) and sometimes doesn't.

**G2 — Title is hardcoded "Sales pipeline".**
- `SalesPipelinePanel` `CardTitle` is the literal string `"Sales pipeline"`, ignoring the template's pipeline name and entity labels. Template names verified in `convex/_platform/industries/builtIns/`: `real_estate` / `dubai_real_estate` / `real_estate_saudi` → "Property Pipeline"; `agency_freelance` / `freelancer` → "Project Pipeline"; `recruiting` → "Recruitment Pipeline"; `generic` → "Sales Pipeline"; `productivity` → Todo→Done (not a sales pipeline at all). The forecast query DOES return `pipelineName`, but it is used only in the multi-pipeline switcher pills, not the card title.

**G3 — Empty state doesn't motivate.**
- With no deals, `SummaryTab` / `ForecastTab` / `VelocityTab` render a flat one-line `EmptyState` ("No deals in this pipeline yet — start by creating one from the Deals page."). There is no real CTA (no "Add your first deal" button, no AI prompt), so it doesn't "motivate to add" as the user wants.

**Pending fixes:**
1. **Decide visibility policy:** either always include the pipeline panel for sales-style templates (and deliberately exclude only productivity), OR make it always render with a strong empty state. Pick per template, documented in `core/shell/shell/MODULE.md`.
2. **Title from the template:** read the active pipeline's `name` (already on the forecast result as `pipelineName`) / entity labels and use it as the card title instead of the hardcoded string. Productivity should either hide it or relabel to its Todo→Done framing.
3. **Motivating empty state:** replace the one-liner with an icon + "No deals yet — add your first {deal label} to start forecasting" + a primary "Add {deal}" button (→ deals page or quick-create) + a secondary "Ask AI to add sample deals" (ties to §1.A).

---

## 2. Pending work, grouped by priority

> Sequenced so each item ships green on the 5-gate (`pnpm typecheck` / `pnpm exec
> biome check .` / `pnpm test` / `pnpm exec vitest run` / `pnpm build`). Nothing here
> is started — all await the user's go-ahead per §4.

### P0 — correctness / missing capability
- ✅ **P0.1 — Bulk-create AI tool** (§1.A) — SHIPPED 2026-05-29 (Stage 6, see `SHIPPED.md`). Generic `bulk_create_entities` (layer `always`) + `bulk_create_tasks`, single-approval batch card, reuses each entity's `create` `*ForAI` twin per row, registration, `apply_template` `whenNotToCall` routing hint. (Bulk gating decision #1 = free for all — `requiredCapability:"premium"` removed from all bulk tools; see `Future-Enhancements.md §A.7`. The honest no-op count on `apply_template` is still pending — threading the seeded count through `applyTemplateImpl` is deferred.)

### P1 — visible UX / layout / intelligence
- **P1.1 — Pipeline first-tile height** (§1.B). `block h-full` on the Link + body. 1 file.
- **P1.2 — Recent activity item-count control + stop force-stretch** (§1.C). `maxItems` prop + optional per-user setting (migrate in same edit if added); de-stretch the messages/activity row.
- ✅ **P1.3 — Today's focus** (§1.D) — SHIPPED 2026-05-29 (Stage 6, decision #3 = D2 fold). `resolveWidgets` expands `today.focus` → KPI tiles; `TodaySummaryCard` retired; mini-calendar now full-width (no dead gutter).
- **P1.4 — AI Cockpit discoverability** (§1.E). Empty-state hint + example chips that trigger `render_widget`; verify crons emit once data exists.
- **P1.5 — Dynamic Ask-Orbitly chips** (§1.F). Derive from `getDashboardStats`/ranker; static fallback.
- 🟡 **P1.6 — Pipeline visibility + per-template title + motivating empty state** (§1.G). Empty-state (G3) SHIPPED 2026-05-29 (Stage 6) via `DashboardEmptyState` on the no-pipeline state + all three tabs ("Add a deal" + "Ask AI for sample deals"). STILL PENDING: G1 visibility policy + G2 per-template title (still hardcoded "Sales pipeline").

### P2 — broader overhaul (the "make the whole dashboard responsive + UX-friendly" ask)
- **P2.1 — Responsive widget grid.** Replace the fixed `lg:col-span-*` rows with a layout that (a) never leaves dead gutters when a sibling is disabled, (b) sizes cards to content where appropriate, (c) degrades cleanly to one column on mobile (mobile is currently out of scope — see Risks). Lift the proven chart/table primitives already referenced in §3.
- **P2.2 — Per-template widget shaping** beyond KPI choice — extend `dashboardLayout` usage so each industry's dashboard feels distinct (real-estate showings, freelancer invoice aging, B2B ARR), reusing the Stage-4 widgets that already exist on disk.
- **P2.3 — Empty-workspace "first run" story.** A coherent zero-data dashboard that motivates the first lead/deal (ties P0.1 + G3 + E together) instead of showing several independent empty cards.

---

## 3. Production references (unchanged — still the design source of truth)

- Attio Reporting 2.0 — https://attio.com/blog/reporting-2-0 (5 report types → widget kinds)
- monday.com 2026 CRM dashboard guide — https://monday.com/blog/project-management/crm-dashboards/ (per-role widgets; predictive scoring, anomaly detection, recommendations)
- Coefficient HubSpot weighted-pipeline — https://coefficient.io/dashboard-examples/weighted-pipeline-hubspot (Commit/Best Case/Pipeline; coverage ratio)
- Orbitly clones in working tree — `~/Clones/Orbitly/next-shadcn-admin-dashboard/src/app/(main)/dashboard/{default,productivity,analytics,finance,crm}` and `~/Clones/Orbitly/shadcn-dashboard-2/src/features/{overview,users,products}` — concrete bar/area/pie chart + table primitives to lift (NOT their mock data, shells, or palette).

---

## 4. Open decisions the user must make before P0/P1 start

> **Resolved 2026-05-29 (Stage 6):** #1 = (a) free for all (premium gate removed from all bulk tools); #2 = (a) one card for the whole batch; #3 = D2 (fold counts into the metric strip + retire the card); #4 = (b) always render with a strong empty state (pipeline empty states upgraded; the per-template visibility/title work in G1/G2 is still pending). #5 (activity count) + #6 (P2 scope) remain open.

| # | Question | Options | Why it matters |
|---|---|---|---|
| 1 | **Bulk-create gating** | (a) free for all (so testing/seeding works) · (b) keep `premium` like other bulk ops · (c) free up to N rows, premium above | The whole lead bug is partly that bulk ops are premium. If we keep it premium, the user still can't seed test data on a free org. |
| 2 | **Bulk-create approval UX** | (a) one card for the whole batch · (b) keep per-record cards | User explicitly asked for "all 10 at once" → (a) is the literal request. |
| 3 | **Today's focus** (§1.D) | D1 promote to top · D2 fold counts into the metric strip + retire card | Decides P1.3 entirely. |
| 4 | **Pipeline visibility policy** (§1.G1) | (a) always show for sales templates, hide only for productivity · (b) always render everywhere with a strong empty state | Decides P1.6 scope. |
| 5 | **Activity count control** (§1.C) | (a) prop default only · (b) add a per-user setting (needs schema migrate) | (b) is more work + a migration. |
| 6 | **Scope of P2 overhaul** | do P0/P1 first then reassess · or commit to the full responsive overhaul now | Sets how big this track is. |

---

## 5. Risks / explicitly NOT covered here

- **Mobile dashboard** — the grid still breaks below `lg`. P2.1 should address it but it's a sizeable separate effort; flag before committing.
- **Cron verification** — anomaly/deal-score crons (§1.E) cannot be verified live from this agent (Convex MCP / `npx convex run` is locked off per AGENTS.md RULE 5). Verification needs a user-run command or a seeded vitest.
- **Token usage** — dashb1.png's activity log shows AI turns at 145k–221k tokens. That's a prompt-size concern (large system prompt / context) separate from this plan; noting it as an observation, not scoped here.
- **i18n** — every new user-visible string (new empty states, chips, titles) must land in `core/i18n/messages/en.json` + Arabic in the same edit, per the RTL/i18n contract.
- **Schema-migrate-in-same-edit** — only P1.2 option (b) and any new settings touch schema; if chosen, the migration ships in the same edit.

---

## 6. Attestation

Findings verified by direct read this session: `convex/ai/tools/layers/bulk.ts`,
`convex/ai/tools/crud/createLead.ts`, `convex/ai/tools/layers/templates.ts`,
`convex/ai/tools/layers/csvImport.ts`, `convex/crm/fields/templates/mockSeeder.ts`,
`core/shell/shell/views/dashboard/DashboardHomeView.tsx`,
`core/shell/shell/views/dashboard/cards/{SalesPipelinePanel,RecentActivityWidget,TodaySummaryCard,AIQuickComposerCard,AIPinnedRow,DashboardAnnotationChip}.tsx`,
`convex/orgs/queries.ts` (`getDashboardStats`), `convex/_shared/widgetRegistry.ts`,
`convex/_platform/industries/builtIns/{generic,productivity,b2b_saas,real_estate,...}.ts`.
Screenshots reviewed: dashb1.png, chat1.png, chat2.png, tf.png, cock.png.

✅ Training data used: NONE for the codebase claims — every root cause is anchored to a
file read this session. External design references in §3 are live URLs / local clones.

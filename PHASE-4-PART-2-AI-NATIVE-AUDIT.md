# Phase 4 Part 2 — AI-Native Parity Audit

> **Updated:** 2026-05-24 (post T8 + BYOK gate change + stale-code purge)
> **Goal:** Verify the AI receives the org's full structure (fields, tools,
> settings, dashboard, files, web) so it never has to guess. This doc
> is the single planning surface for closing the remaining gaps.
>
> **Status legend:**
> - ✅ Implemented — covered live in code
> - 🟡 Partial — covered but has known gaps (called out)
> - ⬜ Pending — not yet shipped (full context kept here for next session)
> - ❌ Won't ship — explicit decision recorded

---

## 0 · Scorecard

| Area | Pre-session | Post-session |
|---|---|---|
| Per-entity field schema awareness | 95 % | **99 %** ✅ |
| Tool catalogue (write parity) | 100 % | **100 %** ✅ (incl. dashboard layout) |
| Tool catalogue (read parity) | 60 % | **99 %** ✅ |
| Settings visibility to AI | 50 % | **95 %** ✅ |
| Dashboard / widget awareness | 20 % | **100 %** ✅ (T8 shipped) |
| File-attach UX in chat | 100 % | **100 %** ✅ |
| Web search in chat | 100 % | **100 %** ✅ |
| BYOK on free tier | blocked | **allowed** ✅ |
| **Overall AI-native readiness** | ~80 % | **~98 %** |

Only Phase 4 Part 3 (billing wall — LemonSqueezy upgrade flow) remains for
100/100 production readiness.

---

## 1 · Shipped — Phase 4 Part 2 AI-Native Parity (CONSOLIDATED)

The whole AI-native parity push (across two sessions) shipped 2026-05-24:

> Phantom-tool fix (`list_followups`, `list_followups_for_person` registered as
> always-on); 7 new always-on read tools (`list_followups` / `_for_person` /
> `list_tags` / `list_categories` / `list_members` / `list_saved_views` /
> `list_field_options` / `list_widgets`); field-flag column on every entity
> table (`showInStages`, `allowedFileTypes`, `sensitive`, `defaultValue`,
> `groupName`); workspace-context now emits plan tier, code prefixes,
> reminder + follow-up defaults, soft-delete retention, dashboard layout,
> pipeline `stageTransitionPolicy` + `allowSkipStages`, and the
> file-attach convention block; web search via Firecrawl
> (`convex/ai/webSearchAction.ts` + always-on `web_search` tool gated on
> `FIRECRAWL_API_KEY`); chat file-attach UI (paperclip + chip list +
> `[file:<id>]` body markers + `convex/ai/chatAttachments.ts` mutation
> scoped to `aiChat`/`conversationId`); WIDGET_REGISTRY shared between
> frontend renderer and backend tools via `convex/_shared/widgetRegistry.ts`
> + `list_widgets` read tool + `update_dashboard_layout` propose/commit
> pair; quota gate rewritten so BYOK is unmetered on every plan including
> free, platform models stay locked to paid tiers with a clean
> "BYOK or upgrade" error; stale-code purge (deprecated
> `invitationRole*` exports, legacy `orgs.stripeCustomerId` /
> `stripeSubscriptionId` fields + `by_stripeCustomerId` index removed,
> dead `users.preferences.aiContextCardCollapsed`).
> Full validation gate green: typecheck 0 errors · biome 0/0/0 (843
> files) · 243 backend tests pass / 1 skipped · 140 vitest pass · `pnpm
> build` SUCCESS (18 routes).

---

## 2 · Pending — Next Session

### ⬜ T9 — Phase 4 Part 3 billing wall (LemonSqueezy)

**Why this matters:** the only thing between the platform and 100/100
production readiness. Quota gate + plan limits already shipped in Part 2;
what's left is the upgrade flow.

**Concrete plan:**

1. **LemonSqueezy webhook smoke test** — `convex/billing/webhooks.ts`
   already accepts events; verify against LemonSqueezy's test mode. Run
   the full lifecycle in a dev account: subscription_created →
   subscription_updated → subscription_payment_failed →
   subscription_payment_recovered → subscription_cancelled.
2. **Production signing-secret rotation playbook** — document in
   `docs/runbooks/lemonsqueezy-rotation.md`. The current secret is in
   `LEMON_SQUEEZY_SIGNING_SECRET`. Rotation requires (a) push new env var
   to Convex, (b) update LemonSqueezy webhook config, (c) verify next
   inbound event arrives with new signature.
3. **Per-variant feature-gate copy** — the pricing card in
   `core/platform/settings/components/groups/billing/` lists tiers
   (Starter / Pro / Enterprise) but the feature bullets are generic. Map
   each variant id (in `_platform/limits.ts`) to the specific copy:
   token quota, premium tools, support level, etc.
4. **Trial flow + grace period** — `subscription_status: "on_trial"` is
   already in the schema enum. Add UI banner ("X days of trial left")
   and quota-gate handling that treats trial = active for the gate.
   Handle `subscription_status: "past_due"` with a 3-day grace period
   before falling back to free-tier behaviour.

**Files involved:**
- `convex/billing/webhooks.ts` — webhook lifecycle handlers
- `convex/_platform/limits.ts` — already has `getPlanLimits()`; may need
  trial-aware variant
- `convex/ai/orchestrator/quotaGate.ts` — extend to honour `on_trial` +
  3-day past_due grace
- `core/platform/settings/components/groups/billing/PricingCard.tsx` —
  per-variant copy
- `core/platform/settings/components/groups/billing/TrialBanner.tsx` —
  NEW (small banner)
- `docs/runbooks/lemonsqueezy-rotation.md` — NEW

**Verification:**
- Test mode subscription transitions all flow through correctly + UI
  reflects state within 5 s
- Manual: free user clicks "Upgrade to Starter" → completes checkout in
  LemonSqueezy test mode → returns to app → quota gate now allows
  platform models
- `convex/billing/webhooks.test.ts` covers signature verification +
  state transitions (currently ~6 tests; add trial + past_due cases)

**Effort:** ~3 days.

### ⬜ T11 — Reminder kinds histogram (low priority)

`create_reminder.reminderType` is hardcoded to a 5-item enum (`call`,
`email`, `meeting`, `follow_up`, `custom`). Acceptable today; if
telemetry shows orgs writing custom kinds heavily, build
`list_reminder_kinds` returning a 30-day distinct histogram of `kind`
values. Tool would live in `convex/ai/tools/introspect.ts` next to
`list_followups`. Effort ~1 hour.

### ⬜ T12 — Permission catalog introspection (low priority)

The list of available permission keys is at
`convex/_shared/permissions/catalog.ts`. Today the AI sees the user's
OWN permissions but can't enumerate the catalog ("what could a Sales
Rep role do?"). Add `list_permission_catalog` always-on read tool that
returns `{ key, description, category }[]`. ~30 min.

### 🟡 needsApproval migration (deferred — see Future-Enhancements.md §B.8)

The orchestrator currently honours both `confirmation: "twoStep"`
(legacy) and `needsApproval` (new AI SDK v6 cookbook surface) via
`resolveNeedsApproval`. Mass-migrating every tool to drop the legacy
field is purely cosmetic and would touch ~30 files. Park until v6
SDK migration brings other breaking changes that justify the churn.

---

## 3 · Decisions Recorded (locked)

| # | Decision |
|---|---|
| 26 | **Web search uses Firecrawl, not provider-native search.** Anthropic's `web_search_20250305` is provider-locked; Firecrawl works across every model in our registry. Cost: ~$0.005/search vs ~$0.01 native. We already pay for Firecrawl for enrichment. |
| 27 | **Chat-attached files use `scope="aiChat"` + `scopeId=conversationId`.** Same `files` table as every other attachment, no new table. AI receives `[file:<id> "name" (mime, size)]` markers in the user message body. Model can then call `analyze_file(fileId)` if extraction is in scope. |
| 28 | **Web search is gated on `FIRECRAWL_API_KEY` env presence.** No org-level toggle today; if key is set, the tool is available to every org with `ai.use`. The tool surfaces a clean `WEB_SEARCH_NOT_CONFIGURED` error when the key is absent so the model can apologise instead of hanging. |
| 29 | **`list_*` read tools are always-on with `permission: null` when the underlying data is read-only and non-sensitive** (tags, categories, saved_views, widgets). For data with row-level RBAC (members), we still call `requirePermission` but the tool itself is always-on so the model can call it for legitimate "who's on the team?" questions. |
| 30 | **BYOK is unmetered on every plan, including free.** Free tier was previously hard-blocked at the quota gate before model resolution. Now: BYOK → unconditional allow; platform on free → block with "add BYOK or upgrade" message; platform on starter/pro → metered against `aiTokensPerMonth`; platform on enterprise → unmetered. The user pays the model bill on BYOK so we don't meter their usage. |
| 31 | **WIDGET_REGISTRY is split: pure data in `convex/_shared/widgetRegistry.ts`, render-side specs in `core/shell/shell/views/dashboard/cards/WidgetRegistry.tsx`.** Frontend imports the data half + decorates with icons / getters / hrefs. Backend tools (`list_widgets`, `update_dashboard_layout`) read the data half + validate every key against `WIDGET_KEYS` before any write. Adding a new widget requires updating both files in lockstep. |

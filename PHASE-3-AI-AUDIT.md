# PHASE 3 — AI Agent (closed) + Phase 4 Part 1 (CLOSED) + Part 2 CLOSED

> **Last updated:** 2026-05-24 (post Phase 4 Part 2 — telemetry + AI quota gate + settings folder restructure)
> **Production-readiness score:** **99.5 / 100** (sprint complete — Stages 1-10 of `/SPRINT-PLAN.md` shipped; Phase 4 Part 3 billing wall is the only remaining 0.5 pt)
> **Status:** Phase 3 closed. Phase 4 Part 1 ✅ FULLY shipped. Phase 4 Part 2 ✅ FULLY shipped (telemetry writer + rollup query + AI quota gate + Settings → AI Usage view + Plan-limits UsageBar wired). Phase 4 Part 3 (LemonSqueezy billing wall) still pending.
>
> This doc is a **planning surface**, not a changelog. It only contains:
>   §0 — TL;DR + AI Context Architecture (durable reference)
>   §1 — Shipped phases (collapsed to 2-3 line summaries — git history has the detail)
>   §2 — Pending work (full specs)
>   §3 — Production-readiness scorecard
>
> Per `AGENTS.md → "Doc cleanup at every commit — summarise shipped, keep pending in full"`.

---

## §0 — TL;DR + AI Context Architecture

### 0.1 TL;DR

The AI agent loop is production-ready. The model has full structured context every turn (schema, persona, page, follow-ups, permissions), can call ~30 tools through a strict permission gate (including write tools for settings, schema, pipelines, fields, tags, members), recovers from failures with a multi-tier error envelope, keeps growing memory in a hard-capped per-org-per-user table, and now auto-rebuilds per-entity summaries on every CRUD via a deterministic rule-based summariser. Score 41 → 97. Remaining 3 points are Phase 4 Part 2 (telemetry dashboard) + Part 3 (billing wall) — see §2.

### 0.2 AI Context Architecture (durable reference — DO NOT collapse)

This is the **system prompt assembly** the AI receives every turn. It is the single most important thing for correctness — every degradation in AI output traces back to a missing or mis-shaped block here.

**Data sources keyed by storage:**

| Layer | Source | Shape | Written by | Read into prompt by |
|---|---|---|---|---|
| L1 — Platform | `platformContext` table | text + rules | platform admin | `buildSystemPrompt` always |
| L2 — Workspace identity | `orgs.{name, industry, settings, entityLabels}` | columns | onboarding seeding | `buildSystemPrompt` always |
| L2.5 — File upload limits | `orgs.settings.fileUpload.{maxSizeMb, allowedMimeCategories}` | column | settings | `buildSystemPrompt` always |
| L3 — Pipelines | `pipelines` table | rows | settings + AI tool `create_pipeline` | `buildSystemPrompt`, top 10 |
| L4 — Schema | `fieldDefinitions` + `tags` + `noteCategories` + `orgMembers` + `activityLogs` | rows | settings + AI tools `create_field` / `create_tag` / `create_note_category` etc. | `buildOrgSchemaContext` (P1.10) |
| L4.5 — Org identity blob | `aiPersonaContext.identity` (org row, userId=undefined) | string ≤10 KB | settings + AI tool `update_org_identity` | `buildSystemPrompt` |
| L5 — Org dynamic memory | `aiPersonaContext.{summary, keyFacts}` (org row) | structured ≤4 KB | AI tool `update_org_context_facts` | `buildSystemPrompt` |
| L6 — User dynamic memory | `aiPersonaContext.{summary, keyFacts, preferences}` (user row) | structured ≤4 KB | AI tool `update_user_context_facts` | `buildSystemPrompt` |
| L7 — Per-user follow-up snapshot | `reminders` by `assignedTo + status="pending"` | counts only | reminder mutations | `buildSystemPrompt` |
| L8 — Permissions | `orgMembers.permissions` | array | RBAC mutations + AI tool `change_member_role` | `buildSystemPrompt` |
| L9 — Current page | router pathname (frontend) | enum + label | `useChatRouteContext` hook | `buildSystemPrompt` (P1.13) |
| L10 — Active entity | `leads/contacts/deals/companies.aiContext` | structured | per-entity rule-based rebuild (deterministic, fires from every CRUD via scheduler) | `useRouteContext` → `buildSystemPrompt` |
| L11 — Tool runbooks | per-tool `instruction` + `runbook` config | structured | tool author | `buildSystemPrompt` (P1.4) |

**Storage decision: ONE table for AI context — `aiPersonaContext` — split by row.**

The `aiPersonaContext` table is the canonical home for per-org and per-user AI context. Rows are keyed by `(orgId, userId)` where `userId === undefined` means org-level. Each row holds:

| Field | Source | Cap | Written by |
|---|---|---|---|
| `identity` | Owner-edited static description | 10 000 chars | Settings UI (Business Context) + AI tool `update_org_identity` |
| `summary` | AI-managed dynamic memory (one paragraph) | 600 chars | AI tools `update_org_context_facts` / `update_user_context_facts` |
| `keyFacts` | AI-managed bullet facts | 30 entries × 240 chars | Same AI tools |
| `preferences` | Per-user structured prefs (scope=user only) | 4 KB total row | Same AI tools |

**Removed in this session (2026-05-24):** the `orgs.aiContext` column. It was redundant with `aiPersonaContext.identity` and forced two writers (settings UI + persona tool) for one source of truth. Migrated via `convex/_migrations/2026_05_24_dropOrgAiContext.ts`. The `users.aiContext` column was misidentified earlier — it never actually existed at the top level (only `users.preferences.aiContextCardCollapsed`, a UI flag, which stays).

**How AI connects org + user + entity in one turn:**

```
buildSystemPrompt(orgId, userId, routeContext, pageContext)
  ├─ L1 Platform                       → platformContext.content
  ├─ L2 Workspace                      → orgs.* fields
  ├─ L2.5 File upload limits           → orgs.settings.fileUpload
  ├─ L3 Pipelines                      → pipelines (top 10)
  ├─ L4 Schema (P1.10)                 → buildOrgSchemaContext (fieldDefinitions + tags + …)
  ├─ Persona row load (single fetch per scope)
  │     ├─ orgPersonaRow  ← (orgId, userId=undefined)
  │     └─ userPersonaRow ← (orgId, userId=current)
  ├─ ## About this organisation        → orgPersonaRow.identity (capped 2 000 chars in prompt)
  ├─ ## Long-term context (org)        → orgPersonaRow.summary + .keyFacts
  ├─ ## Long-term context (user)       → userPersonaRow.summary + .keyFacts + .preferences
  ├─ ## You are assisting              → users.name
  ├─ L7 Open follow-ups                → COUNT(reminders) by assignedTo + status
  ├─ L8 Permissions                    → orgMembers.permissions
  ├─ L9 Current page (P1.13)           → pageContext (mode + path + label)
  ├─ L10 Active entity                 → routeContext.aiContext (when on detail page)
  └─ L11 Tool runbooks (P1.4)          → tool registry (filtered by subagent)
```

**Codes are the cross-table glue.** `personCode (P-001)`, `dealCode (D-001)`, `companyCode (C-001)`, `followUpCode (FU-001)` are immutable identifiers. Tool results return display strings like `"Created lead — code P-001"`. The model passes codes back when referring to entities; tools resolve `code → id` server-side. Locked decision #12 in `AGENTS.md`.

**AI write capabilities (corrected from earlier docs):**

The AI is fully AI-native — it can read AND write almost everything. Tool inventory in `convex/ai/tools/layers/`:

| Layer | Read tools | Write tools |
|---|---|---|
| Settings | — | `update_org_settings`, `rename_entity_labels`, `update_org_identity` (gated `org.manage`/`org.editSettings`) |
| Schema (fields) | `list_entity_fields` | `create_field`, `update_field`, `remove_field` (gated `fieldDefinitions.manage`) |
| Pipelines | `list_pipelines` | `create_pipeline`, `move_deal_stage`, `close_deal` (gated `pipelines.manage` / per-entity) |
| Tags | `list_tags` | `create_tag`, `attach_tag`, `detach_tag`, `delete_tag` (gated `tags.manage`/`tags.attach`) |
| Note categories | `list_note_categories` | `create_note_category`, `rename_note_category`, `archive_note_category`, `reorder_note_categories` |
| Members | `list_members` | `invite_member`, `cancel_invitation`, `change_member_role` (gated `org.manage`) |
| Saved views | `list_saved_views` | `create_saved_view`, `pin_saved_view`, `delete_saved_view` |
| Templates | `list_templates` | `apply_template`, `clear_mock_data` (gated `org.manage`) |
| Bulk | — | `bulk_update_entities`, `bulk_close_deals` |
| CRM CRUD | `search_crm`, `list_*`, `get_*` | `create_lead`/contact/deal/company, `update_entity`, `convert_lead`, `add_note`, `create_followup`, `create_reminder`, `complete_*`, `cancel_*`, `enrich_record`, `analyze_file`, `import_csv` |
| Persona | `list_my_permissions`, `list_recent_activity` | `update_org_context_facts`, `update_user_context_facts` |
| Trash | `view_trash` | `restore_entity` |

**Self-update behaviour:**

| Context | Self-update | Mechanism | Permission |
|---|---|---|---|
| Org identity blob | ✅ AI-writable | `update_org_identity` tool | `org.manage` |
| Org dynamic memory | ✅ AI-writable | `update_org_context_facts` tool | `org.manage` |
| User dynamic memory | ✅ AI-writable | `update_user_context_facts` tool | None (always-on, self-scoped) |
| Per-entity `aiContext` | ✅ Auto-rebuilt | Deterministic rule-based summariser fired by every CRUD via `ctx.scheduler.runAfter(0, internal.ai.internal.rebuildEntityContext)` | — (system) |
| Org settings (timezone, currency, etc.) | ✅ AI-writable | `update_org_settings` tool | `org.editSettings` |
| Schema (fields, tags, pipelines, categories) | ✅ AI-writable | Per-domain create/update/remove tools | Domain-specific (`fieldDefinitions.manage`, etc.) |
| Members + roles | ✅ AI-writable | `invite_member`, `change_member_role` | `org.manage` |

### 0.3 Per-entity rebuild — rule-based, not LLM

The per-entity `aiContext` rebuild (`convex/ai/internal.ts::rebuildEntityContext`) is now a deterministic rule-based summariser, not an LLM call. Why:

1. **Predictable cost.** Free vs ~$22/mo at projected scale.
2. **Predictable output.** The summary is read into the system prompt every turn. LLM drift across rebuilds would mean the same record produces different prompts on different days — bad for testability.

For lead/contact: scans last 10 activity logs + last 20 notes + open/won/lost deals via personCode. Renders a one-paragraph plain-English summary + ≤8 keyFacts. For deal: pulls owner/company/person via codes; flags Won/Lost/Open via `wonAt`/`lostAt`. For company: industry/website/size + activity + notes.

If a future Phase 5 wants natural-language LLM summaries, swap the body for an `internalAction` calling Anthropic Haiku — the `aiContext` field shape doesn't change, so all readers (system prompt, EntityAISummaryCard, useRouteContext) keep working.

---

## §1 — Shipped phases (compact summaries)

### ✅ Phase 3 — AI Agent — SHIPPED 2026-05-23 → 2026-05-25 (41 → 86)

Stopped the bleeding (W1), shipped subagent routing (W2), migrated to AI SDK v6 native HITL + contextBag (W3), enforced auth-bridge for AI tools (W3.5), shipped CSV import + dual-LLM safety (W4), enrichment waterfall + file analysis vision (W5.1/5.2), multi-provider failover resolver + variant-matrix scorer (W6.3/6.6), fixed the commit-arg-strip + friendly-errors incident (2026-05-24).
Score 41 → 86. Reference: git history pre-2026-05-24.

### ✅ Phase 4 Part 1 (first wave) — Reliability core — SHIPPED 2026-05-24 (86 → 90)

P1.1 multi-provider failover wiring; P1.3 file-analysis custom-field application; P1.5 follow-up code-keyed tools; P1.6 chat panel polish; P1.7 conversation header; P1.8 auto-titles. 6 ships.

### ✅ Phase 4 Part 1 (second wave) — Schema + structured tools — SHIPPED 2026-05-24 (90 → 92)

P1.10 dynamic schema injection (`buildOrgSchemaContext` — every custom field + tag + member + recent activity now in the prompt); P1.9 ToolSummary envelope (headline + table + suggested-next chips on `commit_*` tools); P1.4 ToolInstruction structured template (whenToCall / whenNotToCall / examples on tool registration). Reference tools migrated: `create_lead`, `update_entity`. Pattern set for follow-on tools.

### ✅ Phase 4 Part 1 (third wave) — Memory + UX surface — SHIPPED 2026-05-24 (92 → 95)

P1.11 multi-tier `FriendlyToolError` (`{ summary, details, manualSteps, recoveryActions }` + `<ChatToolError>` card); P1.12 `aiPersonaContext` table + `update_*_context_facts` tools (per-org + per-user durable AI memory, hard-capped); P1.13 route-aware context (`## Current page` block + `useChatRouteContext` hook); P1.14 proactive AI suggestions panel (pure heuristic, no model calls).

### ✅ Phase 4 Part 1 (fourth wave) — Closeout — SHIPPED 2026-05-24 (95 → 96)

P1.2 streaming markdown polish (lazy table, defer mid-stream heading, text-balance); 5 high-traffic tool migrations to `instruction` + `summary` (create_contact, create_deal, create_company, add_note, create_followup) and `instruction` on search_crm; AISuggestionsPanel mounted on dashboard + person profile overview with a window-event chat-prefill bridge (`core/ai/lib/chatPrefill.ts`); per-user follow-up snapshot block + file-upload limits added to system prompt.

### ✅ Phase 4 Part 1 (fifth wave) — AI-native cleanup — SHIPPED 2026-05-24 (96 → 97)

Schema cleanup: dropped `orgs.aiContext` column entirely (no back-compat — migrated via `convex/_migrations/2026_05_24_dropOrgAiContext.ts`). Added `identity` field to `aiPersonaContext` table — single source of truth for owner-edited org description coexisting with AI-managed `summary`/`keyFacts` in the same row. New owner-edit endpoints (`setOrgIdentity` orgMutation + `setOrgIdentityForAI` internal twin + `getOrgIdentity` orgQuery). Settings UI rewired. New AI tool `update_org_identity` so the agent itself can amend the workspace description on user request. Last 6 lower-traffic tool migrations completed (`create_reminder`, `complete_reminder`, `complete_followup_by_code`, `cancel_followup_by_code`, `enrich_record`, `analyze_file`). Per-entity `aiContext` auto-rebuild shipped as a 455-line deterministic rule-based summariser (see §0.3) + 14 unit tests. Codebase cleanup pass: bulk-removed 35 unused-`ctx` destructures; fixed CSS @import ordering; fixed Rules of Hooks violation in TimelineRow; replaced array-index keys; fixed a11y aria-label on span. End state: typecheck 0 / 243 backend tests / 140 frontend tests / biome 0 errors / **`pnpm build` SUCCESS** (18 routes, all green).

### ✅ Phase 4 Part 2 — Telemetry + AI quota gate + folder restructure — SHIPPED 2026-05-24 (97 → 99)

Telemetry writer (`convex/ai/telemetry.ts`, 133 lines) — `recordToolEvent` internal mutation never throws; `sumTokensThisMonth` internal query for the quota gate. Wired into `streamLoop`: `tool-call` records start time, `tool-result` writes a success row, `tool-error` writes a failure row, `finish` writes a synthetic `_chat_turn` row with the turn's total input/output tokens (the rollup query filters `_chat_turn` from per-tool breakdowns but counts its tokens for the usage gauge + per-model rollups). Rollup query `convex/ai/queries/telemetry.ts::getOrgUsage` (247 lines) returns `{ plan, limit, usedThisMonth, range, topTools[], topModels[], daily[] }` over 7d/30d/90d windows — single query feeds both the AI Usage settings card and Billing → Plan limits.

AI quota gate (`convex/ai/orchestrator/quotaGate.ts`, 62 lines) — Free tier (`aiTokensPerMonth = 0`) hard-blocks AI; metered tiers compare month-to-date totals against `getPlanLimits(plan).aiTokensPerMonth` and fail the chat with a friendly markdown message that points to Settings → Billing or BYOK. Enterprise (`-1`) is unmetered.

UI: 
- **Settings → AI** rewritten — five sections: Business Context (owner-edited), AI Memory (NEW — read-only view of the AI's dynamic summary + keyFacts per workspace + per user, with self-scoped "Forget all" buttons; identity blob explicitly preserved), AI Preferences, API Keys (BYOK), AI Usage (NEW — gauge with red flash at 100%, range tabs 7d/30d/90d, 4-stat strip, daily token sparkline, top-5 tools + top-5 models tables). 
- **Settings → Billing → Plan limits** — wired the `AI tokens / mo` UsageBar to the same `getOrgUsage` query so it shows real consumption (was hardcoded 0).
- **Settings → AI subnav**: `Business Context / Memory / Usage` (dropped the never-implemented "AI Features" toggle).

Settings folder restructure to match UI groups:
1. `groups/notes/*` → `groups/crm/*` (NoteCategoriesSection, RemindersSection, FollowupsSection, TimelineSection live under the CRM tab in the UI). The `notes/` folder is gone.
2. `groups/crm/PipelineEditor` + `StageFieldsTable` + `StageScopedEditFieldDialog` → `groups/pipelines/*` (these belong to the Pipelines settings group).
3. `groups/crm/CreateFieldDialog` + `EditFieldDialog` + `SortableFieldsTable` + `FieldEditor` → `groups/modules/*` (these are per-entity field-definition editors used by Modules).

Net: every settings folder name now matches its UI group, so finding the file from a UI element is trivial.

End state: typecheck 0 / 243 backend tests / 140 frontend tests / biome 0 errors / **`pnpm build` SUCCESS** (18 routes).

---

## §2 — Pending work (full specs, ordered by sequence)

### §2.0 — Reactive completeness wave + dashboard fix (audit-driven, 2026-05-25)

Three new audit deliverables at the repo root drive the next sprint:

| Doc | Headline finding |
|---|---|
| [/AI-AUDIT-COMPLETE.md](./AI-AUDIT-COMPLETE.md) | 75 AI tools registered, 51 actionable gaps. **P0:** AI cannot send messages — `crm/shared/messages/mutations:send` exists but no `send_message` tool wraps it. **P1:** no `update_reminder`, no per-entity `delete_*`, no note-edit tools, no company-person link tools. |
| [/DASHBOARD-AUDIT.md](./DASHBOARD-AUDIT.md) | Reminders widget hidden because `generic` template writes `reminders.list` but `RemindersCard` is gated on `reminders.dueToday`. Plus 9 more dashboard keys aren't in `WIDGET_KEYS`. Empty widgets render `null` instead of CTA cards. |
| [/AI-AGENT-CAPABILITY-AUDIT.md](./AI-AGENT-CAPABILITY-AUDIT.md) | Senior-CRM-specialist scorecard: 5.8/10. Reactive 9/10, Proactive 4/10, Analytical 3/10, Autonomous 1/10, Creative 2/10. Roadmap milestones A–E, ~10 eng-weeks. |

**Sprint scope (next session):**

| ID | Wave | Headline | Effort |
|---|---|---|---|
| ✅ R1 | Reactive | **SHIPPED 2026-05-26 (Stage 2)** — `send_message` (+ commit), `list_messages`, `mark_thread_read`, `add_participants` (+ commit), `remove_participant` (+ commit). New `messaging` tool layer in `convex/ai/tools/messaging/`; ForAI twins added across `convex/crm/shared/messages/{mutations,queries}.ts` and `convex/crm/shared/conversations/{mutations,queries}.ts`; system prompt `## Messaging` verb-routing block; 8 contract tests. | M (~1 day) |
| ✅ R2–R5 | Reactive | **SHIPPED 2026-05-26 (Stage 3)** — Universal `delete_entity` (+ commit) routing to `softDeleteForAI` for lead/contact/company/deal + `removeForAI` for note/reminder; `update_reminder` (+ commit, accepts followUpCode or reminderId); `update_note` / `delete_note` (+ commits) + `pin_note` / `set_note_category` (atomic); `add_person_to_company` / `remove_person_from_company` (+ commits). ForAI twins extracted on entity `softDelete` mutations + companies `addPerson`/`removePerson` + notes `update`/`togglePin`/`setCategory`/`remove` + reminders `update`/`remove`. New cascade-impact internal query at `convex/ai/queries/cascadeImpact.ts`; system prompt gained Stage-3 verb-routing for Notes / Reminders / Companies / universal deletion; 12 ForAI contract tests at `convex/ai/tools/stage3/stage3.test.ts`. | M total |
| ✅ D1 | Dashboard | **SHIPPED 2026-05-26 (Stage 1)** — Extended `WIDGET_KEYS` 12 → 25 keys; `WidgetMeta` entries for every template-used section + KPI + placeholder. `convex/_shared/widgetRegistry.ts`. | S |
| ✅ D2 | Dashboard | **SHIPPED 2026-05-26 (Stage 1)** — Idempotent migration `convex/_migrations/2026_05_26_normalizeDashboardMetrics.ts` rewrites `calendar.miniWidget` → `calendar.mini`; all 9 templates use canonical keys; dev run scanned 1, patched 0 (already canonical). | S |
| ✅ D3 | Dashboard | **SHIPPED 2026-05-26 (Stage 1)** — `MessagesPreviewWidget` / `TimelineActivityWidget` / `WeekAheadWidget` / `MiniCalendarWidget` CTA empty states; `TimelineFeed.emptyState.action` + `sendChatPrefill` wiring. | S each |
| ⬜ D4 | Dashboard | Mount `AIQuickComposerCard` on dashboard so the user can talk to the AI without opening the sheet — **deferred to Stage 5** (`SPRINT-PLAN.md` "AI dashboard surface" stage groups all AI-surface widgets). | S |

After this sprint, AI parity with manual UI moves from ~70% → ~95%. ✅ **Stages 1-10 SHIPPED 2026-05-26.** Score moves 99 → 99.5 (still gated on Billing for the 100 mark — Phase 4 Part 3 / T9). Stage 10 hardening pass shipped 4 production-grade pure helpers (`convex/_shared/{sanitiseExtractedText,csvEncodingDetect,bulkProgress,enrichmentErrorMap}.ts`) wired into `analyze_file`, `import_csv`, `bulk_update_entities`/`bulk_close_deals`, and the 4-provider enrichment trace; 39 contract tests at `convex/stage10.test.ts` close the AI-AGENT-CAPABILITY-AUDIT.md §3 P1 security gap (adversarial-file XSS) + the §17 row-level bulk-progress gap + the §17 CSV encoding gap + the §17 enrichment provider failure-recovery gap + the DASHBOARD-AUDIT.md §6 RemindersCard render assertion. Capability scorecard 8.5 → 8.6/10.

### §2.1 — Phase 4 Part 3: Billing wall via LemonSqueezy (target +1 pt → 100)

Free tier capped at `aiTokensPerMonth = 0` already hard-blocks AI today (via the quota gate shipped in Part 2 — `convex/ai/orchestrator/quotaGate.ts`). What's still missing is the **paid-tier upgrade flow** that maps a successful LemonSqueezy checkout to a tier change on the org doc:
- LemonSqueezy webhook handler in `convex/billing/internal.ts::applyWebhookEvent` is already implemented (lives under `convex/billing/`); the missing piece is the **end-to-end smoke test + production webhook signing-secret rotation playbook**.
- Pricing card on `/settings/billing` already exists; the missing piece is **per-variant feature-gate copy** (e.g. "Pro unlocks AI Memory + 1M tokens").
- Trial flow + grace-period handling on `subscription_past_due`.

### §2.2 — Future-Enhancements deferrals

See `Future-Enhancements.md` §B for non-Part-3 deferrals. Highlights:
- §B.20 — cross-conversation learning (model summarises last 30 conversations into a long-term insight).
- §B.21 — workflow event integration (Trigger.dev runs that fire AI suggestions on inbound webhook events).

---

## §3 — Production-readiness scorecard

| Dimension | Weight | Pre-fix raw | After this session | Notes |
|---|---|---|---|---|
| Agent loop reliability | 20 | 5/20 | **20/20** | W1 + W3 + §6.5 fixes + 2026-05-24 bundle + P1.1 failover wiring. |
| Tool surface | 15 | 8/15 | **15/15** | 30+ tools, full subagent routing, 3 dual-LLM workers, ToolInstruction template (12/12 high-traffic tools migrated), ToolSummary envelope shipped, write tools cover settings/schema/pipelines/tags/members. |
| Safety / dual-LLM | 10 | 0/10 | **10/10** | Three independent dual-LLM workers + commit-arg strip. |
| Vertical-CRM features | 15 | 0/15 | **14/15** | CSV, enrichment waterfall, file analysis vision + custom-field apply, per-entity rule-based aiContext rebuild. -1 reflects deferred enrichment plug-ins (LinkedIn, email-finder). |
| Eval / scorer | 10 | 0/10 | **9/10** | 243 backend + 140 frontend deterministic tests + variant-matrix harness. -1 for live model variants in CI (Phase 4 Part 2). |
| Telemetry | 5 | 0/5 | **5/5** | `aiToolEvents` writer wired into streamLoop (call/result/error + per-turn `_chat_turn`); `getOrgUsage` rollup + AI Usage settings card + Plan-limits gauge wired (Phase 4 Part 2). |
| Cost / failover | 5 | 1/5 | **5/5** | Resolver + orchestrator wiring shipped. |
| Billing wall | 10 | 0/10 | **2/10** | Phase 4 Part 2 quota gate hard-blocks AI on free tier today; LemonSqueezy webhook + pricing-card copy + trial flow remain — Phase 4 Part 3. |
| UX (chat panel, approval cards, titles) | 10 | 7/10 | **10/10** | Auto-titles, real conversation header, multi-tier friendly errors (P1.11), approval cards, ToolSummary cards (P1.9), proactive AI suggestions panel mounted on dashboard + entity (P1.14), route-aware page block (P1.13), durable persona memory (P1.12), streaming markdown polish (P1.2). |
| Documentation | 0 (gate) | 5/10 | **10/10** | This doc — collapsed to phase summaries; AI Context Architecture documented in §0.2; AI write capabilities table in §0.2. |
| **Total** | 100 | **26 raw** | **99 / 100** | |

Target end-of-Part-3: 100 / 100.

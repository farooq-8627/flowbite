# AI-AGENT-CAPABILITY-AUDIT.md — How close are we to "senior CRM specialist"?

> **Generated:** 2026-05-25 by reading the orchestrator, the 75 registered tools, the suggestion engine, the briefing actions, and the system-prompt builder.
>
> **The user's bar:** *"a senior CRM specialist who can manage everything"* — not a chat-box that calls tools when asked, but a proactive partner that **suggests, improves, analyses, gives ideas, creates followups/reminders by itself, and runs autonomous tasks without input.**

## TL;DR

| Capability | Today | Bar | Gap |
|---|---|---|---|
| **Reactive — does what user asks** | 9/10 | 10/10 | Messages, file mgmt, edit-note, reopen-deal, role-CRUD missing (see AI-AUDIT-COMPLETE.md §16) |
| **Proactive — suggests next action** | 4/10 | 9/10 | Heuristic-only chips today; no ranked queue, no per-record next-action, no LLM-driven |
| **Analytical — explains the data** | 3/10 | 8/10 | `get_dashboard_summary` is read-only stats. No "why is pipeline down?" / "which leads are stale?" reasoning. |
| **Autonomous — acts on its own** | 1/10 | 8/10 | Only the daily / weekly briefing job runs autonomously. No "every Monday at 9 AM, scan for stale leads + create followups" workflows. |
| **Creative — drafts content** | 2/10 | 7/10 | Can write a note via `add_note`, but can't draft an email, draft a proposal, or generate a stage-aware followup template. |
| **Memory — long-term context** | 7/10 | 8/10 | Org + user persona + per-entity rebuild is shipped. Missing: cross-entity insights, lifelong-learning from past wins/losses. |
| **Trust — calibrated, predictable** | 7/10 | 9/10 | Two-step approvals shipped, runbooks shipped, telemetry shipped. Missing: per-tool error recovery rate published to user, "why did you do that?" trace UI. |

**Verdict:** The agent is a **strong reactive intern** today. To become a senior CRM specialist, we need 3 missing layers: **proactive ranking**, **analytical reasoning**, and **autonomous workflows**.

---

## 1 — What works today (reactive layer)

### Tools (75 registered) — see `AI-AUDIT-COMPLETE.md` for the full list

The tool surface is broad and the orchestrator handles:

- **Two-step HITL approval.** `propose_*` tools never write; the user approves; the matching `commit_*` writes via the `_ForAI` internal twin. Pattern is proven across 28 mutation tools.
- **Layered tool loading.** `expand_tools` activates a layer on demand → ~3500 tokens always-on, ~1500 added per layer. Saves 80% of prompt cost on simple turns.
- **Auth bridge (Option B).** Scheduled-action auth-loss is solved end-to-end via the `*ForAI` twin pattern (locked decision in AGENTS.md).
- **Long-term memory.** `aiPersonaContext` table (org + user) holds AI-managed `summary`/`keyFacts` plus owner-edited `identity`. Per-entity AI context rebuilds via deterministic rule-based summariser (no LLM cost — see `convex/ai/internal.ts`).
- **Friendly errors.** `friendlyToolError.ts` rewrites Convex/Zod errors into actionable next-steps. `zodErrorFormatter.ts` injects working examples into validation failures so the model self-corrects on the next step.
- **Cost & rate gating.** Per-org plan limits via `quotaGate.ts`; per-org rate limits via `rateLimit.ts`. Telemetry rolls up to the AI Usage dashboard.
- **Streamed reasoning.** `reasoningBuffer.ts` + `ThinkingTimeline.tsx` stream the model's intermediate steps to the UI so the user sees what it's doing.

### Heuristic suggestions (`convex/ai/suggestions.ts`)

- Already shipped. Pure rule-based, free at scale. Surfaces:
  - "Add a note" prompts when an entity has no recent activity.
  - "Convert to contact" prompts when a lead is qualified but not converted.
  - Generic action chips on the dashboard.

### Daily / weekly briefing (`convex/ai/briefingsActions.ts`)

- Already shipped. Cron-driven (`convex/crons.ts`). Generates per-user daily briefings + per-org weekly insights. **This is the only autonomous AI behaviour today.**

---

## 2 — What's missing — by capability bucket

### 2.1 — Proactive intelligence (Bar 4/10 → 9/10)

A senior CRM specialist surfaces **the right next action without being asked.** Today the AI is mostly reactive.

**Gaps:**

| # | Capability | Implementation sketch |
|---|---|---|
| P-1 | **Per-record next-action ranking.** For every open lead/deal, score "what should happen next?" (call, email, qualify, nurture). Rank globally for the user's homepage. | New `convex/ai/queries/nextActions.ts` + `ai/suggestions/rank.ts`. Run as a cron every 30 min. Materialise into `aiNextActions` table indexed by `(userId, score desc)`. Render in `AISuggestionsPanel` and as a dashboard ribbon. |
| P-2 | **Stale-record detector.** Daily scan: "These 7 leads haven't moved in 14 days. Want me to follow up?" | Add to the daily briefing job. Surface stale list as a dashboard card. |
| P-3 | **Pipeline-anomaly alerts.** "Pipeline value dropped 12% this week — 3 deals slipped to next month." | New `convex/ai/queries/anomalies.ts`. Detect with simple WoW deltas; let user opt-in to LLM commentary. |
| P-4 | **Suggested followup cadence per stage.** Each pipeline stage gets a default "if stuck for N days, do X". | Extend `pipelineStages` with `defaultFollowupAfterDays + defaultFollowupTemplate`. AI auto-creates the reminder. |
| P-5 | **"Just like Acme" pattern matching.** When a new lead is created, surface "These 3 leads are similar — they all converted in 21 days; here's the playbook we used." | Embedding-based similarity. Future-Enhancements.md backlog. |

### 2.2 — Analytical reasoning (Bar 3/10 → 8/10)

The AI today returns **stats but not insights.** A specialist explains *why*.

**Gaps:**

| # | Capability | Implementation sketch |
|---|---|---|
| A-1 | **"Why is X happening?" tool.** Given a metric drop / surge, fetch the underlying records + run a structured analysis. | New `analyze_metric` tool. Inputs: `{ metric: "deals.pipelineValue", range: "7d" }`. Output: top contributors + a model-generated narrative paragraph. |
| A-2 | **Cohort analysis.** "Leads from [source] convert at X%; leads from [other source] at Y%." | New `cohort_analysis` tool driving an `aiCohortReports` table. Cron-rebuilt nightly. |
| A-3 | **Win/loss reasoning.** When a deal closes, write a structured "what worked / what didn't" note linked to the deal. | Hook into the `close_deal` mutation → schedule an `analyzeDealClose` action that asks the model to interview the chat history + notes and write a structured retrospective. |
| A-4 | **Pipeline-velocity per stage.** Avg days-in-stage, dropoff per stage. Plain answer to "where do leads die?" | New `convex/ai/queries/pipelineVelocity.ts`. Surface in BillingGroup-style chart. |
| A-5 | **Owner performance.** "Sara closed 8 of her 12 deals in 30 days; Ben closed 2 of 14." Privacy-gated to managers (`org.manage` or `members.viewPerformance`). | New `member_performance` query + a manager-only AI tool. |

### 2.3 — Autonomous workflows (Bar 1/10 → 8/10)

Today the only autonomous job is the daily briefing. A senior specialist runs **standing orders.**

**Gaps:**

| # | Capability | Implementation sketch |
|---|---|---|
| W-1 | **Standing orders / playbooks.** "Every Monday 9 AM: scan all leads where lastActivityAt > 14 days, create a follow-up reminder for each, summarise the list and email me." | New `aiStandingOrders` table: `{ orgId, userId, schedule: cron, prompt: string, allowedTools: string[], lastRunAt, lastRunSummary }`. Convex cron evaluates each. Audit trail in `aiToolEvents`. |
| W-2 | **Auto-followup on stage move.** When a deal moves to stage X, auto-create followup Y. | Extend `pipelineStages.onEnter` config. Reusable from W-1. |
| W-3 | **Auto-tag + categorise.** When a new contact is created, auto-classify (industry, ICP fit, tier) and apply tags. Confidence-gated — low confidence → ask the user. | Background action triggered by the `crm/entities/contacts/mutations:create` mutation via `ctx.scheduler.runAfter`. |
| W-4 | **Auto-enrich on create.** When a lead has a phone or domain, schedule `enrich_record` to fill missing fields. | Hook the existing `enrich_record` flow into create mutations. Already plumbed — just needs the trigger. |
| W-5 | **Weekly health-check email.** Auto-generate a manager weekly digest (deals at risk, top performers, leads stuck). | Reuse `generateWeeklyForOrg` + Resend transactional email. |
| W-6 | **Auto-archive trash after N days.** Already exists as `purgeOldTrash` cron — keep, just expose a setting. | n/a — exists. Add UI toggle. |

### 2.4 — Creative drafting (Bar 2/10 → 7/10)

A specialist drafts content. The AI today writes a 1-line note.

**Gaps:**

| # | Capability | Implementation sketch |
|---|---|---|
| D-1 | **Draft email / WhatsApp message.** "Draft a follow-up to Sara about pricing." Returns a structured draft the user can edit before sending. | New `draft_message` tool that **returns a structured draft, doesn't send**. Pairs with the future `send_message` tool (P0 in AI-AUDIT-COMPLETE.md). |
| D-2 | **Generate proposal/quote.** Given a deal + line items, draft a proposal markdown. | New `draft_proposal` tool. Uses templates from `convex/crm/fields/templates`. |
| D-3 | **Summarise a conversation.** "What did Sara and I agree on in the last 5 messages?" | Reads `messages.queries:listForPerson`, returns a 3-bullet summary + action items. **Blocked by missing `list_messages` tool.** |
| D-4 | **Draft a note from a voice memo / file.** Upload a memo, AI summarises into a structured note. | Already partially exists via `analyze_file`. Just needs a wrapper that auto-creates a note from the analysis. |
| D-5 | **Generate stage-specific followup template.** "For 'Discovery Call' stage, what's our standard followup script?" | Combine pipeline stage + org persona + past wins → model returns a template. Can prefill `create_followup`. |

### 2.5 — Trust & explainability (Bar 7/10 → 9/10)

| # | Capability | Status |
|---|---|---|
| T-1 | **"Why did you do that?" trace UI.** For every committed action, show the chain: user said X → I called Y → Y returned Z → I called W. The data is already in `aiToolEvents` + `aiConversations.messages`. Just needs a viewer at `/{orgSlug}/ai/trace/:conversationId`. | ⬜ Pending — Stage 7 (Analytical layer + Trace UI). |
| T-2 | **Per-tool reliability score.** Tool reliability over the last 30d: % success, avg duration, top error reason. Surface in Settings → AI → AI Usage. | ✅ Implemented — Stage 5. `convex/ai/queries/telemetry.ts:getOrgUsage.reliability.perTool` aggregates from the existing `aiToolEvents` `by_org_and_started` index; `core/platform/settings/components/groups/ai/AIReliabilityCard.tsx` renders the table with 7d / 30d / 90d range tabs + top-error highlight. The "View trace" button is a placeholder — wires to T-1 in Stage 7. |
| T-3 | **AI changelog.** "What did the AI do for you this week?" timeline of every committed action. View on top of `aiToolEvents`. Prioritise high-impact (mutations, not reads). | 🟡 Partial — Stage 4 shipped `list_org_timeline` with optional `actorType` filter so the AI can answer "what did I do today?" in chat. The dedicated changelog UI deferred to Stage 7. |
| T-4 | **Confidence labels on suggestions.** Every AI-driven suggestion shows "high / medium / low confidence" + the rationale. Already in the heuristic engine for some suggestions. Generalise. | ⬜ Pending — Stage 6 (`aiNextActions` table introduces `confidence` field + rationale text). |
| T-5 | **Allow-list for autonomous actions.** Per-user toggle: "AI can auto-create followups: yes/no". "AI can auto-enrich contacts: yes/no". | ⬜ Pending — Stage 8 (`users.preferences.aiAutonomy` map). |

---

## 3 — The "every-edge-case" matrix

Per the user: *"can do actual work even in edge cases also and where edge cases are missing for what functions etc."*

For each tool family, the edge cases that **are** handled vs **aren't**:

### CRUD tools

| Edge case | Handled? | Where |
|---|---|---|
| Duplicate detection (phone, email, domain) | ✅ | `_shared/dedup.ts`, surfaced in `commit_create_*` propose payloads |
| Missing required field | ✅ | Zod validation → `zodErrorFormatter.ts` → ask via `ask_user_input` |
| Bad enum value | ✅ | Zod errors include the valid set |
| Org-tier permission denied | ✅ | `requireRole` throws → friendlyToolError converts to "Ask an admin to enable X." |
| Race: entity deleted while AI is mid-propose | ✅ | Internal twin re-validates entity existence |
| Race: entity converted (lead → contact) while AI proposes | ⚠️ | The convert tool refuses if already a contact; other tools may still hold a stale ref. P2. |
| Cross-entity link (e.g. deal references a lead that doesn't exist) | ✅ | Code resolution (`_shared/recordCodes.ts`) raises a clear error |
| Custom field type mismatch (writing string to a number field) | ✅ | `aiEntityPatch.ts` coerces or rejects with a clear msg |
| Field ARCHIVED but user tried to write it | ✅ | The propose preflight checks via `list_entity_fields` |
| User attempts to write a system-managed field (e.g. `personCode`) | ✅ | Schema validator rejects |

### Bulk tools

| Edge case | Handled? | Where |
|---|---|---|
| Partial failure (3 of 10 rows fail) | ⚠️ | Returns the failure count but **no row-level diff**. The runbook's `onPartialSuccess` hint is generic. P2. |
| Rate limit hit mid-bulk | ⚠️ | Halts at the first 429; surfaces via friendlyToolError. **No checkpoint/resume.** P2. |
| User cancels mid-bulk | ❌ | Today there's no cancel mid-bulk-commit (the propose card has cancel; the commit doesn't). |
| > 1000 row bulk | ⚠️ | `_platform/limits.ts` caps at 500 rows per call. Above that, AI must chunk manually. P3 — should auto-chunk. |

### CSV import

| Edge case | Handled? |
|---|---|
| Wrong column → field mapping | ✅ Preview card lets the user remap |
| Duplicates with existing records | ✅ Per-row dedup check, user picks merge/skip/overwrite |
| Encoding issues (BOM, UTF-8 vs Latin-1) | ⚠️ Best-effort detection in `quarantined/csvParser.ts`. Unusual encodings = user gets confused error. P3. |
| Phone numbers in 50 different formats | ✅ Normalisation via `lib/parsers.ts` |
| Date parsing | ⚠️ Parses ISO + a few common formats. EU vs US ambiguity (DD/MM/YYYY vs MM/DD/YYYY) is a guess. P2. |
| Custom fields not yet defined | ✅ The preview surfaces "create field?" inline |
| File >10 MB | ⚠️ Capped server-side; error message is generic. |

### Enrichment

| Edge case | Handled? |
|---|---|
| Provider returns 401 / 429 / 500 | ⚠️ Caught but error surface is not provider-specific. Provider stubs are deterministic in dev. |
| Provider returns wrong record (matched on stale email) | ❌ No confidence-score gate today. Always shown to user for confirmation. (That's actually OK — user is the gate.) |
| Multiple providers disagree | ❌ No reconciliation. P3. |
| User's API key invalid | ⚠️ Generic "key invalid" — could be sharper. |

### File analysis

| Edge case | Handled? |
|---|---|
| File >25 MB | ⚠️ Rejected with generic error — should hint "file too large" + suggest split |
| Encrypted PDF | ❌ Will fail mysteriously. P3. |
| OCR-required image (e.g. a scanned receipt) | ⚠️ Goes through but quality is provider-dependent. |
| Audio file | ✅ Whisper-style transcription via the analyser pipeline |
| Adversarial extraction (XSS / injection in extracted text) | ❌ Not currently sanitised before display. P1 security gap. |

### Permissions / RBAC

| Edge case | Handled? |
|---|---|
| User has the perm key but org plan doesn't allow the feature | ✅ `enforcePlanLimit` runs ahead of `requireRole` |
| User loses the perm mid-conversation (admin removes it) | ⚠️ Next tool call rechecks; in-flight tool may complete first. Acceptable. |
| AI invokes a tool gated on `org.manage` for a non-admin | ✅ `expand_tools` filters tools by user perm; the model never sees them |
| Cross-org reference (somehow) | ✅ `requireOrgMember` guard at every twin |

### Memory / persona

| Edge case | Handled? |
|---|---|
| Persona blob exceeds 10 KB | ✅ Soft cap in `setOrgIdentity` |
| KeyFacts list exceeds 30 entries | ✅ Auto-trims oldest in `upsertPersonaForAI` |
| User-level vs org-level conflict (user persona says X, org persona says Y) | ✅ User overrides org for personal pref keys; org wins for shared facts. Decision is documented in `convex/ai/personaContext.ts`. |
| Per-entity rebuild fires for a deleted entity | ✅ Silent no-op via the rule-based summariser (`internal.ts`) |
| Memory write fails due to schema drift | ✅ Migration `2026_05_24_dropOrgAiContext` ensures compatibility. |

---

## 4 — Recommendations to reach "senior CRM specialist"

Ship in this order. Each milestone unlocks the next.

### Milestone A — close the reactive gaps (1-2 weeks)

- Ship the P0 + P1 tools listed in `AI-AUDIT-COMPLETE.md §16`.
- Fix the dashboard widget hide-on-empty bug + key-mismatch bug from `DASHBOARD-AUDIT.md`.
- Add the AI Quick Composer to the dashboard.

After this: AI can do **everything** the user can do via UI.

### Milestone B — proactive layer (2-3 weeks)

- Materialise next-actions table (`P-1`).
- Stale-record detector (`P-2`).
- Pipeline anomaly alerts (`P-3`).
- AI Pulse ribbon + AI Insights ribbon on dashboard.

After this: the user sees the AI working **before they ask.**

### Milestone C — analytical layer (2-3 weeks)

- `analyze_metric` tool (`A-1`).
- Cohort analysis + win/loss reasoning (`A-2`, `A-3`).
- Pipeline velocity dashboard (`A-4`).
- Trace UI (`T-1`) for trust.

After this: AI is the source of truth for "why is the business performing the way it is?"

### Milestone D — autonomous layer (3-4 weeks)

- Standing orders / playbooks table (`W-1`).
- Auto-actions on stage move + auto-enrich on create (`W-2`, `W-4`).
- Per-user autonomy allow-list (`T-5`).

After this: AI runs the workspace overnight while the team sleeps.

### Milestone E — creative layer (2 weeks)

- `draft_message` (pairs with `send_message` from Milestone A).
- `draft_proposal`.
- Auto-summarise conversation.

After this: the user can offload writing as well as logistics to the AI.

---

## 5 — Cost & complexity per milestone

| Milestone | Token cost / org / month (est.) | Eng-weeks | Risk |
|---|---|---|---|
| A — Reactive | +$0 (no new LLM calls — just tool wrappers) | 1-2 | Low |
| B — Proactive | +$3-8 (cron-driven scoring, mostly heuristic) | 2-3 | Low |
| C — Analytical | +$10-20 (LLM-driven narrative) | 2-3 | Medium |
| D — Autonomous | +$15-40 (cron-driven LLM, depends on user opt-in rate) | 3-4 | Medium-High (RBAC, auto-action audit trail) |
| E — Creative | +$5-15 (drafts only, no autosend) | 2 | Low |

Total to reach senior-CRM bar: **~10 eng-weeks, +$30-80/org/mo at full opt-in.**

---

## 6 — Final scorecard

| Dimension | Score | Comment |
|---|---|---|
| **Tool surface breadth** | 8/10 | 75 tools, ~70% of high-traffic CRM ops |
| **Tool surface depth (edge cases)** | 7/10 | Solid for CRUD + scheduling; weak for adversarial files, partial bulk failure, multi-provider enrichment |
| **Two-step approval / HITL** | 9/10 | Excellent — the propose/commit pattern is rock-solid |
| **Memory & personalisation** | 8/10 | Org + user + per-entity, with deterministic rebuild — best-in-class |
| **Cost telemetry** | 9/10 | Per-tool, per-model, sparkline, plan gauge — all shipped |
| **Proactive intelligence** | 4/10 | Heuristic chips + briefings only |
| **Analytical reasoning** | 3/10 | Stats yes, narrative no |
| **Autonomous workflows** | 1/10 | One cron job |
| **Creative drafting** | 2/10 | Notes only |
| **Trust / explainability** | 7/10 | Great error UX; no trace UI yet |
| **OVERALL** | **5.8/10** | Strong reactive foundation; not yet a specialist. |

---

## 7 — In one sentence

We have built a **reliable junior agent** with excellent guardrails. The route to a senior specialist is to layer **proactive ranking → analytical narrative → autonomous workflows** on top of the existing tool surface — total ~10 weeks, all unblocked technically.

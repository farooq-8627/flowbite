# PHASE-3-PLAN.md
> Created: 2026-05-22
> Replaces: PHASE-3-NEXT.md (see that file for redirect), INDUSTRY_ADAPTABILITY_ANALYSIS.md (deleted), CODE-ARCHITECTURE-PIPELINES-2026-05-20.md (deleted)
> Read order: AGENTS.md → PHASE-2-PROGRESS.md → **this file** → relevant module STATE.md

---

## Quick-Reference

| Section | Content |
|---|---|
| §1 | Phase 2 completion honest score |
| §2 | Industry-template audit — what's shipped vs what's wrong |
| §3 | 4-industry redesign spec (Real Estate / B2B SaaS / Freelancer / Productivity) |
| §4 | Phase 3A — workspace polish & industry coverage (must-ship first) |
| §5 | Phase 3B — AI assistant (the product) |
| §6 | Phase 3C — WhatsApp / voice |
| §7 | Avoidlist + entry checklist |
| §8 | Feature-flag layering |
| §9 | Production-readiness gap list |
| §10 | Doc-cleanup record |
| §11 | Long-term industry coverage (Gaps 1–3) |

---

## §1 Phase 2 Completion — Honest Score

**Verdict: 100% on the locked Phase-2 scope. ~85% of what "public launch ready" actually requires.**

The gap is not Phase-2 work — it is the launch-prep checklist between phases.

| Layer | Status | Evidence |
|---|---|---|
| Convex schema (28 tables, 7 schema files) | ✅ Complete | `convex/schema/*.ts`, canonical 7-step mutations, all `.withIndex()` — no `.filter()` |
| Permission catalog SSOT | ✅ Complete | `_shared/permissions/catalog.ts` drives seed, runtime checks, role editor, tests |
| Mutations / queries for all 4+2 entities | ✅ Complete | leads, contacts, companies, deals, entity5/6 — kanban drag, stage-aware fields, transition policy |
| Pipelines (multi-pipeline + per-stage fields + warn/block/off policy) | ✅ Complete | `convex/crm/fields/pipelines/*` + `STATE.md` |
| Frontend slices 0–7 | ✅ Complete | DataTable, Kanban, list+board for all entities, profile, deal detail, messages, notes, calendar, reminders, follow-ups, timeline, settings, dashboard |
| Performance optimisations P1–P7 | ✅ Complete | 1 mutation/drop, batched per-row data, identity via context, optimistic updates, server-rate-limits |
| RTL / i18n | ✅ Complete | All Tailwind logical properties, `dir="rtl"`, `messages/ar.json` |
| Industry-template seeder | ✅ Wired | `setupWorkspaceFromTemplate` seeds 17 surfaces atomically + idempotent |
| AI runtime | ❌ Stub only | `convex/ai/internal.ts` = 30-line no-op. Every mutation already fires `ctx.scheduler.runAfter(0, internal.ai.rebuildEntityContext, ...)` — wiring costs nothing on mutation side. Tool registry / chat UI / streaming proxy / WhatsApp = all unbuilt |
| Mock data on signup | ❌ Missing | Templates seed structure only (pipelines, fields, tags, categories, saved views). **Zero leads/contacts/deals/notes inserted.** New users land on empty boards |
| `entityVisibility` honored in nav | ❌ Missing | Flag exists in template type; nothing reads it in the sidebar |
| Billing (Stripe / LemonSqueezy) | ❌ Missing | Plan-tier limits in `_platform/limits.ts`; webhook + checkout don't exist |
| Email send (Resend) | ❌ Missing | Helper at `lib/email.ts` exists; invitation + password-reset templates not wired |
| Soft-delete recovery | ❌ Partial | `deletedAt` columns exist; no `undelete` mutations or trash UI |
| GDPR export / cascade delete | ❌ Missing | |
| CSV import | ❌ Deferred Phase 4+ | Acceptable for v1 |
| Tests | ✅ 113 pass / 1 pre-existing failure | `pnpm test` clean |

**Three gaps block launch:**
1. No mock data → empty workspace fails the "looks alive in 30 seconds" test.
2. AI is the product → stub makes the landing-page promise false.
3. Templates have the right structure but wrong industry shape (see §2).

---

## §2 Industry-Template Audit

### 2.1 What is shipped (7 templates in registry)

| Template id | File | Seeds | Verdict |
|---|---|---|---|
| `generic` | `definitions/generic.ts` | 6-stage pipeline, note categories = "Yellow / Blue / Green / Pink / Purple / Gray" | ❌ Color-named categories — meaningless to users |
| `b2b-saas` | `definitions/b2b_saas.ts` | 6-stage pipeline, BANT fields, MRR/ACV, BDR + AE + CSM roles | ✅ Strong |
| `dubai-real-estate` | `definitions/dubai_real_estate.ts` | RERA / Form F / Ejari / Emirates ID, AED, 95-day rent alert | ✅ Strong — Gulf-only |
| `real-estate` | `definitions/real_estate.ts` | Generic property workflow, no Gulf compliance | ✅ Decent global fallback |
| `agency-freelance` | `definitions/agency_freelance.ts` | 8-stage project pipeline, deposit / invoice / retainer | ✅ Agency — **too heavy for solo freelancers** |
| `freelancer` | `definitions/freelancer.ts` | **60-line shim** — pipeline only, 3 fields, no categories, no tags, no persona | ❌ Half-built |
| `recruiting` | `definitions/recruiting.ts` | Candidate pipeline, skills, experience, resume | ✅ Strong |

### 2.2 Gaps

1. **No `productivity` template.** Deep-plan §14 specifies it; no file on disk.
2. **No Saudi real-estate sub-niche.** Saudi uses Ejar / REGA / Sakani — a different regulatory scheme from Dubai's RERA/Ejari/Form-F. Not just a translation.
3. **`entityVisibility` is dead code.** Template specifies `companies: false` for freelancer; nothing reads it in the sidebar/nav.
4. **Note-category regression.** Only `real-estate` and `dubai-real-estate` use semantic names. All others still say "Yellow / Blue / Pink".
5. **No mock data.** Seeder seeds structure, not sample records.

---

## §3 Four-Industry Redesign Spec

Focus industries approved for Phase 3:

1. Real Estate (with sub-niche picker)
2. B2B SaaS
3. Freelancer (rebuild — lean solo version)
4. Productivity / Individual (new)

### 3.1 Real Estate — sub-niche picker

```
Onboarding Step 2 → pick "Real Estate" 🏠
Onboarding Step 2b → sub-niche picker:
  🇦🇪  Dubai / Gulf
  🇸🇦  Saudi Arabia
  🌍  Global
```

| Sub-niche | Template id | Key differentiators |
|---|---|---|
| Dubai / Gulf | `real-estate-dubai` (rename from `dubai-real-estate`) | RERA, Form A/B/F, Ejari, Emirates ID, AED, 95-day rent alert, Arabic locale default |
| Saudi Arabia | `real-estate-saudi` (**NEW**) | Ejar (REGA via momah.gov.sa), Sakani, SAR, Iqama/National ID fields, 30-day lease renewal alert |
| Global | `real-estate-global` (rename from `real-estate`) | Generic: Property Type / Intent / Budget / Address / Commission — no regulator-specific fields |

**Essential fields for all sub-niches:** property type, buy/rent/lease/sell intent, bedrooms, preferred area, budget, asking price, agreed price, commission %, closing date.

**Note categories (all sub-niches):** `Urgent` / `Today` / `Hot Inquiry` / `Viewing Notes` / `Done`

**Mock data seeded (deletable, tagged `source:"template_seed"`):**
- 3 leads: "Sarah Khan — Marina 2BR rental", "Ahmed Al-Maktoum — JVC 3BR purchase", "Priya Sharma — Business Bay office"
- 2 contacts: "Omar Hassan", "Lisa Chen"
- 2 deals: 1 in Viewing, 1 in Offer
- 1 company: "Driven Properties LLC"
- 4 notes, 3 reminders (1 due today, 2 upcoming)

### 3.2 B2B SaaS

Already strong. Minor improvements only.

**Sub-niche picker (step 2b):**
- `🚀 Early-stage (< $1M ARR)` — shorter pipeline, lighter fields
- `📈 Growth (SMB sales)` — standard BANT, MRR/ACV tracking
- `🏢 Enterprise` — MEDDIC fields, champion/economic buyer, contract term

**Note categories:** `Urgent` / `Today` / `Discovery Notes` / `Demo Prep` / `Done`

**Mock data seeded:**
- 3 leads: "Julia Rodriguez — Acme Corp, VP Engineering", "Marcus Lee — Buildplex, Head of Ops", "Fatima Al-Hassan — NovaTech, CTO"
- 2 contacts (converted)
- 2 deals: 1 in Discovery, 1 in Proposal
- 1 company: "Acme Corp — 51–200 employees, SaaS"
- 4 notes, 3 reminders

### 3.3 Freelancer — lean solo rebuild

Research finding: **freelancers' #1 complaint is feature bloat**. The existing `agency-freelance` template (450 lines, 8 stages, retainer/milestone/deposit fields) is right for agencies but wrong for solo operators. Two distinct templates going forward.

**Solo (`freelancer`, rebuild — replaces 60-line shim):**
- Hide Companies module (`entityVisibility: { company: false }`)
- Lead → "Inquiry" (optional — some freelancers don't qualify; they quote directly)
- 5-stage pipeline: `Inquiry → Quote Sent → In Progress → Invoiced → Paid` (+ `Lost`)
- Fields: project type (5 options max), scope description, quoted amount, deadline, hourly rate (optional). NO retainer, milestone, payment terms — those are agency features.
- Note categories: `Urgent` / `Today` / `Idea` / `Done`
- No custom roles (solo — not needed)
- AI persona: "You work with a solo freelancer. Keep responses short. Prioritise follow-up and invoice reminders. Don't suggest hiring or team workflows."
- Mock data: 2 inquiries, 2 contacts, 2 deals (1 In Progress, 1 Quote Sent), 3 notes

**Agency (keep `agency-freelance` as-is):**
- 8-stage pipeline + retainer + milestone + deposit
- Companies visible (sub-contractors, partner agencies)
- Custom roles: Project Manager, Designer, Developer, Account Manager

### 3.4 Productivity / Individual — new template

Research finding: **49% of small businesses pay $100+/month on CRM features they never use**. Solopreneurs want task tracking + notes + reminders with a CRM-shaped wrapper. Lead scoring and marketing automation are actively unwanted.

**Template id:** `productivity`

**Entity visibility:**
```
entityVisibility: { lead: false, contact: true, company: false, deal: true }
```
Companies and Leads tabs hidden entirely from sidebar.

**Entity labels:**
- Lead → "Idea" (hidden)
- Contact → "Person"
- Deal → "Task"
- Company → hidden

**Pipeline:** `Todo → In Progress → Review → Done` (+ `Blocked`)

**Task fields:** Priority (Urgent/High/Normal/Low), Due Date, Estimated Hours, Project tag (free text). Nothing else.

**Note categories:** `Today` / `This Week` / `Idea` / `Reference` / `Done`

**Tags seeded:** `#work` / `#personal` / `#side-project` / `#waiting`

**Reminder defaults:** morningBriefingEnabled = true, morningBriefingTime = "08:30"

**AI persona:** "You are a productivity coach. Help prioritise tasks using the Eisenhower matrix. Surface what is overdue. Break big tasks into smaller ones. Never suggest sales tactics or team hiring."

**Dashboard widgets:** tasks-due-today, completed-this-week, overdue-count, streak (days with ≥1 task completed)

**Mock data seeded:** 4 tasks (1 overdue, 1 due today, 1 in-progress, 1 done), 2 ideas in notes, no contacts, no companies — minimal on purpose.

**Custom roles:** none (single-user)

### 3.5 Standardised note categories — kill yellow/blue/pink

| Template | Categories (max 5) |
|---|---|
| `productivity` | Today / This Week / Idea / Reference / Done |
| `b2b-saas` | Urgent / Today / Discovery / Demo Prep / Done |
| `freelancer` | Urgent / Today / Idea / Done |
| `agency-freelance` | Urgent / Today / Brief / Review / Done |
| `real-estate-*` | Urgent / Today / Hot Inquiry / Viewing Notes / Done |
| `recruiting` | Urgent / Today / Interview Prep / Reference / Done |
| `generic` | Urgent / Today / In Progress / Done / Idea |

Colors remain as visual cues. **Names become status-shaped, not color-shaped.**

---

## §4 Phase 3A — Workspace Polish & Industry Coverage

**Goal: a brand-new signup looks like a working CRM in 30 seconds.**
**Estimated effort: ~1.5 weeks.**

| # | Task | File(s) | Effort |
|---|---|---|---|
| 1 | Extend `IndustryTemplate` type with `mockData?` slot | `convex/crm/fields/templates/types.ts` | 0.5 day |
| 2 | `seedMockEntities()` helper in the seeder | `convex/crm/fields/templates/mutations.ts` — idempotent (skips if any leads exist); all records tagged `source:"template_seed"` for bulk-delete | 1 day |
| 3 | Add mock data to all 4 target templates | `definitions/*.ts` | 0.5 day |
| 4 | Build `productivity.ts` | new `definitions/productivity.ts` | 0.5 day |
| 5 | Rebuild `freelancer.ts` as lean solo template | replace 60-line shim | 0.5 day |
| 6 | Add `real-estate-saudi.ts` | new file | 0.5 day |
| 7 | Rename template ids: `dubai-real-estate → real-estate-dubai`, `real-estate → real-estate-global` | rename files + migration `convex/_migrations/renameRealEstateTemplateIds.ts` that backfills existing `org.industry` strings | 0.5 day |
| 8 | Sub-niche picker UI | extend `OnboardingPage.tsx` Step 2 — when industry is `real-estate` or `b2b-saas`, show a second mini-screen before the Team Size row | 0.5 day |
| 9 | Standardise note categories across all templates | edit each `definitions/*.ts` noteCategories array | 0.5 day |
| 10 | Honor `entityVisibility` in sidebar | `core/shell/shell/components/AppSidebar.tsx` — read `org.settings.entityVisibility`; hide hidden slots | 0.5 day |
| 11 | Backfill semantic note categories for existing orgs | `convex/_migrations/replaceColorNoteCategories.ts` | 0.5 day |
| 12 | Settings → "Switch template" UI | `core/platform/settings/components/groups/workspace/TemplateSwitcher.tsx` (new) — calls existing `orgs.applyTemplate` | 1 day |

**Gate test:** brand-new signup picks "Productivity" → lands on dashboard with 4 mock tasks, 2 mock notes, 1 mock reminder. No Companies tab. No Leads tab.

---

## §5 Phase 3B — AI Assistant

**Gate: "Stop navigating your CRM. Just talk to it."**
**Estimated effort: ~2.5 weeks.**

### Architecture decision (locked)

AI tools are **thin RBAC-aware wrappers over existing mutations**. No tool reaches into `ctx.db` directly. Every tool calls `ctx.runMutation(internal.X.Y, args)` against a production-ready mutation that already follows the canonical 7-step pattern. The hard work is done. Phase 3B is glue.

### Files to build

| File | Role |
|---|---|
| `convex/ai/systemPrompt.ts` | 3-layer builder: (1) platform rules, (2) org context (labels + pipeline stages + custom fields + team members), (3) route context (current page entity) |
| `convex/ai/toolRegistry.ts` | role → allowed-tools map; `TOOL_PERMISSIONS` lookup |
| `convex/ai/tools/search_crm.ts` | wraps `crm.people.queries.searchByCode` + entity list queries |
| `convex/ai/tools/create_entity.ts` | wraps `leads.create`, `contacts.create`, `deals.create` — dispatches by `entityType` arg |
| `convex/ai/tools/update_entity.ts` | wraps entity `update` mutations |
| `convex/ai/tools/move_deal_stage.ts` | wraps `deals.moveToStage`; args: `dealCode` + `stageCode` |
| `convex/ai/tools/create_followup.ts` | wraps `reminders.createFollowup` (**already production-ready**) |
| `convex/ai/tools/create_reminder.ts` | wraps `reminders.create` (**already production-ready**) |
| `convex/ai/tools/add_note.ts` | wraps `notes.create` |
| `convex/ai/tools/get_entity_detail.ts` | wraps detail queries + timeline |
| `convex/ai/tools/get_summary.ts` | wraps dashboard metric queries |
| `convex/ai/tools/bulk_update.ts` | wraps entity patch mutations; **requires confirmation gate** |
| `convex/ai/tools/workspace_setup.ts` | wraps `orgs.applyTemplate` |
| `convex/ai/internal.ts` (fill body) | scan activityLogs + notes + reminders for entity → LLM summarise → write `aiContext` on entity doc |
| `app/api/ai/chat/route.ts` | streaming proxy; billing check before Claude call |
| `core/ai/components/ChatSheet.tsx` | right-side resizable panel |
| `core/ai/components/ChatMessage.tsx` | message bubble (markdown-rendered) |
| `core/ai/components/ChatToolCall.tsx` | tool-result cards (mini-table / entity card) |
| `core/ai/components/ChatConfirmation.tsx` | inline [Confirm] / [Cancel] for destructive tools |
| `core/ai/hooks/useAIChat.ts` | `useChat()` wrapper |
| `core/ai/hooks/useRouteContext.ts` | reads `usePathname()` → parses personCode / dealCode → feeds layer 3 of system prompt |

### Security model (4 layers — locked)

1. **Auth from session** — identity verified before any action.
2. **Tool filtering** — only role-permitted tools exposed to the model. If `member.permissions` doesn't include `leads.create`, the model never sees `create_entity`.
3. **Org-scoped data** — every query/mutation scoped to caller's orgId from `ctx`.
4. **Confirmation gates** — destructive tools (`bulk_update`, `workspace_setup`, `update_entity` on sensitive fields) emit a ChatConfirmation card before execution. User must click [Confirm].

### Model routing

| Task complexity | Model |
|---|---|
| Search / lookup | Claude Haiku (cost) |
| Create / update / move | Claude Sonnet |
| Analytics / briefing / workspace setup | Claude Sonnet |

### Phase 3B checklist

```
[ ] convex/ai/systemPrompt.ts
[ ] convex/ai/toolRegistry.ts
[ ] convex/ai/tools/ — all 11 tools
[ ] convex/ai/internal.ts — rebuildEntityContext body filled
[ ] app/api/ai/chat/route.ts
[ ] core/ai/components/ — ChatSheet, ChatMessage, ChatToolCall, ChatConfirmation
[ ] core/ai/hooks/useAIChat.ts + useRouteContext.ts
[ ] pnpm typecheck → 0 errors
[ ] pnpm test → 160+ passing
[ ] "Show me my top deals" → deal cards in AI panel
[ ] "Create a lead for Sarah at Acme" → lead created with personCode
[ ] Viewer role: read-only tools only — no destructive actions in model context
[ ] First token < 2 seconds streaming latency
```

---

## §6 Phase 3C — WhatsApp / Voice

**Gate: gated by Phase 3B (AI runtime must exist first).**
**Estimated effort: ~1 week.**

| # | Task | File |
|---|---|---|
| 1 | 360dialog webhook | `app/api/channels/whatsapp/route.ts` |
| 2 | Whisper → Claude → `fieldValues.bulkSet` | `trigger/whatsapp/voiceProcessor.ts` |
| 3 | Channel registration + 360dialog API key in Settings → Integrations | settings UI |
| 4 | Gulf-market optimisation: WhatsApp over email for follow-up notifications | `notifications/helpers.ts` — add `channel: "whatsapp"` path |

---

## §7 Avoidlist + Phase-3 Entry Checklist

### Avoidlist — DO NOT do these in Phase 3

```
❌ Don't add new top-level DB entities (products, invoices, properties table) —
   those are Phase 4 catalog/documents per §11 below
❌ Don't create new seed paths outside setupWorkspaceFromTemplate —
   the 17-surface seeder is the one entry point; mock data is surface #18
❌ Don't put AI tools in the frontend — tools are backend internalActions only
❌ Don't bypass the canonical 7-step mutation pattern from AI tools —
   every tool calls ctx.runMutation(), never ctx.db directly
❌ Don't add per-tool permission strings — tool authorization = role.permissions
   (the existing catalog). If a user can't do X manually, the AI can't either
❌ Don't store API keys (Anthropic, 360dialog, Whisper) anywhere except Convex env vars
❌ Don't break Phase 2 nav — entity visibility changes must read entityVisibility,
   never hardcode per-industry slug or entity type checks
❌ Don't ship AI without confirmation gates on bulk_update, workspace_setup,
   and any delete tool — show ChatConfirmation card, wait for [Confirm]
❌ Don't seed mock data into orgs that already have records —
   seedMockEntities() must gate on "no leads/deals exist yet"
❌ Don't auto-close the FillMissingFieldsDialog — it must stay open until
   the user fills fields or explicitly cancels
```

### Phase-3 entry checklist (sign-off required before coding starts)

```
[ ] Doc cleanup complete (this file written, stale files deleted)
[ ] 4-industry shape approved (§3 above)
[ ] Mock-data seeding approach approved (deletable records, source:"template_seed")
[ ] Sub-niche picker UX approved (Step 2b for real-estate + b2b-saas)
[ ] Note-category standardisation approved (Urgent/Today/.../Done)
[ ] entityVisibility wiring approved (sidebar hides hidden slots)
[ ] Anthropic API key set in Convex env vars
[ ] 360dialog account created (or placeholder for Phase 3C)
[ ] convex/ai/MODULE.md updated with STUB status header
[ ] pnpm typecheck → 0 errors + pnpm build → all routes green before starting 3B
```

---

## §8 Feature-Flag Layering

Three distinct layers — do not conflate them:

| Layer | Source | Drives | Phase |
|---|---|---|---|
| Industry-shape flags | `org.settings.entityVisibility` + `org.settings.modules[]` (set by template seeder) | Sidebar items, route guards, dashboard widgets, AI tool exposure | Phase 3A |
| Plan-tier limits | `convex/_platform/limits.ts` (eventually `platformTiers` DB table) | Hard gates: max pipelines, AI token quota, member count | Already wired |
| Kill-switch flags | `featureFlags` table — org-level boolean overrides | Emergency disable / canary rollout | Already wired |

**Phase 3A wires layer 1.** Sidebar (`AppSidebar.tsx`) reads `org.settings.entityVisibility` and hides hidden slots. Nothing else changes.

---

## §9 Production-Readiness Gap List

Items required before public launch, ordered by priority:

| # | Item | Effort | Priority |
|---|---|---|---|
| 1 | Mock data seeded on signup | 1 day | P0 |
| 2 | AI assistant end-to-end | 2.5 weeks | P0 |
| 3 | Email send (Resend + invitation + password-reset templates) | 1.5 days | P0 |
| 4 | Soft-delete recovery + Trash UI | 1 day | P0 |
| 5 | GDPR data export + cascade delete | 2 days | P0 |
| 6 | Stripe / LemonSqueezy webhook + checkout + plan gating | 3 days | P0 |
| 7 | Security headers in `next.config.ts` (CSP, HSTS, X-Frame-Options) | 0.5 day | P0 |
| 8 | `activityLogs` archive cron (rows > 90 days) | 0.5 day | P1 |
| 9 | Bulk-update mutations + UI | 3 days | P1 |
| 10 | Cmd+K typeahead using schema `searchIndex` | 2 days | P1 |
| 11 | CSV import (Trigger.dev background job + field mapping) | 3 days | Phase 4+ |

---

## §10 Doc-Cleanup Record

### Deleted (2026-05-22)

| File | Reason |
|---|---|
| `DEALS-REFACTOR-PLAN-2026-05-20.md` | Work shipped 2026-05-20; content folded into `PHASE-2-PROGRESS.md` |
| `CODE-ARCHITECTURE-PIPELINES-2026-05-20.md` | Work shipped; architecture locked in `convex/crm/fields/pipelines/STATE.md` |
| `core/entities/ENTITY_SCAFFOLDS_PLAN.md` | Scaffolds shipped; content folded into `core/entities/MODULE.md` |
| `core/entities/ENTITY_SCAFFOLDS_ARCHITECTURE.md` | Same |
| `core/entities/INDUSTRY_ADAPTABILITY_ANALYSIS.md` | Content folded into §11 of this file |
| `core/comms/messages/IMPLEMENTATION.md` | Implementation shipped; content folded into `core/comms/messages/MODULE.md` |

### Replaced / redirected

| File | New state |
|---|---|
| `PHASE-3-NEXT.md` | Now a one-line redirect to this file (kept for AGENT.md backwards compat) |

### Updated

| File | Change |
|---|---|
| `PHASE-2-PROGRESS.md` | Trimmed to locked-decisions-only; build log removed |
| `.github/agents/base/context.md` | Phase 3 status added |
| `.github/agents/base/todos.md` | Phase 3A/3B/3C task list |
| `.github/agents/base/checklist.md` | Phase 3 gate checklist |
| `features/industry-templates/MODULE.md` | Status updated to SHIPPED |
| `convex/ai/MODULE.md` | STUB status header added |
| `core/shell/onboarding/STATE.md` | Pipeline seeding note updated |

### Keep as-is (load-bearing)

```
AGENTS.md                          — global rules SSOT
.github/agents/base/AGENT.md      — session contract
.github/agents/base/context.md    — current build state
.github/agents/base/todos.md      — active task list
.github/agents/base/checklist.md  — phase checklists
.github/agents/base/rules.md      — non-negotiable coding rules
.github/agents/base/schema.md     — Convex table SSOT
.github/agents/base/deep-plan.md  — read-only spec (do not update)
.github/agents/base/folder-structure.md
.github/agents/base/tech-stack.md
convex/_arch.md                   — backend logical map
docs/architecture/*               — reference architecture (16 docs)
All module STATE.md files         — updated each session
```

---

## §11 Long-term Industry Coverage (Gaps 1–3)

After Phase 3 ships, these three feature modules unlock 12/16 major verticals. Schema placeholders already exist in `features/`. Build when volume warrants.

### Gap 1 — Products / Services Catalog (`features/catalog/`)

```typescript
catalogItems:  { orgId, code, name, description, unit, unitPrice, currencyCode, category, isActive }
dealLineItems: { orgId, dealId, itemId, quantity, unitPriceOverride, discountPct, notes }
```

Unlocks: agency, freelance (proper invoicing), construction, manufacturing, field service.

### Gap 2 — Documents / Contracts / Proposals / Invoices (`features/documents/`)

```typescript
documents: {
  orgId, docCode,
  type: "proposal" | "contract" | "invoice" | "quote" | "form",
  status, personCode, dealCode,
  title, body, variables,
  subtotal, taxRate, total, currencyCode, lineItems,
  signatureStatus, signatories, sentAt, viewedAt, acceptedAt, paidAt,
  publicToken
}
```

Unlocks: serious freelance (HoneyBook/Dubsado-equivalent), agency, legal, photography, events.

### Gap 3 — Workflow / Automation Builder (`features/workflows/`)

```typescript
workflows: {
  orgId, name, isActive,
  trigger: { event, filters },
  actions: [{ kind: "email.send"|"reminder.create"|"note.add"|"field.update"|"tag.add"|"notification.send"|"wait", args }]
}
```

Reuses AI tool-registry as action kinds. Unlocks every industry's "if X then Y" rules.

### Industry matrix (after all 3 gaps)

| Industry | This build | + Gap 1 | + Gap 2 | + Gap 3 |
|---|---|---|---|---|
| Dubai / Gulf RE | ✅ | — | better | better |
| Saudi RE | ✅ (Phase 3A) | — | better | better |
| B2B SaaS / startups | ✅ | better | better | better |
| Coaching / consulting | ✅ | much better | much better | better |
| Insurance | ✅ | — | better | much better |
| Recruitment | ✅ | — | much better | better |
| Non-profit / donor | ✅ | — | better | better |
| Basic freelance | ✅ (Phase 3A) | much better | **required** | better |
| Agency / design | ✅ | better | **required** | better |
| Legal (entity5=Matter) | 🟡 | — | **required** | better |
| Construction | ❌ | **required** | **required** | better |
| Manufacturing | ❌ | **required** | better | better |
| Field service | ❌ | **required** | better | needs scheduling |
| Photography / events | 🟡 | better | **required** | better |
| Healthcare | ❌ | — | — | out of scope (HIPAA) |
| E-commerce | ❌ | — | — | wrong paradigm |

**After all 3 gaps → 12 / 16 verticals credibly served.**

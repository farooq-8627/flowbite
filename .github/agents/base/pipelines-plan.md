# Pipelines — Single Source of Truth (SSOT) Plan

> **Purpose**: explain — in one place — how pipelines work in this product, what's already built, what's pending, and how the human / AI / data model agree on a single language.
>
> **Audience**: future me, future contributors, the AI assistant. Read this BEFORE building any pipeline-touching feature, and BEFORE asking the user a pipeline question that's already answered here.
>
> **Status legend**: ✅ shipped · 🟡 partial · ⬜ pending · 🔒 locked-decision
>
> **Last updated**: 2026-05-19

---

## 0. The 60-second pitch

A **pipeline** is an ordered set of named **stages** that a deal moves through.
That's it. Everything else in this doc is just rigour around that one idea.

| Concept | One-liner | Where it lives |
|---|---|---|
| Pipeline | A named sequence of stages, scoped to ONE entity type | `pipelines` table |
| Stage | One column on a kanban board with a stable `id`, `name`, `code`, `color`, optional `isFinal`, optional `staleAfterDays` | `pipelines.stages[]` |
| Deal | A row that holds `pipelineId` + `currentStageId` | `deals` table |
| Person (lead/contact) | NOT in a pipeline directly. They become "in a pipeline" because they're attached to a deal that is. | `leads` + `contacts` tables |
| Lead status | A small fixed lifecycle (new → contacted → qualified → converted → lost) — NOT a pipeline | `leads.status` field |

> **Locked**: 🔒 Pipelines apply to **deals only**. Leads use a simple status field. Contacts have no pipeline. See §10 for the rationale.

---

## 1. Why pipelines are different from "lead status"

Every CRM ever has confused these two ideas. Here's the rule we follow:

| | Lead status | Pipeline (deals) |
|---|---|---|
| Number of slots | Tiny + fixed (~5) | Open-ended, configurable |
| Owner | Built into product | Owner / admin per org |
| Stable across orgs? | Yes — `new`/`contacted`/`qualified`/`converted`/`lost` | No — every org tunes its own |
| Renamable? | Label only (via `useEntityLabels`) | Fully — the stage `name` is just a label |
| Multiple? | One status field | Multiple pipelines per org |
| Industry-aware? | Same shape everywhere | Industry-specific stage sets |
| AI tool that writes it | `update_lead_status` (future) | `move_deal_stage` (future) |

In short: **lead status is part of the product. Pipelines are part of the workspace.**

---

## 2. Schema (already in `convex/schema/pipelines.ts`) — ✅ IMPLEMENTED

```ts
pipelines: defineTable({
  orgId: v.id("orgs"),
  name: v.string(),                  // "Real Estate Sales", "Enterprise SaaS"
  entityType: v.string(),            // ALWAYS "deal" today (Phase 1)
  isDefault: v.boolean(),            // exactly ONE per (orgId, entityType)
  stages: v.array(v.object({
    id: v.string(),                  // nanoid: "stage_x7kQ9mPw2nLr" — stable forever
    name: v.string(),                // "Offer / MOU"
    order: v.number(),               // 0-based
    color: v.optional(v.string()),   // hex — column dot + card border
    isFinal: v.optional(v.boolean()),// true → terminal (won/lost/cancelled)
    finalType: v.optional(v.union(
      v.literal("positive"),
      v.literal("negative"),
      v.literal("neutral"),
    )),
    staleAfterDays: v.optional(v.number()),
  })),
  createdAt: v.number(),
  updatedAt: v.number(),
})
.index("by_org", ["orgId"])
.index("by_org_and_entity", ["orgId", "entityType"])
.index("by_org_and_entity_and_default", ["orgId", "entityType", "isDefault"])
```

### Stage IDs — the single most important rule 🔒

Stage `id` is the stable identifier. Stages are referenced by `id` from
deal records (`deals.currentStageId`). The `id` NEVER changes once issued.
Stage **names** can be renamed freely; columns reflow live without
breaking deal references.

### Deal-side schema — ✅ already wired

```ts
deals: defineTable({
  orgId: v.id("orgs"),
  pipelineId: v.id("pipelines"),       // which pipeline
  currentStageId: v.string(),          // which stage in that pipeline
  stageEnteredAt: v.optional(v.number()), // for staleness
  // …
})
.index("by_org_and_pipeline", ["orgId", "pipelineId"])
.index("by_org_and_stage", ["orgId", "currentStageId"])
```

---

## 3. Stage **codes** — the "remove ambiguity" feature ⬜ PENDING

> The user explicitly asked: "keeping a code for pipeline also solves
> the ambiguity among the AI and the humans to work on so can you please
> complete all tasks". Yes — this is the one piece missing from the
> existing schema. Adding it now.

### What a stage code is

Each stage gets a short, human-readable, **org-unique** code that names it
unambiguously across:

- the kanban column header
- the URL hash (`/deals?stage=NEG`)
- AI tool calls ("move D-001 to stage NEG")
- WhatsApp voice notes ("nudge stage NEG deals")
- saved views and filters
- activity log entries (`"deal_stage_changed: PROP → NEG"`)

The code is what humans type and what the AI emits. The internal `id`
(`stage_x7kQ9mPw2nLr`) stays as the immutable foreign key — codes can be
renamed; ids can never.

### Schema change required (migrate IN THE SAME MESSAGE per AGENTS.md rule)

```ts
// pipelines.stages[]
stages: v.array(v.object({
  id: v.string(),
  name: v.string(),
  code: v.string(),                  // NEW — short uppercase string, e.g. "NEG"
  // …
}))

// uniqueness: code is unique within (pipelineId)
// validation:
//   - 2-8 chars
//   - [A-Z0-9_]+
//   - reserved: WON, LOST, NEW (we auto-assign; user can override)
```

### Migration plan ⬜

1. Add `code` to the stage validator as **required** going forward.
2. Run an internal mutation `convex/_migrations/2026-XX-XX-stage-codes.ts`:
   - For every existing pipeline, derive a code per stage:
     - Start with the first 3 uppercase letters of `name` (alphanumerics only)
     - If that collides with an existing code in the same pipeline, suffix `2`, `3`, …
     - Special-case `isFinal=true && finalType=positive` → `WON` (if free)
     - Special-case `isFinal=true && finalType=negative` → `LOST` (if free)
3. Backfill is idempotent — skips stages that already have a code.
4. Bump the schema validator. Existing rows now match.

### AI / human disambiguation example

Before stage codes:

```
User (WhatsApp voice): "Move the Acme deal to negotiation"
AI: which "negotiation"? You have two pipelines with that stage name.
```

After stage codes:

```
User: "Move D-001 to NEG"
AI: D-001 already in NEG (pipeline: Enterprise SaaS).
```

When the user types a stage name in plain English, the AI fuzzy-matches
against `name` — and if multiple match, picks based on the deal's current
`pipelineId` (a deal can only be in stages of its own pipeline, so the
ambiguity collapses).

---

## 4. Multi-pipeline per org 🟡 PARTIAL — schema yes, UX no

The schema supports any number of pipelines per (orgId, entityType). The
backend `pipelines.create` mutation already enforces "exactly one default
per (orgId, entityType)" — see `convex/crm/fields/pipelines/mutations.ts`.

What's still missing on the UX side:

| Item | Status | Where |
|---|---|---|
| Settings page to list / create / edit pipelines | ✅ shipped | `/settings?group=crm` → "Pipelines" panel |
| Stage drag-to-reorder UI | ✅ shipped | Same settings page |
| Toggle a pipeline's `isDefault` flag | ✅ shipped | Same settings page |
| Switching a deal's pipeline (move to another pipeline entirely) | ⬜ pending | Deal detail action menu — needs "Change pipeline…" option |
| Pipeline picker on the deal create form | 🟡 partial — server picks default, UI doesn't expose | `core/entities/_entities/deals/components/AddDealDrawer.tsx` |
| Pipeline filter chip on deals board | ⬜ pending | `DealsView` board toolbar |
| Pipeline tabs on deals board (one tab per pipeline) | ⬜ pending — design decision needed (tabs vs filter chip) |

### Recommended UX for "deal create" pipeline picker — ⬜ PENDING

```
┌─ New Deal ─────────────────────────────────────┐
│ Title:    [_____________________]              │
│ Person:   [P-001 — Sarah Lee     ▾]           │
│ Pipeline: [● Enterprise SaaS    ▾] ← shows    │
│           default; user can change             │
│ Stage:    [Discovery            ▾] ← reflows   │
│           when pipeline changes                │
│ Value:    [_______]   AED                      │
└────────────────────────────────────────────────┘
```

- The pipeline dropdown is populated from `api.crm.fields.pipelines.queries.listByOrg`.
- The default value is the row with `isDefault === true`.
- When the user changes the pipeline, the stage dropdown re-reads from
  `pipeline.stages` and resets to the first non-final stage.
- The deal form's `currentStageId` is always validated against the chosen
  pipeline's stages (server side, in `deals.create`).

---

## 5. Person → pipeline assignment ⬜ PENDING (semantics + UX)

> The user asked: "how to assign the pipeline to a contact please".

Here is the locked answer: **a person is never directly assigned to a pipeline.**
A person becomes part of a pipeline by virtue of having a deal that is.

| Question | Answer |
|---|---|
| Can a contact be "in" a pipeline without a deal? | No. The pipeline lives on the deal. |
| Can one contact have deals in different pipelines simultaneously? | Yes. They might have an "Enterprise SaaS / Negotiation" deal AND a "Renewals / Pending" deal at the same time. |
| Where do I see all of a person's deals (and which pipeline each is in)? | Profile page → Deals tab. Each row shows pipeline + stage + value. |
| What does "convert lead" do to pipelines? | Nothing automatic. Conversion creates a contact. The user creates a deal as a separate action and picks the pipeline at that point. |

### UX — "Add deal" shortcut on profile page

Profile → Deals tab → "+ Add deal" button → opens the same Add Deal drawer
described in §4, **pre-binding** the personCode. This is the ONLY way a
person enters a pipeline: through a deal.

---

## 6. Industry templates — config-driven seed bundles 🔒 LOCKED + 🟡 PARTIAL

The deep-plan locked the doctrine: a pipeline is one piece of a broader
**industry template** that also seeds default `fieldDefinitions`, entity
labels, dashboard metrics, AI persona.

### How seeding works today

`convex/crm/fields/pipelines/helpers.ts::seedFromTemplate` accepts a
template name and inserts a pipeline with stages.

Currently shipped templates:

| Template | Stages | Status |
|---|---|---|
| `real-estate` | New · Viewing Scheduled · Offer / MOU · Documentation · Ejari · Handover · Won · Lost | ✅ shipped (seed only) |
| `saas` | Discovery · Demo Scheduled · Proposal Sent · Negotiation · Closed Won · Closed Lost | ✅ shipped (seed only) |
| `generic` | New · In Progress · Won · Lost | ✅ shipped, default fallback |

### What an industry template needs to include — ⬜ STILL TODO

A template is more than a stage list. The full bundle should be:

```ts
{
  templateId: "real-estate",
  pipeline: { name, stages: [...] },
  fieldDefinitions: {
    deal:    [{ name: "property_type", type: "select", options: [...] }, …],
    contact: [{ name: "preferred_area", type: "text" }, …],
    lead:    [{ name: "budget_aed",    type: "number" }, …],
  },
  entityLabels: {
    lead:    { singular: "Inquiry",  plural: "Inquiries" },
    contact: { singular: "Client",   plural: "Clients" },
    deal:    { singular: "Listing",  plural: "Listings" },
    company: { singular: "Agency",   plural: "Agencies" },
  },
  dashboardMetrics: ["pipelineValueAED", "stagedealsByStage", …],
  aiPersona: "You are a Dubai real estate sales coach…",
}
```

### Pending work for industry templates

| Item | Priority | File |
|---|---|---|
| Move template registry from inline `helpers.ts` switch to `convex/crm/fields/templates/registry.ts` | MEDIUM | new |
| Each template seeds `fieldDefinitions` for lead/contact/deal | HIGH | per-template |
| Each template seeds `entityLabels` into `orgs.settings.entityLabels` | HIGH | per-template |
| Onboarding wizard step 2 reads the registry instead of hardcoding industry list | HIGH | `core/onboarding/` |
| AI tool `setup_workspace_from_template(templateId)` calls all of the above | HIGH (Phase 3) | `convex/ai/tools/` |
| Three template definitions filled in: B2B-SaaS, Freelancer, Real-estate | HIGH | per-template |

---

## 7. Dynamic fields ↔ pipelines: stage-aware fields 🔒 LOCKED + ✅ IMPLEMENTED

A field can be **stage-aware**: it only appears on the form when the deal
is in a specific stage (or set of stages).

```ts
// fieldDefinitions row example
{
  entityType: "deal",
  name: "ejari_number",
  label: "Ejari Number",
  type: "text",
  showInStages: ["stage_ejari_xxxxx"],   // appears only in Ejari stage
}
```

Already wired:

- `useEntityFields("deal", orgId, { currentStageId })` filters `formFields` by `showInStages`.
- The Convex query `fieldDefinitions.queries.listByEntity` returns ALL fields; client filters by current stage.
- Settings → Fields → Deal lets admins pick which stages each field shows in.

### Where stage-aware fields surface

| Surface | Filtered by current stage? |
|---|---|
| Deal create form | NO — the deal isn't in a stage yet |
| Deal edit form | YES — only fields valid for the current stage |
| Deal kanban card | NO — cards show pinned summary fields only |
| Deal detail "Custom Fields" tab | YES — but with a "show all stages" toggle |

---

## 8. Pipeline staleness — per-stage, color-driven 🔒 LOCKED + ✅ SHIPPED

Each stage carries `staleAfterDays`. When `Date.now() - deal.stageEnteredAt > staleAfterDays * 86_400_000`, the kanban card grows a red left border.

The threshold is **per-stage**, not per-pipeline. Different stages need
different patience: a 2-day "Discovery → Demo" SLA is fine, but a "Pending
docs from buyer's lawyer" stage might be stale only after 30 days.

Visual contract:

| State | Border color |
|---|---|
| Fresh (entered < `warningAfterDays`) | none |
| Warning (entered ≥ `warningAfterDays`) | amber |
| Stale (entered ≥ `staleAfterDays`) | red |

Where it's wired:

- `core/entities/_entities/deals/views/DealDetailView.tsx` reads stage staleness from the pipeline doc.
- `EntityCard` border-color logic in `useStalenessBorder` (`shared/components/EntityCard.tsx`).
- Org-level fallback: `orgs.settings.leadStaleAfterDays` for leads, `orgs.settings.reminderDefaults.staleAlertDays` for warning threshold.

---

## 9. The complete pipeline lifecycle (end-to-end)

Here is the full flow a person + their deals walk through:

```
┌──────────────────────────────────────────────────────────────────┐
│ 1. LEAD CREATED                                                  │
│    leads.create() → personCode P-001 generated                   │
│    leads.status = "new"                                          │
│    NOT in any pipeline yet                                       │
└──────────────────────────────────────────────────────────────────┘
                                ↓
┌──────────────────────────────────────────────────────────────────┐
│ 2. LEAD QUALIFIED                                                │
│    leads.update(status: "qualified")                             │
│    Still NOT in a pipeline                                       │
└──────────────────────────────────────────────────────────────────┘
                                ↓
┌──────────────────────────────────────────────────────────────────┐
│ 3. CONVERTED TO CONTACT                                          │
│    convertToContact(leadId)                                      │
│    contact created with SAME personCode (P-001)                  │
│    leads.status = "converted"                                    │
│    Still NOT in a pipeline                                       │
└──────────────────────────────────────────────────────────────────┘
                                ↓
┌──────────────────────────────────────────────────────────────────┐
│ 4. DEAL CREATED                                                  │
│    deals.create({                                                │
│      personCode: "P-001",                                        │
│      pipelineId: <chosen by user>,                               │
│      currentStageId: <first non-final stage of pipeline>,        │
│    })                                                            │
│    NOW the person is "in" a pipeline (via this deal)             │
└──────────────────────────────────────────────────────────────────┘
                                ↓
┌──────────────────────────────────────────────────────────────────┐
│ 5. DEAL MOVED THROUGH STAGES                                     │
│    deals.moveToStage(toStageId)                                  │
│    activityLog.action = "deal_stage_changed"                     │
│    metadata = { fromStageId, toStageId, fromCode, toCode }       │
│    Reminders auto-suggested by AI (Phase 3)                      │
└──────────────────────────────────────────────────────────────────┘
                                ↓
┌──────────────────────────────────────────────────────────────────┐
│ 6. DEAL CLOSED                                                   │
│    deals.moveToStage(stage with isFinal=true)                    │
│    if finalType==="positive" → confetti, log won, set wonAt      │
│    if finalType==="negative" → log lost, set lostAt + lostReason │
│    The person stays linked but their deal is now closed          │
│    Other open deals on the same person are unaffected            │
└──────────────────────────────────────────────────────────────────┘
```

---

## 10. Why pipelines are deals-only (locked decision) 🔒

We considered "let everything have a pipeline" and rejected it. Reasons:

| Entity | Why no pipeline |
|---|---|
| **Lead** | Lead lifecycle is small + universal. Five states cover every CRM. Adding a pipeline-per-lead-source would just multiply complexity for no real-world benefit. |
| **Contact** | A contact isn't a "thing in motion" — it's a relationship. Pipelines model motion. Use deals to track motion. |
| **Company** | Same as contact. Company is a relationship; deals against it are the motion. |
| **Project** (Phase 8) | DOES get a pipeline. Schema already supports it (`projects.pipelineId`, `projects.currentStageId`). UI defers to Phase 8. |
| **Task** (Phase 8) | Light pipeline (Todo / Doing / Done / Blocked). Schema supports. UI defers. |

The lockdown gives us one mental model: pipelines move things forward, lifecycle fields tag things in place.

---

## 11. AI ↔ pipelines (Phase 3 — ⬜ PENDING)

| AI tool | Calls | Disambiguation |
|---|---|---|
| `move_deal_stage` | `deals.moveToStage` | Args: `dealCode` + `stageCode`. The model gets `pipeline.stages[].code` in the system prompt so it can pick deterministically. |
| `create_deal` | `deals.create` | Args include `pipelineId` (resolved from `pipelineCode` if provided, otherwise default). |
| `add_pipeline_stage` | `pipelines.addStage` (admin only) | Args: `pipelineId` + `name` + optional `code`. If user says "add a Cancelled column" the AI calls this. |
| `setup_workspace_from_template` | `pipelines.create` + seed `fieldDefinitions` + entity labels | Onboarding mass-set. |

System-prompt expansion for the AI to understand the org's pipelines:

```
You are working in {orgName}. The active pipelines are:

  Enterprise SaaS (id: <pipelineId>) — DEFAULT for deals
    DISC  Discovery        (3d)
    DEMO  Demo Scheduled   (5d)
    PROP  Proposal Sent    (7d)
    NEG   Negotiation      (10d)
    WON   Closed Won       (final, positive)
    LOST  Closed Lost      (final, negative)

  Renewals (id: <pipelineId>)
    UPCO  Upcoming Renewal (60d)
    REN   Renewing         (14d)
    LOST  Lost Renewal     (final, negative)

When the user says "move D-001 to negotiation":
  → resolve "negotiation" against deal D-001's pipeline
  → if multiple pipelines share that stage name, prefer the deal's pipeline
  → call move_deal_stage(dealCode: "D-001", stageCode: "NEG")
```

This is what makes the AI unambiguous. Without stage codes the model has
to do fuzzy string matching against names; with codes it's deterministic.

---

## 12. Outstanding questions / decisions still open

These are the items I'd like the user to confirm before we ship Phase B
of pipelines:

1. **Stage code format** — uppercase `[A-Z0-9_]{2,8}` is my recommendation. Confirm or pick a different shape (e.g. allow lowercase, longer codes, kebab-case).
2. **WON / LOST reservation** — reserve `WON` and `LOST` as automatically-assigned codes for any final stage (positive / negative respectively), or let users choose freely?
3. **Pipeline switching** — when a deal moves from pipeline A to pipeline B, do we keep its history (activity log entries reference the old `currentStageId` which may not exist in B)? Recommendation: keep history, log a `deal_pipeline_changed` activity, and reset `currentStageId` to B's first non-final stage.
4. **Default stage for new deals** — first non-final stage by `order` (current behaviour) or let admin pin a "starting stage" per pipeline? Recommendation: keep current behaviour; add explicit `isStarting` only if a paying customer asks.
5. **Pipeline filter UX on the board** — chips above the kanban (filter mode) or top-level tabs (one tab per pipeline). Recommendation: tabs — clearer and matches Pipedrive / HubSpot.
6. **Multi-pipeline per entityType limit** — Free 1, Starter 3, Pro/Enterprise unlimited (per the deep-plan). Confirm.
7. **Stage-aware fields on lead status** — do we want any equivalent of `showInStages` on lead-status changes (e.g. "Lead source" only required at status=qualified)? Probably overkill; flag as a future ask.

---

## 13. Build order — what to ship next

Once the user confirms the open questions in §12:

```
[A] Stage codes (Phase B-1)
    [ ] Schema: add `code` to stage validator
    [ ] Migration: backfill codes for existing pipelines
    [ ] Settings UI: code field on stage editor (auto-suggest, validate)
    [ ] Activity log metadata: include fromCode + toCode on stage changes

[B] Pipeline picker on deal forms (Phase B-2)
    [ ] AddDealDrawer: dropdown for pipeline (default = isDefault row)
    [ ] On change → reload stage dropdown
    [ ] Server validation in deals.create: stageId must belong to chosen pipelineId

[C] Pipeline filter on deals board (Phase B-3)
    [ ] Decide: tabs or chip — locking on §12 #5
    [ ] DealsView: render the picker
    [ ] Persist active pipeline to localStorage like cardFields

[D] Industry templates: full registry (Phase B-4)
    [ ] convex/crm/fields/templates/registry.ts
    [ ] Three templates filled: B2B-SaaS, Freelancer, Real-estate
    [ ] Each seeds: pipeline + fieldDefinitions + entity labels
    [ ] Onboarding step 2 reads registry

[E] Pipeline switching for an existing deal (Phase B-5)
    [ ] Deal detail action: "Change pipeline…"
    [ ] Server mutation: deals.changePipeline(dealId, newPipelineId, newStageId)
    [ ] Activity log: deal_pipeline_changed

[F] Project pipelines (Phase 8)
    [ ] UI for projects to use the same pipelines table with entityType="project"
    [ ] Already supported by schema, just needs the views
```

---

## 14. Where to look in the code

| Area | File |
|---|---|
| Schema | `convex/schema/pipelines.ts` |
| Backend queries | `convex/crm/fields/pipelines/queries.ts` |
| Backend mutations | `convex/crm/fields/pipelines/mutations.ts` |
| Backend helpers (seed templates, validate transition) | `convex/crm/fields/pipelines/helpers.ts` |
| Backend module rules | `convex/crm/fields/pipelines/MODULE.md` |
| Settings UI for pipeline CRUD | `core/platform/settings/components/groups/crm/PipelinesSection.tsx` (and friends) |
| Stage-aware field hook | `core/entities/shared/hooks/useEntityFields.ts` |
| EntityCard staleness border | `core/entities/shared/components/EntityCard.tsx::useStalenessBorder` |
| Deal kanban that reads pipeline stages live | `core/entities/_entities/deals/views/DealDetailView.tsx` |

---

## 15. Glossary

| Term | Means |
|---|---|
| Pipeline | An ordered list of stages, scoped to one entityType inside one org |
| Stage | One column in the pipeline. Has `id`, `name`, `code`, `color`, `order`, `isFinal?`, `staleAfterDays?` |
| `id` (stage) | The immutable foreign key. `nanoid(12)` prefixed `stage_`. Never change. |
| `code` (stage) | Short uppercase human-typeable label. Org-pipeline-unique. **PENDING** — see §3. |
| `isDefault` (pipeline) | Used when a deal is created without an explicit pipelineId. One per (org, entityType). |
| `isFinal` (stage) | Closes the deal. `finalType` distinguishes won / lost / cancelled. |
| `staleAfterDays` (stage) | Card grows red border after this many days in this stage. |
| Lead status | Five-state lifecycle on the leads table — NOT a pipeline. |
| Industry template | A bundle of pipeline + fieldDefinitions + entity labels + AI persona, seeded by name. |

---

> **Reading this means** you understand the model well enough to ship pipeline features without reverse-engineering anything. If something here is wrong, fix this file FIRST, then the code. This is the SSOT.

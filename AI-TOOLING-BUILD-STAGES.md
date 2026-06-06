# AI Tooling Layer — Build Stages (self-contained prompts)

> **Companion to** `AI-TOOLING-LAYER-PLAN.md` (architecture/"why"). This doc is
> the **executable plan**. Each stage prompt in PART 3 is **self-contained** —
> you can clear the session and paste one prompt to run that stage start to
> finish. PART 1 is the concrete code structure every stage builds toward; PART
> 2 holds the locked decisions. **Prompt caching ships inside v2 (Stage 2), not
> deferred.** Status: S0–S17 ALL SHIPPED 2026-06-03 → 2026-06-05 (see
> `SHIPPED.md`). The plan is complete.

---

# PART 0 — Keep-list through S17 (do not delete)

> Read this BEFORE deleting anything under `convex/ai/`. The 60+ V2 files
> below MUST stay until the S17 cutover sweep — they are either active V2
> code, chat-infra bridges shared by every channel, or pre-staged for a
> pending stage's prompt. The legacy V1 chat path (toolRegistry, tools/**,
> resume, friendlyToolError, toolContextBinder, zodErrorFormatter,
> ChatConfirmation, preview/) was deleted side-by-side S3→S10 per AGENTS.md
> RULE 1.1 — none of those files exist anymore. The orphaned V1
> `orgSchemaContext` query and the dead `appendUserMessage` mutation were
> deleted in the post-S10 cleanup pass (2026-06-05). Beyond those, the
> only deletions left are stage-driven (each pending stage's prompt names
> what its port deletes).

## Active V2 layer (kept verbatim through S17)

| Path | Why it stays |
|---|---|
| `convex/ai/registry/**` (15 files + tests) | The S0–S9 capability layer. Every channel + capability declares against this. S11/S15 require it; S16 projects from it; S17 is the final cleanup pass. |
| `convex/ai/runtime/host.ts` + `coreTools.ts` (+ tests) | The single host every channel calls. S13/S14/S15/S16 reuse it verbatim. |
| `convex/ai/runtime/autonomous.ts` + `autonomousState.ts` (+ tests) | S11 autonomous engine. `autonomous.ts` is the Node entrypoint (`runAutonomousTurn` + `autonomousTurn`/`triggerAutonomousTurnForTest` actions); `autonomousState.ts` is the V8 sister carrying `internalQuery`/`internalMutation` (Convex forbids them in `"use node"` files) plus the pure helpers. S13 schedules `autonomousTurn` from the Twilio webhook; S15 reuses the same engine for Mode C. |
| `convex/ai/orchestrator/run.ts` | V2 chat entry-point. ~400 lines after S3. |
| `convex/ai/orchestrator/{quotaGate,modelResolver}.ts` | Plan/credit gate + BYOK fallback. Reused by S11 (autonomous gate) + S14/S15 (Twilio cost control). |
| `convex/ai/processChat.ts` | Re-export shim. The Convex public function path `api.ai.processChat:run` is anchored on this filename — `convex/ai/messages.ts` schedules processChat via `makeFunctionReference("ai/processChat:run")`. Cannot rename without breaking the in-flight scheduler refs. |
| `convex/ai/messages.ts` + `conversations.ts` + `titleGeneration.ts` | DB-streaming chat persistence layer (locked decision #1 in `core/ai/MODULE.md`). S11 autonomous turns use the same `aiMessages` table for the audit-feed precursor. |
| `convex/ai/{models,modelRegistry,availableModels,keys,keysActions,encryption,encryptionTypes}.ts` | BYOK + provider fallback. Every channel resolves models through this; S14 outbound + S15 WhatsApp Agent use the same resolver. |
| `convex/ai/internal.ts` (+ test) | `rebuildEntityContext` — called from canonical mutation step 7 (`rules.md §3.3`). Loaded by every CRM mutation, not the AI runtime — keep regardless of stage. |
| `convex/ai/aiEntityPatch.ts` | Code → row resolution + custom-field patch helpers used by V2 caps. Domain-agnostic. |
| `convex/ai/personaContext.ts` (+ test) | `aiPersonaContext` org/user memory. Read by the host at turn-start (PART 1 §1.7). |
| `convex/ai/_logAIActivityInternal.ts` | Activity-log writer used by every channel. |
| `convex/ai/telemetry.ts` | `aiToolEvents` writer + token-sum reader. Read by `quotaGate`. S12 audit feed will likely re-use this writer (or supersede it). |
| `convex/ai/csvImports.ts` | Internal CRUD on `csvImports` rows — used by the S10-introduced quarantined CSV parser action. |
| `convex/ai/chatAttachments.ts` | File-attach helpers (`<ChatAttachButton>` + drag-attach use these). |
| `convex/ai/quarantined/**` (caps + 3 LLM action pairs) | H.13 caps shipped 2026-06-05 (parse_csv / analyze_file / enrich_record). Hardened "treat-as-data" prompts with Zod-validated outputs. |
| `convex/ai/{proactive,interaction,creative,analytics}/**` | H.13 caps. Registered via side-effect import in `runtime/host.ts`. |
| `convex/ai/insights/**` | Pure scoring + anomaly helpers + `explainDealScore` LLM action. Cron-driven via `convex/crons.ts`. Read by V2 dashboard caps (`score_deal`, `list_anomalies`, `explain_deal_score`). |
| `convex/ai/queries/{nextActions,nextActionsTrigger,widgets,telemetry,cohorts,cascadeImpact,pipelineVelocity,memberPerformance,insights,anomalies,toolTrace,coverageReport,tokenReport}.ts` (+ tests) | Read surfaces wired into V2 caps + dashboard widgets. `cascadeImpact` is wired into S10 hard-delete blast-radius preview. `toolTrace` powers `/{orgSlug}/ai/trace/<conversationId>` (audit UI). `coverageReport` + `tokenReport` are the S12 ops surfaces (registry inventory + per-turn token averages vs §2.2 band). |
| `convex/ai/standingOrders/**` | **Required by S11 autonomous engine.** S11's `autonomousTurn` reuses the standing-orders runner pattern (`runner.ts`, `triggers.ts`, `evaluator.ts`, `schedule.ts`, `mutations.ts`, `queries.ts`). Do NOT delete pre-S11. |
| `convex/ai/actions/**` | Creative + analytical LLM actions. Every file is wired into a V2 cap: `draftMessage`, `draftProposal`, `summariseConversation`, `webScrape`, `analyzeMetric`, `analyzeDealClose`, `rebuildCohorts`, `rankNextActions`. |
| `convex/ai/{briefings,briefingsActions,briefingsPublic}.ts` | Daily briefing pipeline (cron + on-demand). `briefingsActions.pickBriefingModel` is the BYOK→platform→env resolver reused by `insights/explainDealScore`. |
| `convex/ai/suggestions.ts` (+ test) | Heuristic proactive suggestions (no LLM call). Read by `<AISuggestionsPanel>`. |
| `convex/ai/{creativeHelpers,analyzeMetricHelpers,dealClose,webSearchAction}.ts` | Pure helpers consumed by their parent Node actions. |
| `convex/ai/MODULE.md` | Per-module architecture — required by `rules.md §1.3`. |

## Pending-stage file map — what each remaining stage touches

| Stage | New files this stage adds | Files this stage deletes (legacy) | Files this stage REUSES (must already exist) |
|---|---|---|---|
| **S13 — Twilio inbound** | `convex/ai/channels/whatsappInbound.ts`, schema additions for `agentChannels` table + indexes, route in `convex/http.ts` | none | `runtime/autonomous.ts` (S11), `messages.ts` (writes inbound rows), HMAC pattern from `convex/lemonsqueezy/webhook.ts` |
| **S14 — Outbound send (Mode A/B)** | ✅ SHIPPED 2026-06-05 — `convex/ai/channels/{whatsappTemplates,whatsappOutboundState,whatsappOutbound,capabilities,whatsappOutbound.test}.ts` | none | `runtime/host.ts`, `agentChannels` table (S13), `messages.sendForAI` |
| **S15 — WhatsApp Agent Profile (Mode C)** | ✅ SHIPPED 2026-06-05 — `convex/ai/channels/{persona,personaCapability,persona.test}.ts` + `convex/_shared/rateLimitMutation.ts`; `ai.whatsappAgent` permission added to catalog; Mode C dispatch wired in `whatsappInbound.ts`. | none | S11 + S13 + S14 surfaces, `registry/gate.ts` (allow-list enforcement) |
| **S16 — MCP + REST projectors** | `convex/ai/registry/projectors/{mcp,rest}.ts`, `convex/http.ts` MCP/REST endpoints | none | `registry/wrapper.ts` (single execution path), `registry/define.ts` (capability inventory) |
| **S17 — Cutover sweep** | none | Final verification: any straggler V1 file the per-stage cleanups missed (none expected — S3–S10 already deleted them all). Run `coverage.ts` report; refresh `convex/ai/MODULE.md` + `core/ai/MODULE.md`; full repo `pnpm typecheck` + biome + test + vitest + build. | every file above |

**Bottom line for the next agent:** under `convex/ai/` you can DELETE only what a pending stage's prompt explicitly names. Any other deletion is wrong.

---

# PART 1 — Concrete code architecture (the target)

Every stage builds toward this exact structure. Stage prompts reference these
sections by number.

## How this build is run (locked 2026-06-04)

Two AGENTS.md global rules govern every stage:

1. **Side-by-side cleanup** — every stage that ports a domain DELETES the
   legacy code for that domain in the same edit. No `AI_V2` flag carrying
   parallel implementations, no "we'll remove it at S17". S2's `AI_V2` flag
   was retired in S3 — V2 is the only chat path from S3 onward.
2. **Concise comments** — file headers ≤ 6 lines, no stage-history narration
   in source, gotchas only.

**Domains not yet ported are temporarily unreachable from chat.** After S3,
chat handles leads + core tools; tasks (S4), deals/companies (S5), notes/
timeline/notifications (S6), config (S7) come back online stage-by-stage.
That regression is the cost of refusing the side-by-side defer; it's the
right cost.

## 1.1 File tree (new + changed)

```
convex/ai/registry/
  types.ts        §1.2  Capability, Principal, CapabilityCtx, CapabilityResult, Outcome, RiskTier, Channel
  coerce.ts       §1.3  coerceTimestamp, coerceStringArray, coerceInt, stripEmpty, field() helpers
  result.ts       §1.4  ok()/partial()/failed()/repair()/ask()/denied() envelope builders
  define.ts             defineCapability(), REGISTRY Map, getCapability, listCapabilities
  wrapper.ts      §1.5  runCapability(): the CorrectnessWrapper (the one execution path)
  gate.ts         §1.6  RBAC + channel + risk/2FA gate
  modules.ts      §1.7  ModuleDef registry + activeModules(org) + per-module context providers
  vertical.ts     §1.7  VerticalProfile (industry persona/labels/templates) — thin adapter
  groups.ts       §1.8  GroupDef: group → playbook text + member capability names
  drive.ts        §1.8  PROJECT drive text + assembleSystemPrompt(stablePrefix, tail)
  catalog.ts            capability catalog (names+1-line, grouped) for the cached prefix
  router.ts             adaptiveRouter(request, routeCtx) → group(s) to preload
  projectors/aiSdk.ts   capability → AI SDK tool (PERMISSIVE input schema — §1.5 why)
  projectors/mcp.ts     capability → MCP tool
  projectors/rest.ts    capability → REST handler
  coverage.ts           registry-derived coverage/contract report
  audit.ts              writeAudit() — one feed for every AI action
convex/ai/runtime/
  host.ts               ToolLoopAgent host: progressive disclosure (prepareStep), prompt caching, retry budget
  coreTools.ts          search_crm, describe_entity, describe_workspace, read_conversation, discover_capabilities, ask_user, escalate_to_agent
  autonomous.ts         autonomousTurn(): event-driven engine
convex/ai/channels/
  whatsappInbound.ts    Twilio inbound logic (called by http.ts route)
  persona.ts            WhatsApp Agent Profile config + constrained allow-list
convex/crm/**/capabilities.ts   per-module capability declarations wrapping existing *Impl
convex/schema/*       agentChannels table; org.settings.aiAutonomy; (remove users.preferences.aiApprovals)
convex/http.ts        + POST /whatsapp/twilio
```

**Keep unchanged (chat layer):** `messages.ts`, `conversations.ts`, `models.ts`,
`keys*.ts`, `core/ai/**` frontend, result/preview React components. The
orchestrator `run.ts`/`streamLoop.ts` shrink to a thin caller of `runtime/host.ts`.

## 1.2 Core types (`types.ts`) — canonical shapes

```ts
export type RiskTier = "safe" | "reversible" | "irreversible";
export type Channel  = "chat" | "whatsapp" | "mcp" | "rest";

export type Principal = {
  kind: "member" | "wa_profile";       // wa_profile = the WhatsApp AI agent persona
  userId: Id<"users">;                 // for wa_profile: the bot's service member
  orgId: Id<"orgs">;
  permissions: string[];               // from existing RBAC — NEVER trust the request
  channel: Channel;
};

export type CapabilityCtx = {
  ctx: ActionCtx;
  principal: Principal;
  conversationId?: Id<"aiConversations">;
  stepUpToken?: string;                // present when a 2FA confirm was completed
};

export type Outcome =
  | "ok" | "partial"
  | "needs_repair" | "not_found" | "ambiguous"
  | "denied" | "channel_blocked" | "needs_step_up"
  | "business_error" | "infra_retry";

export type CapabilityResult = {
  status: Outcome;
  headline: string;                                   // never empty — kills "Done."
  changes?: { label: string; value: string; emphasis?: "added"|"changed"|"unchanged" }[];
  facts?: string[];
  errors?: { item: string; reason: string }[];        // per-row for bulk/partial
  suggestedNext?: { label: string; intent: string }[];
  repair?: { field: string; expected: string; received: string; fix: string; example: object };
  data?: unknown;
  display?: ToolDisplay;                              // reuse existing union for FE cards
};

export type Capability = {
  name: string; module: string; group: string;
  permission: string | null; risk: RiskTier; channels: Channel[];
  spec: {
    whenToCall: string; whenNotToCall?: string;
    requiredClarifications?: string[]; synonyms?: string[];
    goodExample: object; badExample?: { args: object; why: string };
  };
  drive: {
    onSuccess: string; onValidationError?: string; onEmpty?: string;
    onPartial?: string; onDenied?: string; suggestNext?: string;
  };
  input: z.ZodType;                                   // STRICT schema, parsed inside wrapper
  run: (ctx: CapabilityCtx, args: any) => Promise<CapabilityResult>;
};
```

## 1.3 Coercion (`coerce.ts`) — applied centrally, never per-tool
- `coerceTimestamp(v)`: accepts epoch ms (number/numeric string), ISO 8601, and
  natural language ("next Tue", "in 3 days", "tomorrow 9am") → epoch ms in the
  **org timezone** (reuse `lib/datetime.ts` + date-fns). This is the `dueAt` fix.
- `coerceStringArray(v)`: array | CSV | JSON-string | single value → `string[]`.
- `coerceInt(v)`, `stripEmpty(v)` (null/""/whitespace → undefined).
- `field(zodType)`: a helper that wraps a leaf type so every capability field is
  coerced by default. Tool authors use `field.timestamp()`, `field.codeArray()`,
  etc., so **they cannot forget coercion.**

## 1.4 Result builders (`result.ts`)
`ok({headline,changes,...})`, `partial(...)`, `failed(status, headline, errors)`,
`repair(field, expected, received, fix, example)`, `ask(question, options?)`,
`denied(permission)`. All return `CapabilityResult`. `run()` MUST return one of
these — the type forbids a bare string.

## 1.5 The CorrectnessWrapper (`wrapper.ts`) — the ONE execution path
```
runCapability(cap, rawArgs, ctx): CapabilityResult
  1. coerce rawArgs via cap.input's field helpers
  2. strict parse vs cap.input          → ZodError → return repair(...)   (self-correct)
  3. resolve refs (P-007→_id, name→row)  → none → not_found; >1 → ambiguous(ask)
  4. RBAC: principal.permissions ∋ cap.permission   → else denied
  5. channel: cap.channels.includes(principal.channel) → else channel_blocked
  6. risk: irreversible && !ctx.stepUpToken          → needs_step_up
  7. try cap.run(ctx,args) → CapabilityResult
       catch ConvexError → business_error(message)
       catch arg-validator → repair(...)   (extra/missing field)
       catch transient(5xx/429/timeout) → infra_retry
```
**Why the AI-SDK schema is permissive but the wrapper is strict:** the AI SDK
validates `inputSchema` and throws `TypeValidationError` *before* `execute`,
which today bypasses our formatter and gives the model no retry. So
`projectors/aiSdk.ts` hands the SDK a **loose** schema (accepts the model's raw
JSON) and `runCapability` does the strict parse, turning failures into a
`repair` tool-result the agent reads and self-corrects from on the next step
(bounded retry budget in `host.ts`).

## 1.6 Gate (`gate.ts`) — replaces `resolveNeedsApproval` + #26
Pure functions: `canRun(principal, cap)`, `channelAllows(channel, cap)`,
`needsStepUp(cap, ctx)`. Risk policy: `safe`/`reversible` → auto; `irreversible`
→ permission + 2FA + channel allow-list (never WhatsApp). No per-user category
toggles.

## 1.7 Modules + Verticals (`modules.ts`, `vertical.ts`) — adaptivity & the thin adapter
- `ModuleDef { key, isEnabled(org), contextProvider(ctx)→string }`. Capabilities
  declare `module`. `activeModules(org)` filters by **live `org.settings`** / flags.
- Availability = `activeModules ∩ principal.permissions ∩ channel`. Context =
  only active modules' providers. **Pipelines off → pipeline tools AND context
  gone.**
- `VerticalProfile { industryKey, driveAddendum? }` — **persona only.** The
  vertical contributes a small optional PROJECT-drive addendum (domain tone, e.g.
  "leads are buyers/tenants; budgets in AED"). It carries **NO field/pipeline
  data the AI reads.** Industry definitions in `convex/_platform/industries/**`
  are **seed-only** — they create the org's initial `fieldDefinitions`/`pipelines`
  rows at onboarding and are NEVER read at AI runtime. **Capabilities never fork
  per vertical** — see §2.4.

## 1.7a Live schema is the single source of truth (NON-NEGOTIABLE)
The AI's knowledge of fields/types/options/labels/pipelines/stages/modules comes
**only from the org's live database**, read at the moment it's needed — never
from templates, never hardcoded, never a stale prompt copy.

- **Entity labels** → live `org.entityLabels`.
- **Fields/types/options/required/sensitive** → live `fieldDefinitions` via the
  existing `crm/fields/fieldDefinitions/queries:listByEntityForAI` (already
  RBAC-checked). `describe_entity(entityType)` wraps it.
- **Pipelines + stages** → live `crm/fields/pipelines/queries:listByOrgForAI`
  (stages are inline on each pipeline row). `describe_workspace` wraps it.
- **Enabled modules** → live `org.settings`.

Two mechanisms make this airtight, both live:
1. **`describe_entity` / `describe_workspace`** — on-demand live reads so the AI
   *sees* the exact current fields/options before it writes (so it never guesses
   an option string or field name). On-demand keeps tokens tiny vs. dumping the
   whole schema in the prompt (today's bloat), but it's just as live — it's a
   real DB read each call.
2. **Server-side validation at write time** — `create_*`/`update_entity` fetch
   the live `fieldDefinitions` *inside `run()`* and coerce/validate the AI's
   values against them, returning per-field `repair` for anything that doesn't
   fit. So the **authority is always the live row at the moment of write** — even
   if the AI's view were stale, the write is validated against current truth. The
   owner can rename/retype/remove a field and the very next AI write respects it.

`describe_entity` and `describe_workspace` are part of the core tool set (§1.1),
RBAC-filtered (sensitive fields hidden from non-admins).

## 1.8 Driving layers (`drive.ts`, `groups.ts`) — 3 tiers, only active ones emitted
- PROJECT drive: global doctrine (act don't just answer; read `repair` and fix;
  never invent codes; narrate the result envelope; autonomy rules; safety). Part
  of the **cached** stable prefix.
- GROUP playbook (`GroupDef.playbook`): the "what to call when" per domain,
  emitted only when the router activates that group.
- TOOL drive (`cap.drive`): per-tool edge-case lines, emitted only for in-scope tools.
- `assembleSystemPrompt` = `[ cachedPrefix: PROJECT + capability catalog ]` + `[
  tail: active vertical addendum + active module context + active group playbooks
  + in-scope tool drive + route/conversation/message ]`.

## 1.9 Runtime host (`runtime/host.ts`) — progressive disclosure + caching
- Uses AI SDK `ToolLoopAgent` + `prepareStep` to grow the active tool set per
  step (core tools → router-preloaded group → `discover_capabilities` results).
- Marks the stable prefix (PROJECT + catalog) cacheable via provider options
  (Anthropic cache_control / OpenAI auto) — **Stage 2, in v2**.
- Retry budget (e.g. 2) for `needs_repair`/`infra_retry`; `stepCountIs` cap.
- One entrypoint for all channels: `runAgent({ principal, channel, trigger, conversation, message })`.

## 1.10 Conversation memory — the per-lead message box (logging + context)
Every WhatsApp (and other-channel) exchange is logged to the EXISTING `messages`
table, keyed to the lead by `personCode`/`conversationId`, so the box is the
single transcript the AI both writes to and reads from. The schema already
supports all three row types — no migration:

| Source | Row written |
|---|---|
| Lead inbound | `authorType:"contact"`, `channel:"whatsapp"`, `authorPersonCode`, `authorId`=assigned agent (RBAC), `idempotencyKey`=provider msg id |
| Agent reply (via app or send_whatsapp) | `authorType:"user"`, `channel:"whatsapp"`, `authorId`=agent |
| AI reply | `authorType:"ai"`, `channel:"whatsapp"`, `onBehalfOf`=agent |

- **Write path:** the Twilio inbound adapter (S13) upserts the lead's message;
  `send_whatsapp` (S14) writes the agent/AI reply. Idempotency-keyed so webhook
  re-delivery never duplicates.
- **Read path (context):** `read_conversation(personCode|conversationId, limit)`
  is a core tool that returns the recent message box; the autonomous engine (S11)
  loads it automatically so the AI reasons over the **full conversation** before
  acting or suggesting. This is what lets "Sara wants a 2BR" become a deduped
  lead + follow-up + note without anyone telling the AI to.
- **Honest limit:** we can only log agent replies that go through our app/API. A
  message an agent types on their *personal* WhatsApp app (bypassing us) isn't
  visible to Twilio and won't appear in the box — flagged as a known gap; the fix
  is routing agent replies through the app composer / the agent's Twilio number.

This is distinct from the **audit log** (S12): the audit log records what the AI
*did* (capability, args, result); the message box is the human/AI *conversation
transcript*. Both exist; they serve different purposes.

---

# PART 2 — Locked decisions & defaults (no further input needed to start)

## 2.1 Autonomy / safety (replaces locked decision #26 — reopened)
`safe`/`reversible` capabilities auto-execute (no confirm). `irreversible`
(bulk/hard delete, settings/schema, members/roles) require **permission + 2FA
double-confirm + are blocked on WhatsApp**. Per-org `aiAutonomy` settings (Stage 8).

## 2.2 Token target (v2, with caching ON)
Effective billed input ~3–6k/turn (stable prefix cached at ~10% Anthropic / 50%
OpenAI; only the active group's tools loaded; field schema fetched via
`describe_entity`, not in-prompt). Code-Execution Mode (98.7%, Anthropic/Cloudflare)
stays a backlog card — not needed for typical CRM turns.

## 2.3 WhatsApp clarification defaults (LOCKED; override later if you want)
| Q | Locked default |
|---|---|
| Sender model | **Per-agent Twilio number**; org-number-with-routing is a later config option |
| Mode C scope | **Restricted**: answer from CRM/FAQ, capture lead info, book/schedule, **hand off to a human** for anything else or on request. No open-ended free-form. |
| Templates | Ship a **small default set** (greeting, follow-up, appointment, "an agent will reach out") + a templates admin later |
| Handoff target | The lead's **assigned agent**; if unassigned → shared queue / round-robin to online agents |
| Auto-act confidence | Auto-create only when **name + (phone OR email)**; else create a suggestion/draft for the agent. Always dedup first. |

## 2.4 Real-estate + other verticals — analysis (yes, thin adapter; AI reads LIVE data)
You don't need to know each vertical's wishes now. The capability layer is
**vertical-agnostic** (`create_lead`, `update_entity`, `create_task` are generic).
A vertical is purely **configuration**, and crucially **the AI reads the org's
live database, never templates** (see §1.7a):

- **Entity labels, custom fields, types, options** → the AI reads them **live**
  from `org.entityLabels` + `fieldDefinitions` via `describe_entity`, and
  `create_*`/`update_entity` validate values against the **live** field rows at
  write time. The owner can add/rename/retype/remove any field in the app and the
  next AI action respects it immediately. **No template, no hardcoding, no stale
  prompt copy.**
- **Enabled modules** (`activeModules` from live `org.settings`) decide which
  tools exist — a freelancer org with no `companies`/`pipelines` simply has none.
- **`VerticalProfile.driveAddendum`** is the *only* vertical-specific AI input: a
  few lines of domain persona/tone. It carries no field data.
- **Industry definitions** (`convex/_platform/industries/**`) are **seed-only** —
  they create the *initial* `fieldDefinitions`/`pipelines` rows at onboarding.
  After onboarding they are never read by the AI. The owner's edits live in the
  DB, and the DB is what the AI reads.

So selling to real-estate, recruitment, or freelancers = pick/define a
`VerticalProfile` (persona text) + let onboarding seed initial fields. **No
per-vertical capability code, ever**, and the AI is always in sync with whatever
the owner has configured live. Built in Stage 9.

---

# PART 3 — Stages (each = one session, self-contained prompt)

Each stage is **one session**, self-contained, ends at a green build. **No
`AI_V2` flag, no parallel folders, no "we'll delete it at S17"**: when a stage
ports a domain, the legacy code for that domain is deleted in the same edit
(per AGENTS.md `RULE: Side-by-side cleanup`). The legacy chat path in
`run.ts` was deleted in S3 — V2 is the only path. Domains not yet ported are
temporarily unreachable from chat until their stage lands; that gap is
intentional. 18 stages (S0–S17).

**SHARED CLOSING BLOCK** (already included at the end of each prompt below):
```
Constraints:
  • Apply AGENTS.md `RULE: Side-by-side cleanup` — when this stage ports a
    domain or replaces a function, DELETE the legacy code in this same edit
    (no parallel folders, no env flags, no shims unless PENDING.md records the
    blocker + the stage that unblocks).
  • Apply AGENTS.md `RULE: LLM-readable comments` — file headers ≤ 6 lines,
    no stage-history narration in source, no speculative future-work comments.
  • Do NOT run live Convex (MCP or `npx convex run`) — if a migration is
    needed, write it idempotently and EMIT the exact command for me to run,
    then continue.

Before ending — DOC CLEANUP IS PART OF THE STAGE, not optional:
  1. Run `pnpm typecheck` and `pnpm exec biome check .` (0/0) plus this
     stage's tests. All must be green before touching the docs.
  2. In AI-TOOLING-BUILD-STAGES.md: replace this stage's prompt with a
     2-3 line ✅ summary (date + headline + key files). DO NOT keep the
     full original prompt or a long Findings/Gotchas block — those belong
     in git history. The collapsed summary is the new entry.
  3. In PENDING.md: REMOVE this stage's row entirely from the stage-status
     list. PENDING.md only carries truly pending work — no ✅ rows, no
     "see SHIPPED.md" pointers. If a follow-up surfaced, add a NEW pending
     row with full context for it (separate from the shipped summary).
  4. In SHIPPED.md: add one one-line entry for this stage (date + headline
     + key files). No multi-paragraph blocks; no Findings sections; no
     verification postscripts. Detail lives in git history.
  5. Add a Future-Enhancements.md card for any deferral introduced.
  6. Then STOP — do not start the next stage; report exactly what shipped
     and emit any migration command the user must run.
```

---

### ✅ STAGE S0 — Registry scaffold (pure, no behavior change) — SHIPPED 2026-06-03

Pure additive scaffold under `convex/ai/registry/`: `types.ts` (canonical shapes), `coerce.ts` (`field.*` helpers + tz-aware `coerceTimestamp`), `result.ts` (envelope builders), `define.ts` (REGISTRY map). 27/27 tests; nothing wired into chat.

### ✅ STAGE S1 — Correctness machine (wrapper + gate + taxonomy) — SHIPPED 2026-06-04

`convex/ai/registry/gate.ts` (canRun + channelAllows + needsStepUp — irreversible never over WhatsApp) + `wrapper.ts` (`runCapability`: 7-step pipeline coerce→parse→resolve→RBAC→channel→risk→run, classifies every throw into the closed Outcome taxonomy, never throws). Injectable `RefResolver` stub. 25 wrapper tests + direct gate tests, 52/52 total.

### ✅ STAGE S2 — Agent host + core tools + PROMPT CACHING + AI-SDK projector — SHIPPED 2026-06-04

Runtime host (`runtime/host.ts:runAgent`) using AI SDK v6 `streamText` + `prepareStep` for progressive disclosure; `projectors/aiSdk.ts` (PERMISSIVE schema → strict parse inside wrapper); `catalog.ts` (cache-stable group/name ordering); `drive.ts` (PROJECT doctrine + Anthropic ephemeral cache marker on stable prefix); `router.ts` (deterministic preload). 5 always-on core tools: `search_crm`, `describe_entity` (S2 stub), `read_conversation`, `discover_capabilities`, `ask_user`. Wired into `run.ts` behind `AI_V2` flag (retired in S3). 85/85 tests.
### ✅ STAGE S3 — Leads group + describe_entity/workspace + dynamic field validation + V1-chat-path delete — SHIPPED 2026-06-04

First domain port + first application of `RULE: Side-by-side cleanup`. New `convex/crm/entities/leads/capabilities.ts` (4 caps: `create_lead`/`update_entity`/`convert_lead`/`get_entity_detail`); real `describe_entity`/`describe_workspace` reading live `fieldDefinitions` + `pipelines:listByOrgForAI`; real `resolveRef` honouring user-supplied `entityType`; registry `groups.ts` + `coverage.ts` contract-test generator. **Deleted in same edit:** `convex/ai/tools/crud/{createLead,convertLead,createContact,revertContact}.ts` + the entire V1 chat-path runtime (`orchestrator/{streamLoop,twoStepSchemaAudit,router,suggestionGenerator,reasoningBuffer}.ts`, `systemPrompt.ts`, `subagents/`). `run.ts` shrunk ~700→~400 lines; `AI_V2` flag retired (V2 is the only chat path). 104/104 tests.
### ✅ STAGE S4 — Tasks/scheduling group + per-tenant tz-aware dueAt — SHIPPED 2026-06-04

`convex/crm/shared/tasks/capabilities.ts` (8 caps + `tasks` group playbook). New `field.timestampLazy()` + `internal.orgs.queries.getTimezoneForAI` defer per-tenant tz resolution to `run()` (the AI never sees tz; strings like "next Tuesday" re-anchor to org local time server-side — kills the dueAt bug class). **Deleted in same edit:** `convex/ai/tools/tasks.ts` + `convex/ai/tools/scheduling/`. AGENTS.md `RULE: Concise comments` renamed to `RULE: LLM-readable comments` per user direction (soft budgets — file header 6–25 / function 3–15 / inline 1–8). 18 contract tests.
### ✅ STAGE S5 — Deals + Companies groups — SHIPPED 2026-06-04

`convex/crm/entities/deals/capabilities.ts` (7 caps + `deals` playbook: `create_deal`/`move_stage` (resolves stage code OR name server-side)/`close_deal`/`reopen_deal`/`change_pipeline`/`soft_delete_deal`/`get_deal_detail`); `convex/crm/entities/companies/capabilities.ts` (5 caps + `companies` playbook; `create_company` re-attaches each `personCodes[]` via `addPersonForAI` so the indexed `companyMembers` join is populated for O(1) lookups). **Deleted in same edit:** `convex/ai/tools/crud/{createCompany,createDeal}.ts` + `convex/ai/tools/companies/`. 24 contract tests.
### ✅ STAGE S6 — Notes + Timeline + Notifications groups — SHIPPED 2026-06-04

`convex/crm/shared/notes/capabilities.ts` (7 caps + `notes` playbook: `add_note`/`update_note`/`set_note_category`/`pin_note`/`set_note_entity`/`delete_note`/`list_org_notes`); `convex/crm/shared/timeline/capabilities.ts` (1 cap, `list_org_timeline`); `convex/notifications/capabilities.ts` (3 caps user-scoped at the schema layer). New `listForOrgImpl` + `listForOrgForAI` twin in notes. **Deleted in same edit:** `convex/ai/tools/{crud,notes,timeline,notifications}/` (4 directories). 22 contract tests.
### ✅ STAGE S7 — Pipelines + Fields + Tags + Views + Categories (config modules) — SHIPPED 2026-06-04

5 workspace-config groups in one stage: `convex/crm/fields/pipelines/capabilities.ts` (8 caps; `delete_pipeline` + `create_field` + `remove_field` flagged `irreversible` — S10 fences with 2FA), `fieldDefinitions/capabilities.ts` (4 caps, write-only — reads via core `describe_entity`), `shared/tags/capabilities.ts` (6 caps; split `tags.manage` for create/update/delete + `tags.attach` for attach/detach), `shared/savedViews/capabilities.ts` (5 caps; `filters` accepted as structured object, JSON.stringify inside `run()`), `shared/noteCategories/capabilities.ts` (7 caps; hex-colour regex + 40-char name cap). **Deleted in same edit:** `convex/ai/tools/layers/{pipelines,fields,tags,views,categories}.ts` (~77 KB). 60 contract tests.
### ✅ STAGE S8 — Approvals → Autonomy migration (schema + UI, in one change) — SHIPPED 2026-06-04

Replaced the stale per-user `users.preferences.aiApprovals` toggles with `org.settings.aiAutonomy` (`autoActFromConversations` default true, `destructiveRequires2FA` read-only, `whatsappAgentEnabled` default false, optional `perRoleAutonomyCap`). New `core/platform/settings/components/groups/ai/AIAutonomySection.tsx` (replaces deleted `AIApprovalsSection.tsx`); AIGroup tab `approvals → autonomy`; `resolveNeedsApproval` lost its `userAutoApprove` arg + per-user pref branch (V2 risk gate at `convex/ai/registry/gate.ts` is the policy now); `_shared/aiApprovals.ts` slimmed to hard-locked enum + `ApprovalCategory` type for surviving V1 tools (deleted in S10). Idempotent migration `convex/_migrations/2026_06_04_approvalsToAutonomy.ts` strips users field + seeds org defaults. 5 contract tests in `convex/aiAutonomy.test.ts`. EMIT to user: `npx convex run _migrations/2026_06_04_approvalsToAutonomy:run '{"dryRun":true}'` then `'{}'`.

### ✅ STAGE S9 — Module + Vertical registry — SHIPPED 2026-06-05

`convex/ai/registry/modules.ts` (`OrgSnapshot` + `ModuleDef` registry + `activeModules` + `filterCapabilitiesByModules` + `renderActiveModuleContext`) and `vertical.ts` (`VerticalProfile` — persona-only `driveAddendum`, NO field/pipeline data; built-in `real-estate`/`recruitment`/`freelancer`). Wired into `runtime/host.ts`: caps filtered by `activeModules ∩ permissions ∩ channel`; tail = vertical addendum + active-module contexts + route + group playbooks. New internalQuery `orgs/queries:getOrgSnapshotForAI` loaded once per turn from `orchestrator/run.ts`. Capability surface invariant across verticals — proven by tests. 18 module/vertical tests + 4 host integration tests.

### ✅ STAGE S10 — Members + Settings + Bulk/destructive + 2FA step-up + channel fence + V1 deletion — SHIPPED 2026-06-05

`convex/orgs/capabilities.ts` (9 caps in `settings`+`members` groups) and `convex/crm/shared/bulk/capabilities.ts` (5 caps: `bulk_update_entities`/`bulk_delete_entities`/`bulk_close_deals`/`hard_delete_entity`/`import_csv` — all `irreversible`, channels exclude WhatsApp). New `aiStepUpTokens` table + `convex/aiStepUp.ts` (`confirmStepUp` orgMutation issues a single-use 5-min token, hashes args server-side, re-schedules `processChat.run` with the token); wrapper step 6b consumes the token via the host-injected `stepUpVerifier`. New `<StepUpCard>` UI scans assistant tool-results for `needs_step_up` and drives the confirm-twice flow. Permission catalog gained `data.bulkActions` / `data.import` / `data.hardDelete`. Side-by-side delete: `convex/ai/{toolRegistry.ts, agentScorer.test.ts}`, `convex/ai/orchestrator/{resume,friendlyToolError,toolContextBinder,zodErrorFormatter}.ts` + tests, all of `convex/ai/tools/`, `convex/_shared/{aiApprovals,bulkProgress}.ts`, `core/ai/components/{ChatConfirmation.tsx, preview/}`. Standing orders runner ported to V2 host with name-filter on `allowedTools[]`. Contract tests cover denied + channel_blocked + needs_step_up + verifier-accepted happy path for every new cap.

### ✅ STAGE S11 — Autonomous engine (event-driven; manual trigger until S13) — SHIPPED 2026-06-05

`convex/ai/runtime/autonomous.ts` (Node — engine + `autonomousTurn` + `triggerAutonomousTurnForTest` actions) + `autonomousState.ts` (V8 sister — `internalQuery recentAutonomousTurns` + `internalMutation recordAutonomousTurn` + pure helpers `buildAutonomousPrompt`/`hasRecentAutonomousTurn`/`DEBOUNCE_MS`). Engine resolves `agent_not_member`/`no_ai_use_perm`/`autonomy_off`/`debounced`/`no_platform_key`/`host_error` outcomes; runs `runAgent({trigger:"autonomous"})` under agent RBAC; writes one `aiToolEvents` marker (`toolName:"(autonomous_turn)"`, doubles as debounce + audit) plus an `activityLogs` row (`actorType:"ai"`, `action:"ai.autonomous.turn"`). Dedup remains at the model layer (autonomous prompt mandates `search_crm` before any `create_lead`). 15 tests (8 pure-helper + 7 stub-ctx engine). Purely additive — no legacy deletions.

### ✅ STAGE S12 — Audit feed + coverage/contract report + token measurement — SHIPPED 2026-06-05

`convex/ai/registry/audit.ts` (`writeAudit({capability, args, result, ctx, source?})` — redacts sensitive arg keys + truncates long values + skips outcomes that didn't execute, called from `runCapability` step 7, never throws). Extended `coverage.ts` with pure `buildCoverageReport(caps, registeredGroupKeys)` + `convex/ai/queries/coverageReport.ts` (`getCoverageReport` + `listCapabilityGaps` internalQueries) listing per-module counts / risk tiers / channel coverage / missing examples / missing playbooks. Token report: additive optional `cachedInputTokens` on `aiToolEvents` (no migration), extended `recordToolEvent`, host writes one `(turn)` row per chat turn, new `convex/ai/queries/tokenReport.ts` (`aggregateTokenSamples` pure + `getTokenReport(orgId?, windowDays?=7)` internalQuery) returning {totals, averages, cacheHitRatio, target:{min:3000,max:6000,withinTarget}}. 21 new tests.

### ✅ STAGE S13 — Twilio inbound (per-agent; RBAC from day 1) — SHIPPED 2026-06-05

`agentChannels` table added to `convex/schema/system.ts` ({ orgId, userId optional, provider:"twilio", phoneNumber, mode:"agent_ops"|"send"|"profile", enabled }; indexes by_phone + by_org_and_user_and_mode + by_org_and_provider — purely additive, no migration body). New `convex/ai/channels/whatsappInbound.ts` exposes pure helpers (`parseTwilioFormBody`, `stripWhatsappPrefix`, `formatInboundTranscript`, `verifyTwilioSignatureSha1` — HMAC-SHA1 + base64 over sorted form params, matching twilio.com/docs/usage/webhooks/webhooks-security), internal lookups (`findAgentChannelByPhone` / `findContactOrLeadByPhone`), idempotent inbound writer `recordInboundWhatsappMessage` (keyed off the existing `messages.by_org_and_idempotency` index — Twilio re-delivery is safe), and orchestrator `handleTwilioInboundInternal` returning a `WhatsappInboundOutcome` envelope. New `POST /whatsapp/twilio` route in `convex/http.ts` reads raw body, verifies `X-Twilio-Signature` against `request.url` (Twilio computes over the exact URL it called), and dispatches: `agent_ops` → schedules `internal.ai.runtime.autonomous.autonomousTurn` under the agent's RBAC with `channel:"whatsapp"` + `idempotencyKey=MessageSid`; `send` mode → 200 noop; `profile` mode → 200 noop stub for S15. 401 on missing/bad signature or unmapped/disabled channel; 400 on missing From/To/MessageSid; 500 if `TWILIO_AUTH_TOKEN` env var is unset. 15 tests in `convex/whatsappInbound.test.ts` (11 pure-helper + 4 end-to-end via `t.fetch`) — file lives at the convex/ root per the documented convex-test path-resolution constraint (same as stage9.test.ts). Required env vars: `TWILIO_AUTH_TOKEN` set in the Convex dashboard. Migration: `npx convex dev --once` to push the schema; operator seeds `agentChannels` rows via the Convex dashboard.

### ✅ STAGE S14 — Outbound send (Mode A/B): session vs template, 24h window — SHIPPED 2026-06-05

`convex/ai/channels/whatsappTemplates.ts` (V8) ships 4 default templates (`greeting_v1`/`follow_up_v1`/`appointment_v1`/`agent_handoff_v1`) + pure render/window helpers (`renderTemplateBody`, `isWithinSessionWindow`, `SESSION_WINDOW_MS`). `convex/ai/channels/whatsappOutboundState.ts` (V8) carries the agent-channel + recipient + last-inbound lookups (`findAgentSendChannel`, `findRecipientByPersonCode`, `getMostRecentInboundForPerson`). `convex/ai/channels/whatsappOutbound.ts` (`"use node"`) exposes `sendWhatsappViaTwilioAction` — form-encoded POST to `Messages.json` with Basic auth, supports `TWILIO_MOCK_MODE` for tests, returns deterministic `{ ok, sid?, errorCode?, errorMessage? }`. `convex/ai/channels/capabilities.ts` (V8) registers the `whatsapp` group + `send_whatsapp` capability (`risk:"reversible"`, channels chat+whatsapp+mcp+rest, `permission:"messages.send"`): resolves agent send-channel → recipient phone → 24h window; in-window → session `Body`, out-of-window → requires `templateId` + `templateVars` (free-form refused with a `repair` envelope listing valid ids); persists outbound row via existing `messages.sendForAI` (`channel:"whatsapp"`, `authorType:"ai"`/`"user"` per `authoredBy`, `onBehalfOf=agent`, `idempotencyKey=<Twilio SID>`). Wired into `runtime/host.ts` via side-effect import. 20 tests in `convex/ai/channels/whatsappOutbound.test.ts` (10 pure helpers + 10 capability gate). `Future-Enhancements.md §B.40` records the WhatsApp Templates Admin UI deferral. **Verification:** typecheck 0 · biome 0/0 (1091 files; +5 new) · `pnpm test` 992 pass / 1 skipped (63 files; +20 new) · `pnpm exec vitest run` 215 pass · `pnpm build` ✅.

### ✅ STAGE S15 — WhatsApp Agent Profile (Mode C): autonomous customer replies — SHIPPED 2026-06-05

`convex/ai/channels/persona.ts` (Node — `runWaProfileReplyEngine` + `runWaProfileReply` action) and `personaCapability.ts` (V8 — `escalate_to_agent` capability + `escalateToAgentInternal` atomic mutation). Mode C is OFF by default: gated on `org.settings.aiAutonomy.whatsappAgentEnabled === true` AND a `mode:"profile"` `agentChannels` row with a service-member `userId`. Persona principal `kind:"wa_profile"` runs `runAgent({channel:"whatsapp", trigger:"autonomous_reply"})` with the registry pre-filtered to a 11-name allow-list (send_whatsapp / draft_message / search_crm / describe_entity / read_conversation / discover_capabilities / ask_user / create_lead / create_task / add_note / escalate_to_agent — every destructive/settings/members cap is absent). Per-conversation rate limit (`scope:"wa_profile.reply"`, max=1 / 30s) via new non-throwing `_shared/rateLimitMutation.ts:tryConsumeRateLimitInternal`. New `ai.whatsappAgent` permission (Owner+Admin) in catalog. Mode C dispatch in `whatsappInbound.ts` replaces the S13 `noop:profile_disabled_s15` stub — schedules `runWaProfileReply` with the recipient personCode (or bare from-phone) as the rate-limit key. 10 contract tests in `persona.test.ts` (allow-list invariant + every gating reason + happy-path mock-model assertion). Verification: typecheck 0; biome 0/0 (1101 files); pnpm test 1002 pass / 1 skipped (64 files); vitest 215 pass; build ✅. **External prerequisites still required before turning the master switch on**: (1) WhatsApp Business approval + (2) Twilio sender configured with `mode:"profile"` `agentChannels` row pointing at a service-member `userId`. Tracked under `Future-Enhancements.md §B.41`.

### ✅ STAGE S16 — MCP + REST projectors — SHIPPED 2026-06-05

`convex/ai/registry/projectors/{mcp,rest,dispatch}.ts` + `convex/ai/aiApiTokens.ts` (token table + Bearer auth: `ot_<orgPrefix6>_<random32hex>` plaintext shown ONCE, SHA-256 stored, gated on new `ai.apiTokens.manage` permission Owner+Admin). HTTP routes in `convex/http.ts`: `POST /ai/mcp` (JSON-RPC 2.0 — `initialize` / `tools/list` / `tools/call` returning `{isError, content[], structuredContent}`) and `POST /ai/rest/<capability>` (envelope at 200; transport-level 400/401/403/404/405). Both routes call `dispatchMcpRequest` / `dispatchRestRequest` internalActions that bootstrap the V2 registry via side-effect imports and route through the SAME `runCapability` chat takes. New `aiApiTokens` table in `convex/schema/ai.ts` (indexes `by_hash` / `by_org` / `by_user`). 51 new tests: `mcp.test.ts` (15) + `rest.test.ts` (12) + `crossChannelParity.test.ts` (7) + `aiApiTokens.test.ts` (17) all green. Cross-channel parity test proves: same Capability + same args + same principal → identical envelope on chat / MCP / REST for happy + needs_repair + RBAC denial + channel_blocked + needs_step_up + business_error. Verification: typecheck 0 · biome 0/0 (1109 files; +9 new) · pnpm test 1053 pass / 1 skipped (68 files; +5 new) · vitest 215 pass · build ✅.

### ✅ STAGE S17 — Cutover sweep + full repo verification — SHIPPED 2026-06-05

Final V1 sweep. Verified via grep that `toolRegistry.ts`, `tools/**`, `resume.ts`, `twoStepSchemaAudit.ts`, `friendlyToolError.ts`, `toolContextBinder.ts`, `zodErrorFormatter.ts`, the V1 propose/commit + force-expand-all-layers + subagent router were already deleted in S3–S10 — nothing remained. Cleanup: collapsed the dead `expandedLayers` arg from public `messages.{sendMessage,regenerate,editAndResend}` mutations + `processChat.run` validator (made `v.optional` for in-flight scheduler resilience) + `aiStepUp.confirmStepUp` + frontend `useAIChat.send` + `<AIQuickComposerCard>` (the V2 host runs progressive disclosure via `discover_capabilities` — the arg was unread for 14+ stages). Persisted `aiMessages.expandedLayers` schema field stays `v.optional` for harmlessness; future migration can drop it. Refreshed `convex/ai/MODULE.md` to post-S17 state (S0–S17 shipped roll-up + "no surviving legacy" assertion). Full repo verification green: `pnpm typecheck` 0 · `pnpm exec biome check .` 0/0 (1109 files) · `pnpm test` 1053 pass / 1 skipped (68 files) · `pnpm exec vitest run` 215 pass · `pnpm build` ✅.

---

## Summary
PART 1 fixes the concrete structure (types, the one execution path, coercion,
modules+verticals, 3-tier drive, caching host). PART 2 locks every decision
(autonomy/2FA, token target with caching ON in v2, WhatsApp defaults, and the
vertical thin-adapter — real-estate + others via config, no capability forks).
PART 3 is 18 one-session stages (S0–S17), each a self-contained prompt that says
exactly what to build, what not to touch, the acceptance bar, and the doc-update
+ verify step — so you can clear the session between every stage.

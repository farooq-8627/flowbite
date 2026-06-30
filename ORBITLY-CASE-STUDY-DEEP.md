# Orbitly — Deep Engineering Case Study

> Reconstructed from the repo itself: 80 commits (`git log`, first `60e3305` 2026-03-28 → last
> `f4d4961` 2026-06-10), the dated changelog in `SHIPPED.md`, the architecture docs, and the code.
> Every claim below is grounded in a commit hash, a file path, or a doc, cited inline. Where the
> repo and my own earlier `CASE-STUDY.md` disagreed, I trusted the repo and corrected the number —
> those corrections are flagged in **§8 Open questions**. Numbers I verified by running the actual
> command say "(verified)".
>
> Audience: early AI-native product-startup founders. The point isn't the CRM. It's how I scope,
> ship, own production, and direct AI without shipping slop.

---

## 1. One-liner + outcome + verified proof

**I built Orbitly solo: a multi-tenant, AI-native CRM where the AI is a first-class actor — it creates
the lead, converts it, attaches the file, sends the WhatsApp, and routes the next task — across
multiple channels through one execution path, with RBAC, risk gates, and an audit trail on every
call.**

The architectural centrepiece is a **channel-agnostic capability registry**: one place where every
"thing the AI can do" is declared, projected into chat, WhatsApp, MCP, and REST without rewriting the
capability. That property is what let four delivery surfaces come online without four codebases.

**Verified proof numbers (I ran these, I didn't quote them):**

| Claim | Verified value | How I verified |
|---|---|---|
| Backend tests green | **1278 passed, 1 skipped, 75 files** | ran `pnpm test` (vitest + convex-test) |
| Frontend tests green | **215 passed, 16 files** | ran `pnpm test:frontend` |
| AI capabilities | **127 distinct** (0 duplicate names) | extracted every `defineCapability` name across 25 capability files |
| AI provider SDKs wired | **7** (anthropic, google, groq, mistral, openai, xai, openrouter) | `package.json` deps + `convex/ai/modelRegistry.ts` |
| Delivery channels live | **chat, autonomous, WhatsApp in/out, MCP, REST** | `Channel` type in `convex/ai/registry/types.ts` (chat/whatsapp/mcp/rest) + projectors |
| Industry templates | **9** | `convex/_platform/industries/builtIns/*.ts` |
| Convex tables | **60** (`defineTable`) across 7 schema files | `grep -c defineTable convex/schema/*.ts` |
| Idempotent data migrations | **48** | `convex/_migrations/*.ts` |
| Per-module architecture docs | **50** `MODULE.md` files | `git ls-files '**/MODULE.md'` |
| Locked architectural decisions | **28** | numbered rows in `AGENTS.md` |

**Honest corrections to my own older `CASE-STUDY.md`:** it says "~150 AI capabilities" and "4 weeks"
and "a 2-week rewrite." The verified registry has **127** capabilities (the "~150" was the *old V1*
hand-written tool count — see `AI-TOOLING-LAYER-PLAN.md` §0). The commits span **~10.5 calendar
weeks**, not 4. The AI rebuild itself shipped in **~3 days** (`SHIPPED.md`: "S0–S17 SHIPPED
2026-06-03 → 2026-06-05"), not 2 weeks. Details in §8.

**What this was and wasn't:** a credibility/engineering project, not a market-validation one. No
paying users, no design partner, no PM. Every bug below I filed against myself by dogfooding.

---

## 2. Problem → ship: three features traced from the commits

### 2a. The CRM core — dynamic, industry-shaped entities (Phase 2, 2026-05-08 → 05-22)

The first real product surface. The decision that paid off later: **entity labels, fields, and
pipeline stages are never hardcoded — they're DB-backed per org** (`AGENTS.md` decision #2: "Entity
labels + slugs are NEVER hardcoded, always DB-backed via `orgs.settings.entityLabels`"). One org's
"lead" is another's "Inquiry," one's "contact" is another's "Client."

Traced through the commits: `d19f642` "ENtities built" (2026-05-13) → `5ceff18` "Kanban overflow
solved" → `0f63e22` "before fully dynamic" → `ca21b59` "Before Card Dynamic" → `c5eb0b9` "Phase-2
Slice-1 Entities completed" (2026-05-15). You can watch the entity card go from static to fully
dynamic across four commits. The dynamic-field system (`convex/crm/fields/`) splits a flat record
into column-backed, custom-field, and join storage at runtime — which is exactly why, much later, the
AI could write to a brand-new admin-added field on the *next turn with zero code change*
(`SHIPPED.md` 2026-06-06: `dynamicFieldDispatch.ts`, "every AI write capability now reads live
`fieldDefinitions`").

This is the foundational judgment call: the schema is data, not code. It cost more upfront. It made
everything downstream — templates, AI writes, multi-industry — a configuration problem instead of a
code problem.

### 2b. WhatsApp two-way conversations as a thin projector (S13–S15, 2026-06-05)

Idea: let a customer text a business's WhatsApp number and have the AI agent reply, book, and route —
under the org's real RBAC, never able to do anything destructive over a chat surface.

What makes this a good story is what it *didn't* require. By the time I built WhatsApp, the capability
registry already existed, so WhatsApp came online as a **projection over the same registry**, not a
parallel tool layer. From `SHIPPED.md` (2026-06-05, the S0–S17 entry):

- **S13** Twilio inbound webhook (`convex/ai/channels/whatsappInbound.ts`, `agentChannels` table,
  HMAC-SHA1 signature verify, `POST /whatsapp/twilio`).
- **S14** outbound (`send_whatsapp` capability + 4 default templates + 24-hour session-window logic —
  in-window free-form vs out-of-window template-only).
- **S15** Mode C "WhatsApp Agent Profile" — autonomous customer replies constrained to an **11-name
  allow-list**, per-conversation rate limit 1/30s, gated on `org.settings.aiAutonomy.whatsappAgentEnabled`.

The safety fence is structural, not a code-review habit: `convex/ai/registry/gate.ts` hard-blocks any
`irreversible` capability over WhatsApp regardless of what the capability declares —
`if (cap.risk === "irreversible" && channel === "whatsapp") return false;` (verified, I read the file).
The cross-channel parity test (`convex/ai/registry/projectors/crossChannelParity.test.ts`, 7 tests,
verified green) asserts the *same* capability returns the *same* envelope on chat, MCP, and REST.

### 2c. "AI writes into the UI" without blast radius (Dashboard Stage 5, 2026-05-29)

Idea: let the AI render a widget or annotate the dashboard from a chat turn — but **never let it
mutate the canonical, org-wide layout**.

The locked rule (`convex/ai/MODULE.md` decision #15, and `AGENTS.md` decision #26's sibling): "AI
never writes the canonical dashboard layout — only ephemeral cells + annotations." The resolution
chain is `user.preferences.dashboardLayoutOverride` → `org.settings.dashboardLayout` → legacy grid.
The only path that mutates a user's layout is a deliberate human "Pin to my dashboard" gesture
(`SHIPPED.md` 2026-05-29: 3 new tables `ephemeralDashboardCells` TTL'd 24h / `dashboardAnnotations` /
`dealScores`; 32 new tests in `convex/dashboardStage5.test.ts`).

That's the founder-relevant instinct: give the AI room to be useful *without* giving it a lever that
can wreck a shared surface for the whole org. Per-user ephemeral surface = expression without blast
radius.

---

## 3. The hardest problem: the AI v1 → v2 rebuild

This is the centre of the project. It's also where I most have to be honest, because the timing in my
old write-up was wrong.

### The symptom

I was dogfounding the v1 AI (built `2026-05-23..27`, Phase 3 commits `a8251d0` → `ea3354d`). I kept
filing the same *class* of bug against myself. The clearest framing is in `AI-TOOLING-LAYER-PLAN.md`
§0, which I wrote *before* touching any rebuild code — it lists the exact complaints with their root
causes:

| What broke | Root cause in v1 |
|---|---|
| `dueAt` wanted a number, model sent an ISO string | Coercion was opt-in per tool; the AI SDK rejected args *before* `execute`, so no self-correction |
| `entityIds` wanted an array, model sent a string | propose → persist → re-parse in a *separate* commit action: 3 places to drift |
| **~80k tokens per message** | `run.ts` force-loaded **all 17 tool layers every turn** + no prompt caching + 3 extra model calls |
| "Done." with no real summary | the result envelope was optional and inconsistently populated |
| Adding WhatsApp meant rewriting every tool | tools were welded to the chat runtime (module-global ctx, AI-SDK `tool()` shape) |
| "Did we even build it all?" | no single source of truth — correctness lived across ~150 hand-written tool files |

### The structural costs (why patching couldn't win)

The plan names the one root cause: **in v1, the capability layer and the chat layer were the same
layer.** I had spent real time patching symptoms — better validation, better retries, better error
rendering. Each patch added complexity without removing the cause. The four costs I wrote down before
deleting anything:

1. Two Zod schemas per tool (propose + commit) that had to stay in sync forever.
2. Per-user approvals that couldn't model org-level autonomy or an actor-less channel like WhatsApp.
3. A streaming loop that mixed approval state, retry budget, and stop conditions in one function
   (`streamLoop.ts` — **1115 lines**, verified by the deletion diff).
4. Friendly error envelopes layered on top of thrown exceptions, so the same error rendered three
   different ways depending on which layer caught it.

These weren't bugs. They were the architecture.

### The decision and the result

I reversed a previously *locked* decision to do it — `AGENTS.md` decision #26 notes I "reopened the
2026-05-24 hard-locked-categories model on 2026-06-03." Reversing your own locked decision in writing,
with the reason, is the move I'm proudest of here.

The rebuild shipped as stages **S0–S17, dated `2026-06-03 → 2026-06-05` in `SHIPPED.md`** (~3 days of
intense work, *not* the "2 weeks" my old doc claimed — the broader AI arc from v1 to post-rebuild
hardening was ~2 weeks, but the registry rewrite itself was 3 days). It landed in git as the squashed
commit `899b071` "V2 Upgraded" (2026-06-06): **344 files changed, +53,284 / −32,038 lines, 201 files
under `convex/ai/`** (verified via `git show --stat`).

The **side-by-side deletion** is the part most rebuilds never finish. In that one commit I deleted
**144 files**, including the entire v1 layer (verified in the deletion diff):

- `convex/ai/toolRegistry.ts` (845 lines)
- `convex/ai/orchestrator/streamLoop.ts` (1115 lines)
- `convex/ai/orchestrator/resume.ts` (406) + `friendlyToolError.ts` (483)
- `convex/ai/tools/layers/*` (15 files — `pipelines.ts` 1199, `settings.ts` 650, `members.ts` 513, `bulk.ts` 747, …)
- `convex/ai/subagents/*` (the 5-subagent router)

No `*_V2` flag, no parallel folders. The rule that made this finishable is `AGENTS.md` "side-by-side
cleanup": when a stage ports a domain, the v1 code for that domain dies in the *same* edit. The cost
was real and I documented it (`AI-TOOLING-BUILD-STAGES.md` PART 1): "Domains not yet ported are
temporarily unreachable from chat… That regression is the cost of refusing the side-by-side defer;
it's the right cost."

### Before / after

```
v1 (capability layer == chat layer)                v2 (three separated concerns)

 chat runtime                                       LAYER 3  channel adapters
   ├─ 17 tool layers, ALL loaded every turn           chat · autonomous · WhatsApp · MCP · REST
   ├─ propose schema  ─┐ drift                         (each authenticates a Principal, projects)
   ├─ commit schema   ─┘                                       │
   ├─ per-user approvals (no actor on WhatsApp)       LAYER 2  one agent host (channel-agnostic)
   ├─ streamLoop.ts (1115 lines, mixed state)           progressive disclosure (prepareStep)
   └─ ~80k tokens/turn, ~150 hand-written tools         cached stable prefix → cheaper input
                                                                │
   adding a channel = rewrite the tool layer         LAYER 1  capability registry (one SoT)
                                                        127 capabilities, each: schema(+coercion),
                                                        permission, risk, channels[], run()
                                                        runCapability() = ONE execution path
```

The v2 execution path is `convex/ai/registry/wrapper.ts::runCapability` — a **7-step pipeline that
never throws** (verified by reading it): coerce+strict-parse → resolve refs → RBAC → channel gate →
risk/2FA gate → run → audit. Every failure becomes one of **10 typed outcomes** (`ok`, `partial`,
`needs_repair`, `not_found`, `ambiguous`, `denied`, `channel_blocked`, `needs_step_up`,
`business_error`, `infra_retry` — `convex/ai/registry/types.ts`). A bad argument comes back as a
`repair` envelope the model self-corrects from on the next step, instead of a thrown exception that
renders three different ways.

**What the decision bought me:** four delivery surfaces (chat, WhatsApp in/out, MCP, REST) plus the
autonomous engine over *one* path; the entire bug class above became architecturally impossible; and
adding a capability is now one file in a `capabilities.ts` next to the mutation it wraps.

### The meta-skill

Recognising I was in a failure loop — three patches against the same bug class — and *stopping*. I
then turned that into a written rule so I don't have to re-derive it: `AGENTS.md` behavioural rule #5
("Acknowledge wrong direction — redirect, don't comply silently"), which `SHIPPED.md` records me
adding on 2026-06-06 and which explicitly "trumps default-to-action when the user's premise is wrong."

---

## 4. How I directed AI to build this (without shipping slop)

I built this with AI agents doing the typing. The leverage came from the operating system I worked
under, not from the model. Evidence of the *how*, not just the *what*:

- **Decisions are written before code.** `AGENTS.md` holds 28 locked architectural decisions, each
  with the date and what was settled (e.g. #26 even records the date I *reversed* it). The rule:
  before locking a new decision, write the alternative you're rejecting. Re-deciding a settled thing
  three weeks later costs half a day; writing it down once costs two minutes.

- **Three docs do three different jobs, and I kept them honest.** `PENDING.md` (what's left, with
  acceptance criteria), `SHIPPED.md` (dated one-line-per-scope changelog — the project heartbeat),
  `Future-Enhancements.md` (deferrals *with the reason* they were deferred). `AGENTS.md` RULE 0 makes
  updating them part of "done." The discipline is visible: 80 commits, but `SHIPPED.md` records far
  more granular scopes because not every ship is its own commit.

- **The build was staged and self-contained.** `AI-TOOLING-BUILD-STAGES.md` is written so "you can
  clear the session and paste one prompt to run that stage start to finish." That's how you direct an
  agent across a context window: each stage carries its own keep-list, delete-list, and reuse-list so
  a fresh session can't delete the wrong thing.

- **Per-module memory.** 50 `MODULE.md` files (verified) mean an agent (or future-me) recovers the
  context for any subsystem in one read. `convex/_arch.md` maps the backend; `convex/ai/MODULE.md`
  carries the v1→v2 narrative and the V8/Node runtime rules.

- **I correct the agent (and my own prior turns).** Rule #5 above is applied to my own work: when a
  previous turn went sideways, name it before continuing. The `bulk_create_entities` fix on
  2026-06-07 is a literal example — the AI had been retrying a successful op and creating duplicates;
  the fix wasn't more retries, it was a written "STOP rule" in the tool's playbook.

- **A hard rule against training-data guesses.** `AGENTS.md` "ABSOLUTE RULE, NO TRAINING DATA":
  patterns come from docs/MCP/web with citations, not memory. The flip side I'll own: a chunk of week
  3 went into making weak free models behave (validator coercions, repair envelopes) — some of that
  was real engineering, some was me refusing to accept a 7B model's ceiling (`CASE-STUDY.md`, "What
  I'd do differently").

---

## 5. Production ownership: what broke and how I kept it fixed

I had no users, so I was the on-call. The pattern that repeats in `SHIPPED.md`: a dogfooding session
surfaces a failure, I find the *root cause* (not the symptom), fix it, and add a regression test or a
written rule so it stays fixed. A representative set, all cited:

- **Multi-provider failover was built but never actually wired (2026-06-05).** Gemini 3.5 Flash 429'd
  on free-tier quota and the user got a blank assistant message. The failover *resolver* shipped on
  2026-05-25, but the orchestrator "only ever ran the primary" (`SHIPPED.md`, closing
  `Future-Enhancements §B.19`). Two coupled fixes: capture AI-SDK `onError` (the SDK is
  secure-by-default and routes stream errors to a callback, not a throw), and loop
  `resolveFallbackChain()` (primary → up to 2 cross-family providers) with a per-attempt buffer so a
  failed provider's bytes never leak into the next. This is the honest kind of bug: the feature
  "existed" and still didn't work end-to-end until I drove a real failure through it.

- **AI created 24 rows when asked for 5 (2026-06-07).** `bulk_create_entities` failed its first two
  tries (a placeholder `assignedTo:"member-1"` and a `status` field the validator rejected), then on
  success the model *looped* and created 8 Alice / 5 Carla duplicates while stacking 2FA prompts. The
  fix had three coupled parts: a validator pre-filter + Convex-ID shape gate, a clean `ok` headline,
  and a written "STOP rule" so a small model stops reading warnings as a retry signal — plus 3
  regression-pin tests (`convex/crm/shared/bulk/capabilities.test.ts`).

- **Cross-org URL probing (2026-05-30, security).** A signed-in user could load *any* workspace's URL
  and see the dashboard chrome render. Fix: a membership gate in the server layout
  (`app/[locale]/(private)/[orgSlug]/layout.tsx`) that `notFound()`s when the slug isn't in the
  caller's own org list — and returns an identical response whether the org doesn't exist or the user
  just isn't a member, so an attacker can't probe for valid slugs.

- **Logout crashed with React #310 (2026-05-30).** Calling `redirect()` from a client component
  mid-render during sign-out changed the hook count and crashed the production build. Fix: effect-based
  `router.replace()` + a stable placeholder so hook count is identical pre/post sign-out. Same batch
  added Google/GitHub email-based account linking and signup OTP verification.

- **`describe_workspace` returned empty `{}` for every stage (2026-06-06).** The projection read
  `s.key`/`s.label` but the schema uses `id`/`code`/`name`, so the model could see "7 stages" but
  couldn't pick one — `move_stage` was impossible. A one-field schema mismatch with a big behavioural
  blast radius.

- **`MAX_STEPS` was clipping multi-step turns (2026-06-06).** Progressive disclosure eats 4–6 steps on
  `describe_workspace`/`describe_entity` before the first real action; the budget was 10, below the AI
  SDK's own default of 20. Bumped to 25 with a header comment doing the math, while a separate
  `RETRY_BUDGET=2` still bounds stuck loops.

- **Sentry hardened for real production (2026-05-30).** Noise filters (`ResizeObserver`, hydration,
  `NEXT_REDIRECT`/`NEXT_NOT_FOUND`), session replay behind env-gated sample rates with
  mask-all-by-default, and per-tenant context binding (`Sentry.setUser` + `orgId` tag) so "is this 1
  user × 500 errors or 500 users × 1 error?" is answerable.

The throughline: I fix the layer the bug actually lives in, and I leave behind either a test or a
written rule. The "AI summary delivery guarantee" ship (2026-06-06) is the cleanest example — the
architectural fix was making the result envelope *type-required* (`headline` can't be empty); the
follow-up added a deterministic host-side fallback for weak models that emit no prose, with 7 unit
tests.

---

## 6. Architecture overview (kept short)

```
                         ┌───────────────────────────────────────────────┐
  chat · autonomous ·    │  one agent host  (convex/ai/runtime/host.ts)   │
  WhatsApp · MCP · REST →│  progressive disclosure · cached prefix        │
       (channels)        └───────────────────────┬───────────────────────┘
                                                 │ runCapability() — ONE path, never throws
                         ┌───────────────────────▼───────────────────────┐
                         │  capability registry  (127 capabilities)       │
                         │  each: schema(+coercion) · permission · risk    │
                         │        · channels[] · run()                     │
                         └───────────────────────┬───────────────────────┘
                                                 │ calls the canonical *Impl mutation
                         ┌───────────────────────▼───────────────────────┐
                         │  Convex backend · 60 tables · 7-step mutation   │
                         │  pattern · RBAC catalog SSOT · soft-delete      │
                         └─────────────────────────────────────────────────┘
```

- **Multi-tenancy.** Every org is an isolated workspace; every query is org-scoped by index;
  `.collect()` is banned on org tables that can grow (`convex/_arch.md`). Onboarding picks an industry
  → a template seeds pipeline + fields + dashboard + sample data in <2 min.
- **RBAC as a single source of truth.** `convex/_shared/permissions/catalog.ts` (decision #13): add a
  permission once and it auto-derives into the seeder, runtime checks, the role-editor UI, and tests.
  Row-level visibility is one capability, `records.viewAll`, gated per role (decision #28).
- **Autonomy gates.** Capabilities carry a risk tier. `safe`/`reversible` auto-execute; `irreversible`
  (bulk delete, settings/schema, members/roles) returns `needs_step_up`, the user confirms with 2FA, a
  single-use token re-runs the same call, and **WhatsApp is hard-blocked from irreversible regardless
  of policy** (`convex/ai/registry/gate.ts`, verified). Autonomy moved from per-user approvals to one
  `org.settings.aiAutonomy` policy. Capabilities are gated by
  `active modules ∩ user permissions ∩ channel allow-list` — toggling a module off in settings
  disables both the capability *and* its prompt context from one switch.
- **The reactive seam.** Convex makes reactivity a property of the data layer. AI streaming reuses it:
  `messages.sendMessage` (mutation) inserts an empty assistant placeholder and schedules
  `processChat.run` (Node action), which patches the row progressively; the UI re-renders on every
  patch with no WebSocket plumbing (`convex/ai/MODULE.md` decisions #1–#2).
- **Runtime discipline.** Every file in `convex/ai/` runs in exactly one Convex runtime (V8 vs Node);
  pairs like `keys.ts` ↔ `keysActions.ts` cross the boundary only via `ctx.runQuery`/`runMutation`.
  BYOK keys are AES-GCM encrypted in a Node action — plaintext never reaches the DB.

Stack (verified in `package.json`): Next.js 16.2.7 / React 19, Convex 1.40, Vercel AI SDK v6, Zod 4,
Tailwind v4 + shadcn/ui, Twilio (WhatsApp), LemonSqueezy (billing), Firecrawl (web), Sentry, PostHog,
Biome, Vitest + convex-test, Playwright, pnpm.

---

## 7. Business-aware decisions

These weren't asked for by a customer — there was none. I made them because I was thinking about the
operator's blast radius and cost-per-token.

- **AI cost control by design.** BYOK (bring-your-own-key, AES-GCM encrypted) is unmetered on every
  plan; the platform key is the metered fallback (`convex/ai/orchestrator/quotaGate.ts`). Morning/
  weekly briefings are **platform-billed only, never BYOK** (`convex/ai/MODULE.md` decision #7) —
  users don't pay for cron-generated work, and the platform's cost is predictable. Free tier hard-caps
  (100 leads / 50 / 5 / 0 credits per `SHIPPED.md` 2026-05-28).
- **Blast-radius thinking is encoded, not hoped for.** WhatsApp can never run an irreversible op;
  irreversible ops require 2FA; delete defaults were flipped to **Owner-only** (`SHIPPED.md`
  2026-06-10) with a migration to tighten existing orgs; the AI writes only per-user ephemeral
  dashboard surfaces, never the org-wide layout.
- **Segmentation as a product lever.** 9 industry templates exist because "AI CRM for B2B sales" is
  too broad to sell — each template seeds a different pipeline, field set, and dashboard
  (real estate, B2B SaaS, recruiting, agencies, freelancers, productivity, + regional variants).
- **A hidden operator panel.** Super-admin lives at an **env-configured slug** (`OWNER_PANEL_SLUG`,
  rewritten to `/xowner`) behind a 5-layer gate including email-OTP with an HMAC cookie
  (`SHIPPED.md` Platform Owner Panel). Tier limits, AI keys, and templates are all DB-driven from
  there, so pricing/limits are operator-editable without a deploy.
- **Billing with grace.** LemonSqueezy webhooks with a trial + 3-day past-due grace window
  (`resolveEffectivePlan()` in `quotaGate.ts`), 12 webhook lifecycle contract tests in
  `convex/billing-webhooks.test.ts`, and a rotation runbook at `docs/runbooks/lemonsqueezy-rotation.md`.

---

## 8. Open questions — things for me to verify before publishing

These are places where the repo contradicts my older write-up, or where a claim isn't fully backed by
code. I'm flagging them rather than silently picking a number.

1. **"4 weeks" timeline.** The commit history spans **2026-03-28 → 2026-06-10** (~10.5 calendar weeks):
   setup late March, a gap, layout late April (`a28adb8` 2026-04-29), Phase 1 done 2026-05-07, Phase 2
   through 2026-05-22, AI Phase 3 through 2026-05-27, dashboard/landing through early June, the v2 AI
   rebuild 2026-06-03→06. "4 weeks" isn't supported by the timestamps. **Decide what to claim** —
   likely "active full-time build across ~6 weeks" or just cite the date range. (My old `CASE-STUDY.md`
   says 4 weeks.)
2. **"2-week rewrite."** The AI v1→v2 registry rebuild is dated **S0–S17, 2026-06-03 → 2026-06-05**
   (~3 days) in `SHIPPED.md` and `AI-TOOLING-BUILD-STAGES.md`. The broader AI arc (v1 build → v2 →
   post-rebuild hardening) is ~2 weeks. I should say "3 days for the registry rewrite" and not conflate
   it with the arc.
3. **Capability count.** Verified **127** distinct `defineCapability` names (0 duplicates). The "~150"
   in older docs is the *V1 hand-written tool* count (`AI-TOOLING-LAYER-PLAN.md` §0) and is also used
   approximately in the v2 `SHIPPED.md` entry. Recommend stating **"127 capabilities (verified)."**
4. **Channel count.** The `Channel` *type* has **4** values (chat/whatsapp/mcp/rest). "Six channels"
   counts chat + autonomous + WhatsApp-inbound + WhatsApp-outbound + MCP + REST, where "autonomous" is a
   `trigger` and WhatsApp splits in/out. **Slack and Cal.com appear in `AI-TOOLING-LAYER-PLAN.md`'s
   adapter diagram but are NOT built** — don't imply they are.
5. **Table count.** Verified **60** `defineTable` declarations across 7 schema files. `convex/_arch.md`
   and `SHIPPED.md`'s footer still say "28 tables" — that figure is stale (dated 2026-05-16, before the
   AI/dashboard/billing tables landed). Use 60 (or recount if some are deprecated).
6. **Locked-decision count.** `AGENTS.md` has **28** numbered decisions (matches `CASE-STUDY.md`), but
   `SHIPPED.md`'s footer says "31 locked decisions." One of these is stale — reconcile.
7. **Razorpay.** Listed as a billing provider in `docs/SYSTEM-DESIGN-COMPACT.md`, but I found no
   implementation (only LemonSqueezy is wired end-to-end with webhooks + tests). Either it's planned or
   the doc is aspirational — drop it from any "shipped" claim unless code exists.
8. **`aiMessages.expandedLayers`.** A persisted schema field left as `v.optional` and never read after
   S17 (`convex/ai/MODULE.md` "Surviving legacy"). Harmless, but it's the one acknowledged v1 remnant —
   mention it if you want the "side-by-side cleanup was total" claim to be airtight.
9. **e2e tests.** I verified the unit/integration suites (1278 backend, 215 frontend) by running them.
   I did **not** run Playwright (`e2e/*.spec.ts` exist — auth/theme/navigation). Don't claim an e2e
   pass count without running `pnpm test:e2e`.
10. **"1,278 backend tests" wording.** The runner reports **1278 passed + 1 skipped (1279 total)**.
    Prefer "1,278 passing (1 skipped)" so the skipped test isn't a surprise to a reviewer who runs it.

---

*Reconstructed by deep-scanning the repo on 2026-06-24. Read order to verify any claim:
`AGENTS.md` → `SHIPPED.md` → `convex/ai/MODULE.md` → `convex/ai/registry/`. Numbers marked "verified"
came from running the command; everything else is cited to a commit, file, or doc.*

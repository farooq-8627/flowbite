# AI Tooling Layer, Redesign Plan (Capability Layer v2)

> **Status:** Proposal for review. No code changed yet.
> **Scope:** Replace the AI **tooling layer** only. Keep the chat layer
> (`messages.ts`, `conversations.ts`, the streaming orchestrator shell,
> `core/ai/` frontend, BYOK keys, models) intact.
> **Author note:** This is written to be the build blueprint once you approve
> the direction. It deliberately reverses locked decision #26 (hard-locked
> approvals), that requires your explicit sign-off (see §9 + §13).

---

## 0. TL;DR (read this first)

We will collapse the current "~150 hand-written AI tools, each with its own
file, schema, coercion, runbook, and propose/commit twin" into **one
Capability Registry** that sits directly on top of the canonical Convex
`*Impl` functions. Every channel (chat, WhatsApp, MCP, REST, Slack, Cal.com)
and every framework talks to that one registry through thin adapters. The AI
loads only the **capabilities relevant to the request** (not all of them every
turn), self-corrects on validation errors, and returns a **structured result
envelope** (what it did + status + errors), never a bare "Done."

The four problems you reported all dissolve because they share one root cause:
**today the capability layer and the chat layer are the same layer.** We are
separating them.

| Your complaint | Root cause today | Fixed by |
|---|---|---|
| `dueAt` wanted number, got ISO string | Coercion is opt-in per tool; no date coercion exists; AI SDK rejects args *before* `execute`, so no retry | Central coercion boundary (§8) + validation-as-tool-result self-correct (§8) |
| `entityIds` wanted array, got string | propose → persist → re-parse in a separate action; 3 places to drift | Single execution path, single schema per capability (§4, §8) |
| ~80k tokens per message | `run.ts` force-loads **all 17 tool layers every turn** + no prompt caching + 3 extra model calls | Progressive disclosure (§7) + cached stable prefix (§7) |
| "Done." with no real summary | Result envelope optional, inconsistently populated | Mandatory result envelope, type-enforced (§8) |
| Adding WhatsApp = rewrite every tool | Tools welded to chat runtime (module-global ctx, AI-SDK `tool()` shape) | Channel adapters over one registry (§10) |
| "Did we even build it all?" | No single source of truth; correctness lives in 150 files | Registry-derived prompt + auto-generated contract tests (§11) |

---

## 1. The mental model (how to think about this)

Stop thinking "an AI tool." Start thinking in **three separated concerns**:

```
┌──────────────────────────────────────────────────────────────────────┐
│  LAYER 3, CHANNEL ADAPTERS  (how a request arrives & who is asking)   │
│                                                                        │
│   Chat panel   WhatsApp webhook   MCP server   REST   Slack   Cal.com  │
│   each one: (a) authenticates a PRINCIPAL (a member),                  │
│             (b) builds the agent context, (c) streams/returns a reply  │
└───────────────────────────────┬────────────────────────────────────────┘
                                ▼
┌──────────────────────────────────────────────────────────────────────┐
│  LAYER 2, AGENT RUNTIME  (the brain; one, channel-agnostic)           │
│                                                                        │
│   • ToolLoopAgent (AI SDK native loop, your own MODULE.md says use it) │
│   • Progressive disclosure: starts with a tiny core set, discovers &    │
│     loads more on demand via prepareStep (per-step active tools)        │
│   • Driving layers assembled here: PROJECT → GROUP → TOOL               │
│   • Stable cached prefix → 90% cheaper input on cache hits              │
│   • Writes every action to ONE audit log                                │
└───────────────────────────────┬────────────────────────────────────────┘
                                ▼
┌──────────────────────────────────────────────────────────────────────┐
│  LAYER 1, CAPABILITY REGISTRY  (the single source of truth)           │
│                                                                        │
│   A capability = { schema(+coercion), module, group, permission,        │
│                    risk, drive(instructions), run(ctx,args)->Result }   │
│   run() calls the EXISTING canonical *Impl mutation/query body.         │
│   ONE projector renders a capability as: AI-SDK tool | MCP tool |        │
│   REST handler | WhatsApp intent. Define once → available everywhere.   │
└──────────────────────────────────────────────────────────────────────┘
```

The capability registry is the only place a "thing the AI can do" is defined.
Everything else is a projection of it.

This is the same pattern production teams converged on: a single
schema-validated control plane (`create_task_impl`) reused across LangChain,
CrewAI, and MCP, "eliminating duplication and drift"
([Scalekit, 2026](https://www.scalekit.com/blog/unified-tool-calling-architecture-langchain-crewai-mcp)).
You already have the foundation for it: the `*Impl` / `*ForAI` convention in
`AGENTS.md`. We are formalizing it into a registry.

---

## 2. The atomic unit: a Capability

A capability is a plain object. No AI-SDK types, no chat coupling. Illustrative
shape (final types decided at build time):

```ts
type Capability = {
  name: "create_task";                 // stable id, used by every channel
  module: "tasks";                      // which CRM module owns it (gating, §5)
  group: "scheduling";                  // tool-set grouping (routing, §7)
  permission: "tasks.create" | null;    // RBAC key (§9)
  risk: "safe" | "reversible" | "irreversible"; // autonomy policy (§9)

  // The model-facing contract. Built from a structured spec, NOT free text.
  spec: {
    whenToCall: string;
    whenNotToCall?: string;
    requiredClarifications?: string[];   // ask the user, never guess
    goodExample: object;
    badExample?: { args: object; why: string };
  };

  // INPUT schema. Every field goes through the central coercion helpers (§8).
  // Dates accept epoch | ISO | natural language. Arrays accept array | CSV | JSON.
  input: ZodSchema;

  // TOOL-LEVEL DRIVING LAYER (§6): how to behave in every outcome.
  drive: {
    onSuccess: string;
    onValidationError?: string;
    onEmpty?: string;
    onPartial?: string;
    onDenied?: string;
    suggestNext?: string;
  };

  // The single execution path. Calls the canonical *Impl body.
  // MUST return a structured envelope (§8), the type forbids "return 'done'".
  run: (ctx: CapabilityCtx, args: Infer<input>) => Promise<CapabilityResult>;
};
```

Key differences from today's `ToolDef`:

1. **No `tool()` wrapping, no module-global `_toolCtx`.** `ctx` is passed in by
   the runtime explicitly. That alone makes it reusable by WhatsApp/MCP.
2. **One schema, one execution path.** No propose schema + commit schema +
   persisted-payload re-parse. (Confirmation, when wanted, is a runtime
   concern driven by `risk`, not a second schema, §9.)
3. **Coercion is not optional.** It is built into the shared field helpers
   every capability uses. A tool author *cannot* forget it.
4. **`run` must return a `CapabilityResult`.** The type system rejects a bare
   string. No more "Done." with no detail.

---

## 3. Where capabilities live (co-located with the backend, your idea, refined)

You proposed building the tool for each backend call directly in the Convex
backend folder, then layering groups + proactiveness on top. That is the right
instinct. Concretely:

```
convex/
  crm/entities/leads/
    mutations.ts        ← createImpl / create (public) / createForAI  (EXISTS)
    capabilities.ts     ← NEW: defineCapability("create_lead", { run: createImpl })
  crm/shared/tasks/
    mutations.ts        ← createImpl (EXISTS)
    capabilities.ts     ← NEW: create_task, complete_task, ...
  ...
  ai/registry/
    index.ts            ← collects every capabilities.ts into ONE registry
    groups.ts           ← group definitions + GROUP driving layers (§6)
    project-drive.ts    ← the PROJECT driving layer (§6)
    coerce.ts           ← central LLM-arg coercion (§8)
    result.ts           ← CapabilityResult envelope + helpers (§8)
    projectors/
      aiSdk.ts          ← capability → AI SDK tool
      mcp.ts            ← capability → MCP tool
      rest.ts           ← capability → REST handler
```

Why co-locate `capabilities.ts` next to `mutations.ts`? Because the capability
is a thin declaration that wraps the `*Impl` that already lives there. When a
backend function changes, its capability is right next to it, no drift, no
hunting through `convex/ai/tools/`. This directly satisfies your "build the
tool for each backend call" requirement while keeping the registry centralized.

---

## 4. The execution path (one path, not three)

Today (broken): model → AI SDK validates → `propose()` returns a payload →
persisted → user approves → **separate `resume` action** re-parses through a
**different** commit schema → executes. Three boundaries, three chances to drift.

New (one path):

```
model emits args
  → runtime calls capability.run via a single wrapper:
       1. coerce + parse args (central schema)            ← repairs ISO dates, CSV arrays
       2. on parse failure → return RepairError (§8)      ← model self-corrects next step
       3. RBAC check (principal.permissions ∋ permission) ← defense in depth
       4. risk gate (autonomy policy, §9)                 ← auto / rate-limit / confirm
       5. run *Impl                                       ← the real DB write
       6. return CapabilityResult envelope                ← what changed + status + errors
```

For "irreversible" capabilities that you still want a human pause on, the gate
in step 4 pauses once and resumes the *same* path with the *same* schema, not a
separate commit tool. There is no second schema to drift.

---

## 5. Module-awareness, the part that makes this future-proof

This is the requirement that matters most for "later I may build productivity
tools / freelancer tools / turn pipelines off." We solve it with a **Module
Registry** that gates **both** capabilities **and** prompt context from one
switch.

```ts
// convex/ai/registry/modules.ts
type ModuleDef = {
  key: "pipelines" | "companies" | "deals" | "tasks" | ...;
  isEnabled: (org) => boolean;          // reads org.settings / feature flags
  contextProvider?: (ctx) => string;    // the prompt context this module adds
};
```

Every capability declares `module: "pipelines"`. Every system-prompt context
block is also tagged with a module. The runtime computes the **active module
set** once per request:

```
activeModules = ModuleRegistry.filter(m => m.isEnabled(org))
availableCapabilities = Registry.filter(c =>
     activeModules.has(c.module)          // module on?
  && principal.can(c.permission)          // RBAC?
  && channel.allows(c.risk))              // channel trust?
promptContext = activeModules.flatMap(m => m.contextProvider(ctx))
```

Consequences, exactly as you asked:

- **Turn pipelines off** → `pipelines.isEnabled === false` → every
  `*_pipeline_*` capability disappears from the model's view **and** the
  pipeline context (stages, etc.) disappears from the prompt. The AI literally
  cannot see or mention pipelines. One switch.
- **Pivot to productivity tooling for a customer with no "companies"** → the
  `companies` module is off for that org → no company tools, no company context.
- **A freelancer workspace** that only has tasks + contacts → the AI's entire
  worldview is tasks + contacts. No dead tools, no hallucinated capabilities.

The AI's competence always equals exactly what the workspace actually has,
because both its tools and its knowledge are derived from the same active-module
set. This is impossible in the current design, where the system prompt is
hand-assembled and tools are force-loaded regardless of what's enabled.

---

## 6. The three-tier "driving layer" (your term, formalized)

You want: a project-level driving layer, a per-group driving layer, and a
per-tool driving layer. This maps cleanly onto **layered prompt assembly**, and
it is *also* what fixes tokens (you only ship the layers that are active).

```
SYSTEM PROMPT (assembled per request, but the top is STABLE → cacheable)

  ── PROJECT DRIVE ────────────────────────────  (constant, cached)
     Global doctrine for ALL capabilities:
       • How to behave (act, don't just answer; never invent codes)
       • Output contract (always produce a result envelope narration)
       • Retry policy (read RepairError; fix args; never repeat identical call)
       • Autonomy policy (you may execute RBAC-allowed actions directly)
       • Safety (never expose other orgs' data; respect `sensitive` fields)

  ── ACTIVE MODULE CONTEXT ───────────────────── (per org, semi-stable)
     Only enabled modules' context (entity labels, pipelines, fields …)

  ── GROUP DRIVE (only for activated groups) ───  (loaded on demand)
     e.g. group "scheduling":
       • Dates: resolve relative dates to the workspace timezone.
       • followup type REQUIRES a personCode; resolve via search first.

  ── TOOL DRIVE (only for in-scope tools) ──────  (loaded on demand)
     e.g. create_task.drive.onValidationError, .onSuccess, .suggestNext …

  ── PER-REQUEST TAIL ─────────────────────────  (dynamic, never cached)
     Route/page context, conversation facts, the user's message
```

Why three tiers and not one giant prompt:

- **Token cost scales with what's active**, not with the registry size. Today
  every tool's runbook is emitted because every layer is force-loaded. Here, a
  "create a follow-up" request loads PROJECT + scheduling GROUP + the 2–3 tools
  in scope. That's a few hundred tokens of driving guidance, not thousands.
- **Behavior is consistent and centralized.** Edge-case handling that applies
  to everything (retry, output format) lives in PROJECT and is written once.
  You are not "updating prompts for each and every tool", you write the
  cross-cutting behavior once at PROJECT, the domain behavior once per GROUP,
  and only genuinely tool-specific quirks at TOOL.
- **The stable top is cacheable.** PROJECT + the tool *catalog* (names +
  one-line specs) form a stable prefix → Anthropic prompt caching bills cached
  input at ~10% ([Anthropic](https://www.anthropic.com/news/prompt-caching)),
  OpenAI auto-caches at 50%.

---

## 7. Progressive disclosure, the "top layer that picks the tool set"

You described it exactly: *"a top layer that has every tool call in sets and
based on the request it calls a specific tool instead of taking full data or
tools every time."* This is the documented industry fix for the 80k-token
problem (Anthropic Tool Search; solo.io progressive disclosure;
[Anthropic advanced tool use](https://www.anthropic.com/engineering/advanced-tool-use)).

The runtime exposes a **small always-on core** + a **discovery tool**, and grows
the active set per step using the AI SDK's `prepareStep` (verified: Loop Control
lets you change settings/active tools each step). This is precisely the
constraint `run.ts` could not satisfy today (it calls `streamText` once with a
frozen dict, so it brute-forced "load everything").

```
Turn starts. Active tools = CORE:
   • search_crm            (find people/deals/companies by name/code)
   • get_context           (full detail for one record)
   • discover_capabilities (returns capability specs matching a query/group)
   • the 3 proactive reads (next_actions / stale / anomalies)
   • ask_user              (clarify)

Model: user wants to "follow up with P-007 next Tuesday and update their budget"
   → calls discover_capabilities({ groups: ["scheduling","people"] })
   → runtime injects create_task + update_entity into the NEXT step's active set
     AND injects their GROUP + TOOL driving layers into context
   → model calls create_task + update_entity with correct args
```

Two routing inputs make this cheap and reliable:

1. **Deterministic preload from context.** If the WhatsApp thread / page is
   about a deal, preload the `deals` + `scheduling` groups before the first
   step. (Replaces today's weak "subagent router", but it *selects groups*,
   not a single persona, and it never *hides* a tool the user needs because
   `discover_capabilities` is always available as the escape hatch.)
2. **On-demand discovery** for everything else.

Token math (rough, to set expectations):

| | Today | v2 (typical turn) |
|---|---|---|
| Tool schemas in prompt | ~24k (all 17 layers) | ~2–4k (core + 1 group) |
| Driving guidance | all runbooks | PROJECT + 1 group + few tools |
| System/org context | full, rebuilt, uncached | active modules only, cached prefix |
| Extra model calls/turn | router + suggestions + title | 0–1 (suggestions optional) |
| **Net** | **~80k** | **~8–15k, most of it cached** |

---

## 8. "Doable without errors", the correctness machine

You don't want to babysit each tool's prompt and pray. So correctness must be
**structural**, guaranteed by the architecture, not by per-tool effort. Four
mechanisms:

### 8.1 Central coercion boundary (kills the bug class)
One set of field builders every capability uses. The model's sloppiness is
normalized *before* validation:

- `coerceTimestamp()`, accepts epoch ms, ISO string (`"2024-06-05T09:00Z"`),
  and natural language (`"next Tuesday"`, `"in 3 days"`) → epoch ms in the
  workspace timezone. **This is the fix for `dueAt`.** (Your own
  `core/inbox/ai/MODULE.md` already specified this with `resolveNaturalLanguageDate`
 , the implementation just never adopted it.)
- `coerceStringArray()`, array | CSV | JSON-string → array. (Fixes `entityIds`.)
- `coerceInt()`, null/empty-string stripping, already exist; now applied everywhere.

Because these live in the shared builders, **a new capability is correct by
default**. You cannot ship a date field that rejects ISO strings.

### 8.2 Validation-as-tool-result → real self-correction (your retry idea)
You observed: the AI said it needed a number, you pasted the error back, and it
worked, so why can't it self-correct? Because today the **AI SDK rejects the
args before `execute` runs**, throwing `TypeValidationError` out of band. The
model never receives a usable error inside the loop, so it can't retry.

Fix: the SDK-facing schema is **permissive** (accepts loose JSON). Strict
validation + coercion happens **inside** the capability wrapper. On failure it
returns a structured `RepairError` *as the tool result*:

```jsonc
{ "status": "needs_repair",
  "field": "dueAt",
  "expected": "timestamp (epoch ms, ISO date, or natural language)",
  "received": "\"2024-06-05T09:00:00.000Z\" (string)",
  "fix": "Pass dueAt as 1717578000000 or \"2024-06-05\".",
  "example": { "type": "followup", "personCode": "P-007", "dueAt": "2024-06-05" } }
```

The agent reads that and retries correctly on the next step, automatically, no
human pasting the error. Bounded by a retry budget (e.g. 2) so it can't loop
(the Microsoft "self-healing agent" guidance:
[LLMOps best practices](https://techcommunity.microsoft.com/blog/appsonazureblog/turn-your-app-service-web-app-into-a-self-healing-agent-llmops-best-practices-fo/4520867)).
With 8.1 in place, this path rarely even triggers, it's the safety net.

### 8.3 Mandatory result envelope (kills "Done.")
`run` must return:

```ts
type CapabilityResult = {
  status: "ok" | "partial" | "failed" | "needs_repair";
  headline: string;                       // "Created T-021: Follow-up call with P-007"
  changes?: { label: string; value: string }[];   // every field actually written
  facts?: string[];                       // observations
  errors?: { item: string; reason: string }[];     // per-row failures for bulk
  suggestedNext?: { label: string; intent: string }[];
};
```

The PROJECT driving layer instructs the model to narrate this envelope. Because
the **type forbids returning a bare string**, no capability can silently say
"Done." The "for some it works, for some it says done" inconsistency becomes
structurally impossible.

### 8.4 Registry-derived correctness (no per-tool manual QA)
Because every capability is a uniform object, we generate, from the registry
itself:

- **Contract tests**: for every capability, assert (a) schema accepts its own
  `goodExample`, (b) schema repairs common LLM mistakes (ISO date, CSV array),
  (c) `run` returns a valid envelope, (d) RBAC denies without the permission.
  Add a capability → tests exist automatically. You are not writing 150 test
  files by hand.
- **Prompt** : the tool catalog is generated from the registry, so the model's
  list of capabilities can never drift from what actually exists. No more "did
  we wire this one up?"
- **An audit/coverage report**: "120 capabilities, 120 with driving layers, 118
  with examples, 3 missing `whenNotToCall`." One command tells you whether the
  layer is complete, answering your "we don't have full confirmation whether
  we built this completely."

---

## 9. Autonomy + RBAC + channel trust (members act, customers don't)

Your rule: **tools work only for our agents/members, by their role. A lead or
customer never triggers a tool.** The model that enforces this cleanly:

### 9.1 The Principal is always a member
Every agent run carries a `principal` = a member with a permission set. Channel
adapters resolve it; the **customer's message is content, never authority**:

| Channel | Principal | Inbound customer text is… |
|---|---|---|
| Chat panel | the logged-in member (as today) | n/a (member is typing) |
| WhatsApp | the member who owns that thread/number | **data to act on**, not a commander |
| MCP / REST | the member who owns the API token | data |

So when a lead messages your agent on WhatsApp and the **agent** says *"create a
lead for this person and set a follow-up Tuesday"*, the principal is the
agent, the lead's details are extracted from the thread, and `create_lead` +
`create_task` run with the **agent's** RBAC. *"For P-007 update these details"*
→ `update_entity` runs as the agent. Exactly your scenario.

**Unknown sender (not mapped to a member) → no principal → the agent may read /
extract / suggest, but can execute nothing.** This closes the obvious hole
(anonymous WhatsApp number triggering CRM writes). This is the one security
guardrail I strongly recommend keeping even in "no approvals" mode.

### 9.2 RBAC is the only gate on *what* (capability availability + execution)
- A capability is only shown to the model if `principal.can(c.permission)`
  (zero tokens spent on forbidden tools, your Layer-3 security rule).
- `run` re-checks the permission (defense in depth, already your pattern via
  `requireOrgMemberByIds`).
- Whatever the member can do in the UI, the AI can do for them, no more, no
  less. A viewer's AI can't write. An admin's AI can.

### 9.3 Autonomy replaces approval cards with risk tiers + audit
You want no propose/commit, no 2FA. We replace the approval gate with a
per-capability `risk` and a per-channel policy:

| risk | examples | default autonomy |
|---|---|---|
| `safe` | search, read, list, draft | always auto |
| `reversible` | create lead/task, update field, add note, convert lead, **soft-delete** (30-day trash exists) | **auto-execute** (no confirmation) |
| `irreversible` | bulk delete, settings/schema edits, member/role changes | **auto, but rate-limited + always audited** (optional one-tap confirm per org policy) |

Everything is written to **one audit feed** (`actorType: "ai"`, the principal,
the capability, args, result, channel, `source`), the "log somewhere we can
plan" you asked for. Because reversible writes dominate real WhatsApp/call
intents and soft-delete already gives you a 30-day undo, this delivers the "it
just does it" feel without leaving the workspace writable by anonymous inbound
messages.

> ⚠️ **This reverses locked decision #26** (bulk/settings/members hard-locked to
> always confirm) and the `ai-automation/MODULE.md` "Suggest, Never Execute"
> rule. Per your own `AGENTS.md` process, flipping these needs (a) your explicit
> approval to reopen the locked decision and (b) a `Future-Enhancements.md`
> deferral card recording why and how to re-tighten. I will not flip them
> silently.

---

## 10. One registry, every channel (no duplication, ever)

Adding WhatsApp / Slack / Cal.com / MCP becomes **writing an adapter**, never
re-tooling functions:

```
Capability Registry (define once)
   │
   ├─ projectors/aiSdk.ts   → tools for the chat ToolLoopAgent
   ├─ projectors/mcp.ts     → exposes capabilities as MCP tools  ← external agents act on CRM
   ├─ projectors/rest.ts    → REST endpoints
   │
   └─ adapters (entrypoints):
        chat       (exists)         → principal = logged-in member
        whatsapp   (new, http.ts)   → verify signature → resolve member → run agent
        slack      (new)            → same shape
        mcp-server (new, http.ts)   → API-token principal → MCP projector
```

- **MCP**: because we project the same registry to MCP, external agents (or a
  customer's own LLM) can operate the CRM "without entering it", and MCP is now
  the settled standard (Linux Foundation Agentic AI Foundation, Dec 2025;
  AI SDK has native MCP support).
- **Inbound vs outbound**: capabilities act on *our* CRM. **Connectors**
  (Cal.com booking, Slack post, send WhatsApp) act on *external* systems. We
  model connectors as capabilities too (same envelope, same RBAC, `risk:
  reversible/irreversible`), so the agent calls "book a Cal.com slot" exactly
  like any other capability. One uniform surface.
- The `source` field on canonical mutations (`whatsapp | mcp | slack | …`)
  stays, it's already the right audit primitive.

---

## 11. How this guarantees "everything the user asks is doable"

Not by testing 150 tools by hand, but by construction:

1. **Coverage = registry.** If a backend `*Impl` exists and is exposed as a
   capability, the AI can do it. The audit report (§8.4) lists exactly which
   backend functions have capabilities and which don't, so "is it complete?"
   is a generated answer, not a guess.
2. **Correctness = central coercion + envelope + generated contract tests.** A
   new capability is correct by default and tested automatically.
3. **Behavior = three-tier driving layer.** Cross-cutting behavior written
   once; you don't touch every tool.
4. **Relevance = progressive disclosure.** The model always has the right tools
   for the request, discovered on demand, so it doesn't fail by "not knowing"
   a tool exists.
5. **Adaptivity = module-awareness.** The AI's competence always matches the
   workspace's actual modules.

---

## 12. What we keep, delete, and build

**Keep (chat layer, works):**
`convex/ai/messages.ts`, `conversations.ts`, the streaming orchestrator shell
(`run.ts`/`streamLoop.ts` reduced to a thin ToolLoopAgent host), `models.ts`,
`keys*.ts`, BYOK, `core/ai/` frontend, the result/preview React components.

**Delete / retire (current tooling):**
`convex/ai/toolRegistry.ts` (replaced by the registry), the per-tool files under
`convex/ai/tools/**` (logic folds into co-located `capabilities.ts` wrapping
existing `*Impl`), the propose/commit/resume confirmation machinery
(`resume.ts` two-step path, `twoStepSchemaAudit.ts`, propose-only schemas), the
force-expand-all-layers block in `run.ts`, the bespoke subagent router (replaced
by group routing).

**Build:**
`convex/ai/registry/*` (registry, groups, project-drive, coerce, result,
projectors), `capabilities.ts` beside each backend module, the ToolLoopAgent
host, `discover_capabilities` + `search_crm` core tools, channel adapters
(WhatsApp first), the audit feed, the generated contract-test + coverage harness.

---

## 13. Phased execution (proposed)

| Phase | Deliverable | Why first |
|---|---|---|
| **0** | This doc approved + decision #26 reopening confirmed + `Future-Enhancements.md` card | Unblocks autonomy work without violating your own rules |
| **1** | Registry core: `Capability` type, central `coerce.ts`, `CapabilityResult`, projector to AI-SDK, ToolLoopAgent host with `prepareStep` discovery. Port **5 capabilities** (create_lead, create_task, update_entity, search_crm, bulk_delete) end-to-end. | Proves the model + kills your 2 reported bugs immediately |
| **2** | Module registry + module-gated capabilities & context. Three-tier driving layers. Prompt caching + token measurement (target <15k). | Delivers token fix + future-proofing |
| **3** | Port remaining capabilities module-by-module; generate contract tests + coverage report. | Completeness, mechanically verified |
| **4** | WhatsApp adapter (principal resolution + signature verify + audit). | Your #1 requirement |
| **5** | MCP projector + REST; Slack / Cal.com connectors. | "Works for any integration" |

Each phase is shippable and reversible. Phase 1 alone fixes `dueAt` + `entityIds`
+ "Done." for the ported tools, so you see the payoff before the big port.

---

## 14. Decisions, RESOLVED (2026-06-03)

| # | Decision | Resolution |
|---|---|---|
| 1 | Autonomy default | **Auto-execute** everything `safe`/`reversible` (create, update, follow-up, note, convert, soft-delete) with zero confirmation. **Destructive/protected** (`irreversible`: bulk/hard delete, settings/schema, members/roles) → **RBAC + step-up 2FA (confirm twice) + channel allow-list**, never auto. |
| 2 | Reopen locked decision #26 | **Yes, reopen.** Replaced by the risk-tier + 2FA + channel model (§B5). A `Future-Enhancements.md` card will record the change. |
| 3 | WhatsApp identity binding | **Per-agent** (per-role) via Twilio. Each agent has their own number; inbound resolves that agent as the principal. No shared-number multi-member threads. |
| 4 | Auto-extraction from conversation | **On by default** (per-org toggle). The AI autonomously creates leads (with dedup), fills fields, creates follow-ups, writes notes, advances deals from the conversation, without being told. Asks the agent only when a required field is missing/ambiguous. |
| 5 | RBAC | **Use the existing multi-agent RBAC as-is** (permission catalog + `requireOrgMemberByIds`). The AI's power per agent = that agent's permissions. Not reinvented. |
| 6 | Field schema | **Schema is data the AI queries**, not prompt text. `describe_entity` returns live fields/types/labels on demand; create/update validate values **server-side against live `fieldDefinitions`** and return per-field repair hints. |

---

# PART B, Old vs New, Execution Flows, and the Correctness Machine (2026-06-03)

This part answers, concretely: how every request and every error is handled in
the new structure vs today, why it's production-ready, and how autonomy works.

## B1. Old vs New, side by side, per concern

| Concern | OLD (today) | NEW (v2) |
|---|---|---|
| **Tool definition** | ~150 hand-written files in `convex/ai/tools/**`, each its own schema + runbook + propose/commit twin | One `defineCapability()` per backend function, co-located in `capabilities.ts` next to its `*Impl` |
| **Tool exposure** | `run.ts` force-loads **all 17 layers every turn** (~24k tokens) | Adaptive router preloads **only the request's group(s)**; long tail via `discover_capabilities`; per-step growth via `prepareStep` |
| **Field/type knowledge** | Whole org schema stuffed into the system prompt every turn (stale + huge) | AI calls `describe_entity` for the entity it's working on; values validated server-side vs live `fieldDefinitions` |
| **Arg validation** | Opt-in `coerceInt`/`coerceStringArray` per tool; **AI SDK rejects before `execute`** → no retry | Central coercion on every field; permissive SDK schema → strict parse **inside** the wrapper → structured `RepairError` the model self-corrects from |
| **Error handling** | Ad-hoc per tool; many paths throw raw; user sees "bug logged" | **One CorrectnessWrapper** classifies *every* failure into a taxonomy (§B3) → repair / ask / deny / business-error / retry / partial |
| **Confirmation** | propose schema + persisted payload + **commit schema re-parse in a separate `resume` action** (3 drift points) | Single execution path; destructive ops use one **2FA step-up** on the same schema (§B5) |
| **Result** | `display`/`summary` optional → often bare "Done." | **Mandatory typed envelope** (status + changes + errors + next), "Done." is impossible |
| **Loop** | Hand-rolled `streamLoop.ts` (43 KB), single `streamText`, frozen tool dict | `ToolLoopAgent` + `prepareStep` (native, supports growing the tool set per step) |
| **Driving guidance** | Per-tool runbooks emitted for ALL force-loaded tools | 3-tier: PROJECT (cached) → GROUP playbook (on activation) → TOOL (in scope) |
| **Channels** | Tools welded to chat (module-global ctx) | One registry → projectors (AI-SDK / MCP / REST) + adapters (chat / WhatsApp-Twilio / Slack) |
| **Autonomy** | "Suggest, never execute" + hard-locked approvals (#26) | Event-driven autonomous engine acts from the conversation; RBAC + risk-tier + 2FA for destructive |
| **Module changes** | Prompt + tools hand-maintained; turning a module off doesn't hide its AI tools | Module registry gates tools **and** context from one switch |
| **Correctness proof** | Lives in 150 files; unknown coverage | Registry-derived **contract tests + coverage report** ("118/120 capabilities complete") |

## B2. The per-group "playbook" (your "process per group")

A **group** = a domain bundle (e.g. `leads`). Each group carries a small
decision procedure, the systematic "what to call when" you described, that
loads **only when the router activates that group**:

```
GROUP: leads   (loaded only for lead-related requests)
  Capabilities: search_crm, describe_entity(lead), create_lead, update_entity,
                convert_lead, add_note, create_task, list_next_actions
  Playbook (the GROUP driving layer):
    • To READ ("show/list leads") → search_crm or a list capability. Do NOT
      load create/update. Do NOT call describe_entity (no fields needed to list).
    • To CREATE → dedup first (search_crm by name/email/phone). If a match
      exists, ask the agent or update instead. Resolve required fields; for
      custom fields call describe_entity(lead) to learn types, then create.
    • To UPDATE "P-007 set budget 120k, status hot" → resolve P-007 → call
      describe_entity(lead) → map values to field types → update_entity with a
      partial fields map (only what changed). Unknown/ambiguous field → ask.
    • To CONVERT → convert_lead (preserves personCode). Never delete+recreate.
  Edge cases live here, once, not duplicated across the lead tools.
```

A "list my leads" request therefore activates the `leads` group, uses
`search_crm`, and **never loads create/update schemas or the field catalog**,
that's your "don't give full context for a simple list message." A "create a
lead" request activates the same group but the playbook walks create→dedup→
describe→write.

## B3. The Correctness Machine, handling *every* error (not just two)

The reason "we don't know how many errors remain" is that today each tool fails
its own way. In v2 there is exactly **one wrapper** around every capability,
and every throwable is classified into a closed taxonomy with a defined next
step. This is what makes "whatever the user asks, we have an answer" a
structural property, not a per-tool hope.

```
CorrectnessWrapper(capability, rawArgs, principal, channel):
   try:
     1. COERCE rawArgs (dates/arrays/numbers/null-strip)         → ok | throw
     2. PARSE vs schema                                          → ok | ZodError
     3. RESOLVE refs (P-007 → _id; name → record)               → ok | NotFound | Ambiguous
     4. RBAC: principal.can(permission)                          → ok | Denied
     5. CHANNEL: channel allows capability.risk                  → ok | ChannelBlocked
     6. RISK gate: irreversible → require 2FA token              → ok | NeedsStepUp
     7. run *Impl (canonical mutation)                           → Result | ConvexError | ArgValidator
   classify(failure) → ONE of:
```

| Outcome | Cause | What the agent does next (driven by PROJECT layer) |
|---|---|---|
| `needs_repair` | coercion/parse/arg-validator mismatch | Re-call with corrected args using the repair hint (bounded retries) |
| `not_found` | code/name didn't resolve | Call `search_crm`; if still none, tell the agent plainly |
| `ambiguous` | name matched >1 record | Ask the agent to pick (`ask_user` with the candidates) |
| `denied` | RBAC | Tell the agent they lack `<permission>`; suggest who can |
| `channel_blocked` | e.g. bulk delete over WhatsApp | "That action must be done in the web app." |
| `needs_step_up` | destructive + no 2FA token | Trigger the 2FA confirm flow (§B5) |
| `business_error` | ConvexError from the mutation (dedup, invalid stage…) | Surface the real reason + the fix |
| `infra_retry` | provider 5xx / timeout / rate-limit | Transparent retry / failover (already in the chain) |
| `partial` | bulk: some rows failed | Report N ok / M failed + per-row reasons + retry-failed chip |
| `ok` |, | Narrate the result envelope |

Because the classification and the per-outcome behavior live in **one place**
(the wrapper + the PROJECT driving layer), fixing a class of error fixes it for
**all 150 capabilities at once**. You never again chase a date bug tool-by-tool.

## B4. Two execution traces

**Trace 1, agent command in chat: "update P-007: budget 120k, mark hot, follow up next Tue"**

```
OLD: load all 17 layers (~24k tok) → model guesses update_entity args + epoch ms
     for the follow-up → dueAt "next Tue" as a string → AI SDK rejects → "bug logged".
NEW:
  router → activate `leads` group (playbook + its capabilities), CORE always on
  step 1: search_crm("P-007") → resolves to lead _id           [reversible read, auto]
  step 2: describe_entity("lead") → {budget:number, status:enum[hot|warm|cold], ...}
  step 3: update_entity{ ref:"P-007", fields:{ budget:"120k", status:"hot" } }
            wrapper: coerce "120k"→120000 vs live field type; status valid → APPLY
            → envelope: "Updated P-007, budget 120,000; status hot"
  step 4: create_task{ type:"followup", ref:"P-007", dueAt:"next Tue" }
            wrapper: coerceTimestamp("next Tue") → epoch in org tz → APPLY
            → envelope: "Created T-031, follow-up Tue 9 Jun"
  narrate both envelopes. ~10k tokens, mostly cached. Zero errors.
```

**Trace 2, autonomous, no command. Lead messages the agent on WhatsApp: "Hi, I'm Sara, looking for a 2BR in JVC, budget 120k, can you send options Tuesday?"**

```
Twilio webhook → verify signature → map the agent's number → principal = Agent A
  → persist inbound message (source="whatsapp") → schedule autonomousTurn
autonomousTurn (same registry, trigger="autonomous", Agent A's RBAC):
  PROJECT-autonomous drive: "Observe; perform implied CRM actions; never message the customer."
  step 1: search_crm("Sara" + phone) → no match
  step 2: describe_entity("lead") → field types
  step 3: create_lead{ displayName:"Sara", phone, source:"whatsapp",
                       fields:{ budget:120000, propertyType:"2BR", area:"JVC" } }  [dedup→none→create]
  step 4: create_task{ type:"followup", ref:newLead, dueAt:"next Tue",
                       title:"Send 2BR JVC options" }
  step 5: add_note(newLead, "Inbound WhatsApp: wants 2BR JVC ~120k, options Tue")
  audit: 3 actions by Agent A via whatsapp. (Optional) WhatsApp reply to AGENT:
         "Created P-019 (Sara), follow-up T-031 Tue, noted requirements."
If a REQUIRED field were missing/ambiguous → ask_user → one WhatsApp question to the AGENT, not the customer.
```

Both traces use the **same registry, same wrapper, same RBAC**, only the
adapter and the PROJECT drive variant differ. That is the production-ready
property: one brain, many doors.

## B5. Autonomy, RBAC, 2FA & channel policy (the resolved model)

```
Every capability declares: { permission, risk, channels[] }
Every channel declares:    { maxRisk, principalResolver }

Decision per call:
  principal.can(permission)            ── else → denied (RBAC, your existing layer)
  channel.maxRisk >= capability.risk   ── else → channel_blocked
  risk == irreversible                 ── then → require 2FA step-up (confirm twice)
  else                                 ── auto-execute, audited
```

| Capability class | risk | WhatsApp (Twilio) | Web chat (member) | Requires |
|---|---|---|---|---|
| search/read/draft | safe | ✅ auto | ✅ auto | view perms |
| create/update/follow-up/note/convert/soft-delete | reversible | ✅ auto | ✅ auto | the matching write perm |
| bulk delete / hard delete / settings / schema / members & roles | irreversible | ❌ blocked | ✅ **with 2FA** | high perm (e.g. `data.bulkActions`/`members.manage`) **+ 2FA token** |

So: destructive tools are *sophisticated, protected* exactly as you said, only
trusted roles/owner hold the permission, they're unavailable over WhatsApp, and
even in the web app they demand a double confirm (2FA). Everything else the
agent is allowed to do happens autonomously.

## B6. Twilio per-agent wiring (RBAC from day 1)

```
orgIntegrations / agentChannels:  { orgId, userId(agent), provider:"twilio",
                                    phoneNumber, status }    ← maps a number → an agent
convex/http.ts  POST /whatsapp/twilio:
   1. verify X-Twilio-Signature (HMAC)            ← reject spoofed
   2. look up the agent by the receiving number   ← principal = that member
   3. if "From" maps to a known contact/lead → attach; else treat as new
   4. persist message (source="whatsapp") → schedule autonomousTurn (or request turn
      if the agent is issuing a command to the AI)
```

The principal is **always the agent (a member)** with their real permissions.
The customer's text is content. An unknown/unmapped number can never act.

## B7. Next actions, context-rich, not "follow up"

The proactive engine (materialized signals you already have in
`ai/queries/nextActions.ts`) is upgraded to emit, per item: **what + why
(evidence) + the concrete move + a one-tap intent**, e.g. *"D-007 (Acme, 120k)
has sat in Negotiation 14 days with no activity; last note says they wanted
revised pricing → draft a revised proposal"* with a `[Draft proposal]` chip.
Same engine feeds (a) the dashboard panel, (b) a `list_next_actions` capability,
and (c) the autonomous engine's "should I proactively do X?" check.

## B8. Implementation approaches considered (why these choices)

| Decision | Options weighed | Chosen, why |
|---|---|---|
| Tool exposure | (a) all tools always [today] · (b) static per-group · (c) pure agentic discovery · (d) **adaptive router + discovery hybrid** | (d): cheap deterministic preload for the common case, discovery as the escape hatch so nothing is ever hidden |
| Field schema | (a) in prompt [today] · (b) **introspection tool + server-side dynamic validation** | (b): tiny prompt, always-live types, AI needn't get types perfect, server coerces vs `fieldDefinitions` |
| Validation | (a) per-tool opt-in [today] · (b) **central boundary + repair-as-result** | (b): fixes the whole error class at once + enables self-correction |
| Confirmation | (a) propose/commit two-schema [today] · (b) **single path + risk-tier 2FA** | (b): removes the drift surface that caused the `entityIds` bug |
| Autonomy | (a) request-only · (b) **request + event-driven engine** | (b): your core requirement, act from the conversation, not on command |
| Loop | (a) hand-rolled streamLoop [today] · (b) **ToolLoopAgent + prepareStep** | (b): native per-step tool growth = progressive disclosure works |

## B9. Why this is production-ready

- **One failure model** → a finite, tested set of outcomes; no silent "Done.",
  no unclassified throw.
- **Coverage is computable** → the registry tells you exactly which backend
  functions are AI-reachable and which capabilities are complete.
- **Tokens bounded** → per-request group loading + cached prefix → ~8–15k, not 80k.
- **Adapts to the product** → module registry means CRM, productivity, or
  freelancer configs each get a correct, minimal AI surface automatically.
- **Secure by construction** → members-only principals, RBAC-gated availability,
  destructive ops fenced by permission + 2FA + channel.
- **One definition, every channel** → chat, Twilio/WhatsApp, MCP, Slack reuse
  the same capabilities; new integrations are adapters, not rewrites.

# PART C, How the AI works end-to-end (diagrams + verdict)

## C0. Verdict: is this plan sophisticated/right, and is bolting integrations later simple?

**Yes on both, with two honest caveats.**

- **Right for this project:** it's the pattern production teams use (single
  schema-validated control plane reused across channels/frameworks). It fixes
  the *causes* (fused layers, opt-in coercion, all-tools-every-turn,
  unstructured results), not the symptoms. It rides your existing strengths
  (canonical `*Impl`, `*ForAI` twins, RBAC catalog, live `fieldDefinitions`).
- **Bolting a new integration later is a thin adapter, NOT re-tooling**, see
  §C2. A new channel (Slack, Cal.com, voice, a customer portal) reuses the same
  registry, wrapper, RBAC, and audit. You write ~1 file (an adapter that
  authenticates a principal and hands the runtime a message). Zero capability
  changes. That is the whole point of separating the three layers.

**Caveats (be aware, not blockers):**
1. **It's a real migration**, not a patch, ~150 tools get ported (Stages S3–S10).
   Mitigated by the `AI_V2` flag (old path runs until the S17 cutover) and the
   coverage report (you know exactly what's ported).
2. **The most extreme token optimization (Code-Execution Mode, 98.7%) is
   deferred**, not needed for typical 1–3-tool CRM turns, and it needs a code
   sandbox. Progressive disclosure + caching already gets ~90% of the win.

## C1. The complete working (one diagram)

```
                              ── INBOUND: a request arrives ──
   Web chat panel      WhatsApp (Twilio)      MCP client      Slack       Cal.com
   (member typing)     (per-agent number)     (API token)    (webhook)    (webhook)
        │                     │                    │             │            │
        └─────────────────────┴──────────┬─────────┴─────────────┴────────────┘
                                          ▼
   ┌─────────────────────────── CHANNEL ADAPTER (thin, per integration) ───────────┐
   │  • verify the source (signature / session / token)                            │
   │  • resolve the PRINCIPAL = a member + their live RBAC permissions             │
   │  • set channel ("chat"|"whatsapp"|"mcp"…) and trigger ("request"|"autonomous")│
   │  • hand the runtime: { principal, channel, trigger, conversation, message }   │
   └───────────────────────────────────────┬───────────────────────────────────────┘
                                            ▼
   ┌──────────────────────────── AGENT RUNTIME (ONE brain, channel-agnostic) ───────┐
   │ ① ROUTER: request → which GROUP(s) to preload (deterministic + route context) │
   │ ② ASSEMBLE PROMPT:                                                             │
   │      [ CACHED PREFIX ]  PROJECT drive + capability CATALOG  ◄── billed ~10%    │
   │      [ DYNAMIC TAIL  ]  active-module context (LIVE) + group playbook(s)       │
   │                         + in-scope tool drive + route/convo + user message     │
   │ ③ TOOL-LOOP (AI SDK ToolLoopAgent + prepareStep, grows tools per step):       │
   │      core tools always on: search_crm · describe_entity · describe_workspace · │
   │                            discover_capabilities · ask_user                    │
   │      model may call discover_capabilities → runtime injects that group's       │
   │      capabilities + drive into the NEXT step (progressive disclosure)          │
   └───────────────────────────────┬───────────────────────────────────────────────┘
            every tool call ▼ (the ONE path, same for every capability/channel)
   ┌──────────────────────────── CORRECTNESS WRAPPER (runCapability) ───────────────┐
   │  1 coerce args (dates/arrays/ints/null-strip, central, never per-tool)        │
   │  2 strict parse ───────────────────────────► fail → return REPAIR (self-fix)   │
   │  3 resolve refs (P-007→_id, name→row) ─────► none→not_found · many→ambiguous   │
   │  4 RBAC: principal.can(permission) ────────► else → denied                     │
   │  5 channel allows risk? ───────────────────► else → channel_blocked            │
   │  6 risk=irreversible & no 2FA token ───────► needs_step_up (confirm twice)     │
   │  7 run() ──► ConvexError→business_error · arg→repair · 5xx→infra_retry          │
   └───────────────────────────────┬───────────────────────────────────────────────┘
                                    ▼
   ┌──────────────────────────── CAPABILITY REGISTRY (single source of truth) ──────┐
   │  cap.run(ctx, args) ──► existing canonical *Impl ──► Convex DB                  │
   │                                         │                                       │
   │   describe_entity/workspace ◄───────────┘ read LIVE fieldDefinitions/pipelines  │
   │   create/update VALIDATE values against LIVE field rows at write time          │
   └───────────────────────────────┬───────────────────────────────────────────────┘
                                    ▼
        CapabilityResult envelope { status, headline, changes[], errors[], next[] }
                                    │
                 ┌──────────────────┴───────────────────┐
                 ▼                                       ▼
        AUDIT LOG (every action:                 RUNTIME narrates the envelope →
        principal, capability, args,             streams the reply back through
        result, channel, source)                 the SAME adapter it came in on
```

## C2. Adding an integration later = ONE adapter (the "bolt-on" answer)

Nothing below the dotted line is touched when you add a channel. You write the
box above it.

```
   NEW: Slack / Cal.com / voice / customer-portal / next year's channel
        └── adapter.ts:  authenticate → resolve principal → runtime.runAgent(...)   ◄── you write THIS
   ── (everything below is REUSED, unchanged) ─────────────────────────────────────
        Agent runtime · Correctness wrapper · Capability registry · RBAC ·
        coercion · audit · all ~150 capabilities · driving layers · modules
```

Compare to today, where "add WhatsApp" meant re-implementing every tool because
tools are welded to the chat runtime. After v2, a channel is an adapter file;
a new *backend action* you want the AI to use is one `defineCapability()` next
to its `*Impl` (auto-discovered, auto-coerced, auto-tested, auto-audited,
available on every channel at once).

## C3. Request lifecycle in 8 steps (the short version)

1. **Arrive**, request hits a channel adapter (chat send / Twilio webhook / MCP call).
2. **Identify**, adapter verifies the source and resolves the **principal** (a member + live permissions). Unknown sender → read/suggest only, never write.
3. **Route**, runtime maps the request to group(s) and assembles the prompt (cached prefix + dynamic tail).
4. **Reason**, ToolLoopAgent runs; core tools are always on; it discovers/loads more tools per step as needed.
5. **Act**, each tool call goes through the one Correctness Wrapper: coerce → parse(repair) → resolve → RBAC → channel → risk/2FA → run the `*Impl`.
6. **Self-correct**, any bad arg comes back as a `repair` result; the model fixes it next step (bounded). Live field validation happens server-side at write time.
7. **Report**, every action returns a structured envelope (what changed + status + errors + suggested next); the runtime narrates it (never "Done.").
8. **Record & reply**, every action is written to the audit log; the reply streams back through the same adapter. Autonomous turns do steps 3–8 without a human prompt.

---

## Summary

The current AI integration fails because **the capability layer and the chat
layer are fused**: coercion is opt-in (so dates/arrays break), tools are loaded
all-at-once (so tokens hit 80k), results are unstructured (so you get "Done."),
and tools are welded to chat (so WhatsApp means rewriting everything). The fix
is a **Capability Registry** sitting on your existing canonical `*Impl`
functions, with: one central coercion + validation-repair boundary, a mandatory
structured result envelope, three-tier (project/group/tool) driving layers,
progressive disclosure so only relevant tools+context load per request,
module-awareness so the AI adapts to whatever the workspace has (pipelines off →
pipeline tools off), and thin channel adapters (chat/WhatsApp/MCP/Slack/Cal.com)
that all reuse the one registry under RBAC, with members as the only principals
and a full audit log. Define a capability once → it works everywhere, behaves
natively, self-corrects, and reports exactly what it did.

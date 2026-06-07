# 18 — AI-NATIVE ROADMAP

> **Status.** Strategic roadmap, not a sprint plan. Written 2026-06-06 in response to "how do we make Claude do the heavy lifting instead of us building tools forever, and how do clients integrate with the platform via Claude itself."
>
> **Cross-references.** Locked decisions in `AGENTS.md`. Capability registry in `convex/ai/MODULE.md`. Build history in `AI-TOOLING-BUILD-STAGES.md` (S0–S17 fully shipped). This doc is forward-looking — what to BUILD on top of the S0–S17 foundation.

---

## 0. TL;DR

The AI capability layer is feature-complete for **direct tool use** (S0–S17). The next horizon is **agency** — Claude operating the platform with less tool-by-tool scaffolding from us, and clients attaching Claude.ai to the platform as their primary UI.

There are seven concrete levers, ranked by ROI:

| # | Lever | What it unlocks | Effort | Risk |
|---|---|---|---|---|
| 1 | **Force Anthropic on autonomous + persona paths** | Eliminates the Gemini-Flash-class failures in autonomous loops | half day | low |
| 2 | **Memory tool MVP** | "Claude remembers what we agreed last quarter" — biggest single AI-native upgrade | half day | low |
| 3 | **MCP OAuth + Apps-SDK install** | Customers attach Claude.ai to your CRM as the UI | full day | medium |
| 4 | **Skills packs per vertical** | Replace prompt-string verticals with installable Skill manifests | full day | low |
| 5 | **Computer Use (single capability)** | Claude operates 3rd-party SaaS your tools don't cover | 2–3 days | high |
| 6 | **Extended thinking on reversible+ caps** | Claude pauses + reasons before writes | half day | low |
| 7 | **MCP streaming/SSE** | Real-time UX for Claude.ai-driven sessions | full day | low |

The dichotomy "Claude does it OR we build tools" is false. Claude takes more agency by getting **better tools, longer memory, longer turns, better identity (OAuth)**. Removing tools = Claude can't act.

---

## 1. Current state (what shipped — read this before adding anything)

### 1.1 Capability registry — ONE execution path

```
chat ───┐
WhatsApp ────► runCapability ───► RBAC → channel → 2FA → run → audit
MCP ────┘     (convex/ai/registry/wrapper.ts)
REST ───┘
```

- `convex/ai/registry/define.ts` — single REGISTRY Map. ~40 capabilities declared at module load.
- `convex/ai/registry/wrapper.ts` — 7-step pipeline: coerce + parse → resolveRef → RBAC → channel → 2FA → run → audit. Never throws. Every failure is a typed envelope (10-outcome closed taxonomy).
- `convex/ai/registry/projectors/` — same envelope on chat (`aiSdk.ts`), MCP (`mcp.ts`), REST (`rest.ts`).
- `convex/ai/runtime/host.ts` — agent loop with progressive disclosure (`prepareStep`), Anthropic ephemeral cache on the catalog prefix, `MAX_STEPS=25`, `RETRY_BUDGET=2`.

This is the foundation everything below builds on. Don't re-invent it.

### 1.2 Approval / 2FA / RBAC

- `convex/ai/registry/gate.ts` — `canRun` (RBAC) / `channelAllows` / `needsStepUp`. Irreversible HARD-blocked over WhatsApp regardless of declaration.
- `convex/aiStepUp.ts` — single-use 5-min tokens bound to `(orgId, userId, capability, argsHash)`. Synthetic re-call message inlines verbatim args so the hash matches → no infinite confirm loops.
- `convex/_shared/permissions/catalog.ts` — permission SSOT.
- Locked decision #26 in AGENTS.md governs the model.

This is correct security posture. **Don't reopen.**

### 1.3 Channels & projection

| Channel | File | What's shipped |
|---|---|---|
| Chat (web) | `convex/ai/messages.ts` + `processChat.ts` | Streaming via reactive `aiMessages` patches |
| WhatsApp inbound | `convex/ai/channels/whatsappInbound.ts` (S13) | Twilio webhook per agent |
| WhatsApp outbound | `convex/ai/channels/whatsappOutbound.ts` (S14) | `send_whatsapp` cap + 4 templates + 24h session-window logic |
| WhatsApp persona | `convex/ai/channels/persona.ts` (S15) | **Autonomous customer replies** — 11-cap allow-list, irreversible blocked |
| MCP | `convex/ai/registry/projectors/mcp.ts` (S16) | `POST /ai/mcp` JSON-RPC; Bearer token auth via `aiApiTokens` |
| REST | `convex/ai/registry/projectors/rest.ts` (S16) | `POST /ai/rest/<cap>` envelope |

### 1.4 Autonomous engine

- `convex/ai/runtime/autonomous.ts` — event-driven, debounced, runs under agent RBAC.
- Triggered by inbound WhatsApp, deal-stage events, scheduled briefings.
- Already exists; underutilised because most events don't trigger it yet.

### 1.5 Memory — thin

- `convex/ai/personaContext.ts` — per-org / per-user persona facts. ONE blob per principal, not per-record.
- This is the biggest gap. See §3.

### 1.6 Brittleness audit (2026-06-06)

- `convex/ai/registry/coverage.ts:buildCoverageReport.brittleCapabilities` — flags every capability with a required top-level field not surfaced in `spec.requiredClarifications`.
- `buildContractCases` adds a per-required-field weak-model fuzz that fails CI on regressions.
- Run via Convex dashboard: `ai/queries/coverageReport:getCoverageReport`.

---

## 2. Lever 1 — Force Anthropic on autonomous + persona paths (P0, ½ day)

### Why first

Autonomous + persona are the paths where the user has zero supervision. A weak model failing here = a customer never gets a reply (WhatsApp) or a deal goes silent (autonomous follow-up). For chat, the user can re-prompt — the cost of a weak model is irritation. For autonomous, the cost is real money.

### Current behaviour

`convex/ai/orchestrator/modelResolver.ts` resolves the model from the conversation's `defaultModel` or the user's preference. Autonomous paths inherit the same resolver. Today they CAN run on Gemini Flash if that's what the org defaults to.

### Proposed

Pin autonomous + persona to Anthropic Sonnet 4.5 (or Haiku 3.5 for cost). Allow opt-out via a per-org `aiAutonomy.modelOverride` setting.

```ts
// convex/ai/runtime/autonomous.ts (sketch)
const AUTONOMOUS_MODEL_DEFAULT = "claude-sonnet-4-5";

export async function runAutonomousTurn(opts) {
  const model = opts.modelOverride
    ?? org.settings.aiAutonomy.modelOverride
    ?? AUTONOMOUS_MODEL_DEFAULT;
  // …
}
```

### Cost

- Sonnet 4.5: $3 input / $15 output per MTok. Autonomous turn averages ~5K input cached + 500 output → ~$0.0075 per turn. 100 turns/day/org = $0.75/org/day. Acceptable.
- Haiku 3.5: $0.8 / $4 per MTok → ~$0.002 per turn. Even more so.

### Risk

Low. Anthropic API has 99.9%+ uptime; we already use it. Failure mode is provider down → fall back to next-best model (existing `pickBriefingModel` chain).

### Acceptance

- Org-level override in `aiAutonomy.modelOverride` (extend the existing settings shape).
- Autonomous + persona paths read this resolver.
- Unit test: when no override, autonomous resolves to `claude-sonnet-4-5`.

---

## 3. Lever 2 — Memory tool MVP (P0, ½ day)

### Why this matters

A CRM that "feels AI-native" remembers facts across sessions. Today:

- User: "What did we last agree with Sarah on pricing?"
- Model: re-reads the entire conversation transcript (200+ messages), token-expensive, often misses the answer.

With proper memory:

- User asks the same question.
- Model calls `recall("person:P-007:negotiation")` → returns "Last agreed: 30% off if signed before Q3" (one row, 50 tokens).
- Model answers directly.

This is the single biggest UX delta from "tool-calling AI" to "AI-native CRM."

### Schema

```ts
// convex/schema/ai.ts (additions)
defineTable("aiMemory", {
  orgId: v.id("orgs"),
  scope: v.string(),                 // "person:P-007:negotiation", "deal:D-014:close-plan", "user:U-XYZ:preferences"
  key: v.string(),                   // "last-agreed-pricing", "decision-rationale"
  value: v.string(),                 // text, ≤4 KB
  writtenBy: v.id("users"),          // last author (model or human)
  writtenAt: v.number(),
  expiresAt: v.optional(v.number()), // optional TTL for ephemeral facts
  // Soft-delete: never hard-delete, archive instead so audit trail stays.
  archivedAt: v.optional(v.number()),
})
  .index("by_orgId_and_scope", ["orgId", "scope", "key"])
  .index("by_orgId_and_scope_and_writtenAt", ["orgId", "scope", "writtenAt"]);
```

### Capabilities

```ts
// convex/ai/registry/coreTools.ts (additions; both safe-tier)

remember({ scope, key, value, ttlMs? })
recall({ scope, query?, limit? })
forget({ scope, key })  // soft-delete
list_memory({ scope })   // operator-debug surface
```

### Preflight integration

`convex/ai/runtime/preflight.ts` already inlines `fieldDefinitions` for entity types implied by the route. Extend it to inline the top-N memory rows for the routed scopes:

```ts
// preflight pseudo
if (route.includes(personScope)) {
  const memories = await listMemoryForAI({ scope: `person:${personCode}:*`, limit: 10 });
  appendToTail(`### Memory (recent 10)\n${memories.map(m => `- ${m.key}: ${m.value}`).join("\n")}`);
}
```

This means **the model gets relevant memory injected before it even calls `recall`** — for short scopes, no tool call needed.

### Cost

- Storage: 4 KB × ~50 memories/org/month × $0.20/GB/mo = pennies.
- Read: one Convex index read per turn × cached → effectively free.
- Token cost: 10 memory rows × ~50 tokens = 500 input tokens/turn. Cached after first turn → ~50 tokens/turn after.

### Risk

Medium-low. Schema design needs to be right the first time (migrations are real work). Specifically:

- **Scope namespace.** Use a strict grammar: `<entityType>:<code>:<topic>` (e.g. `person:P-007:pricing`, `deal:D-014:close-plan`, `user:U-XYZ:preferences`). Document in MODULE.md.
- **Write conflicts.** Two AI turns writing the same `(scope, key)` simultaneously — last-write-wins is fine; the audit row preserves history.
- **PII.** Sensitive fields go through `describe_entity` RBAC filter; memory should respect the same boundary. Don't write `salary` or `social_security` to memory unless the model explicitly intends to.
- **Cross-org leakage.** `orgId` index prevents this; tested in the wrapper's RBAC path.

### Acceptance

- New table + capabilities + tests.
- Preflight injects memory for routed scopes.
- One end-to-end test: write memory in turn 1, recall in turn 5 across a conversation reset.

---

## 4. Lever 3 — MCP OAuth + Apps-SDK install (P1, full day)

### What this is

Today: a third-party developer with admin access can issue an `aiApiToken` (Bearer) and POST to `/ai/mcp`. Developer-grade.

After: any end-user opens **Claude.ai**, clicks "Connect", chooses your CRM from the connector list, OAuths in, and Claude.ai now operates the CRM as the user. Consumer-grade.

### Why this matters

This is the closest real-world analog to "let Claude be the CRM." Once shipped, you can sell to a customer who says "I just want Claude.ai, not another UI." Their team uses Claude.ai every day; your CRM becomes a back-end they never see directly.

### What's already in place

- `POST /ai/mcp` JSON-RPC endpoint (`convex/ai/registry/projectors/mcp.ts`).
- Tool schema projection that's MCP-native (S16).
- `aiApiTokens` table for Bearer auth.
- Cross-channel parity test confirms identical envelopes.

### What's missing

- **OAuth 2.0 server side.** Convex doesn't ship OAuth out of the box. Two routes:
  1. **Roll our own:** `/oauth/authorize` + `/oauth/token` + `/oauth/revoke` HTTP routes in `convex/http.ts`. ~300 LOC. Use `aiApiTokens` as the underlying credential, scope to one user.
  2. **Sit behind an OAuth proxy:** Stytch, WorkOS, or Auth0 in front. Easier, but adds a vendor.

  Recommend (1) for MVP — keeps everything in your codebase.

- **MCP discovery manifest.** Anthropic's connector registry expects `/.well-known/mcp.json` declaring the OAuth endpoints + tool capabilities. Static file in `app/(root)/.well-known/mcp.json/route.ts`.

- **A "Connect to Claude" button** on your settings page. Opens a popup to Claude.ai's OAuth flow, returns a code, exchanges for a token, stores under the user's `aiApiTokens`.

- **Public listing in Anthropic's connector catalog.** Submit via Anthropic's partner form once OAuth works. Brings traffic.

### Cost

- Anthropic API usage paid by the END USER (Claude.ai customer's plan), not by you. Big win for unit economics.
- Your hosting cost: a Bearer token check + the same Convex query/mutation a chat user would have run. Identical.

### Risk

- **OAuth implementation.** OAuth has subtle bugs (redirect URI handling, state parameter, PKCE). Use a battle-tested library on the verifier side — `@panva/oauth4webapi` or similar.
- **Token revocation.** Need a "Disconnect" path for users to nuke a token. Already supported via `aiApiTokens`'s existing CRUD.
- **Permission scope.** A token issued to Claude.ai should scope to one user, not the whole org. Today's `aiApiTokens` is per-org; extend with a `scopedToUserId?: Id<"users">` column.

### Acceptance

- `/oauth/{authorize,token,revoke}` HTTP routes.
- `.well-known/mcp.json` manifest.
- "Connect to Claude" UI in `/settings/integrations` (or similar).
- End-to-end test: trigger OAuth from a test browser, hit `/ai/mcp` with the issued token, verify the call respects the scoped user's RBAC.

---

## 5. Lever 4 — Skills packs per vertical (P1, full day)

### Today

`convex/ai/registry/vertical.ts` carries `VerticalProfile` rows. Each is a prompt string ("You are a real-estate CRM assistant…") plus an entity-label override. These are baked into our code; users can't edit them; they don't compose.

### Anthropic's Skills (announced Oct 2025)

A Skill is a manifest declaring:
- A name, description, version.
- A set of files (instructions, examples, sample data).
- A list of tools the skill needs.

The model loads the Skill at the start of a conversation; the skill's instructions guide its behaviour.

Skills are the right unit for "vertical playbooks" because:
1. They're versioned (a new Real Estate skill v2 doesn't break v1 users).
2. They're installable (orgs pick which skills they want).
3. They're composable (a "Real Estate" skill + a "WhatsApp Auto-Reply" skill stack).
4. They live in a structured registry, not buried in code.

### Migration path

```
convex/ai/skills/                        — new directory
  realEstate/
    skill.json                            — Anthropic Skill manifest
    instructions.md                       — what was in vertical.ts
    examples/
      lead-qualification.md
      offer-followup.md
  recruiting/
    skill.json
    instructions.md
  …

convex/ai/registry/skills.ts             — V8 module that loads + projects skills
  loadSkill(orgId, skillKey) → SkillDef
  projectSkillsToSystemPrompt(activeSkills) → string

convex/orgs/queries.ts                   — extend listOrgSkills query
convex/orgs/mutations.ts                 — installSkill / uninstallSkill / setActiveSkill
```

The Skill manifest replaces what `vertical.ts` does today. The model loads the manifest at the start of a turn; the existing host can ingest a Skill's `instructions` into the system prompt tail.

### Cost

- Token: ~500–2000 tokens per active skill in the system prompt. Cached after first turn.
- Engineering: medium — schema migration + UI for installing skills.

### Risk

Low. The Skill format is open; nothing locks us in. If Anthropic changes the spec, we re-export.

### Acceptance

- 3 skills shipped: Real Estate, Recruiting, Healthcare (or whatever your top verticals are).
- Settings UI to install/activate.
- Existing `vertical.ts` profiles ported.
- Skill manifest validated against Anthropic's JSON schema in CI.

---

## 6. Lever 5 — Computer Use (P2, 2–3 days, HIGH RISK)

### What it is

[Anthropic's Computer Use](https://docs.anthropic.com/en/docs/build-with-claude/computer-use) — Claude controls a virtual browser. You describe a task; Claude takes screenshots, clicks, types. Beta but stable.

### Why it matters for a CRM

Your tool registry covers what YOUR APP can do. Sales teams routinely need to do things in OTHER apps:

- Pull a prospect list from LinkedIn Sales Navigator.
- Submit a vendor onboarding form on a customer's portal.
- Scrape a competitor's pricing page.
- Update a record in the customer's own CRM (cross-CRM workflows).

Computer Use is the only general-purpose answer. The alternative is building 50 custom integrations.

### Implementation skeleton

```ts
// convex/ai/quarantined/capabilities.ts (new entry)
defineCapability({
  name: "computer_use",
  module: "automation",
  group: "automation",
  permission: "automation.use",   // new permission
  risk: "irreversible",            // forces 2FA — Computer Use IS dangerous
  channels: ["chat"],              // chat only; never WhatsApp
  spec: {
    whenToCall:
      "When the user asks for a task that requires operating a 3rd-party website (scrape, fill a form, navigate a portal). Always preferable to call internal tools when one exists.",
    requiredClarifications: ["task", "targetUrl"],
    goodExample: { task: "Pull the top 10 leads from LinkedIn matching 'fintech CTO' and save as contacts.", targetUrl: "https://www.linkedin.com/sales/" },
  },
  input: z.object({
    task: z.string().min(20).describe("Detailed task description in natural language."),
    targetUrl: z.string().url(),
    maxSteps: z.number().int().min(1).max(50).optional().default(20),
  }),
  run: async (ctx, args) => {
    // Schedule a Trigger.dev or external worker job that runs Anthropic's
    // Computer Use API in a sandboxed VM (Vast.ai, Browserbase, or a
    // self-hosted Docker container). Return a job id immediately; the
    // result lands as a follow-up tool message when complete.
    const jobId = await ctx.scheduler.runAfter(0, internal.computerUse.runJob, args);
    return ok({
      headline: "Computer-use task queued — I'll narrate when it finishes.",
      data: { jobId },
    });
  },
});
```

### Cost

- Anthropic Computer Use: $3 input / $15 output per MTok (Sonnet rates). A 30-step browser session ≈ 50 KB images × 30 = 1.5 MB. At ~700 input tokens per screenshot, that's ~21 K input tokens = ~$0.06 per task. Plus VM time.
- Sandbox VM: Browserbase ~$0.25/min, Vast ~$0.10/min. A 5-min task = $0.50–$1.25.
- TOTAL: ~$0.50–$1.50 per Computer Use task.
- Need per-org rate limit (e.g. 50 tasks/day default).

### Risk

HIGH. Reasons:

- **Account safety.** Computer Use can do whatever a human can — including triggering 2FA on the user's accounts, locking accounts, or accidentally sending a message. Treat as `risk: "irreversible"`. Always require 2FA. Always require an explicit `targetUrl`.
- **Credential storage.** Sensitive 3rd-party logins. Encrypt at rest like BYOK keys. Never log decrypted values.
- **Liability.** A Computer Use task that breaks a customer's CRM IS your problem. Audit trail must be bulletproof.
- **Detection.** Some sites detect headless browsers. Use Browserbase's stealth mode or accept ~10% task failure rate.

### Acceptance

- Capability + permission + 2FA gate.
- Sandbox provisioning (Browserbase MVP, in-house later).
- Audit row per task: user, targetUrl, task description, success/failure, screenshots URL (signed, 24h TTL).
- Per-org daily quota.
- One end-to-end test: scrape a known sandbox page; assert the result.

**Defer if uncertain.** This is the only "high-risk" lever. The other six are safer ROI.

---

## 7. Lever 6 — Extended thinking on reversible+ caps (P2, ½ day)

### What it is

Anthropic Sonnet 4.5 / Opus 4 support [extended thinking](https://docs.anthropic.com/en/docs/build-with-claude/extended-thinking) — the model thinks for ~5–60 seconds before producing output. The thinking is private; only the conclusion is public.

### Why it matters

Today the model decides "should I write to the DB?" in a single inference pass. For irreversible actions, a momentary brain-fart can corrupt data.

With extended thinking enabled for `risk: "reversible+"` capabilities, the model gets a thinking budget BEFORE the tool call. Decision quality improves. Cost: latency + tokens.

### Implementation

```ts
// convex/ai/runtime/host.ts
const PROVIDER_OPTIONS_BY_RISK = {
  safe:         {},
  reversible:   { anthropic: { thinking: { type: "enabled", budgetTokens: 1024 } } },
  irreversible: { anthropic: { thinking: { type: "enabled", budgetTokens: 4096 } } },
};

// Pass the risk-tier of the active set to streamText's providerOptions.
```

### Cost

- 1K thinking tokens = $0.003 (Sonnet). Negligible per turn.
- Latency: +2–10 seconds per write. Acceptable for irreversible ops; tradeoff for reversible.

### Risk

Low. Easy to A/B test: half of orgs get thinking, measure error rate (audit feed `business_error` count).

### Acceptance

- `host.ts` enables thinking based on the highest-risk active cap.
- A/B flag in `org.settings.aiAutonomy.extendedThinking`.
- Audit shows `thinkingTokens` per turn.

---

## 8. Lever 7 — MCP streaming/SSE (P2, full day)

### What it is

Today `POST /ai/mcp` is request-response JSON-RPC. Some MCP clients (Claude.ai included) prefer streaming via Server-Sent Events for responsiveness.

### Why it matters

Per `Future-Enhancements.md §B.42`: a customer using Claude.ai as the UI feels every tool-call lag. Streaming responses (the model sees `tool_call_start` immediately, then `tool_result` chunks) cuts perceived latency by half.

### Implementation

Add a streaming variant to `convex/http.ts`:

```ts
// http.ts
export const httpAction_aiMcpStreaming = httpAction(async (ctx, req) => {
  // Parse JSON-RPC request, set up SSE response, stream tool events as they happen.
});
```

The projector already separates tool definition from execution; we just need to chunk the result envelopes.

### Cost

Negligible — SSE on top of existing HTTP.

### Risk

Low. SSE is well-understood. Convex `httpAction` supports response streaming.

### Acceptance

- New endpoint `/ai/mcp/stream`.
- `.well-known/mcp.json` advertises both endpoints.
- Test: a long-running tool call (e.g. `bulk_create_entities`) streams progress events.

---

## 9. Sequencing recommendation

### Sprint 1 (this week or next)

- **Lever 1** (Anthropic on autonomous + persona) — eliminates the failure class the user reported.
- **Lever 2** (Memory tool MVP) — biggest qualitative jump.

End of sprint: autonomous + WhatsApp paths run on Sonnet; chat threads remember context across sessions.

### Sprint 2

- **Lever 4** (Skills) — better fit for vertical-specific behaviour.
- **Lever 6** (Extended thinking) — quality bump on writes.

End of sprint: orgs install skills; reversible/irreversible writes get thinking.

### Sprint 3

- **Lever 3** (MCP OAuth + Apps SDK) — opens the consumer-grade connector path.
- **Lever 7** (MCP streaming) — UX completeness for Claude.ai users.

End of sprint: customers can attach Claude.ai to your CRM as their UI, and the experience feels real-time.

### Sprint 4 (only if Sprints 1–3 stick)

- **Lever 5** (Computer Use) — high-risk; ship after the foundation is rock-solid.

---

## 10. What this roadmap is NOT

- **A replacement for the capability registry.** Tools stay. Memory + skills + computer use stack ON TOP of tools.
- **A move away from Convex.** Every lever above lands in the existing `convex/ai/**` tree.
- **Multi-model.** Anthropic-first for high-stakes paths. Other providers stay supported for chat where the user picks.
- **A spec.** This is a roadmap. Each lever needs its own design doc + test plan when implementation starts.

---

## 11. Open questions for the user

Before any of this ships:

1. **Which vertical(s) get a Skill first?** Real Estate, Recruiting, Healthcare, B2B SaaS — pick 1–3.
2. **Per-org Anthropic spend cap?** Default $50/month or unlimited? This affects autonomous-loop guardrails.
3. **Computer Use sandbox vendor?** Browserbase (managed) vs self-hosted Docker (cheaper, more work).
4. **OAuth scope strategy?** Per-user (one user controls one Claude.ai connection) vs per-org admin (single connection acts on behalf of any user). The first is safer; the second is more enterprise-friendly.
5. **Memory retention policy?** Hard TTL (e.g. 1 year) vs indefinite with archive? GDPR implications for the latter.

Answer these and we have the inputs for the per-lever design docs.

---

## 12. Reference list

- [Anthropic Tool Use](https://docs.anthropic.com/en/docs/build-with-claude/tool-use)
- [Anthropic Computer Use](https://docs.anthropic.com/en/docs/build-with-claude/computer-use)
- [Anthropic Extended Thinking](https://docs.anthropic.com/en/docs/build-with-claude/extended-thinking)
- [Anthropic Skills (Oct 2025)](https://www.anthropic.com/news/skills)
- [Model Context Protocol spec](https://modelcontextprotocol.io/)
- [Anthropic prompt caching](https://docs.anthropic.com/en/docs/build-with-claude/prompt-caching)
- This codebase: `convex/ai/MODULE.md`, `AGENTS.md`, `AI-TOOLING-LAYER-PLAN.md`, `AI-TOOLING-BUILD-STAGES.md`.

---

*End of doc. Last updated 2026-06-06 by the Plan-C session.*

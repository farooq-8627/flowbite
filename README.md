# Orbitly

**The AI-powered CRM that adapts to your industry — where the AI is a real operator, not a chat sidebar.**

Orbitly is a multi-tenant, AI-native CRM. An org picks an industry, gets a fully-shaped workspace in
under two minutes, and from then on can run the business by *talking* to it — in the app, over
WhatsApp, through MCP, or over REST. The AI doesn't just answer questions: it creates the lead,
converts it, attaches the file, scores the deal, sends the WhatsApp, and routes the next task — under
the user's real permissions, with risk gates and an audit trail on every action.

Built and owned solo, end to end: product, data model, backend, frontend, AI runtime, billing, auth,
infra, and production debugging.

> ### 📂 Read this first — the engineering story
> This README is the overview. **The depth lives in the case study**, which traces how this was
> actually built — including the AI architecture I shipped, then tore down and rebuilt when it hit a
> ceiling:
> - **[`ORBITLY-CASE-STUDY-DEEP.md`](./ORBITLY-CASE-STUDY-DEEP.md)** — deep, evidence-cited
>   reconstruction (the hardest problem, the v1→v2 rebuild, production ownership, every claim tied to
>   a commit/file/test).
> - **[`CASE-STUDY.md`](./CASE-STUDY.md)** — the narrative version (how I think, decide, and ship).
>
> If you're evaluating how I architect, own scope, and direct AI agents without hand-holding — start
> there.

---

## The problem

CRMs sit at two extremes. Salesforce/HubSpot are powerful but heavy, expensive below ~20 seats, and
built for a 2010-era sales motion. General chat assistants are fast but know nothing about your
pipeline and can't safely *do* anything in it.

The gap nobody had filled: a CRM where the AI is a **first-class actor inside the workflow** — able to
take real, permissioned, auditable actions across every channel a business actually uses — while
staying multi-tenant, cost-controlled, and safe enough that it can never do something irreversible on
the wrong surface.

Orbitly is my proof that one person, directing AI agents well, can ship that.

---

## How I work

This repo is structured to show *judgment and ownership*, not just output:

- **Think before code.** `AGENTS.md` holds **28 locked architectural decisions**, each dated and paired
  with the alternative I rejected — including one I deliberately *reversed* in writing when it hit a
  ceiling.
- **End-to-end, no hand-holding.** Idea → data model → backend → AI runtime → frontend → billing → auth
  → production debugging, all owned. Every priority call was mine.
- **Recognise the failure loop and rebuild.** After patching the same AI bug class three times, I
  stopped, named the four structural costs on paper, and rebuilt the layer — finishing the rewrite
  instead of carrying two systems forever (**side-by-side cleanup**: legacy code dies in the same commit
  the replacement lands).
- **Own production.** Multi-provider failover that was built but never actually wired; a bulk-create
  duplicate loop; a cross-org URL-probing security hole; React #310 on logout — each fixed at root
  cause with a regression test or a written rule left behind. Traced in `SHIPPED.md`.
- **Document for the next engineer (and the next AI agent).** **50 `MODULE.md` files**, a backend
  architecture map (`convex/_arch.md`), and `SHIPPED.md` / `PENDING.md` / `Future-Enhancements.md` doing
  three distinct jobs (done / to-do / deferred-with-reason).
- **Direct AI without shipping slop.** Staged, self-contained build prompts; a hard "no training-data
  guesses, cite the source" rule; and a behavioural rule to correct a wrong direction (mine or the
  agent's) instead of complying silently.


---


## The signature: a channel-agnostic AI capability registry

The architectural centrepiece — and the clearest signal of how I think — is that **every "thing the AI
can do" is declared exactly once**, then *projected* into every channel.

```
  chat · autonomous · WhatsApp(in/out) · MCP · REST     ← channels (thin adapters)
                          │
                 runCapability()  ← ONE execution path, never throws, 10 typed outcomes
                          │
          capability registry: 127 capabilities          ← single source of truth
          each = schema(+coercion) · permission · risk · channels[] · run()
                          │
              canonical Convex mutations (60 tables)      ← the real data layer
```

Adding WhatsApp, MCP, or REST required **no rewrite of any capability** — each is a thin projector over
the same registry. A bad argument from a weak model comes back as a self-correcting `repair` envelope
instead of a thrown exception. This replaced a first version where the AI tooling and the chat loop
were the *same* layer (propose/commit schema drift, ~80k tokens/turn, "Done." with no summary, and a
full rewrite needed per channel). **That v1 → v2 rebuild — deleting ~144 legacy files in the same
commit the new layer landed — is the centre of the [case study](./ORBITLY-CASE-STUDY-DEEP.md).**

---

## Features & modules

**Multi-tenancy & onboarding**
- Isolated per-org workspaces; every query org-scoped by index (no `.collect()` on growable tables).
- Pick an industry → a template seeds pipelines, fields, dashboard layout, and sample data in <2 min.
- **9 industry templates** (real estate, B2B SaaS, recruiting, agencies, freelancers, productivity, + regional variants).

**Dynamic, schema-as-data CRM**
- Entity labels, fields, and pipeline stages are **never hardcoded** — they're DB-backed per org. One
  org's "Lead" is another's "Inquiry"; the AI reads the *live* schema, never a hardcoded prompt.
- Dynamic field system splits a flat record into column / custom-field / join storage at runtime — so
  an admin adds a field and the AI can write to it on the **next turn, zero code change**.

**Pipelines & Kanban**
- Multi-pipeline support, drag-and-drop stages, stage-aware required fields, transition policies, and
  per-stage advanced settings (stale/warning thresholds, final-stage win/loss types).

**Tasks, calendar & comms**
- Tasks with types, due dates, priorities, assignees, and per-org task-type catalogs.
- Calendar + reminders as read-merge views; notes, threaded messages, and an org-wide timeline.

**Proactive AI (not just request/response)**
- **AI Pulse** — permission-scoped proactive surface (stuck deals, overdue tasks, stale leads).
- **Daily & weekly briefings** — platform-billed cron summaries, never billed to the user's key.
- **Materialised next-actions ranker** (no LLM cost) + hybrid **deal scoring** and **anomaly detection**.
- **Autonomous engine** — event-driven turns (standing orders) that act under the agent's RBAC.

**The AI capability layer**
- **127 capabilities** across CRM, pipelines, fields, tasks, notes, tags, messaging, files, dashboard,
  analytics, and creative drafting — each one file, co-located with the mutation it wraps.
- **5 delivery surfaces**: in-app chat, autonomous engine, WhatsApp (two-way, 24h session-window logic),
  MCP (JSON-RPC), REST — all over one execution path; a cross-channel parity test proves identical
  behaviour across them.
- **7 AI providers** via the Vercel AI SDK (Anthropic, OpenAI, Google, Groq, Mistral, xAI, OpenRouter)
  with BYOK (encrypted at rest) + platform-key fallback and multi-provider failover.

**Autonomy & safety gates**
- Risk-tiered capabilities: `safe`/`reversible` auto-execute; `irreversible` (bulk delete, settings,
  member/role changes) require **2FA step-up** with a single-use token.
- **WhatsApp is hard-blocked from any irreversible action**, regardless of org policy — a structural
  fence, not a code-review habit.
- One `org.settings.aiAutonomy` policy; capabilities gated by `active modules ∩ permissions ∩ channel`.

**RBAC, billing & operations**
- Permission catalog as a single source of truth — add a permission once, it derives into the seeder,
  runtime checks, role-editor UI, and tests. Row-level record visibility via one `records.viewAll` key.
- Full role/invitation flows; soft-delete + restore-from-trash on every entity.
- **LemonSqueezy** billing with trial + 3-day past-due grace and webhook lifecycle tests.
- Hidden **owner/operator panel** at an env-configured slug behind a 5-layer gate (incl. email-OTP),
  driving tiers, AI keys, and templates without a deploy.
- **Sentry** (noise filters, session replay, per-tenant context) + **PostHog**, with PII masking.
- Internationalisation (en/ar, RTL/LTR), dark mode, white-label theming via per-org CSS variables.

---

## Verified proof

All numbers below I verified by running the command or counting the source — not by quoting a doc:

| Metric | Value |
|---|---|
| Backend tests (Convex + convex-test) | **1,278 passing** (1 skipped), 75 files — `pnpm test` |
| Frontend tests | **215 passing**, 16 files — `pnpm test:frontend` |
| AI capabilities (distinct, 0 dup names) | **127** across 25 capability files |
| Convex tables / data migrations | **60 tables**, **48** idempotent migrations |
| Per-module architecture docs | **50** `MODULE.md` files |
| Build / lint / types | `pnpm build` green · Biome 0/0 · `tsc` 0 errors |

---

## Tech stack

**Frontend** Next.js 16 (App Router) · React 19 · Tailwind v4 · shadcn/ui · TanStack Table · dnd-kit ·
React Hook Form + Zod · nuqs · next-intl · Zustand (UI-only state)
**Backend** Convex 1.40 (reactive DB + actions + scheduling) · Convex Auth (email OTP + OAuth) ·
Trigger.dev (long jobs)
**AI** Vercel AI SDK v6 · Anthropic / OpenAI / Google / Groq / Mistral / xAI / OpenRouter · Firecrawl (web) · custom capability registry
**Integrations** Twilio (WhatsApp) · LemonSqueezy (billing) · Resend (email) · Cloudinary (media)
**Ops** Sentry · PostHog · Biome · Vitest + convex-test · Playwright · pnpm

---

## Repo map & read order

```
convex/            backend — schema, mutations, AI runtime
  ai/registry/     the capability registry (the architectural centrepiece)
  ai/MODULE.md     the AI runtime + v1→v2 rebuild narrative
  _arch.md         backend architecture map
core/              11 frontend modules (ai, entities, scheduling, shell, platform, comms, …)
AGENTS.md          28 locked architectural decisions + working rules
SHIPPED.md         dated changelog — the project heartbeat
CASE-STUDY.md      / ORBITLY-CASE-STUDY-DEEP.md  ← the engineering story
```

**Fastest way to evaluate me:** `AGENTS.md` → `SHIPPED.md` → `convex/ai/MODULE.md` →
`convex/ai/registry/` → then the [deep case study](./ORBITLY-CASE-STUDY-DEEP.md).

---

## Run locally

```bash
pnpm install
pnpm dev          # runs Next.js + Convex together
```

Set the required env vars (Convex deployment, an AI provider key, Resend, etc.) — see `.env.example`.
Tests: `pnpm test` (backend) · `pnpm test:frontend` · `pnpm build`.

---

*Solo-built as an engineering credibility project: no team, no PM, no design partner. Every bug in
`SHIPPED.md` I found by dogfooding my own product. The architecture defends on technical merit alone.*

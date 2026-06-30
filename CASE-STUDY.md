# Orbitly — Case Study

A multi-tenant, AI-native CRM. Built solo in 4 weeks. The point of this document is not the product — it's how I work as an engineer, what I decided, why, and what those decisions cost or saved.

**Stack:** Next.js 16, TypeScript, Convex, Tailwind, Vercel AI SDK v6, Anthropic Claude / OpenAI / Google Gemini / OpenRouter (multi-provider failover), Twilio WhatsApp, LemonSqueezy, Sentry, PostHog
**Live:** orbitly.dev
**Timeline:** 4 weeks, solo
**Role:** Solo full-stack engineer — no team, no PM, no design partner, no users

---


## The idea

I had been watching the gap between two extremes for a while. On one side, Salesforce and HubSpot — too expensive for any team under twenty seats and built for a 2010-era sales motion. On the other, ChatGPT — useful for one prompt at a time but knows nothing about your pipeline.

The thing that didn't exist: a CRM where the AI is not a chat sidebar, it's a real actor — it can create the lead, convert it, attach the file, send the WhatsApp, and route the next task, with the right risk gates and audit trail. The AI sits inside the workflow, not next to it.

I built Orbitly to prove I could ship that — multi-tenant, multi-channel, multi-provider — alone. No customer brief, no design partner, no validation loop. Every problem I found, I had to find by using my own product the way a paying customer would. Every decision I made, I had to defend on technical merits alone, because there was no user telling me what mattered.

That constraint is the point of this case study. It's the reason the engineering had to be tight.

---

## What I built

A multi-tenant CRM SaaS where each organisation gets an isolated workspace, an industry-specific schema (real estate, B2B SaaS, recruiting, agencies, freelancers, productivity, plus three more — 9 templates total), and an AI assistant with around 150 capabilities running across six channels through one execution path: in-app chat, autonomous (event-triggered), WhatsApp inbound, WhatsApp outbound, MCP (JSON-RPC), and REST.

The same capability called by different channels behaves the same way. That property — channel-agnostic capability registry — is the architectural centrepiece, and is what made WhatsApp + MCP + REST + autonomous all come online inside the same 4 weeks.

**Surface area:**

- Lead, contact, deal, company management with kanban pipelines, drag-and-drop stages, stage-aware required fields
- ~150 AI capabilities (create, convert, attach, score, forecast, import, draft, search, schedule)
- 9 industry templates seeding pipeline + custom fields + dashboard layout + sample data
- Multi-provider AI failover (Claude → GPT → Gemini → OpenRouter free tier) with BYOK + platform-key fallback
- Risk-tier autonomy: safe / reversible auto-execute; irreversible (bulk delete, settings, member changes) require 2FA, never run over WhatsApp
- WhatsApp two-way conversations with 24-hour session-window logic and template fallback
- Hidden owner-admin panel at an env-configured route slug for tier / billing / AI key / template management
- Full RBAC with editable role permissions and row-level record visibility
- 1,278 backend tests, 215 frontend tests — all green; biome 0 errors / 0 warnings; typecheck 0; full repo build green
- Sentry + PostHog with PII masking, session replay, per-tenant context binding
- Internationalisation (RTL/LTR), dark mode, white-label theming via per-org CSS variables

This is the kind of surface area I'd expect from a 4-engineer team with three months. I shipped it solo in 4 weeks.

---

## How I work

This is the section recruiters care about most, and it's the one I want you to read carefully. The features above are evidence. This section is what I actually do.

### I think before I write code

Every architectural decision in this project is documented in `AGENTS.md` — currently 28 locked decisions with the date they were locked and what was settled. Every per-module decision lives in that module's `MODULE.md`. Before I write code, I read what's already locked. Before I lock a new decision, I write the alternative I'm rejecting and why I'm rejecting it.

This sounds slow. It is the opposite of slow. The reason I shipped 6 channels' worth of AI in 4 weeks is that I was never re-deciding things I had already decided. The cost of writing the decision down once is two minutes. The cost of re-litigating it three weeks later when I've forgotten my own reasoning is half a day.

### I write the goal before the code

Every task in this project went through `PENDING.md` (with full context — file paths, acceptance criteria, why it matters) and graduated to `SHIPPED.md` (one-line summary with the date). Currently `SHIPPED.md` has hundreds of rows. If you scroll it, you see the project's heartbeat: 12 ships on a heavy day, 2 on a thinking day, 0 on a refactor-only day.

This is not a process I follow because someone told me to. It's how I keep track of what's done so I don't ship the same fix twice and don't forget what's pending when context runs out.

### I delete code as aggressively as I write it

There is a rule I locked early: **side-by-side cleanup, not staged retirement**. When a stage ports a domain to a new architecture, the legacy code for that domain is deleted in the same commit. No `*_V2` flags. No "we'll remove it at the end." No parallel folders.

This rule is the reason the AI v1 → v2 rebuild (the centrepiece of this case study) was actually finished and not abandoned. Most rebuilds die because the team carries both layers for too long, gets bug reports against both, and eventually gives up. I refused to carry both. The cost was two uncomfortable days where some domains were temporarily unreachable from chat. The benefit was a finished rebuild instead of a half-finished one.

### I treat my own product like a paying customer

I had no users. So every Friday I sat down and used Orbitly the way a customer would — created leads, converted them, ran the bulk import, asked the AI to do work, broke things on purpose. Most of the bug reports in `SHIPPED.md` were filed by me against me. The "the AI gives summaries sometimes, not other times" bug that triggered the v1 → v2 rebuild — I found that, not a user. If I'd waited for users to find problems, the product would still be at v1 with all the structural bugs in place.

### I correct the user (or the AI agent helping me) when they're wrong

I locked a behavioural rule (#5 in `AGENTS.md`) that says: when a proposed direction is wrong or based on a wrong premise, name what's wrong, show evidence, surface the real root cause, propose the redirected path. Don't silently comply. This applies to me reviewing my own previous turn, to me reviewing AI suggestions, to anyone working with me on this codebase.

That rule shows up in commits where I caught my own pattern (e.g. patching the same V1 bug class for the third time) and stopped to redirect. Recognising that you're in a failure loop is a meta-skill. I built the loop-recognition into the rules I work under, not into willpower.

### I separate what's locked from what's deferred from what's done

Three documents do three different jobs:
- `AGENTS.md` — locked architectural decisions, do not revisit
- `Future-Enhancements.md` — deferred items with the reason they were deferred (so a future session knows whether to pick them up)
- `SHIPPED.md` — what was done, with the date

The cost of this separation is one extra paragraph per decision. The benefit is that I can re-enter this codebase 6 months from now and recover full context in 20 minutes.

---

## Architectural decisions

I'll cover three. They're the ones that compounded.

### Convex over Postgres + Supabase + WebSockets

Postgres + Supabase would have eaten the first week on real-time wiring, presence, and tenant isolation. For a CRM where the activity feed, the kanban board, and the AI streaming response all need to update live without polling, that is the entire first sprint.

Convex makes reactivity a property of the data layer — every query hook is a live subscription. AI streaming uses the same model: the assistant message is inserted as an empty placeholder and patched progressively from a Node action; the UI re-renders on every patch with no WebSocket plumbing.

**Tradeoff:** Convex is less widely known than Postgres. Onboarding another engineer would need a half-day on the V8 vs Node-runtime split (Node files for `crypto`, AI SDK provider clients, Firecrawl). I accepted that cost because I'm building solo and shipping speed dominated.

### AI v1 — propose/commit with per-user approvals

The first AI architecture was a two-step approval pattern: model calls `create_lead_propose` → UI renders an approval card → user clicks Confirm → `commit_create_lead` runs. Each user toggled their own approval categories in settings.

This was the safest starting point and the right call on day one. It was the wrong call by week 2.

### AI v2 — single capability registry, risk-tier autonomy, channel-agnostic

The architecture I rebuilt to. One directory (`convex/ai/registry/`) declares every capability with a permission key, a risk tier (`safe` / `reversible` / `irreversible`), a channel allow-list, a permissive AI-SDK schema (so weak models can self-correct), and a strict Zod parser that runs inside one wrapper function (`runCapability`).

`runCapability` is a 7-step pipeline: coerce → parse → resolve refs → RBAC → channel gate → risk gate → run. **It never throws.** Failures return a closed Outcome envelope (`ok` / `partial` / `failed` / `repair` / `ask` / `denied` / `needs_step_up`) the model self-corrects from on the next step.

`safe` and `reversible` capabilities auto-execute. `irreversible` ones (bulk delete, settings, role changes) trigger a `needs_step_up` envelope; the user confirms with 2FA; a single-use token re-runs the same call. WhatsApp is hard-blocked from irreversible capabilities regardless of org policy.

Autonomy moved from per-user approvals to one `org.settings.aiAutonomy` policy. Capabilities are gated by `org.settings.modules ∩ user permissions ∩ channel allow-list`. Toggling a module off in settings disables both the capability AND its prompt context — one switch.

**What this decision bought me:**

- Six channels (chat, autonomous, WhatsApp inbound + outbound, MCP, REST) share one execution path
- WhatsApp + MCP + REST came online as thin projectors over the registry — none required changes to capability files
- Bug classes from V1 (schema drift, silent drops, stuck states, cross-channel duplication) became architecturally impossible
- Adding a new capability is one file. Adding a permission is one entry in the SSOT catalog and it auto-derives into seeders, runtime checks, the role-editor UI, and tests

**Tradeoff:** A 2-week side-by-side rewrite mid-project. Every domain (leads, contacts, deals, tasks, notes, files, messaging, dashboard) ported in single edits per domain — no V1/V2 flag, no parallel folders. If the V2 port broke a domain, that domain was broken until the next commit fixed it. Brutal but deliberate. The alternative was carrying two parallel implementations forever and shipping neither.

---

## The hardest problem

The hardest problem was deciding to throw away two months of working AI tooling code because the architecture had a ceiling I couldn't engineer past.

**The symptom.** I noticed I was filing the same bug class against myself for the third week running. The AI would create a lead and the database would be empty. The propose schema and the commit schema would diverge after a single field change. Stuck "thinking..." states needed a manual cleanup cron. Adding WhatsApp meant duplicating the entire tool layer because propose/commit only made sense in chat.

**What I tried first.** I spent a week patching symptoms. Better validation. Better stop conditions. Better retry logic. Better error rendering. Each fix made the code more complex without removing the underlying cause.

**The decision point.** After I caught myself fixing the same bug class for the third time, I stopped writing code. I sat down with `AGENTS.md` open and wrote out the four structural costs the V1 architecture was paying:

1. Two Zod schemas per tool that had to stay in sync forever
2. Per-user approvals that couldn't model org-level autonomy or WhatsApp (no user to ask)
3. A streaming loop that mixed approval state, retry budget, and stop conditions in one function
4. Friendly error envelopes layered on top of thrown exceptions, so the same error rendered three different ways depending on which layer caught it

These were not bugs. They were the architecture. No amount of patching was going to fix them.

**The redirect.** I decided on a new architecture (single registry, risk-tier autonomy, closed Outcome taxonomy, channel-agnostic host) and committed to side-by-side rebuild — V1 deletion in the same commit V2 was added, no flags, no parallel system. It took 2 weeks. WhatsApp inbound, WhatsApp outbound, MCP, REST, and the autonomous engine came online inside the next two weeks because each was a thin projector over the registry — no separate tool layer per channel.

**The meta-skill that mattered.** Recognising you are in a failure loop and stopping. Most engineers will keep patching, because each individual patch looks like progress. The skill is noticing the pattern — three patches against the same bug class — and asking whether the patches are working against the architecture instead of with it.

I built that skill into a written rule (AGENTS.md behavioural rule #5), so the next time it happens I won't have to re-derive it. That's how I operationalise lessons.

---

## What this demonstrates about me

I'm aware no recruiter cares about a feature list. They care about answers to specific questions. Here are the answers this project provides.

**Can I ship complex software solo?**
4 weeks. Multi-tenant, multi-channel, multi-provider AI agent platform. 1,278 backend tests + 215 frontend tests, all green. Build green on every commit. The full repo is open for review.

**Do I think before I code?**
28 locked architectural decisions in `AGENTS.md` with the rejected alternatives written down. A V1 → V2 pivot decided not on opinion but on four structural costs I named on paper before I deleted any code. Behavioural rules I codified after I caught myself in failure patterns.

**Can I handle ambiguity without supervision?**
I had no PM, no design partner, no users. Every priority call was mine. Every spec I wrote was for myself. The product still ships, the tests still pass, and the architectural decisions defend on technical merit alone — not on "the customer asked for it."

**Do I write code that scales past me?**
Per-module `MODULE.md` documents. Single-source-of-truth catalogs for permissions, reserved slugs, notification keys (so adding a permission once auto-derives into seeders, checks, UI, tests). No hardcoded permission lists anywhere. Soft-delete + restore-from-trash on every entity. Side-by-side cleanup so dead code never accumulates.

**Can I recognise when I'm wrong and redirect?**
The V1 → V2 rebuild is the proof. So is the explicit behavioural rule (#5 in `AGENTS.md`) that says: when a direction is wrong, name it, show evidence, propose the redirect — don't silently comply. I apply that rule to my own previous turns, not just to other people's proposals.

**Do I understand the business?**
Multi-tenant isolation, RBAC, owner-admin panel hidden behind an env-configured route slug, BYOK + platform-key fallback for AI cost control, plan-tier gating, LemonSqueezy webhooks with trial + 3-day past-due grace, 9 industry templates because "B2B sales" is too broad to sell. These are decisions I made because I was thinking about the customer's customer, the operator's blast-radius, and the cost-per-token, not because anyone told me to.

---

## What's not here, on purpose

**Paying users.** This was a credibility project, not a market-validation project. I built it to prove the engineering. The next product I build will start with a paid customer brief, not with a cool architecture idea.

**Marketing site polish.** The landing page is functional. It is not optimised for conversion. That work happens after market validation, not before.

**Multi-engineer onboarding.** The codebase is documented well enough that a senior engineer could ramp in two days. It has not been tested with a second engineer because there has not been one. If you are evaluating me for a team role, this is the cleanest possible measurement of how I document for future-me — which is a reasonable proxy for how I'd document for you.

---

## What I'd do differently

**Validate the niche before building.** "AI-native CRM for B2B sales" is too broad to sell. Next time, I start with a single named segment, a paid intent, and a brief — then I build.

**See the architecture ceiling earlier.** I should have seen the V1 ceiling in week 1 of the AI work, not week 2. The signal was there: I was already noticing that propose/commit only made sense in chat. I held onto V1 for one more week than I should have. That cost me three days.

**Stop trying to make weak models look strong.** A meaningful chunk of week 3 went into making free OpenRouter models behave well across the registry. Some of that work was real (validator coercions, repair envelopes). Some was me refusing to accept that a 7B model is a 7B model. The lesson: pick a model floor, document it, and don't engineer around models below the floor.

---

## Repo notes for evaluation

If you want to see how I work, the most useful files to open are:

- `AGENTS.md` — locked architectural decisions, behavioural rules, the operating system I work under
- `SHIPPED.md` — daily heartbeat of the project; one row per shipped scope
- `convex/ai/MODULE.md` — the AI runtime architecture, with the V1 → V2 narrative
- `convex/ai/registry/` — the capability registry that the case study centres on
- `core/*/MODULE.md` — per-module decisions

The codebase is structured so that any one of these files plus a 20-minute read recovers the context to make a decision in that area. That structure is the work.

---

*Written for portfolio, LinkedIn, and job-application use. The repo is open for review on request — read order is `AGENTS.md` → `SHIPPED.md` → `convex/ai/MODULE.md`.*

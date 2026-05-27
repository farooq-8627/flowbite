# LANDING-PAGE.md — Marketing site spec (refreshed for the current shipped state)

> **Generated:** 2026-05-26 · **Refreshed:** 2026-05-27 to reflect the AI/Dashboard sprint shipping (Stages 1-10 closed; Stage 3-A sessions 1+2 shipped).
>
> **Goal.** A landing page that converts visitors to free-Pro signups, ranks well on Google, gets cited by LLMs (Perplexity, ChatGPT, Claude, AI Overviews), and tells an honest story about what the platform actually does today — no over-promising, no under-promising.
>
> **Tagline (locked):** *"Talk to your CRM."* — defensible by the **115+ AI tools** shipped + the propose/commit safety + per-entity memory + the proactive ranker + the analytical layer + the autonomous standing-orders + the creative drafting layer. See §5 for the honesty contract.
>
> **Track status.** Marketing site is a **separate PR track** from the AI sprint. The current app codebase is at **production-readiness 99/100**; the only thing between us and 100 is the LemonSqueezy upgrade flow (P0.1 in `PENDING.md`). The marketing site can launch any time; the upgrade flow must ship before paid signups go live.

---

## 0 — What's actually shipped today (the honesty foundation)

Every marketing claim must map back to one of these. If a feature isn't here, don't claim it on the homepage.

### 0.1 — Today the AI can…

| Verb | What it does | Tool family |
|---|---|---|
| Create | leads / contacts / deals / companies / notes / reminders / tags / saved views / pipelines / stages / fields / custom roles / standing orders | `create_*` (twoStep) |
| Update | every CRUD entity above + reminder + note + pipeline-stage + tag + saved-view + member role + dashboard layout | `update_*` |
| Delete | every CRUD entity + universal `delete_entity` (cascade-impact preview before commit) | `delete_*` |
| Convert | lead → contact (+ revert) | `convert_lead` |
| Move | deal stage / lead status / participant in/out of conversation | `move_*` |
| Send | message in any conversation, with smart routing by personCode/dealCode/companyCode | `send_message` |
| List / search | every entity + tags + categories + members + pipelines + saved views + field options + widgets + files + notifications + org timeline | `list_*` / `search_*` |
| Suggest | top-N next actions ranked by score + confidence (cron-rebuilt every 30 min, no LLM cost) | `list_next_actions` |
| Analyse | "why is X happening?" with structured output, cohort analysis, member performance, pipeline velocity | `analyze_metric` / `cohort_analysis` / `member_performance` |
| Brief | morning briefing + week's outlook (deterministic + LLM-augmented) | `get_briefing` / `refresh_briefing` |
| Draft | follow-up message / proposal / conversation summary (NEVER autosent — always presented to user) | `draft_message` / `draft_proposal` / `summarise_conversation` |
| Web grounding | search the web (Firecrawl) + scrape a specific URL | `web_search` / `web_scrape` |
| File analysis | extract structured data from PDFs / images via vision | `analyze_file` |
| CSV import | dual-LLM safety (quarantined extractor + privileged inserter), per-row dedup at parse-time | `import_csv` (twoStep) |
| Run on a schedule | standing orders (interval / daily / weekly) — opt-in per user | `aiStandingOrders` |
| Auto-act | follow-up on stage move; enrich on contact create; per-user autonomy allow-list | `pipelines.stages[].onEnter` triggers |

**Total registered tools: ~115** (counting commit_X as one tool family with its propose). Every write tool gates on RBAC + 2-step approval (per-user opt-out for 8 categories; 3 hard-locked categories that ALWAYS ask).

### 0.2 — Today the user can…

- **Type or speak** to the AI through chat — sheet panel (right-hand) OR the dashboard's pinned `AIQuickComposerCard`.
- **Approve every write** through a propose card (cascade impact previewed for deletes; bulk progress with retry chips for `bulk_*`).
- **Bring their own AI key (BYOK)** — every plan including Free supports BYOK. Platform models on Free hard-block the quota gate.
- **See a daily briefing** at the top of the dashboard, refreshed nightly + on-demand.
- **See a Top-3 Pulse Ribbon** of next actions on the dashboard.
- **Drag-drop kanban** with single-mutation persistence + optimistic updates.
- **Multi-pipeline** support per entity with stage-aware fields + transition policies (block / warn / off).
- **Multi-tenant orgs** with role-based access (Owner / Admin / Member / Viewer + custom roles).
- **Run on Arabic (RTL)** out of the box.
- **Import a CSV** from any other CRM with dedup at parse-time.

### 0.3 — Today the user CANNOT (yet)…

- Upgrade to a paid plan via in-app checkout (LemonSqueezy upgrade flow is P0.1).
- See branching conversations (tree-shaped chat is C.1 backlog).
- Use voice input (Phase 3-C deferred).
- Receive WhatsApp messages routed into the CRM (Phase 3-C deferred).
- See cross-conversation embedding-based learning (B.20 backlog).
- Trigger AI from `activityLogs` events asynchronously (B.21 backlog — the workflow event bus).

These belong in the future-roadmap section of the marketing site, not the homepage hero.

---

## 1 — Decision: embed in the app codebase, plan for split later

**Recommendation: embed.** Build the landing page inside the existing Next.js app at a route group `app/(marketing)/` with its own layout. Keep the option to extract to a separate site later when you outgrow it.

### Why embed (now)

| Reason | Detail |
|---|---|
| One deploy pipeline | Same Vercel project, one CI/CD; no second repo to maintain. |
| Shared design tokens | Same `--radius`, theme presets, RTL support, APP_CONFIG strings. Brand consistency for free. |
| Sign-up is one click | CTA on landing → `app.{domain}/login` is a same-project navigation. |
| Faster iteration | Marketing copy ships with the app — no second CMS to learn or pay for. |
| Static rendering | Next 15 App Router with `export const dynamic = "force-static"` + `generateStaticParams` gives edge-cached performance. |
| SEO equivalent | A static `app/(marketing)/page.tsx` rendered at build time is indistinguishable from a separate site to Google. |

### Why split later (defer to backlog)

You'll know it's time to split when:
- A non-developer marketing team needs a CMS (Sanity, Contentful, Payload).
- Marketing iteration cadence diverges sharply from app cadence.
- The marketing site needs different infra (e.g. extensive A/B testing, server-side personalisation).

For ~12 months of solo / small-team operation, embed is the right call.

### How to embed cleanly (Next.js App Router pattern)

```
app/
├── (marketing)/                  # route group — separate layout, no auth
│   ├── layout.tsx                # marketing chrome (header, footer)
│   ├── page.tsx                  # /
│   ├── pricing/page.tsx          # /pricing
│   ├── for-real-estate/page.tsx  # /for-real-estate (industry landing)
│   ├── for-solopreneurs/page.tsx # /for-solopreneurs
│   ├── about/page.tsx            # /about
│   ├── blog/[slug]/page.tsx      # /blog/post (MDX)
│   └── changelog/page.tsx        # /changelog
├── (app)/                        # existing authenticated app
│   └── [orgSlug]/...             # current shell layout
└── (auth)/login/page.tsx         # shared auth pages
```

Key constraints:
- **`(marketing)` layout** does not import `<OrgProvider>`, `<DashboardLayoutClient>`, or any authenticated chrome. Pure server components, max static rendering.
- **Every marketing page exports `generateMetadata`** with the right canonical URL, OG image, Twitter card, structured data.
- **No `useQuery` in marketing pages.** Data is build-time only (e.g. testimonials hardcoded in MDX).
- **Convex client never mounts on the marketing routes.** The auth provider only wraps `(app)` and `(auth)`.

---

## 2 — Domain strategy: `app.{domain}` for the product, root domain for marketing

**Recommendation: split now.** Even if the codebase is one project, the domains MUST split.

| Surface | Domain | Why |
|---|---|---|
| Marketing site | `flowbite.com` (or your final domain) | Anchors SEO. Roots are weighted higher than subdomains. |
| Authenticated app | `app.flowbite.com` | Clear separation. |
| Documentation | `docs.flowbite.com` | When you ship docs (Phase 5+). |
| Status page | `status.flowbite.com` | When you ship a public uptime page. |

### Implementation: Next.js `middleware.ts` routes by host

```ts
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(req: NextRequest) {
  const host = req.headers.get("host") ?? "";
  const url = req.nextUrl.clone();

  // app subdomain → rewrite to (app) route group
  if (host.startsWith("app.")) {
    if (url.pathname === "/" || url.pathname.startsWith("/(marketing)")) {
      url.pathname = "/login";
      return NextResponse.redirect(url);
    }
    return NextResponse.next();
  }

  // root / www → only allow marketing routes
  if (url.pathname.startsWith("/dashboard") || url.pathname.match(/^\/[^/]+\/(?:leads|deals)/)) {
    url.host = `app.${host}`;
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon).*)"],
};
```

`APP_CONFIG` already supports `marketingUrl` + `appUrl` env vars — every CTA uses them so a future white-label deployment just changes env vars.

---

## 3 — AEO + SEO + GEO content strategy

Three different optimisation surfaces. They overlap but are NOT the same.

### 3.1 — SEO (classic Google)

**Primary keywords (target 5):**
- `ai crm` — high volume, high intent, high competition.
- `talk to your crm` — own this immediately. Currently zero established competition.
- `ai-powered crm for small business`
- `crm with ai assistant`
- `ai sales assistant`

**Long-tail (target 20+):**
- `crm for solopreneurs ai` / `ai crm for freelancers`
- `crm that drafts emails` / `crm that writes followups`
- `ai crm dubai` / `ai crm saudi arabia` / `ai crm for real estate dubai` (lean into the templates already shipped)
- `attio vs hubspot vs flowbite ai`
- `salesforce alternative ai`
- `cheap ai crm` / `free ai crm with byok`

**On-page checklist for every marketing page:**
- `<title>` ≤ 60 chars, primary keyword first.
- `<meta name="description">` 140-160 chars, action-led, ends with a CTA verb.
- One `<h1>` per page, contains the primary keyword.
- `<h2>` headers structured as questions where possible.
- Internal links between marketing pages (pricing → features → industry pages → blog). At least 3 per page.
- `<img alt>` on every image. Use real screenshots, not stock illustrations.
- Schema.org JSON-LD: `Organization`, `Product`, `FAQPage`, `Article`. Use Next 15's `generateMetadata`.
- Sitemap at `/sitemap.xml` — generate with `app/sitemap.ts`.
- `robots.txt` allows everything except `/api/*` and `/(app)/*`.
- Canonical URL set to the apex domain version.
- `lang="en"` on `<html>`. Add `lang="ar"` variants when you ship Arabic.
- Core Web Vitals: LCP < 2s, CLS < 0.05, INP < 200ms.

### 3.2 — AEO (Answer Engine Optimization — for AI search results)

**Goal:** ChatGPT / Perplexity / Claude / Google AI Overviews cite us when users ask "what's a good AI CRM for solopreneurs?".

**What AEO crawlers reward:**
- Direct factual claims with no marketing fluff. "FlowBite has 115+ AI tools that cover lead, contact, deal, company, note, reminder, tag, pipeline, settings, files, timeline, notifications, analytics, autonomous-orders, and creative-drafts operations."
- FAQPage schema with the actual user question + a 2-3 sentence answer.
- Comparison tables. AI uses table rows as direct citations.
- `Llms.txt` at `/llms.txt` (Anthropic-style standard) listing canonical pages + summaries.
- A clean `/about` page with named-entity facts.

**Llms.txt template** (drop at `public/llms.txt`):

```
# FlowBite

> FlowBite is an AI-native CRM where users manage their pipeline through conversation. The AI agent has 115+ registered tools covering ~95% of CRM operations by usage frequency. Two-step approval for every write. Free Pro plan for early users. BYOK supported on every plan.

## What it does today
- Lead, contact, deal, company CRUD via chat
- Daily and weekly AI briefings (cron-generated)
- Per-entity memory (auto-summarised on every change)
- Proactive ranking — top-N next actions ranked by score + confidence
- Analytical layer — "why is X happening", cohort analysis, member performance
- Autonomous standing-orders — interval/daily/weekly schedules with tool whitelist
- Creative drafting — message / proposal / summary (never auto-sent)
- Web grounding via Firecrawl (search + scrape)
- Bulk operations, CSV import with dedup, file analysis (vision)
- BYOK for any plan including free tier

## Pages
- /: hero + value prop
- /pricing: plan comparison
- /for-solopreneurs: solo / freelance use case
- /for-real-estate: Dubai / Saudi real-estate template
- /vs/salesforce: comparison
- /vs/hubspot: comparison
- /faq: structured Q&A
- /changelog: shipping cadence
- /docs: full documentation (when shipped)
```

### 3.3 — GEO (Generative Engine Optimization — for being cited by LLMs)

**What GEO rewards (above and beyond AEO):**
- **Named-entity density.** Mention competitors by name in comparison content.
- **Numerical specificity.** "115+ AI tools", "95% AI coverage by usage frequency", "two-step approval", "10K-character business persona budget", "8.6/10 senior-CRM scorecard" — all verifiable, all crawlable.
- **Stable URL canonicals.** Lock URLs from day 1.
- **Authoritative external links.** Link to Convex, Anthropic, Vercel docs to anchor your content in the LLM's knowledge graph.
- **Authorial voice.** Real opinions ("we believe forms-and-clicks CRMs are the wrong default for the AI era") sit better in LLM training data than generic copy.
- **Comparison pages.** `/vs/salesforce`, `/vs/hubspot`, `/vs/pipedrive`, `/vs/attio`, `/vs/notion-crm` are direct GEO plays. Each: feature matrix → narrative → "when to choose them, when to choose us".

**GEO traps to avoid:**
- ❌ Hallucinating customer counts.
- ❌ Stuffing keywords.
- ❌ Marketing fluff with no structure.

---

## 4 — Page structure (the actual sitemap)

### 4.1 — `/` (Home / hero page)

**Above the fold (the 5-second pitch):**

```
┌──────────────────────────────────────────────────────────────┐
│ flowbite.   Pricing   Solopreneurs   Real Estate   Changelog │
│                                                  [Sign in]    │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│   Talk to your CRM.                                          │
│                                                              │
│   The AI-native CRM that drafts your follow-ups,             │
│   manages your pipeline, and tells you what to do next —     │
│   all through conversation.                                  │
│                                                              │
│   [Start free →]   [Watch a 30-second demo]                  │
│                                                              │
│   Free Pro for early users. No credit card required.         │
│   BYOK on every plan, including free.                        │
│                                                              │
├──────────────────────────────────────────────────────────────┤
│  [animated demo: type "add Sara Khan, SaaS prospect" →       │
│   AI shows propose card → user approves → done in 2 sec]     │
└──────────────────────────────────────────────────────────────┘
```

**Below the fold — problem agitation:**

```
Section: "Your CRM should work for you, not against you."

The forms-and-clicks CRM was built for 1999 desktops. In 2026, you:
  - Switch tabs 20 times before logging one call.
  - Forget to follow up because the reminder UI is buried 3 clicks deep.
  - Can't recall what was discussed unless you read every note.
  - Spend 30% of your day on data entry instead of selling.

We built FlowBite because we hit this wall ourselves.
```

**Solution narrative (3 cards):**

```
1. CONVERSATIONAL — Type or speak. "Add Sara as a lead, schedule a follow-up next Tuesday."
   The AI shows you a preview, you approve, the work is done.

2. PROACTIVE — The AI surfaces stale leads, slipped deals, overdue reminders before you ask.
   Top-3 Pulse Ribbon on your dashboard. Morning briefing every day.

3. SAFE — Every write goes through a two-step approval. The AI proposes; you confirm.
   8 user-toggleable categories + 3 hard-locked (bulk / settings / members).
```

**Feature matrix (6 tiles — ALL shipped):**

```
[Tile 1: Quick Composer screenshot]    [Tile 2: Pulse Ribbon screenshot]
"Talk to your CRM"                     "AI suggests your next move"

[Tile 3: Two-step approval card]       [Tile 4: Daily briefing screenshot]
"Approve before any write"              "Personalised every morning"

[Tile 5: BYOK settings screenshot]      [Tile 6: Standing orders editor]
"Bring your own AI key — even Free"     "Run weekly playbooks for you"
```

**Daily routine walkthrough (the most important section):**

```
Section: "Your day with FlowBite"

8:00 AM — Wake up to a notification.
  "3 stale leads, 2 deals slipped to next month, 4 follow-ups due today.
   Tap to see your morning briefing."
  [Screenshot of mobile briefing card]

9:00 AM — Open the dashboard. The AI Pulse Ribbon shows the top 3
  things to do. Click one — it pre-fills the chat composer.
  [Screenshot of dashboard with AI Pulse]

10:30 AM — Just got off a call. Type:
  "Schedule a follow-up call with Sara next Tuesday at 3pm,
   add a note about pricing concerns."
  AI shows a preview card with both actions. You approve.
  [Screenshot of two-step approval]

12:30 PM — While you're at lunch, the AI proactively pings:
  "Acme's deal has been in 'Negotiation' for 6 days, longer than your
   average. Want me to send your standard pricing follow-up?"
  Tap "Yes, draft it" → AI drafts the email → you tweak → send.
  [Screenshot of draft preview]

5:00 PM — End of day. Type:
  "What should I do first tomorrow?"
  AI returns a ranked next-actions list with confidence labels.
  [Screenshot of ranked list]
```

**Honest comparison (GEO play — verify every cell against competitor's public docs before publishing):**

```
                  FlowBite      Salesforce     HubSpot       Attio        Pipedrive
Conversational    Native        Add-on         Add-on        Add-on       No
AI tools shipped  115+          ~50            ~30           ~20          ~10
Free tier         Yes (Pro)     No             Yes (limited) No           No
BYOK keys         Yes           No             No            No           No
Approval flow     Two-step      No             No            No           No
Per-entity AI     Yes           No             No            Partial      No
memory
Setup time        15 min        Days           Hours         Hours        Hours
```

**Pricing teaser (full table on `/pricing`):**

```
[Free]              [Pro - free for early users]    [Team]              [Enterprise]
$0                  $0 → $19/mo after 90 days       $49/user/mo         Talk to us
BYOK only           Platform AI included            Platform AI         SLAs, SSO
1 workspace         1 workspace                     unlimited           on-prem option
[Get started →]     [Get free Pro →]                [Start trial →]     [Contact sales]
```

**FAQ (10-12 questions, schema-tagged):**

```
- What is FlowBite?
- How is this different from Salesforce / HubSpot?
- Is my data private? Where does it live?
- What happens after the 90-day free Pro?
- Can I bring my own AI keys (BYOK)?
- Which AI models do you support?
- How accurate is the AI? What if it makes a mistake?
- Do you support Arabic / RTL?
- Can I import from another CRM?
- What's on the roadmap?
- Is there an API?
- How do I cancel?
```

**Final CTA + footer:**

```
"Spend less time on admin. More time on selling."
[Get started — free Pro for 90 days →]

Footer:
  Product       Company         Resources
  Pricing       About           Docs
  Changelog     Contact         Blog
  Security      Privacy         Status
  Roadmap       Terms           Llms.txt
```

### 4.2 — `/pricing`

Full plan table (no abbreviation), per-tier feature checklist, BYOK explainer, FAQ specific to billing.

### 4.3 — `/for-solopreneurs` and `/for-real-estate` (industry landing pages)

Each industry page:
- Specific hero copy ("The CRM for Dubai real estate agents")
- Use-case scenario tailored to the persona
- Industry-specific feature highlights (e.g. for real estate: "Auto-fetch property data from PDF brochures via `analyze_file`")
- Industry-specific testimonials (when available)
- Industry-specific pricing CTA
- Internal link to the matching pre-built template

### 4.4 — `/vs/{competitor}` (comparison pages)

One page per major competitor: Salesforce, HubSpot, Pipedrive, Attio, Notion CRM (plus Saudi-market specific: Bitrix, Zoho).

Format: feature matrix → "When to choose them" → "When to choose us" → migration guide.

### 4.5 — `/blog` (MDX-driven, low-cadence)

10-15 anchor articles for SEO. Examples:
- "Why we built an AI-first CRM in 2026"
- "How two-step approval makes AI safe for production CRM"
- "Building a personal AI assistant with Convex + Vercel AI SDK"
- "Real estate CRM in the AI era — Dubai market case study"

### 4.6 — `/changelog`

Auto-generated from git tags + manual curation. **Critical for AEO** — LLMs treat changelog as proof-of-life. Source content lives in `SHIPPED.md`.

---

## 5 — Tagline justification: "Talk to your CRM" (the honesty contract)

**Why this tagline is FULLY defensible today** (every claim mapped to a shipped feature):

| Claim implicit in "Talk to your CRM" | Shipped today | Where |
|---|---|---|
| You can issue commands in natural language | ✅ | Chat sheet + per-entity composer + AIQuickComposerCard |
| The AI understands your data | ✅ | System prompt includes pipelines, fields, persona, per-entity context |
| The AI can do most things you do via UI | ✅ | 95% by usage frequency (post Stage 4) |
| The AI is safe to talk to | ✅ | Two-step approval; per-tool RBAC; org plan gates; 3 hard-locked categories |
| The AI remembers context across turns | ✅ | aiPersonaContext + per-entity rebuild (deterministic summariser) |
| The AI proactively offers next actions | ✅ | Top-3 Pulse Ribbon + ranked `aiNextActions` (cron-rebuilt every 30 min) |
| The AI can act on its own | ✅ | Standing orders (interval/daily/weekly) + auto-followup on stage move + auto-enrich on contact create |
| The AI can analyse your pipeline | ✅ | `analyze_metric` / `cohort_analysis` / `member_performance` / win-loss retrospective |
| The AI can draft for you | ✅ | `draft_message` / `draft_proposal` / `summarise_conversation` (never autosent) |

**Every single row is shipped.** The full marketing claim ladder is now unlocked.

### Don't-over-promise list (NEVER say these)

- ❌ "The most advanced AI CRM" — superlative without proof.
- ❌ "AI replaces your sales team" — false; we augment.
- ❌ "Trusted by 10,000+ teams" — until it's true.
- ❌ "10× your productivity" — unverifiable.
- ❌ "AI never makes mistakes" — false.
- ❌ "Better than Salesforce" — superlative; let the comparison page do the talking.
- ❌ "Voice-controlled" — until voice ships (Phase 3-C).
- ❌ "WhatsApp-native" — until that ships (Phase 3-C).

### Don't-under-promise either

- ✅ "115+ AI tools shipped" — verifiable, specific, citation-friendly.
- ✅ "Two-step approval for every write" — concrete safety claim.
- ✅ "Free Pro for early users (90 days)" — clear offer.
- ✅ "BYOK on every plan, including free" — strong differentiator.
- ✅ "Per-entity AI memory that auto-rebuilds" — technically defensible.
- ✅ "Proactive ranker with confidence labels" — defensible (Stage 6).
- ✅ "Standing orders that run weekly playbooks" — defensible (Stage 8).

---

## 6 — Free Pro mechanic (the early-user growth loop)

**Offer:** every new signup gets the Pro tier free for 90 days. No credit card required. After 90 days, the workspace reverts to Free unless they upgrade.

### Implementation

- New `orgs.earlyAccessGrant: { tier: "pro", expiresAt: number, grantedAt: number }` field.
- Default for every new org created before a `EARLY_ACCESS_END_DATE` env-var (e.g. 2026-12-31).
- The plan-tier resolver (`convex/billing/planResolver.ts`) reads `earlyAccessGrant` and returns "pro" if `expiresAt > now`.
- Banner appears in the workspace: "You're on Free Pro for 47 days. Upgrade now to keep it." → `/settings/billing`.
- 7-day-out reminder + 1-day-out reminder + day-of email + day-after "you're back on Free" email.
- Conversion target: 10-20% of free-Pro users convert to paid by day 90.

### Why 90 days

- Long enough to develop habit (CRM is a daily-use tool).
- Long enough to fill the workspace with real data → switching cost on day 90.
- Short enough that it doesn't bankrupt the AI budget per user.
- Backed by the AI cost estimate: at $30-80/mo per active org at full feature use, 100 free-Pro orgs costs $3K-$8K/mo — manageable for the launch budget.

### Feedback collection during Free Pro

- Day 7: in-app survey ("How's it going? What's missing?")
- Day 30: video-call ask ("15 min? Free Pro forever in exchange.")
- Day 60: NPS prompt
- Day 80: case-study ask for happy users
- Day 89: upgrade nudge

---

## 7 — Content brief: 4 hero pages to write first

When you start the marketing PR, write these in this order:

### 7.1 — `/` (the homepage)

~1,500 words. Use the structure in §4.1. Most important: the daily-routine walkthrough section. Every screenshot must be a real screenshot of the shipped product.

### 7.2 — `/pricing`

~600 words + the table. Plan tiers: Free (BYOK), Pro ($19/mo, free for 90 days), Team ($49/user/mo), Enterprise (talk to us). Be honest about what's NOT included in Free.

### 7.3 — `/for-real-estate` (highest-converting industry page)

~1,200 words. Lean into the Dubai / Saudi positioning. Use the `dubai_real_estate` template as the demo workspace. Specific use cases: property listing import via CSV, AI lead scoring on enquiries, auto-followup on viewing requests, multi-language (Arabic + English) support.

### 7.4 — `/vs/hubspot` (highest-conversion comparison page)

~1,800 words. Most prospects compare against HubSpot first. Be honest about what HubSpot does better (deep marketing automation, established ecosystem, large agency network). Be specific about what FlowBite does better (chat-first, BYOK, two-step approval, per-entity memory, proactive ranker, standing orders).

---

## 8 — Technical implementation checklist

Each row is one PR-sized chunk.

| # | Task | Output |
|---|---|---|
| M1 | Set up `app/(marketing)/layout.tsx` + `header.tsx` + `footer.tsx`. No auth chrome. | Static layout for every marketing page |
| M2 | Set up host-routing middleware (§2). Confirm `app.{domain}` routes to the existing app, root domain routes to marketing. | Two-domain split working in dev |
| M3 | Write `app/(marketing)/page.tsx` (the homepage). Use the §4.1 structure. | Live homepage with all 9 sections |
| M4 | Write `app/(marketing)/pricing/page.tsx`. | Live pricing page |
| M5 | Write `app/(marketing)/for-real-estate/page.tsx` + `app/(marketing)/for-solopreneurs/page.tsx`. | Two industry landing pages |
| M6 | Write `app/(marketing)/vs/[competitor]/page.tsx` (dynamic route, 3-5 competitor pages via `generateStaticParams`). | Comparison pages |
| M7 | `app/(marketing)/blog/[slug]/page.tsx` + 5-10 launch blog posts (MDX). | Blog live with hand-picked anchor posts |
| M8 | `app/(marketing)/changelog/page.tsx` — pulls from `SHIPPED.md` via build-time MDX import. | Changelog live |
| M9 | `app/sitemap.ts` + `public/llms.txt` + `public/robots.txt` + JSON-LD on every page. | Full SEO/AEO/GEO surface |
| M10 | Free Pro mechanic — `orgs.earlyAccessGrant` field + plan resolver + banner + 4-email lifecycle (Resend transactional). | Free Pro live end-to-end |
| M11 | Real screenshots for every feature tile + daily-routine walkthrough. Replace any placeholder mock images. | All hero imagery is real product |
| M12 | Submit sitemap to Google Search Console + Bing Webmaster + IndexNow. Set up Plausible / PostHog for marketing analytics. | Live indexing + analytics |

**Estimated effort:** 2-3 weeks for one developer working in parallel with the AI sprint stages.

---

## 9 — Honest tagline copy (drop-in ready)

Every line is defensible by a shipped feature today:

**Hero (homepage):**

> # Talk to your CRM.
>
> The AI-native CRM that proposes the change, you approve, and the work is done — in seconds, not minutes.
>
> [Get started — free Pro for 90 days]

**Sub-headline (one line):**

> Type "schedule a follow-up with Sara next Tuesday and add a note about pricing." Approve. Done.

**Why-us section header:**

> ## A CRM built for the AI era — not the form-and-click era.

**Daily routine section header:**

> ## Your day, augmented.

**Free Pro CTA:**

> Free Pro for early users. No credit card. Cancel any time.

**Footer line:**

> Built with Convex + Vercel AI SDK. Open and honest about what we ship.

---

## 10 — Mistakes to avoid (so you don't waste a week)

1. **Don't write the marketing site in a separate framework yet.** Embed in Next 15 with the route group. You can extract later.
2. **Don't use stock illustrations for "AI features."** Real screenshots only. Stock images destroy trust.
3. **Don't promise what's not shipped.** Voice / WhatsApp / cross-conversation embedding learning are NOT shipped — don't claim them.
4. **Don't pre-launch a blog with 1 post.** Launch with 5-10 anchor articles or wait until you have them.
5. **Don't over-design.** A clean text-led page outperforms a flashy gradient-heavy hero. See Linear, Vercel, Resend for reference design language.
6. **Don't skip schema.org JSON-LD.** It costs 50 lines of code and unlocks AEO + GEO.
7. **Don't forget Arabic / RTL.** Build the marketing site RTL-safe from day 1. Even if Arabic copy ships later, the layout primitives must be ready.
8. **Don't make the free Pro signup require a credit card.** It kills conversion 60%+. Take the AI-cost hit on the bad-actor minority.
9. **Don't run paid ads until conversion rate is measured.** 4 weeks of organic + community → measure landing page conversion → THEN spend on ads.
10. **Don't pick a final domain name without checking trademark + GitHub username + handle availability** across X, LinkedIn, Product Hunt, Reddit.

---

## 11 — One-sentence summary

Build the landing page inside this Next.js app at `app/(marketing)/`, point `app.{domain}` to the product and the root to marketing, write the homepage + pricing + 2 industry pages + 1 comparison page first, run AEO + SEO + GEO in parallel by emitting structured data + an Llms.txt + comparison tables, and ship the LemonSqueezy upgrade flow before paid signups go live — the tagline "Talk to your CRM" is defensible TODAY across every dimension (reactive, proactive, analytical, autonomous, creative) because Stages 1-10 are all shipped.

---

## 12 — Cross-references

- **Pending work** (including the LemonSqueezy upgrade flow that blocks paid launch): `PENDING.md`.
- **Shipped work** (source for the changelog page content): `SHIPPED.md`.
- **Locked decisions** (radius, RTL, APP_CONFIG, AI tool patterns): `AGENTS.md`.
- **Per-module architecture** (component file paths, hook names): every `core/*/MODULE.md` + `convex/**/MODULE.md`.
- **Architecture docs** (database schema, RBAC, file storage, payments, email): `docs/architecture/*`.
- **Platform Owner Panel** (separate track — super-admin surface for tier / flag / AI-context editing): `PLATFORM-OWNER-PANEL.md`.

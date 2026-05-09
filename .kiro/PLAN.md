# Orbitly — Master Plan

> **Product**: Orbitly — "Stop navigating your CRM. Just talk to it."
> **Model**: Conversational AI-native CRM for small service businesses (agencies, consultancies, B2B, Gulf/MENA).
> **Last Updated**: 2026-04-26 | Architecture locked. Ready for Phase 1 construction.

---

## What We're Building — One Statement

A **conversational CRM** where the primary interface is natural language. Users talk to their data. The AI reads from and writes to Convex using a defined tool layer. No menu navigation. No form-filling. No switching tools.

> "Who haven't I contacted in over a week?"
> "Move Ahmed to qualified and set a follow-up for Thursday."
> "Create a deal for TechBridge — $15K, closing end of May."

**NOT building**: workflow automation, Zapier competitor, integration marketplace.

---

## Architecture — One Diagram

```
User types → AI Assistant (Claude via Anthropic API)
                ↓ calls tools
          Tool Layer (11 Convex internal tools in convex/ai/tools/)
                ↓
          Convex Database (single source of truth, org-scoped)
                ↓ reflected in
          CRM UI / PM UI / Client Portal / AI response
```

**Stack**: Next.js 16 + Convex + Tailwind 4 + shadcn + Vercel AI SDK + Trigger.dev + Resend + Anthropic Claude

---

## Folder Model — Core vs Features

| Folder | Contents | Plan-gateable? |
|---|---|---|
| `core/` | Shell, Entities, AI, Settings, Timelines, Kanban, DataTable, Onboarding, Notifications, Command Palette, CSV Import | ❌ Never |
| `features/` | AI Automation, Project Management, Client Portal, Integrations, Industry Templates | ✅ Yes |

**Rule**: If the CRM cannot function or be managed without it → `core/`. If it adds NEW capabilities → `features/`.

---

## Phase Sequence

| Phase | What | Sellable | Price |
|---|---|---|---|
| **0** | Foundation (DONE) — auth, RBAC, multi-tenancy, activity logs, notifications | — | — |
| **1** | Shell + Onboarding + Settings — layout, sidebar, nav, module guard, 3-step wizard | — | — |
| **2** | CRM Core — 6 entity scaffold, pipelines, dynamic fields, tags, dedup, CSV import, kanban | ✅ | $150/mo |
| **3** | AI Assistant — chat panel, 11 tools, agentic loop, role-aware | ✅ | $300/mo |
| **4** | Project Management — won deal → project → tasks → milestones | ✅ | $400/mo |
| **5** | Client Portal — external client/partner role, scoped AI, portal routes | ✅ | $500/mo |
| **6** | Integration Bridges — HubSpot inbound, Zapier POST, Slack notify, Notion pull | ✅ | $500/mo |
| **7** | AI Automation — morning briefing, proactive suggestions, email/WhatsApp draft | ✅ | $600/mo |
| **8** | Arabic RTL + Gulf Polish — full AR locale, RTL CSS, PDPL compliance | ✅ | $800/mo |

**Revenue gate**: Don't start Phase N+1 until paying clients from Phase N validate product-market fit.

---

## Core Architecture Decisions

| Decision | Rationale |
|---|---|
| **Convex as sole DB** | Real-time subscriptions. Server-side auth. No separate API layer. |
| **orgId on every row** | `orgId` from server-side context only — never from client payload |
| **AI as Core** | Always visible, cross-cutting, IS the brand identity. Not plan-gated. |
| **4 entity scaffolds** | 6 entity types share EntityListPage, EntityDetailPage, EntityFormDialog, EntityCard |
| **Two timelines** | Unified (RBAC-filtered audit log) + Activity Chat (people + AI on-behalf messages) |
| **Feature dirs not packages** | One DB, one RBAC, one AI. Feature flags enable/disable. No NPM packages. |
| **Settings in core** | Cannot manage org without settings. Role-gated but NEVER plan-gated. |
| **CSV in core** | Every org needs to import existing data during onboarding. |
| **Route topology** | `/[locale]/dashboard/[orgSlug]/...` — explicit org context in URL |

---

## Data Flow — Complete Entity Lifecycle

```
lead (source: manual/csv/integration/AI)
  ↓ qualified
contact (full record, lead linked)
  ↓ deal opened
deal (pipeline stages, dynamic fields)
  ↓ marked "won"
project (auto-created, history preserved) [Phase 4]
  ↓ client invited
client portal (scoped view, scoped AI) [Phase 5]
```

Every step linked. No context lost. AI has full timeline access.

---

## AI System — How It Works

```
Route: POST /api/ai/chat
  → validates auth from server session (NEVER from body)
  → calls internal.ai.processChat (Convex internalAction, "use node")
    → builds system prompt from DB (org, user, role, field defs, today)
    → filters tools by role BEFORE Claude API call
    → runs agentic loop (Claude → tools → Claude → ...)
    → logs every tool call in activityLogs with actorType: "ai"
  → streams response back to useChat() on frontend
```

**11 Core Tools**: search_crm, update_entity, create_entity, add_note, set_reminder, get_entity_detail, get_summary, draft_email, search_by_date, bulk_update, send_chat_message

---

## RBAC — Role Summary

| Role | Scope | Access |
|---|---|---|
| `super_admin` | Platform | Manages orgs from outside. Cannot enter orgs. |
| `owner` | Org | Full access + billing |
| `admin` | Org | Full operational access, no billing |
| `member` | Org | Assigned records, create/update |
| `viewer` | Org | Read-only |
| `client` | Connection | Portal-only, scoped to their project |
| `partner` | Connection | Shared projects only, no financial data |

Full permission matrix: `.gemini/agents/base/rbac.md`

---

## Acceptance Criteria (Every Slice)

- [ ] No browser console errors
- [ ] Data scoped to org — wrong org cannot read
- [ ] Wrong role redirects correctly
- [ ] Disabled module → route redirects, sidebar item disappears
- [ ] `logActivity` called after every mutation
- [ ] Notification created where relevant
- [ ] Loading skeleton while query pending
- [ ] Empty state renders correctly
- [ ] Renders without overflow at 390px viewport
- [ ] `pnpm build` exits zero errors
- [ ] No Biome lint errors

---

## Revenue Targets

| Milestone | Clients | MRR |
|---|---|---|
| Phase 2 done | 3 | $450/mo |
| Phase 3 done | 8 | $2,400/mo |
| Phase 4 done | 15 | $6,000/mo |
| Phase 5 done | 25 | $12,500/mo |
| Month 12 | 50 | $25,000/mo |

---

## Detailed Module Specs

Full build-ready specs for all 34 modules: `.gemini/agents/base/deep-plan.md`
Full permission matrix: `.gemini/agents/base/rbac.md`
Current build state: `.gemini/agents/base/context.md`
Active todos: `.gemini/agents/base/todos.md`
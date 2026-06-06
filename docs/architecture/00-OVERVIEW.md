# Orbitly Architecture — Master Overview

> **Purpose**: Single source of truth for Orbitly's foundation architecture. Read this first, then read specific docs for depth. For module-specific rules, read the module's `MODULE.md`.

---

## 1. Design Philosophy

| Principle | What It Means |
|---|---|
| **Core vs Features** | `core/` = necessities (always available). `features/` = differentiators (can be plan-gated). |
| **Scaffold-first** | Shared scaffolds (EntityListPage, EntityDetailPage, etc.) reduce entity creation to ~5 files. |
| **Reactive-first** | Convex subscriptions are the primary data channel. Polling and REST are escape hatches. |
| **Secure by default** | All database access through authenticated custom functions with RBAC. |
| **AI-native** | AI is core infrastructure, not a plugin. Persistent panel, 11 tools, role-aware. |

---

## 2. Technology Map

| Layer | Technology | Role |
|---|---|---|
| **Database + Backend** | Convex | Reactive queries, mutations, actions, file storage, cron jobs |
| **Auth** | @convex-dev/auth | Password + OAuth, session management |
| **Access Control** | convex-helpers | Custom functions, RLS, context injection |
| **AI** | Vercel AI SDK + Anthropic Claude | Streaming chat, useChat(), ToolLoopAgent |
| **Payments** | LemonSqueezy + Razorpay | Global MoR + India UPI |
| **Background Jobs** | Trigger.dev | Long-running tasks, cron schedules, queuing |
| **Frontend** | Next.js 16 + React 19 | App Router, server components, streaming |
| **i18n** | next-intl | Locale routing, message bundles |
| **UI** | shadcn + Tailwind CSS 4 | Design system, accessible components |
| **Forms** | react-hook-form + zod | Client + server validation |
| **Client State** | zustand | UI-only state (sidebar, modals, local prefs) |
| **Kanban** | @dnd-kit/core | Drag-and-drop board views |
| **DataTable** | @tanstack/react-table | Entity list views |
| **Email** | Resend | Transactional email |
| **Code Quality** | Biome | Linting + formatting |

---

## 3. Architecture Layers

```
┌─────────────────────────────────────────────────────────┐
│                    PRESENTATION LAYER                    │
│  Next.js App Router → Pages, Layouts, Server Components  │
│  core/ → Shell, Entities, AI, Timelines, Kanban          │
│  features/ → Settings, PM, Portal, Integrations          │
├─────────────────────────────────────────────────────────┤
│                     HOOK / STORE LAYER                   │
│  useQuery/useMutation (Convex)  │  zustand (UI state)    │
│  Shared hooks (useCurrentUser, usePermissions, etc.)     │
├─────────────────────────────────────────────────────────┤
│                    CONVEX BACKEND LAYER                   │
│  Authenticated functions → RBAC → Database               │
│  AI tools (convex/ai/tools/) + tool registry             │
│  HTTP endpoints → Webhooks                               │
├─────────────────────────────────────────────────────────┤
│                   BACKGROUND / JOBS LAYER                │
│  Trigger.dev tasks → email, imports, sync                │
│  Convex crons → cleanup, reminders                       │
├─────────────────────────────────────────────────────────┤
│                    EXTERNAL SERVICES                     │
│  LemonSqueezy │ Resend │ Anthropic │ Trigger.dev         │
└─────────────────────────────────────────────────────────┘
```

---

## 4. Document Index

| # | Document | What It Covers |
|---|---|---|
| 00 | **This file** | Master overview, philosophy, tech map |
| 02 | `02-DATABASE-SCHEMA.md` | All Convex tables, indexes, relationships |
| 03 | `03-AUTH-AND-RBAC.md` | Authentication flow, roles, permissions |
| 04 | `04-MULTI-TENANCY.md` | Orgs, data isolation |
| 05 | `05-NOTIFICATION-SYSTEM.md` | In-app + email notifications |
| 06 | `06-ACTIVITY-LOGS.md` | Audit trail system |
| 07 | `07-FEATURE-FLAGS.md` | Internal flags + plan gating |
| 08 | `08-BACKGROUND-JOBS.md` | Trigger.dev tasks, Convex crons |
| 09 | `09-FILE-STORAGE.md` | Convex storage strategy |
| 10 | `10-PAYMENTS.md` | Subscription integration |
| 11 | `11-EMAIL-SYSTEM.md` | Resend integration |
| 13 | `13-CACHING-AND-PERFORMANCE.md` | Indexing, denormalization |
| 15 | `15-FEATURE-MODULE-PATTERN.md` | How to build any module |
| 16 | `16-RULES-AND-CONVENTIONS.md` | Coding rules, naming, conventions |

### Module-specific rules and checklists:
→ See each module's `MODULE.md` in `core/` or `features/`
→ See `.gemini/agents/base/rules.md` for global rules + cross-module integration rules

---

## 5. Folder Structure

> Full structure in `.gemini/agents/base/folder-structure.md`

```
orbitly/
├── core/                         # Necessities (never plan-gated)
│   ├── shell/                    # DashboardLayout, Sidebar, TopNav
│   ├── entities/                 # 6 entity types + 4 scaffolds
│   ├── ai/                       # AI chat panel + tools
│   ├── timelines/                # Unified + Activity Chat
│   ├── kanban/                   # @dnd-kit board primitives
│   ├── datatable/                # @tanstack/react-table primitives
│   ├── onboarding/               # 3-step wizard
│   ├── notifications/            # Bell + toast + badges
│   └── command-palette/          # Cmd+K search
│
├── features/                     # Differentiators (can be plan-gated)
│   ├── settings/                 # All settings pages (RBAC-scoped)
│   ├── ai-automation/            # Morning briefing, proactive AI
│   ├── project-management/       # PM on top of CRM
│   ├── client-portal/            # External client access
│   ├── integrations/             # Inbound data bridges
│   ├── industry-templates/       # Config bundles per industry
│   └── csv-import/               # Bulk import wizard
│
├── convex/                       # Backend
├── app/                          # Next.js routes
├── components/                   # Shared UI (shadcn)
├── lib/                          # Frontend utilities
└── trigger/                      # Background tasks
```

---

## 6. Decision Log

| Decision | Rationale |
|---|---|
| **Convex as sole database** | Real-time subscriptions. Schema at deploy time. Built-in file storage. |
| **Custom authenticated functions** | Inject user/org into ctx automatically. No boilerplate. |
| **AI as core, not feature** | Always visible, cross-cutting, IS the brand identity. |
| **4 entity scaffolds** | 6 entities share 4 scaffolds. New entity = ~5 files. |
| **Two timelines** | Unified (audit) + Activity Chat (communication). Separation prevents confusion. |
| **Feature modules as directories** | Not NPM packages. One DB, one RBAC, one AI layer. Feature flags enable/disable. |
| **Trigger.dev for heavy, Convex crons for light** | Convex crons: 30-second tasks. Trigger.dev: minutes-long jobs. |

---

## 7. What's NOT in Docs (Orbitly-specific, documented elsewhere)

These are documented in MODULE.md files and `.gemini/agents/base/` files:
- Dynamic field system → `core/entities/MODULE.md`
- Pipeline/stage system → `core/entities/MODULE.md`
- AI tool registry → `core/ai/MODULE.md`
- Two-timeline architecture → `core/timelines/MODULE.md`
- Entity scaffold pattern → `core/entities/MODULE.md`

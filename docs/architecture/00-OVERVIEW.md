# FlowBite Base Architecture — Master Overview

> **Purpose**: This document is the single source of truth for the FlowBite base architecture. Every folder, table, pattern, and convention traces back to decisions documented here. Read this first, then drill into numbered companion docs for depth.

---

## 1. Design Philosophy

### 1.1 Core Principles

| Principle | What It Means |
|---|---|
| **Modular by default** | Every feature lives in a self-contained folder with 1–2 connection points to the base. Rip a folder out and the app still compiles. |
| **Define once, import everywhere** | Types, validators, enums, and constants live in `convex/_shared/` (backend) or `lib/` (frontend). No duplication. |
| **Reactive-first** | Convex subscriptions are the primary data channel. Polling and REST are escape hatches, not norms. |
| **Secure by default** | All database access goes through authenticated custom functions with RLS. Public functions are explicitly opted-in. |
| **Progressive complexity** | Start with the simplest implementation that works. Add caching, workflows, feature flags only when a feature genuinely needs them. |

### 1.2 What "Plugin-Like Feature" Means

A **feature module** is a vertical slice that owns:
- Its own Convex functions (queries, mutations, actions)
- Its own frontend routes, components, and hooks
- Its own types and validators

It connects to the base through exactly:
1. **A registration file** — one line in `convex/schema.ts` importing the feature's tables, one line in the route tree.
2. **Shared context** — authenticated user context and org/workspace context provided by the base.

See `15-FEATURE-MODULE-PATTERN.md` for the complete template.

---

## 2. Technology Map

| Layer | Technology | Role |
|---|---|---|
| **Database + Backend** | Convex ^1.33 | Reactive queries, mutations, actions, file storage, cron jobs |
| **Auth** | @convex-dev/auth ^0.0.91 | Password + OAuth providers, session management |
| **Access Control** | convex-helpers ^0.1.114 | Custom functions, RLS, custom context injection |
| **Payments** | @convex-dev/stripe | Checkout sessions, subscriptions, webhooks |
| **Workflows** | @convex-dev/workflow (to install) | Durable multi-step backend workflows |
| **Background Jobs** | Trigger.dev SDK ^4.4 | Long-running tasks, cron schedules, queuing |
| **Frontend Framework** | Next.js 16 + React 19 | App Router, server components, streaming |
| **Internationalization** | next-intl ^4.8 | Locale routing, message bundles, server/client i18n |
| **UI Components** | shadcn + Tailwind CSS 4 | Design system, accessible components |
| **Forms** | react-hook-form + zod ^4 | Client validation, server validation reuse |
| **Client State** | zustand ^5 | UI-only state (sidebar, modals, local preferences) |
| **Email** | Resend ^6.9 | Transactional email delivery |
| **Logging** | Pino ^10 | Structured JSON logging |
| **Analytics** | PostHog (client + server) | Product analytics, feature flags (external) |
| **Error Tracking** | Sentry ^10.46 | Error capture, performance monitoring |
| **Media** | next-cloudinary ^6.17 | Image/video upload and transformation |
| **Code Quality** | Biome ^2.4 | Linting + formatting (replaces ESLint + Prettier) |

---

## 3. Architecture Layers

```
┌─────────────────────────────────────────────────────────┐
│                    PRESENTATION LAYER                    │
│  Next.js App Router → Pages, Layouts, Server Components  │
│  Feature UIs → Self-contained route groups               │
├─────────────────────────────────────────────────────────┤
│                     HOOK / STORE LAYER                   │
│  useQuery/useMutation (Convex)  │  zustand (UI state)    │
│  Feature hooks (useNotifications, usePermissions, etc.)  │
├─────────────────────────────────────────────────────────┤
│                    CONVEX BACKEND LAYER                   │
│  Authenticated functions → RLS → Database                │
│  Feature functions (notifications/, payments/, etc.)      │
│  HTTP endpoints → Webhooks (Stripe, etc.)                │
├─────────────────────────────────────────────────────────┤
│                   BACKGROUND / JOBS LAYER                │
│  Trigger.dev tasks → email, PDF generation, imports      │
│  Convex cron jobs → cleanup, reminders, sync             │
│  Durable workflows → multi-step approval, onboarding     │
├─────────────────────────────────────────────────────────┤
│                    EXTERNAL SERVICES                     │
│  Stripe │ Resend │ Cloudinary │ PostHog │ Sentry         │
└─────────────────────────────────────────────────────────┘
```

---

## 4. Document Index

| # | Document | What It Covers |
|---|---|---|
| 00 | **This file** | Master overview, philosophy, tech map |
| 01 | `01-FOLDER-STRUCTURE.md` | Complete directory tree with rationale |
| 02 | `02-DATABASE-SCHEMA.md` | All Convex tables, indexes, relationships |
| 03 | `03-AUTH-AND-RBAC.md` | Authentication flow, roles, permissions, custom functions |
| 04 | `04-MULTI-TENANCY.md` | Orgs, workspaces, data isolation |
| 05 | `05-NOTIFICATION-SYSTEM.md` | In-app + email notifications, hooks, templates |
| 06 | `06-ACTIVITY-LOGS.md` | Audit trail system |
| 07 | `07-FEATURE-FLAGS.md` | Internal feature flag tables + PostHog integration |
| 08 | `08-BACKGROUND-JOBS.md` | Trigger.dev tasks, Convex crons, queuing |
| 09 | `09-FILE-STORAGE.md` | Convex storage + Cloudinary strategy |
| 10 | `10-PAYMENTS.md` | Stripe subscriptions, checkout, webhooks |
| 11 | `11-EMAIL-SYSTEM.md` | Resend integration, templates, background sending |
| 12 | `12-DASHBOARD-UI.md` | Dashboard layout, navigation, responsive patterns |
| 13 | `13-CACHING-AND-PERFORMANCE.md` | Convex reactive caching, denormalization, indexing |
| 14 | `14-CONNECTIONS-FEATURE.md` | Connections feature (client-admin-partner) — reference implementation |
| 15 | `15-FEATURE-MODULE-PATTERN.md` | How to build any feature module (template + rules) |
| 16 | `16-RULES-AND-CONVENTIONS.md` | Coding rules, naming, file conventions, TypeScript |

---

## 5. Decision Log

| Decision | Rationale |
|---|---|
| **Convex as sole database** | Real-time subscriptions eliminate polling. Schema enforcement at deploy time. Built-in file storage. Reduces infra to one service. |
| **Custom authenticated functions over raw query/mutation** | Injects `user` and `org` into context automatically. Enforces auth on every call. Eliminates repetitive `getUserIdentity()` boilerplate. |
| **Separate users table from auth** | Auth table is managed by @convex-dev/auth. Our `users` table stores app-specific profile data, linked via `tokenIdentifier`. |
| **Org-based multi-tenancy** | Every data row belongs to an `orgId`. Queries filter by org. Enables B2B SaaS from day one. |
| **Feature modules over monolith routes** | Each feature is a portable folder. New features don't touch existing code. Deletion is one folder removal + two line deletions. |
| **Trigger.dev for heavy jobs, Convex crons for light ones** | Convex crons are great for 30-second tasks (cleanup, reminders). Trigger.dev handles minutes-long jobs (email blasts, PDF generation, data imports). |
| **Zustand only for UI state** | Convex handles all server state reactively. Zustand is exclusively for ephemeral client concerns (sidebar open, modal state, local search filters). |
| **Zod validators shared with Convex** | Define Zod schemas → derive Convex validators via `zodToConvex()` from convex-helpers. Single source of truth for client + server validation. |

---

## 6. What's NOT In Base (Future Features)

These are explicitly scoped out of the base architecture but the base is designed to accommodate them as feature modules:

- **AI / LLM Integration** — Will be a feature module with its own Convex actions calling AI APIs via Trigger.dev tasks.
- **Automations** — Rule engine feature module. Triggers → conditions → actions.
- **Third-party Integrations** — Each integration is its own feature module with webhook handlers.
- **Real-time Messaging / Chat** — Feature module leveraging Convex subscriptions.
- **Approval Workflows** — Feature module using durable workflows.
- **Advanced Analytics / Reporting** — Feature module with custom dashboards.

The base provides the hooks (notifications, activity logs, permissions, workflows) that these features plug into.

---

## 7. Getting Started Sequence

1. Read this overview
2. Read `01-FOLDER-STRUCTURE.md` to understand where everything lives
3. Read `02-DATABASE-SCHEMA.md` to understand the data model
4. Read `03-AUTH-AND-RBAC.md` to understand the security model
5. Read `15-FEATURE-MODULE-PATTERN.md` to understand how to build features
6. Read `16-RULES-AND-CONVENTIONS.md` before writing any code
7. Dive into any specific system doc (05-14) as needed

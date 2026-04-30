# Tech Stack Reference

> Authoritative list of every library, its version, and its role. Never introduce a library not on this list without updating this file.
> Last Updated: 2026-04-21

---

## Core Framework

| Library | Version | Role |
|---|---|---|
| Next.js | 16.1.7 | App Router, server components, streaming, API routes |
| React | ^19.2.4 | UI runtime |
| TypeScript | ^5.9.3 | Type safety |

## Backend (Convex)

| Library | Version | Role |
|---|---|---|
| convex | ^1.33.1 | Database, reactive queries/mutations/actions, file storage, cron |
| @convex-dev/auth | ^0.0.91 | Password + OAuth session management |
| @auth/core | ^0.37.4 | GitHub + Google OAuth provider configs for @convex-dev/auth |
| convex-helpers | ^0.1.114 | `customQuery`, `customMutation`, `customCtx`, `zodToConvex`, RLS |

## AI Layer (Phase 3 — Hybrid Architecture, approved Session 12)

| Library | Version | Role |
|---|---|---|
| ai | TBD — install in Phase 3 | Vercel AI SDK — `ToolLoopAgent`, `useChat()` hook, `createAgentUIStreamResponse()`, Zod tool validation. Model accessed via `gateway("anthropic/claude-sonnet-4")`. |
| @ai-sdk/anthropic | TBD — install in Phase 3 | Anthropic provider for Vercel AI SDK. Connects to Claude API under the hood. |

**Architecture**: Next.js API route (`/api/ai/chat`) = thin streaming proxy → Convex `internalAction` (Node.js `"use node"` runtime) = all AI logic, tool execution, RBAC. Frontend uses `useChat()` hook for streaming UI.

## Background Jobs

| Library | Version | Role |
|---|---|---|
| @trigger.dev/sdk | 4.4.3 | Long-running tasks, email blasts, PDF gen, data imports |
| @trigger.dev/build | 4.4.3 | Build extensions for Trigger.dev deployment |

## UI

| Library | Version | Role |
|---|---|---|
| tailwindcss | ^4.2.1 | Utility-first CSS |
| shadcn | ^4.1.1 | Accessible component primitives (installs into `components/ui/`) |
| @base-ui/react | ^1.3.0 | Headless UI primitives |
| lucide-react | ^1.7.0 | Icon set |
| sonner | ^2.0.7 | Toast notifications |
| tw-animate-css | ^1.4.0 | Tailwind animation utilities |
| class-variance-authority | ^0.7.1 | Component variant system |
| clsx + tailwind-merge | latest | `cn()` utility |

## Data Display (install in Phase 2 — CRM views)

| Library | Version | Role |
|---|---|---|
| @tanstack/react-table | ^8.x | Headless table logic — sorting, filtering, pagination, column visibility, grouping. Powers `_datatable/DataTable.tsx`. |
| @dnd-kit/core | ^6.x | Drag-and-drop primitives — Kanban board columns + card reordering. Powers `_kanban/KanbanBoard.tsx`. **Chosen over `@saas-ui-pro/kanban` (Chakra-only, paid) and `react-beautiful-dnd` (deprecated).** |
| @dnd-kit/sortable | ^8.x | Sortable preset for @dnd-kit/core — handles card drag within + between columns. |
| @dnd-kit/utilities | ^3.x | CSS utilities for drag-and-drop transforms. |

**Architecture note**: `@tanstack/react-table` is headless — all rendering is done by our shadcn components in `core/datatable/`. `@dnd-kit` is also headless — our `core/kanban/` components own all visual rendering. This is the same pattern saas-ui-pro uses internally but with Chakra UI instead of shadcn.

## Forms & Validation

| Library | Version | Role |
|---|---|---|
| react-hook-form | ^7.72.0 | Form state management |
| @hookform/resolvers | ^5.2.2 | Zod integration for react-hook-form |
| zod | ^4.3.6 | Schema validation — shared between client and Convex via `zodToConvex()` |

## State Management

| Library | Version | Role |
|---|---|---|
| zustand | ^5.0.12 | UI-only state (sidebar open/closed, modal state, local filters) |

**Rule**: Zustand = UI state only. Convex = all server/data state. Never use zustand for data fetched from Convex.

## Internationalization

| Library | Version | Role |
|---|---|---|
| next-intl | ^4.8.3 | Locale routing `[locale]`, message bundles, server+client i18n |

- Messages live in `messages/en.json` (add `messages/ar.json` for Arabic RTL in Phase 8)
- Route: `app/[locale]/...`
- Always use `useAppRouter()` from `lib/hooks/useAppRouter.ts` — never hardcode locale in paths

## External Services

| Library | Version | Service |
|---|---|---|
| resend | ^6.9.4 | Transactional email delivery |
| @sentry/nextjs | ^10.46.0 | Error tracking + performance monitoring |
| posthog-js | ^1.364.1 | Client-side analytics + feature flags |
| posthog-node | ^5.28.8 | Server-side analytics |
| next-cloudinary | ^6.17.5 | Image/video upload + transformation |
| pino | ^10.3.1 | Structured JSON logging |
| pino-pretty | ^13.1.3 | Dev log formatting |

## Code Quality

| Library | Version | Role |
|---|---|---|
| @biomejs/biome | ^2.4.9 | Linting + formatting (replaces ESLint + Prettier) |
| @convex-dev/eslint-plugin | ^1.2.0 | Convex-specific lint rules |

## Scripts

```json
"dev": "npm-run-all --parallel dev:frontend dev:backend",
"dev:frontend": "next dev",
"dev:backend": "convex dev",
"build": "next build",
"format": "biome format --write .",
"lint-check": "biome lint --check .",
"check": "biome check --apply .",
"typecheck": "tsc --noEmit"
```

## Package Manager

- **pnpm** 10.32.1 — always use `pnpm`, never `npm` or `yarn`

## NOT Yet Installed (planned)

| Library | When | Role |
|---|---|---|
| @tanstack/react-table | Phase 2 (CRM views) | Headless table logic for list views |
| @dnd-kit/core | Phase 2 (CRM views) | Kanban drag-and-drop |
| @dnd-kit/sortable | Phase 2 (CRM views) | Kanban sortable preset |
| @dnd-kit/utilities | Phase 2 (CRM views) | DnD CSS transform utilities |
| ai | Phase 3 | Vercel AI SDK — `ToolLoopAgent`, `useChat()`, streaming, Zod tool validation |
| @ai-sdk/anthropic | Phase 3 | Anthropic provider for Vercel AI SDK — `gateway("anthropic/claude-sonnet-4")` |
| stripe | Phase 2 (Billing) | Stripe Node.js SDK — Checkout session creation + webhook validation (BILLING-01, BILLING-02) |
| @stripe/stripe-js | Phase 2 (Billing) | Stripe.js browser SDK — redirect to Checkout, confirmPayment |
| @convex-dev/stripe | Phase 8 (advanced billing) | Stripe subscription webhooks + Convex integration helpers |
| @react-email/components | Phase 3 | Email templates for Resend |
| twilio | Phase 7 | WhatsApp Business API for Gulf market notifications |

## AI Stack Detail (Phase 3 — Hybrid Architecture)

| Component | Detail |
|---|---|
| Model | `claude-sonnet-4` via `gateway("anthropic/claude-sonnet-4")` |
| SDK | `ai` (Vercel AI SDK) + `@ai-sdk/anthropic` (Anthropic provider) |
| Frontend | `useChat()` hook from `ai/react` — streaming, message history, pending state |
| API Route | `app/api/ai/chat/route.ts` — thin streaming proxy. Auth validation → calls Convex internalAction → streams response. |
| AI Runtime | Convex `internalAction` with `"use node"` — full Node.js, DB access, not publicly callable |
| Agent Pattern | `ToolLoopAgent` from Vercel AI SDK — automatic tool loop with maxSteps. Replaces manual `while (stop_reason === "tool_use")` loop. |
| Tool Definition | `tool()` from `ai` package with Zod schemas. Tools call Convex `internalMutation`/`internalQuery`. |
| System Prompt | Built at query time: org name, user name, role, today's date, all custom field definitions for this org |
| Logging | Every AI tool call logged in `activityLogs` with `actorType: "ai"` |
| RBAC — Layer 1 | Tool availability: different roles get different tool sets |
| RBAC — Layer 2 | Data filtering: tool handlers strip sensitive fields based on role |
| RBAC — Layer 3 | System prompt: includes role-specific instructions and boundaries |
| RBAC — Layer 4 | No PII in prompts: AI receives record IDs, resolves data in tools |
| Confirmation | AI must confirm before delete, bulk update, or irreversible stage changes |
| Persistence | `aiConversations` + `aiMessages` tables — history scoped to orgId + userId |
| UI | `ChatSheet` slide-over panel — always accessible from dashboard |
| State | Zustand store: `chatStore.ts` — isOpen, pendingMessage (UI state only) |
| Integrations | Sync-first via Trigger.dev → `integrationEvents` table. On-demand live fetch for real-time queries. |

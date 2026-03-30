# Tech Stack Reference

> Authoritative list of every library, its version, and its role. Never introduce a library not on this list without updating this file.

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

- Messages live in `messages/en.json` (add `messages/ar.json` for Arabic RTL)
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
| @convex-dev/workflow | Phase 5 | Durable multi-step backend workflows |
| @convex-dev/stripe | Phase 7 (billing) | Stripe checkout + subscription webhooks |
| @react-email/components | Phase 3 | Email templates |

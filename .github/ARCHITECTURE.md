# Architecture Decisions

## Stack
Next.js 16 · Convex (DB, realtime, auth) · shadcn/ui · Tailwind · next-intl · Trigger.dev · PostHog · Sentry · Stripe · Cloudinary · Pino

## Multi-Tenancy (Model A)
- One Convex project. Every table has `tenantId`.
- `tenantId` always from `ctx.user.tenantId` server-side — never from client payload.
- URL: `/[locale]/(dashboard)/[workspace]/[role]/feature` — `[workspace]` = tenant slug.
- Roles: `admin | partner | client | super-admin`

## Central Rule — No Cross-Feature Imports
Features never import React hooks or components from each other. Feature A needing Feature B data → A calls `api.functions.B.*` inside its own `_convex/` hooks.

- The Convex function is the shared contract, not the React hook.
- **Exception:** Features that always co-appear can share sub-folders within one slice.

## Module Suppression (4 layers, all required)
| Layer | Where | What |
|---|---|---|
| 1 Middleware | `middleware.ts` | Blocks route; redirects to workspace home |
| 2 Navigation | `app-sidebar.tsx` | Omits nav items |
| 3 Route layout | `ModuleGuard` component | Live Convex sub; redirects if toggled off |
| 4 Component | `useModuleEnabled(id)` | Cross-feature widgets return null silently |

## UI Tiers
| Tier | Location | Domain knowledge |
|---|---|---|
| 1 Primitives | `src/components/ui/` | None |
| 2 Shared | `src/components/{data-display,feedback,layout}/` | None |
| 3 Feature | `src/features/[name]/components/` | Yes |

Test: "If the feature slice was removed, would this component still make sense?" Yes = Tier 1/2. No = Tier 3.

## Hook Layers (max 3)
```
Component → Business Hook (UX) → Convex Hook (DB) → Convex API
```
- Simple reads: skip Business Hook (2 layers).
- Mutations with error/toast/redirect logic: all 3 layers.
- Never 4. If you feel you need one, collapse the nearest two.

## Provider Order (outer → inner)
```
Theme → Convex → ConvexAuth → next-intl → AppInitCtx → Toaster → ModalRegistry → PostHog
```
All composed in **one file only**: `features/_shell/providers/index.tsx`

## Cross-Slice Operations
| Case | Solution |
|---|---|
| Atomic (approve + transition work item) | One Convex mutation handles both |
| Async (close work item → commission calc) | `ctx.scheduler.runAfter(0, internal.fn, payload)` |
| Long-running (email, AI, PDF generation) | Trigger.dev task called via scheduled Convex action |

Backend Convex functions freely query any table — cross-slice isolation is frontend-only.

## Module Access Gate
Both must be true: `moduleId in tenant.modules` **AND** `tenant.plan >= module.minimumPlan`

Plans: `trial | starter | professional | enterprise`
Statuses: `trial | active | past_due | canceled | suspended`
- `past_due` / `canceled` → billing banner shown, login allowed
- `suspended` → all routes redirect to payment page

## Billing State Flow
```
Stripe webhook → src/app/api/webhooks/stripe/route.ts
  → convex/functions/tenants/mutations.ts (subscriptionStatus update)
  ← features/_shell/hooks/use-init-app.ts reads on init
  ← features/_shell/components/billing-alert.tsx renders banner
```

## AI-Ready Fields (add as `v.optional` now, zero impact if empty)
- `workItems`: `aiSummary`, `aiCategory`, `aiPriority`, `aiTags`, `aiSentimentScore`
- `users`: `aiMatchScore`
- `formSubmissions`: `aiAnalysis`, `aiExtractedEntities`
- `messages`: `aiTranslation`

Never call AI providers directly. Always through `convex/lib/aiProvider.ts` wrapper.

## i18n
- All Tailwind spacing uses logical properties: `ps-`/`pe-` not `pl-`/`pr-`.
- `dir="rtl"` on `<html>` for Arabic. CSS logical properties throughout.
- DB bilingual fields: `label` + `labelAr`. Render: `labelAr ?? label` in Arabic locale.
- User-generated content (messages, notes, submissions): stored and displayed as-is.

## Analytics & Observability
- **PostHog**: client-side only. `.capture()` in feature hooks after mutation success. Never in Convex functions.
- **Sentry**: two root config files only (`sentry.client.config.ts`, `sentry.server.config.ts`). Features never configure it.
- **Logger**: `import { logger } from '@/lib/logger'` everywhere. Pino singleton.
- **Feature flags**: stored in Convex `tenants.modules` — not PostHog. PostHog flags for non-critical UI experiments only.

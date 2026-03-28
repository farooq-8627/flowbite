# Folder Structure

```
project/
├── convex/
│   ├── schema.ts                    — single source of DB truth; all tables + tenantId
│   ├── auth.ts                      — Convex Auth config
│   ├── http.ts                      — HTTP endpoint routing (Stripe, Trigger.dev webhooks)
│   ├── lib/
│   │   ├── withUser.ts              — query/mutation builder; injects authenticated user
│   │   ├── withRole.ts              — role-checked mutation builder
│   │   ├── permissions.ts           — server-side PERMISSION_MAP lookup
│   │   ├── logActivity.ts           — writes to activityLogs table (called from mutations)
│   │   ├── notifications.ts         — writes to notifications table (called from mutations)
│   │   ├── validateTransition.ts    — state machine guard for workflow transitions
│   │   └── aiProvider.ts            — thin AI provider wrapper (never call OpenAI directly)
│   └── functions/
│       └── [domain]/                — one folder per domain
│           ├── queries.ts
│           ├── mutations.ts
│           └── index.ts
│
├── trigger/                         — Trigger.dev task definitions
│   ├── emails/
│   ├── calculations/
│   ├── ai/
│   └── approvals/
│
├── src/
│   ├── app/[locale]/
│   │   ├── (auth)/                  — login, signup, invite accept
│   │   ├── (dashboard)/
│   │   │   ├── layout.tsx           — DashboardLayout: auth guard + useInitApp
│   │   │   ├── [workspace]/
│   │   │   │   ├── layout.tsx       — resolves workspace slug, verifies membership
│   │   │   │   ├── admin/           — admin role sub-routes
│   │   │   │   ├── partner/         — partner role sub-routes
│   │   │   │   ├── client/          — client portal sub-routes
│   │   │   │   └── super-admin/     — platform management sub-routes
│   │   │   └── page.tsx             — redirects to role home
│   │   └── api/
│   │       └── webhooks/
│   │           └── stripe/route.ts  — Stripe webhook handler
│   │
│   ├── features/
│   │   ├── _shell/                  — app chrome (NOT a business feature)
│   │   │   ├── providers/           — all React context providers (index.tsx composes all)
│   │   │   ├── layouts/             — DashboardLayout, WorkspaceLayout, role layouts
│   │   │   ├── components/          — AppSidebar, TopNav, ModuleGuard, ModalRenderer,
│   │   │   │                          NotificationBell, BillingAlert, WorkspaceSwitcher
│   │   │   ├── hooks/               — useCurrentUser, useCurrentWorkspace, useInitApp,
│   │   │   │                          usePermission
│   │   │   └── config/navigation.ts — sidebar nav definition (module-aware)
│   │   │
│   │   ├── auth/
│   │   ├── work-items/
│   │   ├── workflows/
│   │   ├── approvals/
│   │   ├── connections/
│   │   ├── messaging/
│   │   ├── partners/
│   │   ├── clients/
│   │   ├── dynamic-forms/
│   │   ├── settings/
│   │   ├── super-admin/
│   │   ├── reports/
│   │   ├── commissions/
│   │   ├── notifications/
│   │   └── ai/                      — optional module, disabled by default
│   │
│   ├── components/                  — Tier 1 + 2 only (no domain knowledge)
│   │   ├── ui/                      — shadcn primitives: Button, Input, Dialog…
│   │   ├── data-display/            — DataTable, StatusBadge, Timeline, EmptyState, Avatar
│   │   ├── feedback/                — Toast config, Alert, Skeleton, LoadingSpinner
│   │   └── layout/                  — Page, Section, PageHeader wrappers
│   │
│   ├── lib/
│   │   ├── utils.ts                 — cn(), formatDate(), formatCurrency()
│   │   ├── schema-builder.ts        — builds Zod schema at runtime from formConfig
│   │   ├── email.ts                 — React Email + Resend thin wrapper
│   │   └── logger.ts                — Pino singleton (import this everywhere)
│   │
│   ├── constants/
│   │   ├── roles.ts                 — USER_ROLES[], ROLE_HIERARCHY{}, ROLE_LABELS{ar}
│   │   ├── modules.ts               — MODULE_IDS{}, MODULE_REGISTRY[], PLAN_MODULES{}
│   │   ├── permissions.ts           — ACTIONS{}, PERMISSION_MAP{}
│   │   ├── events.ts                — ACTIVITY_ACTIONS{}, NOTIFICATION_TYPES{}
│   │   ├── status.ts                — WORK_ITEM_STATUSES[], APPROVAL_STATUSES[]…
│   │   └── index.ts                 — re-exports all
│   │
│   ├── hooks/                       — app-wide utility hooks
│   │   ├── use-debounce.ts
│   │   ├── use-local-storage.ts
│   │   ├── use-media-query.ts
│   │   └── use-module-enabled.ts    — reads from useInitApp; used by components
│   │
│   └── types/
│       ├── common.ts                — shared cross-feature types
│       └── index.ts
│
└── public/
    └── locales/
        ├── en/[feature].json        — one file per feature
        └── ar/[feature].json
```

## Convex Domain Folders
```
convex/functions/
├── users/
├── tenants/
├── workItems/
├── workflows/
├── approvals/
├── connections/
├── messaging/
├── formConfigs/
├── formSubmissions/
├── activityLogs/
├── notifications/
├── commissions/
├── attachments/
├── ai/
└── background/      — internal actions that call Trigger.dev HTTP API
```

# Folder Structure — Target Architecture

> This is the TARGET structure. Files not yet created are marked `[TODO]`. Created files are unmarked.

---

## Root

```
flowbite/
├── app/                              # Next.js App Router
├── components/                       # Global shared UI
├── features/                         # Feature modules [TODO - create folder]
├── convex/                           # Convex backend
├── trigger/                          # Trigger.dev tasks
├── lib/                              # Frontend utilities
├── messages/                         # i18n message bundles
├── i18n/                             # next-intl config
├── public/                           # Static assets
└── .github/agents/base/              # This agent
```

---

## `app/` — Next.js Routes

```
app/
├── [locale]/                         ✅ EXISTS
│   ├── globals.css                   ✅ EXISTS
│   ├── layout.tsx                    ✅ EXISTS
│   ├── page.tsx                      ✅ EXISTS (landing)
│   ├── global-error.tsx              ✅ EXISTS
│   ├── signin/                       ✅ EXISTS (partial)
│   ├── signup/                       [TODO]
│   ├── forgot-password/              [TODO]
│   └── dashboard/                    [TODO]
│       ├── layout.tsx                [TODO] auth guard + DashboardLayout
│       ├── page.tsx                  [TODO] overview/home
│       ├── settings/                 [TODO]
│       │   ├── profile/page.tsx      [TODO]
│       │   ├── organization/page.tsx [TODO]
│       │   ├── members/page.tsx      [TODO]
│       │   ├── billing/page.tsx      [TODO]
│       │   └── notifications/page.tsx[TODO]
│       └── admin/                    [TODO]
│           ├── page.tsx              [TODO]
│           ├── users/page.tsx        [TODO]
│           └── feature-flags/page.tsx[TODO]
└── api/
    ├── trigger/route.ts              [TODO] Trigger.dev webhook
    └── webhooks/stripe/route.ts      [TODO] Stripe webhook
```

---

## `components/` — Global UI

```
components/
├── ConvexClientProvider.tsx          ✅ EXISTS
├── ui/                               ✅ EXISTS (partial — add shadcn components)
│   ├── button.tsx                    ✅ EXISTS
│   ├── card.tsx                      [TODO]
│   ├── input.tsx                     [TODO]
│   ├── dialog.tsx                    [TODO]
│   ├── dropdown-menu.tsx             [TODO]
│   ├── table.tsx                     [TODO]
│   ├── tabs.tsx                      [TODO]
│   ├── badge.tsx                     [TODO]
│   ├── skeleton.tsx                  [TODO]
│   └── sonner.tsx                    [TODO]
├── providers/                        [TODO]
│   ├── PostHogProvider.tsx           [TODO]
│   └── ThemeProvider.tsx             [TODO]
├── dashboard/                        [TODO]
│   ├── Sidebar.tsx                   [TODO]
│   ├── SidebarNav.tsx                [TODO]
│   ├── Navbar.tsx                    [TODO]
│   ├── NotificationBell.tsx          [TODO]
│   └── UserMenu.tsx                  [TODO]
├── data/                             [TODO]
│   ├── DataTable.tsx                 [TODO]
│   ├── EmptyState.tsx                [TODO]
│   └── LoadingState.tsx              [TODO]
└── forms/                            [TODO]
    ├── FormField.tsx                 [TODO]
    └── FormFileUpload.tsx            [TODO]
```

---

## `features/` — Feature Modules

```
features/
├── _registry.ts                      [TODO] register all features here
├── connections/                      [TODO] reference implementation
│   ├── README.md
│   ├── types.ts
│   ├── constants.ts
│   ├── index.ts
│   ├── register.ts
│   ├── components/
│   └── hooks/
└── [other features]/                 [TODO] add per phase
```

---

## `convex/` — Backend

```
convex/
├── schema.ts                         ✅ EXISTS (minimal — needs base tables)
├── auth.ts                           ✅ EXISTS (Password provider)
├── auth.config.ts                    ✅ EXISTS
├── http.ts                           ✅ EXISTS (empty router)
├── myFunctions.ts                    ✅ EXISTS (demo — delete after Phase 0)
│
├── _shared/                          [TODO]
│   ├── validators.ts                 [TODO] orgScoped, timestamps, softDelete, etc.
│   ├── types.ts                      [TODO] shared TS types + enums
│   ├── constants.ts                  [TODO] roles, statuses, limits
│   ├── errors.ts                     [TODO] custom error classes
│   └── utils.ts                      [TODO] pure util functions
│
├── _functions/                       [TODO]
│   ├── authenticated.ts              [TODO] authenticatedQuery/Mutation, orgQuery/Mutation
│   ├── admin.ts                      [TODO] adminQuery/Mutation
│   └── system.ts                     [TODO] internal system functions
│
├── _rules/                           [TODO]
│   └── rlsRules.ts                  [TODO] per-table RLS rules
│
├── users/                            [TODO]
│   ├── queries.ts                    [TODO]
│   ├── mutations.ts                  [TODO]
│   └── helpers.ts                    [TODO] getCurrentUser, resolveUser
│
├── orgs/                             [TODO]
│   ├── queries.ts                    [TODO]
│   ├── mutations.ts                  [TODO]
│   └── helpers.ts                    [TODO] getCurrentOrg, ensureOrgAccess
│
├── notifications/                    [TODO]
│   ├── queries.ts                    [TODO]
│   ├── mutations.ts                  [TODO]
│   └── helpers.ts                    [TODO] sendNotification()
│
├── activityLogs/                     [TODO]
│   ├── queries.ts                    [TODO]
│   └── helpers.ts                    [TODO] logActivity()
│
├── featureFlags/                     [TODO]
│   ├── queries.ts                    [TODO]
│   └── mutations.ts                  [TODO]
│
└── connections/                      [TODO — Phase 6]
    ├── tables.ts
    ├── queries.ts
    ├── mutations.ts
    └── notifications.ts
```

---

## `lib/` — Frontend Utilities

```
lib/
├── utils.ts                          ✅ EXISTS
├── logger.ts                         ✅ EXISTS
├── email.ts                          ✅ EXISTS
├── posthog-server.ts                 ✅ EXISTS
├── stores/
│   └── uiStore.ts                    ✅ EXISTS
└── hooks/                            [TODO]
    ├── useAppRouter.ts               [TODO] locale-aware router
    └── useLocalePath.ts              [TODO] locale-safe link builder
```

---

## `trigger/` — Background Jobs

```
trigger/
├── example.ts                        ✅ EXISTS (demo)
├── emails/                           [TODO]
├── calculations/                     [TODO]
└── approvals/                        [TODO]
```

---

## Key Config Files

```
next.config.ts                        ✅ EXISTS
trigger.config.ts                     ✅ EXISTS
biome.json                            ✅ EXISTS
components.json                       ✅ EXISTS (shadcn config)
tsconfig.json                         ✅ EXISTS
i18n/routing.ts                       ✅ EXISTS
i18n/request.ts                       ✅ EXISTS
messages/en.json                      ✅ EXISTS
instrumentation.ts                    ✅ EXISTS (Sentry)
sentry.server.config.ts               ✅ EXISTS
```

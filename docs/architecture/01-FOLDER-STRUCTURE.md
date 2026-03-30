# 01 — Folder Structure

> Every file has a home. If you don't know where it goes, this document tells you. The structure is designed so that adding or removing a feature module never requires touching more than 2 files in the base.

---

## Complete Directory Tree

```
flowbite/
├── app/                              # Next.js App Router (Presentation Layer)
│   ├── [locale]/                     # i18n locale wrapper
│   │   ├── globals.css               # Global styles (Tailwind directives)
│   │   ├── layout.tsx                # Root layout: providers, fonts, metadata
│   │   ├── page.tsx                  # Landing / marketing page
│   │   ├── global-error.tsx          # Global error boundary
│   │   │
│   │   ├── signin/                   # Public auth pages
│   │   │   └── page.tsx
│   │   ├── signup/
│   │   │   └── page.tsx
│   │   ├── forgot-password/
│   │   │   └── page.tsx
│   │   │
│   │   └── dashboard/                # Protected dashboard shell
│   │       ├── layout.tsx            # Dashboard layout: sidebar + navbar + auth guard
│   │       ├── page.tsx              # Dashboard home (overview cards, stats)
│   │       │
│   │       ├── settings/             # Base: user + org settings
│   │       │   ├── page.tsx          # Redirect to profile
│   │       │   ├── profile/
│   │       │   │   └── page.tsx
│   │       │   ├── organization/
│   │       │   │   └── page.tsx
│   │       │   ├── members/
│   │       │   │   └── page.tsx
│   │       │   ├── billing/
│   │       │   │   └── page.tsx
│   │       │   └── notifications/
│   │       │       └── page.tsx
│   │       │
│   │       │── [feature]/            # ← Feature modules register routes here
│   │       │   │                     #   e.g., connections/, projects/, reports/
│   │       │   └── ...
│   │       │
│   │       └── admin/                # Super-admin panel (feature flags, user mgmt)
│   │           ├── page.tsx
│   │           ├── users/
│   │           │   └── page.tsx
│   │           └── feature-flags/
│   │               └── page.tsx
│   │
│   └── api/                          # Next.js API routes (escape hatch only)
│       ├── trigger/                  # Trigger.dev webhook endpoint
│       │   └── route.ts
│       └── webhooks/
│           └── stripe/
│               └── route.ts
│
├── components/                       # Shared UI components (global)
│   ├── ConvexClientProvider.tsx       # Convex + Auth provider wrapper
│   ├── providers/                    # All context providers
│   │   ├── PostHogProvider.tsx
│   │   └── ThemeProvider.tsx
│   │
│   ├── ui/                           # shadcn primitives (button, card, input, etc.)
│   │   ├── button.tsx
│   │   ├── card.tsx
│   │   ├── input.tsx
│   │   ├── dialog.tsx
│   │   ├── dropdown-menu.tsx
│   │   ├── table.tsx
│   │   ├── tabs.tsx
│   │   ├── badge.tsx
│   │   ├── skeleton.tsx
│   │   ├── sonner.tsx                # Toast notifications (via sonner)
│   │   └── ... (shadcn components as needed)
│   │
│   ├── dashboard/                    # Dashboard shell components
│   │   ├── Sidebar.tsx               # Collapsible sidebar
│   │   ├── SidebarNav.tsx            # Navigation items (reads registry)
│   │   ├── Navbar.tsx                # Top bar: search, notifications, user menu
│   │   ├── NotificationBell.tsx      # Notification dropdown
│   │   ├── UserMenu.tsx              # Avatar, profile, logout
│   │   ├── BreadcrumbNav.tsx         # Auto breadcrumbs
│   │   └── CommandPalette.tsx        # Cmd+K search
│   │
│   ├── data/                         # Reusable data display components
│   │   ├── DataTable.tsx             # Generic table with sorting, pagination, filters
│   │   ├── KanbanBoard.tsx           # Drag-and-drop kanban
│   │   ├── EmptyState.tsx            # No-data placeholder
│   │   └── LoadingState.tsx          # Skeleton loaders
│   │
│   └── forms/                        # Reusable form components
│       ├── FormField.tsx             # Wrapper around react-hook-form
│       ├── FormSelect.tsx
│       ├── FormDatePicker.tsx
│       └── FormFileUpload.tsx
│
├── features/                         # ← FEATURE MODULES LIVE HERE
│   │
│   ├── _registry.ts                  # Feature registry: sidebar items, routes, permissions
│   │
│   ├── connections/                  # Example feature: Project Connections
│   │   ├── README.md                 # Feature documentation
│   │   ├── types.ts                  # Feature-specific types + Zod schemas
│   │   ├── constants.ts              # Feature-specific constants (statuses, config)
│   │   ├── components/               # Feature UI components
│   │   │   ├── ConnectionCard.tsx
│   │   │   ├── ConnectionList.tsx
│   │   │   ├── CreateConnectionModal.tsx
│   │   │   └── ConnectionKanban.tsx
│   │   ├── hooks/                    # Feature-specific hooks
│   │   │   ├── useConnections.ts     # Convex query wrapper
│   │   │   └── useConnectionMutations.ts
│   │   └── register.ts              # Registers in sidebar, permissions, routes
│   │
│   └── [other-features]/             # Same pattern for every feature
│
├── convex/                           # Convex Backend (Database + Functions Layer)
│   ├── schema.ts                     # Master schema: imports feature table definitions
│   ├── auth.ts                       # Convex Auth setup
│   ├── auth.config.ts                # Auth provider configuration
│   ├── http.ts                       # HTTP router: webhooks, custom endpoints
│   │
│   ├── _shared/                      # SHARED BACKEND UTILITIES
│   │   ├── validators.ts             # Reusable validator fragments (orgIdField, timestamps, etc.)
│   │   ├── types.ts                  # Shared TypeScript types & enums
│   │   ├── constants.ts              # Shared constants (roles, statuses, limits)
│   │   ├── errors.ts                 # Custom error classes
│   │   └── utils.ts                  # Pure utility functions
│   │
│   ├── _functions/                   # CUSTOM FUNCTION BUILDERS
│   │   ├── authenticated.ts          # authenticatedQuery, authenticatedMutation, authenticatedAction
│   │   ├── admin.ts                  # adminQuery, adminMutation (role-gated)
│   │   └── system.ts                 # Internal system functions (no auth)
│   │
│   ├── _rules/                       # ROW-LEVEL SECURITY RULES
│   │   └── rlsRules.ts              # Per-table read/insert/modify rules
│   │
│   ├── users/                        # Base module: user management
│   │   ├── queries.ts
│   │   ├── mutations.ts
│   │   └── helpers.ts                # getCurrentUser, resolveUser, etc.
│   │
│   ├── orgs/                         # Base module: organization management
│   │   ├── queries.ts
│   │   ├── mutations.ts
│   │   └── helpers.ts                # getCurrentOrg, ensureOrgAccess, etc.
│   │
│   ├── members/                      # Base module: org membership + roles
│   │   ├── queries.ts
│   │   ├── mutations.ts
│   │   └── helpers.ts                # ensureRole, hasPermission, etc.
│   │
│   ├── notifications/                # Base module: notification system
│   │   ├── queries.ts                # list, getUnreadCount
│   │   ├── mutations.ts              # send, markAsRead, markAllAsRead
│   │   ├── helpers.ts                # createNotification (internal helper)
│   │   └── templates.ts              # Notification template definitions
│   │
│   ├── activityLogs/                 # Base module: activity/audit logging
│   │   ├── queries.ts                # list, getByEntity
│   │   ├── mutations.ts              # log (internal)
│   │   └── helpers.ts                # logActivity helper
│   │
│   ├── featureFlags/                 # Base module: internal feature flags
│   │   ├── queries.ts                # isEnabled, listFlags
│   │   ├── mutations.ts              # setFlag, toggleFlag
│   │   └── helpers.ts                # checkFlag helper
│   │
│   ├── files/                        # Base module: file storage
│   │   ├── queries.ts                # getFileUrl, getFileMetadata
│   │   ├── mutations.ts              # generateUploadUrl, deleteFile
│   │   └── helpers.ts
│   │
│   ├── payments/                     # Base module: Stripe integration
│   │   ├── actions.ts                # createCheckout, createPortalSession
│   │   ├── queries.ts                # getSubscription, getInvoices
│   │   └── webhookHandlers.ts        # Stripe event handlers
│   │
│   ├── email/                        # Base module: email sending
│   │   ├── actions.ts                # sendEmail action (calls Resend)
│   │   └── templates.ts              # Email template generators
│   │
│   ├── crons.ts                      # Scheduled jobs (cleanup, reminders)
│   │
│   ├── connections/                  # Feature module backend
│   │   ├── tables.ts                 # Table definitions (imported by schema.ts)
│   │   ├── queries.ts
│   │   ├── mutations.ts
│   │   ├── actions.ts
│   │   └── helpers.ts
│   │
│   ├── _generated/                   # Auto-generated by Convex (DO NOT EDIT)
│   │   └── ...
│   └── tsconfig.json
│
├── trigger/                          # Trigger.dev background tasks
│   ├── email/
│   │   ├── sendTransactional.ts      # Send single transactional email
│   │   └── sendBulk.ts              # Bulk email task
│   ├── files/
│   │   └── processUpload.ts          # Image resize, PDF generation, etc.
│   ├── sync/
│   │   └── syncExternal.ts           # External API sync tasks
│   └── example.ts                    # Template/reference
│
├── lib/                              # Frontend shared utilities
│   ├── utils.ts                      # cn(), formatDate(), etc.
│   ├── email.ts                      # Resend client (server-side only)
│   ├── logger.ts                     # Pino logger
│   ├── posthog-server.ts             # PostHog server client
│   ├── hooks/                        # Shared React hooks
│   │   ├── useCurrentUser.ts         # Returns authenticated user + org context
│   │   ├── usePermissions.ts         # RBAC permission checks
│   │   ├── useFeatureFlag.ts         # Feature flag hook (PostHog + internal)
│   │   ├── useNotifications.ts       # Notification subscription
│   │   └── usePagination.ts          # Convex pagination wrapper
│   ├── stores/                       # Zustand stores (UI state only)
│   │   ├── uiStore.ts                # Sidebar, theme, modals
│   │   └── commandStore.ts           # Command palette state
│   └── navigation/                   # Navigation registry
│       ├── sidebarItems.ts           # Sidebar config (features register here)
│       └── breadcrumbs.ts            # Breadcrumb resolver
│
├── i18n/                             # Internationalization config
│   ├── routing.ts
│   ├── request.ts
│   └── navigation.ts
│
├── messages/                         # Translation files
│   ├── en.json
│   └── [locale].json
│
├── public/                           # Static assets
│   └── ...
│
├── docs/                             # Architecture documentation
│   └── architecture/
│       ├── 00-OVERVIEW.md            # ← You are here (master doc)
│       └── ...
│
├── next.config.ts
├── trigger.config.ts
├── biome.json
├── tsconfig.json
├── package.json
└── README.md
```

---

## Key Structural Decisions

### Why `features/` is separate from `app/`

The `app/` directory is Next.js routing — pages, layouts, metadata. The `features/` directory is business logic — components, hooks, types, registration. A route in `app/dashboard/connections/page.tsx` simply imports and renders `<ConnectionList />` from `features/connections/`.

**Why**: When you copy a feature to another project, you copy `features/connections/` + `convex/connections/` and wire up one route. The feature is portable.

### Why `convex/_shared/` for validators and types

Every Convex function needs validators. Rather than importing from a random file, all shared validators live in `convex/_shared/validators.ts`. If you change a field name, you change it in one file and every function that imports it gets the update.

```ts
// convex/_shared/validators.ts
export const orgIdField = { orgId: v.id("orgs") };
export const timestampFields = {
  createdAt: v.number(),
  updatedAt: v.number(),
};
export const softDeleteField = { deletedAt: v.optional(v.number()) };
```

### Why `convex/_functions/` for custom function builders

Instead of calling `ctx.auth.getUserIdentity()` in every single function, we wrap `query`/`mutation` with custom builders that inject the user and org into `ctx` automatically. If you're writing a function that needs auth, you import from `_functions/authenticated.ts`.

```ts
// convex/_functions/authenticated.ts
export const authenticatedQuery = customQuery(query, {
  args: {},
  input: async (ctx) => {
    const user = await getCurrentUser(ctx);
    if (!user) throw new Error("Not authenticated");
    return { ctx: { user }, args: {} };
  },
});
```

### Why feature backends in `convex/[feature]/`

Convex uses file-based routing. A function in `convex/connections/queries.ts` named `list` becomes `api.connections.queries.list`. This gives us automatic namespacing per feature. The feature's frontend hooks call these directly.

### Why `features/_registry.ts`

The sidebar reads from a registry to know what items to show. Each feature calls `registerFeature()` to add itself. When a feature is removed, its sidebar entry disappears automatically.

```ts
// features/_registry.ts
export type FeatureRegistration = {
  id: string;
  label: string;
  icon: LucideIcon;
  href: string;
  permissions?: string[];  // Required permissions to see this item
  order: number;
};

const registry: FeatureRegistration[] = [];

export function registerFeature(feature: FeatureRegistration) {
  registry.push(feature);
  registry.sort((a, b) => a.order - b.order);
}

export function getRegisteredFeatures() {
  return [...registry];
}
```

---

## File Naming Conventions

| Pattern | Example | When |
|---|---|---|
| `camelCase.ts` | `queries.ts`, `helpers.ts` | All non-component TypeScript files |
| `PascalCase.tsx` | `ConnectionCard.tsx`, `DataTable.tsx` | React components |
| `UPPER_CASE.md` | `README.md`, `SKILL.md` | Documentation |
| `kebab-case/` | None — we use camelCase for folders | (Not used) |

---

## Import Aliases

```json
// tsconfig.json paths
{
  "@/*": ["./"],
  "@/convex/*": ["./convex/*"],
  "@/features/*": ["./features/*"],
  "@/components/*": ["./components/*"],
  "@/lib/*": ["./lib/*"]
}
```

Every import uses these aliases. No relative `../../..` chains. `@/convex/_shared/validators` is always the right path.

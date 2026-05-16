# `convex/` — Architecture Map

> **Purpose**: Logical-group reference for the backend. The physical structure
> stays flat at the top level so public `api.X` paths don't change — but every
> module belongs to one of the groups below. Use this map to find code, not
> the file tree.
>
> **Why no physical regroup**: moving `convex/users/` → `convex/identity/users/`
> would break every frontend `api.users.X` import (~80–150 callsites). The
> blast radius isn't worth the cosmetic gain. AGENTS.md decision #19 locks this.
>
> **Last updated**: 2026-05-16

---

## Top-level groups (logical, not physical)

```
┌──────────────────────────────────────────────────────────────────────────┐
│  🏗️  Infrastructure (underscored, never imported by feature code)        │
├──────────────────────────────────────────────────────────────────────────┤
│  _generated/      → Convex codegen output (api.d.ts, server.d.ts, ...)  │
│  _shared/         → cross-cutting utilities (perms, validators, errors,  │
│                     rate limit, record codes, reserved slugs, types)     │
│  _functions/      → custom auth wrappers (orgQuery, orgMutation,         │
│                     authenticatedQuery, superAdmin*, requireOrgMember)   │
│  _test/           → test helpers (seedOrgMember)                         │
│  _migrations/     → one-shot data migrations (currently empty —          │
│                     teamMembers→assignees was applied + cleanup deleted) │
│  schema.ts        → barrel that re-exports schema/*.ts                   │
│  schema/          → 7 domain files: identity, platform, ai,              │
│                     crmEntities, crmFields, crmShared, system            │
│  auth.ts          → Convex Auth config + createOrUpdateUser callback     │
│  auth.config.ts   → JWT issuer/audience for Convex Auth                  │
│  http.ts          → HTTP routes (auth callbacks)                         │
└──────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────────┐
│  🪪  Identity — workspace + people, the auth boundary of the app         │
├──────────────────────────────────────────────────────────────────────────┤
│  users/           → users table CRUD, profile, preferences, soft-delete  │
│  orgs/            → orgs table CRUD, onboarding, settings, member ops,   │
│                     pipeline + field seeding from templates              │
│      orgs/templates/  → DB seed data (fields.ts, pipelineStages.ts)      │
│  orgRoles/        → custom org roles, role permission CRUD               │
│  invitations/     → invite create/accept/decline/cancel flow             │
└──────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────────┐
│  🛰️  System — generic infra fed by every feature                         │
├──────────────────────────────────────────────────────────────────────────┤
│  notifications/   → in-app notification create + read/markRead           │
│  activityLogs/    → audit-trail helper (logActivity); read queries live  │
│                     in `crm/shared/timeline/queries.ts`                  │
│  files/           → universal file storage (org/person/user/field        │
│                     scopes, mime/size validated from org settings)       │
│  featureFlags/    → kill-switch / rollout queries                        │
└──────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────────┐
│  🧭  CRM — the product domain (already physically grouped)               │
├──────────────────────────────────────────────────────────────────────────┤
│  crm/entities/    → leads, contacts, deals, companies, entity5/6,        │
│                     entityCodeCounters                                   │
│  crm/fields/      → pipelines, fieldDefinitions, fieldValues, dedup      │
│                     (powers the dynamic-field system — see               │
│                     DYNAMIC_FIELDS_BLUEPRINT.md)                         │
│  crm/people/      → personCode resolver — getByPersonCode, searchByCode  │
│  crm/shared/      → cross-entity systems:                                │
│                       notes/      → editable annotations                 │
│                       messages/   → chat-style threads                   │
│                       reminders/  → date-tied follow-ups                 │
│                       tags/       → org-wide tagging                     │
│                       savedViews/ → user/org filter presets              │
│                       timeline/   → read-merge view over activityLogs    │
│                                     + notes + reminders                  │
│                       calendar/   → read-merge view over reminders +     │
│                                     activityLogs (meeting/call) +        │
│                                     deal expectedCloseDate               │
│                       orbitLinks/ → universal lateral-link table         │
└──────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────────┐
│  🤖  AI (Phase 3 — backend stub only)                                    │
├──────────────────────────────────────────────────────────────────────────┤
│  ai/              → internal context-rebuild action stub.                │
│                     Phase 3 will add processChat, systemPrompt, tools/.  │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## Public API path map

| Frontend import | Source module |
|---|---|
| `api.users.queries.*`, `api.users.mutations.*` | `convex/users/` |
| `api.orgs.queries.*`, `api.orgs.mutations.*` | `convex/orgs/` |
| `api.orgRoles.queries.*`, `api.orgRoles.mutations.*` | `convex/orgRoles/` |
| `api.invitations.queries.*`, `api.invitations.mutations.*` | `convex/invitations/` |
| `api.notifications.queries.*`, `api.notifications.mutations.*` | `convex/notifications/` |
| `api.featureFlags.queries.*` | `convex/featureFlags/` |
| `api.files.queries.*`, `api.files.mutations.*` | `convex/files/` |
| `api.crm.entities.{leads,contacts,deals,companies}.{queries,mutations}.*` | `convex/crm/entities/<entity>/` |
| `api.crm.fields.{pipelines,fieldDefinitions,fieldValues}.{queries,mutations}.*` | `convex/crm/fields/<area>/` |
| `api.crm.people.queries.*` | `convex/crm/people/` |
| `api.crm.shared.{notes,messages,reminders,tags,savedViews,timeline,calendar}.{queries,mutations}.*` | `convex/crm/shared/<feature>/` |

---

## Cross-cutting infrastructure — what lives where

| Concern | File | Imported as |
|---|---|---|
| RBAC SSOT (permissions catalog) | `_shared/permissions/catalog.ts` | `import { PERMISSION_CATALOG, getDefaultPermissionsForRole } from "@/convex/_shared/permissions"` |
| Runtime permission checks | `_shared/permissions/helpers.ts` | `import { requireRole, hasPermission } from "@/convex/_shared/permissions"` |
| Auth wrappers | `_functions/authenticated.ts` | `import { orgMutation, requireOrgMember } from "../_functions/authenticated"` |
| Validators (orgScoped, timestamps, role types) | `_shared/validators.ts` | `import { orgScoped, timestamps } from "../_shared/validators"` |
| Errors catalog | `_shared/errors.ts` | `import { ERRORS } from "../_shared/errors"` |
| Rate limit | `_shared/rateLimit.ts` | `import { enforceRateLimit, RATE_LIMITS } from "../_shared/rateLimit"` |
| Record codes (P-001, D-001) | `_shared/recordCodes.ts` | `import { generatePersonCode, generateEntityCode } from "../_shared/recordCodes"` |
| Reserved slugs | `_shared/reservedSlugs.ts` | `import { RESERVED_SLUGS, validateSlug } from "../_shared/reservedSlugs"` |
| Notification preference keys | `_shared/notificationKeys.ts` | `import { NOTIFICATION_PREFERENCE_KEYS, notificationPreferencesValidator } from "../_shared/notificationKeys"` |
| logActivity helper | `activityLogs/helpers.ts` | `import { logActivity } from "../activityLogs/helpers"` |
| sendNotification helper | `notifications/helpers.ts` | `import { sendNotification } from "../notifications/helpers"` |

---

## Canonical mutation pattern

Every public mutation that mutates org data follows this 7-step shape (see
`BUILD-ORDER.md` for details):

```ts
import { orgMutation, requireOrgMember } from "../_functions/authenticated";
import { requireRole } from "../_shared/permissions";
import { enforceRateLimit, RATE_LIMITS } from "../_shared/rateLimit";
import { logActivity } from "../activityLogs/helpers";
import { sendNotification } from "../notifications/helpers";

export const create = orgMutation({
  args: { orgId: v.id("orgs"), /* ... */ },
  handler: async (ctx, args) => {
    // 1. RBAC + rate limit
    const { member, userId } = await requireOrgMember(ctx, args.orgId);
    requireRole(member.permissions, "<module>.create");
    await enforceRateLimit(ctx, {
      scope: "<module>.create",
      key: `${userId}:${args.orgId}`,
      ...RATE_LIMITS.write,
    });

    // 2. Dedup (where applicable — leads, contacts)
    // 3. Record code (where applicable — generatePersonCode/generateEntityCode)
    // 4. DB insert/patch (always include updatedAt)
    const id = await ctx.db.insert("<table>", { ...args, createdAt: now, updatedAt: now });

    // 5. logActivity — pass personCode for person-related mutations
    await logActivity(ctx, {
      orgId: args.orgId,
      userId,
      action: "created",
      entityType: "<entity>",
      entityId: id,
      personCode: args.personCode,
      description: `<entity> created`,
    });

    // 6. sendNotification — when assignedTo changes, deal won, etc.
    if (args.assignedTo && args.assignedTo !== userId) {
      await sendNotification(ctx, { /* ... */ });
    }

    // 7. AI context rebuild — wired up, no-op until Phase 3
    await ctx.scheduler.runAfter(0, internal.ai.internal.rebuildEntityContext, { /* ... */ });

    return { id, /* ... */ };
  },
});
```

**Required for every create/update/delete mutation in the catalog above.**
Linter rule (informal): if a mutation file imports neither `logActivity` nor
`sendNotification`, it likely needs at least one. Files-mutations is the
exception that should be most-strict because file ops are externally
observable.

---

## Soft-delete convention

Every table that supports recovery uses `softDelete` (`deletedAt: number?`)
from `_shared/validators.ts`. Mutations that "delete" call
`ctx.db.patch(id, { deletedAt: now, updatedAt: now })`. Queries filter on
`!doc.deletedAt`. Never hard-delete except for join tables and
authentication artifacts.

---

## Index naming convention

| Pattern | Example |
|---|---|
| `by_org` | scope all reads by orgId |
| `by_org_and_<field>` | filter within an org |
| `by_<unique_field>` | global lookup (e.g. `by_slug`, `by_token`) |
| `by_userId_and_<field>` | per-user state (notifications, reminders) |

`.collect()` is **banned** on org-scoped tables that can grow beyond ~500
rows. Use `.take(N)` with a sensible cap, or paginate.

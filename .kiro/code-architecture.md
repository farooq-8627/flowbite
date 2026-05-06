# Orbitly — Code Architecture Reference

> **Purpose**: Global architecture decisions and folder map. Not a spec — specs live in MODULE.md files.
> **Last Updated**: 2026-05-05
> **Status**: Phase 0 complete. Phase 1 (Shell) is next.

---

## Core Principle — One Function, Three Callers

Every Convex mutation is written ONCE. Called identically by UI, AI tools, WhatsApp, and future MCP.

```
convex/crm/leads/mutations.ts::create  (canonical — written once)
  ├── UI:       useMutation(api.crm.leads.create)          source: "manual"
  ├── AI:       ctx.runMutation(internal.crm.leads.create) source: "ai"
  ├── WhatsApp: convex.mutation(api.crm.leads.create)      source: "whatsapp"
  └── MCP:      same internal mutation [future]            source: "mcp"
```

RBAC, dedup, logActivity, sendNotification — all happen INSIDE the mutation. Never in the caller.

---

## Folder Structure

```
flowbite/
├── app/[locale]/               # Next.js routes — THIN ONLY (no logic)
│   ├── (public)/               # No auth: landing, pricing
│   ├── (auth)/                 # signin, signup
│   ├── (private)/              # Auth-gated
│   │   ├── layout.tsx          # Auth guard
│   │   ├── onboarding/         # 3-step wizard
│   │   └── dashboard/[orgSlug]/
│   │       ├── layout.tsx      # Org resolver + DashboardLayout
│   │       ├── page.tsx        # Dashboard home
│   │       ├── leads/ contacts/ companies/ deals/
│   │       ├── [entity]/       # entity5, entity6 dynamic slots
│   │       └── settings/
│   └── portal/[orgSlug]/       # Phase 9 — separate layout
│
├── core/                       # NECESSITIES — never plan-gated
│   ├── shell/                  # Layout, nav, guards → MODULE.md
│   ├── entities/               # 6 entity types + 4 scaffolds → MODULE.md
│   ├── ai/                     # AI chat panel (Phase 3) → MODULE.md
│   ├── settings/               # All settings pages → MODULE.md
│   ├── csv-import/             # Import wizard → MODULE.md
│   ├── kanban/                 # @dnd-kit primitives → MODULE.md
│   ├── datatable/              # @tanstack/react-table → MODULE.md
│   ├── timelines/              # Unified + ActivityChat → MODULE.md
│   ├── notifications/          # Bell + dropdown → MODULE.md
│   ├── onboarding/             # 3-step wizard → MODULE.md
│   └── command-palette/        # Cmd+K → MODULE.md
│
├── features/                   # UPGRADES — can be plan-gated
│   ├── _registry.ts
│   ├── industry-templates/     # → MODULE.md
│   ├── project-management/     # Phase 8 → MODULE.md
│   ├── client-portal/          # Phase 9 → MODULE.md
│   ├── integrations/           # Phase 6 → MODULE.md
│   └── ai-automation/          # Phase 7 → MODULE.md
│
├── convex/                     # Backend — ALL data logic
│   ├── schema.ts               # Single schema file
│   ├── _shared/                # validators, types, constants, errors, permissions
│   ├── _functions/             # orgMutation, orgQuery, adminMutation builders
│   ├── users/ orgs/ invitations/ activityLogs/ notifications/  # Phase 0 ✅
│   ├── ai/                     # Phase 3 — processChat, systemPrompt, toolRegistry, tools/
│   ├── platform/               # Phase 4+ — platformTiers, platformTemplates, admin queries
│   └── crm/                    # Phase 2 — all CRM backend
│       ├── leads/              # → MODULE.md
│       ├── contacts/           # → MODULE.md
│       ├── companies/          # → MODULE.md
│       ├── deals/              # → MODULE.md
│       ├── entity5/            # → MODULE.md (optional slot)
│       ├── entityCodeCounters/ # → MODULE.md (record code counters)
│       ├── orbitLinks/         # → MODULE.md (lateral connections)
│       ├── notes/              # → MODULE.md
│       ├── reminders/          # → MODULE.md
│       ├── tags/               # → MODULE.md
│       ├── savedViews/         # → MODULE.md
│       └── fields/             # Field + pipeline infrastructure
│           ├── pipelines/      # → MODULE.md
│           ├── fieldDefinitions/ # → MODULE.md
│           ├── fieldValues/    # → MODULE.md
│           └── dedup/          # → MODULE.md (shared engine)
│
├── trigger/                    # Background jobs (Trigger.dev)
│   ├── imports/processCSVImport.ts
│   ├── whatsapp/voiceProcessor.ts + documentProcessor.ts
│   ├── crons/morningBriefing.ts + staleAlertsSweep.ts + rentAlertSweep.ts
│   └── scraping/enrichLead.ts
│
├── lib/                        # Frontend shared utilities
│   ├── hooks/useAppRouter.ts   # Always use — never hardcode locale
│   └── utils/cn.ts
│
├── stores/                     # Zustand — UI state ONLY
│   └── chatStore.ts            # AI panel isOpen, pendingMessage
│
└── messages/                   # i18n bundles
    ├── en.json
    └── ar.json                 # Phase 8
```

---

## Global Architecture Decisions (Locked)

| Decision | Value |
|---|---|
| Auth derivation | `ctx.user._id` / `ctx.org._id` only — never from args |
| Data isolation | `orgId` on every row — multi-tenancy at DB level |
| AI tool pattern | Thin wrapper → calls same `internalMutation` |
| State management | Convex = server state, Zustand = UI-only state |
| Pipeline stages | Dynamic from DB, never hardcoded — deals only |
| Field definitions | EAV via `fieldValues` table |
| Role checking | DB lookup from `orgRoles` table (dynamic) |
| Activity logging | `logActivity()` in every mutation, with `personCode` |
| Record codes | `personCode` (P-001) generated ONLY in leads.create, passed to contacts |
| Entity codes | `dealCode` (D-001), `followUpCode` (FU-001) etc. — own counters per type |
| MCP readiness | `internalQuery`/`internalMutation` = future MCP transport, zero rewrite |

---

## Canonical Mutation Pattern

Every mutation follows this exact structure:

```typescript
export const create = orgMutation({
  args: { displayName: v.string(), source: v.string(), ... },
  handler: async (ctx, args) => {
    await requirePermission(ctx, "leads.create");           // 1. RBAC
    const dupes = await runDedup(ctx, args);                // 2. Dedup
    if (dupes.length > 0) return { id: null, duplicates: dupes };
    const personCode = await generatePersonCode(ctx, ctx.org._id); // 3. Record code
    const id = await ctx.db.insert("leads", {              // 4. Insert
      orgId: ctx.org._id, personCode, ...args,
      createdAt: Date.now(), updatedAt: Date.now(),
    });
    await logActivity(ctx, { action: "lead.created",       // 5. Log
      entityType: "lead", entityId: id, personCode });
    if (args.assignedTo) await sendNotification(ctx, ...); // 6. Notify
    await ctx.scheduler.runAfter(0,                        // 7. AI context rebuild
      internal.ai.rebuildEntityContext, { entityType: "lead", entityId: id });
    return { id, personCode, duplicates: [] };
  },
});
```

---

## Record Code System

```
personCode:   P-001  → generated in leads.create ONLY, passed to contacts on conversion
dealCode:     D-001  → generated in deals.create
companyCode:  CO-001 → generated in companies.create
followUpCode: FU-001 → generated in reminders.create
projectCode:  PJ-001 → generated in projects.create (Phase 8)
taskCode:     T-001  → generated in tasks.create (Phase 8)
platformOrgId: ORB-001 → generated on org creation (global counter)
```

Prefixes are customizable per org from Settings → Record Codes (`orgSettings.codePrefixes`).
Numbers are permanent — only prefixes change (background job patches all records).

---

## 3-Layer AI Context

```
Layer 1: platformContext table  → What Orbitly is, platform rules (all users)
Layer 2: orgs.aiContext         → Business description, workflows (per org)
Layer 3: entity.aiContext       → Compressed key facts (per record, auto-rebuilt)
```

entityAIContext is rebuilt non-blocking via `ctx.scheduler.runAfter(0, ...)` after every significant mutation.

---

## Security Model

```
API route:    auth from server session ONLY — never from request body
Tool filter:  Claude receives ONLY tools the user's role permits
Data scope:   every query uses orgId from ctx — never from args
Confirmation: destructive actions (delete, bulk) require explicit user confirm
Billing:      check org.billing.status BEFORE every Claude call
```

---

## Module Reference Map

| What you're building | Read this MODULE.md |
|---|---|
| Sidebar, layout, nav, guards | `core/shell/MODULE.md` |
| Any entity list/detail/form | `core/entities/MODULE.md` |
| Kanban board | `core/kanban/MODULE.md` |
| Data table | `core/datatable/MODULE.md` |
| Activity feed, notes | `core/timelines/MODULE.md` |
| Notification bell | `core/notifications/MODULE.md` |
| Onboarding wizard | `core/onboarding/MODULE.md` |
| Cmd+K palette | `core/command-palette/MODULE.md` |
| AI chat panel | `core/ai/MODULE.md` |
| Settings pages | `core/settings/MODULE.md` |
| CSV import | `core/csv-import/MODULE.md` |
| Industry templates | `features/industry-templates/MODULE.md` |
| Pipelines + stages | `convex/crm/fields/pipelines/MODULE.md` |
| Custom fields | `convex/crm/fields/fieldDefinitions/MODULE.md` |
| Field values (EAV) | `convex/crm/fields/fieldValues/MODULE.md` |
| Dedup engine | `convex/crm/fields/dedup/MODULE.md` |
| Leads backend | `convex/crm/leads/MODULE.md` |
| Contacts backend | `convex/crm/contacts/MODULE.md` |
| Companies backend | `convex/crm/companies/MODULE.md` |
| Deals backend | `convex/crm/deals/MODULE.md` |
| Notes backend | `convex/crm/notes/MODULE.md` |
| Reminders backend | `convex/crm/reminders/MODULE.md` |
| Tags backend | `convex/crm/tags/MODULE.md` |
| Saved views backend | `convex/crm/savedViews/MODULE.md` |
| Record code counters | `convex/crm/entityCodeCounters/MODULE.md` |
| Connection graph | `convex/crm/orbitLinks/MODULE.md` |
| AI backend | `convex/ai/MODULE.md` |
| Platform admin | `convex/platform/MODULE.md` |

---

## Never-Do List

```
❌ Accept orgId/userId as mutation args          → derive from ctx
❌ Hardcode pipeline stage names                 → read from pipelines table
❌ Hardcode entity labels ("Lead", "Contact")    → read from orgSettings.entityLabels
❌ Hardcode record code prefixes ("P", "D")      → read from orgSettings.codePrefixes
❌ Use .collect() on unbounded tables            → .take(n) or .paginate()
❌ Call AI tools from inside mutations           → one direction only
❌ Build entity-specific list/detail from scratch → use scaffolds
❌ Import one entity module from another         → share via core/entities/shared/
❌ Store AI chat state in Zustand                → isOpen/isPending only
❌ Delete data on plan downgrade                 → pause via feature flags
❌ Use ml-4/pr-2 CSS                             → ms-4/pe-2 (logical, RTL-safe)
❌ Skip logActivity() in any mutation            → everything logged with personCode
❌ Call Claude without billing status check      → zero tokens on suspended accounts
❌ Generate personCode on contact create         → only on lead create, then pass it
❌ Hardcode "Orbitly" in user-visible strings    → t('app.name') or env var
```

---

## MCP Readiness

When Orbitly needs an MCP server: one adapter file (~200 lines), zero changes to existing code.
All business logic is already in `internalMutation`/`internalQuery`. MCP adds transport only.

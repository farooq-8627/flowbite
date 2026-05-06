# Settings Module (Core)

> Settings are a NECESSITY — not a feature. You cannot manage org, members, billing,
> pipelines, custom fields, or record codes without them.
> Settings pages are ROLE-GATED (RBAC) but NEVER plan-gated.
> Every org on every plan gets access to Settings.

## Ownership
- **Location**: `core/settings/`
- **Routes**: `app/[locale]/(private)/dashboard/[orgSlug]/settings/`
- **Phase**: 1+ | **Status**: NOT_STARTED

---

## Settings Pages List

| Route | Page | Min Role | Phase |
|---|---|---|---|
| `/settings/general` | Org name, logo, timezone | admin | 1 |
| `/settings/members` | Invite, list, change roles, last active | admin | 1 |
| `/settings/roles` | Permission picker (GitHub-style) | owner | 1 |
| `/settings/billing` | Plan, usage, upgrade, payment history | owner | 2 |
| `/settings/pipelines` | Pipeline CRUD, stages, colors, stale days | admin | 2 |
| `/settings/fields` | Field builder, groups, stage visibility, sensitive | admin | 2 |
| `/settings/tags` | Tag CRUD, colors, org-wide | admin | 2 |
| `/settings/record-codes` | Prefix customization (P → IN, D → OP, etc.) | admin | 2 |
| `/settings/entity-labels` | Rename entity labels (Lead → Inquiry) | admin | 2 |
| `/settings/reminders` | Default follow-up settings, stale thresholds | admin | 2 |
| `/settings/appearance` | Theme, font, layout prefs | any role | 1 |
| `/settings/ai` | Business context, entity context viewer, AI usage | admin | 3 |
| `/settings/activity-log` | Org-wide audit log viewer | admin | 2 |

---

## Settings Layout

```
app/[locale]/(private)/dashboard/[orgSlug]/settings/
├── layout.tsx           # SettingsLayout — settings sub-nav sidebar
├── general/page.tsx
├── members/page.tsx
├── roles/page.tsx
├── billing/page.tsx
├── pipelines/page.tsx
├── fields/page.tsx
├── tags/page.tsx
├── record-codes/page.tsx   # NEW v2.2
├── entity-labels/page.tsx
├── reminders/page.tsx      # NEW v2.2
├── appearance/page.tsx
├── ai/page.tsx             # NEW v2.2
└── activity-log/page.tsx
```

**SettingsLayout** has its own sub-nav sidebar showing all settings sections.
Each section link only renders if the user has permission to view it.

---

## Page Details

### General Settings (`/settings/general`)
- Org name (updates slug cautiously — redirect warning if slug changes)
- Org logo upload (stored in Convex file storage)
- Timezone (used for date display + reminder scheduling)
- Danger zone: Delete org (24h email verification required before soft-delete)

### Members Page (`/settings/members`)
- List all org members with: name, email, role, last active timestamp
- "Last Active" column: `users.lastActiveAt` — updated on every authenticated request
- Invite by email → creates invitation record → sends email via Resend
- Change role → updates `orgMembers.roleId`
- Remove member → soft-remove (data preserved, access revoked)

### Roles Manager (`/settings/roles`)
GitHub-style permission picker. Owner-only.

```
Roles:
  Owner   [System — cannot edit]      [3 members]
  Admin   [Edit permissions]          [2 members]
  Member  [Edit permissions] [Default] [12 members]
  [+ Create Role]

Editing "Admin" role:
  CRM
    ☑ leads.view      ☑ leads.create   ☑ leads.update   ☑ leads.delete
    ☑ contacts.view   ☑ contacts.create ...
    ☑ deals.view      ☑ deals.create   ☑ deals.viewValues
  Pipeline
    ☑ pipelines.manage  ☑ deals.moveStage
  Reports
    ☑ reports.view
  Organization
    ☐ org.billing      ☐ org.manageRoles    ☑ org.inviteMembers
  AI
    ☑ ai.chat          ☑ ai.workspaceSetup  ☐ ai.platformAdmin
```

### Billing Page (`/settings/billing`)
- Current plan + features included
- Usage meters: AI messages (X / 500 this month), Members (X / Y seats)
- Upgrade button → LemonSqueezy checkout
- Payment history (fetched from LemonSqueezy API)
- Trial countdown if applicable

### Pipelines Settings (`/settings/pipelines`)
- List pipelines (only deals pipeline for Phase 2; entity5/entity6 in later phases)
- Edit stages: name, color, order (drag to reorder), stale threshold (days)
- Mark stages as final (positive = Won, negative = Lost, neutral = Closed)
- Add stage → name + color picker
- Delete stage → requires no deals currently in that stage (warning if any)

### Field Settings (`/settings/fields`)
Visual field builder. No code required to add a field.

```
Entity: [Leads ▾]  [Add Field]

Group: Financial
  Budget (AED)    Currency    [Edit] [Drag] [Delete]
  Commission (%)  Number      [Edit] [Drag] [Delete]

Group: Property
  Property Type   Select      [Edit] [Drag] [Delete]   Options: Apartment, Villa...
  Bedrooms        Select      [Edit] [Drag] [Delete]   Show in stages: all
  [+ Add field to this group]

[+ Add Group]

Field editor modal:
  Name: budget_aed (internal, no spaces)
  Label: Budget (AED)
  Type: Currency | Text | Number | Select | MultiSelect | Date | DateTime | Checkbox | Email | Phone | URL | File
  Group: Financial
  Show in stages: [All] or [Select stages...]
  Mark as sensitive: ☐ (hides from member-role AI context)
  Required: ☐
```

### Tags Settings (`/settings/tags`)
- List org tags: name, color, usage count (how many entities tagged)
- Create tag: name + color picker
- Edit / delete (with usage count warning)

### Record Codes (`/settings/record-codes`) — NEW in v2.2

This is the prefix customization page for the personCode system.

```
Record Codes

Customize the prefix labels for your records. The numbers never change —
only the prefix letters update across all existing records.

  Person identifier  [P]    → Used for people (leads and contacts share this)
  Deal               [D]    → Used for deals
  Company            [CO]   → Used for companies
  Follow-up          [FU]   → Used for follow-ups and reminders
  Project            [PJ]   → Used for projects
  Task               [T]    → Used for tasks

  [Preview: Your next lead will be P-043]

  [Save Changes]

⚠️ Changing a prefix will update all existing records.
   This runs in the background and may take a few minutes for large orgs.
   Example: P-001 → CL-001, P-002 → CL-002 (numbers unchanged)
```

On save:
1. Update `orgSettings.codePrefixes` in DB
2. Trigger background job: `trigger/jobs/renamePrefixes.ts`
3. Job patches all records in batches of 100
4. On completion: log activity "Record codes updated: P → CL (847 records updated)"

### Entity Labels (`/settings/entity-labels`)
Rename entity labels. Changes reflected everywhere: sidebar, forms, AI, notifications.

```
Entity Labels

Customize what you call each entity in your workspace.

  People (Leads)    Singular: [Lead]      Plural: [Leads]
  People (Contacts) Singular: [Contact]   Plural: [Contacts]
  Deals             Singular: [Deal]      Plural: [Deals]
  Companies         Singular: [Company]   Plural: [Companies]

  [Save Labels]

Note: The sidebar nav, forms, AI assistant, and notifications all use these labels.
```

### Reminders Settings (`/settings/reminders`) — NEW in v2.2

Default follow-up settings. Users can still set custom values per reminder.
These are DEFAULTS and AUTOMATION triggers.

```
Reminder Defaults

  Auto-suggest follow-up after lead created:
    ☑ Enable    After [24] hours

  Stale deal alert:
    ☑ Enable    Mark deal as stale after [7] days in same stage

  Morning briefing (AI-powered daily summary):
    ☑ Enable    At [9:00 AM]  [User's timezone]

  ─── Dubai Real Estate ───────────────────────
  95-day tenancy renewal alert:
    ☑ Enable    Alert [14] days before lease expiry
    (Applies to deals in "Active Tenancy" stage only)

  [Save Defaults]
```

These settings are stored in `orgSettings.reminderDefaults` and read by:
- AI reminders tool (injected into system prompt: "suggest follow-ups after 24h")
- Cron jobs (stale detection, morning briefing, rent alert)

### Appearance Settings (`/settings/appearance`)
- Theme mode: Light / Dark / System
- Theme preset (color palette)
- Font (18 Google Fonts via `lib/fonts/registry.ts`)
- Layout: Centered / Full-width
- Sidebar variant: Inset / Floating / Default

### AI Settings (`/settings/ai`) — NEW in v2.2

```
AI Settings

── Business Context ─────────────────────────────────────────────────
Describe your business and workflows. The AI uses this context to give
better suggestions, draft better messages, and understand your processes.

  [Textarea: We are a Dubai real estate agency specializing in JVC rentals.
   We always follow up with clients within 24 hours of viewing.
   Our key areas: JVC, Business Bay, Dubai Marina, Downtown...]

  [Ask AI to improve this →] (calls AI to generate better description from usage data)

── AI Message Usage ──────────────────────────────────────────────────
  Used this month: 347 / 500 messages  [████████████░░░░░░░░] 69%
  Resets: June 1, 2026
  [Upgrade to Pro for 2,000 messages →]

── Entity Context Viewer (Admin only) ────────────────────────────────
  View and correct the AI's compressed understanding of any record.

  Search: [P-001 or contact name...] [Search]

  ┌────────────────────────────────────────────────────────┐
  │ John Smith (P-001)                                     │
  │ lastContactedAt: 2026-04-20                            │
  │ lastContactMethod: "whatsapp"                          │
  │ keyFacts: ["Budget AED 120K", "Prefers 2BR JVC", ...]  │
  │ openDeals: ["D-001"]                                   │
  └────────────────────────────────────────────────────────┘
  [Edit Context] — allows admin to correct wrong AI summaries
```

---

## Convex Backend — Settings-Related Functions

```
convex/orgRoles/
├── queries.ts    # listByOrg(), getById(), getForUser(), getMyPermissions()
└── mutations.ts  # create(), update(), delete() (owner only), batchCreate()

convex/orgs/
├── queries.ts    # getSettings(), getEntityLabels(), getEntityVisibility(),
│               #   getNavBadgeCounts(), getCodePrefixes(), getAISettings()
└── mutations.ts  # updateSettings(), updateEntityLabels(), updateCodePrefixes(),
                #   updateAIContext(), seedDefaultRoles(), softDelete()

convex/pipelines/
├── queries.ts    # listByOrg(), getDefault(entityType), getById()
└── mutations.ts  # create(), update(), addStage(), reorderStages(),
                #   updateStageName(), delete()

convex/fieldDefinitions/
├── queries.ts    # listByOrg(entityType), listForEntity(entityType, stageId)
└── mutations.ts  # create(), update(), delete(), reorder(), batchCreate()
```

---

## Rules
- [ ] R-SET-01: Every settings page wraps content in `<PermissionGate>` — role checked before render
- [ ] R-SET-02: Settings layout has its own sub-nav sidebar (separate from dashboard nav)
- [ ] R-SET-03: All config changes write to Convex tables — never env vars or localStorage
- [ ] R-SET-04: Pipeline/field/tag/roles settings are admin+ only
- [ ] R-SET-05: Record code prefix change triggers background Trigger.dev job — never synchronous
- [ ] R-SET-06: Entity label changes reflect immediately in sidebar (Convex reactivity)
- [ ] R-SET-07: AI Settings context field has 10,000 char limit
- [ ] R-SET-08: Org delete requires 24h email verification before soft-delete executes

## Avoids
- ❌ Never plan-gate settings pages — only role-gate
- ❌ Never store settings in env vars (use Convex orgs table)
- ❌ Never let non-admin access pipeline/field/tag/role settings
- ❌ Never run prefix rename synchronously — always background job
- ❌ Never show "Last Active" by fetching all users and sorting — use index

# Database Schema — Orbitly Convex Tables

> Single source of truth for ALL Convex table definitions.
> Convex schema.ts is ONE global file — this doc mirrors it.
> **Before reading this:** read the relevant module's `MODULE.md` — it lists only the tables that module owns.
> For actual table definitions: [`convex/schema.ts`](../../convex/schema.ts)
> For shared validators: [`convex/_shared/validators.ts`](../../convex/_shared/validators.ts)
> Last Updated: 2026-04-26

---

## Tables By Module (Quick Index)

> Read this first. Go to the module's `MODULE.md` for context. Come here for schema details.

| Table | Owner Module | Phase |
|---|---|---|
| `users` | `core/shell` | 0 ✅ |
| `orgs` | `core/shell` | 0 ✅ |
| `orgMembers` | `core/shell` | 0 ✅ |
| `orgRoles` | `core/settings` | 1 (RBAC refactor) |
| `invitations` | `core/shell` | 0 ✅ |
| `notifications` | `core/notifications` | 0 ✅ |
| `activityLogs` | `core/timelines` | 0 ✅ |
| `featureFlags` | `core/shell` | 0 ✅ |
| `pipelines` | `core/entities` | 2 |
| `fieldDefinitions` | `core/entities` | 2 |
| `fieldValues` | `core/entities` | 2 |
| `leads` | `core/entities` | 2 |
| `contacts` | `core/entities` | 2 |
| `companies` | `core/entities` | 2 |
| `deals` | `core/entities` | 2 |
| `reminders` | `core/entities` | 2 |
| `notes` | `core/entities` | 2 |
| `tags` + `entityTags` | `core/entities` | 2 |
| `savedViews` | `core/datatable` | 2 |
| `aiConversations` + `aiMessages` | `core/ai` | 3 |
| `conversations` + `messages` + `conversationParticipants` | features (Phase 4) | 4 |
| `channelAccounts` | `features/integrations` | 5 |
| `integrations` + `integrationMappings` + `integrationEvents` | `features/integrations` | 6 |
| `projects` + `tasks` + `milestones` | `features/project-management` | 8 |
| `connectionParticipants` | `features/client-portal` | 9 |


---

## Design Rules

1. Every row has `orgId` (except `users` and `orgs`)
2. No unbounded arrays in documents — use separate table with FK
3. Soft-delete via `deletedAt: v.optional(v.number())`
4. Timestamps: `createdAt` + `updatedAt` (epoch ms) on every table
5. Indexes include all query fields — format: `by_field1_and_field2`
6. Separate high-churn data from stable profile data
7. `actorType` on activity log entries: `"user"` | `"ai"` | `"integration"` | `"system"`
8. Every entity (lead/contact/deal/project) uses `fieldValues` table for dynamic fields — never add ad hoc columns
9. Entity statuses/stages MUST reference `pipelines` table — NEVER hardcode status strings in entity tables
10. `fieldDefinitions` with `sensitive: true` MUST be excluded from AI system prompts and filtered from responses for non-admin roles
11. `notes.authorType` MUST always be set — either `"user"` or `"ai"`. AI-created notes must be distinguishable in the timeline.
12. `staleAfterDays` on pipeline stages enables automated staleness detection. A stage where `staleAfterDays` is undefined is **never stale**.
13. `displayName` on leads/contacts and `title` on deals are denormalized fast-access fields for AI and UI. Always keep in sync with underlying fieldValues. AI MUST set them on record creation (see R52).

---

## Base Tables — Phase 0 ✅ COMPLETE

| Table | Key Fields | Indexes | Notes |
|---|---|---|---|
| `users` | email, tokenIdentifier, platformRole, onboardingCompleted | `by_tokenIdentifier`, `by_email` | Separate from auth tables |
| `orgs` | name, slug, plan, settings, stripe IDs | `by_slug`, `by_stripeCustomerId` | Multi-tenant root |
| `orgMembers` | orgId, userId, role, updatedAt | `by_orgId_and_userId`, `by_userId`, `by_orgId_and_role` | Role hierarchy: viewer < member < admin < owner |
| `invitations` | orgId, email, role, status, token, expiresAt | `by_orgId_and_email`, `by_token`, `by_orgId_and_status` | 48h TTL |
| `notifications` | orgId, userId, type, title, read | `by_userId_and_read`, `by_orgId_and_userId` | In-app notifications |
| `activityLogs` | orgId, userId, actorType, action, entityType, entityId, description, metadata | `by_orgId_and_createdAt`, `by_entityType_and_entityId`, `by_userId_and_createdAt`, `by_orgId_and_actorType_and_createdAt` | Audit trail — event log only. Email content is NOT stored here. |
| `featureFlags` | key, enabled, rolloutPercent, orgOverrides | `by_key` | super_admin only |
| `orgRoles` | orgId, name, description, permissions[], isSystem, isDefault, color | `by_org`, `by_org_and_name` | **Dynamic RBAC** — owner creates custom roles with custom permissions. 3 system roles seeded on org creation (Owner, Admin, Member). GitHub-style permission picker UI. |

> **RBAC Migration (Phase 1):** `orgMembers.role` (string) → `orgMembers.roleId` (reference to `orgRoles`). All permission checks use DB lookup instead of hardcoded map. See `deep-plan.md` Module 1 for full spec.

### activityLogs — `actorType` values

```
"user"        → human user took action manually
"ai"          → AI assistant took action on behalf of user
"integration" → external tool (HubSpot, Zapier) triggered action
"system"      → automated system action (scheduler, cron)
```

---

## Auth Tables (managed by @convex-dev/auth — DO NOT touch)

Tables: `authSessions`, `authAccounts`, `authRefreshTokens`, `authVerificationCodes`, `authRateLimits`
Spread into schema via `...authTables`

---

## CRM Tables — Phase 2

### `fieldDefinitions`
Admin-defined schema per entity type. Defines what fields exist at runtime.
AI reads these to know what fields are available. AI can create new ones (admin-only tool).

```typescript
fieldDefinitions: defineTable({
  orgId: v.id("orgs"),
  entityType: v.string(),        // "lead" | "contact" | "company" | "deal" | "project" | "task"
  name: v.string(),              // internal name: "budget", "tech_stack"
  label: v.string(),             // display label: "Budget", "Tech Stack"
  labelAr: v.optional(v.string()),// Arabic label for RTL
  type: v.string(),              // "text"|"number"|"select"|"multiselect"|"date"|"boolean"|"url"|"email"|"relation"|"file"
  options: v.optional(v.array(v.string())), // for select/multiselect
  required: v.boolean(),
  order: v.number(),             // display order
  groupName: v.optional(v.string()),  // UI grouping: "Financial", "Technical", "Custom"
  sensitive: v.optional(v.boolean()), // true = PII field (phone, SSN). Excluded from AI prompts for non-admin roles.
  defaultValue: v.optional(v.any()),
  createdAt: v.number(),
  updatedAt: v.number(),
})
.index("by_org_and_entity", ["orgId", "entityType"])
```

### `fieldValues`
Actual data per record. One row per field per entity.

```typescript
fieldValues: defineTable({
  orgId: v.id("orgs"),
  entityType: v.string(),
  entityId: v.string(),          // the _id of the lead/contact/deal/project
  fieldId: v.id("fieldDefinitions"),
  fieldName: v.string(),         // denormalized for fast lookup
  value: v.any(),                // typed at render time by fieldDefinitions.type
  updatedAt: v.number(),
})
.index("by_entity", ["orgId", "entityType", "entityId"])
.index("by_field", ["orgId", "fieldId"])
```

### `pipelines`
Configurable stages per entity type per org. Replaces ALL hardcoded statuses.
Each org can have multiple pipelines per entity type (e.g., "Enterprise Sales Pipeline", "SMB Pipeline").
Kanban views render dynamically from pipeline stages. AI reads these for valid status transitions.

```typescript
pipelines: defineTable({
  orgId: v.id("orgs"),
  entityType: v.string(),        // "lead" | "contact" | "company" | "deal" | "project" | "task"
  name: v.string(),              // "Default Sales Pipeline", "Enterprise Pipeline"
  isDefault: v.boolean(),        // exactly one default per (orgId, entityType)
  stages: v.array(v.object({
    id: v.string(),              // unique within pipeline (e.g., "stage_discovery")
    name: v.string(),            // "Discovery", "Proposal", "Won"
    color: v.optional(v.string()), // hex color for kanban cards
    order: v.number(),           // display order (0-based)
    isFinal: v.boolean(),        // true = terminal state (won, lost, completed, cancelled)
    staleAfterDays: v.optional(v.number()), // if set, records stuck here > N days = stale (AI/cron flags them)
    finalType: v.optional(v.union(
      v.literal("positive"),     // won, completed, converted
      v.literal("negative"),     // lost, dead, cancelled
      v.literal("neutral"),      // on_hold, archived
    )),
  })),
  createdAt: v.number(),
  updatedAt: v.number(),
})
.index("by_org_and_entity", ["orgId", "entityType"])
```

**Default pipelines (created on org initialization):**

| Entity Type | Default Stages |
|---|---|
| `lead` | New → Contacted → Qualified → Converted (positive) → Dead (negative) |
| `deal` | Discovery → Proposal → Negotiation → Won (positive) → Lost (negative) |
| `project` | Active → On Hold (neutral) → Completed (positive) → Cancelled (negative) |
| `task` | Todo → In Progress → Done (positive) → Blocked (neutral) |

Admin can customize via Settings UI or via AI ("add a Screening stage to our lead pipeline").

### `leads`
Inbound prospects from any source (manual, CSV, scraper, integration).

```typescript
leads: defineTable({
  orgId: v.id("orgs"),
  displayName: v.optional(v.string()),      // denormalized: "Sarah Johnson" or "Acme Corp" — for AI context + list display (R13)
  email: v.optional(v.string()),            // for dedup and AI lookup — sync'd from fieldValues
  source: v.string(),            // "manual"|"csv"|"hubspot"|"reddit"|"linkedin"|"hn"
  externalId: v.optional(v.string()), // for dedup from integrations
  pipelineId: v.id("pipelines"),      // which pipeline this lead follows
  currentStageId: v.string(),         // matches pipelines.stages[].id — dynamic, NOT hardcoded
  assignedTo: v.optional(v.id("users")),
  qualificationScore: v.optional(v.number()),
  stageEnteredAt: v.optional(v.number()),    // when entity entered current stage (enables staleness detection)
  createdAt: v.number(),
  updatedAt: v.number(),
  deletedAt: v.optional(v.number()),
})
.index("by_org_and_stage", ["orgId", "currentStageId"])
.index("by_org_and_pipeline", ["orgId", "pipelineId"])
.index("by_org_and_source", ["orgId", "source"])
.index("by_org_and_assigned", ["orgId", "assignedTo"])
.index("by_org_and_external", ["orgId", "externalId"])
.index("by_org_and_email", ["orgId", "email"])
```

### `contacts`
Qualified leads promoted to contacts. Core CRM entity.

```typescript
contacts: defineTable({
  orgId: v.id("orgs"),
  leadId: v.optional(v.id("leads")), // origin lead if converted
  companyId: v.optional(v.id("companies")), // B2B: company this contact works for
  displayName: v.optional(v.string()),  // denormalized: "Sarah Johnson" — for AI context + list display (R13)
  email: v.optional(v.string()),
  assignedTo: v.optional(v.id("users")),
  createdAt: v.number(),
  updatedAt: v.number(),
  deletedAt: v.optional(v.number()),
})
.index("by_org", ["orgId"])
.index("by_org_and_email", ["orgId", "email"])
.index("by_org_and_company", ["orgId", "companyId"])
.index("by_org_and_assigned", ["orgId", "assignedTo"])
```

### `companies`
B2B company entity. Multiple contacts can belong to one company. Deals can be linked at the company level for company-wide relationship tracking.

```typescript
companies: defineTable({
  orgId: v.id("orgs"),
  name: v.string(),                       // "Acme Corporation" — required, searchable
  website: v.optional(v.string()),
  industry: v.optional(v.string()),       // seeded from onboarding industry list
  size: v.optional(v.string()),           // "1-10"|"11-50"|"51-200"|"201-1000"|"1000+"
  assignedTo: v.optional(v.id("users")),
  createdAt: v.number(),
  updatedAt: v.number(),
  deletedAt: v.optional(v.number()),
})
.index("by_org", ["orgId"])
.index("by_org_and_name", ["orgId", "name"])
.index("by_org_and_assigned", ["orgId", "assignedTo"])
```

> **AI tools**: `searchCompanies`, `createCompany`, `getCompanyContacts`, `getCompanyDeals`, `getCompanySummary`

### `deals`
Opportunities in pipeline. Linked to contacts.

```typescript
deals: defineTable({
  orgId: v.id("orgs"),
  title: v.optional(v.string()),          // deal name: "Acme Corp — Q3 Enterprise" (for AI/display) (R13)
  contactId: v.id("contacts"),
  companyId: v.optional(v.id("companies")), // denormalized from contact.companyId for query performance
  pipelineId: v.id("pipelines"),      // which pipeline this deal follows
  currentStageId: v.string(),         // matches pipelines.stages[].id — dynamic, NOT hardcoded
  value: v.optional(v.number()),
  currency: v.optional(v.string()),
  expectedCloseDate: v.optional(v.number()),
  assignedTo: v.optional(v.id("users")),
  wonAt: v.optional(v.number()),
  lostAt: v.optional(v.number()),
  lostReason: v.optional(v.string()),
  stageEnteredAt: v.optional(v.number()),    // when entity entered current stage (enables staleness detection)
  createdAt: v.number(),
  updatedAt: v.number(),
  deletedAt: v.optional(v.number()),
})
.index("by_org_and_stage", ["orgId", "currentStageId"])
.index("by_org_and_pipeline", ["orgId", "pipelineId"])
.index("by_org_and_contact", ["orgId", "contactId"])
.index("by_org_and_company", ["orgId", "companyId"])
.index("by_org_and_assigned", ["orgId", "assignedTo"])
```

### `reminders`
Follow-up reminders per entity.

```typescript
reminders: defineTable({
  orgId: v.id("orgs"),
  entityType: v.string(),
  entityId: v.string(),
  assignedTo: v.id("users"),
  note: v.optional(v.string()),
  dueAt: v.number(),
  completedAt: v.optional(v.number()),
  createdAt: v.number(),
})
.index("by_user_and_due", ["assignedTo", "dueAt"])
.index("by_entity", ["orgId", "entityType", "entityId"])
```

### `notes`
Short-form text attached to any CRM entity. Created by users OR AI. Internal flag hides from client/partner portals.

```typescript
notes: defineTable({
  orgId: v.id("orgs"),
  entityType: v.string(),        // "lead" | "contact" | "company" | "deal" | "project" | "task"
  entityId: v.string(),          // _id of the referenced entity
  content: v.string(),           // rich text / markdown
  authorId: v.id("users"),       // who created the note
  authorType: v.string(),        // "user" | "ai" — REQUIRED, never omit (see R47)
  isPinned: v.boolean(),         // pinned notes appear at top of timeline
  isInternal: v.boolean(),       // true = hidden from client/partner portal
  createdAt: v.number(),
  updatedAt: v.number(),
})
.index("by_entity", ["orgId", "entityType", "entityId"])
.index("by_org_and_author", ["orgId", "authorId"])
.index("by_org_and_created", ["orgId", "createdAt"])
```

### `tags`
Org-wide tag definitions for categorization without custom fields. Consistent naming across the org.

```typescript
tags: defineTable({
  orgId: v.id("orgs"),
  name: v.string(),              // "Hot Lead", "VIP", "Follow Up"
  color: v.optional(v.string()), // hex color for badge display
  createdAt: v.number(),
})
.index("by_org", ["orgId"])
.index("by_org_and_name", ["orgId", "name"])
```

### `entityTags`
Junction table linking tags to any CRM entity.

```typescript
entityTags: defineTable({
  orgId: v.id("orgs"),
  tagId: v.id("tags"),
  entityType: v.string(),        // "lead" | "contact" | "company" | "deal" | "project"
  entityId: v.string(),          // _id of the entity
  createdAt: v.number(),
})
.index("by_entity", ["orgId", "entityType", "entityId"])
.index("by_tag", ["orgId", "tagId"])
```

### `savedViews`
Per-user or shareable org-wide filter presets. Appear as sidebar shortcuts.

```typescript
savedViews: defineTable({
  orgId: v.id("orgs"),
  createdBy: v.id("users"),
  name: v.string(),              // "My High-Value Deals", "Stale Leads"
  entityType: v.string(),        // "lead" | "contact" | "deal" etc.
  scope: v.string(),             // "user" | "org" — org views visible to all members
  filters: v.any(),              // serialized filter state (column, operator, value)
  sortBy: v.optional(v.string()),
  sortOrder: v.optional(v.string()), // "asc" | "desc"
  isPinned: v.boolean(),         // pinned views appear in sidebar
  createdAt: v.number(),
  updatedAt: v.number(),
})
.index("by_org_and_entity", ["orgId", "entityType"])
.index("by_user", ["orgId", "createdBy"])
```

### `contactMergeHistory`
Audit trail for auto-merged duplicate contacts. Enables undo.

```typescript
contactMergeHistory: defineTable({
  orgId: v.id("orgs"),
  survivorId: v.id("contacts"),     // the contact that was kept
  mergedId: v.string(),             // the contact that was merged (stored as string since original doc deleted)
  mergedSnapshot: v.any(),          // full snapshot of the merged contact + its fieldValues at merge time
  mergedBy: v.id("users"),          // who triggered the merge (or "system" for auto-merge)
  mergeType: v.string(),            // "auto" | "manual"
  undoneAt: v.optional(v.number()), // set when undo is triggered
  createdAt: v.number(),
})
.index("by_org", ["orgId"])
.index("by_survivor", ["orgId", "survivorId"])
```

---

## Project Management Tables — Phase 8

### `projects`
Created automatically when a deal is marked "won". Preserves full deal lineage.

```typescript
projects: defineTable({
  orgId: v.id("orgs"),
  dealId: v.optional(v.id("deals")),    // origin deal
  contactId: v.optional(v.id("contacts")),
  name: v.string(),
  pipelineId: v.id("pipelines"),      // which pipeline this project follows
  currentStageId: v.string(),         // matches pipelines.stages[].id — dynamic, NOT hardcoded
  budget: v.optional(v.number()),
  startDate: v.optional(v.number()),
  dueDate: v.optional(v.number()),
  assignedTo: v.optional(v.id("users")),
  createdAt: v.number(),
  updatedAt: v.number(),
  deletedAt: v.optional(v.number()),
})
.index("by_org_and_stage", ["orgId", "currentStageId"])
.index("by_org_and_pipeline", ["orgId", "pipelineId"])
.index("by_org_and_deal", ["orgId", "dealId"])
.index("by_org_and_assigned", ["orgId", "assignedTo"])
```

### `tasks`
Inside projects. Assigned to team members.

```typescript
tasks: defineTable({
  orgId: v.id("orgs"),
  projectId: v.id("projects"),
  title: v.string(),
  pipelineId: v.id("pipelines"),      // which pipeline this task follows
  currentStageId: v.string(),         // matches pipelines.stages[].id — dynamic, NOT hardcoded
  assignedTo: v.optional(v.id("users")),
  dueDate: v.optional(v.number()),
  completedAt: v.optional(v.number()),
  createdAt: v.number(),
  updatedAt: v.number(),
})
.index("by_project", ["orgId", "projectId"])
.index("by_assigned", ["orgId", "assignedTo", "currentStageId"])
```

### `milestones`

```typescript
milestones: defineTable({
  orgId: v.id("orgs"),
  projectId: v.id("projects"),
  name: v.string(),
  dueDate: v.number(),
  completedAt: v.optional(v.number()),
  createdAt: v.number(),
})
.index("by_project", ["orgId", "projectId"])
```

---

## Communications Tables — Phase 4

### `conversations`
Threaded conversation linked to any CRM entity. External channels (WhatsApp, email) pipe INTO this.

```typescript
conversations: defineTable({
  orgId: v.id("orgs"),
  entityType: v.optional(v.string()),   // "lead"|"contact"|"deal"|"project"|null (standalone)
  entityId: v.optional(v.string()),
  title: v.optional(v.string()),
  channel: v.string(),                  // "internal" on creation; messages have per-message channel
  status: v.string(),                   // "open"|"resolved"|"snoozed"
  lastMessageAt: v.optional(v.number()),
  createdAt: v.number(),
  updatedAt: v.number(),
})
.index("by_org_and_entity", ["orgId", "entityType", "entityId"])
.index("by_org_and_status", ["orgId", "status"])
```

### `conversationParticipants`

```typescript
conversationParticipants: defineTable({
  orgId: v.id("orgs"),
  conversationId: v.id("conversations"),
  userId: v.id("users"),
  role: v.string(),              // "agent"|"client"
  lastReadAt: v.optional(v.number()),
  createdAt: v.number(),
})
.index("by_conversation", ["conversationId"])
.index("by_user", ["orgId", "userId"])
```

### `messages`
A single message in a conversation. `channel` distinguishes where it came from.

```typescript
messages: defineTable({
  orgId: v.id("orgs"),
  conversationId: v.id("conversations"),
  senderId: v.id("users"),
  senderType: v.string(),        // "user"|"ai"|"integration"
  body: v.string(),
  channel: v.string(),           // "internal"|"whatsapp"|"email"|"slack"
  externalMessageId: v.optional(v.string()), // for external channel dedup
  attachments: v.optional(v.array(v.object({
    url: v.string(),
    name: v.string(),
    type: v.string(),
  }))),
  createdAt: v.number(),
  deletedAt: v.optional(v.number()),
})
.index("by_conversation", ["conversationId", "createdAt"])
.index("by_org_and_external", ["orgId", "externalMessageId"])
```

### `channelAccounts` — Phase 5 (External Channel Bridges)
Per-org configuration for each external channel (WhatsApp, Gmail).

```typescript
channelAccounts: defineTable({
  orgId: v.id("orgs"),
  channel: v.string(),           // "whatsapp"|"email"
  credentials: v.any(),          // encrypted OAuth tokens or API keys
  config: v.any(),               // channel-specific config
  status: v.string(),            // "active"|"inactive"|"error"
  createdAt: v.number(),
  updatedAt: v.number(),
})
.index("by_org_and_channel", ["orgId", "channel"])
```

---

## Client Portal Tables — Phase 9

### `connections`
Links an org to external clients/partners.

```typescript
connections: defineTable({
  orgId: v.id("orgs"),
  type: v.string(),              // "client"|"partner"
  name: v.string(),
  projectId: v.optional(v.id("projects")),
  createdAt: v.number(),
})
.index("by_org", ["orgId"])
```

### `connectionParticipants`
Individual users within a connection (external roles).

```typescript
connectionParticipants: defineTable({
  orgId: v.id("orgs"),
  connectionId: v.id("connections"),
  userId: v.id("users"),
  role: v.string(),              // "client"|"partner"
  createdAt: v.number(),
})
.index("by_connection", ["orgId", "connectionId"])
.index("by_user", ["orgId", "userId"])
```

---

## Integration Tables — Phase 6

### `integrations`

```typescript
integrations: defineTable({
  orgId: v.id("orgs"),
  type: v.string(),              // "hubspot"|"slack"|"notion"|"zapier"|"csv"
  name: v.string(),              // human label
  credentials: v.any(),          // encrypted tokens (never expose to client)
  config: v.any(),               // integration-specific config
  enabled: v.boolean(),
  webhookSecret: v.optional(v.string()),
  lastSyncAt: v.optional(v.number()),
  createdAt: v.number(),
  updatedAt: v.number(),
})
.index("by_org_and_type", ["orgId", "type"])
```

### `integrationMappings`
Field mappings between external systems and Orbitly fields.

```typescript
integrationMappings: defineTable({
  orgId: v.id("orgs"),
  integrationId: v.id("integrations"),
  externalEntity: v.string(),    // "hubspot_contact", "notion_page"
  orbitlyEntity: v.string(),     // "lead", "contact", "deal"
  fieldMappings: v.array(v.object({
    externalField: v.string(),
    orbitlyField: v.string(),    // fixed field name or dynamic fieldDefinition name
    transform: v.optional(v.string()),
  })),
  createdAt: v.number(),
  updatedAt: v.number(),
})
.index("by_integration", ["orgId", "integrationId"])
```

### `integrationStagingData`
Incoming data with unmapped fields — pending admin review.

```typescript
integrationStagingData: defineTable({
  orgId: v.id("orgs"),
  integrationId: v.id("integrations"),
  source: v.string(),
  rawData: v.any(),
  unmappedFields: v.array(v.string()),
  status: v.string(),            // "pending_mapping"|"processed"|"ignored"
  createdAt: v.number(),
})
.index("by_org_and_status", ["orgId", "status"])
```

### `integrationEvents`
Log of every sync event.

```typescript
integrationEvents: defineTable({
  orgId: v.id("orgs"),
  integrationId: v.id("integrations"),
  direction: v.string(),         // "inbound"|"outbound"
  externalId: v.string(),
  status: v.string(),            // "pending"|"processed"|"failed"
  error: v.optional(v.string()),
  createdAt: v.number(),
})
.index("by_org_and_integration", ["orgId", "integrationId"])
```

---

## AI Tables — Phase 3

### `aiConversations`
One conversation per user per org. Enables "continue where you left off" and admin audit.

```typescript
aiConversations: defineTable({
  orgId: v.id("orgs"),
  userId: v.id("users"),
  title: v.optional(v.string()),       // auto-generated from first message
  messageCount: v.number(),            // denormalized counter
  lastMessageAt: v.number(),           // for sorting
  createdAt: v.number(),
  updatedAt: v.number(),
})
.index("by_user_and_org", ["orgId", "userId"])
.index("by_org_and_recent", ["orgId", "lastMessageAt"])
```

### `aiMessages`
Individual messages within a conversation. Both user and assistant messages.

```typescript
aiMessages: defineTable({
  orgId: v.id("orgs"),
  conversationId: v.id("aiConversations"),
  role: v.string(),                    // "user"|"assistant"|"system"
  content: v.string(),                 // message text (may contain markdown)
  toolCalls: v.optional(v.array(v.object({
    toolName: v.string(),
    input: v.any(),                    // sanitized tool input
    result: v.optional(v.any()),       // tool result summary
  }))),
  tokenUsage: v.optional(v.object({
    input: v.number(),
    output: v.number(),
  })),
  createdAt: v.number(),
})
.index("by_conversation", ["conversationId", "createdAt"])
.index("by_org", ["orgId", "createdAt"])
```

---

## Full Table Roadmap

| Table | Phase | Status |
|---|---|---|
| `users` | 0 | ✅ done |
| `orgs` | 0 | ✅ done |
| `orgMembers` | 0 | ✅ done |
| `invitations` | 0 | ✅ done |
| `notifications` | 0 | ✅ done |
| `activityLogs` | 0 | ✅ done |
| `featureFlags` | 0 | ✅ done |
| `fieldDefinitions` | 2 | pending |
| `fieldValues` | 2 | pending |
| `pipelines` | 2 | pending |
| `leads` | 2 | pending |
| `contacts` | 2 | pending |
| `companies` | 2 | pending |
| `deals` | 2 | pending |
| `reminders` | 2 | pending |
| `notes` | 2 | pending |
| `projects` | 8 | pending |
| `tasks` | 8 | pending |
| `milestones` | 8 | pending |
| `conversations` | 4 | pending |
| `conversationParticipants` | 4 | pending |
| `messages` | 4 | pending |
| `channelAccounts` | 5 | pending |
| `connections` | 9 | pending |
| `connectionParticipants` | 9 | pending |
| `integrations` | 6 | pending |
| `integrationMappings` | 6 | pending |
| `integrationStagingData` | 6 | pending |
| `integrationEvents` | 6 | pending |
| `aiConversations` | 3 | pending |
| `aiMessages` | 3 | pending |

---

## Shared Validators → [`convex/_shared/validators.ts`](../../convex/_shared/validators.ts)

Key exports: `orgScoped`, `timestamps`, `softDelete`, `createdBy`, `orgRoleValidator`, `orgPlanValidator`, `platformRoleValidator`, `ORG_ROLE_RANK`

## Shared Constants → [`convex/_shared/constants.ts`](../../convex/_shared/constants.ts)

Key exports: `PLAN_FEATURES`, `PLAN_LIMITS`, `FEATURE_FLAGS`, `INVITATION_EXPIRY_MS`, `ENTITY_TYPES`, `FIELD_TYPES`, `ACTOR_TYPES`, `DEFAULT_PIPELINE_STAGES` (seed data for new orgs)

> **NOTE:** `DEAL_STAGES` and `LEAD_STATUSES` are REMOVED. Entity statuses are now dynamic via `pipelines` table. Default stages are seeded per org on creation from `DEFAULT_PIPELINE_STAGES`.

## Permissions → [`convex/_shared/permissions.ts`](../../convex/_shared/permissions.ts)

Key exports: `PERMISSIONS`, `hasPermission()`, `requireRole()`, `hasMinRole()`, `requireMinRole()`, `requirePlanFeature()`

---

## Current State

**Status**: Phase 0 base tables ✅ complete. Phase 2 CRM tables pending (start after _shell).
**Tests**: 102 passing, 1 skipped

# entities Module (Core)

> All CRM entities: leads, contacts, deals, companies + 2 optional slots (entity5, entity6).
> Shared scaffolds ensure every entity uses the same patterns. New entity = ~5 files, 1-2 days.
> Every person in the system has a single personCode (P-001) that travels across leads → contacts
> → deals → follow-ups → projects forever. The person is ONE identity, not fragmented per record type.

## Ownership
- **Location**: `core/entities/`
- **Backend**: `convex/leads/`, `convex/contacts/`, `convex/deals/`, `convex/companies/`
- **Routes**: `app/[locale]/(private)/dashboard/[orgSlug]/[entity]/` and `[entity]/[id]/`
- **Phase**: 2 | **Status**: NOT_STARTED

---

## The personCode System

Every person enters the system as a lead. At that moment, a `personCode` is generated (e.g., `P-001`).
This code NEVER changes and travels to every related record:

```
Lead created              → personCode: "P-001" (generated here, once)
Lead converts to Contact  → contact.personCode = "P-001" (passed over, NOT regenerated)
Deal opened for person    → deal.personCode = "P-001" (direct field, one lookup away)
Follow-up set             → followup.personCode = "P-001"
Project created from deal → project.personCode = "P-001"
```

**Why no separate persons table**: Lead and Contact are different DB records (different fields, different
lifecycle stages) but they share the same personCode. No join table needed — personCode on each record
IS the connection. Searching for `P-001` across leads, contacts, deals, follow-ups, projects gives
the complete lifecycle view in a single index scan per table.

**Org-customizable prefixes**: Stored in `orgSettings.codePrefixes`. Default `P` can be changed to
`IN` (Inquiry), `CL` (Client), `PR` (Prospect), etc. from Settings → Record Codes.
Numbers never change — only the prefix letters update (background job patches all records).

### Code assignment rules
- `generatePersonCode()` called ONLY in `convex/leads/mutations.ts::create`
- On conversion: `lead.personCode` is READ and passed to `contacts.create` — NEVER regenerated
- Deals, follow-ups, projects: call `generateEntityCode("deal"|"followup"|"project"|"task")`
- Companies: call `generateEntityCode("company")`

---

## Person Detail Page — The Central Hub

When any agent opens a person record (lead OR contact), the detail page is the command center:

```
PersonDetailPage
├── Header
│   ├── displayName + personCode badge (P-001) — prominent, always visible
│   ├── Quick actions: [Add Note] [Set Follow-up] [Open Deal] [Draft Message]
│   └── AI panel auto-loads entity context (personCode + aiContext + last 5 events)
│
├── Left column (70%)
│   ├── Tab: Overview
│   │   ├── Core fields (email, phone, company)
│   │   ├── Dynamic fields (from fieldDefinitions, stage-aware)
│   │   └── Connected records: deals (D-001, D-007), company (CO-003)
│   │
│   ├── Tab: Activity (UnifiedTimeline)
│   │   ├── DEFAULT: shows events for THIS personCode across ALL tables
│   │   │   (lead creation, contact conversion, stage changes, notes, follow-ups, WhatsApp, AI actions)
│   │   ├── RBAC toggle: Admin sees all. Member sees own-assigned. Viewer sees public only.
│   │   ├── Toggle: [This Person Only ⟷ Full Org View] — expands to full org timeline
│   │   └── Infinite scroll — latest first, load older on scroll up
│   │
│   ├── Tab: Notes
│   │   ├── TipTap rich editor — bold, italic, links, @mentions
│   │   ├── Pin important notes
│   │   └── Internal notes (isInternal: true) — hidden from non-admin roles
│   │
│   └── Tab: Messages (ActivityChat) — Phase 4
│       └── Chat thread: human messages + AI on-behalf messages
│
└── Right sidebar (30%)
    ├── Pipeline stage (deals linked to this person)
    ├── Assigned to
    ├── Tags
    ├── Follow-ups / Reminders (list of FU-001, FU-002...)
    ├── Open deals (D-001 in Offer/MOU, D-007 in New)
    └── AI Context panel (admin-only read — entity.aiContext JSON)
```

### UnifiedTimeline on Person Detail

The key architectural decision: the timeline queries by `personCode`, not just `entityId`:

```typescript
// convex/activityLogs/queries.ts::getPersonTimeline
export const getPersonTimeline = orgQuery({
  args: { personCode: v.string() },
  handler: async (ctx, { personCode }) => {
    // Query activityLogs WHERE personCode = "P-001"
    // This gets events from lead, contact, deals, follow-ups — all tables at once
    // RBAC filter applied based on role
    const logs = await ctx.db.query("activityLogs")
      .withIndex("by_org_and_personCode", q =>
        q.eq("orgId", ctx.org._id).eq("personCode", personCode))
      .order("desc")
      .take(50);

    // Also pull: notes, reminders, whatsapp threads (via orbitLinks)
    return applyRBACFilter(ctx, [...logs, ...notes, ...reminders]);
  },
});
```

Every `activityLog` row has `personCode` field — this is the key enabler of the unified view.

### RBAC Timeline Toggle

```typescript
// core/entities/shared/components/PersonTimeline.tsx
const [scope, setScope] = useState<"person" | "all">("person");
const canSeeAll = useOrgPermission("timeline.viewAll"); // admin+

return (
  <>
    {canSeeAll && (
      <Toggle
        options={["This Person Only", "Full Org"]}
        value={scope}
        onChange={setScope}
      />
    )}
    <UnifiedTimeline personCode={personCode} scope={scope} />
  </>
);
```

---

## AI Proactiveness on Person Detail Page

When the AI panel opens while viewing a person, it immediately loads context and shows:

```
AI Panel when on P-001 (John Smith):
┌─────────────────────────────────────────────────────┐
│ 📋 John Smith (P-001)                               │
│ Contact · Last contacted 14 days ago via WhatsApp   │
│                                                     │
│ Key context:                                        │
│ • Budget AED 120K | Prefers 2BR JVC                 │
│ • Deal D-001 in Offer/MOU (5 days)                  │
│ • Follow-up FU-001 due tomorrow                     │
│ • ⚠️ No response in 14 days                        │
│                                                     │
│ Suggested next steps:                               │
│ [Schedule Follow-up]  [Draft WhatsApp Message]      │
│ [Move Deal to Next Stage]  [Get Full Summary]       │
└─────────────────────────────────────────────────────┘
```

The AI does NOT wait for the user to ask — it surfaces the most relevant context immediately.
This works because:
1. `entityContext: { entityType, entityId, personCode }` is injected from `useAIChat()` hook
2. System prompt receives `entity.aiContext` (pre-computed summary) + recent events
3. AI suggests actions based on: days since last contact, open reminders, deal stage, stale risk

---

## AI Message & Follow-up Drafting

When an agent needs to send a message or set a follow-up, the AI drafts it:

### Draft WhatsApp / Email
```
Agent clicks: [Draft WhatsApp Message]
AI: "Here's a draft based on John's history and last conversation:

     'Hi John, hope you're well! Just following up on the 2BR JVC unit we
      discussed. The landlord has confirmed the price is firm at AED 115K.
      Would you like to schedule a viewing this week? 📍'

     [Edit & Send]  [Regenerate]  [Dismiss]"
```

The draft is based on:
- `entity.aiContext` (key facts: budget, preference, last interaction)
- `activityLogs` for this personCode (conversation history)
- `notes` (any pinned notes about this person)
- The current deal stage (AI knows what stage the conversation should be at)

### Natural Language Follow-up Scheduling

AI handles ALL date parsing — users never enter dates manually when talking to AI:

```
Agent: "Set a follow-up with John for next Monday"
AI tool set_reminder receives: { naturalLanguageDate: "next Monday", personCode: "P-001" }
Server resolves: date-fns addDays / nextMonday(new Date()) → timestamp
Creates: reminder record with exact timestamp + FU-001 code
AI responds: "Follow-up set for Monday, May 10 at 9:00 AM ✓"
             [Edit time] [View FU-001]
```

```
Agent: "Remind me about this deal in 3 days"
→ date-fns: addDays(new Date(), 3) → timestamp

Agent: "Follow up next week Thursday"
→ date-fns: nextThursday(addWeeks(new Date(), 1)) → timestamp

Agent: "Set a reminder for end of month"
→ date-fns: endOfMonth(new Date()) → timestamp
```

**No confirmation needed for reminders** — scheduling is not destructive. Only delete/bulk/stage
changes require confirmation. Reminder creation is instant, shown in tool result card.

---

## Rules
- [ ] R-ENT-01: Every entity MUST use the 4 shared scaffolds (EntityListPage, EntityDetailPage, EntityFormDialog, EntityCard)
- [ ] R-ENT-02: `displayName` MUST be set on create for leads/contacts. `title` for deals. `name` for companies.
- [ ] R-ENT-03: Deals use `pipelineId` + `currentStageId` + `stageEnteredAt`. Leads use simple `status` field.
- [ ] R-ENT-04: Dedup check runs on create for leads and contacts (shared engine in `convex/dedup/`)
- [ ] R-ENT-05: Entity labels are dynamic from `orgSettings.entityLabels` — never hardcode "Lead", "Contact"
- [ ] R-ENT-06: Entity code prefixes are dynamic from `orgSettings.codePrefixes` — never hardcode "P", "D"
- [ ] R-ENT-07: Entity5/Entity6 use the SAME scaffolds — zero special code. Only `entityType` value differs.
- [ ] R-ENT-08: Each entity module only defines: custom columns, custom card, custom detail tabs, types
- [ ] R-ENT-09: Never import one entity module from another (leads ≠ contacts ≠ deals)
- [ ] R-ENT-10: Every mutation calls `logActivity()` with `personCode` AND `entityType` AND `entityId`
- [ ] R-ENT-11: `generatePersonCode()` called ONLY in `leads.create` — passed to contacts on conversion
- [ ] R-ENT-12: personCode displayed prominently on every entity card and detail page header
- [ ] R-ENT-13: Entity detail page injects `entityContext` into AI panel via `useAIChat()` hook

---

## Folder Structure

```
core/entities/
├── MODULE.md                         # This file
├── scaffolds/
│   ├── EntityListPage.tsx            # List + board toggle, toolbar, filters, bulk actions
│   ├── EntityDetailPage.tsx          # Tabs + right sidebar + sticky header + AI injection
│   ├── EntityFormDialog.tsx          # react-hook-form + zod + dynamic fields + dedup check
│   └── EntityCard.tsx                # Base kanban card (personCode badge, name, stage, stale)
│
├── shared/
│   ├── components/
│   │   ├── DynamicFieldRenderer.tsx  # Renders fields from fieldDefinitions (stage-aware)
│   │   ├── TagPicker.tsx             # Tag selector (any entity)
│   │   ├── AssigneeSelect.tsx        # User picker
│   │   ├── DedupBanner.tsx           # "Possible duplicate found" banner
│   │   ├── StaleIndicator.tsx        # Red border + badge
│   │   ├── PersonTimeline.tsx        # Unified timeline for person (queries by personCode)
│   │   ├── PersonCodeBadge.tsx       # "P-001" badge component (used everywhere)
│   │   └── ConnectedRecords.tsx      # Shows deals, follow-ups, company linked to person
│   │
│   └── hooks/
│       ├── useEntity.ts              # Generic entity CRUD hook factory
│       ├── useEntityColumns.ts       # Base column factory
│       ├── useDynamicFields.ts       # Load fieldDefinitions + fieldValues (stage-aware)
│       ├── usePipeline.ts            # Load pipeline stages for deals
│       ├── useTags.ts                # Tag operations
│       ├── useBulkActions.ts         # Select-all + bulk operations
│       ├── useDedup.ts               # Dedup check on create
│       ├── useSavedViews.ts          # Filter presets + sidebar pinning
│       └── usePersonGraph.ts         # Loads all orbitLinks for a personCode
│
├── leads/
│   ├── types.ts                      # Doc<"leads"> derived type + LeadStatus enum
│   ├── hooks/
│   │   ├── useLeads.ts               # useQuery(api.leads.list) + filter state
│   │   └── useLeadColumns.ts         # Column definitions for DataTable
│   └── components/
│       ├── LeadList.tsx              # ~25 lines — passes config to EntityListPage
│       ├── LeadBoard.tsx             # ~20 lines — simple status board (not pipeline kanban)
│       ├── LeadCard.tsx              # Extends EntityCard with lead status badge
│       ├── LeadDetail.tsx            # ~30 lines — passes tabs config to EntityDetailPage
│       └── AddLeadDialog.tsx         # ~20 lines — passes config to EntityFormDialog
│
├── contacts/                         # Same pattern as leads
├── companies/                        # List-only (no board view), simpler
├── deals/                            # Kanban is PRIMARY view (full pipeline)
├── entity5/                          # Hidden by default, activated per industry
└── entity6/                          # Hidden by default, activated per industry
```

---

## Scaffold Pattern — Write Once, Use 6x

Every entity page in `app/` is ≤ 30 lines. Configuration only:

```typescript
// core/entities/leads/components/LeadList.tsx — ~25 lines
export function LeadList() {
  const leads = useLeads();
  const columns = useLeadColumns();
  const labels = useEntityLabels("lead");   // dynamic from orgSettings

  return (
    <EntityListPage
      title={labels.plural}                 // "Leads" or "Prospects" or whatever org named it
      columns={columns}
      data={leads}
      views={["list", "board"]}
      BoardCard={LeadCard}
      onAdd={() => openCreateDialog()}
      emptyState={<LeadEmptyState />}
      bulkActions={["assign", "stage", "tag", "delete"]}
    />
  );
}
// EntityListPage handles: toolbar, search, filters, view toggle, column visibility,
// pagination, bulk action bar, loading skeleton, keyboard shortcuts
```

```typescript
// core/entities/leads/components/LeadDetail.tsx — ~30 lines
export function LeadDetail({ leadId }: { leadId: Id<"leads"> }) {
  const lead = useLead(leadId);

  return (
    <EntityDetailPage
      entity={lead}
      entityType="lead"
      personCode={lead?.personCode}             // P-001 shown in header
      tabs={[
        { id: "overview",  label: "Overview",  content: <LeadOverviewTab lead={lead} /> },
        { id: "activity",  label: "Activity",  content: <PersonTimeline personCode={lead?.personCode} /> },
        { id: "notes",     label: "Notes",     content: <NotesTab entityType="lead" entityId={leadId} /> },
      ]}
      sidebarContent={<LeadSidebar lead={lead} />}
      actions={<LeadActions lead={lead} />}
    />
  );
  // EntityDetailPage injects entityContext into AI panel automatically
}
```

---

## Convex Backend Pattern — Identical Across All Entities

```typescript
// convex/leads/mutations.ts::create — canonical pattern for ALL entities
export const create = orgMutation({
  args: {
    displayName:  v.string(),
    email:        v.optional(v.string()),
    phone:        v.optional(v.string()),
    source:       v.string(),          // "manual" | "csv" | "ai" | "whatsapp"
    assignedTo:   v.optional(v.id("users")),
    fieldValues:  v.optional(v.array(v.object({ fieldId: v.id("fieldDefinitions"), value: v.any() }))),
  },
  handler: async (ctx, args) => {
    // 1. RBAC — identical for UI, AI, WhatsApp
    await requirePermission(ctx, "leads.create");

    // 2. Dedup check
    const dupes = await runDedup(ctx, { email: args.email, name: args.displayName });
    if (dupes.length > 0) return { id: null, personCode: null, duplicates: dupes };

    // 3. Generate personCode (ONLY called here — never on contact create)
    const personCode = await generatePersonCode(ctx, ctx.org._id);

    // 4. Insert
    const leadId = await ctx.db.insert("leads", {
      orgId: ctx.org._id,
      personCode,                      // "P-001" — the identity, forever
      displayName: args.displayName,
      email: args.email,
      phone: args.phone,
      source: args.source,
      status: "new",                   // leads have status, not pipeline stages
      assignedTo: args.assignedTo,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    // 5. Dynamic field values
    if (args.fieldValues?.length) {
      await batchUpsertFieldValues(ctx, "lead", leadId, args.fieldValues);
    }

    // 6. Activity log (personCode included — enables cross-entity timeline)
    await logActivity(ctx, {
      action: "lead.created",
      entityType: "lead",
      entityId: leadId,
      personCode,                      // KEY: every activityLog has personCode
      description: `Lead "${args.displayName}" created`,
      source: args.source,
    });

    // 7. Notification
    if (args.assignedTo) {
      await sendNotification(ctx, {
        to: args.assignedTo,
        templateKey: "lead.assigned",
        vars: { name: args.displayName, personCode },
        entityType: "lead",
        entityId: leadId,
      });
    }

    // 8. Schedule entityAIContext rebuild (non-blocking background job)
    await ctx.scheduler.runAfter(0, internal.ai.rebuildEntityContext, {
      entityType: "lead", entityId: leadId, personCode,
    });

    return { id: leadId, personCode, duplicates: [] };
  },
});
```

```typescript
// convex/leads/mutations.ts::convertToContact
export const convertToContact = orgMutation({
  args: {
    leadId:      v.id("leads"),
    createDeal:  v.boolean(),
    dealTitle:   v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requirePermission(ctx, "leads.convert");
    const lead = await ctx.db.get(args.leadId);

    // CRITICAL: personCode is PASSED, not regenerated
    const contactId = await ctx.db.insert("contacts", {
      orgId:        ctx.org._id,
      personCode:   lead.personCode,   // "P-001" — same identity, new record type
      leadId:       args.leadId,       // traceability link
      displayName:  lead.displayName,
      email:        lead.email,
      phone:        lead.phone,
      assignedTo:   lead.assignedTo,
      createdAt:    Date.now(),
      updatedAt:    Date.now(),
    });

    // Copy dynamic field values from lead → contact
    await copyFieldValues(ctx, "lead", args.leadId, "contact", contactId);

    // Mark lead converted (never delete)
    await ctx.db.patch(args.leadId, {
      convertedAt: Date.now(),
      contactId,
      updatedAt:   Date.now(),
    });

    // OrbitLink: lateral connection record
    await ctx.db.insert("orbitLinks", {
      orgId:     ctx.org._id,
      fromCode:  lead.personCode,
      fromType:  "lead",
      toCode:    lead.personCode,  // same personCode on contact — the link IS the shared code
      toType:    "contact",
      linkType:  "converted_to",
      metadata:  { contactId },
      createdAt: Date.now(),
    });

    // Optionally create deal
    if (args.createDeal) {
      const dealCode = await generateEntityCode(ctx, ctx.org._id, "deal");
      const defaultPipeline = await getDefaultDealPipeline(ctx);
      await ctx.db.insert("deals", {
        orgId:          ctx.org._id,
        dealCode,
        personCode:     lead.personCode,   // connect deal to person
        contactId,
        title:          args.dealTitle ?? `Deal with ${lead.displayName}`,
        pipelineId:     defaultPipeline._id,
        currentStageId: defaultPipeline.stages[0].id,
        stageEnteredAt: Date.now(),
        createdAt:      Date.now(),
        updatedAt:      Date.now(),
      });
    }

    await logActivity(ctx, {
      action: "lead.converted",
      entityType: "lead",
      entityId: args.leadId,
      personCode: lead.personCode,
    });

    // Rebuild AI context for the new contact record
    await ctx.scheduler.runAfter(0, internal.ai.rebuildEntityContext, {
      entityType: "contact", entityId: contactId, personCode: lead.personCode,
    });

    return { contactId };
  },
});
```

---

## Convex Query Pattern

```typescript
// convex/leads/queries.ts::list — same pattern for all entities
export const list = orgQuery({
  args: {
    status:     v.optional(v.string()),          // "new" | "qualified" | "converted"
    assignedTo: v.optional(v.id("users")),
    search:     v.optional(v.string()),
    showConverted: v.optional(v.boolean()),      // false by default
    cursor:     v.optional(v.string()),
    take:       v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    let query = ctx.db.query("leads")
      .withIndex("by_org", q => q.eq("orgId", ctx.org._id));

    // NEVER use .collect() — always paginate
    const page = await query.paginate({
      numItems: args.take ?? 50,
      cursor:   args.cursor ?? null,
    });

    // Filter converted leads (hidden by default)
    const items = args.showConverted
      ? page.page
      : page.page.filter(l => !l.convertedAt);

    return { ...page, page: items };
  },
});
```

---

## Tables Owned

| Table | Description | Key Indexes |
|---|---|---|
| `leads` | Lead records | `by_org`, `by_org_and_status`, `by_org_and_assignee`, `by_org_and_personCode` |
| `contacts` | Contact records | `by_org`, `by_org_and_personCode`, `by_org_and_company` |
| `deals` | Deal records | `by_org`, `by_org_and_pipeline`, `by_org_and_stage`, `by_org_and_personCode` |
| `companies` | Company records | `by_org`, `by_org_and_companyCode` |
| `entity5s` | Optional slot | `by_org`, `by_org_and_personCode` |
| `entity6s` | Optional slot | `by_org`, `by_org_and_personCode` |
| `entityCodeCounters` | Per-org, per-type code counter | `by_org_and_type` |
| `orbitLinks` | Lateral connections (deal↔company, contact↔whatsapp, etc.) | `by_org_and_from`, `by_org_and_to` |

### New fields on every entity table (v2.2)
```typescript
personCode:  v.string(),              // "P-001" — indexed, connects person across tables
aiContext:   v.optional(v.any()),     // auto-rebuilt compressed summary for AI
```

### New fields on deals, followups, projects, tasks
```typescript
dealCode:      v.string(),            // "D-001" — own counter
personCode:    v.optional(v.string()), // links to the person
companyCode:   v.optional(v.string()), // links to company
```

---

## Permission Keys

| Key | Roles | Description |
|---|---|---|
| `leads.create` | owner, admin, member | Create lead |
| `leads.view` | all | View leads |
| `leads.update` | owner, admin, member | Edit lead |
| `leads.delete` | owner, admin | Delete lead |
| `leads.convert` | owner, admin, member | Convert lead → contact |
| `leads.import` | owner, admin | CSV import |
| `contacts.create` | owner, admin, member | Create contact |
| `contacts.view` | all | View contacts |
| `contacts.update` | owner, admin, member | Edit contact |
| `deals.create` | owner, admin, member | Create deal |
| `deals.view` | all | View deals |
| `deals.viewValues` | owner, admin | See deal monetary values on kanban cards |
| `deals.moveStage` | owner, admin, member | Drag deal between stages |
| `timeline.viewAll` | owner, admin | See full org timeline (not just assigned) |
| `notes.viewInternal` | owner, admin | See internal notes |

---

## Cross-Module Integration

### → AI System
AI tools in `convex/ai/tools/` call entity mutations via `ctx.runMutation(internal.leads.create)`.
Entity modules do NOT import AI code. Data flows one way: AI → entity mutations.

Entity detail page injects `entityContext` into AI panel:
```typescript
// app/[locale]/(private)/dashboard/[orgSlug]/leads/[id]/page.tsx
// EntityDetailPage scaffold automatically calls: useAIChat({ entityContext: { entityType: "lead", entityId: id, personCode } })
// AI panel header shows: "Viewing: John Smith (P-001)" with proactive suggestions
```

### → Timelines
Every mutation calls `logActivity()` with `personCode` field.
Timeline queries by `personCode` to show complete cross-entity history.

### → Notifications
Every assignment + status change calls `sendNotification()`.
Notifications are scoped to `userId` (never org-wide blasts).

### → Dynamic Fields
All entity forms use `useDynamicFields(entityType, currentStageId)` — returns stage-filtered fields.
Backend filters by `showInStages` before returning to client.

### → Record Codes
Settings → Record Codes page allows prefix customization.
Background job (`trigger/jobs/renamePrefixes.ts`) patches all records when prefix changes.
Numbers are PERMANENT — only prefixes can change.

---

## Avoids
- ❌ Never call `generatePersonCode()` on contact create — only pass from lead
- ❌ Never hardcode entity labels ("Lead", "Contact") → orgSettings.entityLabels
- ❌ Never hardcode code prefixes ("P", "D") → orgSettings.codePrefixes
- ❌ Never build custom list/detail pages from scratch → use scaffolds
- ❌ Never import one entity module from another → share via core/entities/shared/
- ❌ Never skip `personCode` in `logActivity()` calls → breaks person timeline
- ❌ Never use `.collect()` on entity tables → always paginate
- ❌ Never hardcode pipeline stages → always read from pipelines table
- ❌ Never skip dedup on lead/contact create

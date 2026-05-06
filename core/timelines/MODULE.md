# timelines Module (Core)

> Two distinct timeline systems serving different purposes:
> 1. UnifiedTimeline — RBAC-scoped audit trail of everything (entity detail + settings page)
> 2. ActivityChat — Human messages + AI on-behalf messages in chat bubble UI (Phase 4)
>
> The personCode system is the backbone of the unified timeline: every activityLog row stores
> personCode, enabling a single query to show a person's entire lifecycle history across
> leads, contacts, deals, follow-ups, notes, WhatsApp, and AI actions.

## Ownership
- **Location**: `core/timelines/`
- **Backend**: `convex/activityLogs/`, `convex/notes/`, `convex/reminders/`, `convex/activityChat/`
- **Phase**: 2 | **Status**: NOT_STARTED

---

## Two Systems — Never Mix Them

```
UnifiedTimeline (Phase 2)              ActivityChat (Phase 4)
─────────────────────────────          ─────────────────────────────
What: activityLogs + notes +           What: human messages + AI on-behalf
      reminders + AI actions +                messages ONLY
      integration events
Style: Timeline entries (icons,        Style: Chat bubbles (WhatsApp-like)
       timestamps, diff display)
RBAC: Filtered by role                 RBAC: All members can see
Data: Permanent audit trail            Data: Conversational threads
Used on: Entity detail Activity tab,   Used on: Entity detail Messages tab
         settings/activity-log page           (Phase 4)
Scope: Queries by personCode           Scope: Queries by entityType+entityId
       (shows full lifecycle)
```

---

## UnifiedTimeline — personCode Query (Key Architecture Decision)

The timeline queries by `personCode` (not just `entityId`) so that when an agent opens a
contact record, they see the COMPLETE lifecycle: lead creation → conversion → deals → notes
→ follow-ups → WhatsApp messages → AI actions. All in one chronological feed.

```typescript
// convex/activityLogs/queries.ts::getPersonTimeline
export const getPersonTimeline = orgQuery({
  args: {
    personCode: v.string(),
    scope:      v.union(v.literal("person"), v.literal("all")),  // "person" = this P-001 only, "all" = full org
    cursor:     v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // RBAC check — determines what the calling user can see
    const member  = await getOrgMember(ctx);
    const role    = await ctx.db.get(member.roleId);
    const isAdmin = role.permissions.includes("timeline.viewAll");

    if (args.scope === "person") {
      // Query: all activityLogs where personCode = "P-001"
      // This crosses tables: lead creation, contact conversion, stage changes, notes, follow-ups
      const page = await ctx.db.query("activityLogs")
        .withIndex("by_org_and_personCode", q =>
          q.eq("orgId", ctx.org._id).eq("personCode", args.personCode))
        .order("desc")
        .paginate({ numItems: 50, cursor: args.cursor ?? null });

      // RBAC filter on returned items
      const filtered = applyTimelineRBACFilter(page.page, isAdmin, ctx.user._id);
      return { ...page, page: filtered };
    }

    // scope === "all" — only accessible to admin+ (checked by RBAC toggle visibility)
    const page = await ctx.db.query("activityLogs")
      .withIndex("by_org", q => q.eq("orgId", ctx.org._id))
      .order("desc")
      .paginate({ numItems: 50, cursor: args.cursor ?? null });

    return page;
  },
});
```

**Why personCode indexing on activityLogs is critical:**
Every `activityLog` row carries `personCode`. This single field enables:
- One index scan to get complete person history (no client-side merging)
- AI can load recent person history for context (tool: `getPersonGraph`)
- "Show all history for P-001" — works instantly, no N+1 queries

### activityLog row structure (every mutation logs this)
```typescript
{
  orgId:       ctx.org._id,
  userId:      ctx.user._id,
  actorType:   "user" | "ai" | "system" | "integration",
  action:      "lead.created" | "lead.converted" | "deal.stage_changed" | "note.added" | ...,
  entityType:  "lead" | "contact" | "deal" | "company" | "reminder" | ...,
  entityId:    string,
  personCode:  string,      // ALWAYS set — enables person timeline queries
  description: string,
  metadata:    any,         // diff data, old/new values, etc.
  source:      "manual" | "ai" | "whatsapp" | "csv" | "system",
  createdAt:   number,
}
```

---

## RBAC-Based Timeline Filtering

```typescript
// Applied server-side in Convex query — never client-side

function applyTimelineRBACFilter(
  logs: ActivityLog[],
  isAdmin: boolean,
  currentUserId: Id<"users">
): ActivityLog[] {
  if (isAdmin) return logs; // admin sees everything

  return logs.filter(log => {
    // Members see: their own actions, public field changes, stage moves
    // Members do NOT see: other members' internal notes, sensitive field changes
    if (log.actorType === "user" && log.userId !== currentUserId) {
      // Filter out other users' sensitive actions (configurable per org)
      if (SENSITIVE_ACTIONS.includes(log.action)) return false;
    }
    return true;
  });
}
```

---

## Timeline Entry Types

```typescript
type TimelineEntryType =
  | "lead_created"         // 🎯 New lead P-001 created via WhatsApp
  | "lead_converted"       // 🔄 Converted to contact
  | "stage_changed"        // ⬆️ Deal moved from Viewing → Offer/MOU
  | "field_updated"        // ✏️ Budget updated: AED 100K → AED 120K
  | "note_added"           // 📝 Note added by Ahmed
  | "note_added_ai"        // 🤖 Note added by AI
  | "reminder_set"         // 📅 Follow-up FU-001 set for May 10
  | "reminder_completed"   // ✅ Follow-up FU-001 completed
  | "whatsapp_received"    // 💬 WhatsApp message received
  | "whatsapp_sent"        // 💬 WhatsApp message sent via AI
  | "document_uploaded"    // 📄 Emirates ID uploaded
  | "ai_action"            // 🤖 AI performed an action
  | "csv_imported"         // 📥 Imported via CSV
  | "assigned_to"          // 👤 Assigned to Sarah
  | "deal_created"         // 💼 Deal D-001 opened
  | "deal_won"             // 🎉 Deal D-001 won
  | "deal_lost"            // ❌ Deal D-001 lost
```

---

## Component Structure

```
core/timelines/
├── MODULE.md
│
├── unified-timeline/
│   ├── components/
│   │   ├── UnifiedTimeline.tsx         # Main container — infinite scroll, latest first
│   │   ├── TimelineEntry.tsx           # Single entry (type-specific icon, content, timestamp)
│   │   ├── TimelineEntryDiff.tsx       # Shows old → new values for field updates
│   │   ├── TimelineFilters.tsx         # Filter chips: All / Notes / Stage Changes / AI / WA
│   │   ├── TimelineScopeToggle.tsx     # "This Person Only" ↔ "Full Org" (admin only)
│   │   └── NoteComposer.tsx            # TipTap rich editor — inline note creation
│   └── hooks/
│       ├── usePersonTimeline.ts        # Queries by personCode, infinite scroll
│       └── useOrgTimeline.ts           # Org-wide query (for settings/activity-log page)
│
└── activity-chat/                      # Phase 4
    ├── components/
    │   ├── ActivityChat.tsx            # Chat thread container
    │   ├── ChatBubble.tsx              # Message bubble (with AI on-behalf badge)
    │   └── ChatComposer.tsx            # Message input
    └── hooks/
        └── useActivityChat.ts          # Real-time Convex subscription
```

---

## Entity Detail Page — Activity Tab Implementation

The Activity tab in entity detail pages uses `PersonTimeline` with:
- Default scope: "person" — shows THIS personCode's history across all tables
- Admin toggle: "Full Org" — shows org-wide timeline
- Infinite scroll — latest first, load older on scroll up
- Filter chips — filter by event type
- Internal notes toggle — admin+ sees internal notes (isInternal: true)

```typescript
// core/timelines/unified-timeline/components/UnifiedTimeline.tsx

interface Props {
  personCode: string;
  showScopeToggle?: boolean;  // only shown if user has timeline.viewAll permission
}

export function UnifiedTimeline({ personCode, showScopeToggle }: Props) {
  const [scope, setScope] = useState<"person" | "all">("person");
  const [filter, setFilter] = useState<TimelineEntryType | "all">("all");

  // Infinite scroll with Convex pagination
  const { results, status, loadMore } = usePaginatedQuery(
    api.activityLogs.getPersonTimeline,
    { personCode, scope },
    { initialNumItems: 50 }
  );

  const filtered = filter === "all"
    ? results
    : results.filter(e => e.action.includes(filter));

  return (
    <div>
      <TimelineFilters value={filter} onChange={setFilter} />
      {showScopeToggle && (
        <TimelineScopeToggle value={scope} onChange={setScope} />
      )}
      <div className="space-y-1">
        {filtered.map(entry => (
          <TimelineEntry key={entry._id} entry={entry} />
        ))}
      </div>
      {status === "CanLoadMore" && (
        <button onClick={() => loadMore(50)}>Load older events</button>
      )}
    </div>
  );
}
```

---

## Notes System

Notes are created identically by users and AI. `authorType` distinguishes them in the UI.

```typescript
// convex/notes/mutations.ts::create — called by UI and AI tools identically
export const create = orgMutation({
  args: {
    entityType:  v.string(),
    entityId:    v.string(),
    personCode:  v.string(),           // REQUIRED — for person timeline query
    content:     v.string(),           // TipTap JSON or plain text
    authorType:  v.union(v.literal("user"), v.literal("ai")),
    isInternal:  v.boolean(),          // true = hidden from non-admin
    isPinned:    v.boolean(),
  },
  handler: async (ctx, args) => {
    const noteId = await ctx.db.insert("notes", {
      orgId: ctx.org._id,
      ...args,
      authorId:  ctx.user._id,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    // Activity log with personCode — appears in person timeline
    await logActivity(ctx, {
      action:     args.authorType === "ai" ? "note_added_ai" : "note_added",
      entityType: args.entityType,
      entityId:   args.entityId,
      personCode: args.personCode,     // enables timeline query
      description: `Note added by ${args.authorType === "ai" ? "AI" : "user"}`,
    });

    // Schedule AI context rebuild (non-blocking)
    await ctx.scheduler.runAfter(0, internal.ai.rebuildEntityContext, {
      entityType: args.entityType, entityId: args.entityId, personCode: args.personCode,
    });

    return noteId;
  },
});
```

---

## Settings Activity Log Page

The same `UnifiedTimeline` component is reused on `/settings/activity-log` with `scope: "all"`:

```typescript
// app/[locale]/(private)/dashboard/[orgSlug]/settings/activity-log/page.tsx
<PermissionGate permission="timeline.viewAll">
  <UnifiedTimeline
    scope="all"         // Org-wide — not personCode-scoped
    showFilters         // All filter chips visible
    showDatePicker      // Date range picker for filtering
  />
</PermissionGate>
```

---

## Rules
- [ ] R-TL-01: Every activityLog row MUST include `personCode` — enables cross-entity timeline
- [ ] R-TL-02: UnifiedTimeline ALWAYS applies RBAC filter server-side — never trust client
- [ ] R-TL-03: ActivityChat stores ONLY human + AI on-behalf messages — no logs, no reminders
- [ ] R-TL-04: AI on-behalf messages use `authorType: "ai"` + `onBehalfOf: userId`
- [ ] R-TL-05: Internal notes (isInternal: true) hidden from member/viewer roles
- [ ] R-TL-06: Timeline infinite scrolls — latest first, load older on scroll up
- [ ] R-TL-07: Entity detail Activity tab defaults to "person" scope — admin can toggle to "all"
- [ ] R-TL-08: Notes creation triggers entityAIContext rebuild (non-blocking via scheduler)

## Avoids
- ❌ Never mix ActivityChat and UnifiedTimeline data in the same component
- ❌ Never show timeline without RBAC filter
- ❌ Never skip personCode in logActivity() calls — breaks person timeline
- ❌ Never put reminders/notifications/logs in ActivityChat — chat bubbles only
- ❌ Never use .collect() on activityLogs — always paginate (can be huge)

## Tables Owned
| Table | Purpose |
|---|---|
| `activityLogs` | Permanent audit trail — `personCode` indexed, `actorType`, `action`, `source` |
| `notes` | Rich text notes — `authorType: "user"\|"ai"`, `isInternal`, `isPinned` |
| `activityChat` | Chat messages (Phase 4) — `authorType: "user"\|"ai_on_behalf"`, `onBehalfOf` |

Key indexes on activityLogs:
- `by_org_and_personCode` — person timeline (PRIMARY)
- `by_org_and_createdAt` — org-wide timeline
- `by_org_and_actorType` — filter by AI/user/system actions

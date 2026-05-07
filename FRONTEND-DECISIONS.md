# FRONTEND-DECISIONS.md
# Orbitly — All Frontend Architecture Decisions (Locked)

> **Purpose**: Single source of truth for every frontend decision made.
> AI agents MUST read this before building any frontend module.
> Updated: 2026-05-08
>
> **Cross-reference**: `PHASE2-PROGRESS.md` (build plan), `CONVEX-ARCHITECTURE.md` (backend patterns),
> `.kiro/code-architecture-v.md` (full architecture bible), `convex/_shared/permissions.ts` (RBAC)

---

## RULE 0 — NEVER HARDCODE ENTITY LABELS OR SLUGS

This is the most important rule. It is violated most often.

```
❌ BANNED: "Leads", "Contacts", "Deals", "Companies" as hardcoded strings in UI
❌ BANNED: "/leads", "/contacts", "/deals" as hardcoded route segments in nav config
✅ REQUIRED: All entity labels come from orgSettings.entityLabels (DB-backed)
✅ REQUIRED: All nav hrefs use the entitySlot system — labels and slugs from DB
```

**Why**: Different industries rename entities. A Dubai RE firm calls leads "Inquiries". A freelancer
calls deals "Projects". A law firm calls contacts "Clients". The UI must reflect whatever the org
has configured — not what we hardcoded.

**How it works**:
```typescript
// convex/orgs/queries.ts — getEntityLabels
// Returns: { lead: { singular: "Inquiry", plural: "Inquiries", slug: "inquiries" }, ... }

// In NavMain.tsx:
const labels = useQuery(api.orgs.getEntityLabels);
const leadLabel = labels?.lead?.plural ?? "Leads";
const leadSlug = labels?.lead?.slug ?? "leads";
// href = `/dashboard/${orgSlug}/${leadSlug}`
```

**Route slugs are also DB-backed**:
- Default: `/leads`, `/contacts`, `/deals`, `/companies`
- Org can rename: `/inquiries`, `/clients`, `/opportunities`, `/accounts`
- The route `[entity]` dynamic segment handles this
- `orgSettings.entityLabels[slot].slug` is the URL segment

---

## RULE 1 — PERSON PAGE: ONE PAGE FOR LEAD + CONTACT

### Decision: A person is ONE identity. One page. One URL. personCode is the slug.

```
❌ WRONG: /leads/[leadId] and /contacts/[contactId] as separate pages
✅ CORRECT: /profile/[personCode] — one page for the same human regardless of stage
```

**Route**: `/{locale}/{orgSlug}/profile/P-001`

**How the backend resolves personCode**:
```typescript
// convex/crm/people/queries.ts::getByPersonCode
// 1. Check contacts first (converted = more current state)
// 2. Fall back to leads (unconverted)
// 3. Return { entity, type: "lead"|"contact" }
```

**No separate /leads and /contacts detail pages.** The `[entitySlug]` dynamic route handles
list views. The `/profile/[personCode]` route handles detail views for all people.

---

## RULE 2 — PROFILE PAGE: WHAT IT SHOWS

The profile page (`/profile/[personCode]`) is the central hub for everything about a person.

### Tabs (left content area)

| Tab | Content | Who sees it |
|---|---|---|
| **Overview** | personCode badge, contact info, assignee, company, tags, custom fields, quick actions | All with contacts.view |
| **Messages** | Human messages + AI on-behalf. Chat bubble UI. Real-time. | All with contacts.view |
| **Timeline** | Everything logged: created, updated, stage changes, AI actions, WhatsApp, reminders. Feed UI. AI scans this. | Role-filtered |
| **Notes** | Agent-written notes. Editable. AI briefing shown at top. | All with notes.view |
| **Deals** | All deals linked via personCode | roles with deals.view |
| **Reminders** | All follow-ups for this person | roles with reminders.view |
| **Files** | Phase 3 | roles with files.view |

### Why Overview tab instead of right sidebar

The app has a left sidebar + right AI chat panel. There is no space for a third panel.
Everything that would go in a "right sidebar" goes into the Overview tab instead.
The same Overview content is reused as a **PersonCard** (compact popover) on deal cards.

### Overview tab content (complete list)

```
personCode badge (P-001) — clickable, copies to clipboard
name + avatar + status/stage badge
email, phone, WhatsApp number
assignedTo user picker
company link (if contact)
tags (tag picker)
custom fields (DynamicFieldRenderer — stage-aware)
quick actions: Convert to Contact (if lead), Add Deal, Add Reminder, Add Note
stale indicator (days since last contact, color from stage config)
```

### PersonCard (quick-view popover)

Used on deal cards and anywhere a personCode appears. Shows a compact version of the
Overview tab content. Has two buttons: "View Profile" (→ full profile page) and "Close".
Built from the same data as the Overview tab — no separate query needed.

```typescript
// On a deal card:
<PersonCodeBadge personCode={deal.personCode} />  // → links to full profile
<Button onClick={() => setPersonCardOpen(true)}>Quick View</Button>
<PersonCard personCode={deal.personCode} />  // popover with overview content
```

### Notes vs Messages vs Timeline (LOCKED)

```
Notes:    Agent-written text. Editable. Searchable. Shown in Notes tab.
          AI briefing shown at top of Notes tab.
          Stored in notes table. isActivityChat: false.

Messages: Chat bubbles (human + AI on-behalf).
          Stored in notes table with isActivityChat: true.
          Shown in Messages tab only.

Timeline: System log. activityLogs + reminders + stage changes + AI tool calls.
          AI scans this for context. Not shown as chat.
          Shown in Timeline tab only.
```

### Timeline UI spec (LOCKED)

```
- Vertical feed, newest first
- Left: colored icon circle → vertical connector line → next entry
- Center: event description + actor name + metadata
- Right: relative timestamp ("2h ago", "Yesterday")
- Color coding:
    created      → blue    (#3b82f6)
    stage_change → purple  (#8b5cf6)
    note         → yellow  (#eab308)
    reminder     → orange  (#f97316)
    ai_action    → indigo  (#6366f1)
    whatsapp     → green   (#22c55e)
    system       → gray    (#6b7280)
```

### Role-based filtering on Timeline

```
Internal notes (isInternal: true):
  → Visible to: owner, admin, roles with notes.viewInternal
  → Hidden from: member, viewer, portal clients

AI-generated entries (actorType: "ai"):
  → Visible to all roles

WhatsApp messages (Phase 3):
  → Visible to: assigned agent + admin + owner
```

---

## RULE 3 — PLATFORM UNIFIED TIMELINE

There are TWO unified timeline scopes:

| Scope | Location | What it shows | Who sees it |
|---|---|---|---|
| **Per-person timeline** | `/people/[personCode]` → Unified Timeline tab | Everything about this specific person | Roles with contacts.view (filtered by isInternal) |
| **Platform/org timeline** | `/settings/activity-log` | Everything in the entire org | admin + owner only (activityLogs.viewOrg) |

The platform timeline is the org-wide audit log. It shows every action by every user on every entity.
The per-person timeline is scoped to one person's personCode.

**Implementation**: Same `UnifiedTimeline` component, different query args:
```typescript
// Per-person:
useQuery(api.timeline.getForPerson, { orgId, personCode })

// Org-wide:
useQuery(api.timeline.getForOrg, { orgId })  // admin only
```

---

## RULE 4 — STALENESS: CONFIGURABLE COLORS AND THRESHOLDS

### Decision: Staleness thresholds AND colors are configurable per pipeline stage, not hardcoded.

```
❌ BANNED: if (daysInStage > 7) → red border  (hardcoded threshold)
❌ BANNED: red/yellow/green hardcoded colors
✅ REQUIRED: stage.staleAfterDays from pipeline DB
✅ REQUIRED: stage.staleColor from pipeline DB (or org-level defaults)
```

**Schema addition to pipeline stages**:
```typescript
// pipeline.stages[] — each stage object:
{
  id: string,
  name: string,
  order: number,
  staleAfterDays: number,      // e.g., 7 — configurable in Settings → Pipelines
  staleColor: string,          // e.g., "#ef4444" — configurable
  warningAfterDays: number,    // e.g., 5 — show warning before stale
  warningColor: string,        // e.g., "#f59e0b"
  isFinal: boolean,
  finalType: "positive" | "negative" | "neutral",
}
```

**UI rendering**:
```typescript
// On a kanban card:
const daysInStage = (Date.now() - deal.stageEnteredAt) / 86_400_000;
const isStale = daysInStage > stage.staleAfterDays;
const isWarning = daysInStage > stage.warningAfterDays && !isStale;

// Border color:
const borderColor = isStale ? stage.staleColor : isWarning ? stage.warningColor : "transparent";
```

**Settings → Pipelines**: Each stage has a "Stale after X days" input and a color picker.
These are stored in the pipeline document in Convex. No hardcoded values anywhere.

**Leads also have staleness** (even without pipeline stages):
- `orgSettings.leadStaleAfterDays` — default 7 days
- `orgSettings.leadStaleColor` — default red
- Configurable in Settings → General

---

## RULE 5 — AI CAN DO EVERYTHING THE USER CAN DO

### Decision: AI is not confined to a subset of features. AI can do everything the user has permission to do.

```
AI capabilities = user's permissions (filtered at tool registry level)
```

**What this means**:
- If user has `pipelines.manage` → AI can add/remove/reorder stages
- If user has `leads.create` → AI can create leads
- If user has `org.editSettings` → AI can rename entities, change settings
- If user has `deals.close` → AI can mark deals as won/lost
- If user has `members.invite` → AI can invite team members

**The tool registry enforces this**:
```typescript
// convex/ai/toolRegistry.ts
// EVERY Convex mutation has a corresponding AI tool
// The tool calls the SAME internal mutation
// RBAC is checked inside the mutation — not in the tool
// Tool registry filters which tools are shown to Claude based on user's permissions
```

**AI workspace setup** (from code-architecture-v.md Module 33):
- AI can set up pipelines, custom fields, roles, entity labels
- AI can rename entities ("Call leads 'Inquiries' for our industry")
- AI can create saved views, configure staleness thresholds
- All via the same mutations the Settings UI uses

**Confirmation for destructive actions**:
```
AI always shows a preview + confirmation before:
- Deleting records
- Bulk updates (> 5 records)
- Closing deals as won/lost
- Changing org settings
- Inviting/removing members
```

---

## RULE 6 — DB-BACKED NAVIGATION (NO HARDCODED ROUTES)

```
❌ BANNED: href="/leads" hardcoded in nav config
✅ REQUIRED: href derived from orgSettings.entityLabels[slot].slug
```

**Nav config pattern**:
```typescript
// core/shell/config/navigation.ts
// entitySlot: "lead" | "contact" | "deal" | "company"
// At render time: href = `/${orgSlug}/${labels[item.entitySlot].slug}`
// Default slug: "leads", "contacts", "deals", "companies"
// Org can change: "inquiries", "clients", "opportunities", "accounts"
```

**Route resolution — `[entitySlug]` dynamic segment**:
```typescript
// app/[locale]/(private)/[orgSlug]/[entitySlug]/page.tsx
// Catches ALL entity slugs — default and org-renamed
// Next.js resolves named segments first:
//   /profile → profile/page.tsx (wins)
//   /settings → settings/layout.tsx (wins)
//   /notifications → notifications/page.tsx (wins)
//   /leads → [entitySlug]/page.tsx (caught here)
//   /inquiries → [entitySlug]/page.tsx (caught here — org-renamed)
// The page does a DB lookup: slug → entityType → renders correct view
```

**No separate /leads and /contacts directories.** One dynamic route handles all entity list views.

---

## RULE 7 — FOUR-LAYER AI SECURITY (LOCKED)

From code-architecture-v.md Module 30:

```
Layer 1: System prompt boundaries
  → What AI can/cannot do, platform rules, org context
  → Managed by platform_admin (platformContext table)

Layer 2: Org-scoped data
  → All queries use orgId from ctx (NEVER from request body)
  → AI cannot access data from other orgs

Layer 3: Tool filtering at registry level
  → Claude only receives tools the user has permission to use
  → Checked BEFORE the AI call — zero tokens wasted on forbidden tools

Layer 4: Confirmation for destructive actions
  → Delete, bulk update, irreversible stage change
  → AI shows preview → user confirms → THEN mutation runs
```

---

## RULE 8 — ONE FUNCTION THREE CALLERS (LOCKED)

Every Convex mutation is written ONCE. Called identically by:

| Caller | Source field | actorType |
|---|---|---|
| UI (React) | `"manual"` | `"user"` |
| AI tool | `"ai"` | `"ai"` |
| WhatsApp pipeline | `"whatsapp"` | `"ai"` |
| CSV import | `"csv"` | `"system"` |
| MCP server (future) | `"mcp"` | `"system"` |

The mutation doesn't care who called it. RBAC, dedup, logging, notifications — all happen inside.

---

## RULE 9 — CLIENT PORTAL READINESS (BUILD NOW, EXPOSE LATER)

### Decision: Build the person detail page to support client portal from day one.

The client portal (Phase 9) shows a person their own data. The same PersonDetailPage component
is used — but with a different RBAC context (portal_client role).

**What this means for the build**:
- Every component on PersonDetailPage checks permissions before rendering
- `isInternal: true` notes are hidden from portal_client role
- Deal values hidden from portal_client unless `deals.viewValues` granted
- The same React component works for both internal agents and portal clients
- No separate portal UI code needed — just different permissions

**RBAC gates on PersonDetailPage**:
```typescript
// Each section checks permission before rendering:
{hasPermission("notes.viewInternal") && <InternalNotes />}
{hasPermission("deals.viewValues") && <DealValue />}
{hasPermission("reminders.view") && <RemindersTab />}
{hasPermission("files.view") && <FilesTab />}
```

---

## RULE 10 — ENTITY CARD COLORS AND VISUAL INDICATORS

### Decision: All visual indicators (colors, badges, borders) are configurable, not hardcoded.

| Indicator | Source | Configurable in |
|---|---|---|
| Stale border color | `stage.staleColor` | Settings → Pipelines |
| Warning border color | `stage.warningColor` | Settings → Pipelines |
| Tag colors | `tag.color` | Settings → Tags |
| Stage colors | `stage.color` | Settings → Pipelines |
| Status badge colors | `orgSettings.statusColors` | Settings → General |
| Lead source badge | `orgSettings.sourceColors` | Settings → General |

**No hardcoded color values in components**. All colors come from DB.

---

## RULE 11 — VERTICAL SLICE BUILD ORDER (LOCKED)

Build one module completely (backend hook → view → route) before starting the next.

```
Slice 0: Shared primitives (DataTable, KanbanBoard, scaffolds, shared components)
Slice 1: Leads list + Contacts list (separate list views, shared PersonDetailPage)
Slice 2: PersonDetailPage (the unified person hub — replaces LeadDetailView + ContactDetailView)
Slice 3: Companies list + detail
Slice 4: Deals kanban + detail
Slice 5: Unified Timeline component (used in PersonDetailPage)
Slice 6: Settings pages
Slice 7: Dashboard home (real metrics)
```

---

## RULE 12 — ROUTE STRUCTURE (FINAL)

**URL pattern: `/{locale}/{orgSlug}/...`** — orgSlug comes directly after locale, no "dashboard" segment.

```
app/[locale]/
  (auth)/                     ← signin, signup, forgot-password, verify-email, join
  (private)/
    layout.tsx                ← auth guard (client-side useConvexAuth)
    onboarding/
      page.tsx                ← 3-step wizard
    [orgSlug]/
      layout.tsx              ← org resolver + DashboardLayout + OnboardingGuard
      page.tsx                ← Dashboard home  →  /{locale}/{orgSlug}
      people/
        page.tsx              ← Combined people list (leads + contacts, filterable)
        [personCode]/
          page.tsx            ← PersonDetailPage  →  /{locale}/{orgSlug}/people/P-001
      leads/
        page.tsx              ← Leads list view
        [id]/page.tsx         ← Redirect to /people/[personCode]
      contacts/
        page.tsx              ← Contacts list view
        [id]/page.tsx         ← Redirect to /people/[personCode]
      companies/
        page.tsx              ← Companies list
        [id]/page.tsx         ← Company detail
      deals/
        page.tsx              ← Deals kanban (primary) + list toggle
        [id]/page.tsx         ← Deal detail
      notifications/
        page.tsx              ← All notifications (infinite scroll)
      settings/
        general/page.tsx
        members/page.tsx
        roles/page.tsx
        billing/page.tsx
        pipelines/page.tsx
        appearance/page.tsx
        record-codes/page.tsx ← Phase 2
        ai/page.tsx           ← Phase 3
        activity-log/page.tsx ← org-wide timeline (admin only)
  (public)/                   ← landing page, pricing (deferred)
  portal/[orgSlug]/           ← Phase 9 — client portal
```

**Why no "dashboard" segment**: The decision is `/{locale}/{orgSlug}/...` — orgSlug directly after locale. This is cleaner, shorter URLs, and matches the architecture bible. The `(private)` is a route group (no URL segment). The `(auth)` group is also a route group (no URL segment).

---

## RULE 13 — WHAT GOES ON THE PERSON DETAIL PAGE (COMPLETE LIST)

Everything about a person in one place:

| Section | Tab/Location | Phase |
|---|---|---|
| Person header (name, personCode, status, avatar) | Always visible (sticky header) | 2 |
| Contact info (email, phone, WhatsApp) | Right sidebar | 2 |
| Assignment (assignedTo) | Right sidebar | 2 |
| Company link | Right sidebar | 2 |
| Tags | Right sidebar | 2 |
| Custom fields (dynamic, stage-aware) | Right sidebar or Overview tab | 2 |
| Activity Chat (human + AI messages) | Tab: Activity Chat | 2 |
| Unified Timeline (everything logged) | Tab: Timeline | 2 |
| Deals (all deals for this person) | Tab: Deals | 2 |
| Reminders / Follow-ups | Tab: Reminders | 2 |
| Notes (inline in Timeline) | Part of Timeline tab | 2 |
| Files / Documents | Tab: Files | 3 |
| AI context viewer (admin only) | Tab: AI Context | 3 |
| WhatsApp thread | Tab: WhatsApp | 3 |
| Email thread | Tab: Email | 5 |

---

## RULE 14 — NOTES ARE IN THE TIMELINE, NOT A SEPARATE TAB

```
❌ WRONG: Separate "Notes" tab on person detail page
✅ CORRECT: Notes appear inline in the Unified Timeline tab
```

Notes are rendered as text bubbles within the timeline feed. The NoteComposer is at the bottom
of the timeline. This is the decision from deep-plan.md Module 21.

---

## RULE 15 — DEALS LIST AND KANBAN

Deals have their own route (`/deals`) separate from the person page.

- Primary view: Kanban (grouped by pipeline stage)
- Secondary view: List (toggle via `?view=list`)
- Deal cards show: title, value (permission-gated), personCode, stage, assignee, stale indicator
- Drag-drop between stages calls `deals.moveToStage()` — NOT generic update
- Won deal → confetti animation (canvas-confetti, client-side only)

---

## RULE 16 — FOLLOW-UPS / REMINDERS

- Reminders are shown on the person detail page (Reminders tab)
- Also shown on the dashboard (due today)
- AI suggests follow-ups but NEVER auto-creates without user confirmation
- `followUpCode` (FU-001) shown on reminder cards
- Configurable defaults in Settings → Reminders (not hardcoded)

---

## RULE 17 — SETTINGS PAGES ARE ROLE-GATED, NEVER PLAN-GATED

```
✅ Settings pages: wrapped in <PermissionGate permission="org.editSettings">
❌ Settings pages: NEVER wrapped in plan/tier gates
```

Settings are always accessible to the right role regardless of plan.
Plan gates apply to features (CSV import, AI, bulk actions) — not settings pages.

---

## RULE 18 — DYNAMIC FIELD DEFINITIONS

Custom fields are defined in `fieldDefinitions` table. They are:
- Stage-aware: `showInStages` array — field only shows when deal is in those stages
- Grouped: `groupName` — fields grouped into sections on the form
- Typed: text, number, date, select, multi-select, currency, url, email, phone
- Required: `required: boolean` — validated on both frontend and backend
- Sensitive: `sensitive: boolean` — hidden from AI system prompt

The `DynamicFieldRenderer` component renders whatever fields the backend returns.
No hardcoded field names in components.

---

## RULE 19 — PERSONCODE IS THE STABLE IDENTIFIER EVERYWHERE

```
personCode (P-001) is used:
  - As the URL slug for person detail pages: /people/P-001
  - On every entity card (badge)
  - In AI conversations: "Update P-001, budget changed to 150K"
  - In WhatsApp: agent says "P-001" → AI resolves instantly
  - In activity logs: metadata.personCode
  - In deals: deal.personCode links back to the person
  - In reminders: reminder.personCode links to the person
```

personCode is IMMUTABLE after creation. Never changes. Never regenerated.

---

## RULE 20 — WHAT THE AI CAN DO (COMPLETE LIST)

The AI can do everything the user has permission to do. This includes:

**CRM operations**: create/update/delete leads, contacts, companies, deals, notes, reminders, tags
**Pipeline management**: add/remove/reorder stages, change stale thresholds
**Field management**: create/update/delete custom fields
**Workspace setup**: rename entities, configure settings, set up pipelines from templates
**Analytics**: dashboard stats, pipeline health, forecast, morning briefing
**Bulk operations**: bulk update (with mandatory confirmation)
**Search**: by personCode, by name, by field value, semantic search
**Role management**: create/update roles, assign permissions (admin only)
**Member management**: invite members, change roles (admin only)

**AI CANNOT do** (regardless of permissions):
- Access data from other orgs
- Bypass the confirmation step for destructive actions
- Send emails/WhatsApp without user approval (draft only)
- Access internal notes if user doesn't have notes.viewInternal

---

## Summary: The 5 Things AI Agents Must Never Forget

1. **No hardcoded entity labels** — always from `orgSettings.entityLabels`
2. **No hardcoded route slugs** — always from `orgSettings.entityLabels[slot].slug`
3. **Person detail page uses personCode as slug** — `/people/[personCode]`
4. **Notes are in the timeline** — not a separate tab
5. **AI can do everything the user can** — filtered at tool registry, not hardcoded subset

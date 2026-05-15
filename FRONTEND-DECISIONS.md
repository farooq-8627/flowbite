# FlowBite — Frontend Architecture Decisions (Locked)

> **Purpose**: Single source of truth for every frontend architecture decision.
> AI agents MUST read this before building any frontend module.
> **Updated**: 2026-05-16
>
> **Cross-reference**: `CORE-FEATURES-ARCHITECTURE.md` (current build), `Phase-2-progress.md`,
> `convex/_shared/permissions/catalog.ts` (RBAC catalog), `convex/schema/*.ts` (schema).
>
> **Conventions**:
> - "App name" placeholders use `{App}` so this doc stays brand-agnostic. Real text comes from `APP_CONFIG`.
> - All examples use `{orgSlug}`, `{personCode}` etc. for path parameters.

---

## RULE 0 — NEVER HARDCODE ENTITY LABELS OR SLUGS

This is the most-violated rule. Read first.

```
❌ BANNED: "Leads", "Contacts", "Deals", "Companies" as hardcoded strings in UI
❌ BANNED: "/leads", "/contacts", "/deals" as hardcoded route segments in nav config
✅ REQUIRED: All entity labels come from orgSettings.entityLabels (DB-backed)
✅ REQUIRED: All nav hrefs use the entitySlot system — labels and slugs from DB
```

**Why**: Different industries rename entities. A Dubai RE firm calls leads "Inquiries". A
freelancer calls deals "Projects". A law firm calls contacts "Clients". The UI must reflect what
the org has configured — not what we hardcoded.

**How it works**:
```typescript
// convex/orgs/queries.ts — getEntityLabels
// Returns: { lead: { singular: "Inquiry", plural: "Inquiries", slug: "inquiries" }, ... }

// In NavMain.tsx:
const labels = useQuery(api.orgs.getEntityLabels);
const leadLabel = labels?.lead?.plural ?? "Leads";
const leadSlug = labels?.lead?.slug ?? "leads";
// href = `/${orgSlug}/${leadSlug}`
```

**Workspace-scoped routes are NOT renamable.** Routes under the new Workspace nav group
(`messages`, `calendar`, `reminders`, `notes`, `timeline`, `profile`) are static slugs reserved
in `convex/_shared/reservedSlugs.ts`. Only CRM entity slots (lead/contact/deal/company) are renamable.

---

## RULE 1 — A PERSON IS ONE IDENTITY: ONE PROFILE PAGE

A person is ONE identity. ONE page. ONE URL. `personCode` is the slug.

```
❌ WRONG:  /leads/[leadId] and /contacts/[contactId] as separate detail pages
✅ CORRECT: /profile/[personCode] — one page for the same human regardless of stage
```

**Route**: `/{locale}/{orgSlug}/profile/{personCode}` (e.g. `.../profile/P-001`)

**Backend resolution**:
```typescript
// convex/crm/people/queries.ts::getByPersonCode
// 1. Check contacts first (converted = more current state)
// 2. Fall back to leads (unconverted)
// 3. Return { entity, type: "lead"|"contact" }
```

**No separate `/leads/{id}` and `/contacts/{id}` detail pages.** The `[entitySlug]` dynamic route
handles list views only. The `/profile/[personCode]` route handles detail for everyone.

---

## RULE 2 — MESSAGES, NOTES, NOTIFICATIONS, ACTIVITY LOGS, REMINDERS ARE INDEPENDENT TABLES

This rule supersedes the previous Rule 2 (which stored messages on the notes table via an
`isActivityChat` boolean). Six concepts → six dedicated tables (or read-merged views). Cross-ref:
`CORE-FEATURES-ARCHITECTURE.md` §0.

| # | Concept | Table | Backend status | Frontend status |
|---|---|---|---|---|
| 1 | Notes | `notes` | ✅ exists; `isActivityChat` field **removed** in this revision | UI pending |
| 2 | Messages | `messages` (NEW) | 🆕 added in this revision | UI pending |
| 3 | Notifications | `notifications` | ✅ exists | UI pending |
| 4 | Activity Logs | `activityLogs` | ✅ exists | (no direct UI — feeds Timeline) |
| 5 | Reminders | `reminders` | ✅ exists | UI pending |
| 6 | Timeline | NO TABLE — read view that merges activityLogs + notes + reminders | ✅ `timeline.getForPerson` / `getForOrg` | UI pending (custom design) |
| 7 | Calendar | NO TABLE — read view that merges reminders + activityLogs + deal close dates | 🆕 `calendar.getEvents` | UI pending |

**Why dedicated tables (not flag-based polymorphism)**: independent indexes, RBAC, schema, AI tool
clarity. See `CORE-FEATURES-ARCHITECTURE.md` §0 for the full rationale.

**Permissions added with this rule**:
- `messages.view`, `messages.send`, `messages.delete`, `messages.deleteAny`

**Removed in this revision**: `notes.isActivityChat` field (no rows had it set — Phase 2 frontend
hadn't been built).

---

## RULE 3 — TIMELINE HAS TWO SCOPES: PERSON + ORG-WIDE

Same component, two different query args:

| Scope | Where | Query | Permission |
|---|---|---|---|
| **Per-person** | Profile page → Timeline tab | `timeline.getForPerson(orgId, personCode)` | `notes.view` (with `notes.viewInternal` filter applied) |
| **Org-wide** | `/{orgSlug}/timeline` AND `/{orgSlug}/settings/activity-log` | `timeline.getForOrg(orgId, filter?)` | `activityLogs.viewOrg` (admin/owner) |

**Backend already merges three sources**: `activityLogs` + `notes` (non-chat) + `reminders` and
tags each entry with `_entryType` and `_color`. Frontend just renders.

**Custom UI**: Timeline visual is designed in-house — we do NOT copy any timeline component from a
template. Backend gives the data, you design the look.

---

## RULE 4 — STALENESS IS CONFIGURABLE PER-STAGE (NEVER HARDCODED)

Staleness thresholds AND colors are configurable per pipeline stage.

```
❌ BANNED: if (daysInStage > 7) → red border  (hardcoded threshold)
❌ BANNED: red/yellow/green hardcoded colors
✅ REQUIRED: stage.staleAfterDays from pipeline DB
✅ REQUIRED: stage.staleColor from pipeline DB (or org-level defaults)
```

**Schema** (per pipeline stage):
```typescript
{
  id: string,
  name: string,
  order: number,
  staleAfterDays: number,
  staleColor: string,
  warningAfterDays: number,
  warningColor: string,
  isFinal: boolean,
  finalType: "positive" | "negative" | "neutral",
}
```

**Leads also have staleness** (no pipeline stage):
- `orgSettings.leadStaleAfterDays` (default 7)
- `orgSettings.leadStaleColor` (default red)

---

## RULE 5 — AI CAN DO EVERYTHING THE USER CAN

AI is not confined to a subset. AI capabilities = user permissions, filtered at the tool registry.

```
AI capabilities = user's permissions (filtered at tool registry level)
```

**The tool registry enforces this**:
- Every Convex mutation has a corresponding AI tool.
- The tool calls the SAME internal mutation — RBAC checked inside.
- Tool registry filters which tools are exposed to Claude based on user permissions.

**AI is cross-app, not entity-bound**. The AI assistant works across the entire workspace and
also receives **route-specific context**:

- AI knows the current route (`/{orgSlug}/messages/{conversationId}`, `/{orgSlug}/profile/P-001`,
  `/{orgSlug}/{deal-slug}`, `/{orgSlug}/calendar`, `/{orgSlug}/settings/pipelines`).
- AI receives the contextual entity (current personCode, dealCode, conversationId, calendarRange)
  in the system prompt.
- AI tool list is unfiltered by route — every cross-app tool is available everywhere — but the
  prompt nudges toward route-relevant actions.
- This is implemented by `core/inbox/ai/system-prompt-builder.ts` (Phase 3 module). Phase 2
  exposes `useRouteContext()` hook in `core/inbox/ai/hooks/` for the prompt builder to consume.

**Confirmation for destructive actions**:
- Deletes
- Bulk updates (>5 records)
- Closing deals as won/lost
- Org settings changes
- Inviting/removing members

---

## RULE 6 — DB-BACKED NAVIGATION (NO HARDCODED ENTITY ROUTES)

```
❌ BANNED: href="/leads" hardcoded in nav config
✅ REQUIRED: href derived from orgSettings.entityLabels[slot].slug
```

**Nav config pattern** (`core/shell/config/navigation.ts::buildNavigation`):
```typescript
// At render time:
href = `/${orgSlug}/${labels[item.entitySlot].slug}`
// Default slug: "leads" / "contacts" / "deals" / "companies"
// Org can rename: "inquiries" / "clients" / "opportunities" / "accounts"
```

**Route resolution** — `[entitySlug]` dynamic segment catches all entity slugs (default + renamed).
Next.js resolves named segments first, so `/profile`, `/settings`, `/messages`, `/calendar`,
`/reminders`, `/notes`, `/timeline`, `/notifications` are reserved (see Rule 12).

---

## RULE 7 — FOUR-LAYER AI SECURITY (LOCKED)

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

## RULE 8 — ONE FUNCTION, MANY CALLERS

Every Convex mutation is written ONCE. Same function called by:

| Caller | `source` field | `actorType` |
|---|---|---|
| UI (React) | `"manual"` | `"user"` |
| AI tool | `"ai"` | `"ai"` |
| WhatsApp pipeline | `"whatsapp"` | `"ai"` |
| CSV import | `"csv"` | `"system"` |
| MCP server (future) | `"mcp"` | `"system"` |

The mutation doesn't care who called it. RBAC, dedup, logging, notifications — all happen inside.

---

## RULE 9 — CLIENT PORTAL READINESS (BUILD NOW, EXPOSE LATER)

Build the person detail page to support the client portal from day one.

**Implications**:
- Every component on PersonDetailPage checks permissions before rendering.
- `isInternal: true` notes hidden from `portal_client` role.
- Deal values hidden unless `deals.viewValues` granted.
- Same React component works for internal agents and portal clients.
- No separate portal UI code — just different permissions.

**Pattern**:
```typescript
{hasPermission("notes.viewInternal") && <InternalNotes />}
{hasPermission("deals.viewValues") && <DealValue />}
{hasPermission("reminders.view") && <RemindersTab />}
```

---

## RULE 10 — VISUAL INDICATORS ARE CONFIGURABLE (NEVER HARDCODED)

| Indicator | Source | Configurable in |
|---|---|---|
| Stale border color | `stage.staleColor` | Settings → Pipelines |
| Warning border color | `stage.warningColor` | Settings → Pipelines |
| Tag colors | `tag.color` | Settings → Tags |
| Stage colors | `stage.color` | Settings → Pipelines |
| Status badge colors | `orgSettings.statusColors` | Settings → General |
| Lead source badge | `orgSettings.sourceColors` | Settings → General |

No hardcoded color values in components. All colors come from the DB.

---

## RULE 11 — VERTICAL SLICE BUILD ORDER (LOCKED)

Build one module backend → hooks → view → route → done before starting the next.

```
Slice 0: Shared primitives (DataTable, KanbanBoard, scaffolds, shared components) ✅
Slice 1: Leads list + Contacts list (separate list views, shared profile detail page)
Slice 2: ProfileDetailPage (the unified person hub)
Slice 3: Companies list + detail
Slice 4: Deals kanban + detail
Slice 5: Workspace features — Messages, Notes, Calendar, Reminders, Timeline (this revision)
Slice 6: Settings pages
Slice 7: Dashboard home (real metrics)
```

---

## RULE 12 — ROUTE STRUCTURE (FINAL)

URL pattern: `/{locale}/{orgSlug}/...` — `orgSlug` directly after locale, no `dashboard` segment.

```
app/[locale]/
  (auth)/                     ← signin, signup, forgot-password, verify-email, join
  (private)/
    layout.tsx                ← auth guard (client-side useConvexAuth)
    onboarding/page.tsx       ← 3-step wizard
    [orgSlug]/
      layout.tsx              ← org resolver + DashboardLayout + OnboardingGuard
      page.tsx                ← Dashboard home  →  /{orgSlug}

      // ── Workspace group (static slugs, reserved) ─────────────────────────
      profile/                ← /{orgSlug}/profile (all-people list)
        page.tsx
        [personCode]/page.tsx ← /{orgSlug}/profile/P-001 (the person detail page)
      messages/page.tsx       ← /{orgSlug}/messages (org-wide chat inbox)
      calendar/page.tsx       ← /{orgSlug}/calendar
      reminders/page.tsx      ← /{orgSlug}/reminders
      notes/page.tsx          ← /{orgSlug}/notes
      timeline/page.tsx       ← /{orgSlug}/timeline (org-wide audit feed)
      notifications/page.tsx  ← /{orgSlug}/notifications

      // ── CRM entity routes (dynamic, slug renamable per industry) ────────
      [entitySlug]/page.tsx       ← /{orgSlug}/{leads|contacts|companies|deals}
      [entitySlug]/[id]/page.tsx  ← redirect to /profile/[personCode] for people; deal/company detail otherwise

      // ── Settings (sub-routes) ─────────────────────────────────────────────
      settings/
        general/page.tsx
        members/page.tsx
        roles/page.tsx
        billing/page.tsx
        pipelines/page.tsx
        appearance/page.tsx
        record-codes/page.tsx     ← Phase 2
        ai/page.tsx               ← Phase 3
        activity-log/page.tsx     ← admin-only org-wide timeline (alias of /{orgSlug}/timeline)

  (public)/                  ← landing page (deferred)
  portal/[orgSlug]/          ← Phase 9 — client portal
```

**Why no `dashboard` segment**: shorter URLs, matches the architecture bible. Route groups
(`(private)`, `(auth)`) are URL-invisible.

**Reserved slugs** (cannot be used as entity slugs): `messages`, `calendar`, `reminders`, `notes`,
`timeline`, `profile` (in addition to the existing reserved set in
`convex/_shared/reservedSlugs.ts`).

**Profile slug is locked**: `/profile/[personCode]` (NOT `/people/[personCode]`).

---

## RULE 13 — WHAT GOES ON THE PROFILE DETAIL PAGE

Tabs in order. Each tab embeds the matching feature panel from `core/comms/*` /
`core/scheduling/*` (the same components also appear org-wide and on entity detail tabs).

| Tab | Source panel | Phase |
|---|---|---|
| Overview | `core/platform/profile/components/overview/*` (5 sub-cards: vitals, contact, company, tags, custom fields) | 2 |
| Messages | `core/comms/messages/panels/MessagesPanel` | 2 |
| Timeline | `core/comms/timeline/panels/PersonTimelinePanel` | 2 |
| Notes | `core/comms/notes/panels/NotesPanel` (+ `AIBriefingCard` placeholder for Phase 3) | 2 |
| Deals | `core/entities/_entities/deals/panels/PersonDealsPanel` | 2 (Slice 4) |
| Reminders | `core/scheduling/reminders/panels/RemindersPanel` | 2 |
| Calendar | `core/scheduling/calendar/panels/PersonCalendarPanel` | 2 |
| Files | `core/data-io/files/panels/EntityFilesPanel` | 3 |
| AI Context (admin) | `core/inbox/ai/panels/AIContextPanel` | 3 |
| WhatsApp | `core/inbox/messaging/panels/WhatsAppPanel` | 3 |
| Email | future | 5+ |

**Sticky header** above tabs: name, avatar, personCode, status badge, quick actions
(Convert / Add Deal / Add Reminder / Add Note).

---

## RULE 14 — *(SUPERSEDED)* — NOTES IS A SEPARATE TAB, NOT INSIDE TIMELINE

Earlier Rule 14 said "Notes are in the timeline, not a separate tab." This is reversed.

**Now**: Notes is a **separate tab** on the profile page (per Rule 13). Timeline is its own tab,
fed by the `timeline.getForPerson` query that already merges `activityLogs + notes + reminders` —
so notes still appear in the timeline as **read-only entries** there. The Notes tab is the
**editable** surface for notes.

The same `NotesPanel` is also embedded on Deal, Company, and Lead detail pages.

---

## RULE 15 — DEALS LIST AND KANBAN

Deals have their own route (`/{orgSlug}/{deal-slug}`) separate from the profile page.

- Primary view: Kanban (grouped by pipeline stage)
- Secondary view: List (toggle via `?view=list`)
- Deal cards show: title, value (permission-gated), personCode, stage, assignee, stale indicator
- Drag-drop between stages calls `deals.moveToStage()` — NOT generic `update()`
- Won deal → confetti animation (canvas-confetti, client-side only)

---

## RULE 16 — REMINDERS / FOLLOW-UPS

- Reminders shown on the profile page (Reminders tab) AND on the dashboard (Due Today widget)
  AND on the org-wide reminders page (`/{orgSlug}/reminders`).
- AI suggests follow-ups but NEVER auto-creates without confirmation.
- `followUpCode` (FU-001) shown on every reminder card.
- Configurable defaults in Settings → Reminders (not hardcoded).
- "Create event" from the calendar = create a **reminder** (calendar is a derived view, not its
  own table — see Rule 2).

---

## RULE 17 — SETTINGS PAGES ARE ROLE-GATED, NEVER PLAN-GATED

```
✅ Settings pages: wrapped in <PermissionGate permission="org.editSettings">
❌ Settings pages: NEVER wrapped in plan/tier gates
```

Settings are always accessible to the right role regardless of plan. Plan gates apply to features
(CSV import, AI, bulk actions) — not settings pages.

---

## RULE 18 — DYNAMIC FIELD DEFINITIONS

Custom fields are defined in `fieldDefinitions` table:
- Stage-aware: `showInStages[]` — field only shows when deal is in those stages.
- Grouped: `groupName` — fields grouped into sections on the form.
- Typed: text, number, date, select, multiselect, currency, url, email, phone, relation, file.
- Required: validated on both frontend and backend.
- Sensitive: hidden from AI system prompt.

`DynamicFieldRenderer` renders whatever fields the backend returns. No hardcoded field names.

---

## RULE 19 — `personCode` IS THE STABLE IDENTIFIER EVERYWHERE

```
personCode (P-001) is used:
  - URL slug for profile pages: /profile/P-001
  - On every entity card (badge)
  - In AI conversations: "Update P-001, budget changed to 150K"
  - In WhatsApp: agent says "P-001" → AI resolves instantly
  - In activity logs: metadata.personCode
  - In deals: deal.personCode links back to the person
  - In reminders: reminder.personCode links to the person
  - In messages: message.personCode for cross-entity threads
```

`personCode` is IMMUTABLE after creation. Never changes. Never regenerated.

---

## RULE 20 — WHAT THE AI CAN DO (COMPLETE LIST)

The AI works across the entire workspace and is route-aware (Rule 5). It can do everything the
user has permission to do:

**CRM operations**: create/update/delete leads, contacts, companies, deals, **messages**, notes,
reminders, tags.
**Pipeline management**: add/remove/reorder stages, change stale thresholds.
**Field management**: create/update/delete custom fields.
**Workspace setup**: rename entities, configure settings, set up pipelines from templates.
**Analytics**: dashboard stats, pipeline health, forecast, morning briefing.
**Bulk operations**: bulk update with mandatory confirmation.
**Search**: by personCode, name, field value, semantic search.
**Role management**: create/update roles, assign permissions (admin only).
**Member management**: invite members, change roles (admin only).

**AI CANNOT do** (regardless of permissions):
- Access data from other orgs.
- Bypass the confirmation step for destructive actions.
- Send emails/WhatsApp without user approval (draft only).
- Access internal notes if the user doesn't have `notes.viewInternal`.

---

## Summary: What AI Agents Must Never Forget

1. **No hardcoded entity labels or slugs** — always from `orgSettings.entityLabels`.
2. **Profile route is `/profile/[personCode]`** (locked).
3. **Messages and Notes are separate tables** — `messages` and `notes`, never shared.
4. **AI is cross-app and route-aware** — works everywhere, biases to current route context.
5. **Workspace slugs (`messages`, `calendar`, `reminders`, `notes`, `timeline`, `profile`) are
   reserved** — orgs cannot rename CRM entities to those names.
6. **Timeline is a read-merge view** over activityLogs + notes + reminders. No timeline table.
7. **Calendar is a read-merge view** over reminders + activityLogs + deal close dates. No
   calendar table.
8. **Custom UI for Timeline** — designed in-house, no template copy.

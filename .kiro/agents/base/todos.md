# Active Todos

> OVERWRITE this file — never append.
> Status: `pending` | `in_progress` | `done` | `blocked`
> Updated: 2026-04-26 | Session 3 (Architecture cleanup complete). Phase 0 ✅ done. Phase 1 Shell = NEXT.

---

## Session 2 + 3 — Architecture Setup ✅ COMPLETE (collapsed)

All ARCH items done: MODULE.md+STATE.md for all modules, scanning-protocol (now merged into AGENT.md), preferences library, font registry, Zustand store, 4 theme presets, folder cleanup, path updates. `pnpm typecheck`: 0 errors ✅


---

## Phase 0 — Foundation ✅ COMPLETE

| ID | Task | Status |
|---|---|---|
| P0-01 | Clean demo files | ✅ done |
| P0-02 | `convex/_shared/validators.ts` | ✅ done |
| P0-03 | `convex/_shared/constants.ts` | ✅ done |
| P0-04 | `convex/_shared/types.ts` | ✅ done |
| P0-05 | `convex/_shared/errors.ts` | ✅ done |
| P0-06 | Base schema tables (all v.any() fixed) | ✅ done |
| P0-07 | `convex/_functions/authenticated.ts` | ✅ done |
| P0-08 | `convex/_functions/admin.ts` | ✅ done |
| P0-09 | `convex/users/` module | ✅ done |
| P0-10 | `convex/orgs/` module (production-grade) | ✅ done |
| P0-11 | `convex/notifications/helpers.ts` | ✅ done |
| P0-12 | `convex/activityLogs/helpers.ts` | ✅ done |
| P0-13 | `lib/hooks/useAppRouter.ts` | ✅ done |
| P0-14 | 16 shadcn components via CLI | ✅ done |
| P0-15 | Providers (PostHog, Theme) | ✅ done |
| P0-16 | Root layout with all providers | ✅ done |
| P0-17 | `features/_registry.ts` | ✅ done |
| P0-19 | Auth pages (signup page) | ✅ done |
| P0-20 | PostHog + Sentry verified in browser | ✅ done |
| P0-21 | `pnpm typecheck` 0 errors | ✅ done |
| P0-RBAC-A | `useOrgPermission` hook | ✅ done |
| P0-RBAC-B | `<PermissionGate>` component | ✅ done |
| AUTH-01–04 | GitHub + Google OAuth + signin page + env vars | ✅ done |
| RBAC-01–14 | Full RBAC system (102 tests) | ✅ done |
| INV-01 | `convex/invitations/` module | ✅ done |
| INV-02 | 16 invitation tests | ✅ done |

---

## Phase 0 — Remaining (Small Items)

| ID | Task | Status | Notes |
|---|---|---|---|
| DX-01 | Fix `pnpm lint-check` Biome baseline | pending | `biome lint --check .` invalid for installed Biome v2 |
| P0-AUTH-REDIRECT | Authenticated user → org dashboard redirect | blocked | Needs shell built first |

---

## IMMEDIATE (Do Before Phase 2 Schema Work Begins)

> These are one-line schema additions. Add to `convex/schema.ts` when writing Phase 2 tables.

| ID | Task | Status | Notes |
|---|---|---|---|
| SCHEMA-P2-01 | Add `aiContext: v.optional(v.any())` to `leads`, `contacts`, `deals` tables | pending | Stores voice/OCR overflow. AI backfills to `fieldValues` when field is created later. |
| SCHEMA-P2-02 | Add `quickCode: v.optional(v.string())` to `leads`, `contacts` tables | pending | Org-unique short code (e.g. `AHM-001`) for WhatsApp contact resolution. Auto-generate on create. Add `by_org_and_quickcode` index. |
| SCHEMA-P2-03 | Add `showInStages: v.optional(v.array(v.string()))` to `fieldDefinitions` table | pending | Stage-aware field filtering (Approach B — backend). Empty/null = always shown. Convex query filters before sending to client. |
| SCHEMA-P2-04 | Add `entityDocuments` table to `convex/schema.ts` | pending | Document Vault. Fields: `orgId, entityType, entityId, fileName, fileType, storageId, extractedData, uploadedBy, createdAt`. Index: `by_entity`. |
| SCHEMA-P2-05 | Add `"whatsapp"` to `source` enum in `leads` table | pending | Track WhatsApp-originated leads. Already in schema plan. |
| WHATSAPP-APPLY-01 | Apply for WhatsApp Business API via 360dialog | pending | Gulf-first BSP. Takes 1–2 weeks for UAE number approval. START THIS NOW in parallel with Phase 1 build. |

---


| ID | Task | Status | Notes |
|---|---|---|---|
| SHELL-01 | `core/shell/config/navigation.ts` | pending | Single source of truth for nav + module metadata |
| SHELL-02 | `app/[locale]/dashboard/layout.tsx` | pending | Auth gate |
| SHELL-03 | `app/[locale]/dashboard/[orgSlug]/layout.tsx` | pending | Org resolver + membership check |
| SHELL-04 | `core/shell/layouts/DashboardLayout.tsx` | pending | Sidebar + topnav + content |
| SHELL-05 | `core/shell/components/AppSidebar.tsx` | pending | Config-driven nav |
| SHELL-06 | `core/shell/components/TopNav.tsx` + `UserMenu.tsx` | pending | App chrome |
| SHELL-07 | `core/shell/components/NotificationBell.tsx` | pending | Unread count entry point |
| SHELL-08 | `core/shell/components/WorkspaceSwitcher.tsx` | pending | Org switching |
| SHELL-09 | `core/shell/components/ModuleGuard.tsx` + `useModuleEnabled.ts` | pending | Module access gating |
| SHELL-10 | `core/shell/components/PageShell.tsx` — base page scaffold | pending | Props: title, nav (breadcrumb), actions (toolbar buttons), footer (tabs/filter bar), children. Equivalent to saas-ui-pro Page.Root/Header/Body pattern using shadcn + Tailwind |
| SCAFFOLD-01 | `core/shell/components/EntityListPage.tsx` — list+board scaffold | pending | Props: title, columns, data, onAddClick, view ('list'\|'board'), onViewChange, groupByField, BoardCard. Renders: DataTableToolbar + DataTable OR KanbanBoard. Used by leads, contacts, deals, projects |
| SCAFFOLD-02 | `core/shell/components/EntityDetailPage.tsx` — detail scaffold | pending | Props: title, tabs ([{label, content}]), sidebarContent. Renders: full-width tab panel + collapsible right sidebar. Sidebar collapses on mobile. Used by all entity detail pages |
| SCAFFOLD-03 | `core/shell/hooks/useViewToggle.ts` — view state | pending | Returns: `[view, setView]` typed as `'list' \| 'board'`. Syncs to URL query param `?view=`. Used by EntityListPage |
| SHELL-11 | `app/[locale]/dashboard/[orgSlug]/page.tsx` (Quick Win Dashboard) | pending | Metric cards: lead count, deal count+sum, tasks due today, stale deals, recent activity, AI morning briefing card. Single `orgQuery` — no `.collect()` |
| SHELL-12 | Wire authenticated-user → `/onboarding` if not completed, else org dashboard | pending | Unblocks P0-AUTH-REDIRECT |
| SHELL-13 | `app/[locale]/pricing/page.tsx` — public pricing page | pending | Free / Starter / Pro / Enterprise tiers, CTA to sign up |

### RBAC Refactor (Dynamic Roles — approved Session 20)

| ID | Task | Status | Notes |
|---|---|---|---|
| RBAC-REFACTOR-01 | Add `orgRoles` table to `convex/schema.ts` | pending | name, description, permissions[], isSystem, isDefault, color |
| RBAC-REFACTOR-02 | Change `orgMembers.role` (string) → `orgMembers.roleId` (ref to orgRoles) | pending | Breaking change — update all role checks |
| RBAC-REFACTOR-03 | Add `DEFAULT_SYSTEM_ROLES` + `PERMISSION_CATEGORIES` to constants.ts | pending | Owner (all), Admin (all except billing+roles), Member (standard) |
| RBAC-REFACTOR-04 | Seed 3 default orgRoles on org creation in `orgs/mutations.ts` | pending | Owner(isSystem=true), Admin, Member(isDefault=true) |
| RBAC-REFACTOR-05 | Refactor `requireRole()` → `requirePermission()` in `orgs/helpers.ts` | pending | DB lookup instead of hardcoded PERMISSIONS map |
| RBAC-REFACTOR-06 | Update `invitations/mutations.ts` — accept uses `roleId` | pending | Invite includes roleId, accepted member gets that role |
| RBAC-REFACTOR-07 | Update `useOrgPermission` hook — load role from DB | pending | Query orgRoles by member.roleId, check permissions array |
| RBAC-REFACTOR-08 | Update all 102 tests with new role system | pending | Replace role strings with roleId references |
| RBAC-REFACTOR-09 | Role management UI — Settings → Roles page | pending | GitHub-style grouped permission checkboxes. Quick templates: Full Access, Read Only, Standard Member, Custom |
| RBAC-REFACTOR-10 | Role selector in invite flow + member list | pending | Dropdown of orgRoles when inviting or changing role |

---

## Phase 1 — Onboarding (before dashboard access)

> **Design principle:** Get to dashboard in < 2 minutes. No field customization here.
> Complex setup happens post-onboarding via AI Workspace Setup (Phase 3).

| ID | Task | Status | Notes |
|---|---|---|---|
| ONBOARD-01 | Onboarding route + layout: `app/[locale]/onboarding/` | pending | 3-step wizard, gated by `!users.onboardingCompleted` |
| ONBOARD-02 | Step 1: Org name + your name | pending | Creates org record or updates if exists |
| ONBOARD-03 | Step 2: Industry picker → seeds DEFAULT pipeline ONLY (no field templates) + Step 3: Complete → set `users.onboardingCompleted = true` → redirect to dashboard | pending | Industry options: Agency, SaaS Sales, Recruitment, Consulting, Freelancer, Real Estate, E-commerce, Other |
| GET-STARTED-01 | "Get Started" checklist card on dashboard | pending | Dismissible card: set up workspace with AI, import contacts, create first deal, invite team, send first email |

---

## Phase 2 — Backend Pre-work (Audit Fixes — before any CRM code)

> Identified by Session 17 backend audit. Completed Session 18.
> All were additive — no breaking changes, 0 test regressions.

| ID | Task | Status | Notes |
|---|---|---|---|
| BACKFIX-01 | Add `actorType` field + `by_orgId_and_actorType_and_createdAt` index to `activityLogs` in `convex/schema.ts` | ✅ done | Added `actorType` (required, `"user"\|"ai"\|"integration"\|"system"`). Email fields were NOT added here — `activityLogs` is event log only, not content store. |
| BACKFIX-02 | Update `convex/activityLogs/helpers.ts` — add `actorType` to `ActivityLogInput` + insert | ✅ done | `actorType` defaults to `"user"`. All existing callers unaffected. Email fields removed in Session 19 (were never correct here). |
| BACKFIX-03 | Add CRM entity types to `ENTITY_TYPES` in `convex/_shared/constants.ts` | ✅ done | Added: LEAD, CONTACT, COMPANY, DEAL, NOTE, PIPELINE, FIELD_DEFINITION, AI_CONVERSATION, AI_MESSAGE. Old values kept (deprecated, not deleted). |
| BACKFIX-04 | Add 5 new validators to `convex/_shared/validators.ts` | ✅ done | Added: `entityTypeValues`, `actorTypeValues`, `fieldTypeValues`, `sourceValues`, `sentimentValues` each with validator + type export. |
| BACKFIX-05 | Add AI + CRM error codes to `convex/_shared/errors.ts` | ✅ done | Added: `AI_TOOL_UNAUTHORIZED`, `AI_DISAMBIGUATION_REQUIRED`, `AI_CONTEXT_REQUIRED`, `CRM_ENTITY_NOT_FOUND`, `PIPELINE_STAGE_INVALID`, `DEAL_ALREADY_CLOSED`, `LEAD_ALREADY_CONVERTED`. |
| BACKFIX-06 | Add all CRM permissions to `convex/_shared/permissions.ts` | ✅ done | Added: `leads.*`, `contacts.*`, `companies.*`, `deals.*`, `notes.*`, `pipelines.view/manage`, `fieldDefinitions.view/manage`, `ai.use/manageTools/viewHistory` (35 new permission entries). |

---

## Phase 2 — Infrastructure Libraries (before CRM UI)

| ID | Task | Status | Notes |
|---|---|---|---|
| INFRA-01 | Install `@dnd-kit/core` + `@dnd-kit/sortable` + `@dnd-kit/utilities` | pending | `pnpm add @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities`. Required before any kanban component. |
| INFRA-02 | Install `@tanstack/react-table` | pending | `pnpm add @tanstack/react-table`. Required before any DataTable component. |
| INFRA-03 | `core/kanban/components/KanbanBoard.tsx` | pending | DndContext wrapper + SortableContext. Props: columns, items, onCardMove, renderCard, renderHeader. |
| INFRA-04 | `core/kanban/components/KanbanColumn.tsx` | pending | Droppable column. Renders header + sorted cards list. |
| INFRA-05 | `core/kanban/components/KanbanCard.tsx` | pending | Draggable base card. All entity cards extend this. |
| INFRA-06 | `core/kanban/hooks/usePipelineBoard.ts` | pending | Loads pipeline stages from Convex. Handles midpoint sort-order on drag (sortOrder = (prev + next) / 2). |
| INFRA-07 | `core/datatable/DataTable.tsx` | pending | shadcn table shell wired to tanstack/react-table. Props: columns, data, state, pagination, onSortChange, onFilterChange. |
| INFRA-08 | `core/datatable/DataTableToolbar.tsx` | pending | Search input + filter chips + view toggle (list/board) + "Display" popover (column visibility). |
| INFRA-09 | `core/datatable/hooks/useColumnVisibility.ts` | pending | Column show/hide state persisted to localStorage per table key. |

---

## Phase 2 — CRM Core + Dynamic Fields + Pipelines

| ID | Task | Status | Notes |
|---|---|---|---|
| CRM-00 | `pipelines` Convex table + queries/mutations | pending | Per-org, per-entityType configurable stages |
| CRM-00b | Seed default pipelines on org creation | pending | Lead/Deal/Project/Task defaults from `DEFAULT_PIPELINE_STAGES`. Dubai RE template as first option. |
| CRM-00c | Pipeline management UI (admin) | pending | Add/edit/reorder stages, set colors, isFinal flag, staleAfterDays |
| CRM-01 | `fieldDefinitions` + `fieldValues` Convex tables | pending | Includes `sensitive`, `groupName`, `showInStages` (stage-aware filtering, backend Approach B) |
| CRM-01b | Stage-aware field query | pending | `fieldDefinitions` query filters by `showInStages` (includes current stageId OR is empty). Backend filters — frontend receives only relevant fields. |
| CRM-01c | `entityDocuments` table + queries/mutations | pending | Document Vault. Used by lead/contact/deal detail pages. |
| CRM-02 | `leads` table + queries/mutations | pending | Includes `aiContext`, `quickCode`, `by_org_and_quickcode` index. Auto-generate `quickCode` on create. |
| CRM-03 | `contacts` table + queries/mutations | pending | Includes `aiContext`, `quickCode`, `by_org_and_quickcode` index. |
| CRM-04 | `deals` table + queries/mutations | pending | Includes `aiContext`. Uses `pipelineId` + `currentStageId` — NO hardcoded stage. Pipeline on deals ONLY (not leads). |
| CRM-05 | `reminders` table | pending | Follow-up scheduling |
| CRM-06 | Field builder UI (admin creates custom fields) | pending | Includes `sensitive` toggle + `groupName` picker + `showInStages` stage picker |
| CRM-06b | `notes` Convex table + queries/mutations | pending | `authorType: "user"\|"ai"`, `isPinned`, `isInternal`. AI tools: `searchNotes`, `createNote` |
| CRM-07 | Lead list view | pending | Leads have simple status (new/qualified/converted) — NO full pipeline on leads |
| CRM-08 | Contact list + detail view | pending | Detail page tabs: Overview, Activity, Deals, Notes, Documents |
| CRM-09 | Deal pipeline kanban view | pending | Dynamic stages from `pipelines` table — NOT hardcoded. Stages on DEALS only. |
| CRM-10 | Activity log per entity UI (Unified Timeline) | pending | Composite query: activityLogs + notes + email logs. NOT a new table |
| CRM-11 | CSV import with field mapping UI | pending | Maps to fixed + dynamic fields. Supports Bayut/PF export format (Dubai RE). |
| CRM-12 | Dynamic form renderer (renders fields from `fieldDefinitions`) | pending | Renders only stage-relevant fields (backend-filtered). |
| CRM-13 | `companies` Convex table + queries/mutations | pending | B2B entity. Contacts + deals link to companies via `companyId`. |
| CRM-14 | Add `displayName`+`email` to leads, `displayName`+`companyId` to contacts, `title`+`companyId` to deals | pending | Denormalized fields for AI context + fast display (R13, R52) |
| CRM-15 | Company detail page (contacts list, deals list, activity timeline) | pending | |
| CRM-16 | Documents tab on Lead/Contact/Deal detail pages | pending | Renders `entityDocuments`. Upload directly + shows WhatsApp-forwarded files. |
| CRM-17 | `aiContext` viewer widget | pending | On entity detail page: renders `aiContext` JSON as smart pills. Button: "Create Field from this Fact" — creates `fieldDefinition` + moves data to `fieldValues`. |
| EXPORT-01 | Industry export layer | pending | Agent-facing export: not platform-level data dump. Formats output for industry standards. Dubai RE: Ejari-format PDF, property summary sheet. Generic: CSV export of current filtered view. |
| EXPORT-02 | Filtered list → CSV export | pending | Any DataTable view can export its current filtered/sorted rows to CSV. Uses Trigger.dev job for large exports. |
| EXPORT-03 | Industry report templates | pending | Admin defines a report template (e.g. Ejari contract summary). AI fills from entity fieldValues. Agent downloads PDF. Trigger.dev `generate-report` job. |

**Sellable gate**: Do not start Phase 3 until 3 paying clients.

---

## Phase 2b — Stripe Checkout (run alongside CRM Core)

| ID | Task | Status | Notes |
|---|---|---|---|
| BILLING-01 | Install `stripe` + `@stripe/stripe-js`. Create Stripe Checkout session endpoint | pending | `/api/billing/checkout` — generates Stripe session, returns URL |
| BILLING-02 | Stripe webhook handler → update `orgs.plan` in Convex | pending | `/api/billing/webhook` — validate sig, parse event, update plan |

---

## Phase 3 — AI Assistant + WhatsApp Bridge (Ship Together)

> **Gate: 3 paying clients (Phase 2 gate).** v2.0 — "Stop navigating your CRM. Just talk to it."
> WhatsApp voice bridge ships WITH AI in Phase 3. They are the same product.

### AI Infrastructure

| ID | Task | Status | Notes |
|---|---|---|---|
| AI-01 | Install `ai` + `@ai-sdk/anthropic` packages | pending | Vercel AI SDK + Anthropic provider |
| AI-02 | Create `app/api/ai/chat/route.ts` (streaming proxy) | pending | Auth validation → Convex internalAction → stream response |
| AI-03 | Create `convex/ai/processChat.ts` (internalAction, "use node") | pending | Core AI runtime: auth, prompt build, ToolLoopAgent, tool execution |
| AI-04 | Create `convex/ai/systemPrompt.ts` (dynamic prompt builder) | pending | Includes org name, role, custom field definitions, today's date, pipeline stages, Next-Best-Action suggestions |
| AI-05 | Create `convex/ai/tools/` — 10+ core CRM tool handlers | pending | Each tool calls internalMutation/Query with RBAC checks. Include `searchNotes`, `createNote` |
| AI-06 | Role-scoped tool availability matrix | pending | Owner/admin/member get different tool sets |
| AI-07 | AI chat panel component (`ChatSheet.tsx` + `useChat()` hook) | pending | Slide-over panel, always accessible from dashboard |
| AI-08 | Zustand chat store (`core/ai/stores/chatStore.ts`) | pending | isOpen, pendingMessage — UI state only |
| AI-09 | Confirmation UI for destructive AI actions | pending | Delete, bulk update, irreversible stage changes |
| AI-10 | AI action logging (`actorType: "ai"` in activityLogs) | pending | Every tool call logged with result |
| AI-11 | `aiConversations` + `aiMessages` Convex tables | pending | Persist chat history scoped to orgId + userId |
| AI-12 | Data filtering in tool handlers (role-based field stripping) | pending | Client/partner cannot access internal data fields |
| AI-13 | AI analytics tools (pipeline summary, team performance, forecast) | pending | Pre-computed data queries, natural language output |
| AI-14 | AI Workspace Setup tool (`setupWorkspace.ts`) | pending | Post-onboarding: AI converses about business → generates pipelines + fieldDefinitions (with showInStages) → user approves → created. |

### WhatsApp Voice Bridge (Ships with AI in Phase 3)

| ID | Task | Status | Notes |
|---|---|---|---|
| WA-01 | `app/api/channels/whatsapp/route.ts` — inbound webhook | pending | Receives Meta/360dialog webhook. Validates signature. Routes to Trigger.dev job. |
| WA-02 | Trigger.dev job: `whatsapp-voice-processor` | pending | 1. Download audio. 2. Whisper API transcribe (Arabic+EN). 3. `resolveContact()` 4-layer resolution. 4. Claude maps to `fieldDefinitions`. 5. Write to `fieldValues` + `aiContext`. 6. Convex upsert. 7. WhatsApp reply confirmation. |
| WA-03 | `convex/ai/tools/whatsapp/resolveContact.ts` | pending | Layer 1: name in transcript. Layer 2: disambiguation WhatsApp reply. Layer 3: thread context. Layer 4: quickCode match. |
| WA-04 | Trigger.dev job: `whatsapp-document-processor` | pending | Handles forwarded Emirates ID, passport, title deed, PDF. Routes to OCR (Claude Vision / AWS Textract). Attaches to `entityDocuments`. |
| WA-05 | WhatsApp reply confirmation | pending | Bot sends structured summary back to agent after every voice/document update. |
| WA-06 | Whisper Mode — AI reply suggestion | pending | Agent forwards client message → bot analyzes + suggests reply in client's language → agent copies and sends. AI tool: `suggestClientReply(messageText, dealId, language)` |
| WA-07 | `channelAccounts` table + WhatsApp credentials storage | pending | Per-org 360dialog credentials. Encrypted in Convex. |
| WA-08 | quickCode auto-generation on lead/contact create | pending | Format: first 3 letters of displayName + sequential number. Collision-safe. e.g. `AHM-001`. |

**Gate**: WhatsApp bridge demo — agent sends voice note → CRM updates in real time → manager sees on dashboard. Record 90-second demo video. This is what you sell.

---

---

## Phase 4 — Built-In Communications

> **Gate: 8 paying clients (Phase 3 gate).** v3.0 milestone — all conversations in one place.

| ID | Task | Status | Notes |
|---|---|---|---|
| COMM-01 | `conversations` Convex table + queries/mutations | pending | `orgId, entityType, entityId, title, channel, status, lastMessageAt` |
| COMM-02 | `conversationParticipants` Convex table | pending | `conversationId, userId, role ("agent"\|"client"), lastReadAt` |
| COMM-03 | `messages` Convex table + queries/mutations | pending | `conversationId, senderId, senderType, body, channel, externalMessageId, attachments` |
| COMM-04 | `convex/conversations/queries.ts` — `listByOrg`, `getById`, `listByEntity` | pending | |
| COMM-05 | `convex/conversations/mutations.ts` — `create`, `markRead`, `updateStatus` | pending | Send notification to all participants on new message |
| COMM-06 | `convex/messages/queries.ts` + `mutations.ts` | pending | `listByConversation`, `send`, `softDelete` |
| COMM-07 | Real-time subscription: `useQuery(api.messages.listByConversation)` | pending | Live updates — Convex subscription |
| COMM-08 | Inbox route + `InboxList.tsx` — Open / Resolved / Snoozed tabs | pending | `app/[locale]/dashboard/[orgSlug]/messages/page.tsx` |
| COMM-09 | `ConversationThread.tsx` + `MessageComposer.tsx` | pending | Rich text + @mention. Real-time updates |
| COMM-10 | Conversation button on lead/contact/deal detail pages | pending | Unread count badge on Messages nav item |

---

## Phase 5 — External Channel Bridges

> **Gate: 15 paying clients (Phase 4 gate).** v4.0 — WhatsApp inbox + Email in CRM.
> NOTE: WhatsApp VOICE BRIDGE (agent → bot → CRM) ships in Phase 3. Phase 5 adds the INBOX (two-way messaging from dashboard).

### WhatsApp Inbox Bridge (Phase 5)

| ID | Task | Status | Notes |
|---|---|---|---|
| CHAN-01 | Outbound WhatsApp from dashboard inbox | pending | Agent sends WhatsApp directly from Orbitly without switching apps. Uses Phase 3 `channelAccounts` credentials. |
| CHAN-02 | WhatsApp message thread in conversation view | pending | Two-way messages visible in entity conversation tab alongside internal notes. |
| CHAN-03 | WhatsApp message status tracking (sent/delivered/read) | pending | Status badges on outbound messages. |


### Email Bridge

| ID | Task | Status | Notes |
|---|---|---|---|
| CHAN-07 | Gmail OAuth setup (Convex OAuth integration) | pending | Per-agent OAuth, not org-wide |
| CHAN-08 | Gmail inbound webhook `/api/channels/email/[orgId]` → Trigger.dev job | pending | |
| CHAN-09 | Trigger.dev `email-inbound-processor` | pending | Sender → contact match → insert `messages` `channel: "email"` |
| CHAN-10 | Thread grouping by Gmail thread ID | pending | Avoid conversation fragmentation |
| CHAN-11 | Outbound reply via Gmail API from Orbitly | pending | Reply from inbox |
| CHAN-12 | Email visible in entity conversation thread alongside internal messages | pending | Unified timeline |

---

## Phase 6 — Integration Bridges

> **Gate: 25 paying clients.** v5.0 — Connect your whole stack.

| ID | Task | Status | Notes |
|---|---|---|---|
| INT-01 | `integrations` Convex table | pending | Credentials + config per org |
| INT-02 | `integrationMappings` Convex table | pending | Field mappings |
| INT-03 | `integrationStagingData` Convex table | pending | Unmapped incoming data |
| INT-04 | `integrationEvents` Convex table | pending | Sync event log |
| INT-05 | Inbound webhook: `/api/integrations/webhook/[orgId]/[integrationId]` | pending | Generic receiver |
| INT-06 | HubSpot inbound processor — map contact/deal fields → `fieldValues` | pending | |
| INT-07 | Zapier inbound endpoint — POST → create/update entity | pending | |
| INT-08 | Slack notify action (AI can send Slack message when asked) | pending | Outbound only via AI request |
| INT-09 | Notion: link Notion page URL per record (url field type) | pending | |
| INT-10 | 3-step integration wizard UI (connect → map fields → sync) | pending | |

---

## Phase 7 — AI Automation

> **Gate: 40 paying clients.** v6.0 — AI that doesn't just answer, it works for you. Premium tier.

| ID | Task | Status | Notes |
|---|---|---|---|
| AI2-01 | Morning briefing cron: stale deals, tasks due today, AI suggestions | pending | Trigger.dev `ai-morning-briefing` 8am org timezone |
| AI2-02 | Proactive AI: "Deal stuck for 3 weeks — want me to draft a follow-up?" | pending | |
| AI2-03 | AI drafts WhatsApp reply, asks for approval before sending | pending | |
| AI2-04 | AI drafts email from deal/contact history, asks for approval | pending | |
| AI2-05 | AI-driven workflow trigger ("when deal Won → create project → notify client") | pending | |
| AI2-06 | Trigger.dev `ai-stale-deal-detector` daily cron | pending | Uses `staleAfterDays` + `stageEnteredAt` |
| AI2-07 | AI analytics dashboard — pipeline health, team performance, forecast vs target | pending | |
| AI2-08 | Reports export: PDF / CSV via Trigger.dev | pending | |
| AI2-09 | Commission calculation engine via Trigger.dev | pending | |

---

## Phase 8 — Project Management

> **Gate: Enterprise clients only.** v7.0 — CRM + PM for service businesses. Deal won → project auto-starts.

| ID | Task | Status | Notes |
|---|---|---|---|
| PM-01 | `projects` Convex table (linked to deals) | pending | `orgId, dealId, title, pipelineId, currentStageId, assignedTo, stageEnteredAt` |
| PM-02 | `tasks` Convex table | pending | `orgId, projectId, title, assignedTo, dueDate, priority, pipelineId, currentStageId` |
| PM-03 | `milestones` Convex table | pending | `orgId, projectId, title, dueDate, status` |
| PM-04 | Auto-create project when deal stage transitions to Won | pending | Convex mutation trigger |
| PM-05 | Project board view (kanban — dynamic from `pipelines` table) | pending | |
| PM-06 | Task board + list view per project | pending | |
| PM-07 | Milestones timeline view | pending | |
| PM-08 | Extend Phase 3 AI tools: project status, overdue tasks, my tasks | pending | |

---

## Phase 9 — Client Portal

> **Gate: Enterprise clients only.** v8.0 — External client/partner access — scoped, secure, branded.

| ID | Task | Status | Notes |
|---|---|---|---|
| PORTAL-01 | `connectionParticipants` Convex table (client/partner roles) | pending | `orgId, userId, projectId\|dealId, role ("client"\|"partner"), invitedAt` |
| PORTAL-02 | Portal route: `app/[locale]/portal/[orgSlug]/...` — separate layout | pending | |
| PORTAL-03 | Portal layout (org branding, no internal nav) | pending | |
| PORTAL-04 | Client invitation flow (invite from project or deal detail page) | pending | |
| PORTAL-05 | Client view: project status, milestones, messages, files only | pending | |
| PORTAL-06 | Scoped portal AI (role: client — cannot see deal values, internal notes) | pending | |
| PORTAL-07 | Files + deliverables section (Cloudinary upload from agent, download by client) | pending | |
| PORTAL-08 | Portal notification emails (Resend + Trigger.dev) | pending | |

---

## Gulf Track — Parallel Thread

> Not a separate phase — threads through all phases. Gulf-native from day one.

| ID | Task | Phase | Status | Notes |
|---|---|---|---|---|
| GULF-01 | `dir="rtl"` on Arabic `<html>` + Arabic locale routing | 1 | pending | |
| GULF-02 | `messages/ar.json` bootstrapped with all Phase 1 keys | 1 | pending | |
| GULF-03 | `labelAr` in navigation config | 1 | pending | |
| GULF-04 | `labelAr` on all CRM form labels, RTL-safe inputs + kanban | 2 | pending | |
| GULF-05 | AI system prompt responds in user's locale (Arabic if `locale = ar`) | 3 | pending | |
| GULF-06 | WhatsApp Business API setup (360dialog) — Voice Bridge | 3 | pending | Ships with AI in Phase 3. Voice note → transcription → CRM update. Gulf agents need this on day one. |
| GULF-07 | PDPL compliance: data subject fields flagged, processing logs, right-to-erasure | 5+ | pending | Saudi data regulation |
| GULF-08 | Direction-safe CSS audit — all components tested in ltr + rtl modes | 8 | pending | |
| GULF-09 | Arabic number formatting (`toLocaleString("ar-SA")`) in analytics + deal values | 2 | pending | |
| GULF-10 | Saudi Arabia + UAE phone number regex validation in contacts | 2 | pending | |
| GULF-11 | Dubai RE industry template seed script | 3 | pending | Pipeline stages: New Inquiry → Viewing → Offer/MOU → Form F → Ejari → Handover → Active Tenancy. fieldDefinitions: budget_aed, property_type, bedrooms, location_preference, rera_number, lease_expiry_date. |
| GULF-12 | 95-Day Rent Alert (RERA compliance) | 3 | pending | Trigger.dev daily cron. Scans deals in "Active Tenancy". Alerts agent 95 days before lease expiry. |


---

## Recommended Enhancements (from CRM market research)

> Identified gaps that solve the top user frustrations (complexity, data rot, inflexibility).
> Priority: 🔴 = must fix before selling, 🟡 = important upgrade, 🟢 = nice-to-have
> Decisions confirmed ✅: Auto-merge dedup with undo. Saved views shareable across org. Tags table for org-wide consistency. No PWA (web-only). AI Workspace Setup replaces hardcoded templates.

| ID | Task | Phase | Priority | Status | Notes |
|---|---|---|---|---|---|
| DEDUP-01 | Contact dedup engine — email + phone normalization + fuzzy name matching. **Auto-merge with undo option** (confirmed) | 2 | 🔴 | pending | #1 data quality killer. AI tool: `findDuplicates`, `mergeContacts`. Undo via `contactMergeHistory` table |
| BULK-01 | Bulk actions in list views — select-all + bulk update/tag/assign/delete | 2 | 🔴 | pending | Managing 50+ contacts one-by-one is #2 frustration |
| CMD-01 | Cmd+K command palette — search entities, quick-create, navigate | 2 | 🔴 | pending | Power users need keyboard shortcuts beyond AI chat |
| VIEWS-01 | Saved views / filters — **shareable across org** (confirmed). `savedViews` table with `scope: "user"\|"org"` | 2 | 🟡 | pending | Every CRM user wants "My Deals > $5K" as a saved filter |
| TAGS-01 | Tags / labels system — **`tags` table for org-wide consistency** (confirmed). Not inline arrays | 2 | 🟡 | pending | `tags` + `entityTags` junction table |
| EMAIL-TPL-01 | Email templates table + template picker in compose | 3 | 🟡 | pending | Repetitive outreach needs templates, not re-typing |
| DASHBOARD-01 | Dashboard card customization — per-user/role metric preferences | 2 | 🟢 | pending | Different roles want different dashboard metrics |
| LASTCONTACT-01 | `lastContactedAt` tracking — computed from activity logs + comms | 4 | 🟢 | pending | Users need to know who they haven't talked to |
| SCORING-01 | AI lead scoring model — based on engagement + field values + days in pipeline | 7 | 🟢 | pending | Prioritize top leads automatically |
| GOALS-01 | Quota / goal tracking — per-user targets per period, progress bar on dashboard | 7 | 🟢 | pending | Sales managers need performance tracking |

**Removed:**
- ~~MOBILE-01~~ — No PWA. Web-only responsive design (standard viewport testing is sufficient).
- ~~TEMPLATE-01~~ — Replaced by AI Workspace Setup (AI-14). No hardcoded templates. AI generates from conversation.

---

## Blocked

| ID | Task | Blocker |
|---|---|---|
| P0-AUTH-REDIRECT | Authenticated → dashboard redirect | Dashboard shell not built |
| CRM-06+ | All CRM UI | Shell must be built first |
| AI-05 | AI chat panel | Shell must be built first |
| BACKFIX-03 | `PLAN_FEATURES` + `FEATURE_FLAGS` in `constants.ts` need CRM plan features added (`crm.full`, `ai.basic`, `ai.full`, `ai.communications`) | Blocker for Phase 2 plan gating |

---

## Known Issues

- `pnpm lint-check` fails (`biome lint --check .` invalid for installed Biome v2)
- Pre-existing next-intl TS error in `.next/dev/types/validator.ts` — not our code
- PostHog `bootstrapFlags` degrades gracefully — fix deferred to Phase 8 polish
- Dashboard shell not built — user designing

# AI-AUDIT-COMPLETE.md — Full Function ↔ AI-Tool Map

> **Generated:** 2026-05-25 by scanning every `convex/**/*.ts` export and every
> registered AI tool. Source-of-truth files: `convex/ai/toolRegistry.ts`
> (registry) + the 36 files that call `registerTool()` + every public
> `orgQuery` / `orgMutation` / `action` in `convex/`.

## TL;DR — what the user asked

| Question | Answer |
|---|---|
| **Is the telemetry dashboard complete?** | ✅ **YES.** `convex/ai/queries/telemetry.ts:getOrgUsage` + `core/platform/settings/components/groups/ai/AIUsageSection.tsx` (full gauge, sparkline, top tools, top models, range tabs, plan limits). Mounted in **Settings → AI → AI Usage** — not as a separate `/settings/ai/usage` route, but functionally complete. |
| **Why did the AI call `add_note` when I asked it to "send a message"?** | Because **there is no `send_message` tool**. The AI told the truth — only `add_note`, `create_reminder`, `create_followup` exist. The backend `crm/shared/messages/mutations.ts:send` is fully implemented but not wrapped as an AI tool. **This is a real gap (P0).** |
| **How many AI tools are there?** | **83 registered tool names** as of Stage 7 (33 propose + 29 commit twins + 14 atomics + 3 always-on proactive read tools + 5 analytics tools `analyze_metric` + commit / `cohort_analysis` / `member_performance` / `get_briefing` / `refresh_briefing` + meta + interaction). |
| **How many backend functions are there?** | ~454 exports across 115 files (≈250 public, ≈200 internal/migration). |
| **Coverage** | AI can do **~70%** of the value-creating CRM work — every CRUD, scheduling, settings, schema, bulk, import, enrichment, and trash op. **30% gap**: messaging, conversations, file mgmt, deal stage edits beyond move/close, lead-stage edits, tag-on-files, briefing-on-demand, cross-entity link operations. |

---

## How to read the master table

For each function/work-unit:

- **Col 1 — Capability.** Plain-English description of the work (verb + outcome).
- **Col 2 — Manual implementation.** The Convex public path the UI calls + the user-facing surface (which page/button). This is the SAME piece of work an end-user does.
- **Col 3 — AI status.** Tool name (or ❌ if none), edge-case coverage, half-baked flags.

Status legend: ✅ shipped & wired · 🟡 wired but half-baked / known issues · ⚠️ partial coverage · ❌ no AI tool · 🔒 by design (admin-only / migration / internal)

---

## 1 — CRM ENTITIES (Leads / Contacts / Companies / Deals)

### 1.1 Leads

| Capability | Manual implementation | AI tool |
|---|---|---|
| List leads (filtered, paginated) | `crm/entities/leads/queries:list` — `/{orgSlug}/leads` board/table view | ✅ `search_crm` (universal), `list_entity_fields` (schema only). No dedicated `list_leads` — `search_crm` covers it. |
| Get lead by id / personCode | `crm/entities/leads/queries:getById` / `getByPersonCode` (drives `/profile/P-001`) | ✅ `get_entity_detail` |
| Search by name / phone / email | `crm/entities/leads/queries:searchLeads` | ✅ Folded into `search_crm` |
| Create lead | `crm/entities/leads/mutations:create` ← LeadsView + EntityFormDialog | ✅ `create_lead` + `commit_create_lead` (two-step, with notes pre-fill, full instruction block, dedup hints, edge cases for missing displayName, phone-only contact). |
| Update lead | `crm/entities/leads/mutations:update` ← row inline edit + EntityFormDialog | ✅ `update_entity` + `commit_update_entity` (generic, accepts type=lead). Also `update_field` per custom field. **Edge:** displayName-only updates work; multi-field at once works. **Gap:** can't atomically "update + add note" in one tool — needs 2 tool calls. |
| Convert lead → contact | `crm/entities/leads/mutations:convertToContact` ← "Convert" button on row + form | ✅ `convert_lead` + `commit_convert_lead`. Edge cases handled: already-contact (refuses), tries-keeping-personCode-stable (Decision #12). |
| Delete (soft → trash) | `crm/entities/leads/mutations:remove` ← row "Delete" → goes to trash | ✅ **Shipped — Stage 3.** Universal `delete_entity` tool routes to `leads/mutations:softDeleteForAI`. Cascade-impact propose surfaces "this will trash N notes + M reminders". |
| Restore from trash | `trash/mutations:restore` ← Trash drawer → "Restore" | ✅ `restore_entity` + `commit_restore_entity` |
| View trash | `trash/queries:list` | ✅ `view_trash` |
| Lead stage / status change | `crm/entities/leads/mutations:update` (status field) ← Kanban drag | ⚠️ Generic `update_entity` works but no semantic `move_lead_status` tool. AI must know the field-name convention. **Should add:** `move_lead_stage` mirroring `move_deal_stage`. |
| Assign owner | `crm/entities/leads/mutations:update` (assignedTo) ← Owner picker | ✅ Via `update_entity`. **Edge:** AI doesn't auto-suggest "assign to round-robin" — see capability gaps §6. |
| Bulk update (tag, owner, status) | `crm/entities/leads/mutations` + bulk endpoint | ✅ `bulk_update_entities` + commit. Confirmation gated. |

### 1.2 Contacts

| Capability | Manual implementation | AI tool |
|---|---|---|
| List / get / search | `crm/entities/contacts/queries:list / getById / getByPersonCode / searchContacts` | ✅ `search_crm`, `get_entity_detail` |
| Create contact | `contacts/mutations:create` | ✅ `create_contact` + `commit_create_contact` |
| Update contact | `contacts/mutations:update` | ✅ `update_entity` + commit |
| Update aiContext (per-record memory) | `contacts/mutations:updateAiContext` | 🟡 The mutation exists, but **no AI tool exposes it directly**. AI relies on the auto-rebuild via `ai/internal:summariseLeadOrContact` running on every CRUD. Manual override path is dead-end for AI. |
| Revert contact → lead | `contacts/mutations:revertToLead` (extracted in `crud/revertContact.ts`) | ✅ `revert_contact` + `commit_revert_contact` |
| Delete (trash) | as above | ✅ **Shipped — Stage 3.** Same universal `delete_entity` tool — routes to `contacts/mutations:softDeleteForAI`. |

### 1.3 Companies

| Capability | Manual implementation | AI tool |
|---|---|---|
| List / get / search | `companies/queries:list / getById / getByCompanyCode / searchCompanies` | ✅ `search_crm`, `get_entity_detail` |
| Create company | `companies/mutations:create` | ✅ `create_company` + commit |
| Update company | `companies/mutations:update` | ✅ `update_entity` + commit |
| **Add person to company** | `companies/mutations:addPerson` ← "Add contact" on company detail | ✅ **Shipped — Stage 3.** `add_person_to_company` + commit. ForAI twin: `addPersonForAI`. |
| **Remove person from company** | `companies/mutations:removePerson` | ✅ **Shipped — Stage 3.** `remove_person_from_company` + commit. ForAI twin: `removePersonForAI`. |
| Delete company (cascade trash) | `companies/mutations:remove` | ✅ **Shipped — Stage 3.** Universal `delete_entity` tool — routes to `companies/mutations:softDeleteForAI`; cascade-impact propose surfaces deal + people-link counts. |

### 1.4 Deals

| Capability | Manual implementation | AI tool |
|---|---|---|
| List / list by stage | `deals/queries:list` / `listGroupedByStage` ← Kanban + Table | ✅ `search_crm`, plus `get_dashboard_summary` for pipeline-wide totals |
| Get deal by id / dealCode | `deals/queries:getById / getByDealCode` | ✅ `get_entity_detail` |
| Create deal | `deals/mutations:create` | ✅ `create_deal` + `commit_create_deal` (links to company + person via codes) |
| Update deal | `deals/mutations:update` | ✅ `update_entity` + commit |
| Move stage | `deals/mutations:moveToStage` ← Kanban drag | ✅ `move_deal_stage` (atomic, no commit) — fast path for the common drag |
| Close deal (won / lost) | `deals/mutations:close` (sets `wonAt` / `lostAt`) | ✅ `close_deal` + `commit_close_deal` |
| Bulk close deals | (composite of close) | ✅ `bulk_close_deals` + commit |
| Reopen deal | `deals/mutations:reopen` (clears wonAt/lostAt) | ❌ **No AI tool.** "Reopen the Acme deal" → the AI has to use raw `update_entity` to clear `wonAt: null`. **P2 gap.** |
| Pin field to stage | `deals/mutations:pinField` (attaches custom field to stage) | ❌ Schema-edit op. Could go through `update_field`, but not directly exposed. |
| Delete deal | `deals/mutations:remove` | ✅ **Shipped — Stage 3.** Universal `delete_entity` tool — routes to `deals/mutations:softDeleteForAI`. |

### 1.5 People (cross lead+contact)

| Capability | Manual | AI |
|---|---|---|
| Resolve personCode → record (lead OR contact) | `crm/people/queries:getByPersonCode` | ✅ Used inside `get_entity_detail` and `enrich_record` |
| List all people | `crm/people/queries:listAll` | ✅ Folded into `search_crm` (`type: "person"`) |
| Search by code | `crm/people/queries:searchByCode` | ✅ `search_crm` |
| List for picker (conversation participants) | `crm/people/queries:listForConversationPicker` | ❌ Not via AI — no conversation tool yet (see §3 below). |

---

## 2 — NOTES, REMINDERS, FOLLOWUPS

| Capability | Manual implementation | AI tool |
|---|---|---|
| Add note to entity / person | `crm/shared/notes/mutations:create` | ✅ `add_note` (always-on, auto-resolves entity by personCode/companyCode/dealCode) |
| Update note | `notes/mutations:update` | ✅ **Shipped — Stage 3.** `update_note` + commit. ForAI twin: `updateForAI`. |
| Delete note | `notes/mutations:remove` | ✅ **Shipped — Stage 3.** `delete_note` + commit (also covered by universal `delete_entity` with `entityType="note"`). ForAI twin: `removeForAI`. |
| Pin / unpin note | `notes/mutations:togglePin` | ✅ **Shipped — Stage 3.** `pin_note` (atomic). ForAI twin: `togglePinForAI`. |
| Set note category | `notes/mutations:setCategory` | ✅ **Shipped — Stage 3.** `set_note_category` (atomic). ForAI twin: `setCategoryForAI`. |
| Reorder notes | `notes/mutations:reorder` | ❌ Out of scope — drag-positioning tool isn't useful via AI (the AI doesn't know neighbour ids). The atomic `set_note_category` already lands the note at the top of its destination column, which matches the AI use case. |
| List notes | `notes/queries:listForEntity / listForPerson / listForOrg` | ✅ Surfaced inside `get_entity_detail` (lead/contact summary already includes latest 1-2 notes) |
| Create reminder (due date, type, linked record) | `reminders/mutations:create` | ✅ `create_reminder` (full instruction block, table summary) |
| Create followup (templated reminder, code-tracked) | `reminders/mutations:create` (kind=followup) | ✅ `create_followup` (returns `followUpCode` for later complete/cancel) |
| Complete reminder | `reminders/mutations:complete` | ✅ `complete_reminder` + `complete_followup_by_code` |
| Cancel followup | `reminders/mutations:remove` | ✅ `cancel_followup_by_code` (instruction warns: "user said done not cancel") |
| Update reminder (date, body, assignee) | `reminders/mutations:update` | ✅ **Shipped — Stage 3.** `update_reminder` + commit (twoStep). Accepts `followUpCode` (preferred) or `reminderId`. ForAI twin: `updateForAI`. |
| List reminders | `reminders/queries:listForPerson / listAllForOrg / getDueToday / getDueAndOverdue / getNextUpcoming` | ✅ `list_followups` (org-wide) + `list_followups_for_person` |
| Reorder reminders | (no mutation found) | n/a |

### Note categories

| Capability | Manual | AI |
|---|---|---|
| Create category | `noteCategories/mutations:create` | ✅ `create_note_category` |
| Update / rename | `noteCategories/mutations:update` | ✅ `rename_note_category` |
| Archive | `noteCategories/mutations:archive` | ✅ `archive_note_category` + `commit_archive_note_category` |
| Reorder | `noteCategories/mutations:reorder` | ✅ `reorder_note_categories` |
| Set as default | `noteCategories/mutations:setDefault` | ❌ **No AI tool.** **P3 gap** — low traffic. |
| List | `noteCategories/queries:listForOrg / getDefault` | ✅ `list_categories` |

---

## 3 — MESSAGES & CONVERSATIONS (THE BIG GAP)

This whole section is **the user's #1 reported pain point.** AI cannot send messages.

| Capability | Manual implementation | AI tool |
|---|---|---|
| **Send a message** (chat / WhatsApp-like, mentions, attachments) | `crm/shared/messages/mutations:send` ← every conversation thread, person profile, entity detail | ❌ **NO AI TOOL.** This is why "send a message to Sara" fails over to `add_note`. **P0 gap.** |
| Update a message | `messages/mutations:update` (own messages, edit window) | ❌ |
| Remove a message | `messages/mutations:remove` (soft delete with edit history) | ❌ |
| React to a message | `messages/mutations:toggleReaction` | ❌ |
| List messages in a conversation | `messages/queries:listForConversation / listForConversationPaginated` | ❌ Indirect via `search_crm` returning conversation excerpts only |
| List messages for an entity | `messages/queries:listForEntity` | ❌ |
| List messages for a person (timeline) | `messages/queries:listForPerson` | ❌ |
| Inbox feed | `messages/queries:listInbox` | ❌ Even **read access** is invisible to AI. |
| Ensure conversation exists for an entity | `conversations/mutations:ensureForEntity` | ❌ |
| Add participants | `conversations/mutations:addParticipants` | ❌ |
| Remove participant | `conversations/mutations:removeParticipant` | ❌ |
| Leave conversation | `conversations/mutations:leave` | ❌ |
| Set notification level (mute, all, mentions) | `conversations/mutations:updateNotificationLevel` | ❌ |
| Mark thread read | `conversations/mutations:markRead` | ❌ |
| List conversations for user | `conversations/queries:listForUser` | ❌ |
| Get unread count | `conversations/queries:getUnreadCount` | ❌ |

**Verdict:** ✅ **Implemented — Stage 2, 2026-05-26.** Messaging is now AI-driven end-to-end: `send_message` (+ `commit_send_message`), `list_messages`, `mark_thread_read`, `add_participants` (+ commit), `remove_participant` (+ commit) shipped under the new `messaging` tool layer. ForAI twins added for every public mutation/query the tools call (per AGENTS.md non-negotiable rule). Edit + react flows have ForAI twins ready (`updateForAI`, `removeForAI`, `toggleReactionForAI`) and will be wrapped as Stage 4 P2 tools. Conversation participant management and DM ensure flows are covered via `add_participants` / `remove_participant` and the auto-creation behaviour of `send_message` (the public `messages:send` mutation auto-creates the conversation when called with `entityType + entityId`). See `convex/ai/tools/messaging/*` and `convex/ai/tools/messaging/messaging.test.ts` (8 ForAI contract tests).

---

## 4 — TAGS

| Capability | Manual implementation | AI tool |
|---|---|---|
| Create tag | `tags/mutations:create` | ✅ `create_tag` (always-on, no commit) |
| Delete tag | `tags/mutations:remove` | ✅ `delete_tag` + commit |
| Attach to entity | `tags/mutations:attachToEntity` | ✅ `attach_tag` |
| Detach from entity | `tags/mutations:detachFromEntity` | ✅ `detach_tag` |
| List org tags | `tags/queries:listByOrg` | ✅ `list_tags` |
| List for entity | `tags/queries:getTagsForEntity` | ✅ Folded into `get_entity_detail` |
| Bulk list for many entities (board) | `tags/queries:listTagsForEntities` | ⚠️ Backend-only optimisation, not AI-relevant |
| **Update tag (rename, change colour)** | `tags/mutations:update` | ❌ **No AI tool.** "Rename tag VIP to High-value" → manual. **P2 gap.** |

---

## 5 — SAVED VIEWS

| Capability | Manual | AI |
|---|---|---|
| Create | `savedViews/mutations:create` | ✅ `create_saved_view` + commit |
| Update | `savedViews/mutations:update` | ❌ **No AI tool.** **P3 gap.** |
| Pin / unpin | `savedViews/mutations:togglePin` | ✅ `pin_saved_view` |
| Delete | `savedViews/mutations:remove` | ✅ `delete_saved_view` + commit |
| List | `savedViews/queries:listByEntity / listPinned / listForUser` | ✅ `list_saved_views` |

---

## 6 — FIELDS, PIPELINES, TEMPLATES (SCHEMA / SETTINGS WRITES)

### Fields

| Capability | Manual | AI |
|---|---|---|
| Create field def | `fieldDefinitions/mutations:create` | ✅ `create_field` + commit |
| Update field def | `fieldDefinitions/mutations:update` | ✅ `update_field` + commit |
| Remove field def | `fieldDefinitions/mutations:remove` | ✅ `remove_field` + commit |
| Set field value | `fieldValues/mutations:set` | ⚠️ **Indirect via `update_entity`**. AI can't directly hit `fieldValues:set` — but `update_entity` routes through it. Acceptable. |
| Bulk set | `fieldValues/mutations:bulkSet` | ✅ Via `bulk_update_entities` |
| List defs by entity | `fieldDefinitions/queries:listByEntity` | ✅ `list_entity_fields` |
| Get field options (enum / select) | (computed in queries) | ✅ `list_field_options` |

### Pipelines

| Capability | Manual | AI |
|---|---|---|
| Create pipeline | `pipelines/mutations:create` | ✅ `create_pipeline` + commit |
| Add stage | `pipelines/mutations:addStage` | ✅ `add_pipeline_stage` + commit |
| Update stage (rename, recolour) | `pipelines/mutations:updateStage` | ❌ **No AI tool.** "Rename stage Qualified to Discovery" → manual. **P2 gap.** |
| Remove stage | `pipelines/mutations:removeStage` | ❌ Same gap. |
| Reorder stages | `pipelines/mutations:reorderStages` | ❌ Same gap. |
| Set default pipeline | `pipelines/mutations:setDefault` | ❌ |
| List | `pipelines/queries:listByOrg / getDefault / getById` | ✅ `list_pipelines` |

### Templates (industry presets)

| Capability | Manual | AI |
|---|---|---|
| List templates | `templates/queries:listForAI` | ✅ `list_templates` |
| Apply template | `templates/mutations:apply` | ✅ `apply_template` + commit (writes fields/pipelines/labels/dashboardMetrics/aiPersona) |
| Clear mock data | `orgs/mutations:clearMockData` | ✅ `clear_mock_data` + commit |

---

## 7 — ORG SETTINGS

| Capability | Manual | AI |
|---|---|---|
| Get full settings (currency, locale, labels, dashboard, file rules) | `orgs/queries:getFullSettings` | ✅ Used by `update_org_settings` preflight |
| Update general settings (currency, timezone, locale, default visibility, reminder defaults, file rules) | `orgs/mutations:updateSettings` | ✅ `update_org_settings` + commit |
| Rename entity labels (lead → prospect, deal → opportunity) | `orgs/mutations:updateSettings` (entityLabels field) | ✅ `rename_entity_labels` + commit |
| Update org identity / business context | `aiPersonaContext.setOrgIdentity` | ✅ `update_org_identity` + commit (NEW 2026-05-24) |
| Update dashboard layout | `orgs/mutations:updateSettings` (dashboardMetrics) | ✅ `update_dashboard_layout` + commit + `list_widgets` |
| Get entity labels (single hook for UI + AI) | `orgs/queries:getEntityLabels` | ✅ Read into system prompt every turn |
| Update plan tier | `orgs/mutations:setPlan` (admin only) | 🔒 By design — billing tier is admin-only. |
| Get dashboard stats (KPIs) | `orgs/queries:getDashboardStats` | ✅ `get_dashboard_summary` |

---

## 8 — MEMBERS / ROLES / INVITATIONS / RBAC

| Capability | Manual | AI |
|---|---|---|
| List members | `orgs/queries:listMembers` | ✅ `list_members` |
| Get my membership / permissions | `orgs/queries:getMyMembership` | ✅ `list_my_permissions` |
| Invite member | `invitations/mutations:create` | ✅ `invite_member` + commit |
| Cancel invitation | `invitations/mutations:cancel` | ✅ `cancel_invitation` + commit |
| Resend invitation | `invitations/mutations:resend` | ❌ **No AI tool.** **P3 gap.** |
| List invitations | `invitations/queries:listPending / listAll / getByToken` | ⚠️ Folded into `list_members` partially — but pending invitations not surfaced. |
| Change member role | `orgs/mutations:changeMemberRole` | ✅ `change_member_role` + commit |
| Remove member | `orgs/mutations:removeMember` | ✅ `remove_member` + commit |
| Create / update / delete custom role | `orgRoles/mutations:create / update / delete` | ❌ **No AI tools.** "Make a 'Sales Lead' role with these permissions" → manual. **P2 gap.** |
| List roles | `orgRoles/queries:listForOrg` | ❌ Surfaced indirectly via `list_my_permissions`. |

---

## 9 — DATA OPS (TRASH, RESTORE, IMPORT, ENRICHMENT, FILES)

| Capability | Manual | AI |
|---|---|---|
| View trash | `trash/queries:list` | ✅ `view_trash` |
| Restore from trash | `trash/mutations:restore` | ✅ `restore_entity` + commit |
| Permanently delete | `trash/mutations:purgeOldTrash` (cron only) | 🔒 By design (cron-driven, not AI). |
| CSV import (preview + commit) | `csvImports.*` + `crm/fields/csvImport.run` | ✅ `import_csv` + `commit_import_csv` (full preview card with row-by-row dedup matches) |
| Enrich record (LinkedIn, ClearBit, etc.) | `aiSubagents:enrichment.run` | ✅ `enrich_record` + `commit_enrich_record` (instruction block added 2026-05-24) |
| Analyse uploaded file (extract entities, summarise) | `aiSubagents:fileAnalyzer.run` | ✅ `analyze_file` + `commit_analyze_file` |
| Upload file (record metadata + storage) | `files/mutations:record` | ❌ AI cannot directly upload. **By design** — file picker is a UI affordance. AI can attach an already-uploaded file via `analyze_file`. |
| Update file tags / metadata | `files/mutations:updateTags` | ❌ |
| Remove file | `files/mutations:remove` | ❌ |
| List files (by scope, by field, by tag, by entity) | `files/queries:listByScope / listByField / listByTag / listForEntity / getUrl` | ❌ AI has no `list_files` tool. **P2 gap** — common ask: "show me all PDFs attached to Acme". |

---

## 10 — DASHBOARD / TIMELINE / CALENDAR / BRIEFINGS

| Capability | Manual | AI |
|---|---|---|
| Get dashboard KPI strip | `orgs/queries:getDashboardStats` | ✅ `get_dashboard_summary` |
| List dashboard widgets (registry) | `convex/_shared/widgetRegistry:WIDGETS` | ✅ `list_widgets` |
| Update dashboard layout (which widgets, order) | `orgs/mutations:updateSettings(dashboardMetrics)` | ✅ `update_dashboard_layout` + commit |
| Org-wide timeline (cross-entity activity feed) | `timeline/queries:getForOrg / getForPerson / getForEntity / getForScope` | ⚠️ Surfaced inside `get_entity_detail` (per-entity). **No `list_org_timeline` tool** — user can't ask "what happened across the workspace today?" without going to `get_dashboard_summary`. **P2 gap.** |
| Activity log | `activityLogs/mutations` (write) + helpers | 🔒 Internal only — every AI tool writes to it via the canonical mutation pattern. |
| Calendar events | `calendar/queries:getEvents` | ❌ **No AI tool.** "What's on my calendar this week?" → AI can use `list_followups` (since calendar IS reminders), but the calendar grid + ranges aren't directly readable. Acceptable indirection. |
| Daily AI briefing (per-user, generated nightly) | `briefingsPublic:todayForUser / getLatest` | ❌ AI has no `get_briefing` tool — but the briefing is rendered as a dashboard card and is itself AI-generated. **No on-demand "give me my briefing"** — has to use `get_dashboard_summary`. **P3 gap.** |
| Weekly insight (org-wide) | `briefingsPublic:thisWeekForOrg` | ❌ Same. |
| Refresh briefing on demand | `briefingsPublic:refreshNow` | ❌ Could be a P3 quality-of-life tool. |

---

## 11 — AI / CHAT INFRASTRUCTURE (META — for completeness)

| Capability | Manual | AI |
|---|---|---|
| List chat conversations | `ai/conversations:list / get` | n/a (UI surface) |
| Send message in chat | `ai/messages:sendMessage` | n/a (this IS the AI loop) |
| Confirm two-step proposal | `ai/messages:confirmConfirmation` | n/a |
| Add tool-approval response (HITL) | `ai/messages:addToolApprovalResponse` | n/a |
| Cancel an in-flight stream | `ai/messages:cancelStream` | n/a |
| Org / user persona memory (read) | `ai/personaContext:getOrgIdentity / getOrgPersonaForAI / getUserPersonaForAI` | ✅ Read into prompt every turn |
| Update persona facts (AI-managed memory) | `ai/personaContext:upsertPersonaForAI` | ✅ `update_user_context_facts`, `update_org_context_facts` |
| Set context var (transient, this-turn-only) | `ai/tools/contextBag:set_context_var` | ✅ `set_context_var` |
| Persist API keys (org / user) | `ai/keysActions:addOrgKey / addUserKey` | n/a (settings UI) |
| List available models | `ai/availableModels:listPlatformProviders` | n/a |
| Generate suggestions (chips, predictions) | `ai/suggestions.*` | n/a (heuristic, not tool-driven) |
| Telemetry — usage rollup | `ai/queries/telemetry:getOrgUsage` | n/a (admin dashboard) |
| Web search (factual lookups) | `ai/webSearchAction:run` | ✅ `web_search` |
| Ask user (pause + ask) | `ai/tools/interaction/askInput` | ✅ `ask_user_input` |
| Ask user choice | `ai/tools/interaction/askChoice` | ✅ `ask_user_choice` |
| Expand a tool layer | `ai/toolRegistry:expandToolsDef` | ✅ `expand_tools` |
| List active layers | `ai/tools/introspect:listActiveLayers` | ✅ `list_active_layers` |

---

## 12 — BILLING / GDPR / NOTIFICATIONS

| Capability | Manual | AI |
|---|---|---|
| Get billing status | `billing/queries:get` | 🔒 Surfaced in BillingGroup UI. AI doesn't expose. |
| Start checkout | `billing/actions:startCheckout` | 🔒 By design — billing tools deferred to Phase 4 Part 3. |
| Open portal | `billing/actions:openPortal` | 🔒 Same. |
| Apply / verify webhook | `billing/internal:*` | 🔒 Internal. |
| Export org data (GDPR) | `gdpr/actions:exportOrgData` | 🔒 By design (admin-only). |
| Delete account (GDPR) | `gdpr/actions:deleteAccount` | 🔒 By design (high-risk; UI flow only). |
| List notifications | `notifications/queries:list` | ❌ AI has no `list_notifications` / `mark_read` tools. **P3 gap.** |
| Mark read | `notifications/mutations:markRead` | ❌ |

---

## 13 — Migrations / Internal / Test (NOT AI-relevant)

All 24 migrations under `convex/_migrations/` and the helpers in `convex/_test/` are internal-only and intentionally not AI-callable. Same for `users/mutations:upsertFromAuth`, `auth.ts`, `http.ts`, and the cron-only `purgeOldTrash`, `recomputeOrgStats`. ✅ Correctly excluded.

---

## 14 — HALF-BAKED / KNOWN-ROUGH AI TOOLS

> **Stage 10 update (2026-05-26)** — adversarial-file sanitisation, CSV encoding heuristics, bulk-progress row-level diff, and enrichment-provider friendly errors all shipped. The remaining items (per-call streaming, custom-field diff capture, low-conf model-cost loops) are bookkeeping-style polish, not user-facing gaps.

| Tool | Issue |
|---|---|
| `bulk_update_entities` | ✅ **Stage 10 — row-level diff shipped.** `commit_bulk_update_entities` + `commit_bulk_close_deals` now use `convex/_shared/bulkProgress.ts` to capture per-row failures and return a `ToolSummary` with the per-row table + retry chips per Constraint F. Mid-flight chunked streaming remains in `Future-Enhancements.md` backlog. |
| `import_csv` | ✅ **Stage 10 — encoding heuristics shipped.** `convex/_shared/csvEncodingDetect.ts` handles UTF-8 BOM, UTF-16-LE/BE BOM, and Latin-1 / Windows-1252 fallback with friendly errors. Wide-CSV (>50 cols) preview truncation remains backlog (UX polish only). |
| `enrich_record` | ✅ **Stage 10 — friendly errors shipped.** `convex/_shared/enrichmentErrorMap.ts` maps 401 / 403 / 404 / 429 / 500 / timeout / DNS / network / not-configured to `{code, retryable, fallThrough, hint}`. Wired into all 4 provider trace pushes. Real provider integrations (LinkedIn / Hunter / Apollo) still ship in Phase 4 per `Future-Enhancements.md §B.14 / §B.15`. |
| `analyze_file` | ✅ **Stage 10 — adversarial sanitisation shipped.** `convex/_shared/sanitiseExtractedText.ts` strips `<script>` / on*= / `javascript:` / `data:text/html` and redacts dangerous markdown link targets BEFORE the structured extracted record is persisted. The `>25 MB` cap message is still generic; tracked as low-priority polish. |
| `update_entity` | ✅ Generic — but **no field-level diff returned**. The summary card shows "before/after" only when the propose path captured both, which it does only on Zod-tracked fields. Custom fields → no diff. (Backlog.) |
| `move_deal_stage` | ✅ **Stage 8 — auto-followup shipped.** Hooked into `deals/mutations:moveToStageImpl` via `maybeFireAutoFollowupOnStageMove`; gated on `users.preferences.aiAutonomy.autoFollowupOnStageMove` opt-in. |
| `delete_*` (anywhere) | ✅ **Stage 3 — universal `delete_entity` shipped.** Routes to `softDeleteForAI` for lead/contact/company/deal + `removeForAI` for note/reminder. Cascade-impact propose powered by `convex/ai/queries/cascadeImpact.ts`. |
| `update_user_context_facts` | ✅ Works, but the model often fires it 3-4× per turn for trivial facts. Cost-perf concern. (Backlog — needs a debouncer in the heuristic.) |
| `web_search` | ✅ **Stage 9 — `web_scrape` shipped** as the Firecrawl-scrape pair for `web_search`. Atomic, 30/min/user budget, costClass `normal`. |

---

## 15 — TOTAL TALLY

> **2026-05-26 update — Stages 1-10 of `/SPRINT-PLAN.md` ALL SHIPPED. Sprint complete.** AI coverage by usage frequency is now ~99%; raw-count coverage moved from 49% → 96%+. Stage 10 hardening pass added 4 production-grade pure helpers — `convex/_shared/{sanitiseExtractedText,csvEncodingDetect,bulkProgress,enrichmentErrorMap}.ts` — wired into `analyze_file`, `import_csv`, `bulk_update_entities`/`bulk_close_deals`, and the 4-provider enrichment trace; 39 contract tests at `convex/stage10.test.ts`. Stage 9 closed Milestone E (Creative drafting): new `creative` tool layer with `draft_message` + `commit_draft_message` (twoStep), `draft_proposal` + `commit_draft_proposal` (twoStep), atomic `summarise_conversation`, atomic `web_scrape` (Firecrawl-scrape pair for `web_search`). Drafts NEVER autosend or persist — every draft surfaces `suggestedNext` chips routing to `send_message` / `add_note` / `create_followup`. Quota: 5/min/user + 50/day/user shared across the 3 LLM tools (`web_scrape` has its own 30/min budget). Stage 8 closed Milestone D (Autonomous layer): new `aiStandingOrders` table + `users.preferences.aiAutonomy` opt-ins + `pipelines.stages[].onEnter` triggers + `aiToolEvents.triggeredBy` audit trail; cron-driven runner with tool whitelist; auto-followup on stage move + auto-enrich on contact create both opt-in-gated. Stage 7 already shipped the analytics tools (`analyze_metric`/cohort/member_performance/briefing) + trace UI; Stage 6 the proactive ranker; Stage 5 the AI dashboard surface. Remaining gaps are file-upload (UI-only by design), billing / GDPR (admin-only), and `set_default_note_category` (low-traffic backlog).

| Category | Count | AI-covered (post-Stage 4) | Status |
|---|---|---|---|
| Public CRUD (entities) | 24 | 24 (100%) | ✅ All shipped Stages 1-4. delete_entity (universal) + reopen-deal + move_lead_status + addPerson/removePerson all live. |
| Notes | 8 | 7 (87%) | ✅ Stage 3 — update/delete/pin/setCategory shipped. Reorder remains drag-only. |
| Reminders | 7 | 7 (100%) | ✅ Stage 3 — update_reminder shipped. |
| Messages | 6 | 6 (100%) | ✅ Stage 2 — entire module wrapped (send_message, list_messages, mark_thread_read). |
| Conversations | 7 | 7 (100%) | ✅ Stage 2 — add_participants, remove_participant + ensureForEntity auto-call. |
| Tags | 6 | 6 (100%) | ✅ Stage 4 — update_tag shipped. |
| Saved views | 5 | 5 (100%) | ✅ Stage 4 — update_saved_view shipped. |
| Fields | 5 | 5 (100%) | — (already shipped pre-sprint). |
| Pipelines | 7 | 7 (100%) | ✅ Stage 4 — updateStage / removeStage / reorderStages / setDefault all shipped (twoStep with deal-impact preview). |
| Templates | 3 | 3 (100%) | — (already shipped pre-sprint). |
| Settings (org) | 6 | 6 (100%) | — (already shipped pre-sprint). |
| Members / invites | 8 | 8 (100%) | ✅ Stage 4 — resend_invitation + custom-role CRUD shipped. |
| Trash / data | 4 | 4 (100%) | ✅ Stages 1-3 — restore_entity + view_trash + bulk + universal delete_entity. |
| Files | 6 | 5 (83%) | ✅ Stage 4 — list_files / update_file_tags / remove_file shipped. Upload is UI-only by design. |
| Timeline / calendar / briefings | 8 | 4 (50%) | 🟡 Stage 4 — list_org_timeline shipped. Briefing-on-demand deferred to Stage 7 Analytical layer. |
| Notifications | 3 | 2 (67%) | ✅ Stage 4 — list_notifications + mark_notification_read shipped (folded P3). |
| Billing / GDPR | 6 | 0 (0%) | 🔒 by design — admin-only UI flows. |
| **TOTAL** | **119 user-facing** | **~106** | **~95% by usage frequency. Reactive parity gap with the UI is closed.** |

**AI coverage: ~89% by raw count, ~95% by usage frequency.** Remaining 13 = 6 by-design (billing/GDPR), file-upload (UI affordance), 3 calendar/briefing slots (Stage 7), `set_default_note_category` + 2 minor backlog items.

---

## 16 — PRIORITISED FIX LIST

### P0 — ship next (the user explicitly asked, and this is a daily blocker)

**✅ All P0 rows shipped — Stage 2 of `/SPRINT-PLAN.md`, 2026-05-26.** See `convex/ai/tools/messaging/*` for the implementations.

| # | Tool | Wraps | Status |
|---|---|---|---|
| 1 | `send_message` + `commit_send_message` | `crm/shared/messages/mutations:send` | ✅ Shipped — Stage 2. ForAI twin: `sendForAI`. |
| 2 | `list_messages` | `messages/queries:listForEntity / listForPerson / listInbox` | ✅ Shipped — Stage 2. ForAI twins: `listForEntityForAI`, `listForPersonForAI`, `listInboxForAI`. |
| 3 | `mark_thread_read` | `conversations/mutations:markRead` | ✅ Shipped — Stage 2. ForAI twin: `markReadForAI`. |

### P1 — ship after P0 (frequent asks)

**✅ All P1 rows shipped — Stage 3 of `/SPRINT-PLAN.md`, 2026-05-26.** See `convex/ai/tools/{crud,notes,scheduling,companies}/*` for the implementations. Row 8 (`add_participants` / `remove_participant`) shipped in Stage 2 alongside the P0 messaging wave.

| # | Tool | Wraps | Status |
|---|---|---|---|
| 4 | `update_reminder` | `reminders/mutations:update` | ✅ Shipped — Stage 3. ForAI twins: `updateForAI`, `removeForAI`. Tool at `convex/ai/tools/scheduling/updateReminder.ts`. |
| 5 | `add_person_to_company` / `remove_person_from_company` | `companies/mutations:addPerson / removePerson` | ✅ Shipped — Stage 3. ForAI twins: `addPersonForAI`, `removePersonForAI`. Tools at `convex/ai/tools/companies/{addPerson,removePerson}.ts`. |
| 6 | `delete_entity` (universal — leads, contacts, companies, deals, notes, reminders) | per-module `remove` / `softDelete` mutations | ✅ Shipped — Stage 3. ForAI twins: `softDeleteForAI` on leads/contacts/companies/deals; `removeForAI` on notes + reminders. Tool at `convex/ai/tools/crud/deleteEntity.ts`. Cascade-impact propose powered by `convex/ai/queries/cascadeImpact.ts`. |
| 7 | `update_note` / `delete_note` / `pin_note` / `set_note_category` | `notes/mutations:*` | ✅ Shipped — Stage 3. ForAI twins: `updateForAI`, `togglePinForAI`, `setCategoryForAI`, `removeForAI`. Tools at `convex/ai/tools/notes/*.ts`. |
| 8 | `add_participants` / `remove_participant` (conversation membership) | `conversations/mutations:*` | ✅ Shipped — Stage 2 (alongside P0 messaging wave). ForAI twins: `addParticipantsForAI`, `removeParticipantForAI`. |

### P2 — quality of life

**✅ All P2 rows shipped — Stage 4 of `/SPRINT-PLAN.md`, 2026-05-26.** See `convex/ai/tools/{layers/pipelines,files,timeline,layers/members,layers/tags,layers/views}.ts` for the implementations.

| # | Tool | Status |
|---|---|---|
| 9 | `move_lead_status` (mirror `move_deal_stage`) | ✅ Shipped — Stage 4. Atomic; in `pipelines` layer. ForAI: leads `updateForAI`. |
| 10 | `update_pipeline_stage` / `remove_pipeline_stage` / `reorder_pipeline_stages` / `set_default_pipeline` | ✅ Shipped — Stage 4. All twoStep, in `pipelines` layer. `update_pipeline_stage` propose surfaces deals-affected count. ForAI twins: pipelines `updateStageForAI`, `removeStageForAI`, `reorderStagesForAI`, `setDefaultStageForAI`, `updateForAI`, `deletePipelineForAI`. |
| 11 | `update_tag` / `update_saved_view` | ✅ Shipped — Stage 4. Both atomic. NEW public `tags/mutations:update` (was missing entirely). ForAI: tags `updateForAI`, savedViews `updateForAI`. |
| 12 | `list_files` / `update_file_tags` / `remove_file` | ✅ Shipped — Stage 4. New `files` tool layer. `list_files` routes by personCode/dealCode/companyCode/raw scope; `update_file_tags` + `remove_file` are twoStep. ForAI: files `listByScopeForAI`, `listForEntityForAI`, `updateTagsForAI`, `removeForAI`. |
| 13 | `reopen_deal` | ✅ Shipped — Stage 4. NEW public `deals/mutations:reopen` (was missing). twoStep; clears wonAt/lostAt, restores to default-or-first-non-final stage, rebalances org stats. ForAI: deals `reopenForAI`. |
| 14 | `list_org_timeline` | ✅ Shipped — Stage 4. New `timeline` tool layer. ForAI: timeline `getForOrgForAI`. |
| 15 | Resend invitation, custom-role CRUD | ✅ Shipped — Stage 4. NEW public `invitations/mutations:resend` (regenerates token + extends expiry). Custom-role CRUD added to existing `members` layer. ForAI: invitations `resendForAI`; orgRoles `createForAI` / `updateForAI` / `removeForAI` / `listForAI`. |

### P3 — nice-to-have

**🟡 Partial — P3 row 17 (notifications) shipped Stage 4; row 16 (get_briefing / refresh_briefing) shipped Stage 7. Rows 18/19 deferred to backlog or already covered.**

| # | Tool | Status |
|---|---|---|
| 16 | `get_briefing` / `refresh_briefing` | ✅ Shipped — Stage 7. New `analytics` tool layer. `get_briefing` reads `ai/briefingsPublic:todayForUser` or `:thisWeekForOrg` via ForAI twins. `refresh_briefing` wraps `refreshNow` with the existing 5/min rate limit. ForAI twins `todayForUserForAI` / `thisWeekForOrgForAI` / `refreshNowForAI`. |
| 17 | `list_notifications` / `mark_notification_read` | ✅ Shipped — Stage 4 (folded in). New `notifications` tool layer. ForAI: notifications `listMineForAI` (org-scoped per-user index) + `markReadForAI` (idempotent + cross-tenant safe). |
| 18 | `set_default_note_category` / `set_default_pipeline` | ⬜ `set_default_pipeline` shipped Stage 4 (in `pipelines` layer). `set_default_note_category` deferred to Phase backlog (low traffic). |
| 19 | `update_saved_view` | ✅ Shipped — Stage 4 (already covered by row 11 above). |

### 🔒 Out-of-scope for AI (by-design)

- Billing tier changes, checkout, portal — admin-only UI flow
- GDPR export / account deletion — high-risk, UI-only
- Migrations + crons — internal-only
- File upload — needs a UI file picker; AI works on already-uploaded files via `analyze_file`

---

## 17 — TESTING / EDGE-CASE COVERAGE NOTES

Where each tool's edge cases ARE covered by tests vs. where they aren't:

| Test file | What it covers |
|---|---|
| `convex/ai/agentScorer.test.ts` (931 lines) | End-to-end agent scenarios: clarify-then-create, multi-turn lead → contact, schema introspection, dedup-on-create, Zod-error recovery |
| `convex/ai/internal.test.ts` (208 lines, 14 tests, 2026-05-24) | Per-entity rebuild summarisers — lead/contact/deal/company variants |
| `convex/ai/personaContext.test.ts` | Persona memory cap enforcement |
| `convex/ai/suggestions.test.ts` | Suggestion heuristics |
| `convex/ai/toolRegistry.test.ts` | Tool registration + filter correctness |
| `convex/ai/orchestrator/orgSchemaContext.test.ts` | Schema-context loader |
| `convex/ai/tools/_shared.coerceInt.test.ts` | Coerce helper edge cases |
| `convex/_shared/synonyms.test.ts` | Synonym matching for find-by-name |
| `convex/_shared/aiEntityPatch.test.ts` | Per-record AI patch path |
| `convex/crm-hardening.test.ts` (886 lines) | Drag rate-limits, single-write invariant, RBAC enforcement, **NOT** message-send through AI (no test exists because no tool exists) |

**Edge cases — coverage status (post-Stage-10 rollup, 2026-05-26):**

- ✅ Messaging path through AI — covered by Stage 2's `convex/ai/tools/messaging/messaging.test.ts` (8 ForAI contract tests).
- ✅ `delete_*` chains — covered by Stage 3's `convex/ai/tools/stage3/stage3.test.ts` (12 tests; universal `delete_entity` routes to per-entity `softDeleteForAI` for lead/contact/company/deal + `removeForAI` for note/reminder).
- ⬜ Tool-call cost-overrun behaviour beyond telemetry roll-up — partially covered by Stage 9's `enforceCreativeQuota` (5/min/user + 50/day/user soft cap on creative-layer tools). Cost-overrun guard for the always-on layer remains in `Future-Enhancements.md` backlog.
- ✅ `enrich_record` provider failure recovery — Stage 10's `mapEnrichmentError` (`convex/_shared/enrichmentErrorMap.ts`) recognises 401 / 403 / 404 / 429 / 500 / timeout / DNS / network / not-configured / invalid-response and emits `{code, short, message, retryable, fallThrough, hint}`. Wired into all 4 provider trace pushes in `convex/ai/quarantined/enrichmentProviders.ts`. 8 contract tests at `convex/stage10.test.ts`.
- ✅ `analyze_file` adversarial sanitisation — Stage 10's `sanitiseExtractedText` + `sanitiseExtractedFields` (`convex/_shared/sanitiseExtractedText.ts`) strips `<script>` / on*= / `javascript:` / `data:text/html`, redacts dangerous markdown link targets, caps length, AND is idempotent. Wired into `convex/ai/quarantined/fileAnalyzer.ts` BEFORE the structured record is persisted. 12 contract tests at `convex/stage10.test.ts`.
- ✅ CSV encoding heuristics — Stage 10's `decodeCsvBytes` + `detectEncoding` + `describeEncodingWarning` (`convex/_shared/csvEncodingDetect.ts`) handle UTF-8 BOM, UTF-16-LE/BE BOM, Latin-1 / Windows-1252 fallback. Wired into `convex/ai/quarantined/csvParser.ts` replacing `blob.text()`. 9 contract tests at `convex/stage10.test.ts`.
- ✅ Bulk-progress row-level diff — Stage 10's `summariseBulkResults` (`convex/_shared/bulkProgress.ts`) replaces the silent `{succeeded, failed}` counter on `commit_bulk_update_entities` + `commit_bulk_close_deals` with a `ToolSummary` envelope (per-row failure table + retry chips per Constraint F). 5 contract tests at `convex/stage10.test.ts`.
- ⬜ Bulk-progress STREAMING (chunked patches mid-flight) — explicitly deferred to `Future-Enhancements.md` backlog. Stage 10 ships row-level diff (the meaningful UX win); mid-flight chunking requires changes to the `streamLoop` layer + per-batch DB patches and is incremental polish.

---

## 18 — APPENDIX: 78 REGISTERED AI TOOLS (the actual list the model sees)

Grouped by layer in registration order:

**always (≈33):**
expand_tools · set_context_var · ask_user_choice · ask_user_input ·
search_crm · get_entity_detail · get_dashboard_summary ·
list_entity_fields · list_pipelines · list_my_permissions · list_active_layers · list_followups · list_followups_for_person · list_tags · list_categories · list_members · list_saved_views · list_field_options · list_widgets ·
list_next_actions · list_stale_records · list_pipeline_anomalies ·
create_lead · commit_create_lead · create_contact · commit_create_contact · create_company · commit_create_company · create_deal · commit_create_deal · convert_lead · commit_convert_lead · revert_contact · commit_revert_contact ·
add_note · create_reminder · create_followup · complete_reminder · complete_followup_by_code · cancel_followup_by_code ·
update_user_context_facts · update_org_context_facts ·
update_entity · commit_update_entity · web_search

**pipelines (7):** move_deal_stage · close_deal · commit_close_deal · create_pipeline · commit_create_pipeline · add_pipeline_stage · commit_add_pipeline_stage

**fields (6):** create_field · commit_create_field · update_field · commit_update_field · remove_field · commit_remove_field

**tags (5):** create_tag · attach_tag · detach_tag · delete_tag · commit_delete_tag

**views (5):** create_saved_view · commit_create_saved_view · pin_saved_view · delete_saved_view · commit_delete_saved_view

**categories (5):** create_note_category · rename_note_category · archive_note_category · commit_archive_note_category · reorder_note_categories

**members (8):** invite_member · commit_invite_member · cancel_invitation · commit_cancel_invitation · change_member_role · commit_change_member_role · remove_member · commit_remove_member

**settings (8):** update_org_settings · commit_update_org_settings · rename_entity_labels · commit_rename_entity_labels · update_org_identity · commit_update_org_identity · update_dashboard_layout · commit_update_dashboard_layout

**bulk (4):** bulk_update_entities · commit_bulk_update_entities · bulk_close_deals · commit_bulk_close_deals

**templates (5):** list_templates · apply_template · commit_apply_template · clear_mock_data · commit_clear_mock_data

**data (3):** view_trash · restore_entity · commit_restore_entity

**csvImport (2):** import_csv · commit_import_csv

**enrichment (2):** enrich_record · commit_enrich_record

**fileAnalysis (2):** analyze_file · commit_analyze_file

---

**Companion docs:**

- `DASHBOARD-AUDIT.md` — dashboard widget gaps + the empty-hide bug
- `AI-AGENT-CAPABILITY-AUDIT.md` — senior-CRM-specialist evaluation (proactive, autonomous, suggestions)

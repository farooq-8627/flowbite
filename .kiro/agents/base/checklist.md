# Build Checklists

> Phase-by-phase. Check off as you complete items. OVERWRITE this file — do not append.
> Format: `[x]` = done, `[ ]` = pending, `[-]` = in progress
> **Phase 0 is COMPLETE. Phases 1+ are pending in order.**

---

## Phase 0 — Foundation ✅ COMPLETE (102 tests passing)

All done. Items collapsed. Status: `pnpm typecheck` 0 errors | `pnpm test` 102 passing | `pnpm build` 0 errors.

Key completed: Auth (Password + GitHub + Google) · Full RBAC (102 tests) · Invitations module · All 8 production quality gaps resolved · 16 shadcn components · PostHog + Sentry · `PermissionGate` + `useOrgPermission` hook · `features/_registry.ts` · Architecture setup (MODULE.md files, theme presets, preferences library, Zustand store, 4 theme presets).

Remaining small items from Phase 0 (do before Phase 1 begins):
- [-] Fix `pnpm lint-check` Biome v2 baseline (`biome lint --check .` invalid for installed Biome v2)
- [ ] Authenticated user → org dashboard redirect (blocked on shell being built — Phase 1 unblocks this)

---

## Phase 1 — Shell + Onboarding ✅ COMPLETE

> **Sellable Gate: v0.1 — Demo-ready.**
> `pnpm tsc --noEmit` → 0 errors | `npx vitest run --config vitest.convex.config.ts` → 102 passing

### Shell + Navigation ✅
- [x] `core/shell/config/navigation.ts` — NAV_GROUPS, buildNavigation(), resolveModuleType()
- [x] `app/[locale]/[orgSlug]/dashboard/layout.tsx` — org resolver + DashboardLayout
- [x] `core/shell/layouts/DashboardLayout.tsx` — server component, reads cookies
- [x] `core/shell/layouts/DashboardLayoutClient.tsx` — 3-pane, resizable AI panel (280-600px)
- [x] `core/shell/components/sidebar/app-sidebar.tsx` — dynamic nav from buildNavigation()
- [x] `core/shell/components/TopNav.tsx` — Search + Bell + Theme + AI toggle
- [x] `core/shell/components/sidebar/nav-user.tsx` — real Convex auth, h-10 trigger
- [x] `core/shell/components/sidebar/workspace-switcher.tsx` — h-10 trigger, consistent dropdown
- [x] `core/shell/components/ModuleGuard.tsx` — feature flag gating
- [x] `core/shell/hooks/useModuleEnabled.ts` — calls featureFlags.queries.getForOrg
- [x] `core/shell/hooks/useViewToggle.ts` — URL-synced view toggle
- [x] `app/[locale]/[orgSlug]/dashboard/page.tsx` — Get Started card + metric cards + recent activity
- [x] Dead code removed: nav-main, nav-documents, nav-secondary, account-switcher, sidebar-support-card, navigation/sidebar/, data/users.ts

### Onboarding Flow ✅
- [x] `app/[locale]/onboarding/page.tsx` — 3-step wizard
- [x] Step 1: Org name + slug
- [x] Step 2: Industry picker → seeds default pipeline (idempotent)
- [x] Step 3: Complete → `users.onboardingCompleted = true` → redirect to dashboard
- [x] `core/onboarding/components/OnboardingGuard.tsx` — redirects incomplete users

### RBAC Dynamic Roles ✅
- [x] `orgRoles` table in schema
- [x] `orgMembers.roleId` field (FK to orgRoles) — dual field migration-safe
- [x] Seed 3 system roles on org creation (Owner, Admin, Member)
- [x] `requirePermission()` DB-backed with legacy fallback
- [x] `invitations/mutations.ts` accept — assigns default roleId
- [x] `useOrgPermission` hook — loads from DB via getMyMembership + orgRoles.get
- [x] `PermissionGate` — accepts orgId prop
- [x] 102 tests passing (vitest.convex.config.ts)

### Schema Additions (v2/v3 Architecture) ✅
- [x] `entityCodeCounters` table — per-org, per-type atomic counters
- [x] `orbitLinks` table — lateral connections between entities
- [x] `platformTemplates` table — industry templates in DB
- [x] `pipelines` table — deal pipelines with inline stages
- [x] `featureFlags` table — kill-switch / rollout flags

### Record Code System ✅
- [x] `convex/_shared/recordCodes.ts` — generatePersonCode(), generateEntityCode()
- [x] `orgs.settings.codePrefixes` field in schema
- [x] `platformOrgId` generated on org creation (ORB-XXXXX format)

### Notifications ✅
- [x] `convex/notifications/helpers.ts` — sendNotification() helper
- [x] `convex/notifications/queries.ts` — listMine, getSummary
- [x] `convex/notifications/mutations.ts` — markRead, markAllRead

### Feature Flags ✅
- [x] `convex/featureFlags/queries.ts` — getForOrg
- [x] `core/shell/hooks/useModuleEnabled.ts` — calls real query

### Auth Flows ✅
- [x] SignIn, SignUp, ForgotPassword, ResetPassword, VerifyEmail, Join, Join/[token]
- [x] AuthShellLayout

### 🧪 Testing ✅
- [x] 102 unit tests passing (convex-test)
- [x] `vitest.convex.config.ts` — dedicated config for convex tests
- [x] `pnpm tsc --noEmit` — 0 errors

### ✅ Phase 1 Gate — COMPLETE
- [x] `pnpm tsc --noEmit` — 0 errors
- [x] `npx vitest run --config vitest.convex.config.ts` — 102 passing
- [x] Sign up → org created → 3-step onboarding → dashboard renders ✅
- [x] Invite flow: owner invites member → member accepts → roleId assigned ✅
- [x] RBAC: requirePermission() loads from DB ✅
- [x] Record codes: generatePersonCode/generateEntityCode ready for Phase 2 ✅
- [x] Notifications: listMine/getSummary/markRead/markAllRead ready ✅
- [x] Feature flags: getForOrg wired to useModuleEnabled ✅

### ⬜ Deferred to Phase 3+
- [ ] Route group restructure `(private)/` — current middleware.ts works, restructure with landing page
- [ ] `platformOrgIdCounter` table — sequential ORB-001 (current ORB-XXXXX works)
- [ ] Record code prefix rename background job — needed for Settings → Record Codes page
- [ ] PostHog events: user_signed_up, onboarding_completed, org_created
- [ ] E2E tests (Playwright)

> **Sellable Gate: v0.1 — Demo-ready. Investors + early waitlist can sign up.**
> Module rules: `core/shell/MODULE.md` | `core/onboarding/MODULE.md`

### Shell + Navigation
- [ ] `core/shell/config/navigation.ts`
- [ ] `app/[locale]/dashboard/layout.tsx` (auth + onboarding guard)
- [ ] `app/[locale]/dashboard/[orgSlug]/layout.tsx` (org resolver + membership check)
- [ ] `core/shell/layouts/DashboardLayout.tsx`
- [ ] `core/shell/components/AppSidebar.tsx`
- [ ] `core/shell/components/TopNav.tsx` + `UserMenu.tsx`
- [ ] `core/shell/components/NotificationBell.tsx`
- [ ] `core/shell/components/WorkspaceSwitcher.tsx`
- [ ] `core/shell/components/ModuleGuard.tsx` + `useModuleEnabled.ts`
- [ ] `core/shell/components/PageShell.tsx` (base page scaffold)
- [ ] `core/shell/components/EntityListPage.tsx` (list+board scaffold)
- [ ] `core/shell/components/EntityDetailPage.tsx` (detail scaffold)
- [ ] `core/shell/hooks/useViewToggle.ts`
- [ ] `app/[locale]/dashboard/[orgSlug]/page.tsx` (Quick Win Dashboard)
- [ ] "Get Started" checklist card on dashboard (dismissible)
- [ ] Wire authenticated-user → `/onboarding` if `!users.onboardingCompleted`
- [ ] `app/[locale]/pricing/page.tsx` (public pricing page)

### Onboarding Flow (3 steps — fast to dashboard)
- [ ] `app/[locale]/onboarding/` route + layout (3-step wizard)
- [ ] Step 1: Org name + your name
- [ ] Step 2: Industry picker → seeds DEFAULT pipeline ONLY (no field templates)
- [ ] Step 3: Complete → set `users.onboardingCompleted = true` → redirect to dashboard

### RBAC Dynamic Roles Refactor (approved)
- [ ] Add `orgRoles` table to `convex/schema.ts`
- [ ] Change `orgMembers.role` (string) → `orgMembers.roleId` (ref to `orgRoles`)
- [ ] Add `DEFAULT_SYSTEM_ROLES` + `PERMISSION_CATEGORIES` to `constants.ts`
- [ ] Seed 3 default `orgRoles` on org creation (Owner, Admin, Member)
- [ ] Refactor `requireRole()` → `requirePermission()` in `orgs/helpers.ts`
- [ ] Update `invitations/mutations.ts` — accept uses `roleId`
- [ ] Update `useOrgPermission` hook — load role from DB
- [ ] Update all 102 tests with new role system
- [ ] Role management UI — Settings → Roles page

### 🧪 Testing (Phase 1)
- [ ] E2E — Sign up → onboarding wizard (3 steps) → land on dashboard with "Get Started" card
- [ ] E2E — Unauthenticated user hits `/dashboard/*` → redirected to `/signin`
- [ ] E2E — Owner invites member → member accepts → sees org workspace
- [ ] E2E — Org switcher: user with 2 orgs switches between them correctly
- [ ] Unit tests: invitation flow (already done Phase 0 — verify still passing)

### 🔒 Security Verification (Phase 1)
- [ ] Unauthenticated requests to `/dashboard/*` always redirect to signin (middleware test)
- [ ] Org member cannot access another org's `[orgSlug]` URL (403 or redirect)
- [ ] Onboarding route accessible only to auth'd + onboarding-incomplete users
- [ ] Pricing page is public (no auth required — verify no token leak in page props)

### 📊 Monitoring (Phase 1)
- [ ] PostHog: `user_signed_up`, `onboarding_started`, `onboarding_completed`, `org_created` events
- [ ] PostHog: `pricing_page_viewed`, `plan_selected` events
- [ ] Sentry: auth errors, onboarding step failures captured

### ✅ Phase 1 Gate — Shippable: v0.1 Demo-Ready
- [ ] `pnpm typecheck` — 0 errors
- [ ] `pnpm build` — 0 errors
- [ ] `pnpm test` — all existing 102+ passing
- [ ] `pnpm lint-check` — 0 errors in our code
- [ ] Sign up → org created → 3-step onboarding → dashboard renders with "Get Started" card ✅
- [ ] Pricing page at `/pricing` renders (public, no auth) ✅
- [ ] Invite flow: owner invites member → member accepts → sees org workspace ✅
- [ ] RTL: Arabic `<html dir="rtl">` switches layout correctly ✅

---

## Phase 2 — CRM Core + Dynamic Fields + Pipelines + Billing (PENDING)

> **Sellable Gate: v1.0 — First paying product. Real CRM. First revenue.**
> Module rules: `core/entities/MODULE.md` | `core/kanban/MODULE.md` | `core/datatable/MODULE.md` | `core/csv-import/MODULE.md`

### Backend Pre-work (do first — blocker for Phase 2 mutations)
- [ ] Update `PLAN_FEATURES` in `convex/_shared/constants.ts` — add CRM plan features (`crm.basic`, `crm.full`, `ai.basic`, `ai.full`)
- [ ] Update `FEATURE_FLAGS` map with new CRM + AI flags
- [ ] Verify `requirePlanFeature()` works with new keys

### Schema Additions (do with Phase 2 tables — confirmed Strategy V2)
- [ ] `aiContext: v.optional(v.any())` on `leads`, `contacts`, `deals`
- [ ] `quickCode: v.optional(v.string())` on `leads`, `contacts` + `by_org_and_quickcode` index
- [ ] `showInStages: v.optional(v.array(v.string()))` on `fieldDefinitions`
- [ ] `entityDocuments` new table + `by_entity` index
- [ ] `"whatsapp"` added to `source` enum on `leads`

### Infrastructure Libraries
- [ ] Install `@dnd-kit/core` + `@dnd-kit/sortable` + `@dnd-kit/utilities`
- [ ] Install `@tanstack/react-table`
- [ ] `core/kanban/components/KanbanBoard.tsx` + `KanbanColumn.tsx` + `KanbanCard.tsx`
- [ ] `core/kanban/hooks/usePipelineBoard.ts`
- [ ] `core/datatable/DataTable.tsx` + `DataTableToolbar.tsx`
- [ ] `core/datatable/hooks/useColumnVisibility.ts`

### Pipelines Infrastructure (CRM-00 — DO FIRST)
- [ ] `pipelines` table in `convex/schema.ts`
- [ ] `convex/pipelines/queries.ts` + `mutations.ts`
- [ ] `DEFAULT_PIPELINE_STAGES` in `convex/_shared/constants.ts`
- [ ] Seed default pipelines on org creation in `orgs/mutations.ts`
- [ ] Pipeline management admin UI
- [ ] Stage-aware field query: `fieldDefinitions` filtered by `showInStages` includes current stageId OR is empty

### Dynamic Fields (CRM-01)
- [ ] `fieldDefinitions` + `fieldValues` tables in `convex/schema.ts` (includes `showInStages`)
- [ ] Field builder admin UI (sensitive toggle + group picker + stage picker for `showInStages`)
- [ ] Dynamic form renderer (renders only stage-relevant fields — backend-filtered)
- [ ] `entityDocuments` table + Documents tab on Lead/Contact/Deal detail pages
- [ ] `aiContext` viewer widget (renders JSON as smart pills + "Create Field from Fact" button)

### CRM Entities
- [ ] `leads` table — `pipelineId`, `currentStageId`, `stageEnteredAt`, `displayName`, `email`, `aiContext`, `quickCode`
- [ ] `contacts` table — `displayName`, `companyId`, `aiContext`, `quickCode`
- [ ] `companies` table — B2B first-class entity
- [ ] `deals` table — `pipelineId`, `currentStageId`, `stageEnteredAt`, `title`, `companyId`, `aiContext`
- [ ] Pipeline on DEALS ONLY — leads use simple status (new/qualified/converted)
- [ ] `reminders` table
- [ ] `notes` table — `authorType: "user"|"ai"`, `isPinned`, `isInternal`
- [ ] Dedup engine — email + phone normalization + fuzzy name matching + auto-merge with undo
- [ ] `savedViews` table — shareable across org (`scope: "user"|"org"`)
- [ ] `tags` + `entityTags` tables — org-wide consistency
- [ ] quickCode auto-generation on lead/contact create (format: `AHM-001`)

### CRM UI
- [ ] Lead list view + create/edit form (simple status — no kanban for leads)
- [ ] Contact list + detail view (tabs: Overview, Activity, Deals, Notes, Documents)
- [ ] Company list + detail view
- [ ] Deal pipeline kanban view — dynamic stages from `pipelines` table
- [ ] Activity log per entity (Unified Timeline — `activityLogs` + `notes`)
- [ ] CSV import with field mapping UI (AI-assisted + Bayut/PF format support)
- [ ] Search bar across leads/contacts/deals
- [ ] Bulk actions — select-all + bulk update/tag/assign/delete
- [ ] Cmd+K command palette
- [ ] Export layer: CSV from any filtered DataTable view (EXPORT-01, EXPORT-02)

### Stripe Billing
- [ ] Install `stripe` + `@stripe/stripe-js`
- [ ] Stripe Checkout session endpoint (`/api/billing/checkout`)
- [ ] Stripe webhook handler → update `orgs.plan` in Convex (signature verified)
- [ ] Plan enforcement: `requirePlanFeature()` gates CRM features

### 🧪 Testing (Phase 2)
- [ ] Unit tests: `leads`, `contacts`, `deals`, `pipelines`, `fieldDefinitions` mutations — RBAC edge cases
- [ ] Unit tests: `notes` — `isInternal` hidden from viewer, `isPinned` toggle
- [ ] Unit tests: `requirePlanFeature()` blocks free tier from `crm.full` features
- [ ] Unit tests: pipeline stage validation — invalid stageId rejected
- [ ] E2E — Create lead → qualify → convert to contact → attach deal → move to Won
- [ ] E2E — Deal kanban: drag card between stages → `currentStageId` + `stageEnteredAt` updated
- [ ] E2E — Stripe checkout → return → `orgs.plan` updated → features unlock
- [ ] E2E — Member role cannot delete contact (PermissionGate blocks UI + mutation rejects)
- [ ] E2E — Import CSV (5 contacts) → all appear in contacts list
- [ ] Cross-org isolation: org A member cannot query org B leads

### 🔒 Security Verification (Phase 2)
- [ ] All mutations call `requireRole()` BEFORE any DB read
- [ ] Sensitive `fieldValues` not returned for viewer role (`sensitive: true` filtered)
- [ ] Plan gate tested: free org cannot access `crm.full` features via direct API call
- [ ] Stripe webhook: signature verified before DB update
- [ ] No `userId`/`orgId` accepted as auth args in any new mutation

### 📊 Monitoring (Phase 2)
- [ ] PostHog: `lead_created`, `contact_created`, `deal_created`, `deal_stage_changed`, `deal_won`
- [ ] PostHog: `csv_import_completed`, `plan_upgraded`, `note_created`
- [ ] Sentry: Stripe webhook failures, CSV import errors, plan enforcement failures

### ✅ Phase 2 Gate — Shippable: v1.0 First Paying Product
- [ ] `pnpm typecheck` — 0 errors | `pnpm build` — 0 errors | `pnpm test` — 130+ passing
- [ ] Full CRM flow: lead → contact → deal → Won ✅
- [ ] Stripe checkout → plan upgrades → paid features unlock ✅
- [ ] CSV import (5 rows) → contacts visible in list ✅
- [ ] Viewer role: cannot edit or delete (UI gate + mutation rejection both verified) ✅
- [ ] Mobile (390px): lead list, deal kanban, contact detail — all render correctly ✅

---

## Phase 3 — AI Assistant + WhatsApp Bridge (Ship Together)

> **Sellable Gate: v2.0 — "Stop navigating your CRM. Just talk to it."**
> WhatsApp voice bridge ships in Phase 3 WITH AI — not Phase 5.
> Module rules: `core/ai/MODULE.md`

### AI Infrastructure
- [ ] Install `ai` + `@ai-sdk/anthropic` packages
- [ ] Add `ANTHROPIC_API_KEY` env to Convex deployment
- [ ] `convex/ai/processChat.ts` — internalAction, "use node", ToolLoopAgent
- [ ] `app/api/ai/chat/route.ts` — thin streaming proxy (auth → Convex → stream)
- [ ] `convex/ai/systemPrompt.ts` — dynamic prompt builder (org, role, field defs, today, pipeline stages)
- [ ] `convex/ai/tools/` — 11 core tools (search, create, update, detail, notes, reminders, analytics, email, bulkUpdate, setupWorkspace, send_chat_message)
- [ ] Role-scoped tool availability matrix (owner/admin/member/client)
- [ ] Each tool logs with `actorType: "ai"` in activityLogs

### AI Frontend
- [ ] `core/ai/components/ChatSheet.tsx` — resizable right-side drawer (~40% width)
- [ ] `core/ai/components/ChatMessage.tsx` + `ChatToolCall.tsx` + `ChatConfirmation.tsx`
- [ ] `core/ai/stores/chatStore.ts` — zustand (isOpen, pendingMessage, currentPageContext)
- [ ] `core/ai/hooks/useAIChat.ts` — wrapper around useChat() with auth + page context
- [ ] Wire into DashboardLayout (persistent across navigation)
- [ ] Cmd+K toggle + floating button when panel closed
- [ ] Disambiguation UX + Confirmation UX for destructive actions
- [ ] `aiConversations` + `aiMessages` Convex tables (persist history per orgId + userId)

### WhatsApp Voice Bridge (ships with AI — Phase 3)
- [ ] `app/api/channels/whatsapp/route.ts` — inbound webhook (validates 360dialog signature)
- [ ] Trigger.dev job: `whatsapp-voice-processor` (Whisper → Claude → fieldValues + aiContext → Convex)
- [ ] Trigger.dev job: `whatsapp-document-processor` (OCR → Claude Vision → entityDocuments)
- [ ] `convex/ai/tools/whatsapp/resolveContact.ts` — 4-layer contact resolution
- [ ] WhatsApp reply confirmation (bot summarizes what was updated, sent back to agent)
- [ ] Whisper Mode: `suggestClientReply()` AI tool
- [ ] `channelAccounts` Convex table + 360dialog credentials storage
- [ ] quickCode auto-generation wired to lead/contact `create` mutations

### Dubai RE Template (ships with Phase 3)
- [ ] `features/industry-templates/config/dubai-real-estate.ts` — seed config
- [ ] Pipeline stages: New Inquiry → Viewing → Offer/MOU → Form F → Ejari → Handover → Active Tenancy
- [ ] fieldDefinitions: `budget_aed`, `property_type`, `bedrooms`, `location_preference`, `rera_number`, `lease_expiry_date`
- [ ] 95-Day Rent Alert: Trigger.dev scheduled job (`ejari-renewal-check`, daily 8am Gulf time)

### 🧪 Testing + 🔒 Security + 📊 Monitoring (Phase 3)
- [ ] Unit tests: tool registry — role-filtered correctly
- [ ] Unit tests: system prompt — no PII, role-specific instructions
- [ ] E2E — AI panel: "show me my top deals" → deal cards rendered
- [ ] E2E — "create a lead named Sarah Johnson" → lead appears
- [ ] E2E — Confirmation flow: "move deal to Won" → confirm card → stage updated
- [ ] E2E — WhatsApp voice note → contact updated → manager sees it on Kanban in real time
- [ ] API route: userId + orgId from server session (NEVER from request body)
- [ ] Tool definitions filtered by role BEFORE passing to Claude
- [ ] No raw user input in system prompt (R51)
- [ ] Rate limiting: max 20 requests/minute per user

### ✅ Phase 3 Gate — Shippable: v2.0 AI-Powered CRM + WhatsApp Bridge
- [ ] `pnpm typecheck` — 0 errors | `pnpm build` — 0 errors | `pnpm test` — 160+ passing
- [ ] Demo: "show me my top deals" → deal cards in AI panel ✅
- [ ] Demo: "create a lead for Sarah at Acme" → lead created ✅
- [ ] Demo: viewer sees only read tools — no destructive actions ✅
- [ ] **Demo: agent sends WhatsApp voice note → CRM updates in real time → manager sees on Kanban** ✅
- [ ] Streaming latency: first token < 2 seconds ✅

---

## Phases 4–9 — Future Phases (PENDING)

> Detailed checklists for future phases are tracked in `todos.md`.
> Start each phase by reading the relevant MODULE.md files first.

| Phase | Name | Gate | Module |
|---|---|---|---|
| 4 | Built-in Communications | 15 clients | `features/` (conversations, messages) |
| 5 | External Channels (WhatsApp Inbox + Email) | 25 clients | `features/integrations/` — NOTE: WhatsApp VOICE BRIDGE is Phase 3. Phase 5 = outbound inbox. |
| 6 | Integration Bridges | 35 clients | `features/integrations/MODULE.md` |
| 7 | AI Automation | 40 clients | `features/ai-automation/MODULE.md` |
| 8 | Project Management | Enterprise | `features/project-management/MODULE.md` |
| 9 | Client Portal | Enterprise | `features/client-portal/MODULE.md` |

---

## Gulf Track — Parallel Thread (All Phases)

> Threads through every phase. Gulf-native from day one.

- [ ] Phase 1: `dir="rtl"` on Arabic `<html>`, `messages/ar.json` bootstrapped, `labelAr` in nav config
- [ ] Phase 2: `labelAr` on CRM form labels, RTL-safe inputs + kanban, Gulf phone validation, Arabic number formatting
- [ ] Phase 3: AI responds in Arabic when `locale = ar`. WhatsApp voice bridge (360dialog). Dubai RE template seeded.
- [ ] Phase 3: 95-Day Rent Alert (RERA compliance) — Trigger.dev daily cron
- [ ] Phase 5: PDPL compliance (Saudi data regulation)
- [ ] Cross-phase: Direction-safe CSS audit, mobile RTL testing (390px)

# Orbitly — Deep Plan Spec (Phases 0.5–3)

> ⚠️ **READ-ONLY SPEC** — Do NOT update this file during sessions. It is a reference spec, not a status tracker.
> Use `context.md` for build state. Use `todos.md` for active tasks. Use `checklist.md` for phase progress.
> **When to read this**: Only when a MODULE.md doesn't have enough detail for the specific component you're building.
> **How to use**: Jump to the specific module section. Do NOT read the whole file.
>
> **Status legend:**
> - `⬜ NOT STARTED` — not yet planned
> - `🟡 IN PROGRESS` — partially planned
> - `🟢 COMPLETE` — fully specified, build-ready

>
> **Last Updated**: Session 23 — Solo-dev architecture principles locked. 7 maintainability rules documented. White-label deployment model defined. Cross-org AI for platform_owner designed (aggregated stats, no customer PII). Feature-based colocation confirmed as the pattern.
> **VERDICT: BASE PLAN IS COMPLETE. APPROVED FOR CODE ARCHITECTURE PLANNING.**

---

## Module Index (Phase 0.5–3)

### Phase 0.5 — Landing Page + Waitlist

| # | Module | Status | Description |
|---|---|---|---|
| 0 | [Landing Page & Waitlist](#0-landing-page--waitlist) | 🟢 | Pre-launch page, waitlist capture, product pitch |

### Phase 1 — Shell + Onboarding

| # | Module | Status | Description |
|---|---|---|---|
| 1 | [Roles & RBAC](#1-roles--rbac) | 🟢 | Dynamic roles, permission picker, AI role creation |
| 2 | [Org Rules & Multi-tenancy](#2-org-rules--multi-tenancy) | 🟢 | Feature-based tiers, dynamic platformTiers, entity renaming, lifecycle states |
| 3 | [Dashboard Shell & Layout](#3-dashboard-shell--layout) | 🟢 | Shadboard integration, 3-pane responsive layout, AI side-panel |
| 4 | [Navigation & Module System](#4-navigation--module-system) | 🟢 | Nav items, icons, module guards, plan gating |
| 5 | [Dashboard Home Page](#5-dashboard-home-page) | 🟢 | Industry-specific metric cards, AI morning briefing, Get Started card |
| 6 | [Onboarding Flow](#6-onboarding-flow) | 🟢 | 3-step wizard, industry picker, default templates |
| 7 | [Notifications System](#7-notifications-system) | 🟢 | Bell dropdown, in-app, scalable per industry |
| 8 | [Activity Logs](#8-activity-logs) | 🟢 | All actions logged, permission-scoped, dedicated + per-entity |
| 9 | [Org Management Pages](#9-org-management-pages) | 🟢 | Members, invitations, settings, profile, danger zone |
| 10 | [Pricing Page](#10-pricing-page) | 🟢 | Dynamic tiers, annual/monthly toggle, free trial, platform-owner configurable |
| 11 | [Error & Empty States](#11-error--empty-states) | 🟢 | AI-suggested empty states, shadboard error pages, unified loader |
| 12 | [i18n & RTL Foundation](#12-i18n--rtl-foundation) | 🟢 | English + Arabic + French + German, RTL rules, AI language-aware |
| 13 | [Auth Flow Details](#13-auth-flow-details) | 🟢 | Login v2/Register v2, remember me, soft-delete accounts, 30-day recovery |

### Phase 2 — CRM Core

| # | Module | Status | Description |
|---|---|---|---|
| 14 | [Default Industry Templates](#14-default-industry-templates) | 🟢 | Config-driven + AI-customizable, B2B first, Freelancer second, Productivity third |
| 15 | [Pipelines & Stages](#15-pipelines--stages) | 🟢 | Multi-pipeline, industry-aware stages, drag reorder, staleness per-pipeline |
| 16 | [Dynamic Fields System](#16-dynamic-fields-system) | 🟢 | Field types, groups, required, validation, platform-owner tier limits |
| 17 | [Leads Module](#17-leads-module) | 🟢 | Separate tables with links, List+Board views, AI score, dedup detection |
| 18 | [Contacts Module](#18-contacts-module) | 🟢 | Linked from leads, dedup engine reused, tabbed detail page |
| 19 | [Companies Module](#19-companies-module) | 🟢 | Optional per industry, B2B first-class entity, nav toggle |
| 20 | [Deals Module](#20-deals-module) | 🟢 | Kanban, owner-customizable cards, both weighted+total, owner-named outcomes |
| 21 | [Activity Timeline (Notes + Feed)](#21-activity-timeline-notes--feed) | 🟢 | Unified timeline replaces separate notes/chat, entity-attached text notes |
| 22 | [Reminders & Follow-ups](#22-reminders--follow-ups) | 🟢 | Recurring, all surfaces, AI auto-suggest, role-adjustable |
| 23 | [Tags System](#23-tags-system) | 🟢 | Org-wide tags, filterable, any entity type, unlimited |
| 24 | [Saved Views](#24-saved-views) | 🟢 | Filter presets, sidebar pinning, org-wide, platform-tier limits dynamic |
| 25 | [Bulk Actions](#25-bulk-actions) | 🟢 | All matching rows, Starter+, assign/tag/stage/delete/export |
| 26 | [CSV Import](#26-csv-import) | 🟢 | Full flow, user-choice dedup, configurable limits in tiers, any entity type |
| 27 | [Command Palette](#27-command-palette) | 🟢 | Cmd+K, all tiers (dynamic), keyboard shortcuts, no quick-create |
| 28 | [Unified Timeline](#28-unified-timeline) | 🟢 | All events merged, filters + search, expandable cards |
| 29 | [Billing & Payments](#29-billing--payments) | 🟢 | LemonSqueezy (global) + Razorpay (India UPI), annual discount, dynamic trial |

### Phase 3 — AI Assistant

| # | Module | Status | Description |
|---|---|---|---|
| 30 | [AI Architecture & Security](#30-ai-architecture--security) | 🟢 | Swappable models, task-based routing, 4-layer security |
| 31 | [AI Tool Registry](#31-ai-tool-registry) | 🟢 | Expandable tools, RBAC-gated, confirmation with data preview |
| 32 | [AI Chat UI](#32-ai-chat-ui) | 🟢 | Context-aware, proactive, rich suggestions, conversation switching |
| 33 | [AI Workspace Setup](#33-ai-workspace-setup) | 🟢 | All tiers get setup, limited messages, re-runnable with warning |
| 34 | [AI Conversation History](#34-ai-conversation-history) | 🟢 | Persisted, tier-based retention, searchable, auto-compact, dropdown switcher |

---

## Planning Log

| Date | Module | Session | Key Decisions |
|---|---|---|---|
| 2026-04-21 | 1. Roles & RBAC | 20 | Dynamic roles, `orgRoles` table, GitHub-style permission picker, 3 default system roles, AI role creation tool, platform admin ≠ org owner, 30-day sessions |
| 2026-04-21 | 2. Org Rules | 20 | Feature-based tiers, dynamic `platformTiers`, per-user language, per-user notifications, soft-delete+90-day, entity renaming (Pro+), entity visibility toggle |
| 2026-04-22 | 3. Dashboard Shell | 20 | `next-shadcn-admin-dashboard` + `shadboard` combined. 3-pane layout. Dynamic CSS theming → Convex. |
| 2026-04-24 | 4–34 + Q1–Q10 | 21 | ALL modules answered. Industry templates = config-driven+AI-customizable. Billing = LemonSqueezy+Razorpay. Dedup engine reused for contacts. Separate tables with links. Per-pipeline staleness. Landing page = Phase 0.5. **PLAN APPROVED.** |
| 2026-04-24 | AI Context + Web Scraping + Entity Slots | 22 | Per-user AI DB + global platform context table. AI web scraping via Trigger.dev approved (Reddit, Maps, web → leads). AI boundary rules locked (task-related web search ✅, generic questions ❌). Entity slot system: fixed slots (lead/contact/deal/company/entity5/entity6) + label rename + visibility toggle. No new dynamic DB tables. |
| 2026-04-24 | Solo Architecture + Cross-Org AI | 23 | Feature-based colocation confirmed. 7 maintainability rules locked. White-label model: env vars + platformTiers DB = zero-code customer setup. Cross-org AI for platform_owner: aggregated stats only, no customer PII access. platformAdminTools registry defined. |

---

## 0. Landing Page & Waitlist

**Status**: 🟢 COMPLETE (Approved Session 21)

> **Phase 0.5** — Build BEFORE Phase 1. Capture leads before writing CRM code.

### Decisions

| # | Decision | Outcome |
|---|---|---|
| 0a | UI source | Use existing components from **shadcnstore** + **shadboard** landing page templates. Import components from shadcn libraries. No custom landing page code from scratch. |
| 0b | Waitlist | Required. Email capture form → stored in Convex `waitlist` table → platform_owner can view from admin panel. |
| 0c | Goal | When anyone visits, they instantly understand what they're getting inside the dashboard. |
| 0d | Build mode | Plan content + structure only. No website code written here — reference planning document. |

### Landing Page Structure & Content Plan

#### Section 1 — Hero
- **Headline**: "Stop navigating your CRM. Just talk to it."
- **Sub-headline**: "Orbitly is an AI-native CRM that understands your business. Create leads, move deals, draft follow-ups — just by asking."
- **CTA Buttons**: "Join the Waitlist" (primary) + "See it in action" → scroll to demo
- **Visual**: Short animated demo GIF/video of AI chat panel creating a lead

#### Section 2 — Problem (3 Pain Points)
Show the pain, not features:
- "5 different tabs to track one client." → "One platform. Everything in one place."
- "Manual follow-ups that get missed." → "AI reminds you before things go cold."
- "CRM built for enterprise, not for you." → "Adapts to YOUR industry, not the other way around."

#### Section 3 — How It Works (3 Steps)
Simple numbered steps with icons:
1. **Connect your industry** — Pick your template (B2B Sales, Freelancer, Agency, etc.)
2. **AI sets up your workspace** — AI asks about your workflow and builds it for you
3. **Just talk to it** — "Show me stale deals" / "Create a follow-up" / "Who needs attention today?"

#### Section 4 — Feature Highlights (Cards Grid)
Show 6 key features visually:
- 🤖 AI-Native — "Your entire CRM via conversation"
- 🏭 Industry-Adaptive — "Built for YOUR workflow, not a generic template"
- 📊 Smart Dashboard — "Daily AI briefing. Never miss what matters."
- 🔔 Proactive Reminders — "AI flags stale deals before you forget"
- 👥 Team RBAC — "Every team member sees only what they need"
- 🌐 Multi-language — "Arabic RTL, English, French, German out of the box"

#### Section 5 — Industry Showcase
Show different industries supported (tabs or carousel):
- B2B Sales CRM | Freelancer Client Management | Agency Pipeline | Recruitment Tracker
- Each tab shows: what the dashboard looks like, what AI says in that industry

#### Section 6 — Pricing Preview (Teaser)
Not full pricing — just tiers:
- Free / Starter / Pro / Enterprise
- "Full pricing available at launch"
- CTA: "Join waitlist to get early pricing"

#### Section 7 — Waitlist CTA (Primary Conversion)
- Big email input field
- "Join X others on the waitlist"
- "Early members get 3 months Pro free" (optional incentive)
- Social proof if any

#### Section 8 — FAQ
5–7 most common questions:
- "Is this just another CRM?" → No. AI is the primary interface.
- "Do I need to set everything up?" → AI does it for you.
- "What industries do you support?" → B2B Sales, Freelancer, Agency + more coming
- "Does it work in Arabic?" → Yes, full RTL support
- "When does it launch?" → "Join waitlist to be notified"

#### Section 9 — Footer
- Logo + tagline
- Links: About, Pricing, Privacy, Terms
- Social links

### Waitlist Database Table

```typescript
waitlist: defineTable({
  email: v.string(),
  name: v.optional(v.string()),
  industry: v.optional(v.string()),  // from "What's your industry?" optional field
  referralSource: v.optional(v.string()), // UTM source
  createdAt: v.number(),
})
.index("by_email", ["email"])
.index("by_created", ["createdAt"])
```

---

## 1. Roles & RBAC

**Status**: 🟢 COMPLETE (Approved Session 20)

### Decisions

| # | Decision | Outcome |
|---|---|---|
| 1a | Role system type | **Fully dynamic** — owner creates custom roles with custom permissions |
| 1b | Default roles | 3 system-seeded: **Owner** (all perms), **Admin** (all except billing+role mgmt), **Member** (standard CRM access) |
| 1c | Permission model | **GitHub-style** — grouped permission checkboxes. ~40 permission keys across 9 categories |
| 1d | Record visibility | Full visibility — all org members see all records. Owner can restrict via custom roles |
| 1e | External portals | NOT a role — separate portal. Separate dashboard, nav, data scope. Phase 9. |
| 1f | Platform admin | `platformRole: "platform_admin"` — Farooq. Manages tiers, feature flags, system stats. Cannot see customer data. |
| 1g | Cross-org super admin | No special role. WorkspaceSwitcher handles multi-org. |
| 1h | AI role creation | Phase 3: AI `setupRoles` tool — asks what roles needed → suggests → user approves → created |
| 1i | Quick role templates | "Full Access", "Read Only", "Standard Member", "Custom", "Ask AI" |
| 1j | Auth methods | Google OAuth + Email/Password. Already built. |
| 1k | Session management | 30-day refresh token, 1h access token, monthly hard re-auth |
| 1l | Team invitations | Email + roleId (ref to orgRoles). 48h expiry. |

### `orgRoles` Table

```typescript
orgRoles: defineTable({
  orgId: v.id("orgs"),
  name: v.string(),
  description: v.optional(v.string()),
  permissions: v.array(v.string()),
  isSystem: v.boolean(),
  isDefault: v.boolean(),
  color: v.optional(v.string()),
  createdAt: v.number(),
  updatedAt: v.number(),
})
.index("by_org", ["orgId"])
.index("by_org_and_name", ["orgId", "name"])
```

### Permission Categories (9 groups, ~40 keys)

| Category | Permission Keys |
|---|---|
| CRM — Leads | `leads.view`, `leads.create`, `leads.editOwn`, `leads.editAny`, `leads.delete`, `leads.convert` |
| CRM — Contacts | `contacts.view`, `contacts.create`, `contacts.editOwn`, `contacts.editAny`, `contacts.delete`, `contacts.merge` |
| CRM — Deals | `deals.view`, `deals.viewValues`, `deals.create`, `deals.editOwn`, `deals.editAny`, `deals.delete`, `deals.moveStage`, `deals.close` |
| CRM — Companies | `companies.view`, `companies.create`, `companies.edit`, `companies.delete` |
| Pipeline & Fields | `pipelines.view`, `pipelines.manage`, `fields.view`, `fields.manage`, `tags.manage` |
| Notes & Reminders | `notes.view`, `notes.create`, `notes.viewInternal`, `reminders.manage`, `notes.pin` |
| Data Operations | `data.import`, `data.export`, `data.bulkActions`, `activityLogs.view` |
| Views & Reports | `views.createPersonal`, `views.createOrg`, `reports.view`, `reports.viewTeamPerformance` |
| AI Assistant | `ai.chat`, `ai.createRecords`, `ai.editRecords`, `ai.deleteRecords`, `ai.bulkOps`, `ai.managePipelines`, `ai.workspaceSetup` |
| Organization | `org.viewMembers`, `org.invite`, `org.removeMembers`, `org.changeRoles`, `org.settings`, `org.billing`, `org.manageRoles` |

### Default System Roles (Seeded on Org Creation)

| Role | isSystem | Permissions | Notes |
|---|---|---|---|
| Owner | ✅ | ALL permissions | Cannot be deleted. Only 1 per org |
| Admin | ❌ | All except `org.billing`, `org.manageRoles` | Modifiable by owner |
| Member | ❌ | CRM create/editOwn/view, notes, reminders, AI chat, personal views, import | Default for new invites |

---

## 2. Org Rules & Multi-tenancy

**Status**: 🟢 COMPLETE (Approved Session 20)

### Decisions

| # | Decision | Outcome |
|---|---|---|
| 2a | Pricing model | Feature-based tiers (Free/Starter/Pro/Enterprise) with per-seat pricing |
| 2b | Dynamic tier management | Yes — `platformTiers` table. Platform_admin manages from admin panel. No code rewrites. |
| 2c | Org settings | Timezone, currency, data retention, notification defaults, lead assignment, entity labels (Pro+), theme (Pro+), branding |
| 2d | Language | Per-user. Each user picks from profile settings. |
| 2e | Notifications | Per-user preferences with org-level defaults. Users can override. |
| 2f | Data export | Owner/Admin only. `data.export` permission. |
| 2g | API access | Enterprise-only, Phase 6+. |
| 2h | Lead assignment | Manual (default) or round-robin (Pro+). `orgSettings.leadAssignment` |
| 2i | Data isolation | `orgId` on every row. Shared DB, shared schema. |
| 2j | Deleted orgs | Soft-delete → suggest hard-delete after 90 days. |
| 2k | User leaves org | Create "Unassigned" placeholder → owner decides. |
| 2l | Org lifecycle | `active` → `suspended` (read-only) → `cancelled` (full lockout). Data NEVER auto-deleted. |
| 2m | Suspension grace | Dynamic — configurable by platform_admin. Default 7 days. |
| 2n | Multi-org limits | Tier-dependent in `platformTiers.features.maxOrgs`. Enterprise: unlimited. |
| 2o | Ownership transfer | Owner or Admin can transfer. |
| 2p | Org slug | Unique globally. URL-based. |
| 2q | Custom branding | Pro: logo + accent. Enterprise: full white-label. |

### Entity Labeling — Hardcoded Core + Renamable Labels (Pro+)

```typescript
// orgSettings.entityLabels (Pro+ feature):
{
  lead:    { singular: "Prospect", plural: "Prospects", icon: "🎯" },
  contact: { singular: "Client",   plural: "Clients",   icon: "👤" },
  deal:    { singular: "Project",  plural: "Projects",  icon: "💼" },
  company: { singular: "Agency",   plural: "Agencies",  icon: "🏢" },
}

// Entity visibility toggle (nav toggle only, NOT data deletion):
entityVisibility: {
  lead: true,
  contact: true,
  deal: true,
  company: false,   // Freelancer hides this
}
```

### Pricing Tiers

| Feature | Free | Starter ($12/user/mo) | Pro ($29/user/mo) | Enterprise ($59/user/mo) |
|---|---|---|---|---|
| Members | 2 | 10 | 25 | Unlimited |
| Orgs | 1 | 1 | 3 | Unlimited |
| CRM Core | ✅ | ✅ | ✅ | ✅ |
| Pipelines | 1 | 3 | Unlimited | Unlimited |
| Custom fields | 5 | 20 | Unlimited | Unlimited |
| Custom roles | ❌ | 3 | Unlimited | Unlimited |
| AI Assistant | ❌ | Basic | Pro | Premium |
| AI Workspace Setup | ✅ limited | ✅ limited | ✅ full | ✅ full |
| Comms | ❌ | Internal | Internal + Email | Full (WhatsApp, SMS) |
| Project Management | ❌ | ❌ | ✅ | ✅ |
| Client Portal | ❌ | ❌ | ❌ | ✅ |
| Entity renaming | ❌ | ❌ | ✅ | ✅ |
| Custom branding | ❌ | ❌ | Logo + accent | Full white-label |
| API access | ❌ | ❌ | ❌ | ✅ |
| Activity logs | 7 days | 30 days | 90 days | 1 year |
| AI messages/mo | 0 | 100 | 500 | 2000 |
| Industries | 1 | 2 | 5 | Unlimited |

> **All tier limits are dynamically configurable from the platform_owner admin dashboard.** No hardcoded values in code — everything reads from `platformTiers.features`.

---

## 3. Dashboard Shell & Layout

**Status**: 🟢 COMPLETE (Approved Session 20)

### Decisions

| # | Decision | Outcome |
|---|---|---|
| 3a | Overall Layout | **3-Pane System:** Left Sidebar + Center (Content) + Right Sidebar (AI Chat) |
| 3b | Dynamic Theming | next-shadcn CSS variables → Convex DB. Owners change colors; Orbitly updates instantly. |
| 3c | Sidebar | Collapsible vertical. From `next-shadcn-admin-dashboard`. Icon tooltips when closed. |
| 3d | TopNav Header | Breadcrumbs, Global Search (Cmd+K), Notification Bell, Language selector, User Profile dropdown |
| 3e | Responsive | Mobile: Sidebar behind hamburger. Tablet/Desktop: Collapsible + resizable panels. |
| 3f | AI Chat Panel | Slide-in right panel. Desktop: alongside content. Mobile: Sheet overlay. |

### UI Source Reference

| Reference | Path | Role |
|---|---|---|
| Shell + Layout | `/Users/shaikumarfarooq/Clones/next-shadcn-admin-dashboard` | Overall design system, sidebar, fonts, colors, settings |
| App Pages | `shadboard /apps/` | Kanban, Chat, Calendar complex pages (backend swap to Convex) |
| Error Pages | `shadboard /components/pages/` | Adapt to our design system |
| Landing Page | `shadcnstore` + `shadboard` landing sections | Phase 0.5 landing page |

---

## 4. Navigation & Module System

**Status**: 🟢 COMPLETE (Approved Session 21)

### Decisions

| # | Decision | Outcome |
|---|---|---|
| 4a | Nav structure | Industry-based main dashboard is first item. Account at BOTTOM with a small info card (e.g., "New update available" banner). Clicking account opens dropdown showing: Settings, Profile, Billing, Sign Out. |
| 4b | Locked modules | Show with **Upgrade badge**. When clicked → opens modal/sheet listing all benefits of upgrading. Not hidden entirely — users should see what they're missing. |
| 4c | Badge counts | Yes — show counts (new leads, unread chat, today's calendar events). Setting to **hide counts** available in org settings. |
| 4d | Pinned views | Yes — **Pinned Section** in sidebar. Users can pin saved views for quick access. |

### Sidebar Nav Structure

```
📊 Dashboard (industry-adaptive home)
───────────────
🎯 Leads        [count badge]
👤 Contacts
🏢 Companies    [hidden if entityVisibility.company = false]
💰 Deals
───────────────
📋 Projects     [Phase 8 — hidden until enabled by tier]
💬 Messages     [Phase 4 — hidden until enabled]
📅 Calendar
───────────────
📌 Pinned Views  [user-pinned saved views appear here]
   └── Hot Leads
   └── Deals Closing This Week
───────────────
🔗 Integrations [Phase 6]
───────────────
[Account Card]  ← Bottom. Small card. Shows user name + plan status.
                  When clicked → dropdown:
                  ⚙️ Settings | 👤 Profile | 💳 Billing | 🌐 Language | 🚪 Sign Out
```

---

## 5. Dashboard Home Page

**Status**: 🟢 COMPLETE (Approved Session 21)

### Decisions

| # | Decision | Outcome |
|---|---|---|
| 5a | Metric cards | **Industry-specific**. Different metrics per industry template. Use existing UI from reference dashboards, assign metrics per template. Not generic — every metric should matter for their work. |
| 5b | Activity feed + AI highlights | Everything on home. **AI can dynamically highlight sections** — if revenue crossed $1M or new deal cracked, AI surfaces it prominently (milestone banner, highlight card). Both AI and system events can surface highlights. |
| 5c | Get Started card | Yes — dismissible **"Get Started"** checklist with AI instructions: "Ask AI to set up your workspace", "Import your first leads", "Create your first deal", "Invite your team". |
| 5d | AI Morning Briefing | **Main highlight of the dashboard**. Shown first when dashboard opens. Shows: stale deals, follow-ups due, what needs attention today, any milestones. Pro-active, not just reactive. |
| 5e | Layout customization | **Fixed layout** — no drag-and-drop. AI Briefing handles dynamic prioritization. No need for block customization. |

### Industry-Specific Metric Cards

| Industry | Key Metrics |
|---|---|
| B2B Sales | New leads this week, Pipeline value, Deals closing this month, Stale deals, Revenue won this month, Follow-ups due today |
| Freelancer | Active clients, Projects in progress, Invoices pending, Hours tracked, Proposals sent, Revenue this month |
| Marketing Agency | Active campaigns, Proposals sent, Clients onboarding, Deliverables due, Revenue this month, Client satisfaction score |
| Recruitment | Active candidates, Interviews scheduled, Placements this month, Pipeline by stage, Avg time-to-place |
| Productivity | Tasks due today, Completed this week, Upcoming meetings, Projects at risk, Team workload |

> All metrics configurable per industry template. AI suggests relevant ones. Platform_owner can define metrics for new industries.

---

## 6. Onboarding Flow

**Status**: 🟢 COMPLETE (Approved Session 21)

### Decisions

| # | Decision | Outcome |
|---|---|---|
| 6a | Onboarding flow | 3-step wizard. Simple and fast. People should see dashboard first, then set up. |
| 6b | Post-onboarding landing | Dashboard with banner: **"💡 Let AI customize your workspace → Start"** |
| 6c | Step navigation | Back and forth freely allowed |
| 6d | Resume mid-onboarding | Resume where left off (state persisted in DB) |

### Onboarding Steps

```
Step 1: Create Organization
  - Org name (required)
  - Org slug (auto-generated, editable)
  - Your role title (e.g., "Founder", "Sales Manager")

Step 2: Select Industry
  - Grid of industry cards:
    B2B Sales, Marketing Agency, Recruitment, Real Estate,
    Consulting, Freelancing, E-commerce, Productivity, Other
  - Each card: icon + name + 1-line description
  - Selecting → seeds DEFAULT pipeline for that industry
  - NO field templates at this step (keep it fast)

Step 3: Complete
  - "Your workspace is ready!"
  - Set onboardingCompleted = true
  - Redirect to dashboard with AI banner
```

> **Key principle**: Onboarding takes < 2 minutes. NO field setup, NO advanced config. Dashboard first. AI Workspace Setup handles the rest.

---

## 7. Notifications System

**Status**: 🟢 COMPLETE (Approved Session 21)

### Decisions

| # | Decision | Outcome |
|---|---|---|
| 7a | Trigger events | Scalable and industry-adaptive. Standard triggers + industry-specific ones. Notification system designed so new triggers can be attached as industries grow. |
| 7b | Display | **Dropdown from bell icon** (GitHub-style). Not a full slide-in panel. |
| 7c | Email notifications | In-app only for now. Email possible later from stored data — since integrations bring data into Convex DB, email notifications can be pushed from Convex/Trigger.dev without direct integration. Deferred to Phase 5. |
| 7d | Retention | **Configurable in org settings**. When read → disappears from bell dropdown. BUT notification is kept in activity log permanently (for tracking purposes). Users can view past notifications from activity log. |
| 7e | Mark all as read | Yes — **"Mark all as read"** button required. High UX impact. |

### Standard Notification Triggers

- New lead assigned to you
- Deal stage changed (your deal or any deal per settings)
- Reminder due / overdue
- Team member @mentioned you
- New team member joined org
- AI completed a task for you
- Integration event (e.g., Slack message connected to app)
- Weekly summary ready (AI-generated)

---

## 8. Activity Logs

**Status**: 🟢 COMPLETE (Approved Session 21)

### Decisions

| # | Decision | Outcome |
|---|---|---|
| 8a | What gets logged | **Everything**: all CRM mutations, notifications, integration events (e.g., Slack message received → logged), AI actions, file operations, org/member changes |
| 8b | Who can see | **Permission-scoped**: users see logs related to entities/actions they have access to. `activityLogs.view` permission gate. |
| 8c | Log UI | **Both**: (A) Per-entity Activity tab on detail pages + (B) Dedicated `/settings/activity-log` page with full org-wide timeline |
| 8d | Retention | Free: 7d, Starter: 30d, Pro: 90d, Enterprise: 1yr. **All dynamically configurable by platform_owner in tier settings.** Platform_owner can increase/decrease per plan at any time. |

---

## 9. Org Management Pages

**Status**: 🟢 COMPLETE (Approved Session 21)

### Decisions

| # | Decision | Outcome |
|---|---|---|
| 9a | Settings pages | Confirmed. Export/Import = Pro+ feature only. Future: exported data importable to another org (planned, not built now). Settings system should be extensible — new settings pages can be added without restructure. |
| 9b | Profile page | Confirmed. Display name, email, avatar, language preference, notification preferences, connected accounts, change password. |
| 9c | Members table columns | Name, Email, Role (badge), Status (active/invited), Joined date, Last active, Actions (change role, remove) |
| 9d | Danger Zone | **Only org owner** can see Danger Zone. Other roles (even Admin) cannot see it. Confirmation: click "Delete" → type org name → final confirm. **Soft-delete only.** Data stays in DB. Recovery possible with platform_owner's help. |

### Settings Pages

```
/settings/general         — Org name, slug, logo, timezone, currency
/settings/members         — Member list, invite, role assignment
/settings/roles           — Role CRUD + permission picker (GitHub-style)
/settings/billing         — Current plan, usage, upgrade, invoices
/settings/notifications   — Org-level notification defaults
/settings/entity-labels   — Rename Lead/Contact/Deal/Company (Pro+)
/settings/appearance      — Theme color, radius, mode (Pro+)
/settings/data            — Export, data retention, danger zone (owner only)
/settings/integrations    — Connected apps (Phase 6)
/settings/activity-log    — Full org timeline
```

---

## 10. Pricing Page

**Status**: 🟢 COMPLETE (Approved Session 21)

### Decisions

| # | Decision | Outcome |
|---|---|---|
| 10a | Dynamic | **Fully dynamic from platform_owner dashboard.** Pricing page reads `platformTiers` table. Platform_owner changes price → page auto-updates. Monthly/Annual toggle + feature comparison table + FAQ + "Contact Sales" for Enterprise. |
| 10b | Source | Dynamic (reads from `platformTiers`) |
| 10c | CTA buttons | Free: "Get Started Free", Starter/Pro: "Start Free Trial", Enterprise: "Contact Sales". **All button labels dynamically configurable from platform_owner.** |
| 10d | Free trial | **Yes — free trial period is important.** Days configurable dynamically by platform_owner in `platformTiers`. During trial: import ✅, export ❌ (locked). No credit card required for trial if possible. |

---

## 11. Error & Empty States

**Status**: 🟢 COMPLETE (Approved Session 21)

### Decisions

| # | Decision | Outcome |
|---|---|---|
| 11a | Empty states | **Option B**: Illustration + "No [entity] yet" + CTA button + **AI suggestion**: "🤖 Would you like me to help you import leads from a CSV?" For CSV field matching doubt: AI handles field mapping with a smart mapping UI that suggests matches — users don't need to know field names in advance. |
| 11b | Error pages | Use **shadboard's pre-built error pages** (404, 401, maintenance, coming-soon) but **adapt to our design system** (colors, fonts, branding). |
| 11c | Loading states | **Unified loader** component (not per-page spinners). Dashboard must be optimized for fast load — skeleton screens for data-heavy sections. Target: dashboard visible in < 1.5 seconds. |

---

## 12. i18n & RTL Foundation

**Status**: 🟢 COMPLETE (Approved Session 21)

### Decisions

| # | Decision | Outcome |
|---|---|---|
| 12a | Languages at launch | English (default) + Arabic (RTL) + French + German. More languages added as market expands. |
| 12b | i18n approach | **Merge shadboard's approach** into ours. Language support from shadboard + UI layout from next-shadcn-admin-dashboard. |
| 12c | AI language | **AI responds in the exact language the user types.** NOT bound to the UI toggle. |

### RTL & Localization Rules (Approved Specification)

**Language & AI Rules:**
- AI responses: AI must respond in the exact language the user types. Do NOT bind AI language to UI toggle.
- User data: NEVER translate user data (deal titles, notes, lead names). Render exactly what user inputs.
- UI Translation: Translate only UI chrome (buttons, menus, labels). Use professional Modern Standard Arabic (MSA).
- Bilingual toggle: Seamless English/Arabic switch.

**Layout & Styling (RTL):**
- Apply `dir="rtl"` to `<html>` tag for Arabic. Entire UI (including progress bars) must flip horizontally.
- Logical CSS only: Use Tailwind logical properties (`ms-4`, `pe-2`). NEVER hardcoded directional CSS (`ml-4`, `pr-2`).
- Typography: High-quality Arabic web fonts (Cairo, IBM Plex Sans Arabic). Support bidirectional text mixing.

**Regional Workflows:**
- Address fields: Do NOT force US/Western formats. Use: Building Number, Street Name, District, City, Postal Code, Additional Number.
- Notifications: Prioritize WhatsApp (Twilio/360dialog) for Gulf market. Email largely ignored in Gulf B2B.
- Compliance: Invoices must support Arabic rendering (Saudi ZATCA + PDPL legal regulations).

---

## 13. Auth Flow Details

**Status**: 🟢 COMPLETE (Approved Session 21)

### Decisions

| # | Decision | Outcome |
|---|---|---|
| 13a | Login page design | Use **next-admin-dashboard Login v2 and Register v2** designs specifically. |
| 13b | Post-login redirect | Login → has org? → No → /onboarding. Yes → go directly to last-visited org dashboard (stored in cookie). Skip the multi-org picker step entirely — just use last-visited. |
| 13c | Remember me | Yes — **"Remember me" checkbox** on login page. |
| 13d | Magic link | Skip for now. Can add later. |
| 13e | Account deletion | Soft-delete only. 30-day recovery window. If same email tries to login after deletion: show recovery screen. After 30 days → platform_owner reviews and hard-deletes. |

### Post-Login Redirect Flow

```
User logs in
  → Has any org?
    → NO → /onboarding
    → YES → redirect to last-visited org dashboard (cookie)
              (no extra org picker screen)
```

### Account Deletion Flow

```
User requests deletion (Settings → Danger Zone)
  → Confirm
  → Soft-delete: user.deletedAt = now(), user.status = "deleted"
  → User is logged out
  → All org memberships suspended (user's records stay, marked "Unassigned")
  → For 30 days:
      - Login with same email → show recovery screen
      - "Your account was deleted on [date]. Recover before [date]? [Retrieve Account]"
      - Click Retrieve → account restored, all data intact
  → After 30 days:
      - Platform_owner reviews stale deleted accounts
      - Platform_owner hard-deletes if no recovery
```

---

## 14. Default Industry Templates

**Status**: 🟢 COMPLETE (Approved Session 21)

### The Big Answer — What "Industry Template" Actually Means

An industry template in Orbitly is NOT just a pipeline rename. It is a **configuration bundle** that makes the entire dashboard adapt to that industry:

| Template Layer | What Changes |
|---|---|
| **Pipeline stages** | Stages relevant to that industry (not generic New/In Progress/Done) |
| **Default field definitions** | Fields that matter for that industry seeded as defaults |
| **Entity labels** | Lead → "Candidate" for Recruitment, Lead → "Inquiry" for Freelancer |
| **Dashboard metrics** | Industry-specific KPIs on the home page |
| **AI persona** | AI understands the industry and behaves like an expert in it |
| **Navigation visibility** | Companies module hidden for Freelancers, visible for B2B |
| **Kanban card layout** | What fields appear on kanban cards (industry-relevant) |

**Complexity verdict**: This is doable without becoming a second Salesforce. The key is that we have **hardcoded entities** (leads, contacts, deals) but **everything else is configurable via the pipeline + fieldDefinitions + orgSettings system we already designed.** A "template" is just a set of DB records that get seeded — not new tables or new code paths.

### AI-Customizable Templates

**This is a core feature, not an afterthought:**
- AI can create a new industry template from scratch when asked
- AI can modify an existing template based on client requirements
- Like Kanban where you can add a new column (e.g., "Cancelled"), AI should be able to create a new pipeline stage on demand
- **The dashboard adapts to the client's requirements — clients do NOT adapt to our dashboard.** This is the product philosophy.
- New industries can be added without code changes — just a new config bundle
- Platform_owner can define new industries from admin panel (Phase 4+)
- Premium tiers get more industries and more AI customization capability

### Approved Industry Templates (Priority Order)

| Priority | Industry | Status |
|---|---|---|
| 1 | **B2B Sales / CRM** | First, primary. Core product. |
| 2 | **Freelancer / Solo** | Second. Manage clients from lead gen to project completion. |
| 3 | **Productivity** | Third. Task/project management overlay. Can be combined with any other industry. |
| 4+ | Agency, Recruitment, Real Estate, Consulting, E-commerce | Later phases. AI can scaffold these on request. |

### B2B Sales Template

```
Pipeline: Prospecting → Qualified → Proposal Sent → Negotiation → Won / Lost
Entity Labels: Lead, Contact, Deal, Company (all default)
Default Fields: Lead source, Company size, Budget, Decision maker, Timeline
Dashboard Metrics: New leads this week, Pipeline value, Deals closing this month, Revenue won
AI Persona: B2B sales expert — knows BANT, understands enterprise buying cycles
```

### Freelancer Template

```
Pipeline: Inquiry → Quote Sent → Accepted → Working → Invoiced → Complete
Entity Labels: Lead → "Inquiry", Contact → "Client", Deal → "Project", Company → hidden
Default Fields: Project type, Budget, Deadline, Scope notes
Dashboard Metrics: Active clients, Projects in progress, Invoices pending, Revenue this month
AI Persona: Freelance business expert — knows client management, invoicing, follow-ups
```

### Productivity Template (New — Added Session 21)

```
Pipeline: Todo → In Progress → Review → Done / Blocked
Entity Labels: Deal → "Task", Lead → "Idea"
Default Fields: Priority, Due date, Estimated hours, Assignee
Dashboard Metrics: Tasks due today, Completed this week, Overdue tasks, Team velocity
AI Persona: Productivity coach — knows task prioritization, time management, team throughput
AI Briefing: "You have 5 tasks due today, 3 overdue. Most urgent: [Task Name]."
```

### Decisions

| # | Decision | Outcome |
|---|---|---|
| 14a | Industry priority | B2B CRM → Freelancer → Productivity. More added as product matures. All should be simple and powerful — not Salesforce-level complexity. |
| 14b | Template scope | Complete dashboard adaptation (not just pipeline labels). Metrics, fields, labels, AI persona, nav visibility. |
| 14c | Label customization | Templates seed default labels. Owner can customize. AI can customize when asked. |
| 14d | Template as starting point | Yes — template seeds defaults. Everything modifiable after. |

---

## 15. Pipelines & Stages

**Status**: 🟢 COMPLETE (Approved Session 21)

### Decisions

| # | Decision | Outcome |
|---|---|---|
| 15a | Multiple pipelines | Yes — multiple pipelines per org. Limits configurable dynamically in platform-tiers table. |
| 15b | Stage properties | Industry-aware, not just sales. Properties: name, color, order, probability % (optional), isFinal (boolean), finalType (positive/negative/neutral), staleAfterDays. |
| 15c | Reorder | Yes — drag-and-drop reorder of stages. |
| 15d | Staleness threshold | **Per-pipeline** (not per-stage for simplicity in v1). `staleAfterDays` configurable in pipeline settings. Handling: badge on card + notification to assigned user + AI alert in morning briefing. |
| 15e | Visual stale indicator | Yes — **red border** on kanban cards for stale records. High UX value. |

### Dynamic Stage Management (AI-Powered)

```
User in Kanban: "Add a Cancelled column"
  → AI calls setupPipeline tool
  → Adds new stage: { name: "Cancelled", color: "#red", isFinal: true, finalType: "negative" }
  → Kanban re-renders with new column
  → User sees: Pending | Active | Completed | Cancelled
```

This is the core philosophy: **dashboard adapts to user's workflow, not the other way around.**

---

## 16. Dynamic Fields System

**Status**: 🟢 COMPLETE (Approved Session 21)

### Decisions

| # | Decision | Outcome |
|---|---|---|
| 16a | Field types | Text, Textarea, Number, Currency, Date, DateTime, Dropdown, Multi-select, Checkbox, Email, Phone, URL, User picker, Contact link, Company link, File. Sufficient for launch. |
| 16b | Field grouping | Yes — grouped into sections based on industry (e.g., "Contact Info", "Financial Details", "Custom"). |
| 16c | Required fields | Owner sets which fields are required. |
| 16d | Role-based field visibility | Base supports it (`visibleToRoles` property on fieldDefinition). UI enforcement deferred to Phase 4+. |
| 16e | Validation | Owner-managed: regex patterns, min/max for numbers, dropdown options. |
| 16f | Field limits per tier | Dynamically adjustable in platform_owner dashboard. Free: 5, Starter: 20, Pro+: unlimited by default. |

---

## 17. Leads Module

**Status**: 🟢 COMPLETE (Approved Session 21)

### Decisions

| # | Decision | Outcome |
|---|---|---|
| 17a | Industry-aware fields | Default fields change per industry. AI behaves as expert in that industry — not generic AI. Industry-specific AI persona knows what fields matter. |
| 17b | Views | **List + Board view** (kanban by stage). |
| 17c | Lead → Contact conversion | Create new Contact with lead data copied. Optionally create Deal at same time (if admin selects). **Keep lead linked to contact** via `contacts.leadId` — full traceability. |
| 17d | Lead scoring | **AI-generated lead score.** AI everywhere — no exception. |
| 17e | Duplicate detection | Yes — when creating lead, check existing leads/contacts with same email. Show warning. |

### Entity Architecture — Separate Tables with Links

**Decision: Separate tables (`leads`, `contacts`, `deals`) with FK links.**

- Lead record stays, gets `convertedAt` timestamp and linked `contactId`
- Contact is a NEW record with lead data copied + expanded contact fields (deals, notes, files, conversations)
- Status updates tracked with date on each status change
- Can trace back: Contact → what lead they came from
- Contacts get richer data model than leads (they're further in the pipeline)
- Dedup engine runs at lead creation + at contact creation (same engine, reused)

**Why NOT single-table status change:**
- Leads and contacts have different field definitions (contacts have more)
- Contacts link to deals, leads don't (or minimally)
- Reporting needs to distinguish lead metrics from contact metrics
- Mixing them in one table creates confusion and complex queries

### AI Lead Creation Confirmation Flow

```
User: "Create a lead for John Smith at Acme Corp"
AI: "I'm about to create a lead with the following details:
     - Name: John Smith
     - Company: Acme Corp
     - Email: (not provided)
     - Source: Manual
     - Pipeline: Default Sales Pipeline
     - Stage: New
     Should I proceed, or do you need to make any changes?"
User: "Change source to Referral"
AI: "Updated. Creating lead for John Smith with Source: Referral. Proceeding..."
```

**This pattern applies to ALL AI record creation — always show data preview and ask for confirmation before writing to DB.**

---

## 18. Contacts Module

**Status**: 🟢 COMPLETE (Approved Session 21)

### Decisions

| # | Decision | Outcome |
|---|---|---|
| 18a | Default fields | First Name, Last Name, Email (required), Phone, Company (link), Job Title, Address, Tags, Assigned To, Source. Owner can configure all. |
| 18b | Dedup for contacts | **Yes — run dedup for contacts as well.** Same dedup engine as leads (reuse, don't rewrite). Engine checks email + fuzzy name matching. Show "Possible duplicate" banner, let user choose to merge or keep separate. |
| 18c | Detail page tabs | Overview, Activity (timeline), Deals (linked), Notes, Files, Communications (Phase 4+) |
| 18d | Lifecycle stage | Skip for now. Overkill. Plan later if needed. |

### Dedup Engine (Shared — Leads + Contacts)

```
deduplication engine:
  - Email exact match → high confidence duplicate
  - Phone normalization + match → medium confidence
  - Fuzzy name match (Levenshtein < threshold) → low confidence
  
On duplicate found:
  - Show "Possible duplicate" banner (not auto-merge)
  - User clicks → side-by-side comparison view
  - User picks primary record
  - Merge: fieldValues merged (primary wins on conflicts)
  - `contactMergeHistory` entry created for undo
  - Undo available for 30 days
```

---

## 19. Companies Module

**Status**: 🟢 COMPLETE (Approved Session 21)

### Decisions

| # | Decision | Outcome |
|---|---|---|
| 19a | Is it needed? | Yes — all major CRMs have it. B2B requires grouping contacts by company and deals by company. Freelancers can hide it (entityVisibility toggle). |
| 19b | Contact relationship | One company → many contacts. Manual linking (not auto-link by name match). |
| 19c | Detail page tabs | Overview, Contacts (linked), Deals (linked), Activity, Notes, Files |
| 19d | Hide from nav | Yes — nav toggle only (entityVisibility). No data deletion. |

### Extra Entity Type (AI-Creatable?)

For industries that need entities OTHER than companies (e.g., "Products" for e-commerce, "Properties" for real estate):
- **For now**: These are handled via custom field definitions (linking a record to a URL or text field describing the extra entity)
- **Complex dynamic entity tables**: Skip — this is Salesforce/Attio territory and too complex for v1
- **AI can suggest workarounds**: "You can track properties as a custom field group on Deals"
- **Phase 4+ decision**: Re-evaluate if multiple paying clients request it

---

## 20. Deals Module

**Status**: 🟢 COMPLETE (Approved Session 21)

### Decisions

| # | Decision | Outcome |
|---|---|---|
| 20a | Default fields | Title, Value (currency), Pipeline, Stage, Contact (link), Company (link), Expected Close Date, Probability %, Assigned To, Tags, Outcome reason (shown when deal reaches final stage). |
| 20b | Kanban cards | **Owner decides** what fields appear on kanban cards. Configurable per pipeline. |
| 20c | Revenue forecasting | **Both** — weighted (value × probability) AND total. Users see both. |
| 20d | Deal Won | Auto-update contact lifecycle → "Customer". Log revenue to analytics. Trigger invoice creation (Phase 8). Celebration animation (🎉 confetti). |
| 20e | Deal outcomes | **Owner decides the name** (not hardcoded "Won/Lost"). Can be "Delivered/Cancelled", "Placed/Withdrawn", etc. Owner names final stage in pipeline. Not archived — stays visible in its column. Used in analytics and projections. |

---

## 21. Activity Timeline (Notes + Feed)

**Status**: 🟢 COMPLETE (Approved Session 21)

### Decisions

| # | Decision | Outcome |
|---|---|---|
| 21a | Architecture decision | **Activity Timeline replaces separate notes/chat system.** Each entity (lead, contact, deal, project) has a unified activity feed where everything is logged. |
| 21b | Simple text notes | Each entity has a simple **text area for notes** — owner, admin, team can write anything. Shown in timeline. No separate notes "module" — just a text input in the activity feed. |
| 21c | Communications | For professional communication: **Activity pages** per entity (not chat). All admin, client, partner, team members with access can see and communicate in entity activity feed. All actions logged here. |
| 21d | Rich text | Use TipTap editor (from shadboard) for notes input. Bold, italic, links — basic formatting. |
| 21e | AI notes | AI can auto-generate notes (meeting summary, follow-up notes). `authorType: "ai"` distinguishes them. |
| 21f | Internal flag | `isInternal: true` — hidden from client/partner portal. |
| 21g | @mentions | Yes — @mention team members in notes → notification sent to mentioned user. |

### Timeline Feed Content (Chronological)

```
Activity Log entries (created, updated, stage change, converted)
  + Notes (user or AI created)
  + Reminders (created, completed, overdue)
  + Communications (emails, WhatsApp — Phase 4+)
  + AI actions ("AI created follow-up reminder for this contact")
  + Integration events ("HubSpot sync updated this record")
```

---

## 22. Reminders & Follow-ups

**Status**: 🟢 COMPLETE (Approved Session 21)

### Decisions

| # | Decision | Outcome |
|---|---|---|
| 22a | Fields | Title, dueAt, entityType, entityId, assignedTo, status (pending/completed/overdue), reminderType (call/email/meeting/follow-up/custom), notes |
| 22b | Where shown | Dashboard "Tasks Due Today" card + Calendar view + Notification bell + AI morning briefing + AI proactive suggestion: "Payment overdue — should I send an email?" |
| 22c | Recurring | Yes — recurring reminders supported. Adjustable by roles (not only owners — employees can set recurring reminders). |
| 22d | AI auto-suggest | **Compulsory.** AI proactively suggests reminders: "You haven't followed up with Acme Corp in 10 days. Should I create a reminder?" |

---

## 23. Tags System

**Status**: 🟢 COMPLETE (Approved Session 21)

### Decisions

| # | Decision | Outcome |
|---|---|---|
| 23a | Tag structure | `name` (unique per org), `color` (hex/preset), `createdBy`. Org-wide (not per-user). |
| 23b | Entity types | Tags apply to **any entity type** based on industry — leads, contacts, deals, companies, projects, tasks, products, etc. Not limited to fixed list. |
| 23c | Filterable | Yes — filterable. Both tags AND status filterable in saved views. |
| 23d | Max tags | Unlimited per entity. |

---

## 24. Saved Views

**Status**: 🟢 COMPLETE (Approved Session 21)

### What Is a Saved View?

A saved view is a **filter preset** — like saving a search. Example: "Deals where Stage = Negotiation AND Value > $5000, sorted by Expected Close Date." Once saved, it appears in the sidebar under that entity. Users navigate to it like a page.

### Decisions

| # | Decision | Outcome |
|---|---|---|
| 24a | View fields | name, entityType, scope ("user"\|"org"), filters (JSON), sortBy, sortOrder, columns (visible columns), isPinned (sidebar), createdBy |
| 24b | Who creates org-wide views | Anyone with `views.createOrg` permission. |
| 24c | Sidebar appearance | Yes — pinned views appear nested under their entity in sidebar. |
| 24d | Tier limits | **Dynamically configurable from platform-tiers.** Default: Free: 3 personal only, Starter: 10 + org views, Pro+: unlimited. |

---

## 25. Bulk Actions

**Status**: 🟢 COMPLETE (Approved Session 21)

### Decisions

| # | Decision | Outcome |
|---|---|---|
| 25a | Supported bulk actions | Assign to team member, Add/remove tags, Change status/stage, Delete (with confirmation), Export to CSV, Bulk note add |
| 25b | Select-all scope | **All matching rows including paginated** (not just visible page). Shows count: "1,243 records selected." |
| 25c | Tier | **Starter+** feature. Free users don't get bulk actions. |

---

## 26. CSV Import

**Status**: 🟢 COMPLETE (Approved Session 21)

### Decisions

| # | Decision | Outcome |
|---|---|---|
| 26a | Import flow | Upload → Field mapping (AI-assisted matching) → Preview 5 rows → Validation errors → Confirm → Background job (Trigger.dev) → Summary |
| 26b | Import targets | All entity types based on industry. Owner can import anything needed. If complexity is too high initially, prioritize leads + contacts first. |
| 26c | Duplicate handling | **User chooses per import**: Skip duplicates / Overwrite existing / Create + let dedup engine handle / Ask me for each (if small batch) |
| 26d | Max rows per import | **Dynamically configurable in platform-tiers.** Default: Free: 100, Starter: 1000, Pro+: 10000. |

---

## 27. Command Palette

**Status**: 🟢 COMPLETE (Approved Session 21)

### Decisions

| # | Decision | Outcome |
|---|---|---|
| 27a | Searchable items | Entities (leads, contacts, deals by name), Pages (Settings, Leads, Dashboard), Actions (Create lead, Invite member, Open AI), Saved Views. All searchable. |
| 27b | Tier access | **Dynamic** — configurable from platform-tiers. |
| 27c | Quick-create inline | **Not required.** Keep command palette focused on navigation + search + actions. |

### Keyboard Shortcuts

```
Cmd+K           → Open command palette
Cmd+\           → Toggle AI chat panel
Cmd+B           → Toggle sidebar
Cmd+Shift+D     → Go to Dashboard
Cmd+Shift+L     → Go to Leads
Cmd+Shift+C     → Go to Contacts
Cmd+Shift+E     → Go to Deals
Cmd+,           → Open Settings
Cmd+Shift+T     → Toggle theme (dark/light)
```

---

## 28. Unified Timeline

**Status**: 🟢 COMPLETE (Approved Session 21)

### Decisions

| # | Decision | Outcome |
|---|---|---|
| 28a | Content | Activity logs + Notes + Reminders + Communications (Phase 4+) + AI actions + Integration events. All chronological. |
| 28b | Filters + Search | Yes — filter by type (notes, activity, comms). **Search** capability within timeline. |
| 28c | Expandability | Small entries: always visible. Large entries (long notes, AI summaries): collapsed with "Show more". |

---

## 29. Billing & Payments

**Status**: 🟢 COMPLETE (Approved Session 21)

### Billing Provider Decision

**LemonSqueezy (primary) + Razorpay (India UPI fallback)**

| Factor | LemonSqueezy | Razorpay | Stripe |
|---|---|---|---|
| India support | ✅ Global MoR | ✅ India-native | ⚠️ Hard for Indian founders |
| Tax compliance | ✅ Handles GST, VAT automatically | ✅ India-specific | ❌ Manual |
| Setup complexity | Low | Low | High |
| Long-term cost | MoR takes ~5% | ~2% per transaction | ~2.9% + manual tax |
| Subscription management | ✅ Built-in | ✅ Built-in | ✅ Built-in |
| Indian founder-friendly | ✅ | ✅ | ❌ |

**Decision**: LemonSqueezy for global customers (handles tax, compliance, subscriptions). Razorpay for Indian customers (UPI, local payment methods). Both route webhooks to Convex → update org tier.

### Decisions

| # | Decision | Outcome |
|---|---|---|
| 29a | Payment providers | LemonSqueezy (global MoR) + Razorpay (India UPI) |
| 29b | Billing flow | Sign up (Free auto-assigned) → Upgrade → LemonSqueezy/Razorpay Checkout → webhook → update org.tierId in Convex |
| 29c | Annual billing | Yes — annual billing with configurable discount %. All in platform_owner dashboard. |
| 29d | Failed payment | Provider retries → all fail → org status = "suspended" → dynamic grace period → "cancelled". Matches org lifecycle (Module 2). |
| 29e | Invoices | Yes — users can view/download past invoices from billing page. LemonSqueezy provides these. |
| 29f | Free trial | Yes — configurable days from platform_owner. Trial: import ✅, export ❌. |

---

## 30. AI Architecture & Security

**Status**: 🟢 COMPLETE (Approved Session 21)

### Decisions

| # | Decision | Outcome |
|---|---|---|
| 30a | AI models | **Swappable + task-based routing**. Simple tasks (search, lookup) → lighter model (Claude Haiku / Gemini Flash). Complex tasks (analytics, AI briefing, workspace setup) → powerful model (Claude Sonnet). Message limits enforced per tier. Model config in platform_owner dashboard. |
| 30b | Security layers | 4 layers sufficient: (1) System prompt boundaries, (2) Org-scoped data, (3) User permission filtering, (4) Confirmation before destructive actions |
| 30c | AI data access | User sees only data they have access to. Full context for: their own deals/projects, their integrations/communications/activities. NOT: other users' private data, revenue data without `deals.viewValues`, internal notes without `notes.viewInternal`. |
| 30d | AI response style | Professional. Simple language (no jargon, no examples-heavy). Explains clearly so everyone understands. Concise. |
| 30e | Conversation privacy | **Private per user.** Unauthorized access attempts → flag and report to org admin/owner. |

### Model Routing Strategy

```typescript
// Task complexity → model selection
const modelRouter = {
  simple: "claude-haiku-3" | "gemini-1.5-flash",    // search, lookup, simple answers
  standard: "claude-sonnet-4",                        // create/update records, reminders
  complex: "claude-sonnet-4" | "claude-opus-4",      // analytics, AI briefing, workspace setup
}

// Message limits per tier (configurable from platform_owner):
// Free: 0, Starter: 100/mo, Pro: 500/mo, Enterprise: 2000/mo
```

---

## 31. AI Tool Registry

**Status**: 🟢 COMPLETE (Approved Session 21)

### Decisions

| # | Decision | Outcome |
|---|---|---|
| 31a | Tool set | Expandable — more tools added as platform grows (analytics, follow-ups, reminders, briefing, projections). Core tools first. |
| 31b | Confirmation UX | **Always show what AI will do + data preview before executing.** When multiple options (e.g., 2 contacts match), show button cards — user clicks to select, no typing. |
| 31c | RBAC on tools | **Strict.** AI can only perform actions the user has permission to perform. AI has no special bypass. |

### Core Tool Registry

```
CRM Read Tools:
  searchLeads(query), searchContacts(query), searchDeals(query)
  getEntityDetails(type, id), getDashboardStats(), getPipelineOverview()
  searchNotes(entityType, entityId, query), searchActivityLog(query)

CRM Write Tools:
  createLead(data) — shows preview + asks "Proceed?"
  updateLead(id, data) — shows diff + asks "Proceed?"
  createDeal(data), moveDealStage(id, stage), createReminder(data)
  addNote(entityType, entityId, content), assignEntity(type, id, userId)
  convertLead(leadId, createDeal: boolean)

Workspace Tools (admin only):
  setupRoles(roles[]), setupFields(entityType, fields[])
  renameEntities(labels), setupPipeline(name, stages[])
  createPipelineStage(pipelineId, stage) — adds new stage to existing pipeline

Analytics Tools:
  getPipelineHealth(), getStaleDeals(), getForecast()
  getTeamPerformance(), getMorningBriefing()

Reminder Tools:
  suggestFollowUp(entityId), createRecurringReminder(data)
  getOverdueReminders(), getTasksDueToday()
```

---

## 32. AI Chat UI

**Status**: 🟢 COMPLETE (Approved Session 21)

### Decisions

| # | Decision | Outcome |
|---|---|---|
| 32a | Chat features | Message list, text input, tool result cards (mini-tables), confirmation dialogs inline, "Thinking..." indicator, "New Conversation" button, past conversation history |
| 32b | Rich formatting | Yes — markdown tables, bullet lists, bold text, links to CRM records |
| 32c | Suggested prompts | Yes — suggested prompts when chat is empty. AI also proactively suggests next steps, sends reminders, notifications, summaries. AI is a pro-active assistant. |
| 32d | Context-aware mode | **Crucial.** If user is on Deals page → AI automatically knows they're looking at deals and answers in that context. Context detected from URL/current route. |

### Proactive AI Behavior

```
User opens Deals page:
  AI panel: "You're looking at your deals. You have 3 deals stale for 7+ days.
             Quick actions: [View Stale Deals] [Create Follow-up for All] [Get Revenue Forecast]"

User opens Lead detail page for "John Smith":
  AI panel: "John Smith — last contacted 14 days ago. No follow-up scheduled.
             [Schedule Follow-up] [View Full Activity] [Convert to Contact]"
```

---

## 33. AI Workspace Setup

**Status**: 🟢 COMPLETE (Approved Session 21)

### Decisions

| # | Decision | Outcome |
|---|---|---|
| 33a | Flow | Correct as planned: dashboard banner → AI conversation → AI builds roles, fields, pipeline → real-time preview → user approves. |
| 33b | Re-runnable | Yes — can be re-run later. Warning: "Changing industry template will reset pipeline stages and default fields. Your existing data will not be deleted. Proceed?" |
| 33c | Tier access | **All tiers get setup (including Free).** Just limited message count. Free: maybe 5 setup messages. Dynamically configurable by platform_owner. Removes barrier to experiencing the product. |

---

## 34. AI Conversation History

**Status**: 🟢 COMPLETE (Approved Session 21)

### Decisions

| # | Decision | Outcome |
|---|---|---|
| 34a | Persistence | Yes — fully persisted. Like Claude.ai / ChatGPT — users see past conversations. |
| 34b | Retention | Configurable per tier by platform_owner. Free: 7 days, Starter: 30 days, Pro: 90 days, Enterprise: 1 year (mirrors activity log retention). |
| 34c | Search | Yes — search past AI conversations. |
| 34d | Context management | User manages + AI auto-compacts. AI uses activity logs for historical context (not conversation history). For historical questions ("what deals did I create last month?"), AI searches activityLogs + DB rather than scrolling conversation context. This keeps context window clean and accurate. |
| 34e | Conversation switcher | **Dropdown** in chat panel header. Shows past conversations by title. Clicking switches to that conversation. No separate sidebar for conversations. |

---

---

## Session 23 Decisions — Solo Architecture Philosophy, Maintainability Rules & Cross-Org AI

> **Added Session 23 — 2026-04-24**
> How to keep this codebase manageable solo. How to make it sellable. Cross-org AI for platform_owner.

---

### E. Solo Developer Architecture — The Honest Assessment

**Status**: 🟢 LOCKED

#### Can one developer build and maintain this?

**Yes — with the right discipline.** Here is why this is achievable:

| Factor | Reality |
|---|---|
| Feature volume | Large but phased — you never build it all at once |
| Backend complexity | Convex removes ~60% of typical backend work (no REST, no caching, no cache invalidation, real-time built in) |
| Frontend patterns | Scaffolds (EntityListPage, EntityDetailPage, KanbanBoard) mean new entities take 1–2 days, not weeks |
| AI coding tools | Every piece of code here follows strict conventions — AI coding assistants can write feature code reliably once patterns are established |
| Time to sellable product | Phase 3 = 3–5 months of focused work |

#### The Phase Gate Rule (most important rule)

> **Finish Phase N completely before touching a single line of Phase N+1.**

Scope creep is the #1 solo-dev killer. Feature boundaries in the todo list exist for a reason. A half-built Phase 2 with bits of Phase 3 mixed in is unmaintainable. A finished Phase 2 with zero Phase 3 code is rock solid.

---

### F. Feature-Based Colocation — The Architecture Pattern

**Status**: 🟢 CONFIRMED

You already have this in your folder structure. This is the right and only sane pattern at this scale.

#### The Rule: Where Does a File Live?

```
Only 1 feature uses it?     → lives INSIDE that feature folder
2+ features use it?         → moves UP to features/_shared/ or lib/
Pure UI primitive?          → lives in components/ui/
Convex backend function?    → lives in convex/[module]/
Background job?             → lives in trigger/[category]/
```

#### Bad Pattern (kills solo devs at scale)

```
components/LeadCard.tsx
components/ContactCard.tsx      ← jumping across 6 folders to find "everything about leads"
hooks/useLeads.ts
hooks/useContacts.ts
pages/leads.tsx
```

#### Good Pattern (what we have)

```
features/leads/
  ├── types.ts                ← Lead type from Convex Doc<"leads">
  ├── hooks/useLeads.ts       ← data fetching
  ├── hooks/useLeadColumns.ts ← table column definitions
  └── components/
      ├── LeadList.tsx
      ├── LeadBoard.tsx
      ├── LeadCard.tsx
      ├── LeadDetail.tsx
      └── AddLeadDialog.tsx
→ "Everything about leads" = open one folder
```

#### The Scaffold Multiplier

This is what makes the entire 9-phase plan achievable solo. Once the scaffolds are built (Phase 1), every new entity follows the same pattern:

```typescript
// Adding "Projects" module (Phase 8) is:
// 1. Convex tables (copy-adapt from deals)
// 2. features/projects/ (copy-adapt from features/deals/)
// 3. Wire routes (copy-adapt from deals routes)
// 4. Register in navigation.ts
// Total new thinking required: ~20%. The other 80% is pattern.

// EntityListPage already handles:
toolbar + search + filters + view toggle + column visibility +
empty state + loading skeleton + bulk action bar
// Projects page just passes: columns, data, BoardCard, onAdd
```

---

### G. The 7 Rules of Solo-Dev Maintainability

**Status**: 🟢 LOCKED — These are non-negotiable conventions.

**Rule 1 — One file, one responsibility**
Every file does one thing. If a file grows past ~150 lines, it probably needs splitting.
- `useLeads.ts` fetches leads. Nothing else.
- `LeadCard.tsx` renders a lead card. Nothing else.
- `convex/leads/mutations.ts` writes leads. Nothing else.

**Rule 2 — Name things after what they ARE, not what they DO**
`LeadCard` not `Card`. `useOrgPermission` not `usePermission`. `convex/leads/mutations` not `convex/mutations/leads`.
Six months from now, searching for "lead" in the codebase should find everything lead-related.

**Rule 3 — Convex is the ONLY data layer — never bypass it**
Every data change goes through a Convex mutation. No direct DB writes from API routes, no state sync tricks, no "optimistic update + manual cache invalidation." Convex reactive queries update every subscriber automatically. You NEVER write "refresh the cache" code.

**Rule 4 — Scaffolds absorb complexity — features must be thin**
`EntityListPage` handles toolbar, view toggle, column visibility, empty state, loading, bulk actions.
A list page (leads, contacts, deals) should be < 80 lines — just configuration passed to the scaffold.
If you're adding layout logic into a feature page, it belongs in the scaffold instead.

**Rule 5 — TypeScript end-to-end — no `any`, no manual interfaces**
Convex generates types from the schema. Use `Doc<"leads">`, `Id<"orgs">` everywhere.
Never write manual interfaces that duplicate Convex types.
When you rename a DB field → TypeScript shows every broken file immediately. This is your safety net.

**Rule 6 — Test Convex mutations, not React components**
Your 102 tests are in Convex — this is correct. "Does the mutation enforce RBAC?" catches real bugs.
"Does this button render?" catches almost nothing useful.

```
Test strategy:
  Convex mutations/queries → unit tests with convex-test (already doing this)
  Critical flows (auth, onboarding, lead creation, deal conversion) → Playwright E2E
  React components → do NOT write RTL tests. Playwright covers the real behavior.
```

**Rule 7 — Feature flags for everything not yet ready**
Every Phase N+1 module is behind a `featureFlag`. Code can be pushed 70% done — it won't appear in production until the flag flips. No feature branches. No merge conflicts. No "this PR has been open 3 weeks" problems.

---

### H. Making Orbitly Sellable / White-Label Deployable

**Status**: 🟢 LOCKED

#### Zero-Code Customer Setup (already mostly designed)

```
New customer setup checklist:
  □ Create new Convex deployment (5 minutes)
  □ Set environment variables (.env file, ~10 vars)
  □ Deploy to Vercel (3 minutes)
  □ Seed platformTiers with pricing
  □ Seed platformContext with AI rules
  □ Done — customer can sign up
```

#### Environment Variables for White-Label

```env
# Never hardcode these in code — always use env vars or i18n keys
NEXT_PUBLIC_APP_NAME="Orbitly"           ← white-label: change to client's name
NEXT_PUBLIC_APP_URL="https://orbitly.ai"
NEXT_PUBLIC_SUPPORT_EMAIL="hi@orbitly.ai"
NEXT_PUBLIC_LOGO_URL="/logo.svg"          ← white-label: change to client's logo
```

**Rule**: Never hardcode the string "Orbitly" in any user-visible location. Always use `t('app.name')` or `process.env.NEXT_PUBLIC_APP_NAME`. This costs nothing to implement and means white-labeling is a config change, not a code change.

#### Deployment Models

```
Model 1 — SaaS (default): One Convex deployment, all customers as orgs
  → Most customers: just sign up, pick a tier
  → Zero setup per customer. Multi-tenancy handles it.

Model 2 — Enterprise dedicated: Separate Convex deployment per enterprise client
  → Needed when client demands data isolation (bank, hospital, government)
  → Setup: ~30 minutes (new Convex deployment + env vars + Vercel deploy)

Model 3 — White-label reseller: Separate deployment, client's branding
  → Change: NEXT_PUBLIC_APP_NAME, NEXT_PUBLIC_LOGO_URL, accent color in .env
  → Deploy to client's domain
  → ~1 hour setup total
```

#### What Makes This Commercially Viable as a Product

- `platformTiers` table: pricing structure is fully DB-driven. Change prices → no code deploy
- `platformContext` table: AI rules and platform description configurable without code
- Feature flags per org: enable/disable modules per customer from admin panel
- Annual/monthly billing toggle: already dynamic in LemonSqueezy config
- Trial period: already dynamic in `platformTiers.trialDays`

---

### I. Cross-Org AI Context for Platform Owner

**Status**: 🟢 COMPLETE

> Platform_admin manages ALL orgs. Their AI needs to answer questions across the entire platform — not just one org. BUT: they should NEVER see individual customer records (leads, contacts, deal content). Only aggregated analytics and org-level management data.

#### Two AI Contexts — Clear Boundary

```
Org User AI:
  Context: one org, user's role permissions, user's conversation history
  Can see: leads, contacts, deals — everything WITHIN their org (permission-scoped)
  Cannot see: other orgs' data, platform-level stats

Platform Admin AI:
  Context: ALL orgs (aggregated), platform health, billing status
  Can see: org counts, tier distribution, usage stats, alerts, system health
  CANNOT see: individual customer records (leads/contacts/deals content)
              individual user emails beyond org admin contact
              notes, communications, or any customer PII
```

#### Platform Admin AI — What It Can Answer

```
"How many total orgs are on the Pro tier?"
"Which orgs haven't logged in for 30 days?"
"Show me orgs approaching their pipeline limit"
"How many AI messages were used across all orgs this month?"
"Which orgs are on failed payment / suspended status?"
"What's our MRR breakdown by tier?"
"Show me waitlist signups by industry this week"
"Flag any org with activity spikes in the last 24 hours"
"How many new orgs signed up this month?"
```

#### Platform Admin AI — What It CANNOT Answer

```
"Show me the leads at Acme Corp"      ← ❌ customer data
"What deals does org X have?"         ← ❌ customer data
"Read the notes on this contact"      ← ❌ customer PII
"What are the emails of users in org X?" ← ❌ customer PII
```

#### System Prompt Builder for Platform Admin

```typescript
// convex/ai/systemPrompt.ts
async function buildPlatformAdminPrompt(ctx, adminUserId) {
  // Get platform-wide aggregated stats (no individual record content)
  const stats = await ctx.runQuery(internal.platform.getAggregatedStats);
  const alerts = await ctx.runQuery(internal.platform.getPlatformAlerts);
  const platform = await ctx.db.query("platformContext")
    .withIndex("by_key", q => q.eq("key", "main")).unique();

  return `
${platform.content}

You are the Platform Intelligence AI for the Orbitly platform owner.
You have visibility into AGGREGATED platform data across all orgs.
You CANNOT access individual customer records (leads, contacts, deals, notes).
Your purpose: help the platform owner understand business health and manage orgs.

Current Platform Stats:
- Total orgs: ${stats.totalOrgs} (${stats.activeOrgs} active this week)
- MRR: ${stats.mrr}
- Tier distribution: Free(${stats.byTier.free}), Starter(${stats.byTier.starter}), Pro(${stats.byTier.pro}), Enterprise(${stats.byTier.enterprise})
- AI messages used this month: ${stats.aiMessagesThisMonth}
- New signups this week: ${stats.newOrgsThisWeek}
- Waitlist: ${stats.waitlistCount} pending

Active Alerts:
${alerts.map(a => `- [${a.severity}] ${a.type}: ${a.description}`).join('\n')}
  `;
}
```

#### New Tools for Platform Admin AI

```
platformAdminTools (platform_admin role only):

  Read tools:
  getPlatformOverview()          → org counts, MRR, tier distribution, growth
  getOrgsOnTier(tier)            → list of orgs on a specific tier
  getOrgUsageSummary(orgId)      → AI messages used, lead count, last active (no record content)
  getOrgsAtRisk()                → suspended, failed payment, approaching limits
  getSystemHealth()              → error rates, API performance, job queue status
  getWaitlistStats()             → signup counts, industry distribution, source
  getFeatureFlagStatus()         → which flags are on/off platform-wide

  Write tools (all require confirmation):
  updateOrgTier(orgId, newTier)  → change an org's subscription tier
  suspendOrg(orgId, reason)      → suspend with email notification
  reactivateOrg(orgId)           → reactivate suspended org
  toggleFeatureFlag(flag, value) → enable/disable platform-wide features
  updatePlatformContext(content) → update the AI's platform knowledge
```

#### Route for Platform Admin

```
app/[locale]/platform/             ← Platform owner dashboard (separate from org dashboard)
  ├── page.tsx                     ← Overview: org count, MRR, alerts
  ├── orgs/page.tsx                ← Org list: tier, status, last active, usage
  ├── tiers/page.tsx               ← Manage platformTiers (pricing, limits, features)
  ├── context/page.tsx             ← Edit platformContext (AI knowledge base)
  ├── flags/page.tsx               ← Feature flags
  ├── waitlist/page.tsx            ← Waitlist management
  └── ai/page.tsx                  ← Platform admin AI chat (cross-org context)
```

#### Security: Platform Admin Cannot Impersonate Org Users

```typescript
// convex/ai/processChat.ts
if (user.platformRole === "platform_admin") {
  // Build platform admin prompt — AGGREGATED DATA ONLY
  systemPrompt = await buildPlatformAdminPrompt(ctx, userId);
  tools = platformAdminTools; // different tool set, no customer data tools
} else {
  // Build org user prompt — scoped to their org + their role
  systemPrompt = await buildOrgUserPrompt(ctx, userId, orgId, currentRoute);
  tools = getToolsForRole(role.permissions);
}
// Platform admin NEVER gets org user tools. No crossover. Hard separation.
```

---

## Session 22 Decisions — AI Context Architecture, Web Scraping & Entity Slots

> **Added Session 22 — 2026-04-24**
> These are additive decisions on top of the approved plan. They refine Modules 30, 31, 19 and add new AI capabilities.

---

### A. AI Context Architecture — Per-User DB + Global Platform Context

**Status**: 🟢 COMPLETE

#### The Two-Layer AI Context Model

```
Layer 1 — Global Platform Context (injected into EVERY AI system prompt)
──────────────────────────────────────────────────────────────────────
  Source: `platformContext` table (new table — platform_owner manages)
  Contents:
    - What Orbitly is and does
    - All module descriptions and capabilities
    - Platform rules and boundaries
    - What the AI can and cannot do
    - Current platform version + feature set
  Updated: Platform_owner updates from admin panel when platform evolves
  Applied: Prepended to system prompt on EVERY AI call (all users, all orgs)
  Purpose: AI always knows it is an Orbitly CRM assistant — never forgets
           what the platform is even in long/complex conversations

Layer 2 — Per-User AI DB (per orgId + userId)
──────────────────────────────────────────────────────────────────────
  Source: `aiConversations` + `aiMessages` tables (already designed)
  Contents:
    - Full conversation history for this user
    - Previous tool calls and results
    - What the user has asked about before
    - Context of ongoing workflows
  Applied: Loaded from DB when conversation resumes
  Context window overflow handling:
    → AI detects context is getting large
    → Auto-summarizes older messages (compact)
    → Stores summary back in `aiConversations.contextSummary`
    → Keeps recent messages + summary in window
    → If AI needs older context → scans aiMessages DB directly
  Purpose: AI never loses user context — always knows what was discussed
```

#### New Table: `platformContext`

```typescript
platformContext: defineTable({
  key: v.string(),             // "main" — single global context record
  version: v.string(),         // "v1.2.0" — track changes
  content: v.string(),         // The full platform context text (markdown)
  modules: v.any(),            // { leads: { description, tools }, deals: {...} }
  rules: v.array(v.string()),  // What AI can/cannot do
  updatedBy: v.id("users"),    // platform_admin only
  updatedAt: v.number(),
})
.index("by_key", ["key"])
```

#### Context Injection at Runtime

```typescript
// convex/ai/systemPrompt.ts — buildSystemPrompt()
async function buildSystemPrompt(ctx, userId, orgId, currentRoute) {
  // 1. Global platform context (same for everyone)
  const platform = await ctx.db.query("platformContext")
    .withIndex("by_key", q => q.eq("key", "main")).unique();

  // 2. Org context (this specific org's config)
  const org = await ctx.db.get(orgId);
  const pipelines = await ctx.db.query("pipelines")
    .withIndex("by_org_and_entity", q => q.eq("orgId", orgId));
  const fieldDefs = await ctx.db.query("fieldDefinitions")
    .withIndex("by_org_and_entity", q => q.eq("orgId", orgId));

  // 3. User context (this user's role + permissions)
  const member = await getOrgMember(ctx, userId, orgId);
  const role = await ctx.db.get(member.roleId);

  // 4. Current page context (what they're looking at right now)
  // currentRoute passed from frontend: "/dashboard/[orgSlug]/deals"

  return `
${platform.content}  ← Global Orbitly platform rules

ORG: ${org.name} | INDUSTRY: ${org.settings.industry}
YOUR ROLE: ${role.name} | PERMISSIONS: ${role.permissions.join(", ")}
CURRENT PAGE: ${currentRoute}  ← AI knows what user is looking at
PIPELINES: ${JSON.stringify(pipelines.map(p => ({ name: p.name, stages: p.stages })))}
CUSTOM FIELDS: ${JSON.stringify(fieldDefs.map(f => ({ name: f.name, label: f.label, type: f.type })))}
  `;
}
```

#### Context Recovery When Window Is Full

```typescript
// When aiMessages count > threshold (e.g., 50 messages):
// 1. AI is prompted: "Summarize the key facts from this conversation"
// 2. Summary stored in aiConversations.contextSummary
// 3. Older messages archived (kept in DB, removed from context window)
// 4. Next call: summary + recent messages (not full history)
// 5. If user asks "what did we discuss about that lead last week?":
//    → AI calls searchAIHistory(query) tool
//    → Tool searches aiMessages table for that org+user
//    → Returns relevant past messages
//    → AI answers with full context restored
```

---

### B. AI Boundary Rules — Platform-Enforced, Task-Aware

**Status**: 🟢 COMPLETE

#### The Rule: "Does this serve the user's CRM/business work?"

| Query Type | AI Action | Reason |
|---|---|---|
| Generic questions (jokes, general knowledge, recipes) | ❌ Decline politely | Outside platform scope |
| Generic web search ("what is the weather") | ❌ Decline | Not task-related |
| Lead research ("search web for SaaS founders in Dubai") | ✅ Execute | Direct CRM value |
| Competitive research ("find competitors of Acme Corp") | ✅ Execute | Supports deal context |
| Reddit scraping for leads | ✅ Execute | Direct CRM value |
| Google Maps scraping for businesses | ✅ Execute | Direct CRM value |
| "Draft a cold email for this lead" | ✅ Execute | Task completion |
| Industry research ("what are common pain points for recruitment agencies") | ✅ Execute | AI persona needs this |

#### Decline Message (when user asks off-topic)

```
User: "Can you write me a poem?"
AI: "I'm focused on helping you with Orbitly — your CRM and business workflows.
     I'm not able to help with general tasks outside that scope.
     Is there something I can help you with in your pipeline, leads, or deals?"
```

---

### C. AI Web Scraping — Bring External Data INTO CRM

**Status**: 🟢 COMPLETE (Phase 3 Feature)

> This is a **major differentiator**. No other CRM at this price point lets AI actively go out to the web and pull leads in. This is the product's killer feature alongside AI Workspace Setup.

#### Architecture

```
User request → AI understands intent → AI calls Trigger.dev task
  → Trigger.dev job runs (Playwright / Firecrawl / API)
  → Scrapes/searches target source
  → Returns structured results
  → AI presents results as preview table in chat
  → User selects which ones to import (button selection, not typing)
  → AI calls createLead() for each approved record
  → Leads stored with source: "web_scrape" + sourceUrl
  → Activity logged: "AI scraped 12 leads from Reddit r/entrepreneur"
```

#### Supported Scraping Sources (Phase 3 onwards)

| Source | Method | What it finds |
|---|---|---|
| Reddit | Reddit API + Firecrawl | Posts mentioning pain points, services needed |
| Google Maps | Maps API / Playwright | Businesses by location + category |
| Google Search | SerpAPI / Firecrawl | Companies, contacts, relevant pages |
| HackerNews | HN API | Founders, "Ask HN" posts, job postings |
| LinkedIn | Playwright (carefully) | Profiles, company pages (rate-limit aware) |
| Any URL | Firecrawl | User gives URL → AI extracts contact/company info |
| JustDial / Sulekha | Playwright | Indian business directories |
| Company websites | Firecrawl | About pages → extract contact info |

#### Example Flows

```
Flow 1 — Reddit Lead Scraping:
User: "Search r/entrepreneur for people saying they need a CRM or struggling with client management"
AI: "Scanning Reddit... Found 8 relevant posts."
    [Table: Username | Post snippet | Relevance | Subreddit]
    "Should I create leads for all 8, or which ones?"
User: [Selects 5]
AI: "Creating 5 leads with source: Reddit... Done. Opening leads page."

Flow 2 — Google Maps Business Scraping:
User: "Find dental clinics in Dubai and store them as leads"
AI: "Searching Google Maps for dental clinics in Dubai...
     Found 23 businesses."
    [Table: Business Name | Address | Phone | Rating | Website]
    "I'll add all 23 as leads. Should I proceed? [Add All] [Select] [Cancel]"
User: [Add All]
AI: "Added 23 leads with source: google_maps, location: Dubai."

Flow 3 — URL Extraction:
User: "Go to acmecorp.com/team and extract the leadership team as contacts"
AI: "Scanning acmecorp.com/team...
     Found: John Smith (CEO), Sarah Lee (CTO), Mike Brown (VP Sales)"
    "Should I add these as contacts linked to Acme Corp?"
User: [Yes]
AI: "Created 3 contacts linked to Acme Corp."
```

#### New AI Tools for Web Scraping (add to Module 31 Tool Registry)

```
Web Scraping Tools (Phase 3):
  scrapeWebPage(url, extractionGoal)
    → Calls Firecrawl → returns structured data → AI presents preview

  searchWebForLeads(query, source, location?)
    → Calls Trigger.dev search job → returns lead candidates

  scrapeGoogleMaps(query, location)
    → Trigger.dev → Maps API → business list with contact info

  scrapeReddit(subreddit, query, intent)
    → Reddit API → filtered posts → user profiles as leads

  scrapeFromURL(url, entityType)
    → Firecrawl → extract contacts/companies from any URL
```

#### Trigger.dev Tasks for Scraping

```typescript
// trigger/scraping/scrapeWebLeads.ts
export const scrapeWebLeads = task({
  id: "scrape-web-leads",
  run: async ({ source, query, location, orgId, userId }) => {
    // source: "google_maps" | "reddit" | "google_search" | "url"
    const results = await runScraper(source, query, location);
    // Returns: [{ name, email?, phone?, website?, sourceUrl, raw }]
    return results;
  }
});
```

#### Important Limits & Ethics

- Always show preview before storing — user approves every import
- Rate limiting on scraping jobs (not spamming target sites)
- `sourceUrl` stored on every scraped lead for reference
- LinkedIn scraping: conservative, respects robots.txt, falls back to manual
- Platform_owner can enable/disable specific scraping sources per tier
- Pro+ feature — not available on Free/Starter (platform_owner configurable)

---

### D. Entity Slot System — Fixed Slots + Label Rename (Updated from Q4)

**Status**: 🟢 COMPLETE (replaces earlier Q4 answer)

> **Decision**: Instead of truly dynamic entity tables OR fully hardcoded entities, we use **fixed entity slots** — a set of predefined slots in the schema, each with visibility toggle + full label/icon renaming. AI can activate and rename slots on request.

#### The 6 Entity Slots

```typescript
// orgSettings.entityVisibility — all 6 slots, same schema:
{
  lead:    { visible: true,  singular: "Lead",     plural: "Leads",     icon: "🎯", description: "Inbound prospects" },
  contact: { visible: true,  singular: "Contact",  plural: "Contacts",  icon: "👤", description: "Qualified people" },
  deal:    { visible: true,  singular: "Deal",     plural: "Deals",     icon: "💰", description: "Revenue opportunities" },
  company: { visible: true,  singular: "Company",  plural: "Companies", icon: "🏢", description: "B2B accounts" },
  // Two extra slots — hidden by default, activated + renamed per industry:
  entity5: { visible: false, singular: "Entity 5", plural: "Entities",  icon: "📋", description: "" },
  entity6: { visible: false, singular: "Entity 6", plural: "Entities",  icon: "📋", description: "" },
}
```

#### How Extra Slots Work Per Industry

| Industry | entity5 | entity6 |
|---|---|---|
| Real Estate | Property (🏠) | Listing (📄) |
| E-commerce | Product (📦) | Supplier (🏭) |
| Recruitment | Job Opening (📋) | — |
| Healthcare | Patient (🏥) | — |
| Freelancer | — (hidden) | — (hidden) |
| B2B Sales | — (hidden) | — (hidden) |

#### In the Database

Each slot maps to its OWN DB table — already pre-created:

```
leads     → slot: "lead"
contacts  → slot: "contact"
deals     → slot: "deal"
companies → slot: "company"
entity5s  → slot: "entity5"  ← new table, same structure as companies
entity6s  → slot: "entity6"  ← new table, same structure as companies
```

`entity5s` and `entity6s` tables: same schema as `companies` (name, orgId, assignedTo, fieldValues linkage, activity logs, notes). They share the same code infrastructure — the only difference is the `entityType` value used in fieldDefinitions, pipelines, notes, etc.

#### AI Can Activate Slots

```
User: "We need a Properties module for real estate listings"
AI: "I'll activate an entity slot and set it up as Properties.
     What fields should Properties have?
     Suggested: Address, Area (sqft), Price, Property Type, Bedrooms
     [Use suggested] [Customize] [Skip fields for now]"
User: [Use suggested]
AI: "Properties module is now active with 5 default fields.
     You'll see it in your sidebar. Want me to set up a pipeline for Properties too?"
```

#### Why NOT Fully Dynamic New Tables

- New DB tables at runtime = migration risk, schema unpredictability
- We'd need to re-generate TypeScript types dynamically → breaks type safety
- 6 slots covers 99% of small business use cases
- Slot tables are pre-created → instant activation, zero migration
- If client needs a 7th entity in the future → we add `entity7s` table in a code release (rare, not runtime)

---

## ✅ Follow-Up Questions — All Answered

### Q1: Industry Templates — Priority + Productivity Added

**Answer (Session 21):**
1. B2B Sales / CRM (first, primary)
2. Freelancer / Solo (second)
3. **Productivity** (third — added per request)
4. Agency, Recruitment, E-commerce, Real Estate (Phase 4+ via AI scaffolding)

**AI-Created Industries**: AI can create a new industry template when asked. Owner describes their workflow → AI generates pipeline stages, field definitions, entity labels, AI persona → user approves → seeded. Premium tiers get this capability. Configurable from platform_owner portal.

### Q2: Billing Provider

**Answer**: **LemonSqueezy (global MoR) + Razorpay (India UPI)**
- LemonSqueezy handles global customers, tax compliance (GST, VAT), subscriptions automatically
- Razorpay handles Indian customers with UPI and local payment methods
- Both are India-friendly for the founder side
- Long-term: LemonSqueezy's 5% MoR fee vs manual Stripe tax management — LemonSqueezy wins on simplicity at this stage

### Q3: Lead → Contact Architecture

**Answer**: **Separate tables with links.**
- `leads` table stays as-is when converted — gets `convertedAt` + `contactId` link
- New `contacts` row created with lead data copied + expanded contact fields
- Full traceability: contact → where it came from (which lead)
- Dedup engine runs at both lead creation and contact creation (reused engine)

### Q4: Companies Module — Optional Per Industry

**Answer**: Yes — works via nav toggle (`entityVisibility.company`). Freelancers hide it.

For industries that need a different entity type entirely (e.g., "Properties" for Real Estate instead of "Companies"):
- **For v1**: Handle via custom field definitions + entity renaming ("Company" → "Property")
- **Dynamic entity types (new tables)**: Skip — too complex for now. This is Salesforce territory.
- AI can help users work around it: "Rename Companies to Properties and add these fields..."
- **Phase 4+ decision**: Re-evaluate if multiple paying clients request true dynamic entity types

### Q5: Platform Owner Dashboard — Timing

**Answer**:
- Build the **base first** with full AI integration
- Platform_owner admin panel = **single place, built once** (Phase 4+)
- The base MUST support dynamic configuration everywhere — no hardcoded values. Everything reads from `platformTiers` and `orgSettings` tables
- When we build the admin panel, we write at that single place and it propagates everywhere
- This means: every tier limit, every feature flag, every pricing value MUST be a DB read, not a constant in code

### Q6: Staleness — Per-Pipeline

**Answer**: **Per-pipeline** for simplicity in v1. `staleAfterDays` field on the pipeline record (not per stage, not per org). Configurable in pipeline settings UI.

### Q7: Next.js Version Scan

**Answer**: Scan later. Note for pre-build:
- Next.js 16 (current in stack) has App Router features worth using
- Scan `/Users/shaikumarfarooq/Clones/next-shadcn-admin-dashboard` for Next.js patterns to adopt
- Do NOT block code architecture on this — note it as a pre-build reference scan

### Q8: Landing Page + Waitlist

**Answer**: **Yes — Phase 0.5 (before Phase 1 shell).**
- Use shadcnstore + shadboard components for landing page sections
- Import components from shadcn libraries as needed
- Plan: content structure done (see Module 0 above)
- When anyone visits → they understand exactly what they're getting
- Waitlist captures emails → stored in Convex `waitlist` table → platform_owner views from admin

### Q9: Dedup Engine — Contacts Too

**Answer**: **Yes — run dedup for contacts as well.** Same engine. Write once, use everywhere. No separate dedup code for leads vs contacts. The dedup engine is a shared utility: `convex/ai/tools/dedup.ts` — call it wherever needed.

### Q10: Role-Based Field Visibility — Defer

**Answer**: Schema supports it now (`visibleToRoles` on fieldDefinition). UI enforcement deferred to Phase 4+. Write the field at schema level now so we don't need a migration later.

---

## 🏁 Final Verdict — Can You Proceed to Code Architecture Planning?

### **YES. ABSOLUTELY. PROCEED NOW.**

Here is why the base plan is complete and approved:

#### ✅ What's Fully Decided (0 open questions remaining)

| Category | Status |
|---|---|
| Entity architecture (separate tables + links) | ✅ Decided |
| Database schema (all tables designed) | ✅ Designed |
| RBAC system (dynamic roles + permissions) | ✅ Designed + coded (Phase 0 done) |
| AI architecture (Vercel AI SDK + Convex internalAction) | ✅ Decided |
| AI model strategy (swappable + task-based routing) | ✅ Decided |
| Billing providers (LemonSqueezy + Razorpay) | ✅ Decided |
| Industry templates (config-driven + AI-customizable) | ✅ Decided |
| Industry priority (B2B → Freelancer → Productivity) | ✅ Decided |
| Pipeline architecture (per-org, per-entity, dynamic stages) | ✅ Decided |
| Staleness (per-pipeline) | ✅ Decided |
| Dedup engine (shared, leads + contacts) | ✅ Decided |
| Notes → Activity Timeline replacement | ✅ Decided |
| Communications → entity activity pages | ✅ Decided |
| Landing page + waitlist (Phase 0.5) | ✅ Planned |
| All 34 modules + 10 follow-up questions | ✅ Answered |

#### ✅ What's Already Built (Phase 0 complete)

- Convex base tables deployed
- Auth (Google OAuth + email/password)
- Full RBAC (102 tests, 0 failures)
- Invitations module
- Activity logs + notifications helpers
- All production quality gaps resolved
- `pnpm typecheck` 0 errors, `pnpm build` 0 errors

#### 🚀 What Code Architecture Planning Covers Next

When you go into code architecture planning, focus on:

1. **Folder structure finalization** — features/, convex/, app/ — already partially done in `folder-structure.md`
2. **Component hierarchy** — which components are shared vs feature-specific
3. **Data flow patterns** — Convex query → React hook → Component
4. **State management boundaries** — what goes in Convex vs Zustand vs URL
5. **Build order sequencing** — exact order of files to create in Phase 1
6. **Reference codebase extraction plan** — what to copy from next-shadcn-admin-dashboard vs shadboard vs build from scratch

#### Core Product Philosophy (Baked into Every Decision)

> **"The dashboard adapts to the client's requirements. Clients do NOT adapt to the dashboard."**

This means:
- Every limit is dynamic (DB-driven, platform_owner controls)
- Every label is renamable
- Every pipeline is configurable
- Every stage is AI-addable
- Every industry template is AI-customizable
- The AI understands YOUR industry, not a generic one

**You have a complete, production-grade base plan. Start code architecture. Build.**

---

*Last Updated: Session 22 — 2026-04-24*
*All 34 modules: 🟢 COMPLETE*
*Follow-up Questions: 10/10 answered*
*Session 22 Additions: AI context architecture, web scraping, entity slots — all locked*
*Status: APPROVED FOR CODE ARCHITECTURE PLANNING*

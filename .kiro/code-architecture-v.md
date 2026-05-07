# Orbitly — Code Architecture Bible
## All 36 Modules · Single-Function AI+Manual Pattern · MCP-Ready Design
> **Created by scanning**: PLAN.md, deep-plan.md, folder-structure.md, schema.md, rbac.md,
tech-stack.md, rules.md, context.md, todos.md, and all MODULE.md files.
**Purpose**: Lock code architecture before Phase 1 build begins. Never revisit structure.
**Last Updated**: 2026-05-02
---
## 🔑 The Core Architectural Principle (Read This First)
### The "One Function, Three Callers" Rule
Every backend function in this project is written ONCE and called by THREE different callers:
```
Convex Mutation / Query (the single source of truth)
    │
    ├── 1. UI Components (React) — manual human workflow
    │       useQuery(api.leads.list) / useMutation(api.leads.create)
    │
    ├── 2. AI Tools (Phase 3) — AI-native workflow
    │       ctx.runMutation(internal.leads.create, { ...parsedArgs })
    │
    └── 3. MCP Server (Future) — external agent/automation workflow
            Same internal mutation, different transport layer
```
**The implication**: When you write `convex/leads/mutations.ts::create`, you are NOT writing a "UI mutation." You are writing **the canonical way to create a lead in Orbitly.** The UI uses it. The AI uses it. A future MCP server will use it. This is why correctness, validation, RBAC, logging, and notification firing all happen INSIDE the mutation — never in the caller.
---
## 🏗️ Global Architecture Decisions (Locked)
|Decision|Value|Why|
|---|---|---|
|Auth derivation|`ctx.user._id` / `ctx.org._id` only|Client can spoof args — never trust|
|Data isolation|`orgId` on EVERY row|Multi-tenancy enforcement at DB level|
|AI tool pattern|Thin wrapper → calls same `internalMutation`|Single source of truth|
|State management|Convex = server state, Zustand = UI-only state|Never mix|
|Pipeline stages|Dynamic from DB, never hardcoded|Industry-adaptable|
|Field definitions|EAV via `fieldValues` table|Infinitely extensible|
|Role checking|DB lookup from `orgRoles` table|Dynamic roles (Phase 1 refactor)|
|Activity logging|`logActivity()` in every mutation|Audit trail, AI context|
|MCP readiness|`internalQuery`/`internalMutation` = future MCP transport|Zero re-write|
---
## 📁 Final Folder Structure (Lock This In)
```
flowbite/
│
├── app/                          # Next.js routes — THIN ONLY (no logic here)
│   └── [locale]/
│       ├── layout.tsx            # Root layout + providers
│       ├── page.tsx              # Landing page (Phase 0.5)
│       ├── signin/ signup/       # Auth pages
│       ├── pricing/              # Public pricing page
│       ├── onboarding/           # 3-step wizard (no sidebar)
│       ├── dashboard/
│       │   ├── layout.tsx        # Auth guard only
│       │   └── [orgSlug]/
│       │       ├── layout.tsx    # Org resolver + DashboardLayout
│       │       ├── page.tsx      # Dashboard home
│       │       ├── leads/        # Thin route → imports from core/entities/leads/
│       │       ├── contacts/
│       │       ├── companies/
│       │       ├── deals/
│       │       ├── settings/     # All settings sub-routes
│       │       └── [entity]/     # entity5, entity6 dynamic slots
│       └── portal/               # Phase 9 — separate layout
│
├── core/                         # NECESSITIES — never feature-gated
│   ├── shell/                    # App chrome (layout, nav, guards)
│   ├── entities/                 # All 6 entity types + 4 shared scaffolds
│   ├── ai/                       # Phase 3 AI chat panel
│   ├── settings/                 # All settings pages
│   ├── csv-import/               # Import wizard
│   ├── kanban/                   # @dnd-kit primitives
│   ├── datatable/                # @tanstack/react-table primitives
│   ├── timelines/                # Unified + Activity Chat timelines
│   ├── notifications/            # Bell + dropdown
│   ├── onboarding/               # 3-step wizard components
│   └── command-palette/          # Cmd+K
│
├── features/                     # UPGRADES — can be plan-gated
│   ├── _registry.ts              # Feature registration + flag lookup
│   ├── industry-templates/       # Config bundles (b2b-sales.ts, freelancer.ts, etc.)
│   ├── project-management/       # Phase 8
│   ├── client-portal/            # Phase 9
│   ├── integrations/             # Phase 6
│   └── ai-automation/            # Phase 7
│
├── convex/                       # Backend — ALL data logic lives here
│   ├── schema.ts                 # Single schema file
│   ├── _shared/                  # validators, types, constants, errors, permissions
│   ├── _functions/               # authenticated, admin, system builders
│   ├── users/ orgs/ invitations/ # Phase 0 (done)
│   ├── notifications/ activityLogs/ # Phase 0 (done)
│   ├── pipelines/                # Phase 2
│   ├── fieldDefinitions/ fieldValues/ # Phase 2
│   ├── leads/ contacts/ companies/ deals/ # Phase 2
│   ├── entity5/ entity6/         # Phase 2 (optional slots)
│   ├── notes/ reminders/ tags/ savedViews/ # Phase 2
│   ├── dedup/                    # Phase 2 (shared engine)
│   ├── activityChat/             # Phase 4
│   ├── ai/                       # Phase 3 AI core
│   │   ├── processChat.ts        # internalAction — AI runtime
│   │   ├── systemPrompt.ts       # Dynamic prompt builder
│   │   ├── toolRegistry.ts       # Role → tool mapping
│   │   ├── conversations.ts      # Conversation CRUD
│   │   └── tools/                # 10+ tool handlers
│   ├── projects/ tasks/ milestones/ # Phase 8
│   ├── conversations/ messages/  # Phase 4
│   ├── integrations/             # Phase 6
│   └── platform/                 # Platform admin queries
│
├── trigger/                      # Background jobs
│   ├── imports/processCSVImport.ts
│   ├── scraping/scrapeWebLeads.ts
│   ├── crons/morningBriefing.ts
│   └── emails/sendTransactional.ts
│
├── lib/                          # Frontend shared utilities
│   ├── hooks/useAppRouter.ts     # Always use this, never hardcode locale
│   └── utils/cn.ts               # tailwind-merge utility
│
├── messages/                     # i18n bundles
│   ├── en.json
│   └── ar.json                   # Phase 8
│
└── stores/                       # Zustand stores (UI state ONLY)
    └── chatStore.ts              # AI panel open state
```
---
## ⚙️ The "Single Function" Pattern — Detailed Explanation
This is the most important architectural decision in the entire project. Here is exactly how to implement it:
### Step 1 — Write the Canonical Mutation (the only implementation)
```typescript
// convex/leads/mutations.ts
import { orgMutation } from "../_functions/authenticated";
import { logActivity } from "../activityLogs/helpers";
import { sendNotification } from "../notifications/helpers";
import { requirePermission } from "../_shared/permissions";
import { runDedup } from "../dedup/helpers";
import { v } from "convex/values";

export const create = orgMutation({
  args: {
    displayName: v.string(),
    email: v.optional(v.string()),
    source: v.string(),           // "manual" | "csv" | "ai" | "whatsapp"
    pipelineId: v.id("pipelines"),
    assignedTo: v.optional(v.id("users")),
    fieldValues: v.optional(v.array(v.object({
      fieldId: v.id("fieldDefinitions"),
      value: v.any(),
    }))),
    // actorType is derived from context, NOT passed by caller
  },
  handler: async (ctx, args) => {
    // ① RBAC — same check for UI, AI, MCP
    await requirePermission(ctx, "leads.create");

    // ② Dedup check — same for UI, AI, MCP
    const dupes = await runDedup(ctx, { email: args.email, name: args.displayName });
    if (dupes.length > 0) {
      // Return early with dupe info — caller decides what to do
      // UI: shows DedupBanner
      // AI: shows disambiguation cards in chat
      // MCP: returns dupes in response payload
      return { id: null, duplicates: dupes };
    }

    // ③ Core insert — same for all callers
    const leadId = await ctx.db.insert("leads", {
      orgId: ctx.org._id,
      displayName: args.displayName,
      email: args.email,
      source: args.source,
      pipelineId: args.pipelineId,
      currentStageId: await getDefaultStageId(ctx, args.pipelineId),
      assignedTo: args.assignedTo,
      stageEnteredAt: Date.now(),
      quickCode: await generateQuickCode(ctx, args.displayName),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    // ④ Dynamic field values — same for all callers
    if (args.fieldValues) {
      for (const fv of args.fieldValues) {
        await ctx.db.insert("fieldValues", {
          orgId: ctx.org._id,
          entityType: "lead",
          entityId: leadId,
          fieldId: fv.fieldId,
          fieldName: await getFieldName(ctx, fv.fieldId),
          value: fv.value,
          updatedAt: Date.now(),
        });
      }
    }

    // ⑤ Activity log — actorType auto-detected from ctx
    // If called from AI tool: ctx.actorType === "ai"
    // If called from UI: ctx.actorType === "user"
    await logActivity(ctx, {
      action: "lead.created",
      entityType: "lead",
      entityId: leadId,
      description: `Lead "${args.displayName}" created`,
      // actorType and userId auto-injected from ctx
    });

    // ⑥ Notification — same for all callers
    if (args.assignedTo) {
      await sendNotification(ctx, {
        to: args.assignedTo,
        templateKey: "lead.assigned",
        vars: { leadName: args.displayName },
        entityType: "lead",
        entityId: leadId,
      });
    }

    return { id: leadId, duplicates: [] };
  },
});
```
### Step 2 — UI Calls It Directly
```typescript
// core/entities/leads/hooks/useLeads.ts
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";

export function useLeadMutations() {
  const createLead = useMutation(api.leads.create);

  return {
    create: async (data: CreateLeadInput) => {
      const result = await createLead(data);
      if (result.duplicates.length > 0) {
        // Show DedupBanner in UI
        showDedupModal(result.duplicates);
        return null;
      }
      return result.id;
    },
  };
}
```
### Step 3 — AI Tool Calls the SAME Internal Mutation
```typescript
// convex/ai/tools/create.ts
import { tool } from "ai";
import { z } from "zod";

export const createEntityTool = tool({
  description: "Create a new lead, contact, or deal in the CRM",
  parameters: z.object({
    entityType: z.enum(["lead", "contact", "deal", "company"]),
    data: z.object({
      displayName: z.string(),
      email: z.string().optional(),
      pipelineId: z.string().optional(),
    }),
  }),
  execute: async ({ entityType, data }, { ctx, userId, orgId }) => {
    // AI tool calls the SAME internal mutation — zero duplication
    const result = await ctx.runMutation(internal.leads.create, {
      ...data,
      source: "ai",  // ← only difference: source tells us it came from AI
    });

    if (result.duplicates.length > 0) {
      // AI handles dupes differently: shows cards in chat
      return {
        type: "disambiguation",
        message: "I found existing leads that might match:",
        options: result.duplicates.map(d => ({
          id: d.id,
          label: d.displayName,
          detail: d.email,
        })),
      };
    }

    return {
      type: "success",
      message: `Created lead "${data.displayName}"`,
      id: result.id,
      preview: { ...data }, // shown in ChatToolCall card
    };
  },
});
```
### Step 4 — MCP Server (Future) Uses the SAME Query/Mutation
```typescript
// future/mcp/server.ts — zero rewrite, just a new transport layer
import { ConvexHttpClient } from "convex/browser";
import { api, internal } from "@/convex/_generated/api";

// MCP tools are thin wrappers around existing Convex queries/mutations
export const mcpToolHandlers = {
  create_lead: {
    inputSchema: { /* same as leads.create args */ },
    handler: async (args: any, { orgId, userId }) => {
      // Calls THE SAME mutation — no new code
      return await convex.mutation(api.leads.create, args);
    },
  },
  search_crm: {
    inputSchema: { query: string, entityType?: string },
    handler: async (args: any) => {
      // Calls THE SAME query
      return await convex.query(api.search.global, args);
    },
  },
};
```
**The key insight**: MCP readiness costs ZERO extra work. Because AI tools already call `internalMutation` / `internalQuery`, an MCP server just adds a new transport adapter. All validation, RBAC, logging, and business logic is already inside the Convex functions.
---
## 📦 Module-by-Module Code Architecture
---
### Module 0 — Landing Page & Waitlist (Phase 0.5)
**Location**: `app/[locale]/page.tsx` (sections imported from `components/landing/`)
**Architecture**: Static Next.js page + one Convex mutation for waitlist.
```
app/[locale]/
├── page.tsx                    # Landing page (assembles sections)
│
components/landing/
├── HeroSection.tsx
├── ProblemSection.tsx
├── HowItWorksSection.tsx
├── FeaturesGrid.tsx
├── PricingPreview.tsx
├── WaitlistForm.tsx            # ← only dynamic part
├── FAQSection.tsx
└── FooterSection.tsx

convex/
├── schema.ts                   # Add waitlist table
└── waitlist/
    ├── queries.ts              # listAll() — platform_admin only
    └── mutations.ts            # join(email, name?, industry?) — PUBLIC (no auth)
```
**Waitlist mutation pattern** (one of the few PUBLIC mutations):
```typescript
// convex/waitlist/mutations.ts
export const join = mutation({
  args: {
    email: v.string(),
    name: v.optional(v.string()),
    industry: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Check duplicate email
    const existing = await ctx.db.query("waitlist")
      .withIndex("by_email", q => q.eq("email", args.email))
      .first();
    if (existing) return { alreadyJoined: true };

    await ctx.db.insert("waitlist", { ...args, createdAt: Date.now() });
    return { alreadyJoined: false };
  },
});
```
**Questions for review**:
- [ ] Q0-A: Do you want a referral code / UTM tracking field on the waitlist?
- [ ] Q0-B: Should the waitlist confirmation email be sent immediately (Resend) or batched daily?
- [ ] Q0-C: Do you want an admin view of the waitlist in the platform dashboard before Phase 4+ platform admin is built?
**Suggestion**: Build the landing page in Phase 0.5 BEFORE touching any dashboard code. Use shadboard landing sections. Ship it to collect real emails while you build Phase 1.
---
### Module 1 — Roles & RBAC (Phase 1 — RBAC Refactor)
**Location**: `convex/_shared/permissions.ts`, `convex/orgRoles/`
**Architecture**: `orgMembers.roleId` (FK) → `orgRoles` table (permissions array). Dynamic.
```
convex/
├── _shared/
│   ├── permissions.ts          # hasPermission(), requirePermission(), PERMISSION_KEYS
│   └── constants.ts            # DEFAULT_SYSTEM_ROLES, PERMISSION_CATEGORIES
│
└── orgRoles/
    ├── queries.ts              # listByOrg(), getById()
    └── mutations.ts            # create(), update(), delete() — owner only

core/settings/pages/
└── RolesManager.tsx            # GitHub-style UI — permission checkboxes by category
```
**The permission check function** — called identically by UI hooks, AI tools, and future MCP:
```typescript
// convex/_shared/permissions.ts

// This function is called IDENTICALLY whether triggered by:
// - UI (orgMutation handler)
// - AI tool (internalMutation handler)
// - Future MCP (same internalMutation)
export async function requirePermission(
  ctx: MutationCtx | QueryCtx,
  permission: string
): Promise<void> {
  // 1. Get member's roleId
  const member = await ctx.db.query("orgMembers")
    .withIndex("by_orgId_and_userId", q =>
      q.eq("orgId", ctx.org._id).eq("userId", ctx.user._id))
    .first();
  if (!member) throw new ConvexError(ERRORS.FORBIDDEN);

  // 2. Load role from DB (dynamic — no hardcoded map)
  const role = await ctx.db.get(member.roleId);
  if (!role) throw new ConvexError(ERRORS.FORBIDDEN);

  // 3. Check permission
  if (!role.permissions.includes(permission)) {
    throw new ConvexError(ERRORS.FORBIDDEN);
  }
}

// AI tool wrapper respects the same check:
export async function getToolsForRole(
  ctx: ActionCtx,
  userId: Id<"users">,
  orgId: Id<"orgs">
): Promise<ToolName[]> {
  const role = await ctx.runQuery(internal.orgRoles.getForUser, { userId, orgId });
  // Filter tools based on role.permissions BEFORE calling Claude
  return ALL_TOOLS.filter(tool => TOOL_PERMISSION_MAP[tool] in role.permissions);
}
```
**Frontend permission hook** (called ONCE, derived from DB):
```typescript
// core/shell/hooks/useOrgPermission.ts
export function useOrgPermission(permission: string): boolean {
  const role = useQuery(api.orgRoles.getMyRole); // loads role from DB
  return role?.permissions.includes(permission) ?? false;
}

// Usage in components:
const canCreate = useOrgPermission("leads.create");
if (!canCreate) return null;
```
**Questions for review**:
- [ ] Q1-A: The RBAC refactor changes `orgMembers.role` (string) → `orgMembers.roleId` (FK). This is a **breaking migration**. Do you want to run both in parallel during transition, or do a hard cut?
- [ ] Q1-B: Should AI role creation (`setupRoles` tool) be available in Phase 3 or deferred to Phase 7?
**Alternatives**:
* Option A: Keep string roles, add `permissions` lookup table (simpler, less flexible)
* **Option B (RECOMMENDED)**: `orgRoles` table with `permissions[]` array (what's planned) — fully dynamic, zero code changes for new permissions
* Option C: CASL library for permission management (over-engineered for this scale)
---
### Module 2 — Org Rules & Multi-tenancy (Phase 0 — done + Phase 1 extensions)
**Location**: `convex/orgs/`, `convex/platform/`
**Architecture**: Every query derives `orgId` from authenticated context. Platform tiers stored in DB.
```
convex/
├── orgs/
│   ├── queries.ts              # getBySlug(), getSettings(), getEntityLabels()
│   ├── mutations.ts            # updateSettings(), updateEntityLabels(), softDelete()
│   └── helpers.ts             # requireOrgMember(), getOrgTier(), checkFeatureEnabled()
│
└── platform/
    ├── queries.ts              # getPlatformTiers(), getFeatureForTier()
    └── mutations.ts            # updateTier() — platform_admin only
```
**The feature gate** — used identically by UI, AI tools, and MCP:
```typescript
// convex/orgs/helpers.ts
export async function checkFeatureEnabled(
  ctx: QueryCtx | MutationCtx,
  orgId: Id<"orgs">,
  feature: string
): Promise<void> {
  const org = await ctx.db.get(orgId);
  const tier = await ctx.db.query("platformTiers")
    .withIndex("by_name", q => q.eq("name", org.plan))
    .first();

  if (!tier?.features[feature]) {
    throw new ConvexError(ERRORS.PLAN_REQUIRED);
  }
}

// AI Tool wrapper respects the same gate:
// In AI tool execute():
//   await ctx.runQuery(internal.orgs.checkFeature, { feature: "ai.full" })
//   → same check, throws same error
//   → AI returns: "This feature requires a Pro plan. Want me to show you upgrade options?"
```
**Entity label system** — dynamic, reads from DB:
```typescript
// Never hardcode "Lead" in UI — always:
const labels = useQuery(api.orgs.getEntityLabels); // { lead: { singular: "Inquiry", ... } }
const leadLabel = labels?.lead.singular ?? "Lead";
```
**Questions for review**:
- [ ] Q2-A: Should `platformTiers` be seeded via a migration script or managed entirely from the platform admin UI?
- [ ] Q2-B: When an org is suspended (failed payment), should the AI assistant still respond with "your account is suspended" or go completely dark?
- [ ] Q2-C: For white-label: should branding (logo, colors) be stored in Convex `orgs` table or in environment variables? **Recommendation: Both** — env vars for platform-level branding, Convex for per-org branding.
---
### Module 3 — Dashboard Shell & Layout (Phase 1)
**Location**: `core/shell/layouts/DashboardLayout.tsx`
**Architecture**: 3-pane layout (sidebar + content + AI panel). Config-driven sidebar.
```
core/shell/
├── config/
│   └── navigation.ts           # SINGLE SOURCE — all nav items, icons, guards, badges
├── layouts/
│   └── DashboardLayout.tsx     # Sidebar + TopNav + main + AI panel slot
├── components/
│   ├── AppSidebar.tsx          # Reads from navigation.ts + entity visibility
│   ├── TopNav.tsx              # Breadcrumb + Cmd+K trigger + bell + user menu
│   ├── UserMenu.tsx            # Avatar dropdown (settings, profile, billing, signout)
│   ├── NotificationBell.tsx    # Unread count + dropdown trigger
│   ├── WorkspaceSwitcher.tsx   # Org switching (multi-org users)
│   ├── ModuleGuard.tsx         # Feature flag gate — wraps plan-gated content
│   └── ThemeSwitcher.tsx       # dark/light/system + preset colors
└── hooks/
    ├── useViewToggle.ts        # 'list' | 'board' synced to URL ?view=
    └── useModuleEnabled.ts     # Reads featureFlags from Convex
```
**Navigation config** — the single source of truth that drives everything (sidebar, module guards, route guards, AI context detection):
```typescript
// core/shell/config/navigation.ts
export type NavItem = {
  id: string;
  labelKey: string;            // i18n key
  labelArKey?: string;         // Arabic i18n key
  icon: LucideIcon;
  href: string;
  badge?: "count" | "new";     // dynamic badge type
  entitySlot?: EntitySlot;     // "lead" | "contact" | ... for label override
  featureFlag?: string;        // gates visibility via ModuleGuard
  permission?: string;         // gates visibility via RBAC
  phase?: number;              // used in dev to hide unbuilt items
};

export const NAV_ITEMS: NavItem[] = [
  {
    id: "dashboard",
    labelKey: "nav.dashboard",
    icon: LayoutDashboard,
    href: "/dashboard/[orgSlug]",
  },
  {
    id: "leads",
    labelKey: "nav.leads",
    icon: Target,
    href: "/dashboard/[orgSlug]/leads",
    badge: "count",
    entitySlot: "lead",          // label replaced by orgSettings.entityLabels.lead
    permission: "leads.view",
  },
  // ... contacts, deals, companies
  {
    id: "projects",
    labelKey: "nav.projects",
    icon: KanbanSquare,
    href: "/dashboard/[orgSlug]/projects",
    featureFlag: "project_management", // hidden until Phase 8 flag enabled
    phase: 8,
  },
];
```
**The layout** — AI panel is a slot:
```typescript
// core/shell/layouts/DashboardLayout.tsx
export function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { isAIPanelOpen } = useChatStore();

  return (
    <div className="flex h-screen">
      <AppSidebar />
      <div className="flex flex-1 flex-col">
        <TopNav />
        <main className={cn(
          "flex-1 overflow-auto p-6",
          isAIPanelOpen && "lg:mr-[400px]" // shift content when AI panel open
        )}>
          {children}
        </main>
      </div>
      {isAIPanelOpen && <ChatSheet />} {/* Phase 3 — AI panel */}
    </div>
  );
}
```
**Questions for review**:
- [ ] Q3-A: Should the AI panel width be fixed (400px) or resizable by the user? **Recommendation: resizable with a min/max via a drag handle**
- [ ] Q3-B: On mobile, should the sidebar be a drawer (default shadcn Sheet) or bottom navigation tabs for key items?
---
### Module 4 — Navigation & Module System (Phase 1)
**Location**: `core/shell/config/navigation.ts` + `core/shell/components/ModuleGuard.tsx`
**Architecture**: Config-driven. `ModuleGuard` reads `featureFlags` from Convex. No code change needed to add/remove features.
```typescript
// core/shell/components/ModuleGuard.tsx
interface ModuleGuardProps {
  featureFlag: string;
  children: React.ReactNode;
  fallback?: React.ReactNode; // shown when locked (upgrade badge)
}

export function ModuleGuard({ featureFlag, children, fallback }: ModuleGuardProps) {
  const isEnabled = useModuleEnabled(featureFlag);
  if (isEnabled) return <>{children}</>;
  return fallback ? <>{fallback}</> : null;
}

// In sidebar nav item:
<NavItem
  item={item}
  suffix={
    item.featureFlag ? (
      <ModuleGuard featureFlag={item.featureFlag} fallback={<UpgradeBadge />}>
        {null}
      </ModuleGuard>
    ) : null
  }
/>
```
**Badge count system** — real-time, single query:
```typescript
// core/shell/hooks/useNavBadgeCounts.ts
export function useNavBadgeCounts() {
  // Single query returns ALL badge counts at once — not N separate queries
  return useQuery(api.orgs.getNavBadgeCounts);
  // Returns: { leads: 3, notifications: 12, tasksDueToday: 5 }
}
```
---
### Module 5 — Dashboard Home Page (Phase 1)
**Location**: `app/[locale]/dashboard/[orgSlug]/page.tsx`
**Architecture**: Single Convex query returns all dashboard data. Industry-specific metrics from config.
```
app/[locale]/dashboard/[orgSlug]/
└── page.tsx                    # Thin — imports DashboardHome from below

core/shell/components/dashboard/
├── DashboardHome.tsx           # Assembles all cards
├── MetricCardGrid.tsx          # Industry-specific metric cards
├── AIMorningBriefing.tsx       # Phase 3 — AI briefing card
├── GetStartedCard.tsx          # Dismissible checklist
├── RecentActivityFeed.tsx      # Last 10 activity log items
└── StaleDealsBanner.tsx        # Quick win banner

convex/orgs/
└── queries.ts                  # getDashboardStats() — single query, no N+1
```
**Dashboard stats query** — ONE query, no sequential fetches:
```typescript
// convex/orgs/queries.ts
export const getDashboardStats = orgQuery({
  handler: async (ctx) => {
    const [
      leadCount,
      dealsInProgress,
      dealsPipelineValue,
      staleDeals,
      tasksDueToday,
      recentActivity,
    ] = await Promise.all([
      ctx.db.query("leads").withIndex("by_org", q => q.eq("orgId", ctx.org._id))
        .take(1), // just count — optimize with a counter doc pattern later
      // ... parallel queries
    ]);

    // Industry-specific metrics are FILTERED here based on org.settings.industry
    // Not hardcoded — config-driven from features/industry-templates/
    return buildMetricsForIndustry(ctx.org.settings.industry, {
      leadCount, dealsInProgress, staleDeals,
    });
  },
});
```
**Questions for review**:
- [ ] Q5-A: Should the "Get Started" card be dismissible per-user or per-org? **Recommendation: per-user** — stored on `users.dismissedCards[]`
- [ ] Q5-B: Should metric cards link directly to filtered list views? (e.g., "Stale Deals" card → leads to Deals page with stale filter pre-applied) **Recommendation: YES** — this drives engagement
---
### Module 6 — Onboarding Flow (Phase 1)
**Location**: `core/onboarding/` + `app/[locale]/onboarding/`
**Architecture**: 3-step wizard. State in DB (resumable). Industry picker seeds default pipeline.
```
core/onboarding/
├── components/
│   ├── OnboardingWizard.tsx    # Step container + progress dots
│   ├── OrgNameStep.tsx         # Step 1: org name + slug + role title
│   ├── IndustryPicker.tsx      # Step 2: industry grid → seeds pipeline
│   └── CompleteStep.tsx        # Step 3: done → redirect to dashboard
└── hooks/
    └── useOnboarding.ts        # Step state management

convex/orgs/
└── mutations.ts                # completeOnboarding() — sets onboardingCompleted: true
                                # Seeds DEFAULT pipeline from industry config
```
**Industry picker seeding** — reads from config, not hardcoded:
```typescript
// core/onboarding/hooks/useOnboarding.ts
async function selectIndustry(industry: IndustryKey) {
  // Calls mutation that reads from features/industry-templates/[industry].ts
  await completeOnboarding({
    industry,
    // Pipeline stages + default field definitions seeded server-side
    // from features/industry-templates/[industry].ts config
  });
}

// convex/orgs/mutations.ts::completeOnboarding
export const completeOnboarding = orgMutation({
  args: { industry: v.string() },
  handler: async (ctx, args) => {
    // Load industry config (B2B Sales, Freelancer, Dubai RE, etc.)
    const template = INDUSTRY_TEMPLATES[args.industry];

    // Seed default pipeline for this industry
    await ctx.db.insert("pipelines", {
      orgId: ctx.org._id,
      entityType: "deal",
      name: template.defaultPipelineName,
      isDefault: true,
      stages: template.defaultStages,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    // Update org settings
    await ctx.db.patch(ctx.org._id, {
      "settings.industry": args.industry,
      "settings.onboardingCompleted": true,
      updatedAt: Date.now(),
    });

    // Mark user as onboarded
    await ctx.db.patch(ctx.user._id, {
      onboardingCompleted: true,
    });
  },
});
```
**Questions for review**:
- [ ] Q6-A: Should onboarding be skippable? If user skips, do they still get a default pipeline? **Recommendation: Not skippable for industry picker** — minimum viable setup. Skip is fine for the complete step.
- [ ] Q6-B: Do you want to show a progress indicator (percentage) in onboarding, or just step dots?
---
### Module 7 — Notifications System (Phase 0 — done, extensions in Phase 2)
**Location**: `convex/notifications/helpers.ts` (done), `core/notifications/` (Phase 1 UI)
**Architecture**: Notification helper is already built. Phase 1 adds the UI components.
```
convex/notifications/
└── helpers.ts                  # sendNotification() — already done ✅

core/notifications/
├── components/
│   ├── NotificationDropdown.tsx  # GitHub-style bell dropdown
│   └── NotificationItem.tsx      # Single notification with icon + time
└── hooks/
    └── useNotifications.ts       # useQuery + real-time subscription
```
**The notification hook** — real-time via Convex subscription:
```typescript
// core/notifications/hooks/useNotifications.ts
export function useNotifications() {
  const { unread, all } = useQuery(api.notifications.listMine) ?? {};

  const markRead = useMutation(api.notifications.markRead);
  const markAllRead = useMutation(api.notifications.markAllRead);

  return { unread, all, markRead, markAllRead };
}
// This is automatically real-time — no polling, no WebSocket setup.
// Convex reactivity handles it.
```
**Questions for review**:
- [ ] Q7-A: Should notification preferences (which types to receive) be settable per-user in Phase 2, or deferred to a later phase?
- [ ] Q7-B: Should the notification dropdown show unread only, or all (with read ones greyed out)?
---
### Module 8 — Activity Logs (Phase 0 — done, UI in Phase 1-2)
**Location**: `convex/activityLogs/helpers.ts` (done), `core/timelines/unified-timeline/` (Phase 2 UI)
**Architecture**: `logActivity()` helper is already built. Call it from every mutation with the correct `actorType`. The `actorType` field distinguishes human vs AI vs system actions.
**The critical convention** — actorType detection:
```typescript
// convex/activityLogs/helpers.ts
// The actorType is derived from context, NOT passed by caller
// When called from an orgMutation triggered by UI: actorType = "user"
// When called from an internalMutation triggered by AI tool: actorType = "ai"
// When called from a cron/scheduled action: actorType = "system"
// When called from an integration webhook handler: actorType = "integration"

// This means the SAME logActivity() call works for all 4 actorTypes.
// The AI doesn't need special logging — it logs as "ai" automatically.
```
**Questions for review**:
- [ ] Q8-A: Should activity logs be paginated or infinite-scroll in the UI?
- [ ] Q8-B: For the per-entity Activity tab on detail pages, should it show ALL activity types or only the ones relevant to that entity? **Recommendation: ALL by default, with filter chips to show/hide types**
---
### Module 9 — Org Management Pages (Phase 1)
**Location**: `core/settings/pages/`
**Architecture**: Each settings page is a separate component. All role-gated via `<PermissionGate>`. All settings are in `core/settings/` — they are NEVER plan-gated (only role-gated).
```
core/settings/
├── MODULE.md
├── layouts/
│   └── SettingsLayout.tsx       # Settings sidebar nav (sub-nav within settings)
└── pages/
    ├── GeneralSettings.tsx      # Org name, logo, timezone — admin+
    ├── MembersPage.tsx          # List, invite, change roles — admin+
    ├── RolesManager.tsx         # Permission picker — owner only
    ├── BillingPage.tsx          # Plan + usage — owner only
    ├── PipelineSettings.tsx     # Pipeline CRUD — admin+
    ├── FieldSettings.tsx        # Field builder — admin+
    ├── TagSettings.tsx          # Tag CRUD — admin+
    ├── EntityLabels.tsx         # Rename entities — admin+ (Pro+ feature)
    ├── AppearanceSettings.tsx   # Theme, font — any role
    └── ActivityLogSettings.tsx  # Audit log — admin+
```
**Role-gating in settings** — every page wraps with PermissionGate:
```typescript
// core/settings/pages/BillingPage.tsx
export function BillingPage() {
  return (
    <PermissionGate permission="org.billing" fallback={<ForbiddenState />}>
      {/* billing UI */}
    </PermissionGate>
  );
}
```
**Questions for review**:
- [ ] Q9-A: Should the members page include a "Last Active" column? This requires tracking `users.lastActiveAt` in the DB. Worth adding?
- [ ] Q9-B: For the danger zone (org deletion), should there be a 24-hour email verification step before soft-delete is executed?
---
### Module 10 — Pricing Page (Phase 0.5)
**Location**: `app/[locale]/pricing/page.tsx`
**Architecture**: Reads `platformTiers` from Convex. Fully dynamic — platform_admin changes price, page auto-reflects.
```typescript
// app/[locale]/pricing/page.tsx
// This is a SERVER COMPONENT — fetches tiers at request time (or ISR)
export default async function PricingPage() {
  // Uses Convex HTTP client for server-side fetch
  const tiers = await convexHttp.query(api.platform.getPublicTiers);
  return <PricingGrid tiers={tiers} />;
}
```
**Questions for review**:
- [ ] Q10-A: Should pricing be server-rendered (fresh every request), statically generated (ISR, revalidate every hour), or client-rendered (React with useQuery)? **Recommendation: ISR with 1-hour revalidation** — pricing doesn't change that often, and static is faster.
---
### Module 11 — Error & Empty States (Phase 1)
**Location**: `components/states/`
**Architecture**: Unified empty state component with AI suggestion slot. Unified loader component.
```
components/states/
├── EmptyState.tsx              # Illustration + title + CTA + optional AI suggestion
├── ErrorState.tsx              # Error boundary fallback
├── LoadingSkeleton.tsx         # Skeleton loader (entity-list, kanban, detail)
└── ForbiddenState.tsx          # Wrong role / plan required

// Usage:
<EmptyState
  icon={<Target />}
  title="No leads yet"
  description="Add your first lead to get started"
  action={<Button onClick={onAdd}>Add Lead</Button>}
  aiSuggestion="Would you like me to import leads from a CSV?"  // Phase 3
/>
```
---
### Module 12 — i18n & RTL Foundation (Phase 1)
**Location**: `i18n/`, `messages/`
**Architecture**: `next-intl` with `[locale]` routing. RTL via `dir` attribute on `<html>`. Tailwind logical properties only.
```
i18n/
├── routing.ts                  # Locale routing config
└── request.ts                  # Server-side locale detection

messages/
├── en.json                     # English (complete)
└── ar.json                     # Arabic (Phase 8, stub keys in Phase 1)

// RTL rule — NEVER use ml-4, pr-2. ALWAYS use ms-4, pe-2:
// ✅ className="ms-4 pe-2"     (logical — flips in RTL)
// ❌ className="ml-4 pr-2"     (physical — breaks in RTL)
```
**AI language rule**:
```typescript
// convex/ai/systemPrompt.ts
// AI responds in the user's locale — NOT the UI language toggle
// This is determined from the system prompt, not hardcoded
const userLocale = member.preferredLanguage ?? "en";
return `
...
RESPONSE LANGUAGE: ${userLocale}. Always respond in this language regardless of UI language.
...
`;
```
**Questions for review**:
- [ ] Q12-A: For Arabic UI, should numbers be rendered in Arabic-Indic format (٢٣٤) or Western Arabic (234)? **Recommendation: Western Arabic (234)** — more universal in Gulf B2B
- [ ] Q12-B: Should RTL layout be auto-detected from browser locale or always require explicit user selection?
---
### Module 13 — Auth Flow Details (Phase 0 — done)
**Location**: `app/[locale]/signin/`, `app/[locale]/signup/`
**Architecture**: `@convex-dev/auth` handles everything. Post-login redirect logic is the main concern.
```typescript
// middleware.ts — post-login redirect
export async function middleware(request: NextRequest) {
  const isAuthenticated = await getSession(request);
  if (!isAuthenticated) return redirect("/signin");

  // Read last-visited org from cookie
  const lastOrgSlug = request.cookies.get("lastOrgSlug")?.value;

  if (lastOrgSlug) {
    return redirect(`/dashboard/${lastOrgSlug}`);
  }

  // New user — check if onboarding completed
  // If not → /onboarding
  // This check happens in the dashboard layout, not middleware
  return redirect("/dashboard");
}
```
---
### Module 14 — Default Industry Templates (Phase 2)
**Location**: `features/industry-templates/config/`
**Architecture**: Config-driven TypeScript files. NOT DB tables. Seeded at org creation. AI can customize AFTER seeding.
```
features/industry-templates/
├── MODULE.md
├── _base/                      # Shared template types
│   └── types.ts                # IndustryTemplate type
└── config/
    ├── b2b-sales.ts
    ├── freelancer.ts
    ├── productivity.ts
    ├── real-estate.ts           # Dubai RE — first industry (context.md)
    └── index.ts                 # INDUSTRY_TEMPLATES map
```
**Template type** — the schema every template must implement:
```typescript
// features/industry-templates/_base/types.ts
export type IndustryTemplate = {
  key: string;                          // "b2b_sales" | "dubai_re" etc.
  name: string;
  description: string;
  entityLabels: Partial<EntityLabels>;  // override defaults
  entityVisibility: EntityVisibility;   // which entity slots visible
  defaultPipelineName: string;
  defaultStages: PipelineStage[];       // for deals pipeline
  defaultFieldDefinitions: FieldDefinitionSeed[]; // custom fields to seed
  dashboardMetrics: MetricKey[];        // which KPIs to show
  aiPersona: string;                    // AI system prompt addition
  navHiddenSlots: EntitySlot[];         // e.g., freelancer hides company
};

// features/industry-templates/config/real-estate.ts
export const DUBAI_RE_TEMPLATE: IndustryTemplate = {
  key: "dubai_re",
  name: "Dubai Real Estate",
  defaultStages: [
    { id: "new_inquiry", name: "New Inquiry", order: 0, color: "#3b82f6" },
    { id: "viewing", name: "Viewing", order: 1, color: "#8b5cf6" },
    { id: "offer_mou", name: "Offer / MOU", order: 2, color: "#f59e0b" },
    { id: "form_f", name: "Form F", order: 3, color: "#ef4444" },
    { id: "ejari", name: "Ejari", order: 4, color: "#10b981" },
    { id: "handover", name: "Handover", order: 5, color: "#6366f1", isFinal: true, finalType: "positive" },
    { id: "active_tenancy", name: "Active Tenancy", order: 6, staleAfterDays: 95 },
    { id: "lost", name: "Lost", order: 7, isFinal: true, finalType: "negative" },
  ],
  defaultFieldDefinitions: [
    { name: "budget_aed", label: "Budget (AED)", type: "currency", groupName: "Financial" },
    { name: "property_type", label: "Property Type", type: "select",
      options: ["Apartment", "Villa", "Townhouse", "Office", "Retail"], groupName: "Property" },
    { name: "bedrooms", label: "Bedrooms", type: "select",
      options: ["Studio", "1BR", "2BR", "3BR", "4BR", "5BR+"], groupName: "Property" },
    { name: "rera_number", label: "RERA Number", type: "text", groupName: "Compliance" },
    { name: "lease_expiry_date", label: "Lease Expiry Date", type: "date",
      showInStages: ["active_tenancy"], groupName: "Compliance" }, // only shown in Active Tenancy
  ],
  aiPersona: "You are a Dubai real estate CRM expert. You understand Dubai rental market, RERA regulations, Ejari contracts, and the UAE property buying process.",
};
```
**Questions for review**:
- [ ] Q14-A: Should industry templates be ONLY config files (never in DB), or should platform_admin be able to create new templates from the admin panel (stored in a `platformTemplates` table)?
- [ ] Q14-B: For Dubai RE specifically, should the "95-day rent alert" cron job be in Phase 3 or Phase 7?
**Suggestion**: Add `platformTemplates` table in Phase 4 so platform_admin can define new industries from the admin panel without code deploys. For now, TypeScript config files are sufficient and simpler.
---
### Module 15 — Pipelines & Stages (Phase 2)
**Location**: `convex/pipelines/`
**Architecture**: Pipelines stored in DB. Stages are an array within each pipeline document. AI can add stages. Kanban reads stages dynamically.
```
convex/pipelines/
├── queries.ts                  # listByOrg(), getDefault(entityType), getById()
├── mutations.ts                # create(), update(), addStage(), reorderStages(), delete()
└── helpers.ts                  # validateStageTransition(), seedDefaults(), getDefaultStageId()
```
**The stage management system** — same for UI and AI:
```typescript
// convex/pipelines/mutations.ts
export const addStage = orgMutation({
  args: {
    pipelineId: v.id("pipelines"),
    stage: v.object({
      name: v.string(),
      color: v.optional(v.string()),
      order: v.number(),
      isFinal: v.boolean(),
      finalType: v.optional(v.union(v.literal("positive"), v.literal("negative"), v.literal("neutral"))),
      staleAfterDays: v.optional(v.number()),
    }),
  },
  handler: async (ctx, args) => {
    await requirePermission(ctx, "pipelines.manage");
    const pipeline = await ctx.db.get(args.pipelineId);

    // Generate a unique stage ID
    const stageId = `stage_${args.stage.name.toLowerCase().replace(/\s+/g, "_")}_${Date.now()}`;

    await ctx.db.patch(args.pipelineId, {
      stages: [...pipeline.stages, { ...args.stage, id: stageId }],
      updatedAt: Date.now(),
    });

    await logActivity(ctx, {
      action: "pipeline.stage_added",
      entityType: "pipeline",
      entityId: args.pipelineId,
      description: `Stage "${args.stage.name}" added to pipeline`,
    });

    return stageId;
  },
});

// AI Tool calling this SAME mutation:
// convex/ai/tools/workspace.ts
const setupPipelineTool = tool({
  description: "Add a new stage to an existing pipeline",
  parameters: z.object({ pipelineId: z.string(), stageName: z.string(), isFinal: z.boolean() }),
  execute: async ({ pipelineId, stageName, isFinal }) => {
    const stageId = await ctx.runMutation(internal.pipelines.addStage, {
      pipelineId, stage: { name: stageName, order: 999, isFinal }
    });
    return { success: true, stageId, message: `Stage "${stageName}" added!` };
  },
});
```
---
### Module 16 — Dynamic Fields System (Phase 2) — CRITICAL ARCHITECTURE
**Location**: `convex/fieldDefinitions/`, `convex/fieldValues/`
**Architecture**: EAV (Entity-Attribute-Value). Field DEFINITIONS define the schema. Field VALUES store the data. Both UI and AI use the same read/write patterns.
```
convex/
├── fieldDefinitions/
│   ├── queries.ts      # listByEntity(entityType) — backend filters by showInStages
│   └── mutations.ts    # create(), update(), delete(), reorder()
└── fieldValues/
    ├── queries.ts       # getForEntity(entityType, entityId) — returns key-value map
    └── mutations.ts     # upsert() — set a field value (creates or updates)
```
**Stage-aware field query** (Approach B — backend filters):
```typescript
// convex/fieldDefinitions/queries.ts
export const listForEntity = orgQuery({
  args: {
    entityType: v.string(),
    currentStageId: v.optional(v.string()), // current stage of the record
  },
  handler: async (ctx, args) => {
    const allFields = await ctx.db.query("fieldDefinitions")
      .withIndex("by_org_and_entity", q =>
        q.eq("orgId", ctx.org._id).eq("entityType", args.entityType))
      .collect();

    if (!args.currentStageId) return allFields;

    // Backend filters: show field if showInStages is empty OR includes current stage
    return allFields.filter(f =>
      !f.showInStages || f.showInStages.length === 0 ||
      f.showInStages.includes(args.currentStageId!)
    );
    // Client receives ONLY relevant fields — zero filtering needed in UI
  },
});
```
**The DynamicFieldRenderer** — renders any entity's fields:
```typescript
// core/entities/shared/components/DynamicFieldRenderer.tsx
interface DynamicFieldRendererProps {
  fields: FieldDefinition[];       // from listForEntity query
  values: Record<string, any>;     // from getForEntity query
  onUpdate: (fieldId: string, value: any) => void;
  readOnly?: boolean;
}

export function DynamicFieldRenderer({ fields, values, onUpdate, readOnly }: DynamicFieldRendererProps) {
  // Groups fields by groupName, renders appropriate input per type
  const grouped = groupBy(fields, f => f.groupName ?? "Other");

  return Object.entries(grouped).map(([group, groupFields]) => (
    <FieldGroup key={group} title={group}>
      {groupFields.map(field => (
        <FieldInput
          key={field._id}
          field={field}
          value={values[field.name]}
          onChange={(value) => onUpdate(field._id, value)}
          readOnly={readOnly}
        />
      ))}
    </FieldGroup>
  ));
}
```
**AI reads field definitions** — in system prompt:
```typescript
// convex/ai/systemPrompt.ts
const fieldDefs = await ctx.db.query("fieldDefinitions")
  .withIndex("by_org_and_entity", q => q.eq("orgId", orgId))
  .collect();

// Non-sensitive fields injected into AI system prompt:
const fieldsForAI = fieldDefs
  .filter(f => !f.sensitive) // never include PII fields in AI prompts for non-admin
  .map(f => `${f.name} (${f.label}): ${f.type}${f.options ? ` [${f.options.join(", ")}]` : ""}`);

return `
AVAILABLE CUSTOM FIELDS:
${fieldsForAI.join("\n")}

When creating or updating records, use these field names exactly.
`;
```
**Questions for review**:
- [ ] Q16-A: Should there be a limit on the number of field groups (sections) per entity? **Recommendation: No code limit** — visual limit is reasonable (5-6 groups max before it gets overwhelming), but enforce via UI guidance, not code.
- [ ] Q16-B: Should field values be validated on the backend (Convex) or only on the frontend? **Recommendation: Both** — frontend for UX (instant feedback), backend as source of truth.
---
### Modules 17-20 — Entity Modules (Leads, Contacts, Companies, Deals)
**Location**: `core/entities/[entity]/` + `convex/[entity]/`
**Architecture**: All 4 entities (plus entity5, entity6) follow IDENTICAL patterns. Build the scaffold ONCE, configure per-entity.
```
// EVERY entity module has this IDENTICAL structure:
core/entities/[entity]/
├── types.ts                    # Doc<"[entity]"> derived type
├── hooks/
│   ├── use[Entity]s.ts        # useQuery + filter state
│   └── use[Entity]Columns.ts  # Column definitions (extends base columns)
└── components/
    ├── [Entity]List.tsx        # Thin → passes config to EntityListPage scaffold
    ├── [Entity]Board.tsx       # Kanban view → passes config to KanbanBoard
    ├── [Entity]Card.tsx        # Extends EntityCard base
    ├── [Entity]Detail.tsx      # Thin → passes tabs config to EntityDetailPage scaffold
    └── Add[Entity]Dialog.tsx   # Create form → passes fields config to EntityFormDialog scaffold
```
**The scaffold pattern** — write once, use 6x:
```typescript
// core/entities/leads/components/LeadList.tsx
// This is 30 lines max — just configuration

export function LeadList() {
  const { data: leads } = useLeads();         // custom hook
  const columns = useLeadColumns();            // custom column defs
  const { labels } = useEntityLabels("lead"); // dynamic labels

  return (
    <EntityListPage
      title={labels.plural}              // "Leads" or "Inquiries" or whatever org named it
      columns={columns}
      data={leads}
      onAddClick={() => setOpen(true)}
      views={["list", "board"]}          // leads supports both
      BoardCard={LeadCard}               // custom card for kanban
      emptyState={
        <EmptyState
          title={`No ${labels.plural} yet`}
          aiSuggestion={`Would you like me to import ${labels.plural} from a CSV?`}
        />
      }
    />
  );
}
// That's it. EntityListPage handles: toolbar, search, filters, view toggle,
// column visibility, pagination, bulk actions, loading skeleton.
```
**The entity backend** — identical across all entities:
```typescript
// convex/leads/queries.ts — same pattern for contacts, companies, deals
export const list = orgQuery({
  args: {
    pipelineId: v.optional(v.id("pipelines")),
    stageId: v.optional(v.string()),
    assignedTo: v.optional(v.id("users")),
    search: v.optional(v.string()),
    take: v.optional(v.number()),
    cursor: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Never use .collect() — always paginate
    let query = ctx.db.query("leads")
      .withIndex("by_org", q => q.eq("orgId", ctx.org._id));

    if (args.stageId) {
      query = ctx.db.query("leads")
        .withIndex("by_org_and_stage", q =>
          q.eq("orgId", ctx.org._id).eq("currentStageId", args.stageId!));
    }

    const page = await query.paginate({ numItems: args.take ?? 50, cursor: args.cursor ?? null });
    return page;
  },
});
```
**Lead-specific: conversion flow**:
```typescript
// convex/leads/mutations.ts
export const convertToContact = orgMutation({
  args: {
    leadId: v.id("leads"),
    createDeal: v.boolean(),
    dealTitle: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requirePermission(ctx, "leads.convert");
    const lead = await ctx.db.get(args.leadId);

    // 1. Create contact (copies lead data)
    const contactId = await ctx.db.insert("contacts", {
      orgId: ctx.org._id,
      leadId: args.leadId,          // traceability
      displayName: lead.displayName,
      email: lead.email,
      assignedTo: lead.assignedTo,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    // 2. Copy field values from lead → contact
    await copyFieldValues(ctx, "lead", args.leadId, "contact", contactId);

    // 3. Mark lead as converted (never delete)
    await ctx.db.patch(args.leadId, {
      convertedAt: Date.now(),
      contactId,
      updatedAt: Date.now(),
    });

    // 4. Optionally create deal
    if (args.createDeal) {
      const defaultPipeline = await getDefaultPipeline(ctx, "deal");
      await ctx.db.insert("deals", {
        orgId: ctx.org._id,
        title: args.dealTitle ?? `Deal with ${lead.displayName}`,
        contactId,
        pipelineId: defaultPipeline._id,
        currentStageId: defaultPipeline.stages[0].id,
        stageEnteredAt: Date.now(),
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    }

    await logActivity(ctx, { action: "lead.converted", entityType: "lead", entityId: args.leadId, description: `Converted to contact` });
    return { contactId };
  },
});
```
**Deal-specific: won flow + analytics**:
```typescript
// convex/deals/mutations.ts
export const closeAsDone = orgMutation({
  args: { dealId: v.id("deals"), finalStageId: v.string() },
  handler: async (ctx, args) => {
    const deal = await ctx.db.get(args.dealId);
    const pipeline = await ctx.db.get(deal.pipelineId);
    const stage = pipeline.stages.find(s => s.id === args.finalStageId);

    await ctx.db.patch(args.dealId, {
      currentStageId: args.finalStageId,
      wonAt: stage?.finalType === "positive" ? Date.now() : undefined,
      lostAt: stage?.finalType === "negative" ? Date.now() : undefined,
      updatedAt: Date.now(),
    });

    // Phase 8: trigger project auto-creation if won
    if (stage?.finalType === "positive") {
      await ctx.scheduler.runAfter(0, internal.projects.autoCreateFromDeal, { dealId: args.dealId });
    }

    await logActivity(ctx, { action: "deal.closed", entityType: "deal", entityId: args.dealId });
  },
});
```
**Questions for review**:
- [ ] Q17-A: Should converted leads be **visible** in the leads list with a "Converted" badge, or **hidden** by default (accessible via filter)? **Recommendation: Hidden by default** with a "Show Converted" filter toggle.
- [ ] Q17-B: For the Deals kanban, should the deal VALUE be visible on the card by default, or hidden (revenue sensitivity)? **Recommendation: Controlled by ****`deals.viewValues`**** permission** — off by default for members.
- [ ] Q20-A: Should "Won" deals trigger a confetti animation? **Recommendation: YES** — add via `canvas-confetti` package, triggered client-side after mutation resolves.
---
### Module 21 — Activity Timeline (Notes + Feed) (Phase 2)
**Location**: `core/timelines/`
**Architecture**: TWO separate systems. Unified Timeline (RBAC audit log) + Activity Chat (people + AI on-behalf).
```
core/timelines/
├── unified-timeline/           # Everything logged — RBAC-scoped
│   ├── components/
│   │   ├── UnifiedTimeline.tsx
│   │   ├── TimelineEntry.tsx
│   │   ├── TimelineFilters.tsx
│   │   └── NoteComposer.tsx    # TipTap editor for notes
│   └── hooks/
│       └── useUnifiedTimeline.ts # Composite: activityLogs + notes + reminders
│
└── activity-chat/              # People conversations + AI on-behalf
    ├── components/
    │   ├── ActivityChat.tsx
    │   ├── ChatMessage.tsx     # "Sent by AI on behalf of [User]" badge
    │   └── ChatComposer.tsx
    └── hooks/
        └── useActivityChat.ts  # Real-time Convex subscription
```
**Composite timeline query** — single query merges all sources:
```typescript
// convex/activityLogs/queries.ts
export const getEntityTimeline = orgQuery({
  args: { entityType: v.string(), entityId: v.string() },
  handler: async (ctx, args) => {
    const [activityLogs, notes, reminders] = await Promise.all([
      ctx.db.query("activityLogs")
        .withIndex("by_entityType_and_entityId", q =>
          q.eq("entityType", args.entityType).eq("entityId", args.entityId))
        .collect(),
      ctx.db.query("notes")
        .withIndex("by_entity", q =>
          q.eq("orgId", ctx.org._id).eq("entityType", args.entityType).eq("entityId", args.entityId))
        .collect(),
      ctx.db.query("reminders")
        .withIndex("by_entity", q =>
          q.eq("orgId", ctx.org._id).eq("entityType", args.entityType).eq("entityId", args.entityId))
        .collect(),
    ]);

    // RBAC filtering:
    // - Internal notes: only for users with notes.viewInternal permission
    const canViewInternal = await hasPermission(ctx, "notes.viewInternal");
    const filteredNotes = notes.filter(n => !n.isInternal || canViewInternal);

    // Merge and sort chronologically
    return [
      ...activityLogs.map(e => ({ ...e, __type: "activity" })),
      ...filteredNotes.map(n => ({ ...n, __type: "note" })),
      ...reminders.map(r => ({ ...r, __type: "reminder" })),
    ].sort((a, b) => b.createdAt - a.createdAt);
  },
});
```
**Notes are created the same way by users and AI**:
```typescript
// convex/notes/mutations.ts
export const create = orgMutation({
  args: {
    entityType: v.string(),
    entityId: v.string(),
    content: v.string(),
    authorType: v.union(v.literal("user"), v.literal("ai")),
    isInternal: v.boolean(),
    isPinned: v.boolean(),
  },
  handler: async (ctx, args) => {
    const noteId = await ctx.db.insert("notes", {
      orgId: ctx.org._id,
      entityType: args.entityType,
      entityId: args.entityId,
      content: args.content,
      authorId: ctx.user._id,
      authorType: args.authorType,  // "user" or "ai"
      isInternal: args.isInternal,
      isPinned: args.isPinned,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    await logActivity(ctx, { action: "note.created", entityType: args.entityType, entityId: args.entityId });
    return noteId;
  },
});

// AI tool uses the SAME mutation with authorType: "ai"
// UI uses the SAME mutation with authorType: "user"
```
---
### Module 22 — Reminders & Follow-ups (Phase 2)
**Location**: `convex/reminders/`
**Architecture**: Reminders stored in DB. Checked by cron (Phase 7) and surfaced by AI (Phase 3). Same create mutation for UI and AI.
```typescript
// convex/reminders/mutations.ts
export const create = orgMutation({
  args: {
    entityType: v.string(),
    entityId: v.string(),
    dueAt: v.number(),
    note: v.optional(v.string()),
    assignedTo: v.id("users"),
  },
  handler: async (ctx, args) => {
    await requirePermission(ctx, "reminders.create");
    const reminderId = await ctx.db.insert("reminders", {
      orgId: ctx.org._id,
      ...args,
      completedAt: undefined,
      createdAt: Date.now(),
    });

    await sendNotification(ctx, {
      to: args.assignedTo,
      templateKey: "reminder.created",
      vars: { dueAt: formatDate(args.dueAt) },
    });

    await logActivity(ctx, { action: "reminder.created", entityType: args.entityType, entityId: args.entityId });
    return reminderId;
  },
});

// AI tool to auto-suggest follow-ups:
// convex/ai/tools/reminders.ts — calls internal.reminders.create
// with actorType "ai" automatically logged
```
---
### Module 23 — Tags System (Phase 2)
**Location**: `convex/tags/`
**Architecture**: `tags` table (org-wide definitions) + `entityTags` junction table. Tags are reusable across all entity types.
```typescript
// convex/tags/queries.ts
export const listByOrg = orgQuery({
  handler: async (ctx) =>
    ctx.db.query("tags").withIndex("by_org", q => q.eq("orgId", ctx.org._id)).collect()
});

// core/entities/shared/components/TagPicker.tsx
// Used in entity forms, entity list rows, bulk actions
// Same component everywhere — tags are entity-type agnostic
```
---
### Module 24 — Saved Views (Phase 2)
**Location**: `convex/savedViews/`, `core/entities/shared/hooks/useSavedViews.ts`
**Architecture**: Filter state serialized as JSON and stored in DB. Pinned views appear in sidebar.
```typescript
// convex/savedViews/mutations.ts
export const create = orgMutation({
  args: {
    name: v.string(),
    entityType: v.string(),
    scope: v.union(v.literal("user"), v.literal("org")),
    filters: v.any(),           // serialized FilterState
    isPinned: v.boolean(),
  },
  handler: async (ctx, args) => {
    if (args.scope === "org") {
      await requirePermission(ctx, "views.createOrg");
    }
    // Check tier limit for saved views
    await checkFeatureEnabled(ctx, ctx.org._id, "savedViews");
    return await ctx.db.insert("savedViews", { orgId: ctx.org._id, createdBy: ctx.user._id, ...args });
  },
});
```
---
### Module 25 — Bulk Actions (Phase 2)
**Location**: `core/entities/shared/hooks/useBulkActions.ts`, `core/datatable/`
**Architecture**: Bulk selection in DataTable. Bulk operations are separate mutations (not looping single mutations).
```typescript
// convex/leads/mutations.ts
export const bulkUpdate = orgMutation({
  args: {
    leadIds: v.array(v.id("leads")),
    update: v.object({
      assignedTo: v.optional(v.id("users")),
      stageId: v.optional(v.string()),
      addTagIds: v.optional(v.array(v.id("tags"))),
    }),
  },
  handler: async (ctx, args) => {
    await requirePermission(ctx, "data.bulkActions");
    // Check plan allows bulk actions
    await checkFeatureEnabled(ctx, ctx.org._id, "bulk_actions");

    // Single DB operation — not a loop of single updates
    for (const leadId of args.leadIds) {
      const patches: Partial<Lead> = {};
      if (args.update.assignedTo) patches.assignedTo = args.update.assignedTo;
      if (args.update.stageId) patches.currentStageId = args.update.stageId;
      await ctx.db.patch(leadId, { ...patches, updatedAt: Date.now() });
    }

    await logActivity(ctx, { action: "lead.bulk_updated", entityType: "lead", entityId: "bulk",
      description: `Bulk updated ${args.leadIds.length} leads` });
  },
});

// AI Bulk update: requires CONFIRMATION before executing
// AI shows: "I'm about to update 12 leads. [Confirm] [Cancel]"
// ONLY after user confirms → calls same mutation with actorType: "ai"
```
---
### Module 26 — CSV Import (Phase 2)
**Location**: `core/csv-import/`, `trigger/imports/processCSVImport.ts`
**Architecture**: Upload → Convex stores metadata → Trigger.dev does actual processing. AI assists with field mapping.
```
core/csv-import/
├── components/
│   ├── ImportWizard.tsx        # 5-step container
│   ├── UploadStep.tsx          # Drag-and-drop CSV upload
│   ├── FieldMapper.tsx         # Column → fieldDefinition mapping (AI-assisted)
│   ├── PreviewStep.tsx         # First 5 rows preview
│   ├── DedupOptionsStep.tsx    # Skip / Overwrite / Ask choice
│   └── ProgressStep.tsx        # Real-time job progress

convex/csvImports/
├── queries.ts                  # getImportStatus(importId) — real-time
└── mutations.ts                # initImport(), cancelImport()

trigger/imports/
└── processCSVImport.ts         # The actual processing job
```
**The import flow** — Trigger.dev for background processing:
```typescript
// trigger/imports/processCSVImport.ts
export const processCSVImport = task({
  id: "process-csv-import",
  run: async ({ importId, orgId, entityType, mappings, dedupStrategy }) => {
    // 1. Download CSV from Convex storage
    const file = await downloadFromConvex(importId);

    // 2. Parse rows
    const rows = parseCSV(file);

    // 3. Process each row using the SAME Convex mutations as UI/AI
    const results = await Promise.allSettled(rows.map(async (row) => {
      const mapped = applyMappings(row, mappings);

      if (entityType === "lead") {
        // Uses the SAME canonical create mutation
        return await convex.mutation(api.leads.create, {
          ...mapped,
          source: "csv",     // ← source distinguishes import
        });
      }
    }));

    // 4. Update import status with results
    await convex.mutation(api.csvImports.complete, {
      importId,
      successCount: results.filter(r => r.status === "fulfilled").length,
      failedCount: results.filter(r => r.status === "rejected").length,
    });
  },
});
```
**AI-assisted field mapping**:
```typescript
// core/csv-import/components/FieldMapper.tsx
// When user uploads CSV, AI suggests which columns map to which fields:
const suggestMappings = async (csvHeaders: string[], fieldDefs: FieldDefinition[]) => {
  // Calls a Convex action that uses Claude (lightweight) to match:
  // "first_name" → displayName field
  // "email_address" → email field
  // "deal_amount" → budget_aed field
  const suggestions = await suggestFieldMappings({ csvHeaders, fieldDefs });
  return suggestions; // User reviews and overrides before confirming
};
```
**Questions for review**:
- [ ] Q26-A: Should CSV import support importing to ALL entity types (leads, contacts, deals, companies), or leads + contacts first, then expand?
- [ ] Q26-B: Should the dedup check run during import preview (show which rows are dupes before committing) or only during processing?
---
### Module 27 — Command Palette (Phase 2)
**Location**: `core/command-palette/`
**Architecture**: `cmdk` library (already in shadcn). Single query searches across all entity types. Keyboard shortcuts registered globally.
```typescript
// core/command-palette/components/CommandPalette.tsx
import { Command } from "cmdk";

export function CommandPalette() {
  const [query, setQuery] = useState("");
  const results = useQuery(api.search.global, { query }, { enabled: query.length > 1 });

  return (
    <Command.Dialog>
      <Command.Input value={query} onValueChange={setQuery} />
      <Command.List>
        <Command.Group heading="Records">
          {results?.leads.map(lead => <Command.Item key={lead._id}>...))}
          {results?.contacts.map(c => <Command.Item key={c._id}>...))}
        </Command.Group>
        <Command.Group heading="Actions">
          <Command.Item onSelect={() => navigate("/settings")}>Settings</Command.Item>
          <Command.Item onSelect={() => openAI()}>Open AI Assistant</Command.Item>
        </Command.Group>
      </Command.List>
    </Command.Dialog>
  );
}
```
---
### Module 28 — Unified Timeline (Phase 2)
Already covered in Module 21. The Unified Timeline is the RBAC-scoped chronological feed shown both on entity detail pages AND the `/settings/activity-log` page. Same component, different data scope.
---
### Module 29 — Billing & Payments (Phase 2)
**Location**: `app/api/billing/`, `convex/billing/`
**Architecture**: LemonSqueezy webhook → Convex mutation updates org tier. No billing logic in Convex — just tier management.
```
app/api/billing/
├── checkout/route.ts           # Create LemonSqueezy checkout session
└── webhook/route.ts            # Receive LemonSqueezy events → update Convex

convex/orgs/
└── mutations.ts                # updateBillingStatus() — internalMutation (not public)
```
**Webhook handler**:
```typescript
// app/api/billing/webhook/route.ts
export async function POST(req: Request) {
  const payload = await req.text();
  const signature = req.headers.get("X-Signature");

  // Verify webhook signature
  if (!verifyLemonSqueezySignature(payload, signature)) {
    return new Response("Unauthorized", { status: 401 });
  }

  const event = JSON.parse(payload);

  // Handle subscription events
  if (event.meta.event_name === "subscription_created") {
    await convex.mutation(internal.orgs.updateBillingStatus, {
      lemonSqueezyCustomerId: event.data.attributes.customer_id,
      plan: mapLSPlanToInternalPlan(event.data.attributes.variant_name),
      status: "active",
    });
  }

  if (event.meta.event_name === "subscription_cancelled") {
    await convex.mutation(internal.orgs.updateBillingStatus, {
      lemonSqueezyCustomerId: event.data.attributes.customer_id,
      status: "cancelled",
    });
  }

  return new Response("OK");
}
```
**Questions for review**:
- [ ] Q29-A: Should the trial period automatically start when org is created, or only when the first seat is added?
- [ ] Q29-B: For Razorpay (India UPI): do you want to implement this in Phase 2 alongside LemonSqueezy, or defer to Phase 6?
---
### Module 30 — AI Architecture & Security (Phase 3)
**Location**: `convex/ai/processChat.ts`, `app/api/ai/chat/route.ts`
**Architecture**: Next.js API route = thin streaming proxy. Convex `internalAction` = all AI logic. This separation is critical for security.
```
app/api/ai/chat/
└── route.ts                    # POST — validates auth → calls Convex internalAction → streams

convex/ai/
├── processChat.ts              # internalAction ("use node") — AI runtime
├── systemPrompt.ts             # Dynamic prompt builder (Platform context + Org context + User context + Page context)
├── toolRegistry.ts             # Role → tool mapping (filters BEFORE Claude call)
├── conversations.ts            # Conversation CRUD
└── tools/                      # 10+ tool handlers
```
**The streaming proxy** — THIN (no AI logic here):
```typescript
// app/api/ai/chat/route.ts
export async function POST(req: Request) {
  // 1. Auth from server session — NEVER from body
  const session = await auth.getSession();
  if (!session?.userId) return new Response("Unauthorized", { status: 401 });

  const { messages, conversationId, currentRoute } = await req.json();

  // 2. Forward to Convex internalAction — no AI logic here
  const stream = await convex.action(internal.ai.processChat, {
    userId: session.userId,
    orgId: session.orgId,
    messages,
    conversationId,
    currentRoute,    // ← page context from client
  });

  // 3. Stream response back
  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream" },
  });
}
```
**The AI runtime** — all logic here:
```typescript
// convex/ai/processChat.ts
"use node"; // Required for Node.js runtime (Vercel AI SDK needs it)

export const processChat = internalAction({
  args: {
    userId: v.id("users"),
    orgId: v.id("orgs"),
    messages: v.array(v.any()),
    conversationId: v.optional(v.id("aiConversations")),
    currentRoute: v.string(),
  },
  handler: async (ctx, args) => {
    // ① Build system prompt (org context + user role + page context)
    const systemPrompt = await buildSystemPrompt(ctx, {
      userId: args.userId,
      orgId: args.orgId,
      currentRoute: args.currentRoute,
    });

    // ② Filter tools by role BEFORE calling Claude
    const availableTools = await getToolsForRole(ctx, args.userId, args.orgId);

    // ③ Run Claude with ToolLoopAgent (auto-handles tool loop)
    const result = await streamText({
      model: openai("claude-sonnet-4"), // or model router based on task complexity
      system: systemPrompt,
      messages: args.messages,
      tools: availableTools,
      maxSteps: 10, // max tool call iterations
    });

    // ④ Log every tool call in activity logs
    for (const step of result.steps) {
      for (const toolCall of step.toolCalls) {
        await ctx.runMutation(internal.activityLogs.log, {
          orgId: args.orgId,
          userId: args.userId,
          actorType: "ai",
          action: `ai.tool.${toolCall.toolName}`,
          entityType: toolCall.args.entityType,
          description: `AI used tool: ${toolCall.toolName}`,
        });
      }
    }

    // ⑤ Persist conversation messages
    await ctx.runMutation(internal.ai.conversations.appendMessages, {
      conversationId: args.conversationId,
      messages: result.messages,
    });

    return result.toDataStreamResponse();
  },
});
```
**Model routing** — task-based:
```typescript
// convex/ai/processChat.ts
function selectModel(taskComplexity: "simple" | "standard" | "complex"): string {
  // All configurable from platformTiers — zero hardcoding
  const config = await ctx.runQuery(internal.platform.getAIConfig);
  return config.modelMap[taskComplexity]; // "claude-haiku-3" | "claude-sonnet-4" | "claude-opus-4"
}
```
**Questions for review**:
- [ ] Q30-A: Should message usage be enforced PER REQUEST or at end-of-month billing cycle? **Recommendation: Soft limit** — warn at 80% usage, hard stop at 100% with upgrade prompt.
- [ ] Q30-B: Should the AI have a "debug mode" for development that logs full system prompts and tool calls to Convex? **Recommendation: YES** — behind a `DEBUG_AI=true` env var.
---
### Module 31 — AI Tool Registry (Phase 3)
**Location**: `convex/ai/tools/`, `convex/ai/toolRegistry.ts`
**Architecture**: Each tool in its own file. toolRegistry maps roles to available tools. RBAC happens at registry level — Claude never sees tools the user can't use.
```
convex/ai/tools/
├── search.ts                   # searchLeads, searchContacts, searchDeals (read)
├── create.ts                   # createLead, createContact, createDeal (write)
├── update.ts                   # updateEntity — any field on any entity (write)
├── notes.ts                    # addNote, searchNotes (write/read)
├── reminders.ts                # setReminder, getOverdueReminders (write/read)
├── detail.ts                   # getEntityDetail — full timeline (read)
├── analytics.ts                # getDashboardStats, getPipelineHealth, getForecast (read)
├── email.ts                    # draftEmail — from deal/contact history (draft, not send)
├── dateSearch.ts               # searchByDate — entities by date range (read)
├── bulk.ts                     # bulkUpdate — with MANDATORY confirmation (write)
├── workspace.ts                # setupWorkspace — roles, fields, pipeline (admin)
├── scraping.ts                 # Phase 7 — web scraping tools
└── platformAdmin.ts            # Platform admin only — org stats, flags
```
**The tool registry** — role filtering before Claude:
```typescript
// convex/ai/toolRegistry.ts
const TOOL_PERMISSIONS: Record<ToolName, string | null> = {
  searchLeads: "leads.view",
  createLead: "leads.create",
  updateLead: "leads.editAny",
  deleteLead: "leads.delete",
  bulkUpdate: "data.bulkActions",
  setupWorkspace: "ai.workspaceSetup",
  getPipelineHealth: "reports.view",
  // null = no permission required (basic read tools)
};

export async function getToolsForRole(ctx, userId, orgId) {
  const permissions = await getUserPermissions(ctx, userId, orgId);

  return Object.entries(TOOL_PERMISSIONS)
    .filter(([tool, perm]) => perm === null || permissions.includes(perm))
    .map(([tool]) => ALL_TOOLS[tool]);
  // Result: Claude only receives tools the user is allowed to use
  // Security at the registry level — no runtime permission check needed in tool handler
}
```
**The tool pattern** — every tool follows this exact structure:
```typescript
// convex/ai/tools/create.ts
import { tool } from "ai";
import { z } from "zod";

export const createLeadTool = tool({
  description: "Create a new lead in the CRM. Always show the preview to user before executing.",
  parameters: z.object({
    displayName: z.string().describe("Full name of the lead or company name"),
    email: z.string().email().optional(),
    pipelineId: z.string().describe("Pipeline ID from available pipelines in context"),
    fieldValues: z.array(z.object({
      fieldName: z.string(),
      value: z.any(),
    })).optional(),
  }),
  execute: async (args, { ctx }) => {
    // Calls the CANONICAL lead create mutation
    const result = await ctx.runMutation(internal.leads.create, {
      ...args,
      source: "ai",
    });

    if (result.duplicates.length > 0) {
      return {
        type: "disambiguation",
        message: "I found possible duplicates. Which one did you mean?",
        options: result.duplicates,
      };
    }

    return {
      type: "success",
      message: `Lead "${args.displayName}" created successfully.`,
      leadId: result.id,
      preview: args,
    };
  },
});
```
**MCP Future Readiness** — the `execute` functions become MCP tool handlers with zero rewrite:
```typescript
// future/mcp/server.ts
// This file doesn't exist yet — but when it does:
export const mcpServer = {
  tools: {
    create_lead: {
      description: createLeadTool.description,
      inputSchema: zodToJsonSchema(createLeadTool.parameters),
      handler: (args) => createLeadTool.execute(args, { ctx }), // SAME execute function
    },
  },
};
```
---
### Module 32 — AI Chat UI (Phase 3)
**Location**: `core/ai/`
**Architecture**: `useChat()` from Vercel AI SDK on frontend. Slide-over panel from right. Context-aware (reads current URL).
```
core/ai/
├── components/
│   ├── ChatSheet.tsx           # Slide-over panel container
│   ├── ChatMessage.tsx         # User + assistant message bubbles
│   ├── ChatToolCall.tsx        # Tool result cards (mini-tables, record previews)
│   ├── ChatConfirmation.tsx    # Destructive action confirmation UI
│   └── ChatSuggestions.tsx     # Proactive prompt suggestions based on current page
├── stores/
│   └── chatStore.ts            # Zustand: isOpen, pendingMessage (UI state ONLY)
└── hooks/
    └── useAIChat.ts            # useChat() wrapper + page context injection
```
**Page-context injection**:
```typescript
// core/ai/hooks/useAIChat.ts
export function useAIChat() {
  const pathname = usePathname(); // current route
  const { sendMessage, ...chatState } = useChat({
    api: "/api/ai/chat",
    body: {
      currentRoute: pathname, // ← injected into every request
      // AI knows user is on /deals → auto-focuses on deals context
    },
  });

  return { sendMessage, ...chatState };
}
```
**Proactive suggestions** — context-aware:
```typescript
// core/ai/components/ChatSuggestions.tsx
const CONTEXT_SUGGESTIONS: Record<string, string[]> = {
  "/leads": [
    "Show me stale leads",
    "Which leads haven't been contacted in 7 days?",
    "Create a lead for...",
  ],
  "/deals": [
    "What deals are closing this month?",
    "Show pipeline revenue forecast",
    "Move [deal] to negotiation stage",
  ],
  // Context-matched from navigation.ts config
};
```
---
### Module 33 — AI Workspace Setup (Phase 3)
**Location**: `convex/ai/tools/workspace.ts`
**Architecture**: Conversational setup — AI asks questions, builds preview, user approves, AI creates DB records in batch. Uses the same mutations as Settings UI.
```typescript
// convex/ai/tools/workspace.ts
export const workspaceSetupTool = tool({
  description: "Set up the CRM workspace: pipelines, custom fields, roles, and entity labels",
  parameters: z.object({
    action: z.enum(["setup_pipeline", "setup_fields", "setup_roles", "rename_entities"]),
    payload: z.any(),
  }),
  execute: async ({ action, payload }, { ctx }) => {
    await requirePermission(ctx, "ai.workspaceSetup");

    switch (action) {
      case "setup_pipeline":
        // Calls internal.pipelines.create — SAME as Settings UI
        return await ctx.runMutation(internal.pipelines.create, payload);

      case "setup_fields":
        // Calls internal.fieldDefinitions.batchCreate — SAME as Field Builder UI
        return await ctx.runMutation(internal.fieldDefinitions.batchCreate, payload);

      case "setup_roles":
        // Calls internal.orgRoles.create — SAME as Roles Manager UI
        return await ctx.runMutation(internal.orgRoles.batchCreate, payload);
    }
  },
});
// AI Workspace Setup uses the SAME Convex mutations as the Settings UI.
// There is NO special "AI mode" in mutations — just AI calling the same backend.
```
---
### Module 34 — AI Conversation History (Phase 3)
**Location**: `convex/ai/conversations.ts`
**Architecture**: `aiConversations` + `aiMessages` tables. Per-user, per-org. Auto-compact on context overflow.
```typescript
// convex/ai/conversations.ts
export const list = orgQuery({
  handler: async (ctx) =>
    ctx.db.query("aiConversations")
      .withIndex("by_user_and_org", q =>
        q.eq("orgId", ctx.org._id).eq("userId", ctx.user._id))
      .order("desc")
      .take(20),  // Last 20 conversations
});

// Context auto-compaction:
// When message count > 50, AI is prompted to summarize
// Summary stored in aiConversations.contextSummary
// Old messages archived but not deleted (tier-based retention)
```
---
### Module 35 — Platform Admin (Phase 4+)
**Location**: `app/[locale]/platform/`, `convex/platform/`
**Architecture**: Completely separate from org dashboard. Platform_admin sees aggregated stats only — never individual customer data.
```
app/[locale]/platform/
├── layout.tsx                  # Separate layout (no org sidebar)
├── page.tsx                    # Overview: org count, MRR, alerts
├── orgs/page.tsx               # Org list with tier, status, usage
├── tiers/page.tsx              # Manage platformTiers
├── context/page.tsx            # Edit AI platform context
├── flags/page.tsx              # Feature flags
├── waitlist/page.tsx           # Waitlist management
└── ai/page.tsx                 # Platform admin AI chat

convex/platform/
├── queries.ts                  # getAggregatedStats(), getOrgList(), getPlatformAlerts()
└── mutations.ts                # updateOrgTier(), suspendOrg(), toggleFeatureFlag()
```
**Hard separation** — platform_admin never gets customer data:
```typescript
// convex/ai/processChat.ts — already shown above
if (user.platformRole === "platform_admin") {
  systemPrompt = await buildPlatformAdminPrompt(ctx, userId);
  tools = platformAdminTools; // different tool set, NO customer data tools
} else {
  systemPrompt = await buildOrgUserPrompt(ctx, userId, orgId);
  tools = getToolsForRole(role.permissions);
}
// HARD separation — never crossover
```
---
### Module 36 — WhatsApp Voice Bridge (Phase 3 — parallel to AI)
**Location**: `app/api/channels/whatsapp/route.ts`, `trigger/whatsapp/`
**Architecture**: 360dialog webhook → Trigger.dev job → Whisper API → Claude maps to fields → SAME Convex mutations.
```
app/api/channels/whatsapp/
└── route.ts                    # Webhook receiver + signature validation

trigger/whatsapp/
├── voiceProcessor.ts           # Audio → Whisper → Claude → fieldValues
└── documentProcessor.ts        # Image → Claude Vision → OCR → entityDocuments

convex/ai/tools/whatsapp/
└── resolveContact.ts           # 4-layer contact resolution
```
**Voice processing flow** — uses the same mutations:
```typescript
// trigger/whatsapp/voiceProcessor.ts
export const processVoiceNote = task({
  id: "whatsapp-voice-processor",
  run: async ({ audioUrl, fromNumber, orgId }) => {
    // 1. Transcribe (Whisper API — best Arabic accuracy)
    const transcript = await whisper.transcribe(audioUrl, { language: "ar" });

    // 2. Resolve contact (4-layer: name → disambiguation → thread → quickCode)
    const contact = await resolveContact(fromNumber, transcript, orgId);

    // 3. Claude extracts field values from transcript
    const extraction = await claude.extract(transcript, {
      fieldDefinitions: await getFieldDefs(orgId, "contact"),
    });

    // 4. Write to Convex using the SAME mutations as UI
    for (const [fieldId, value] of Object.entries(extraction.fields)) {
      await convex.mutation(api.fieldValues.upsert, {
        entityType: "contact",
        entityId: contact.id,
        fieldId,
        value,
        source: "whatsapp_voice", // auditable
      });
    }

    // 5. Any data without a fieldDefinition → aiContext overflow
    if (extraction.overflow) {
      await convex.mutation(api.contacts.updateAiContext, {
        contactId: contact.id,
        aiContext: extraction.overflow,
      });
    }

    // 6. Send confirmation back to agent via WhatsApp
    await send360dialogMessage(fromNumber, buildConfirmationMessage(extraction));
  },
});
```
---
## 🔄 How AI and Manual Workflows Share Functions — Summary
```
┌─────────────────────────────────────────────────────────────────┐
│                    CONVEX MUTATION (Single Source)               │
│                                                                   │
│  convex/leads/mutations.ts::create                               │
│  - requirePermission()                                           │
│  - runDedup()                                                    │
│  - ctx.db.insert("leads", ...)                                   │
│  - insert fieldValues                                            │
│  - logActivity()                                                 │
│  - sendNotification()                                            │
│                                                                   │
└──────────────┬────────────────────────────────────┬─────────────┘
               │                                    │
    ┌──────────▼──────────┐            ┌────────────▼──────────┐
    │   UI (Manual)       │            │   AI Tool (Phase 3)   │
    │                     │            │                        │
    │  useMutation(        │            │  ctx.runMutation(      │
    │    api.leads.create  │            │    internal.leads.create│
    │  )                  │            │  )                     │
    │                     │            │                        │
    │  source: "manual"   │            │  source: "ai"          │
    │  actorType: "user"  │            │  actorType: "ai"       │
    └─────────────────────┘            └────────────────────────┘
                                                │
                                    ┌───────────▼──────────────┐
                                    │   MCP (Future)           │
                                    │                          │
                                    │  convex.mutation(        │
                                    │    api.leads.create      │
                                    │  )                       │
                                    │                          │
                                    │  source: "mcp"           │
                                    │  actorType: "system"     │
                                    └──────────────────────────┘
```
The ONLY differences between callers:
1. `source` field — tracks where the data came from
1. `actorType` in activity logs — tracks who/what made the change
1. Transport layer — HTTP (UI), Convex action (AI), HTTP/SSE (MCP)
Everything else — validation, RBAC, business logic, notifications, logging — happens ONCE inside the Convex mutation.
---
## ❓ Critical Questions Requiring Your Answers Before Build
### Architecture Questions (Answer Before Phase 1 Starts)
|#|Question|Options|Recommendation|
|---|---|---|---|
|AQ-1|Should the `orgRoles` RBAC refactor be a hard cut (breaking) or gradual migration (both systems parallel)?|A: Hard cut in Phase 1 / B: Gradual (both work)|**A — Hard cut** — cleaner, Phase 0 tests already cover it|
|AQ-2|For AI panel width — fixed 400px or user-resizable?|A: Fixed / B: Resizable with drag handle|**B — Resizable**, better for power users|
|AQ-3|Should the pricing page use ISR (hourly revalidation) or dynamic (per-request)?|A: ISR / B: Dynamic|**A — ISR**, faster, pricing rarely changes|
|AQ-4|Should WhatsApp voice bridge ship WITH Phase 3 (AI) or as a separate Phase 3.5?|A: Same Phase 3 / B: Phase 3.5 after AI|**A — Same Phase 3** (per context.md decision)|
|AQ-5|Should `entity5` and `entity6` slots be pre-created in schema now, or added when first industry needs them?|A: Pre-create now / B: Add when needed|**A — Pre-create now**, follows the plan, avoids future migration|
### Module-Specific Open Questions (Your Decisions Needed)
|Module|Question|My Recommendation|
|---|---|---|
|Leads|Should converted leads be visible (with badge) or hidden by default?|Hidden, filter to show|
|Deals|Should deal value be visible on kanban cards by default?|Controlled by `deals.viewValues` permission|
|Deals|Confetti on deal won?|YES — canvas-confetti|
|CSV Import|Leads + contacts only first, or all entity types?|Leads + contacts first, expand in Phase 3|
|Billing|LemonSqueezy only first, Razorpay deferred?|Yes, defer Razorpay to Phase 6|
|Dubai RE|Should 95-day rent alert cron be Phase 3 or Phase 7?|Phase 3 — it's a core Gulf market need|
|Onboarding|Skippable or mandatory industry selection?|Mandatory (keeps setup minimal but complete)|
|AI|Should AI debug mode log full system prompts in dev?|YES — behind DEBUG_AI env var|
|Notifications|Per-user notification preferences in Phase 2 or deferred?|Phase 2 — agents need this for UAE market|
---
## 🏗️ Build Order (Follow Exactly — One Phase at a Time)
### Phase 1 — Shell (Build in This Order)
```
1. convex/schema.ts → add orgRoles table (RBAC refactor)
2. convex/orgRoles/ → queries + mutations
3. convex/orgs/mutations.ts → update createOrg to seed 3 default roles
4. convex/_shared/permissions.ts → refactor requirePermission() to use DB lookup
5. Update all 102 tests with new role system
6. core/shell/config/navigation.ts → nav config (ALL nav items, even future ones, commented out)
7. app/[locale]/dashboard/layout.tsx → auth guard
8. app/[locale]/dashboard/[orgSlug]/layout.tsx → org resolver
9. core/shell/layouts/DashboardLayout.tsx → 3-pane layout
10. core/shell/components/AppSidebar.tsx → config-driven
11. core/shell/components/TopNav.tsx + UserMenu.tsx
12. core/shell/components/NotificationBell.tsx
13. core/onboarding/ → 3-step wizard
14. app/[locale]/dashboard/[orgSlug]/page.tsx → Quick Win dashboard
15. app/[locale]/page.tsx → Landing page (waitlist)
```
### Phase 2 — CRM Core (Build in This Order)
```
1. convex/schema.ts → all Phase 2 tables (pipelines, fieldDefs, fieldValues, leads, contacts, companies, deals, notes, reminders, tags, savedViews, entityDocuments)
2. convex/pipelines/ → queries + mutations + seed helper
3. convex/fieldDefinitions/ + fieldValues/ → queries + mutations
4. convex/dedup/helpers.ts → shared dedup engine
5. convex/leads/ → queries + mutations (CANONICAL — AI + UI will both use this)
6. convex/contacts/ → queries + mutations (same pattern)
7. convex/companies/ → queries + mutations
8. convex/deals/ → queries + mutations
9. convex/notes/ → queries + mutations
10. convex/reminders/ → queries + mutations
11. convex/tags/ + entityTags/ → queries + mutations
12. convex/savedViews/ → queries + mutations
13. Install @dnd-kit/core + @tanstack/react-table
14. core/kanban/ → KanbanBoard, KanbanColumn, KanbanCard
15. core/datatable/ → DataTable, DataTableToolbar
16. core/entities/scaffolds/ → 4 shared scaffolds (BEFORE any entity-specific code)
17. core/entities/shared/ → DynamicFieldRenderer, TagPicker, AssigneeSelect, DedupBanner
18. core/entities/leads/ → types, hooks, components (uses scaffolds)
19. core/entities/contacts/ → same pattern
20. core/entities/companies/ → same pattern (list-only)
21. core/entities/deals/ → same pattern (kanban primary)
22. core/timelines/ → UnifiedTimeline + ActivityChat
23. core/settings/pages/ → all settings pages
24. core/csv-import/ → ImportWizard
25. trigger/imports/processCSVImport.ts
26. app/api/billing/ → LemonSqueezy webhook + checkout
```
### Phase 3 — AI + WhatsApp (Build Together)
```
1. Install ai + @ai-sdk/anthropic packages
2. convex/schema.ts → aiConversations + aiMessages tables
3. convex/ai/systemPrompt.ts → dynamic prompt builder
4. convex/ai/toolRegistry.ts → role → tool mapping
5. convex/ai/tools/ → all 10 core tools (each in its own file, calls canonical mutations)
6. convex/ai/processChat.ts → internalAction (the AI runtime)
7. app/api/ai/chat/route.ts → thin streaming proxy
8. stores/chatStore.ts → Zustand UI state
9. core/ai/hooks/useAIChat.ts → useChat() wrapper
10. core/ai/components/ → ChatSheet, ChatMessage, ChatToolCall, ChatConfirmation
11. Apply for 360dialog WhatsApp API (do THIS DAY — 1-2 week approval)
12. app/api/channels/whatsapp/route.ts → webhook receiver
13. trigger/whatsapp/voiceProcessor.ts → Whisper → Claude → fieldValues
14. trigger/whatsapp/documentProcessor.ts → Claude Vision → OCR
```
---
## 🚫 Never-Do List (Architectural Safeguards)
```typescript
// ❌ NEVER: Call AI tools from mutation handlers (circular dependency)
// ✅ ALWAYS: AI tools call mutations (one direction only)

// ❌ NEVER: Accept orgId or userId as mutation args
// ✅ ALWAYS: Derive from ctx.org._id and ctx.user._id

// ❌ NEVER: Hardcode pipeline stage names ("Won", "Lost")
// ✅ ALWAYS: Read from pipelines table

// ❌ NEVER: Hardcode entity labels ("Lead", "Contact")
// ✅ ALWAYS: Read from orgSettings.entityLabels

// ❌ NEVER: Use .collect() on leads/contacts/deals tables
// ✅ ALWAYS: .take(n) or .paginate()

// ❌ NEVER: Write AI logic in the Next.js API route
// ✅ ALWAYS: API route = thin proxy, all logic in Convex internalAction

// ❌ NEVER: Create entity-specific DataTable or Kanban from scratch
// ✅ ALWAYS: Use EntityListPage scaffold, pass configuration

// ❌ NEVER: Import leads code from contacts code (or vice versa)
// ✅ ALWAYS: Share through core/entities/shared/ only

// ❌ NEVER: Hardcode permission strings in components
// ✅ ALWAYS: Use useOrgPermission(PERMISSIONS.LEADS_CREATE) with constant

// ❌ NEVER: Store AI state in Zustand
// ✅ ALWAYS: Zustand for isOpen/isPending only; chat history in Convex DB

// ❌ NEVER: Delete data on plan downgrade
// ✅ ALWAYS: Pause via feature flags, preserve all data

// ❌ NEVER: Hardcode "Orbitly" in user-visible strings
// ✅ ALWAYS: Use t('app.name') or process.env.NEXT_PUBLIC_APP_NAME
```
---
## 📊 Production-Grade Checklist (Every Feature)
Before any PR is merged, verify:
```
□ No browser console errors or warnings
□ Data scoped to org — wrong orgId cannot read
□ Wrong role → redirects or shows forbidden state
□ Disabled module → route redirects, sidebar item disappears
□ logActivity() called in every mutation
□ sendNotification() called where relevant
□ Loading skeleton renders while query is pending
□ Empty state renders with AI suggestion slot
□ Renders without overflow at 390px viewport (mobile)
□ pnpm build exits with 0 errors
□ pnpm typecheck exits with 0 errors
□ No Biome lint errors
□ No .collect() on unbounded tables
□ No any types
□ No hardcoded locale in paths (using useAppRouter)
□ No hardcoded entity labels or stage names
□ actorType correctly set in all logActivity calls
□ AI tools have confirmation for destructive actions
```
---
## 🔮 MCP Readiness Checklist
When you decide to expose Orbitly as an MCP server (no timeline set), these are the ONLY things needed:
```typescript
// 1. Create the MCP server adapter (new file, no existing code changes)
// 2. Import existing tool definitions from convex/ai/tools/
// 3. Map them to MCP tool format (description + inputSchema + handler)
// 4. Handler calls the SAME internal Convex mutations

// Total new code needed: ~200 lines in one new file
// Existing code changes: ZERO

// The reason: all business logic is already in internalMutation/internalQuery
// with proper RBAC, validation, logging. MCP just adds a new transport.
```
---
_Document created: 2026-05-02_
_Covers: All 36 modules (Phase 0.5 → Phase 4+)_
_Status: READY FOR PHASE 1 BUILD_
_Next action: Get answers to AQ-1 through AQ-5, then start SHELL-01_


--v2--
# Orbitly — Code Architecture Bible v2
## All 36 Modules · All Decisions Locked · MCP-Ready · AI-Native · Production Grade

> **Scanned**: PLAN.md, deep-plan.md, folder-structure.md, schema.md, rbac.md, tech-stack.md,
> rules.md, context.md, todos.md, all MODULE.md files + actual shell code
> (DashboardLayoutClient, AppSidebar, NavMain, TopNav, AIChatPanel, nav-user,
> account-switcher, sidebar-items.ts, DashboardLayout).
> **Status**: ALL questions answered. Architecture LOCKED. Build-ready.
> **Last Updated**: 2026-05-03 — v2 incorporating all user answers + 4 new architectural patterns

---

## 🆕 NEW ARCHITECTURAL CONCEPTS (v2 Additions)

---

### Concept A — OrbitID: Universal Entity Identity

**Decision: YES — implement. Solves tracking, WhatsApp resolution, AI context, and connectivity.**

Every entity (lead, contact, deal, company, project, task) gets a **human-readable, org-unique OrbitID** at creation. This ID travels with the entity forever — through pipeline stages, conversion, follow-ups, integrations, WhatsApp, AI interactions.

**Format**: `{ORG_PREFIX}-{TYPE}-{NUMBER}`
Examples: `ACM-L-001` (Acme, Lead 1), `ACM-C-001` (same person, now Contact), `ACM-D-042` (a Deal)

**Why not overkill — it solves 4 real problems**:
1. WhatsApp: agent says "check ACM-L-012" → AI resolves instantly, no disambiguation
2. AI context is anchored to a human-readable ID the team actually uses
3. Cross-entity tracking: one query on orbitId finds all leads, deals, notes, reminders, WhatsApp threads connected to it
4. Removes the N+1 join problem in unified timelines — every `activityLog` row has `orbitId`

**New table for atomic counter**:
```typescript
// convex/schema.ts
orbitIdCounters: defineTable({
  orgId: v.id("orgs"),
  entityType: v.string(),   // "lead" | "contact" | "deal" | "company" | "project" | "task"
  count: v.number(),
  createdAt: v.number(),
}).index("by_org_and_type", ["orgId", "entityType"]),
```

**Shared helper** (`convex/_shared/orbitId.ts`):
```typescript
export async function generateOrbitId(
  ctx: MutationCtx,
  orgId: Id<"orgs">,
  entityType: string
): Promise<string> {
  const PREFIXES: Record<string, string> = {
    lead: "L", contact: "C", deal: "D",
    company: "CO", project: "P", task: "T",
  };
  const org = await ctx.db.get(orgId);
  const prefix = org.name.slice(0, 3).toUpperCase();           // "ACM"
  const typeCode = PREFIXES[entityType] ?? entityType.slice(0, 2).toUpperCase();

  // Atomic counter increment
  const counter = await ctx.db
    .query("orbitIdCounters")
    .withIndex("by_org_and_type", q => q.eq("orgId", orgId).eq("entityType", entityType))
    .first();

  const next = (counter?.count ?? 0) + 1;
  if (counter) {
    await ctx.db.patch(counter._id, { count: next });
  } else {
    await ctx.db.insert("orbitIdCounters", { orgId, entityType, count: 1, createdAt: Date.now() });
  }

  return `${prefix}-${typeCode}-${String(next).padStart(3, "0")}`;  // "ACM-L-001"
}
```

**Schema addition to every entity table**:
```typescript
// leads, contacts, deals, companies, entity5s, entity6s:
orbitId: v.string(),   // indexed: .index("by_org_and_orbitId", ["orgId", "orbitId"])
```

---

### Concept B — 3-Layer AI Context Architecture

**Decision: YES — all 3 layers. They solve different problems without overlapping.**

```
LAYER 1: platformContext (global)
  → What Orbitly is, capabilities, platform rules
  → Managed by platform_admin via admin dashboard
  → Injected into EVERY AI call for EVERY user
  → Table: platformContext { key: "main", content: string, version: string }

LAYER 2: orgAIContext (org-wide)
  → Business description, workflows, terminology, team structure
  → Managed by owner/admin in Settings → AI Settings
  → AI auto-updates after major workspace changes
  → Stored: orgs.aiContext (text field on org document)

LAYER 3: entityAIContext (per-entity)
  → Auto-updated compressed summary of key facts about this specific record
  → Updated after every significant event (stage change, note, WhatsApp, follow-up)
  → Stores ESSENTIAL facts only — not a copy of all notes
  → For full history: AI scans unified timeline via tool call
  → Stored: leads.aiContext / contacts.aiContext / deals.aiContext (v.optional(v.any()))
```

**What goes into entityAIContext** (auto-updated after mutations):
```typescript
// Example for a contact in Dubai RE:
{
  lastContactedAt: "2026-04-20",
  lastContactMethod: "whatsapp",
  followUpRequired: true,
  followUpDue: "2026-04-27",
  currentStage: "Offer/MOU",
  daysInCurrentStage: 5,
  staleRisk: false,
  keyFacts: [
    "Budget: AED 120K",
    "Prefers 2BR in JVC",
    "Has Emirates ID on file",
    "Hesitant about parking availability"
  ],
  lastAIAction: "Sent rent comparison on 2026-04-19",
  openReminders: 1,
  orbitId: "ACM-C-001"
}
```

**Auto-rebuild trigger** — called from every mutation that changes the entity:
```typescript
// convex/_shared/entityContext.ts
export async function scheduleEntityContextRebuild(
  ctx: MutationCtx,
  entityType: string,
  entityId: string
): Promise<void> {
  // Non-blocking — runs after mutation completes
  await ctx.scheduler.runAfter(0, internal.ai.rebuildEntityContext, { entityType, entityId });
}

// convex/ai/rebuildEntityContext.ts (internalAction — "use node")
// Scans: recent activityLogs + notes + reminders for this entity (last 30 days)
// Calls Claude haiku (cheap): "Extract key facts from these events as JSON"
// Writes compressed summary back to entity.aiContext
// No user-facing tokens consumed — this is background intelligence
```

**AI Settings page** (new — in Settings):
```
Settings → AI Settings
├── Business Context (org-wide)
│   ├── Business description (rich textarea)
│   ├── Key terminology (e.g., "We call Deals 'Projects'")
│   ├── Workflows (e.g., "Always follow up within 24 hours of viewing")
│   ├── Team structure notes
│   └── [Button: Ask AI to suggest improvements based on our data]
│
├── AI Message Usage
│   └── X / 500 messages used this month [upgrade prompt if > 80%]
│
└── Entity Context Viewer (admin/owner only — read access)
    ├── Search: enter OrbitID or name to view entity's current AI context
    ├── Shows: JSON view of entity.aiContext
    └── [Button: Override/Correct context] — manual edit for wrong AI summaries
```

---

### Concept C — OrbitLink: Universal Entity Connection Graph

**Decision: YES — OrbitLink junction table replaces fragmented FK chains.**

**Problem with current FK chains**:
```
Current: Lead --(contactId)--> Contact --(contactId)--> Deal
Problem: A reminder on a deal has NO link back to the originating lead.
         A WhatsApp thread has NO link to the deal it's about.
         "Show me everything about ACM-L-001" requires 5 separate queries.
```

**Solution**: `orbitLinks` junction table — any entity connects to any other entity:
```typescript
// convex/schema.ts
orbitLinks: defineTable({
  orgId: v.id("orgs"),
  fromOrbitId: v.string(),       // "ACM-L-001"
  fromType: v.string(),          // "lead"
  toOrbitId: v.string(),         // "ACM-C-001" or "reminder:xyz" or "user:abc"
  toType: v.string(),            // "contact" | "reminder" | "user" | "whatsapp_msg" | "note" etc.
  linkType: v.string(),          // "converted_to" | "opened_deal" | "has_reminder" | "whatsapp_thread" | "assigned_to" | "tagged"
  metadata: v.optional(v.any()), // extra data (reminder due date, message preview, etc.)
  createdAt: v.number(),
  createdBy: v.optional(v.id("users")), // null = system-created
})
.index("by_org_and_from", ["orgId", "fromOrbitId"])
.index("by_org_and_to", ["orgId", "toOrbitId"])
.index("by_org_and_type", ["orgId", "linkType"]),
```

**How connections are created** (added inside canonical mutations):
```typescript
// convex/leads/mutations.ts::create — adds OrbitLink on creation
await ctx.db.insert("orbitLinks", {
  orgId: ctx.org._id,
  fromOrbitId: orbitId,
  fromType: "lead",
  toOrbitId: args.assignedTo ? `user:${args.assignedTo}` : "unassigned",
  toType: "user",
  linkType: "assigned_to",
  createdAt: Date.now(),
  createdBy: ctx.user._id,
});

// convex/leads/mutations.ts::convertToContact — adds conversion link
await ctx.db.insert("orbitLinks", {
  fromOrbitId: lead.orbitId,
  fromType: "lead",
  toOrbitId: newContact.orbitId,
  toType: "contact",
  linkType: "converted_to",
  createdAt: Date.now(),
});
```

**Graph query** — "show me everything connected to ACM-L-001":
```typescript
// convex/orbitLinks/queries.ts
export const getEntityGraph = orgQuery({
  args: { orbitId: v.string() },
  handler: async (ctx, { orbitId }) => {
    const [outgoing, incoming] = await Promise.all([
      ctx.db.query("orbitLinks")
        .withIndex("by_org_and_from", q => q.eq("orgId", ctx.org._id).eq("fromOrbitId", orbitId))
        .collect(),
      ctx.db.query("orbitLinks")
        .withIndex("by_org_and_to", q => q.eq("orgId", ctx.org._id).eq("toOrbitId", orbitId))
        .collect(),
    ]);
    return { outgoing, incoming };
  },
});
// AI uses this tool: "get everything connected to ACM-L-001"
// Returns: converted_to ACM-C-001, opened_deal ACM-D-007, has_reminder r:123, whatsapp_thread msg:456
```

**Is this overkill?** No — it's a single lightweight table, one insert per connection event. The alternative is a tangle of nullable FKs on every table that still can't answer lateral queries.

---

### Concept D — Tab-Specific AI Context & Proactiveness

**Decision: YES — extend existing `currentRoute` injection with full entity context.**

Current: `currentRoute` is passed from frontend → API route → Convex processChat.

Extension: also pass `entityContext: { entityType, entityId, orbitId }` when user is on an entity detail page.

```typescript
// core/ai/hooks/useAIChat.ts
export function useAIChat() {
  const pathname = usePathname();
  const params = useParams();

  const entityContext = useMemo(() => {
    // Detect entity from URL pattern
    if (pathname.includes("/leads/") && params.id)
      return { entityType: "lead", entityId: params.id as string };
    if (pathname.includes("/contacts/") && params.id)
      return { entityType: "contact", entityId: params.id as string };
    if (pathname.includes("/deals/") && params.id)
      return { entityType: "deal", entityId: params.id as string };
    return null;
  }, [pathname, params]);

  const { sendMessage, ...chatState } = useChat({
    api: "/api/ai/chat",
    body: {
      currentRoute: pathname,
      entityContext,   // AI loads entity.aiContext and shows targeted suggestions
    },
  });

  return { sendMessage, entityContext, ...chatState };
}
```

**Proactive AI when entity is loaded**:
```
User opens contact "John Smith" (ACM-C-001):
  AI panel immediately shows:
  "📋 John Smith (ACM-C-001)
   Last contacted 14 days ago via WhatsApp
   Budget: AED 120K | Prefers 2BR JVC
   ⚠️ No follow-up scheduled

   Quick actions:
   [Schedule Follow-up] [View Deal ACM-D-007] [Draft WhatsApp Message] [Full Summary]"
```

**System prompt addition for entity context**:
```typescript
// convex/ai/systemPrompt.ts
if (args.entityContext) {
  const entity = await getEntityByTypeAndId(ctx, args.entityContext);
  const aiCtx = entity?.aiContext;

  prompt += `
CURRENT RECORD: ${entity?.displayName ?? entity?.name} (${entity?.orbitId})
TYPE: ${args.entityContext.entityType}
KEY CONTEXT: ${JSON.stringify(aiCtx)}

The user is currently viewing this record. Prioritize answers about this specific ${args.entityContext.entityType}.
For complete history, use get_entity_timeline tool — do not invent history from context alone.
  `;
}
```

---

## 🗂️ App Folder Structure — Route Groups

**Decision: YES — use Next.js route groups for clean separation.**

```
app/
└── [locale]/
    ├── layout.tsx                  # Root layout — fonts, providers, locale, theme
    ├── globals.css
    ├── global-error.tsx
    │
    ├── (public)/                   # NO auth required — public pages
    │   ├── layout.tsx              # Minimal layout (header + footer only)
    │   ├── page.tsx                # Landing page — DEFERRED (build after base)
    │   └── pricing/
    │       └── page.tsx            # ISR — revalidates when platform_admin updates tiers
    │
    ├── (auth)/                     # Auth pages — already exists ✅
    │   ├── layout.tsx              # Centered card layout, no sidebar
    │   ├── signin/page.tsx         # ✅ Built
    │   └── signup/page.tsx         # ✅ Built
    │
    ├── (private)/                  # Requires auth — guards here not in DashboardLayout
    │   ├── layout.tsx              # NEW: Auth guard — redirect to /signin if not authenticated
    │   │
    │   ├── onboarding/
    │   │   ├── layout.tsx          # Wizard-only layout (no sidebar)
    │   │   └── page.tsx            # 3-step wizard
    │   │
    │   └── dashboard/
    │       ├── layout.tsx          # Onboarding guard — redirect if !onboardingCompleted
    │       └── [orgSlug]/
    │           ├── layout.tsx      # Org resolver + DashboardLayout (existing ✅, update)
    │           ├── page.tsx        # Dashboard home
    │           ├── leads/
    │           │   ├── page.tsx    # LeadList (list default + board toggle)
    │           │   └── [id]/page.tsx  # LeadDetail
    │           ├── contacts/
    │           │   ├── page.tsx
    │           │   └── [id]/page.tsx
    │           ├── companies/
    │           │   ├── page.tsx
    │           │   └── [id]/page.tsx
    │           ├── deals/
    │           │   ├── page.tsx    # Kanban primary, list toggle
    │           │   └── [id]/page.tsx
    │           ├── [entity]/       # Dynamic slot for entity5 / entity6
    │           │   ├── page.tsx
    │           │   └── [id]/page.tsx
    │           ├── notifications/
    │           │   └── page.tsx    # Full notifications list (infinite scroll)
    │           └── settings/
    │               ├── layout.tsx  # Settings sub-nav layout
    │               ├── general/page.tsx
    │               ├── members/page.tsx
    │               ├── roles/page.tsx
    │               ├── billing/page.tsx
    │               ├── pipelines/page.tsx
    │               ├── fields/page.tsx
    │               ├── tags/page.tsx
    │               ├── entity-labels/page.tsx
    │               ├── appearance/page.tsx
    │               ├── ai/page.tsx       # NEW: AI Settings
    │               └── activity-log/page.tsx
    │
    └── portal/                     # Phase 9 — external client/partner
        └── [orgSlug]/
            ├── layout.tsx          # PortalLayout (org branding, no internal nav)
            └── page.tsx
```

---

## 🔧 Shell — What Exists vs What Needs To Change

**From code scan of existing shell components**:

| File | Current State | Action Needed |
|---|---|---|
| `DashboardLayoutClient.tsx` | ✅ Built — 3-pane, resizable AI panel (280-600px), drag handle, cookie persistence, Sheet for mobile | **Keep as-is — architecture is correct** |
| `DashboardLayout.tsx` | ✅ Built — server component, reads cookies | Move auth guard to `(private)/layout.tsx` — layout itself stays |
| `AppSidebar.tsx` | ⚠️ Reads hardcoded `sidebarItems` from `navigation/sidebar/` | **Update: read from new `navigation.ts`, pass orgSlug** |
| `NavMain.tsx` | ⚠️ No RBAC, no feature flags, no badge counts, no entity labels, has hardcoded QuickCreate + Inbox buttons | **Major update: add RBAC, badges, labels, feature flags; remove hardcoded items** |
| `TopNav.tsx` | ⚠️ Has AI toggle ✅, has GitHub link (wrong), AccountSwitcher (hardcoded) | **Update: add NotificationBell, remove GitHub link, fix WorkspaceSwitcher** |
| `NavUser.tsx` | ⚠️ Uses `rootUser` hardcoded import | **Update: connect to Convex auth session** |
| `AccountSwitcher.tsx` | ⚠️ Local state, hardcoded users array | **Rename → WorkspaceSwitcher, connect to Convex orgs** |
| `AIChatPanel.tsx` | ⚠️ UI shell only (hardcoded message, static input) | **Phase 3: wire to useChat() hook** |
| `sidebar-items.ts` | ⚠️ Wrong location (`navigation/sidebar/`), generic items (Projects, Users, Documents) | **Deprecate: move+rewrite to `core/shell/config/navigation.ts`** |
| `SidebarSupportCard.tsx` | ✅ Fine | Keep (update copy to Orbitly brand) |
| `ThemeSwitcher.tsx` | ✅ Fine | Keep |
| `LayoutControls.tsx` | ✅ Fine | Keep |
| `SearchDialog.tsx` | ✅ Good base | Extend for CommandPalette in Phase 2 |
| `core/shell/config/` | ⚠️ Empty directory | **CREATE navigation.ts here** |
| `core/shell/hooks/` | ⚠️ Empty directory | **CREATE useModuleEnabled + useViewToggle here** |

### Files to CREATE in Phase 1 Shell:

**`core/shell/config/navigation.ts`** — move and completely rewrite `sidebar-items.ts`:
```typescript
import {
  LayoutDashboard, Target, Users, Building2, DollarSign,
  KanbanSquare, MessageSquare, Calendar, Link2, Settings, Bell
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export type NavItem = {
  id: string;
  title: string;              // fallback label
  labelKey: string;           // i18n key
  icon: LucideIcon;
  href: string;               // relative to /dashboard/[orgSlug]
  badge?: "count" | "new";
  badgeKey?: string;          // key in NavBadgeCounts
  entitySlot?: string;        // "lead"|"contact"|"deal"|"company" → label from orgSettings
  featureFlag?: string;       // wraps in ModuleGuard if set
  permission?: string;        // RBAC permission needed
  comingSoon?: boolean;
};

export type NavGroup = {
  id: string;
  label?: string;
  labelKey?: string;
  items: NavItem[];
};

export const NAV_GROUPS: NavGroup[] = [
  {
    id: "core",
    items: [
      { id: "dashboard", title: "Dashboard", labelKey: "nav.dashboard",
        icon: LayoutDashboard, href: "" },
    ],
  },
  {
    id: "crm",
    label: "CRM",
    labelKey: "nav.group.crm",
    items: [
      { id: "leads", title: "Leads", labelKey: "nav.leads", icon: Target,
        href: "/leads", badge: "count", badgeKey: "leads",
        entitySlot: "lead", permission: "leads.view" },
      { id: "contacts", title: "Contacts", labelKey: "nav.contacts", icon: Users,
        href: "/contacts", entitySlot: "contact", permission: "contacts.view" },
      { id: "companies", title: "Companies", labelKey: "nav.companies", icon: Building2,
        href: "/companies", entitySlot: "company", permission: "companies.view" },
      { id: "deals", title: "Deals", labelKey: "nav.deals", icon: DollarSign,
        href: "/deals", badge: "count", badgeKey: "openDeals",
        entitySlot: "deal", permission: "deals.view" },
    ],
  },
  {
    id: "workspace",
    label: "Workspace",
    labelKey: "nav.group.workspace",
    items: [
      { id: "projects", title: "Projects", labelKey: "nav.projects", icon: KanbanSquare,
        href: "/projects", featureFlag: "project_management", permission: "projects.view" },
      { id: "messages", title: "Messages", labelKey: "nav.messages", icon: MessageSquare,
        href: "/messages", badge: "count", badgeKey: "unreadMessages",
        featureFlag: "communications" },
      { id: "calendar", title: "Calendar", labelKey: "nav.calendar", icon: Calendar,
        href: "/calendar", comingSoon: true },
    ],
  },
  // Pinned saved views group — populated dynamically from Convex savedViews query
];
```

**`core/shell/hooks/useModuleEnabled.ts`** — NEW:
```typescript
"use client";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";

export function useModuleEnabled(featureFlag: string): boolean {
  const flags = useQuery(api.featureFlags.getForOrg);
  return flags?.[featureFlag] ?? false;
}
```

**`core/shell/hooks/useViewToggle.ts`** — NEW:
```typescript
"use client";
import { useSearchParams } from "next/navigation";
import { useAppRouter } from "@/lib/hooks/useAppRouter";

export function useViewToggle(defaultView: "list" | "board" = "list") {
  const router = useAppRouter();
  const searchParams = useSearchParams();
  const view = (searchParams.get("view") as "list" | "board") ?? defaultView;

  const setView = (v: "list" | "board") => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("view", v);
    router.replace(`?${params.toString()}`);
  };

  return [view, setView] as const;
}
```

**`core/shell/components/ModuleGuard.tsx`** — NEW:
```typescript
"use client";
import { useModuleEnabled } from "@/core/shell/hooks/useModuleEnabled";

interface ModuleGuardProps {
  featureFlag: string;
  children: React.ReactNode;
  fallback?: React.ReactNode;  // shown when locked — e.g., UpgradeBadge
}

export function ModuleGuard({ featureFlag, children, fallback = null }: ModuleGuardProps) {
  const isEnabled = useModuleEnabled(featureFlag);
  return isEnabled ? <>{children}</> : <>{fallback}</>;
}
```

**`core/shell/components/NotificationBell.tsx`** — NEW (Phase 1 basic version):
```typescript
"use client";
import { Bell } from "lucide-react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import { useParams } from "next/navigation";

export function NotificationBell() {
  const params = useParams();
  const orgSlug = params.orgSlug as string;
  const summary = useQuery(api.notifications.getSummary);
  const markAllRead = useMutation(api.notifications.markAllRead);
  const unreadCount = summary?.unreadCount ?? 0;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="icon" variant="ghost" className="relative">
          <Bell className="size-4" />
          {unreadCount > 0 && (
            <Badge className="absolute -top-1 -right-1 size-4 p-0 flex items-center justify-center text-[10px]">
              {unreadCount > 9 ? "9+" : unreadCount}
            </Badge>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <div className="flex items-center justify-between px-3 py-2 border-b">
          <span className="text-sm font-medium">Notifications</span>
          {unreadCount > 0 && (
            <Button variant="ghost" size="sm" onClick={() => markAllRead()}>
              Mark all read
            </Button>
          )}
        </div>
        {/* First 5-8 notifications rendered here — NotificationItem components */}
        <div className="px-3 py-2 border-t">
          <Link href={`/dashboard/${orgSlug}/notifications`}
            className="text-xs text-muted-foreground hover:text-foreground">
            View all notifications →
          </Link>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
```

**`core/shell/components/WorkspaceSwitcher.tsx`** — RENAME + rewrite `AccountSwitcher.tsx`:
```typescript
"use client";
// Shows current org + allows switching to user's other orgs
// Connects to: useQuery(api.orgs.myOrgs) → list of all orgs user belongs to
// On switch: document.cookie = `lastOrgSlug=${slug}` → router.push(`/dashboard/${slug}`)
```

### Key Changes to Existing Files:

**`NavMain.tsx`** — critical update needed:
```typescript
// Remove: hardcoded QuickCreate button, hardcoded Inbox button (these are in scaffolds)
// Remove: reads from sidebarItems static import
// Add: reads from NAV_GROUPS (core/shell/config/navigation.ts)
// Add: useQuery(api.orgs.getEntityLabels) → replace item.title for entitySlot items
// Add: useQuery(api.orgs.getNavBadgeCounts) → show badge numbers
// Add: useQuery(api.orgs.getEntityVisibility) → hide company nav if false
// Add: useOrgPermission check per item (filter invisible items)
// Add: ModuleGuard wrapper for items with featureFlag
// Add: Pinned saved views sub-group (from savedViews query)
```

**`NavUser.tsx`** — connect to real auth:
```typescript
// REMOVE: import { rootUser } from "@/data/users"
// ADD: const user = useQuery(api.users.me); // { name, email, avatar }
// ADD: signOut handler using @convex-dev/auth signOut
// ADD: link to /dashboard/[orgSlug]/settings for Account menu item
// ADD: link to /dashboard/[orgSlug]/settings/billing for Billing
// ADD: link to /dashboard/[orgSlug]/notifications for Notifications
```

**`TopNav.tsx`** — update:
```typescript
// REMOVE: GitHub link (the Globe button)
// REMOVE: AccountSwitcher import (moved to sidebar footer / optional in TopNav)
// ADD: <NotificationBell /> before the AI toggle button
// KEEP: SearchDialog, LayoutControls, ThemeSwitcher, AI toggle button
```

---

## ⚙️ The Core Principle — "One Function, Three Callers"

Every Convex mutation is written ONCE and called by the UI, AI tools, WhatsApp pipeline, and future MCP server. The `source` field tracks the caller. All RBAC, validation, notifications, and logging happen INSIDE the mutation.

```
convex/leads/mutations.ts::create  (canonical — written once)
  │
  ├── UI: useMutation(api.leads.create)           source: "manual",    actorType: "user"
  ├── AI: ctx.runMutation(internal.leads.create)  source: "ai",        actorType: "ai"
  ├── WA: convex.mutation(api.leads.create)       source: "whatsapp",  actorType: "ai"
  └── MCP [future]: same internal mutation        source: "mcp",       actorType: "system"
```

Every mutation pattern:
```typescript
export const create = orgMutation({
  args: { displayName: v.string(), ... },
  handler: async (ctx, args) => {
    // 1. RBAC — identical for all callers
    await requirePermission(ctx, "leads.create");

    // 2. Business logic (dedup, validation, etc.)
    const dupes = await runDedup(ctx, args);
    if (dupes.length > 0) return { id: null, duplicates: dupes };

    // 3. OrbitID generation
    const orbitId = await generateOrbitId(ctx, ctx.org._id, "lead");

    // 4. DB insert
    const id = await ctx.db.insert("leads", { orbitId, ...args, orgId: ctx.org._id, ... });

    // 5. OrbitLinks for connections
    await createOrbitLinks(ctx, orbitId, args);

    // 6. Activity log — actorType auto-detected from ctx
    await logActivity(ctx, { action: "lead.created", entityType: "lead", entityId: id, ... });

    // 7. Notifications
    if (args.assignedTo) await sendNotification(ctx, { ... });

    // 8. Schedule entityAIContext rebuild (non-blocking)
    await scheduleEntityContextRebuild(ctx, "lead", id);

    return { id, orbitId, duplicates: [] };
  },
});
```

---

## 📦 Complete Module Architecture (All 36)

---

### Module 0 — Landing Page & Waitlist

**Decision: DEFERRED — build AFTER base product works. Show real product, not generic text.**

When ready: `app/[locale]/(public)/page.tsx`. Use shadboard landing sections.
Waitlist table: in schema. `join()` mutation is PUBLIC (no auth guard).

```typescript
// convex/schema.ts — add when building landing page
waitlist: defineTable({
  email: v.string(),
  name: v.optional(v.string()),
  industry: v.optional(v.string()),
  referralSource: v.optional(v.string()),
  createdAt: v.number(),
}).index("by_email", ["email"]),
```

---

### Module 1 — Roles & RBAC

**Decisions**: Option B (orgRoles table), HARD CUT immediately. AI role creation in Phase 3 (all base features supported by AI, including roles). WhatsApp also respects same RBAC via `requirePermission()` in mutations.

**New schema**:
```typescript
orgRoles: defineTable({
  orgId: v.id("orgs"),
  name: v.string(),
  description: v.optional(v.string()),
  permissions: v.array(v.string()),  // ["leads.view", "leads.create", ...]
  isSystem: v.boolean(),             // Owner cannot be deleted
  isDefault: v.boolean(),            // Assigned to new invites
  color: v.optional(v.string()),
  createdAt: v.number(),
  updatedAt: v.number(),
})
.index("by_org", ["orgId"])
.index("by_org_and_name", ["orgId", "name"]),
```

**orgMembers migration**: `role: v.string()` → `roleId: v.id("orgRoles")`.

**Seed 3 roles on org creation** (in `convex/orgs/mutations.ts::createOrg`):
- Owner: all ~40 permissions, isSystem: true, cannot be deleted
- Admin: all except org.billing + org.manageRoles, isSystem: false
- Member: CRM create/editOwn/view + notes + reminders + ai.chat, isDefault: true

**The permission check** — identical for UI, AI, WhatsApp:
```typescript
// convex/_shared/permissions.ts
export async function requirePermission(ctx, permission: string): Promise<void> {
  const member = await ctx.db.query("orgMembers")
    .withIndex("by_orgId_and_userId", q => q.eq("orgId", ctx.org._id).eq("userId", ctx.user._id))
    .first();
  const role = await ctx.db.get(member!.roleId);
  if (!role?.permissions.includes(permission)) throw new ConvexError(ERRORS.FORBIDDEN);
}
```

**RBAC-filtered AI tools** (registry level):
```typescript
// convex/ai/toolRegistry.ts
export async function getToolsForRole(ctx, userId, orgId): Promise<ToolDefinition[]> {
  const permissions = await getUserPermissions(ctx, userId, orgId);
  return ALL_TOOLS.filter(t => TOOL_PERMISSION_MAP[t.name] === null || permissions.includes(TOOL_PERMISSION_MAP[t.name]));
}
// Claude receives ONLY tools the user can use — no runtime permission check needed in tool handler
```

---

### Module 2 — Org Rules & Multi-tenancy

**Decisions**:
- A: `platformTiers` in DB only. Start with seed script; connect to admin UI later.
- B: Check billing status BEFORE calling Claude (zero tokens wasted). Parse error type → show specific message.
- C: Branding in `orgs` table (per-org). Platform defaults in `platformContext` table. No env vars for branding.

**Billing check in processChat** (before Claude call):
```typescript
// convex/ai/processChat.ts
const org = await ctx.db.get(orgId);
if (org.billing?.status === "suspended") {
  return streamError("Your account is suspended. Please update your payment method to continue.");
}
if (org.billing?.status === "cancelled") {
  return streamError("Your subscription is cancelled. Contact support to reactivate.");
}
// Check message limit (from platformTiers)
const monthlyUsage = await getAIUsageThisMonth(ctx, orgId);
const limit = await getTierLimit(ctx, org.plan, "aiMessagesPerMonth");
if (monthlyUsage >= limit) {
  return streamError(`You've used all ${limit} AI messages for this month. Upgrade to Pro for more.`);
}
```

**Entity labeling** — never hardcode "Lead":
```typescript
// Any component that shows entity name:
const labels = useQuery(api.orgs.getEntityLabels);
const leadLabel = labels?.lead?.singular ?? "Lead";
// Sidebar uses this via NavMain (entitySlot → label lookup)
```

---

### Module 3 — Dashboard Shell & Layout

**Current state**: Layout is BUILT and working. Resizable AI panel (280-600px) exists. Sheet for mobile exists. Cookie persistence works.

**What's missing**: See complete shell gap analysis above. Don't rebuild — adapt.

The 3-pane architecture (sidebar + content + AI panel) is correct and stays as-is.

---

### Module 4 — Navigation & Module System

`NAV_GROUPS` config in `core/shell/config/navigation.ts` is the single source of truth.
`ModuleGuard` wraps feature-gated items. Shows UpgradeBadge as fallback when locked.
Badge counts come from a SINGLE query `api.orgs.getNavBadgeCounts` — not N separate queries.
Pinned saved views appear as a dynamic group below the main CRM group.

---

### Module 5 — Dashboard Home Page

**Decisions**: "Get Started" card dismissal is per-user (stored in `users.dismissedCards[]`). Metric cards link to pre-filtered list views.

Dashboard stats from ONE parallel query:
```typescript
// convex/orgs/queries.ts::getDashboardStats
// Runs: leadCount, openDealValue, staleCount, tasksDueToday, recentActivity in Promise.all
// Returns industry-specific metrics based on org.settings.industry
// Industry metric config reads from platformTemplates table (not hardcoded)
```

---

### Module 6 — Onboarding Flow

**Decisions**: Step 3 (Complete screen) is the only skippable step. Progress styling based on UI.

```
Step 1: Org name + slug + your role title → required
Step 2: Industry picker → seeds default pipeline from platformTemplates table → required
Step 3: Complete → set onboardingCompleted = true → redirect to dashboard → skippable
```

Post-onboarding: dashboard shows banner "💡 Let AI set up your workspace → Start"

---

### Module 7 — Notifications System

**Decisions**: Per-user preferences settable in Phase 2. Dropdown shows first 5-8 (unread highlighted). Separate `/notifications` page for all notifications.

```
NotificationBell → dropdown (5-8 items, unread highlighted, "View all" link)
/notifications page → all notifications, infinite scroll, filter tabs (All/Unread/CRM/AI/System)
```

---

### Module 8 — Activity Logs

**Decisions**: Infinite scroll (latest first). Per-entity tab shows entity-related only with toggle to show all.

```typescript
// On entity detail page → Activity tab:
// Default: show only activityLogs where entityType + entityId match (+ linked via orbitLinks)
// Toggle "Show all" → shows org-wide timeline
```

---

### Module 9 — Org Management Pages

**Decisions**: Add "Last Active" column if straightforward (`users.lastActiveAt` updated on each auth request). 24h email verification for delete is fine.

All settings pages in `core/settings/pages/`. Every page wrapped in `<PermissionGate>`.
Settings are NEVER plan-gated — only role-gated.

---

### Module 10 — Pricing Page

**Decision**: ISR. Immediately revalidate when platform_admin updates tiers:
```typescript
// convex/platform/mutations.ts::updateTier → triggers revalidatePath via Next.js revalidation API
export const revalidate = 3600; // 1-hour fallback; instant on admin change
```

---

### Module 12 — i18n & RTL Foundation

**Decisions**: Western Arabic numerals (234). Explicit user selection + cookie persistence.
```typescript
// RTL: <html dir={locale === "ar" ? "rtl" : "ltr"}>
// CSS: only Tailwind logical properties: ms-4, pe-2 (NEVER ml-4, pr-2)
// Language stored in: users.preferredLanguage
// Cookie: locale=ar; max-age=31536000 — persists across logins
// AI: responds in user's locale regardless of UI toggle
```

---

### Module 14 — Default Industry Templates

**Decision**: Store in `platformTemplates` table in DB (not TypeScript config files). Platform_admin creates/edits from admin UI. AI can create templates. Org owners can customize after seeding.

```typescript
// convex/schema.ts
platformTemplates: defineTable({
  key: v.string(),                        // "dubai_re", "b2b_sales"
  name: v.string(),
  description: v.string(),
  entityLabels: v.any(),
  entityVisibility: v.any(),
  defaultStages: v.array(v.any()),
  defaultFieldDefinitions: v.array(v.any()),
  dashboardMetrics: v.array(v.string()),
  aiPersona: v.string(),
  isBuiltIn: v.boolean(),
  createdBy: v.optional(v.id("users")),
  createdAt: v.number(),
  updatedAt: v.number(),
}).index("by_key", ["key"]).index("by_builtin", ["isBuiltIn"]),
```

**Reminder defaults** in Settings (not hardcoded, not AI-defined):
```
Settings → Reminders
├── Default follow-up window: [24h] after lead created
├── Auto-reminder for stale deals: [on/off] + [7] days threshold
├── Morning briefing: [on/off]
└── 95-day rent alert (Dubai RE only): [on/off]
```

---

### Module 15 — Pipelines & Stages

**Decision (context.md)**: Pipelines on DEALS ONLY. Leads have simple status (new/qualified/converted).

AI can add stages via `setupPipeline` tool → calls `internal.pipelines.addStage` → same mutation as Settings UI → Kanban re-renders reactively.

**Staleness**: `pipeline.stages[].staleAfterDays` + entity's `stageEnteredAt`. Red border on kanban cards when `Date.now() - stageEnteredAt > staleAfterDays * 86400000`.

---

### Module 16 — Dynamic Fields System

**Decisions**: No code limit on groups. Both frontend + backend validation.

Stage-aware fields (Approach B — backend filters): Convex query filters `fieldDefinitions` by `showInStages` before returning to client. Frontend renders exactly what it receives.

```typescript
// convex/fieldDefinitions/queries.ts
// Filters by: showInStages includes currentStageId OR showInStages is null/empty
// AI reads non-sensitive fieldDefinitions from system prompt for context
```

---

### Modules 17-20 — Entity Modules (Leads, Contacts, Companies, Deals)

**Decision**: Single layout scaffold outside entity-specific components. Entity page = config passed to scaffold. < 30 lines per page component.

```
core/entities/scaffolds/
├── EntityListPage.tsx    # toolbar + search + filters + view toggle + empty state + loading + bulk actions
├── EntityDetailPage.tsx  # tabs + right sidebar + sticky header
├── EntityFormDialog.tsx  # react-hook-form + zod + dynamic fields + dedup check
└── EntityCard.tsx        # base kanban card (orbitId badge, name, stage, assignee, tags, stale)

core/entities/leads/
  LeadList.tsx: ~25 lines — just passes config to EntityListPage
  LeadBoard.tsx: ~20 lines — passes config to KanbanBoard
  LeadCard.tsx: extends EntityCard with lead-specific fields
  LeadDetail.tsx: ~30 lines — passes tabs config to EntityDetailPage
  AddLeadDialog.tsx: ~20 lines — passes entity type config to EntityFormDialog
```

**Decisions**:
- Converted leads: hidden by default, "Show Converted" filter toggle
- Deal value on kanban: controlled by `deals.viewValues` permission (off for members by default)
- Won deal confetti: YES — `canvas-confetti` package, triggered client-side after mutation

**OrbitID created on every entity insert**:
```typescript
// All entity mutations call generateOrbitId() and insert into orbitLinks for connections
// Entity detail page shows orbitId badge prominently — agents reference it in WhatsApp/calls
```

---

### Module 21 — Activity Timeline (Notes + Feed)

**Two systems — never mix them**:

1. **UnifiedTimeline**: activityLogs + notes + reminders + AI actions + integration events. RBAC-filtered. Chronological. Infinite scroll. Used on entity detail pages (Activity tab) and `/settings/activity-log`.

2. **ActivityChat**: People messages + AI on-behalf messages only. Chat bubble UI. Real-time Convex subscription. No logs, no reminders, no integration events.

**EntityAIContext auto-rebuild** triggered after notes are created:
```typescript
// convex/notes/mutations.ts::create
// At end of handler:
await scheduleEntityContextRebuild(ctx, args.entityType, args.entityId);
// Non-blocking — runs after mutation completes
```

---

### Module 22 — Reminders & Follow-ups

**Decision**: Users create their own follow-ups. Defaults in Settings → Reminders. AI auto-suggests but NEVER auto-creates without user approval.

AI suggestion pattern in chat:
```
AI: "Ahmed hasn't been contacted in 14 days. Schedule a follow-up?"
User: [Create Follow-up for Tomorrow] [Snooze 3 Days] [Dismiss]
// Only after user clicks → reminder.create mutation is called
```

---

### Modules 23-28 — Tags, Saved Views, Bulk Actions, CSV Import, Command Palette, Timeline

**Tags**: Org-wide, any entity. `tags` + `entityTags` junction. TagPicker shared component.

**Saved Views**: Pinned → appear in sidebar. `scope: "user"|"org"`. Tier limits from `platformTiers`.

**Bulk Actions**: Single DB batch operation. Select-all includes paginated rows. Starter+ feature.

**CSV Import** — AI-assisted, super flexible:
```
1. Upload CSV → store in Convex file storage
2. Parse headers + first 5 rows → AI analyzes column names
3. AI suggests mappings (e.g., "first_name → displayName, 94% confident")
4. User: Accept All | Override individual | Create new field from column | Ignore column
5. Preview 5 rows with resolved values
6. Dedup strategy: Skip / Overwrite / Ask per row
7. Confirm → Trigger.dev background job → real-time progress
8. Summary + downloadable error CSV
```

**Command Palette** — full keyboard shortcuts:
```typescript
// core/command-palette/config/shortcuts.ts
// OPEN_COMMAND: Cmd+K
// TOGGLE_AI: Cmd+\
// TOGGLE_SIDEBAR: Cmd+B
// TOGGLE_NOTIFICATIONS: Cmd+Shift+N
// GO_LEADS: Cmd+Shift+L
// GO_CONTACTS: Cmd+Shift+C
// GO_DEALS: Cmd+Shift+E
// GO_SETTINGS: Cmd+,
// TOGGLE_THEME: Cmd+Shift+T
// Package: react-hotkeys-hook
```

---

### Module 29 — Billing & Payments

**Decisions**: Trial starts immediately on org creation. Razorpay in Phase 2 alongside LemonSqueezy.

```
LemonSqueezy: global customers (MoR — handles GST, VAT automatically)
Razorpay: Indian customers (UPI + local payment methods)
Both → webhook → convex/orgs/mutations.ts::updateBillingStatus (internalMutation)
Same org lifecycle: active → suspended → cancelled
```

---

### Module 30 — AI Architecture & Security

**Decisions**: Soft limit (warn at 80%, stop at 100% with upgrade prompt). Debug mode behind `DEBUG_AI=true` env var.

**4-layer security**:
1. System prompt boundaries — what AI can/cannot do
2. Org-scoped data — all queries use orgId from ctx (never from request body)
3. Tool filtering at registry — Claude never sees tools user can't use
4. Confirmation before destructive actions — delete, bulk update, irreversible stage change

**Model routing** (task-based, configurable from platformTiers):
```
simple (search, lookup): claude-haiku or gemini-flash
standard (create/update, reminders): claude-sonnet-4
complex (analytics, AI briefing, workspace setup): claude-sonnet-4 or claude-opus-4
```

---

### Module 31 — AI Tool Registry

All tools in `convex/ai/tools/`. Each calls the SAME canonical Convex mutations.

**The exact 11 core tools**:
```
search.ts       → searchLeads, searchContacts, searchDeals, searchByOrbitId
create.ts       → createEntity (lead/contact/deal/company)
update.ts       → updateEntity (any field on any entity)
notes.ts        → addNote, searchNotes
reminders.ts    → setReminder, getOverdueReminders, getTasksDueToday
detail.ts       → getEntityDetail (full context + orbitLinks graph)
analytics.ts    → getDashboardStats, getPipelineHealth, getForecast, getMorningBriefing
email.ts        → draftEmail (draft only — never auto-sends without approval)
bulk.ts         → bulkUpdate (MANDATORY confirmation before executing)
workspace.ts    → setupWorkspace, setupRoles, setupFields, setupPipeline, renameEntities
context.ts      → updateOrgAIContext, rebuildEntityContext
```

**WhatsApp and AI share same tools** — WhatsApp voice processor calls the same `internal.leads.create` that the AI tool calls. No duplication.

**MCP future readiness**: The `execute` function of each tool becomes the MCP handler. Zero rewrite.

---

### Module 32 — AI Chat UI

**Tab-specific proactiveness**: AI panel shows targeted content based on entity currently viewed.

**Conversation switcher**: Dropdown in AI panel header. Last 10 conversations. Click switches.

**AIChatPanel.tsx** (existing shell) → Phase 3 upgrade:
```typescript
// Replace: static hardcoded message + Input with no handler
// Add: useAIChat() hook (useChat from Vercel AI SDK)
// Add: ChatMessage components (user + assistant bubbles)
// Add: ChatToolCall components (tool result cards with entity previews)
// Add: ChatConfirmation component (for destructive actions)
// Add: ChatSuggestions (based on current page/entity context)
// Add: Conversation switcher dropdown in header
// Keep: existing Sidebar, SidebarHeader, SidebarContent, SidebarFooter structure
```

---

### Module 33 — AI Workspace Setup

Uses the same mutations as Settings UI. Conversational: AI asks about business → generates pipeline + fields → shows preview → user approves → creates DB records via `internal.pipelines.create` + `internal.fieldDefinitions.batchCreate`.

Re-runnable from Settings → AI Settings with warning: "This will reset pipeline stages and default fields. Existing data is preserved."

All tiers get access. Free: limited setup messages (configurable from platformTiers).

---

### Module 34 — AI Conversation History

Per-user per-org. Tier-based retention (7d Free → 1yr Enterprise). Auto-compact on overflow (> 50 messages → summarize → store in `aiConversations.contextSummary` → archive old messages).

Search across conversations via `searchAIHistory` tool — scans `aiMessages` table.

---

### Module 35 — Platform Admin (Phase 4+)

Completely separate route subtree: `app/[locale]/(private)/platform/`.
Platform_admin AI gets aggregated stats only — never customer record content.
Hard separation in `processChat.ts` — platform admin and org user contexts never mix.

---

### Module 36 — WhatsApp Voice Bridge (Phase 3, ships with AI)

```
360dialog webhook → app/api/channels/whatsapp/route.ts (signature validation)
  → Trigger.dev: whatsapp-voice-processor
    → OpenAI Whisper API (Arabic + English — best code-switching accuracy)
    → resolveContact: 4-layer (name in transcript → disambiguation WhatsApp reply → thread context → OrbitID match)
    → Claude: extract fieldValues from transcript mapped to org's fieldDefinitions
    → ctx.runMutation(internal.leads.create) OR internal.fieldValues.batchUpsert
        — SAME mutations as UI — no WhatsApp-specific entity code
    → aiContext overflow → entity.aiContext field
    → OrbitLink: contact --[whatsapp_thread]--> msg:abc
    → scheduleEntityContextRebuild (non-blocking)
    → 360dialog: send confirmation message back to agent

  Trigger.dev: whatsapp-document-processor (for Emirates IDs, passports, deeds)
    → Claude Vision / AWS Textract
    → extractedData → entityDocuments table
    → OrbitLink: contact --[has_document]--> doc:xyz
```

Agent says in voice: "Update ACM-C-001, budget changed to 150K, now looking at Business Bay" →
AI resolves OrbitID → updates fieldValues → confirms → entityAIContext rebuilt in background.

---

## 📊 Schema Summary — All New Tables (v2)

| Table | Why | Phase |
|---|---|---|
| `orgRoles` | Dynamic RBAC (replaces hardcoded role strings) | 1 |
| `orbitIdCounters` | Atomic counter for OrbitID per org per entity type | 2 |
| `orbitLinks` | Universal junction — any entity to any entity | 2 |
| `platformTemplates` | Industry templates in DB (not config files) | 2 |
| `waitlist` | Pre-launch email capture | 0.5 (deferred) |

**Additions to existing tables**:
```typescript
// All entity tables (leads, contacts, deals, companies, entity5s, entity6s):
orbitId: v.string(),                // "ACM-L-001" — indexed
aiContext: v.optional(v.any()),     // auto-rebuilt summary of key facts

// orgs:
aiContext: v.optional(v.string()),  // org-wide business context (admin-editable)

// users:
lastActiveAt: v.optional(v.number()),
dismissedCards: v.optional(v.array(v.string())),
preferredLanguage: v.optional(v.string()),

// orgMembers:
roleId: v.id("orgRoles"),          // replaces role: v.string()
```

---

## 🔄 Complete Data Flow — Lead Lifecycle

```
1. WhatsApp voice note from client
   → Whisper transcription → resolveContact (no match) → new lead
   → leads.create called (source: "whatsapp") — SAME mutation as UI
   → orbitId: "ACM-L-001" generated
   → OrbitLink: ACM-L-001 --[created_via]--> whatsapp:msg001
   → entityAIContext scheduled for rebuild
   → activityLog: "Lead created via WhatsApp" (actorType: "ai")
   → Notification: "New lead ACM-L-001" → assigned agent

2. Agent opens lead detail → AI panel shows:
   "John Smith (ACM-L-001) — created 2h ago via WhatsApp
    [Schedule Follow-up] [View WhatsApp Thread] [Convert to Contact]"

3. Agent converts lead → Contact
   → leads.convertToContact → new contact orbitId: "ACM-C-001"
   → OrbitLink: ACM-L-001 --[converted_to]--> ACM-C-001
   → entityAIContext on ACM-C-001 initialized

4. Deal created from contact
   → deals.create → orbitId: "ACM-D-007"
   → OrbitLink: ACM-C-001 --[opened_deal]--> ACM-D-007

5. AI query: "What's happening with John Smith?"
   → AI: getEntityByOrbitId("ACM-C-001")
   → Loads: contact + aiContext + orbitLinks (lead origin, deal, reminders, WhatsApp threads)
   → "John Smith (ACM-C-001) — originated as ACM-L-001 on March 12 via WhatsApp.
      Deal ACM-D-007 in Offer/MOU stage. Budget AED 120K. Follow-up reminder due tomorrow."
   → AI knows complete lifecycle from ONE context load + graph query
```

---

## 🚫 Never-Do List (Locked — No Exceptions)

```typescript
// ❌ Never hardcode "Orbitly" in user-facing strings → t('app.name')
// ❌ Never hardcode entity labels ("Lead", "Contact") → orgSettings.entityLabels
// ❌ Never hardcode pipeline stage names → pipelines table
// ❌ Never accept orgId/userId as mutation args → ctx.org._id / ctx.user._id
// ❌ Never use .collect() on unbounded tables → .take(n) or .paginate()
// ❌ Never call AI tools from inside mutations (circular) → one direction only
// ❌ Never build entity-specific list/detail pages from scratch → use scaffolds
// ❌ Never import leads code from contacts code → share via core/entities/shared/
// ❌ Never store AI chat state in Zustand → isOpen/isPending only; history in Convex
// ❌ Never delete data on plan downgrade → pause via feature flags
// ❌ Never use ml-4/pr-2 CSS → ms-4/pe-2 (logical properties — RTL-safe)
// ❌ Never skip logActivity() in any mutation → everything logged
// ❌ Never call Claude without checking billing status → zero tokens wasted
// ❌ Never generate OrbitID without atomic counter increment → no collision
// ❌ Never write WhatsApp-specific code inside entity mutations → mutations are source-agnostic
// ❌ Never auto-create reminders without user approval → AI suggests, user confirms
// ❌ Never show internal notes (isInternal: true) to client/partner roles
// ❌ Never rebuild entityAIContext synchronously → always schedule via ctx.scheduler
```

---

## ✅ Production Acceptance Criteria (Every Feature)

```
□ No browser console errors or warnings
□ Data scoped to org — wrong orgId cannot read any data
□ Wrong role → PermissionGate hides content or shows ForbiddenState
□ Disabled module → ModuleGuard hides nav item, route redirects
□ logActivity() called in every mutation (actorType set correctly)
□ sendNotification() called where relevant
□ Loading skeleton renders while Convex query is pending
□ Empty state renders with AI suggestion slot
□ Renders at 390px viewport without overflow (mobile)
□ pnpm build → 0 errors
□ pnpm typecheck → 0 errors
□ No Biome lint errors
□ No .collect() on unbounded tables
□ No any types in production code
□ OrbitID set on every entity create
□ OrbitLink created for every new connection
□ entityAIContext rebuild scheduled after significant mutations
□ Billing status checked before every AI call
□ AI tools RBAC-filtered at registry level
□ AI destructive actions require explicit user confirmation
□ All Tailwind CSS uses logical properties (ms- pe- ps- me-)
```

---

## 📐 Phase 1 Build Order (Exact File Sequence)

```
Phase 1.A — RBAC Refactor (do first — 102 tests need updating)
1.  convex/schema.ts → add orgRoles, orbitIdCounters, orbitLinks tables; orgMembers.roleId
2.  convex/orgRoles/queries.ts → listByOrg(), getById(), getForUser()
3.  convex/orgRoles/mutations.ts → create(), update(), delete(), batchCreate()
4.  convex/_shared/permissions.ts → refactor requirePermission() to DB lookup
5.  convex/orgs/mutations.ts → seed 3 orgRoles on createOrg
6.  Update all 102 tests with new roleId system (hard cut)

Phase 1.B — Shell Config
7.  core/shell/config/navigation.ts → NAV_GROUPS (Orbitly-specific items)
8.  core/shell/hooks/useModuleEnabled.ts
9.  core/shell/hooks/useViewToggle.ts
10. core/shell/components/ModuleGuard.tsx
11. core/shell/components/NotificationBell.tsx
12. core/shell/components/WorkspaceSwitcher.tsx (renamed from AccountSwitcher)

Phase 1.C — Shell Wiring
13. core/shell/components/sidebar/nav-main.tsx → UPDATE (RBAC + badges + labels + flags)
14. core/shell/components/sidebar/nav-user.tsx → UPDATE (real auth session)
15. core/shell/components/TopNav.tsx → UPDATE (NotificationBell, WorkspaceSwitcher)

Phase 1.D — Route Groups
16. app/[locale]/(private)/layout.tsx → auth guard
17. app/[locale]/(private)/dashboard/layout.tsx → onboarding guard

Phase 1.E — Onboarding + Dashboard
18. convex/platform/ → seed platformTemplates table with Dubai RE + B2B Sales templates
19. core/onboarding/ → OnboardingWizard, OrgNameStep, IndustryPicker, CompleteStep
20. app/[locale]/(private)/onboarding/layout.tsx + page.tsx
21. app/[locale]/(private)/dashboard/[orgSlug]/page.tsx → Quick Win dashboard

Phase 1.F — Notifications + Settings
22. core/notifications/ → NotificationDropdown, NotificationItem, useNotifications
23. app/[locale]/(private)/dashboard/[orgSlug]/notifications/page.tsx
24. core/settings/ → all settings pages (PermissionGate-wrapped)
25. settings/ai/page.tsx → AI Settings (org context editor + entity context viewer)
```

---

## 🔮 MCP Readiness

When Orbitly needs to be an MCP server: one adapter file (~200 lines), zero changes to existing code.

```typescript
// future/mcp/server.ts — when ready (no timeline set)
// Maps: MCP tool name → existing AI tool execute() function
// Same Zod schemas, same execute functions, same Convex mutations
// New: transport layer only (SSE/stdio instead of Vercel AI SDK streaming)
```

---

*Version 2 — 2026-05-03*
*New patterns added: OrbitID, 3-layer AI context, OrbitLink graph, tab-specific AI, route groups*
*Shell code analyzed: DashboardLayoutClient ✅, AppSidebar ⚠️, NavMain ⚠️, TopNav ⚠️, NavUser ⚠️, AccountSwitcher → WorkspaceSwitcher, AIChatPanel ⚠️*
*All 36 modules: decisions locked, build patterns defined*
*Status: ARCHITECTURE LOCKED — Start Phase 1 build immediately*

--v3--
# Orbitly — Code Architecture Bible v2
## All 36 Modules · All Decisions Locked · MCP-Ready · AI-Native · Production Grade

> **Scanned**: PLAN.md, deep-plan.md, folder-structure.md, schema.md, rbac.md, tech-stack.md,
> rules.md, context.md, todos.md, all MODULE.md files + actual shell code
> (DashboardLayoutClient, AppSidebar, NavMain, TopNav, AIChatPanel, nav-user,
> account-switcher, sidebar-items.ts, DashboardLayout).
> **Status**: ALL questions answered. Architecture LOCKED. Build-ready.
> **Last Updated**: 2026-05-03 — v2.2: OrbitID / personCode system finalised

---

## 🆕 NEW ARCHITECTURAL CONCEPTS (v2)

---

### Concept A — Record Code System (personCode + entity codes)

**Decision: LOCKED. No separate persons table. personCode lives on lead/contact records directly.**

---

#### The Core Idea

Every person that enters the system (always as a lead first) gets a **personCode** the moment the lead is created. That code travels with them forever — it is passed to the contact record on conversion, carried on every deal, every follow-up, every project linked to them. The person is ONE identity across the entire system.

Every other entity type (deal, company, follow-up, project, task) gets its own code from its own counter. All of them store `personCode` to connect back to the person. This removes the need for a separate `persons` table while still giving a single traceable identity to every human in the system.

---

#### Two Levels of Code

```
Level 1 — Within-org record codes (agents use these daily):
  personCode:    P-001, P-002, P-003 ...   (one per human — lead OR contact, forever)
  dealCode:      D-001, D-002, D-003 ...   (one per deal)
  companyCode:   CO-001, CO-002 ...         (one per company)
  followUpCode:  FU-001, FU-002 ...         (one per follow-up / reminder)
  projectCode:   PJ-001, PJ-002 ...         (one per project)
  taskCode:      T-001, T-002 ...           (one per task)

Level 2 — Platform org ID (platform_admin only):
  platformOrgId: ORB-001, ORB-002, ORB-043 ...  (one per org, globally unique on the platform)
```

---

#### Default Prefixes — Fully Customizable Per Org

The prefixes shown above (`P`, `D`, `CO`, `FU`, `PJ`, `T`) are the **system defaults**. Every org can change them from **Settings → Record Codes** to match their industry terminology.

```
Settings → Record Codes
  Person identifier:    P    → org can change to "IN" (Inquiry), "CL" (Client), "PR" (Prospect)...
  Deal:                 D    → org can change to "OP" (Opportunity), "QT" (Quote)...
  Company:              CO   → org can change to "ACC" (Account)...
  Follow-up:            FU   → org can change to "FO", "RM" (Reminder)...
  Project:              PJ   → org can change to "PR", "JB" (Job)...
  Task:                 T    → org can change to "TK"...
```

**Prefixes are stored in `orgSettings.codePrefixes`** — one object on the org record. The prefix
is separate from the entity label. An org can call leads "Prospects" (entity label) and still use
the code prefix "IN" (for Inquiry). They are independent settings.

---

#### Mid-Flight Prefix Change — Numbers Never Move

When an org changes a prefix (e.g., `P` → `CL`):

- The NUMBER (`001`, `002`, etc.) is permanent and never changes.
- A background job runs immediately and patches only the code PREFIX across all records for that org.
- The job updates: leads.personCode, contacts.personCode, deals.personCode, followups.personCode, projects.personCode — everywhere the personCode appears.

```
Before change:  P-001 on lead record, P-001 on contact record, P-001 on deal.personCode
After change:   CL-001 on lead record, CL-001 on contact record, CL-001 on deal.personCode
Numbers:        001 everywhere — unchanged
```

This is a lightweight text patch operation — it never touches business data, only the prefix string.

---

#### How personCode Flows Through the Lifecycle

```
1. Lead "John Smith" created
   → personCode generated: P-001
   → lead record: { displayName: "John Smith", personCode: "P-001", ... }
   → No persons table. personCode lives on the lead row itself.

2. Lead P-001 converts to Contact
   → personCode "P-001" is READ from the lead and WRITTEN to the new contact record
   → contact record: { displayName: "John Smith", personCode: "P-001", ... }
   → Lead record is NOT deleted — marked convertedAt, stores contactId for the link
   → John Smith is P-001 on BOTH records. Same number, different tables.

3. Deal opened for John Smith
   → dealCode generated: D-001 (own counter)
   → deal record: { title: "Marina 2BR Deal", dealCode: "D-001", personCode: "P-001", ... }
   → personCode connects deal back to John. One field. No join table needed.

4. Follow-up created on John
   → followUpCode generated: FU-001 (own counter)
   → reminder record: { followUpCode: "FU-001", personCode: "P-001", dealCode: "D-001", ... }
   → Connected to both the person AND the specific deal.

5. Project created after deal won
   → projectCode generated: PJ-001 (own counter)
   → project record: { projectCode: "PJ-001", personCode: "P-001", dealCode: "D-001", ... }

6. Search "P-001"
   → Query: WHERE personCode = "P-001" across leads, contacts, deals, followups, projects
   → One search, complete lifecycle view: lead → contact → deals → follow-ups → projects
   → AI resolves P-001 immediately from any entity table. WhatsApp agent says "update P-001" → instant.

7. Search "D-007"
   → Query: WHERE dealCode = "D-007"
   → Returns: deal record + deal.personCode = "P-001" → linked contact/lead profile
```

---

#### Schema — Code Counters

```typescript
// convex/schema.ts

// Per-org, per-entity-type counters — separate counter per type
entityCodeCounters: defineTable({
  orgId:       v.id("orgs"),
  entityType:  v.string(),   // "person" | "deal" | "company" | "followup" | "project" | "task"
  count:       v.number(),   // current highest number issued
  createdAt:   v.number(),
})
.index("by_org_and_type", ["orgId", "entityType"]),

// One global row — platform-wide org counter (ORB-001, ORB-002...)
platformOrgIdCounter: defineTable({
  count:     v.number(),
  updatedAt: v.number(),
}),
```

---

#### Code Generator Helper (`convex/_shared/recordCodes.ts`)

```typescript
/**
 * generatePersonCode — called ONLY at lead creation.
 * The generated code is then passed to contact on conversion.
 * Never called again for the same person.
 */
export async function generatePersonCode(
  ctx: MutationCtx,
  orgId: Id<"orgs">
): Promise<string> {
  const org = await ctx.db.get(orgId);
  // Custom prefix from orgSettings, fallback to "P"
  const prefix = org.settings?.codePrefixes?.person ?? "P";
  const counter = await incrementCounter(ctx, orgId, "person");
  return `${prefix}-${String(counter).padStart(3, "0")}`; // "P-001"
}

/**
 * generateEntityCode — called for deals, companies, follow-ups, projects, tasks.
 * Each entity type has its own counter.
 */
export async function generateEntityCode(
  ctx: MutationCtx,
  orgId: Id<"orgs">,
  entityType: "deal" | "company" | "followup" | "project" | "task"
): Promise<string> {
  const org = await ctx.db.get(orgId);
  const DEFAULTS: Record<string, string> = {
    deal: "D", company: "CO", followup: "FU", project: "PJ", task: "T",
  };
  const prefix = org.settings?.codePrefixes?.[entityType] ?? DEFAULTS[entityType];
  const counter = await incrementCounter(ctx, orgId, entityType);
  return `${prefix}-${String(counter).padStart(3, "0")}`;
}

/**
 * generatePlatformOrgId — called once when an org is created.
 * Returns ORB-001, ORB-002, etc. Stored on the org record.
 */
export async function generatePlatformOrgId(ctx: MutationCtx): Promise<string> {
  const row = await ctx.db.query("platformOrgIdCounter").first();
  const next = (row?.count ?? 0) + 1;
  if (row) {
    await ctx.db.patch(row._id, { count: next, updatedAt: Date.now() });
  } else {
    await ctx.db.insert("platformOrgIdCounter", { count: 1, updatedAt: Date.now() });
  }
  return `ORB-${String(next).padStart(3, "0")}`; // "ORB-001"
}

// Shared atomic increment
async function incrementCounter(
  ctx: MutationCtx,
  orgId: Id<"orgs">,
  entityType: string
): Promise<number> {
  const row = await ctx.db
    .query("entityCodeCounters")
    .withIndex("by_org_and_type", q => q.eq("orgId", orgId).eq("entityType", entityType))
    .first();
  const next = (row?.count ?? 0) + 1;
  if (row) {
    await ctx.db.patch(row._id, { count: next });
  } else {
    await ctx.db.insert("entityCodeCounters", { orgId, entityType, count: 1, createdAt: Date.now() });
  }
  return next;
}
```

---

#### Schema Additions to Entity Tables

```typescript
// leads table:
personCode:  v.string(),                    // "P-001" — generated here, indexed
// Index: .index("by_org_and_personCode", ["orgId", "personCode"])

// contacts table:
personCode:  v.string(),                    // "P-001" — passed from lead on conversion, indexed
// Index: .index("by_org_and_personCode", ["orgId", "personCode"])

// deals table:
dealCode:    v.string(),                    // "D-001" — own counter
personCode:  v.optional(v.string()),        // "P-001" — links back to the person (optional: deal may not have a person initially)
companyCode: v.optional(v.string()),        // "CO-001" — if deal is for a company

// companies table:
companyCode: v.string(),                    // "CO-001" — own counter

// reminders / follow-ups table:
followUpCode: v.string(),                   // "FU-001" — own counter
personCode:   v.string(),                   // always linked to a person
dealCode:     v.optional(v.string()),       // optionally linked to a specific deal

// projects table:
projectCode: v.string(),                    // "PJ-001" — own counter
personCode:  v.optional(v.string()),        // linked to a person (if from a deal)
dealCode:    v.optional(v.string()),        // deal that triggered this project

// tasks table:
taskCode:    v.string(),                    // "T-001" — own counter
projectCode: v.optional(v.string()),        // parent project
personCode:  v.optional(v.string()),        // direct person link if no project

// orgs table (new field):
platformOrgId: v.string(),                  // "ORB-001" — set on org creation, used by platform_admin
```

---

#### orgSettings.codePrefixes (stored on orgs table)

```typescript
// orgs.settings.codePrefixes — one object, editable from Settings → Record Codes
type CodePrefixes = {
  person:   string;  // default: "P"
  deal:     string;  // default: "D"
  company:  string;  // default: "CO"
  followup: string;  // default: "FU"
  project:  string;  // default: "PJ"
  task:     string;  // default: "T"
};
```

---

#### Prefix Rename Background Job (`trigger/jobs/renamePrefixes.ts`)

```typescript
// Triggered when org updates Settings → Record Codes
export const renamePrefixJob = task({
  id: "rename-record-code-prefixes",
  run: async ({ orgId, entityType, oldPrefix, newPrefix }) => {
    // Fetch all records for this org and entity type that have the old prefix
    // Patch: replace prefix string only — e.g. "P-001" → "CL-001"
    // Tables to update: leads, contacts, deals, reminders, projects, tasks
    // (wherever personCode or the specific entityCode field appears)
    // Run in batches of 100 — non-blocking to the user
    // On completion: log activity "Record codes updated: P → CL for 847 records"
  },
});
```

---

#### Search Behaviour Across All Codes

```typescript
// convex/search/queries.ts::searchByCode
export const searchByCode = orgQuery({
  args: { code: v.string() },
  handler: async (ctx, { code }) => {
    // Determine which type this code belongs to by matching the prefix
    // against org's codePrefixes setting, then query the right table(s)
    const prefixes = ctx.org.settings?.codePrefixes ?? DEFAULT_PREFIXES;

    // Check if it's a personCode (could appear on lead OR contact)
    if (code.startsWith(prefixes.person + "-")) {
      const lead    = await ctx.db.query("leads")
        .withIndex("by_org_and_personCode", q => q.eq("orgId", ctx.org._id).eq("personCode", code))
        .first();
      const contact = await ctx.db.query("contacts")
        .withIndex("by_org_and_personCode", q => q.eq("orgId", ctx.org._id).eq("personCode", code))
        .first();
      // Also fetch: all deals, followups, projects with this personCode
      return { type: "person", lead, contact, deals, followups, projects };
    }

    if (code.startsWith(prefixes.deal + "-")) {
      const deal = await ctx.db.query("deals")
        .withIndex("by_org_and_dealCode", q => q.eq("orgId", ctx.org._id).eq("dealCode", code))
        .first();
      return { type: "deal", deal };
    }

    // ... same pattern for CO, FU, PJ, T
  },
});

// AI tool — searchByCode — calls the same query
// WhatsApp: agent says "P-001" → AI calls searchByCode("P-001") → full context returned
```

---

### Concept B — 3-Layer AI Context Architecture

**Decision: YES — all 3 layers. They solve different problems without overlapping.**

```
LAYER 1: platformContext (global)
  → What Orbitly is, capabilities, platform rules
  → Managed by platform_admin via admin dashboard
  → Injected into EVERY AI call for EVERY user
  → Table: platformContext { key: "main", content: string, version: string }

LAYER 2: orgAIContext (org-wide)
  → Business description, workflows, terminology, team structure
  → Managed by owner/admin in Settings → AI Settings
  → AI auto-updates after major workspace changes
  → Stored: orgs.aiContext (text field on org document)

LAYER 3: entityAIContext (per-entity)
  → Auto-updated compressed summary of key facts about this specific record
  → Updated after every significant event (stage change, note, WhatsApp, follow-up)
  → Stores ESSENTIAL facts only — not a copy of all notes
  → For full history: AI scans unified timeline via tool call
  → Stored: leads.aiContext / contacts.aiContext / deals.aiContext (v.optional(v.any()))
```

**What goes into entityAIContext** (auto-updated after mutations):
```typescript
// Example for a contact in Dubai RE:
{
  personCode:         "P-001",
  lastContactedAt:    "2026-04-20",
  lastContactMethod:  "whatsapp",
  followUpRequired:   true,
  followUpDue:        "2026-04-27",
  currentStage:       "Offer/MOU",
  daysInCurrentStage: 5,
  staleRisk:          false,
  keyFacts: [
    "Budget: AED 120K",
    "Prefers 2BR in JVC",
    "Has Emirates ID on file",
    "Hesitant about parking availability"
  ],
  openDeals:          ["D-001"],
  openFollowUps:      ["FU-003"],
  lastAIAction:       "Sent rent comparison on 2026-04-19",
}
```

**Auto-rebuild trigger** — called from every mutation that changes the entity:
```typescript
// convex/_shared/entityContext.ts
export async function scheduleEntityContextRebuild(
  ctx: MutationCtx,
  entityType: string,
  entityId: string
): Promise<void> {
  await ctx.scheduler.runAfter(0, internal.ai.rebuildEntityContext, { entityType, entityId });
}
// Non-blocking. Runs after mutation completes.
// Calls Claude haiku (cheap) to extract key facts → writes to entity.aiContext
// No user-facing tokens consumed — this is background intelligence
```

**AI Settings page** (Settings → AI Settings):
```
├── Business Context (org-wide)
│   ├── Business description (rich textarea)
│   ├── Key terminology (e.g., "We call Deals 'Projects'")
│   ├── Workflows (e.g., "Always follow up within 24 hours of viewing")
│   └── [Button: Ask AI to suggest improvements based on our data]
│
├── AI Message Usage
│   └── X / 500 messages used this month [upgrade prompt if > 80%]
│
└── Entity Context Viewer (admin/owner only)
    ├── Search by personCode or name to view entity's current AI context
    ├── Shows: JSON view of entity.aiContext
    └── [Override/Correct context] — manual edit for incorrect AI summaries
```

---

### Concept C — OrbitLink: Universal Entity Connection Graph

**Decision: YES — lightweight junction table for lateral connections not captured by personCode.**

`personCode` on every entity handles the VERTICAL connection (everything → the person).
`orbitLinks` handles LATERAL connections (deal ↔ company, whatsapp thread ↔ contact, note ↔ deal, document ↔ contact, etc.).

```typescript
// convex/schema.ts
orbitLinks: defineTable({
  orgId:       v.id("orgs"),
  fromCode:    v.string(),    // "P-001" | "D-007" | "CO-003" | "FU-001" etc.
  fromType:    v.string(),    // "lead" | "contact" | "deal" | "company" | "followup"
  toCode:      v.string(),    // target entity code or system ID (e.g. "whatsapp:msg001")
  toType:      v.string(),    // "contact" | "deal" | "company" | "whatsapp_msg" | "document"
  linkType:    v.string(),    // "converted_to" | "has_deal" | "works_at" | "whatsapp_thread" | "has_document"
  metadata:    v.optional(v.any()),
  createdAt:   v.number(),
  createdBy:   v.optional(v.id("users")),
})
.index("by_org_and_from", ["orgId", "fromCode"])
.index("by_org_and_to",   ["orgId", "toCode"])
.index("by_org_and_type", ["orgId", "linkType"]),
```

**What personCode handles vs what OrbitLink handles:**
```
personCode on deal record     → "this deal belongs to person P-001"       (vertical — direct field)
OrbitLink: P-001 → CO-001    → "person P-001 works at company CO-001"     (lateral — junction row)
OrbitLink: D-001 → CO-001    → "deal D-001 is with company CO-001"        (lateral — junction row)
OrbitLink: P-001 → whatsapp  → "WhatsApp thread linked to person P-001"   (lateral — junction row)
OrbitLink: D-001 → document  → "Emirates ID doc linked to deal D-001"     (lateral — junction row)
```

---

### Concept D — Tab-Specific AI Context & Proactiveness

**Decision: YES — page/entity context injected into every AI call.**

```typescript
// core/ai/hooks/useAIChat.ts
export function useAIChat() {
  const pathname  = usePathname();
  const params    = useParams();

  const entityContext = useMemo(() => {
    if (pathname.includes("/leads/")    && params.id)
      return { entityType: "lead",    entityId: params.id as string };
    if (pathname.includes("/contacts/") && params.id)
      return { entityType: "contact", entityId: params.id as string };
    if (pathname.includes("/deals/")    && params.id)
      return { entityType: "deal",    entityId: params.id as string };
    return null;
  }, [pathname, params]);

  const { sendMessage, ...chatState } = useChat({
    api: "/api/ai/chat",
    body: { currentRoute: pathname, entityContext },
  });

  return { sendMessage, entityContext, ...chatState };
}
```

**When user opens a contact "John Smith" (P-001):**
```
AI panel immediately shows:
  "📋 John Smith (P-001)
   Last contacted 14 days ago via WhatsApp
   Budget: AED 120K | Prefers 2BR JVC
   Open deals: D-001 (Offer/MOU) | Open follow-ups: FU-003 (due tomorrow)

   [Schedule Follow-up]  [View Deal D-001]  [Draft WhatsApp]  [Full Summary]"
```

---

## 🗂️ App Folder Structure — Route Groups

```
app/
└── [locale]/
    ├── layout.tsx
    ├── globals.css
    ├── global-error.tsx
    │
    ├── (public)/                   # No auth required
    │   ├── layout.tsx
    │   ├── page.tsx                # Landing page — DEFERRED until after base is built
    │   └── pricing/page.tsx        # ISR
    │
    ├── (auth)/                     # Already exists ✅
    │   ├── layout.tsx
    │   ├── signin/page.tsx
    │   └── signup/page.tsx
    │
    ├── (private)/                  # Requires auth
    │   ├── layout.tsx              # Auth guard — redirect to /signin
    │   ├── onboarding/
    │   │   ├── layout.tsx
    │   │   └── page.tsx            # 3-step wizard
    │   └── dashboard/
    │       ├── layout.tsx          # Onboarding guard — redirect if !onboardingCompleted
    │       └── [orgSlug]/
    │           ├── layout.tsx      # Org resolver + DashboardLayout
    │           ├── page.tsx        # Dashboard home
    │           ├── leads/
    │           │   ├── page.tsx
    │           │   └── [id]/page.tsx
    │           ├── contacts/
    │           │   ├── page.tsx
    │           │   └── [id]/page.tsx
    │           ├── companies/
    │           │   ├── page.tsx
    │           │   └── [id]/page.tsx
    │           ├── deals/
    │           │   ├── page.tsx
    │           │   └── [id]/page.tsx
    │           ├── [entity]/
    │           │   ├── page.tsx
    │           │   └── [id]/page.tsx
    │           ├── notifications/page.tsx
    │           └── settings/
    │               ├── layout.tsx
    │               ├── general/page.tsx
    │               ├── members/page.tsx
    │               ├── roles/page.tsx
    │               ├── billing/page.tsx
    │               ├── pipelines/page.tsx
    │               ├── fields/page.tsx
    │               ├── tags/page.tsx
    │               ├── record-codes/page.tsx   # NEW: Settings → Record Codes
    │               ├── entity-labels/page.tsx
    │               ├── appearance/page.tsx
    │               ├── ai/page.tsx
    │               └── activity-log/page.tsx
    │
    └── portal/[orgSlug]/           # Phase 9
```

---

## 🔧 Shell — What Exists vs What Needs To Change

| File | Status | Action |
|---|---|---|
| `DashboardLayoutClient.tsx` | ✅ Built | Keep — architecture correct |
| `DashboardLayout.tsx` | ✅ Built | Move auth guard to `(private)/layout.tsx` |
| `AppSidebar.tsx` | ⚠️ Hardcoded | Update: read from `core/shell/config/navigation.ts` |
| `NavMain.tsx` | ⚠️ Hardcoded | Update: add RBAC, badges, entity labels, feature flags |
| `TopNav.tsx` | ⚠️ Partial | Update: add NotificationBell, remove GitHub link |
| `NavUser.tsx` | ⚠️ Hardcoded | Update: connect to Convex auth session |
| `AccountSwitcher.tsx` | ⚠️ Hardcoded | Rename → WorkspaceSwitcher, connect to Convex orgs |
| `AIChatPanel.tsx` | ⚠️ UI shell | Phase 3: wire to useChat() hook |
| `sidebar-items.ts` | ⚠️ Generic | Deprecate → rewrite at `core/shell/config/navigation.ts` |
| `core/shell/config/` | ⚠️ Empty | CREATE `navigation.ts` |
| `core/shell/hooks/` | ⚠️ Empty | CREATE `useModuleEnabled.ts`, `useViewToggle.ts` |

### Files to CREATE in Phase 1:

**`core/shell/config/navigation.ts`**:
```typescript
export type NavItem = {
  id: string;
  title: string;
  labelKey: string;
  icon: LucideIcon;
  href: string;
  badge?: "count" | "new";
  badgeKey?: string;
  entitySlot?: string;
  featureFlag?: string;
  permission?: string;
  comingSoon?: boolean;
};

export const NAV_GROUPS: NavGroup[] = [
  { id: "core", items: [
    { id: "dashboard", title: "Dashboard", labelKey: "nav.dashboard", icon: LayoutDashboard, href: "" },
  ]},
  { id: "crm", label: "CRM", labelKey: "nav.group.crm", items: [
    { id: "leads",    title: "Leads",    labelKey: "nav.leads",    icon: Target,    href: "/leads",
      badge: "count", badgeKey: "leads",    entitySlot: "lead",    permission: "leads.view" },
    { id: "contacts", title: "Contacts", labelKey: "nav.contacts", icon: Users,     href: "/contacts",
      entitySlot: "contact", permission: "contacts.view" },
    { id: "companies",title: "Companies",labelKey: "nav.companies",icon: Building2, href: "/companies",
      entitySlot: "company", permission: "companies.view" },
    { id: "deals",    title: "Deals",    labelKey: "nav.deals",    icon: DollarSign,href: "/deals",
      badge: "count", badgeKey: "openDeals", entitySlot: "deal",   permission: "deals.view" },
  ]},
  { id: "workspace", label: "Workspace", labelKey: "nav.group.workspace", items: [
    { id: "projects", title: "Projects", labelKey: "nav.projects", icon: KanbanSquare,
      href: "/projects", featureFlag: "project_management", permission: "projects.view" },
    { id: "messages", title: "Messages", labelKey: "nav.messages", icon: MessageSquare,
      href: "/messages", badge: "count", badgeKey: "unreadMessages", featureFlag: "communications" },
    { id: "calendar", title: "Calendar", labelKey: "nav.calendar", icon: Calendar,
      href: "/calendar", comingSoon: true },
  ]},
];
```

**New components to create**: `ModuleGuard.tsx`, `NotificationBell.tsx`, `WorkspaceSwitcher.tsx`
**New hooks to create**: `useModuleEnabled.ts`, `useViewToggle.ts`

**NavMain updates**: remove hardcoded QuickCreate/Inbox buttons, add RBAC filter, badge counts from single query, entity labels from orgSettings, ModuleGuard wrapper for feature-flagged items.

**NavUser update**: replace `rootUser` import with `useQuery(api.users.me)`, connect signOut.

**TopNav update**: remove GitHub link, add `<NotificationBell />`, use `<WorkspaceSwitcher />`.

---

## ⚙️ The Core Principle — "One Function, Three Callers"

Every Convex mutation is written ONCE. Called identically by UI, AI tools, WhatsApp pipeline, and future MCP server.

```
convex/leads/mutations.ts::create
  ├── UI:       useMutation(api.leads.create)             source: "manual",    actorType: "user"
  ├── AI:       ctx.runMutation(internal.leads.create)    source: "ai",        actorType: "ai"
  ├── WhatsApp: convex.mutation(api.leads.create)         source: "whatsapp",  actorType: "ai"
  └── MCP:      same internal mutation [future]           source: "mcp",       actorType: "system"
```

Every mutation follows this pattern:
```typescript
export const create = orgMutation({
  args: { displayName: v.string(), ... },
  handler: async (ctx, args) => {
    await requirePermission(ctx, "leads.create");           // 1. RBAC
    const dupes = await runDedup(ctx, args);                // 2. Dedup
    if (dupes.length > 0) return { id: null, duplicates: dupes };
    const personCode = await generatePersonCode(ctx, ctx.org._id); // 3. Person code
    const id = await ctx.db.insert("leads", {              // 4. Insert
      personCode, ...args, orgId: ctx.org._id, ...
    });
    await logActivity(ctx, { ... });                        // 5. Activity log
    if (args.assignedTo) await sendNotification(ctx, { ... }); // 6. Notify
    await scheduleEntityContextRebuild(ctx, "lead", id);   // 7. AI context rebuild
    return { id, personCode, duplicates: [] };
  },
});
```

---

## 📦 Complete Module Architecture (All 36)

---

### Module 0 — Landing Page & Waitlist
**DEFERRED** — build after base product works and has real screenshots to show.
Location when built: `app/[locale]/(public)/page.tsx`. Waitlist mutation is PUBLIC (no auth).

---

### Module 1 — Roles & RBAC

**Decisions**: orgRoles table, HARD CUT immediately. AI role creation Phase 3. WhatsApp respects same RBAC.

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
}).index("by_org", ["orgId"]).index("by_org_and_name", ["orgId", "name"]),
```

`orgMembers.role: v.string()` → `orgMembers.roleId: v.id("orgRoles")` (hard cut, update 102 tests).

Seed on org creation: Owner (all permissions, isSystem), Admin (all except billing/roles), Member (CRM + AI chat, isDefault).

```typescript
// convex/_shared/permissions.ts — called identically by UI, AI, WhatsApp:
export async function requirePermission(ctx, permission: string): Promise<void> {
  const member = await getOrgMember(ctx);
  const role   = await ctx.db.get(member.roleId);
  if (!role?.permissions.includes(permission)) throw new ConvexError(ERRORS.FORBIDDEN);
}
```

---

### Module 2 — Org Rules & Multi-tenancy

- `platformTiers` in DB only (seed script first, connect to admin UI later)
- Billing check BEFORE calling Claude — zero tokens wasted on suspended accounts
- Branding in `orgs` table (per-org), platform defaults in `platformContext` table. No env vars.

```typescript
// convex/ai/processChat.ts — before Claude call:
const org = await ctx.db.get(orgId);
if (org.billing?.status === "suspended") return streamError("Account suspended. Update payment.");
if (org.billing?.status === "cancelled") return streamError("Subscription cancelled.");
const used  = await getAIUsageThisMonth(ctx, orgId);
const limit = await getTierLimit(ctx, org.plan, "aiMessagesPerMonth");
if (used >= limit) return streamError(`${limit} AI messages used. Upgrade to continue.`);
```

---

### Module 3 — Dashboard Shell & Layout

Layout is BUILT and correct. Resizable AI panel (280-600px), Sheet for mobile, cookie persistence. Do NOT rebuild — adapt. See shell gap table above for what to change.

---

### Module 4 — Navigation & Module System

`NAV_GROUPS` in `core/shell/config/navigation.ts` is the single source of truth. `ModuleGuard` wraps plan-gated items. Single query for all badge counts. Pinned saved views appear as a dynamic sub-group.

---

### Module 5 — Dashboard Home Page

"Get Started" card dismissal: per-user (`users.dismissedCards[]`). Metric cards link to pre-filtered views. One parallel query for all dashboard stats — no N+1.

---

### Module 6 — Onboarding Flow

Step 1 (org name/slug/role) + Step 2 (industry picker → seeds pipeline from platformTemplates) = required. Step 3 (complete) = skippable. Post-onboarding banner: "Let AI set up your workspace →"

---

### Module 7 — Notifications

Per-user preferences in Phase 2. Dropdown: first 5-8, unread highlighted. Separate `/notifications` page for all notifications (infinite scroll, filter tabs: All / Unread / CRM / AI / System).

---

### Module 8 — Activity Logs

Infinite scroll (latest first, load older on scroll up). Entity detail Activity tab: shows entity-related only by default, toggle to show all.

---

### Module 9 — Org Management Pages

All settings pages in `core/settings/pages/`. Every page wrapped in `<PermissionGate>`. Settings NEVER plan-gated — only role-gated. Add "Last Active" column to members page (easy). 24h email verify on org delete.

**New settings page**: `settings/record-codes/page.tsx` — prefix management with live preview and rename confirmation dialog.

---

### Module 10 — Pricing Page

ISR (`revalidate = 3600`). Immediately revalidates via `revalidatePath` when platform_admin updates tiers.

---

### Module 12 — i18n & RTL

Western Arabic numerals (234). Explicit user selection + cookie persistence (`locale=ar; max-age=31536000`). Only Tailwind logical properties (`ms-`, `pe-`, `ps-`, `me-`). AI responds in user's `preferredLanguage`.

---

### Module 14 — Industry Templates

Stored in `platformTemplates` DB table (not config files). Platform_admin creates/edits from admin UI. AI can create templates. Org owners customise after seeding. Reminder defaults live in Settings (not hardcoded).

---

### Module 15 — Pipelines & Stages

Pipelines on DEALS ONLY. Leads have simple status field. Staleness: `stageEnteredAt` + `staleAfterDays` per stage → red border on stale kanban cards.

---

### Module 16 — Dynamic Fields

No code limit on groups. Backend + frontend validation. Backend filters `fieldDefinitions` by `showInStages` before sending to client — frontend renders what it receives, no extra filtering.

---

### Modules 17-20 — Entity Modules (Leads, Contacts, Companies, Deals)

Single scaffold handles all entity list/detail/form patterns. Entity-specific components are ≤ 30 lines — just config passed to scaffolds.

```
core/entities/scaffolds/
  EntityListPage.tsx    EntityDetailPage.tsx    EntityFormDialog.tsx    EntityCard.tsx

core/entities/leads/    contacts/    companies/    deals/    entity5/    entity6/
  Each: ~5 thin files that pass config to scaffolds
```

On lead create: `generatePersonCode()` called → stored as `lead.personCode`.
On convert to contact: `lead.personCode` passed directly → stored as `contact.personCode`.
EntityCard shows `personCode` badge prominently. Agents reference it in WhatsApp/voice.

Decisions: converted leads hidden (filter toggle). Deal value permission-gated. Won deal confetti (`canvas-confetti`).

---

### Module 21 — Activity Timeline

Two systems — never mixed:
1. **UnifiedTimeline**: activityLogs + notes + reminders + AI actions. RBAC-filtered. Infinite scroll.
2. **ActivityChat**: human messages + AI on-behalf only. Chat bubble UI. Real-time Convex subscription.

`scheduleEntityContextRebuild()` called after every note create — non-blocking.

---

### Module 22 — Reminders & Follow-ups

Users create follow-ups themselves. AI suggests, never auto-creates. Defaults in Settings → Reminders. `followUpCode` generated on creation. `personCode` stored on every follow-up record.

---

### Modules 23-28 — Tags, Saved Views, Bulk Actions, CSV Import, Command Palette, Timeline

**Tags**: Org-wide, any entity. `tags` + `entityTags` junction.

**Saved Views**: Pinned → sidebar. `scope: "user"|"org"`. Tier limits from `platformTiers`.

**Bulk Actions**: Single batch mutation. Select-all includes paginated rows. Starter+ feature.

**CSV Import**: AI-assisted column mapping. Accept All / Override / Create field / Ignore. Dedup options. Trigger.dev background job. Real-time progress. Error CSV download.

**Command Palette** — full keyboard shortcuts (react-hotkeys-hook):
```
Cmd+K: open palette     Cmd+\: toggle AI      Cmd+B: toggle sidebar
Cmd+Shift+N: notifications   Cmd+Shift+L: go to leads   Cmd+Shift+C: contacts
Cmd+Shift+E: deals      Cmd+,: settings       Cmd+Shift+T: toggle theme
```

---

### Module 29 — Billing

Trial starts immediately on org creation. LemonSqueezy (global) + Razorpay (India/UPI) both in Phase 2. Both webhooks → same `internal.orgs.updateBillingStatus` mutation.

---

### Module 30 — AI Architecture & Security

Soft limits (warn at 80%, stop at 100%). `DEBUG_AI=true` env var for full prompt logging in dev.
4-layer security: system prompt boundaries → org-scoped data (never from request body) → tool filtering at registry → confirmation for destructive actions.

---

### Module 31 — AI Tool Registry

11 core tools. Each calls the SAME canonical Convex mutations as the UI. Role filtering at registry level — Claude never receives tools the user can't use. WhatsApp shares same tools.

`searchByCode` tool added: resolves personCode, dealCode, etc. from WhatsApp voice or typed input.

MCP future: `execute` functions become MCP handlers. Zero rewrite.

---

### Module 32 — AI Chat UI

Tab-specific: `currentRoute` + `entityContext` (entityType + entityId) injected into every request. AI panel shows entity summary + quick-action buttons when on entity detail page. Conversation switcher in panel header.

---

### Module 33 — AI Workspace Setup

Same mutations as Settings UI. Conversational setup → preview → user approves → creates records. Also sets up `codePrefixes` via Settings → Record Codes guidance.

---

### Module 34 — AI Conversation History

Per-user per-org. Tier-based retention. Auto-compact > 50 messages. `searchAIHistory` tool.

---

### Module 35 — Platform Admin (Phase 4+)

Separate route: `app/[locale]/(private)/platform/`. Platform_admin sees aggregated stats only — never customer records. Hard separation in `processChat.ts`. Platform_admin uses `ORB-001` codes to manage orgs.

---

### Module 36 — WhatsApp Voice Bridge (Phase 3, with AI)

```
360dialog webhook → signature validation
  → Trigger.dev: whatsapp-voice-processor
    → Whisper API (Arabic + English)
    → resolveContact: 4-layer (transcript name → WA disambiguation → thread → personCode match)
      Agent can say "update P-001, budget 150K" → AI finds by personCode instantly
    → Claude: extract fieldValues mapped to org's fieldDefinitions
    → ctx.runMutation(internal.leads.create OR internal.fieldValues.batchUpsert)
        Same mutations as UI — no WhatsApp-specific entity code
    → OrbitLink: P-001 --[whatsapp_thread]--> msg:abc
    → scheduleEntityContextRebuild (non-blocking)
    → 360dialog: confirmation reply to agent
```

---

## 📊 Schema Summary — All New Tables (v2.2)

| Table | Why | Phase |
|---|---|---|
| `orgRoles` | Dynamic RBAC (replaces hardcoded role strings) | 1 |
| `entityCodeCounters` | Per-org, per-type counter for personCode / dealCode / etc. | 2 |
| `platformOrgIdCounter` | Single global row — ORB-001 counter | 1 |
| `orbitLinks` | Lateral connections (deal↔company, contact↔whatsapp, etc.) | 2 |
| `platformTemplates` | Industry templates in DB (not config files) | 2 |
| `waitlist` | Pre-launch email capture | deferred |

**Additions to existing tables**:
```typescript
// leads:
personCode: v.string(),                     // "P-001" — generated on create, indexed
aiContext:  v.optional(v.any()),

// contacts:
personCode: v.string(),                     // "P-001" — passed from lead on conversion, indexed
aiContext:  v.optional(v.any()),

// deals:
dealCode:    v.string(),                    // "D-001" — own counter
personCode:  v.optional(v.string()),        // "P-001" — links to the person
companyCode: v.optional(v.string()),        // "CO-001" — if deal is for a company
aiContext:   v.optional(v.any()),

// companies:
companyCode: v.string(),                    // "CO-001" — own counter

// reminders / follow-ups:
followUpCode: v.string(),                   // "FU-001" — own counter
personCode:   v.string(),                   // always linked to a person
dealCode:     v.optional(v.string()),

// projects:
projectCode: v.string(),                    // "PJ-001"
personCode:  v.optional(v.string()),
dealCode:    v.optional(v.string()),

// tasks:
taskCode:    v.string(),                    // "T-001"

// orgs:
platformOrgId: v.string(),                  // "ORB-001" — set on org creation
aiContext:     v.optional(v.string()),
"settings.codePrefixes": v.optional(v.any()), // { person: "P", deal: "D", ... }

// users:
lastActiveAt:      v.optional(v.number()),
dismissedCards:    v.optional(v.array(v.string())),
preferredLanguage: v.optional(v.string()),

// orgMembers:
roleId: v.id("orgRoles"),                   // replaces role: v.string()
```

---

## 🔄 Complete Data Flow — Lead Lifecycle with Record Codes

```
1. WhatsApp voice note from potential client
   → Whisper transcription → no match found → new lead
   → leads.create (source: "whatsapp", actorType: "ai")
   → personCode generated: P-001
   → lead record: { personCode: "P-001", displayName: "John Smith", ... }
   → OrbitLink: P-001 --[created_via]--> whatsapp:msg001
   → entityAIContext scheduled for rebuild
   → Activity log: "Lead P-001 created via WhatsApp" (actorType: "ai")
   → Notification: "New lead P-001 assigned to Ahmed"

2. Agent opens lead P-001 → AI panel shows:
   "John Smith (P-001) — created 2h ago via WhatsApp
    Budget: AED 120K | Prefers 2BR JVC
    [Schedule Follow-up FU] [Convert to Contact] [View WhatsApp Thread]"

3. Lead P-001 converted to Contact
   → contact.create with personCode: "P-001" (passed directly — no new code)
   → Lead marked convertedAt, stores contactId
   → entityAIContext on contact initialised from lead's context
   → AI: "P-001 is now a contact. Deal ready to open?"

4. Deal opened for P-001
   → deals.create → dealCode: "D-001", personCode: "P-001"
   → OrbitLink: P-001 --[has_deal]--> D-001

5. Follow-up set
   → reminders.create → followUpCode: "FU-001", personCode: "P-001", dealCode: "D-001"

6. WhatsApp agent says "update P-001, budget now 150K"
   → AI: searchByCode("P-001") → finds contact record instantly
   → Updates fieldValues.budget_aed = 150000
   → entityAIContext rebuilt in background
   → WhatsApp confirmation: "P-001 (John Smith) budget updated to AED 150K ✓"

7. AI query "What's happening with P-001?"
   → searchByCode("P-001") → contact + lead origin + deals + follow-ups + WhatsApp threads
   → "John Smith (P-001) — Deal D-001 in Offer/MOU, Budget AED 150K.
      Follow-up FU-001 due tomorrow. Last WhatsApp 3 days ago."
```

---

## 🚫 Never-Do List (Locked)

```typescript
// ❌ Never hardcode "Orbitly" in user-facing strings → t('app.name')
// ❌ Never hardcode entity labels ("Lead", "Contact") → orgSettings.entityLabels
// ❌ Never hardcode record code prefixes ("P", "D") → orgSettings.codePrefixes
// ❌ Never hardcode pipeline stage names → pipelines table
// ❌ Never accept orgId/userId as mutation args → ctx.org._id / ctx.user._id
// ❌ Never use .collect() on unbounded tables → .take(n) or .paginate()
// ❌ Never call AI tools from inside mutations → one direction only
// ❌ Never build entity-specific list/detail pages from scratch → use scaffolds
// ❌ Never import leads code from contacts code → share via core/entities/shared/
// ❌ Never store AI chat state in Zustand → isOpen/isPending only; history in Convex
// ❌ Never delete data on plan downgrade → pause via feature flags
// ❌ Never use ml-4/pr-2 CSS → ms-4/pe-2 (logical properties — RTL-safe)
// ❌ Never skip logActivity() in any mutation → everything logged
// ❌ Never call Claude without checking billing status → zero tokens wasted
// ❌ Never call generatePersonCode() on contact creation → only on lead creation, then pass it
// ❌ Never rename record code numbers → only prefixes change, numbers are permanent
// ❌ Never write WhatsApp-specific code in entity mutations → mutations are source-agnostic
// ❌ Never auto-create reminders without user approval → AI suggests, user confirms
// ❌ Never rebuild entityAIContext synchronously → always via ctx.scheduler
```

---

## ✅ Production Acceptance Criteria (Every Feature)

```
□ No browser console errors or warnings
□ Data scoped to org — wrong orgId cannot read
□ Wrong role → PermissionGate shows ForbiddenState or null
□ Disabled module → ModuleGuard hides item, route redirects
□ logActivity() called in every mutation (actorType correct)
□ sendNotification() called where relevant
□ Loading skeleton renders while query pending
□ Empty state renders with AI suggestion slot
□ Renders at 390px without overflow (mobile)
□ pnpm build → 0 errors
□ pnpm typecheck → 0 errors
□ No Biome lint errors
□ No .collect() on unbounded tables
□ No any types in production code
□ personCode set on every lead create
□ personCode passed (not regenerated) on contact create from conversion
□ dealCode / followUpCode / projectCode / taskCode set on every relevant create
□ OrbitLink created for lateral connections
□ entityAIContext rebuild scheduled after significant mutations
□ Billing status checked before every AI call
□ AI tools RBAC-filtered at registry level
□ AI destructive actions require explicit user confirmation
□ All Tailwind CSS uses logical properties (ms- pe- ps- me-)
□ Record code search (searchByCode) resolves personCode from leads AND contacts table
```

---

## 📐 Phase 1 Build Order

```
Phase 1.A — Schema + RBAC (do first — 102 tests need updating)
1.  convex/schema.ts → add orgRoles, entityCodeCounters, platformOrgIdCounter, orbitLinks
2.  convex/orgRoles/ → queries + mutations
3.  convex/_shared/recordCodes.ts → generatePersonCode, generateEntityCode, generatePlatformOrgId
4.  convex/_shared/permissions.ts → refactor requirePermission() to DB lookup
5.  convex/orgs/mutations.ts → seed 3 orgRoles + platformOrgId on createOrg
6.  Update all 102 tests (hard cut — no parallel compatibility)

Phase 1.B — Shell Config
7.  core/shell/config/navigation.ts → NAV_GROUPS (Orbitly items)
8.  core/shell/hooks/useModuleEnabled.ts + useViewToggle.ts
9.  core/shell/components/ModuleGuard.tsx
10. core/shell/components/NotificationBell.tsx
11. core/shell/components/WorkspaceSwitcher.tsx

Phase 1.C — Shell Wiring
12. nav-main.tsx → UPDATE (RBAC + badges + entity labels + feature flags)
13. nav-user.tsx → UPDATE (real auth)
14. TopNav.tsx → UPDATE (NotificationBell, remove GitHub link)

Phase 1.D — Route Groups
15. app/[locale]/(private)/layout.tsx → auth guard
16. app/[locale]/(private)/dashboard/layout.tsx → onboarding guard

Phase 1.E — Onboarding + Dashboard
17. convex/platform/ → seed platformTemplates (Dubai RE + B2B Sales)
18. core/onboarding/ → wizard components
19. app/[locale]/(private)/onboarding/ → layout + page
20. app/[locale]/(private)/dashboard/[orgSlug]/page.tsx → Quick Win dashboard

Phase 1.F — Settings (including Record Codes)
21. core/settings/pages/ → all settings pages
22. settings/record-codes/page.tsx → prefix editor + rename confirmation + background job trigger
23. settings/ai/page.tsx → AI Settings
24. core/notifications/ + notifications page
```

---

## 🔮 MCP Readiness

One adapter file (~200 lines) when ready. Zero changes to existing mutations. All business logic already in Convex internalMutation/internalQuery. `searchByCode` tool becomes the primary MCP resolution endpoint.

---

*Version 2.2 — 2026-05-03*
*Record code system finalised: personCode (default P) on leads/contacts, entityCodes per type,*
*customisable prefixes per org, background rename job, platformOrgId (ORB-001)*
*All 36 modules locked. Shell gap analysis complete. Build-ready.*

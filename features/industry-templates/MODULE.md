# Industry Templates (Feature)

> Config bundles that seed pipelines, fields, labels, metrics, and AI persona per industry.
> Stored in DB (platformTemplates table) — not TypeScript config files.
> Managed by: platform_admin (built-in), org owner (fork/customize), AI (generate from conversation).

## Ownership
- **Location**: `features/industry-templates/`
- **Backend**: `convex/platform/` (platformTemplates table)
- **Phase**: 2 | **Status**: NOT_STARTED

---

## Why DB (Not Config Files)

**Decision: Store templates in `platformTemplates` table. Zero TypeScript template files.**

| Approach | Pros | Cons |
|---|---|---|
| TypeScript config files | Simple to write | Code deploy to add template, AI cannot create |
| DB table | AI can generate, admin can edit UI, no deploys | Slightly more complex initial setup |

**DB wins because**:
1. AI can generate a custom template from conversation → insert row → instant (no deploy)
2. Platform_admin adds new industries from admin UI without touching code
3. Org owner can fork and customize their template from Settings
4. Template changes are instant — no redeploy cycle
5. Org `templateId` FK → `platformTemplates` means switching templates is one field update

---

## Template Data Model

```typescript
// convex/schema.ts
platformTemplates: defineTable({
  key:                    v.string(),           // "dubai_re" | "b2b_sales" | "freelancer" | "custom_orgXYZ_1234"
  name:                   v.string(),           // "Dubai Real Estate"
  description:            v.string(),
  isBuiltIn:              v.boolean(),          // true = created by platform_admin, false = org-created or AI-generated
  entityLabels:           v.any(),              // { lead: { singular: "Inquiry", plural: "Inquiries" }, deal: { ... } }
  entityVisibility:       v.any(),              // { company: true, entity5: false }
  codePrefixDefaults:     v.any(),              // { person: "IN", deal: "D", followup: "FU" } — org can override
  defaultPipelineName:    v.string(),           // "Sales Pipeline"
  defaultStages:          v.array(v.any()),     // [{ id, name, order, color, isFinal, finalType, staleAfterDays }]
  defaultFieldDefinitions: v.array(v.any()),    // [{ name, label, type, options, groupName, showInStages }]
  defaultReminderSettings: v.any(),             // { followUpWindowHours: 24, staleAlertDays: 7, rentAlertDays: 95 }
  dashboardMetrics:       v.array(v.string()),  // ["leads_this_week", "deals_closing", "pipeline_value"]
  aiPersona:              v.string(),           // Added to system prompt: "You are a Dubai RE expert..."
  navHiddenSlots:         v.array(v.string()),  // ["company"] for freelancer — hides from sidebar
  createdBy:              v.optional(v.id("users")),
  createdAt:              v.number(),
  updatedAt:              v.number(),
})
.index("by_key",     ["key"])
.index("by_builtin", ["isBuiltIn"]),
```

---

## Built-in Templates (Seeded by Platform Admin)

Platform_admin creates and manages these from the admin dashboard UI.
They ship as a seed script for initial setup, then managed via UI from there.

### Dubai Real Estate (Primary — Build First)
```typescript
{
  key: "dubai_re",
  name: "Dubai Real Estate",
  entityLabels: {
    lead: { singular: "Inquiry", plural: "Inquiries" },
    contact: { singular: "Client", plural: "Clients" },
    deal: { singular: "Deal", plural: "Deals" },
  },
  codePrefixDefaults: { person: "IN", deal: "D", followup: "FU" },
  defaultStages: [
    { id: "new_inquiry",    name: "New Inquiry",    order: 0, color: "#3b82f6" },
    { id: "viewing",        name: "Viewing",        order: 1, color: "#8b5cf6" },
    { id: "offer_mou",      name: "Offer / MOU",    order: 2, color: "#f59e0b" },
    { id: "form_f",         name: "Form F",         order: 3, color: "#ef4444" },
    { id: "ejari",          name: "Ejari",          order: 4, color: "#10b981" },
    { id: "handover",       name: "Handover",       order: 5, color: "#6366f1", isFinal: true, finalType: "positive" },
    { id: "active_tenancy", name: "Active Tenancy", order: 6, staleAfterDays: 95 },
    { id: "lost",           name: "Lost",           order: 7, isFinal: true, finalType: "negative" },
  ],
  defaultFieldDefinitions: [
    { name: "budget_aed",       label: "Budget (AED)",    type: "currency", groupName: "Financial" },
    { name: "property_type",    label: "Property Type",   type: "select",
      options: ["Apartment", "Villa", "Townhouse", "Office", "Retail"], groupName: "Property" },
    { name: "bedrooms",         label: "Bedrooms",        type: "select",
      options: ["Studio", "1BR", "2BR", "3BR", "4BR", "5BR+"], groupName: "Property" },
    { name: "preferred_area",   label: "Preferred Area",  type: "text",    groupName: "Property" },
    { name: "rera_number",      label: "RERA Number",     type: "text",    groupName: "Compliance" },
    { name: "lease_expiry_date",label: "Lease Expiry",    type: "date",
      showInStages: ["active_tenancy"],                                     groupName: "Compliance" },
    { name: "passport_number",  label: "Passport No.",    type: "text",    groupName: "Documents", sensitive: true },
    { name: "emirates_id",      label: "Emirates ID",     type: "text",    groupName: "Documents", sensitive: true },
  ],
  defaultReminderSettings: {
    followUpWindowHours: 24,    // auto-suggest follow-up 24h after lead created
    staleAlertDays: 7,          // flag as stale after 7 days in a stage
    rentAlertDays: 95,          // 95-day renewal alert for active tenancy (UAE law)
  },
  aiPersona: "You are a Dubai real estate CRM expert. You understand Dubai rental market, RERA regulations, Ejari contracts, and the UAE property buying process. Key areas: JVC, Business Bay, Dubai Marina, Downtown, Palm Jumeirah. Use AED for all values.",
}
```

### B2B Sales
```typescript
{
  key: "b2b_sales",
  entityLabels: { lead: { singular: "Lead", plural: "Leads" }, deal: { singular: "Opportunity", plural: "Opportunities" } },
  defaultStages: [
    { id: "prospect",      name: "Prospect",       order: 0 },
    { id: "qualification", name: "Qualification",  order: 1 },
    { id: "demo",          name: "Demo / Meeting", order: 2 },
    { id: "proposal",      name: "Proposal Sent",  order: 3 },
    { id: "negotiation",   name: "Negotiation",    order: 4 },
    { id: "won",           name: "Won",            order: 5, isFinal: true, finalType: "positive" },
    { id: "lost",          name: "Lost",           order: 6, isFinal: true, finalType: "negative" },
  ],
}
```

---

## AI Template Generation Flow

When org owner asks AI to set up workspace for a new industry:

```
Step 1: Conversation
User: "We're a freelance web design agency. We manage clients and projects."
AI: "Got it. I'll set up a pipeline for your workflow. Based on freelance agencies, I suggest:

     📋 Your Pipeline: Inquiry → Proposal Sent → Deposit Paid → In Progress → Review → Complete | Lost

     Custom fields I'd add:
     • Project Budget (Currency)
     • Project Type (Website, Logo, Branding, etc.)
     • Deadline Date
     • Deposit Received (Checkbox)

     Entity labels:
     • Lead → 'Inquiry' | Contact → 'Client' | Deal → 'Project'

     [Approve all]  [Customize stages]  [Customize fields]  [Start over]"

Step 2: User approves → AI calls workspace.generateIndustryTemplate tool:
  → Inserts into platformTemplates (isBuiltIn: false, createdBy: userId)
  → Calls internal.orgs.applyTemplate({ templateId }) → seeds pipeline + fields + labels
  → Updates orgSettings.codePrefixes with template defaults

Step 3: AI confirms:
  "Your workspace is set up! Here's what I created:
   ✓ Pipeline: 7 stages from Inquiry to Complete
   ✓ Custom fields: Project Budget, Project Type, Deadline, Deposit
   ✓ Entity labels updated: Leads → Inquiries, Deals → Projects
   ✓ Template saved as 'Freelance Agency' — you can customize from Settings → Pipelines

   [View Pipeline]  [Edit Fields]  [Continue setup]"
```

---

## Org Owner Customization

After template is applied, org owner can customize EVERYTHING from Settings:
- Settings → Pipelines: Edit stages, colors, stale days, add/remove stages
- Settings → Fields: Add/edit/remove field definitions, change groups, set stage visibility
- Settings → Entity Labels: Rename entities (Lead → "Prospect")
- Settings → Record Codes: Change prefixes (P → IN → CL)
- Settings → AI Settings → Business Context: Update org AI context for better suggestions

**Template is the STARTING POINT, not the final word.** No permission needed to customize after applying.

---

## Applying a Template

```typescript
// convex/platform/mutations.ts::applyTemplateToOrg
export const applyTemplateToOrg = internalMutation({
  args: { orgId: v.id("orgs"), templateId: v.id("platformTemplates") },
  handler: async (ctx, args) => {
    const template = await ctx.db.get(args.templateId);

    // 1. Create default pipeline from template stages
    const pipelineId = await ctx.db.insert("pipelines", {
      orgId:    args.orgId,
      name:     template.defaultPipelineName ?? "Main Pipeline",
      entityType: "deal",
      isDefault: true,
      stages:   template.defaultStages,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    // 2. Create default field definitions
    for (const fieldDef of template.defaultFieldDefinitions) {
      await ctx.db.insert("fieldDefinitions", {
        orgId:    args.orgId,
        ...fieldDef,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    }

    // 3. Update org settings
    await ctx.db.patch(args.orgId, {
      templateId: args.templateId,
      "settings.entityLabels":    template.entityLabels,
      "settings.entityVisibility": template.entityVisibility,
      "settings.codePrefixes":    template.codePrefixDefaults,
      "settings.reminderDefaults": template.defaultReminderSettings,
      updatedAt: Date.now(),
    });

    await logActivity(ctx, {
      action: "org.template_applied",
      entityType: "org",
      entityId: args.orgId,
      description: `Industry template "${template.name}" applied`,
    });
  },
});
```

---

## Settings Integration — Easy Defaults

The goal: **any org can be productive in < 5 minutes with zero customization.**

Every setting has a sensible default. Defaults come from the applied template.
Users only go to Settings when they want to CHANGE something.

```
Settings → Pipelines
  Default: template stages pre-loaded. Just start adding deals.
  Advanced: Edit stage names, colors, stale thresholds, add/remove stages.

Settings → Fields
  Default: template fields pre-loaded and working. Forms show template fields immediately.
  Advanced: Add new fields, change groups, set stage visibility, mark sensitive.

Settings → Entity Labels
  Default: template labels (e.g., "Inquiry", "Client", "Deal").
  Change: Rename any entity label. Updates everywhere including sidebar, forms, AI.

Settings → Record Codes
  Default: template code prefix defaults (e.g., "IN" for Dubai RE person codes).
  Change: New prefix applied immediately via background job. Numbers never change.

Settings → AI Settings
  Default: template aiPersona injected automatically.
  Customize: Add business description, key terminology, team workflows.
  Advanced: View entity AI contexts, override incorrect context.

Settings → Reminders
  Default: template reminder settings (follow-up window, stale alert, rent alert).
  Customize: Change thresholds, enable/disable each alert type.
```

---

## Industry Templates — Settings Page (Platform Admin)

From the platform admin dashboard, `ORB-001` admins can:
- Create new built-in templates (shown in onboarding picker for all orgs)
- Edit existing built-in template (changes apply to orgs that re-apply the template)
- Preview a template before publishing
- Deprecate a template (hidden from new signups, existing orgs unaffected)
- See which orgs are using which template

```
Platform Admin → Templates
├── Built-in Templates (managed by platform_admin)
│   ├── Dubai Real Estate       [Edit] [Preview] [1,240 orgs using]
│   ├── B2B Sales               [Edit] [Preview] [890 orgs using]
│   └── [+ Create New Template]
│
└── Org-Created Templates (generated by AI for specific orgs)
    ├── "Freelance Agency" (org: Gulf Creative, ORB-023)  [View]
    └── "Property Management" (org: Skyline RE, ORB-041)  [View]
```

---

## Rules
- [ ] R-IT-01: Templates are DB rows — never TypeScript config files
- [ ] R-IT-02: `isBuiltIn: true` templates created by platform_admin only
- [ ] R-IT-03: AI-generated templates have `isBuiltIn: false`, `createdBy: userId`
- [ ] R-IT-04: Templates seed on onboarding Step 2 via `applyTemplateToOrg()` mutation
- [ ] R-IT-05: Template is starting point only — org owner can customize everything after applying
- [ ] R-IT-06: Orgs have `templateId` FK → `platformTemplates` for traceability

## Avoids
- ❌ Never create TypeScript config files for templates
- ❌ Never re-apply a template to overwrite existing customizations without explicit user confirmation
- ❌ Never hardcode industry-specific logic in entity mutations (use template data from DB)

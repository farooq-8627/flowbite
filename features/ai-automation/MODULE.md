# features/ai-automation — MODULE.md
## AI Automation & Background Intelligence
> **Phase**: 7 · **Status**: Future — locked behind `ai_automation` feature flag
> **Gate**: Plan-gated (`Pro` plan minimum). Role-gated (`ai.automation` permission).
> **Depends on**: Phase 3 (AI core), Phase 2 (reminders, activity logs, pipelines)

---

## Purpose

This module handles **automated intelligence** that runs without user prompting:

1. **Morning Briefing** — daily AI digest delivered at agent's local time
2. **Stale Deal Alerts** — proactive nudge when deals exceed `staleAfterDays`
3. **95-Day Rent Alert** (Dubai RE) — lease renewal reminder workflow
4. **Web Lead Scraping** — background web data enrichment
5. **Auto Follow-up Suggestions** — AI surfaces follow-up prompts in the dashboard

**Critical architectural constraint**: AI automation NEVER auto-executes mutations without user approval. It creates suggestions and reminders — the human confirms.

---

## Folder Structure

```
features/ai-automation/
├── MODULE.md                               # this file
├── index.ts                                # barrel: exports only what consumers need
│
├── components/
│   ├── MorningBriefingCard.tsx             # Dashboard card — shows today's AI digest
│   ├── StaleAlertsBanner.tsx               # Dashboard banner for stale deals/leads
│   ├── AutoSuggestionCard.tsx              # Inline suggestion card (follow-up, enrich)
│   └── AutomationSettingsPage.tsx          # Settings → Automation (enable/disable jobs)
│
└── convex-stubs/                           # Type stubs only — actual logic in convex/ai/automation/
    └── types.ts
```

```
convex/ai/automation/
├── morningBriefing.ts                      # internalAction — builds briefing content
├── staleAlerts.ts                          # internalAction — scans stale entities
├── followUpSuggestions.ts                  # internalAction — surfaces follow-up candidates
└── webEnrichment.ts                        # internalAction — enriches leads from web data

trigger/
├── crons/
│   ├── morningBriefing.ts                  # Trigger.dev cron — fires at 7am per org timezone
│   ├── staleAlertsSweep.ts                 # Trigger.dev cron — fires daily at 6am UTC
│   └── rentAlertSweep.ts                   # Trigger.dev cron — fires daily (Dubai RE only)
└── scraping/
    └── enrichLead.ts                       # Trigger.dev task — enriches one lead from web
```

---

## Architecture

### The "Suggest, Never Execute" Rule

Every automation in this module creates **suggestions** or **notifications**. It does NOT silently update records. This is the hard rule:

```typescript
// ❌ WRONG — auto-creating a reminder without user approval
await ctx.runMutation(internal.reminders.create, {
  personCode: "P-001", dueAt: tomorrow, note: "Auto follow-up"
});

// ✅ CORRECT — creating a notification that surfaces a suggestion
await ctx.runMutation(internal.notifications.create, {
  to: assignedUserId,
  templateKey: "automation.followup_suggestion",
  vars: { personName: "John Smith", personCode: "P-001", daysSince: 14 },
  action: {
    type: "suggestion",
    cta: "Schedule Follow-up",
    ctaMutation: "reminders.create",    // fires only when user clicks CTA
    ctaArgs: { personCode: "P-001", dueAt: tomorrow, note: "Auto-suggested follow-up" },
  },
});

// User sees: "P-001 John Smith hasn't been contacted in 14 days. [Schedule Follow-up]"
// Only clicking [Schedule Follow-up] fires reminders.create
// The notification itself is just information
```

---

## Module 1 — Morning Briefing

### Trigger.dev Cron

```typescript
// trigger/crons/morningBriefing.ts
import { schedules } from "@trigger.dev/sdk/v3";
import { ConvexHttpClient } from "convex/browser";

export const morningBriefingCron = schedules.task({
  id: "morning-briefing",
  // Fires every hour — handler checks per-org timezone to decide if it's 7am locally
  cron: "0 * * * *",
  run: async () => {
    const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

    // Get all orgs where local time is currently between 7:00 and 7:59 AM
    const orgsToNotify = await convex.query(api.platform.getOrgsForMorningBriefing, {
      currentHourUTC: new Date().getUTCHours(),
    });

    // Fire briefing generation for each eligible org
    await Promise.all(orgsToNotify.map(org =>
      convex.action(internal.ai.automation.generateMorningBriefing, {
        orgId: org._id,
        timezone: org.settings.timezone ?? "UTC",
      })
    ));
  },
});
```

### Briefing Generator (Convex internalAction)

```typescript
// convex/ai/automation/morningBriefing.ts
"use node";

export const generateMorningBriefing = internalAction({
  args: { orgId: v.id("orgs"), timezone: v.string() },
  handler: async (ctx, { orgId, timezone }) => {
    // Check: feature enabled + plan allows + org opted in
    const org = await ctx.db.get(orgId);
    if (!org.settings?.morningBriefingEnabled) return;
    if (org.billing?.status !== "active") return;

    // Gather today's data (no user prompt needed — AI builds from data)
    const [staleDeals, followupsDue, newLeads, wonDeals] = await Promise.all([
      ctx.runQuery(internal.deals.getStaleForOrg, { orgId }),
      ctx.runQuery(internal.reminders.getDueToday, { orgId }),
      ctx.runQuery(internal.leads.getCreatedYesterday, { orgId }),
      ctx.runQuery(internal.deals.getWonYesterday, { orgId }),
    ]);

    // Build briefing with claude-haiku (cheap — no user interaction, no tools needed)
    const { text } = await generateText({
      model: anthropic("claude-haiku-20240307"),
      system: await buildSystemPrompt(ctx, { orgId, userLocale: org.settings?.defaultLocale }),
      prompt: `
        Generate a concise morning briefing for the sales team.
        TODAY: ${new Date().toLocaleDateString("en-GB", { timeZone: timezone })}

        DATA:
        - New leads yesterday: ${newLeads.length} (${newLeads.map(l => l.personCode).join(", ")})
        - Deals won yesterday: ${wonDeals.length}
        - Follow-ups due today: ${followupsDue.length}
        - Stale deals (no activity): ${staleDeals.length}

        Be concise. Use the codes (P-001, D-007) so agents can reference records directly.
        Start with wins, then priorities, then warnings.
        Maximum 4 bullet points. Plain text, no markdown.
      `,
    });

    // Store briefing as a notification for all active members
    const members = await ctx.runQuery(internal.orgs.getActiveMembers, { orgId });
    await Promise.all(members.map(m =>
      ctx.runMutation(internal.notifications.create, {
        orgId,
        to: m.userId,
        templateKey: "automation.morning_briefing",
        vars: { content: text },
        expiresAt: Date.now() + 86400000, // expires in 24h — today's briefing only
      })
    ));

    // Log for audit
    await ctx.runMutation(internal.activityLogs.log, {
      orgId,
      actorType: "system",
      action: "automation.morning_briefing_sent",
      description: `Morning briefing generated and sent to ${members.length} members`,
    });
  },
});
```

### Dashboard Card

```typescript
// features/ai-automation/components/MorningBriefingCard.tsx
export function MorningBriefingCard() {
  // Morning briefing arrives as a notification — this card reads it
  const briefing = useQuery(api.notifications.getTodaysBriefing);

  if (!briefing) return null; // not yet generated or org doesn't have feature

  return (
    <Card>
      <CardHeader className="flex flex-row items-center gap-2 pb-2">
        <Sparkles className="size-4 text-amber-500" />
        <CardTitle className="text-sm">AI Morning Briefing</CardTitle>
        <RelativeTime timestamp={briefing.createdAt} className="ms-auto text-xs text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground whitespace-pre-line">{briefing.vars.content}</p>
      </CardContent>
    </Card>
  );
}
```

---

## Module 2 — Stale Deal Alerts

### Daily Sweep Cron

```typescript
// trigger/crons/staleAlertsSweep.ts
export const staleAlertsSweep = schedules.task({
  id: "stale-alerts-sweep",
  cron: "0 6 * * *",  // 6 AM UTC daily
  run: async () => {
    // Runs convex action that:
    // 1. Queries all deals where stageEnteredAt is older than stage.staleAfterDays
    // 2. For each stale deal, checks if a stale notification was already sent today
    // 3. If not, sends notification to assigned agent + their manager
    await convex.action(internal.ai.automation.sweepStaleDeals, {});
  },
});
```

```typescript
// convex/ai/automation/staleAlerts.ts
export const sweepStaleDeals = internalAction({
  args: {},
  handler: async (ctx) => {
    // Fetch all orgs on active plans
    const orgs = await ctx.runQuery(internal.platform.getActiveOrgs, {});

    for (const org of orgs) {
      const pipeline  = await ctx.runQuery(internal.pipelines.getDefault, { orgId: org._id, entityType: "deal" });
      const stageMap  = new Map(pipeline?.stages.map(s => [s.id, s]));

      const allDeals = await ctx.runQuery(internal.deals.getAllActive, { orgId: org._id });

      for (const deal of allDeals) {
        const stage = stageMap.get(deal.currentStageId);
        if (!stage?.staleAfterDays) continue;

        const daysInStage = Math.floor((Date.now() - deal.stageEnteredAt) / 86400000);
        if (daysInStage < stage.staleAfterDays) continue;

        // Stale! Send suggestion notification (not auto-move, not auto-close)
        await ctx.runMutation(internal.notifications.create, {
          orgId: org._id,
          to: deal.assignedTo ?? org.ownerId,
          templateKey: "automation.stale_deal_alert",
          vars: {
            dealCode:  deal.dealCode,
            dealTitle: deal.title,
            stageName: stage.name,
            daysInStage: String(daysInStage),
            personCode: deal.personCode ?? "",
          },
          // Suggested action — user must click to execute
          action: {
            type: "suggestion",
            cta: "Schedule a Follow-up",
            ctaMutation: "reminders.create",
            ctaArgs: {
              personCode: deal.personCode,
              dealCode:   deal.dealCode,
              note:       `Follow-up on ${deal.title} — stale in ${stage.name} for ${daysInStage} days`,
              dueAt:      Date.now() + 86400000, // default: tomorrow
            },
          },
        });

        await ctx.runMutation(internal.activityLogs.log, {
          orgId: org._id,
          actorType: "system",
          action:     "automation.stale_alert_sent",
          entityType: "deal",
          entityId:   deal._id,
          description: `Stale alert sent for ${deal.dealCode} — ${daysInStage} days in ${stage.name}`,
        });
      }
    }
  },
});
```

---

## Module 3 — 95-Day Rent Alert (Dubai RE)

This is a Dubai Real Estate-specific automation. Only runs when:
- Org industry = `dubai_re`
- Contact has `lease_expiry_date` custom field set
- `ai_automation` feature flag enabled

```typescript
// trigger/crons/rentAlertSweep.ts
export const rentAlertSweep = schedules.task({
  id: "rent-alert-sweep",
  cron: "0 7 * * *",   // 7 AM UTC daily
  run: async () => {
    const dubaiREOrgs = await convex.query(api.platform.getOrgsByIndustry, { industry: "dubai_re" });

    for (const org of dubaiREOrgs) {
      await convex.action(internal.ai.automation.sweepRentAlerts, { orgId: org._id });
    }
  },
});
```

```typescript
// convex/ai/automation/staleAlerts.ts::sweepRentAlerts
export const sweepRentAlerts = internalAction({
  args: { orgId: v.id("orgs") },
  handler: async (ctx, { orgId }) => {
    // Find the lease_expiry_date field definition
    const leaseField = await ctx.runQuery(internal.fieldDefinitions.getByName, {
      orgId, name: "lease_expiry_date",
    });
    if (!leaseField) return; // org hasn't set this field up

    // Find contacts in "Active Tenancy" stage whose lease expires in 90-100 days
    const targetWindow = {
      from: Date.now() + 90 * 86400000,
      to:   Date.now() + 100 * 86400000,
    };

    const expiringFieldValues = await ctx.runQuery(internal.fieldValues.getInDateRange, {
      orgId,
      fieldId: leaseField._id,
      from: targetWindow.from,
      to:   targetWindow.to,
    });

    for (const fv of expiringFieldValues) {
      const contact = await ctx.db.get(fv.entityId as Id<"contacts">);
      if (!contact) continue;

      const daysUntilExpiry = Math.floor((fv.value - Date.now()) / 86400000);

      await ctx.runMutation(internal.notifications.create, {
        orgId,
        to: contact.assignedTo ?? (await getOrgOwner(ctx, orgId)),
        templateKey: "automation.rent_expiry_alert",
        vars: {
          personCode:   contact.personCode,
          personName:   contact.displayName,
          daysUntil:    String(daysUntilExpiry),
          expiryDate:   new Date(fv.value).toLocaleDateString("en-AE"),
        },
        action: {
          type: "suggestion",
          cta:  "Draft Renewal WhatsApp",
          ctaMutation: "activityChat.createDraft",
          ctaArgs: {
            entityType: "contact",
            entityId:   contact._id,
            template:   "lease_renewal",
          },
        },
      });
    }
  },
});
```

---

## Module 4 — Web Lead Enrichment

```typescript
// trigger/scraping/enrichLead.ts
// Fired when: lead has a company website or LinkedIn URL set
// OR manually triggered from lead detail page ("Enrich with AI")

export const enrichLead = task({
  id: "enrich-lead",
  run: async ({ leadId, orgId, url }) => {
    // Use Apify or Firecrawl to scrape the URL
    const scraped = await scrapeUrl(url);

    // Claude extracts structured data from scraped content
    const extraction = await extractLeadData(scraped, {
      fieldDefinitions: await getFieldDefs(orgId, "lead"),
    });

    // Write to Convex using canonical fieldValues.upsert mutation
    for (const [fieldName, value] of Object.entries(extraction.fields)) {
      await convex.mutation(api.fieldValues.upsert, {
        entityType: "lead",
        entityId:   leadId,
        fieldName,
        value,
        source:     "web_enrichment",  // auditable
      });
    }

    // Log
    await convex.mutation(api.activityLogs.log, {
      orgId,
      actorType:   "system",
      action:      "automation.lead_enriched",
      entityType:  "lead",
      entityId:    leadId,
      description: `Lead enriched from ${url} — ${Object.keys(extraction.fields).length} fields updated`,
    });

    // Rebuild entityAIContext after enrichment
    await convex.action(internal.ai.rebuildEntityContext, { entityType: "lead", entityId: leadId });
  },
});
```

---

## Automation Settings Page

```typescript
// features/ai-automation/components/AutomationSettingsPage.tsx
// Accessible at: Settings → Automation (feature-gated — hidden if plan doesn't include ai_automation)

export function AutomationSettingsPage() {
  return (
    <PermissionGate permission="ai.automation">
      <div className="space-y-6">
        {/* Morning Briefing */}
        <SettingsSection title="Morning Briefing"
          description="Daily AI digest sent to your team at 7 AM your local time">
          <Toggle field="morningBriefingEnabled" />
        </SettingsSection>

        {/* Stale Alerts */}
        <SettingsSection title="Stale Deal Alerts"
          description="Notify agents when deals exceed the stage stale threshold">
          <Toggle field="staleAlertsEnabled" />
        </SettingsSection>

        {/* 95-Day Rent Alert — only shown for dubai_re industry */}
        <IndustryGate industry="dubai_re">
          <SettingsSection title="Lease Renewal Alerts"
            description="Alert 95 days before lease expiry in Active Tenancy stage">
            <Toggle field="rentAlertEnabled" />
          </SettingsSection>
        </IndustryGate>

        {/* Web Enrichment */}
        <SettingsSection title="Automatic Lead Enrichment"
          description="Enrich lead profiles from their website or LinkedIn URL">
          <Toggle field="webEnrichmentEnabled" />
        </SettingsSection>
      </div>
    </PermissionGate>
  );
}
// All toggles fire: api.orgs.updateAIAutomationSettings
// Which patches: orgs.settings.aiAutomation.* fields
// Crons check these flags before running
```

---

## Feature Flag & Plan Gate

```typescript
// Everywhere this module's components are used:
<ModuleGuard featureFlag="ai_automation" fallback={<UpgradeBadge plan="Pro" />}>
  <MorningBriefingCard />
</ModuleGuard>

// The cron jobs also check at runtime:
const org = await ctx.db.get(orgId);
const tier = await getTierConfig(ctx, org.plan);
if (!tier.features.ai_automation) return; // skip — org not on qualifying plan
```

---

## Never-Do List for This Module

```typescript
// ❌ Never auto-create a reminder without user approval — always send suggestion notification
// ❌ Never auto-send a WhatsApp or email — always create a draft for user to review
// ❌ Never run enrichment without an explicit URL or user trigger
// ❌ Never run cron logic inside Convex mutations — always Trigger.dev → internalAction
// ❌ Never log automation actions with actorType: "user" — always actorType: "system"
// ❌ Never run automation for orgs on inactive/cancelled billing
// ❌ Never send the same stale alert twice in one day — check notification recency before sending
// ❌ Never run rent alerts for non-dubai_re industry orgs
```
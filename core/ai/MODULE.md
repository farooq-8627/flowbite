# AI Assistant Module (Core)

> THE core differentiator — "Stop navigating your CRM. Just talk to it."
> Persistent chat panel, context-aware, role-gated tools, proactive suggestions,
> natural language follow-ups, message drafting, agentic tool loop.
> AI is CORE because it's always visible, cross-cutting, and IS the brand identity.

## Ownership
- **Location**: `core/ai/` (frontend) + `convex/ai/` (backend)
- **Routes**: None — renders as persistent right-side panel inside DashboardLayout
- **Phase**: 3 | **Status**: NOT_STARTED

---

## Security Model (Read First)

```
┌─────────────────────────────────────────────────────────┐
│              4-LAYER SECURITY                           │
│                                                         │
│  1. Auth layer: userId + orgId from server session      │
│     NEVER from request body. Client cannot spoof.       │
│                                                         │
│  2. Tool filtering: Claude only receives tools the      │
│     user's role allows. Viewer never sees delete tool.  │
│                                                         │
│  3. Data scoping: Every query includes orgId from ctx.  │
│     AI cannot read cross-org data.                      │
│                                                         │
│  4. Confirmation gates: Destructive actions             │
│     (delete, bulk update, stage change) require         │
│     explicit user confirmation before executing.        │
└─────────────────────────────────────────────────────────┘
```

Billing check happens BEFORE Claude API call — zero tokens consumed on suspended accounts:
```typescript
if (org.billing?.status === "suspended") return streamError("Account suspended.");
if (monthlyUsage >= limit) return streamError("Monthly AI limit reached. Upgrade to continue.");
```

---

## AI Tool File Organization

**Decision: Action-based files, not entity-based files.**

Each file handles ONE action category across ALL entity types via an `entityType` parameter.
This is more efficient than `lead.ts`, `contact.ts`, `deal.ts` because:
- AI thinks in ACTIONS (search, create, update), not entity silos
- A single `create_entity` tool handles leads/contacts/deals/companies → no duplication
- RBAC logic for each action is maintained in ONE place
- Adding a new entity type = add `entityType` to enum, not a new file

```
convex/ai/tools/
├── search.ts          # searchEntities, searchByCode (personCode/dealCode/etc.)
│                      # Works across all entity types via entityType param
├── create.ts          # createEntity (lead | contact | deal | company)
│                      # Calls canonical orgMutation per type, shows preview
├── update.ts          # updateEntity (any field, fixed or dynamic, any entity type)
│                      # Includes stage moves for deals
├── notes.ts           # addNote, searchNotes (any entity, any type)
├── reminders.ts       # setReminder (natural language dates), getOverdueReminders
│                      # completeReminder, getPersonFollowups (by personCode)
├── detail.ts          # getEntityDetail (full timeline + connected records via personCode)
│                      # getPersonGraph (all orbitLinks for a personCode)
├── analytics.ts       # getDashboardStats, getPipelineHealth, getForecast, getMorningBriefing
├── drafts.ts          # draftMessage (WhatsApp | email | note) — based on entity context
│                      # draftFollowup — structured follow-up suggestion
├── bulk.ts            # bulkUpdate (MANDATORY confirmation dialog before executing)
├── workspace.ts       # setupWorkspace, setupPipeline, setupRoles, setupFields
│                      # setupRecordCodes, generateIndustryTemplate (admin only)
└── code.ts            # searchByCode — primary resolution endpoint for P-001/D-007 etc.
```

### Why NOT entity-based files:
```typescript
// ❌ Entity-based (creates duplication):
convex/ai/tools/lead.ts     → searchLeads, createLead, updateLead, deleteLead
convex/ai/tools/contact.ts  → searchContacts, createContact, updateContact, deleteContact
convex/ai/tools/deal.ts     → searchDeals, createDeal, updateDeal, deleteDeal
// Problem: search logic repeated 3x, RBAC patterns repeated 3x, dedup patterns repeated 3x

// ✅ Action-based (zero duplication):
convex/ai/tools/search.ts   → searchEntities({ entityType: "lead" | "contact" | "deal", ... })
convex/ai/tools/create.ts   → createEntity({ entityType: "lead" | "contact" | "deal", data })
convex/ai/tools/update.ts   → updateEntity({ entityType, entityId, fields })
// Each calls the canonical orgMutation for the entityType internally
```

---

## Tool Registry — Role Filtering Before Claude Call

```typescript
// convex/ai/toolRegistry.ts
// Roles receive ONLY the tools they are permitted to use.
// Claude never sees a tool the user cannot execute.

const TOOL_PERMISSIONS: Record<ToolName, string | null> = {
  searchEntities:     "leads.view",           // any entity read
  searchByCode:       null,                   // no permission needed (read-only lookup)
  createEntity:       "leads.create",         // checked per entityType in tool handler
  updateEntity:       "leads.update",         // checked per entityType in tool handler
  addNote:            "notes.create",
  setReminder:        "reminders.create",
  completeReminder:   "reminders.create",
  getEntityDetail:    "leads.view",
  getPersonGraph:     "leads.view",
  getDashboardStats:  "reports.view",
  getPipelineHealth:  "reports.view",
  draftMessage:       null,                   // drafting only — no execution permission needed
  draftFollowup:      null,
  bulkUpdate:         "data.bulkActions",     // admin+ only
  setupWorkspace:     "ai.workspaceSetup",    // admin+ only
  generateTemplate:   "ai.workspaceSetup",    // admin+ only
};

export async function getToolsForRole(ctx, userId, orgId): Promise<ToolDefinition[]> {
  const permissions = await getUserPermissions(ctx, userId, orgId);
  return ALL_TOOLS.filter(tool =>
    TOOL_PERMISSIONS[tool.name] === null ||
    permissions.includes(TOOL_PERMISSIONS[tool.name])
  );
}
```

---

## Natural Language Date Parsing for Reminders

AI handles ALL date resolution — users never need to manually enter timestamps:

```typescript
// convex/ai/tools/reminders.ts
export const setReminderTool = tool({
  description: "Set a follow-up reminder for a person, deal, or any entity. " +
    "Resolve natural language dates automatically using the current date context.",
  parameters: z.object({
    personCode:           z.string().describe("Person code (P-001) of the person to follow up with"),
    dealCode:             z.string().optional().describe("Deal code if reminder is deal-specific"),
    naturalLanguageDate:  z.string().describe("e.g., 'next Monday', 'in 3 days', 'April 25', 'end of month'"),
    note:                 z.string().optional().describe("Optional note about what to follow up on"),
    assignedTo:           z.string().optional().describe("User ID to assign to (defaults to current user)"),
  }),
  execute: async ({ personCode, dealCode, naturalLanguageDate, note, assignedTo }, { ctx }) => {
    // Claude resolves the natural language date in its response
    // But we also resolve server-side as a fallback using date-fns
    const resolvedDate = resolveNaturalLanguageDate(naturalLanguageDate); // date-fns resolution
    const followUpCode = await generateEntityCode(ctx, ctx.org._id, "followup");

    const reminderId = await ctx.runMutation(internal.reminders.create, {
      personCode,
      dealCode,
      followUpCode,
      dueAt:      resolvedDate,
      note,
      assignedTo: assignedTo ?? ctx.user._id,
      source:     "ai",
    });

    return {
      type: "success",
      message: `Follow-up ${followUpCode} set for ${formatDate(resolvedDate)} ✓`,
      followUpCode,
      dueAt: resolvedDate,
      // No confirmation needed — scheduling is non-destructive
    };
  },
});

// Date resolution helper (server-side via date-fns):
function resolveNaturalLanguageDate(input: string): number {
  const now = new Date();
  const lower = input.toLowerCase().trim();

  if (lower === "tomorrow")          return addDays(now, 1).getTime();
  if (lower === "next monday")       return nextMonday(now).getTime();
  if (lower === "next tuesday")      return nextTuesday(now).getTime();
  if (lower === "next wednesday")    return nextWednesday(now).getTime();
  if (lower === "next thursday")     return nextThursday(now).getTime();
  if (lower === "next friday")       return nextFriday(now).getTime();
  if (lower === "end of month")      return endOfMonth(now).getTime();
  if (lower === "end of week")       return endOfWeek(now).getTime();
  if (lower.startsWith("in "))       return parseRelativeDate(lower, now); // "in 3 days" / "in 2 weeks"
  // If nothing matches, let Claude's date resolution from its response be used
  return Date.now() + 86400000; // fallback: tomorrow
}
```

**Key insight**: No confirmation dialog for reminders. They are non-destructive. The tool result
card shows the resolved date so the agent sees exactly what was set. They can edit if wrong.

---

## AI Message & Follow-up Drafting

The `draftMessage` and `draftFollowup` tools generate pre-written content based on entity context.
Agents review, edit, and send — AI never sends without human in the loop.

```typescript
// convex/ai/tools/drafts.ts
export const draftMessageTool = tool({
  description: "Draft a WhatsApp message, email, or note based on the person's history and context. " +
    "Always uses the person's actual data — budget, preferences, last interaction, deal stage.",
  parameters: z.object({
    personCode:  z.string().describe("Person code (P-001)"),
    channel:     z.enum(["whatsapp", "email", "note"]),
    intent:      z.string().describe("What the message should accomplish: follow_up | check_in | send_document | price_update | schedule_viewing"),
    language:    z.string().optional().describe("Language for the message (defaults to user's preferred language)"),
  }),
  execute: async ({ personCode, channel, intent, language }, { ctx }) => {
    // Load full entity context for this person
    const entityGraph = await ctx.runQuery(internal.search.getPersonGraph, { personCode });
    const aiContext   = entityGraph.contact?.aiContext ?? entityGraph.lead?.aiContext;

    // The actual drafting happens via Claude in the tool response
    // This tool provides context; Claude generates the draft
    return {
      type: "draft_request",
      personCode,
      channel,
      intent,
      context: {
        name:           entityGraph.contact?.displayName ?? entityGraph.lead?.displayName,
        keyFacts:       aiContext?.keyFacts ?? [],
        currentStage:   aiContext?.currentStage,
        lastContacted:  aiContext?.lastContactedAt,
        openDeals:      aiContext?.openDeals ?? [],
        language:       language ?? ctx.user.preferredLanguage ?? "en",
      },
      // Claude will generate the actual draft text based on this context
    };
  },
});
```

The draft appears in the chat as a formatted card with:
```
┌──────────────────────────────────────────────────┐
│ 📝 Draft WhatsApp Message for John Smith (P-001) │
│                                                  │
│ "Hi John, hope you're doing well! Just following │
│  up on the 2BR in JVC we discussed. The landlord │
│  confirmed the price at AED 115K. Shall we book  │
│  a viewing this week? 🏠"                        │
│                                                  │
│ [✏️ Edit & Send]  [🔄 Regenerate]  [✕ Dismiss] │
└──────────────────────────────────────────────────┘
```

---

## Tab-Specific AI Context & Proactiveness

### Context Injection Flow

```typescript
// core/ai/hooks/useAIChat.ts
export function useAIChat() {
  const pathname = usePathname();
  const params   = useParams();

  const entityContext = useMemo(() => {
    if (pathname.includes("/leads/")    && params.id)
      return { entityType: "lead",    entityId: params.id as string };
    if (pathname.includes("/contacts/") && params.id)
      return { entityType: "contact", entityId: params.id as string };
    if (pathname.includes("/deals/")    && params.id)
      return { entityType: "deal",    entityId: params.id as string };
    return null;
  }, [pathname, params]);

  return useChat({
    api: "/api/ai/chat",
    body: { currentRoute: pathname, entityContext },
    // entityContext → Convex loads entity.aiContext and entity.personCode
    // → injected into system prompt
    // → AI shows proactive panel immediately
  });
}
```

### System Prompt — Entity Context Layer

```typescript
// convex/ai/systemPrompt.ts
if (args.entityContext) {
  const entity    = await getEntityByTypeAndId(ctx, args.entityContext);
  const aiContext = entity?.aiContext;

  prompt += `
CURRENT RECORD IN VIEW: ${entity?.displayName} (${entity?.personCode ?? entity?.dealCode})
TYPE: ${args.entityContext.entityType}

KEY CONTEXT:
${JSON.stringify(aiContext, null, 2)}

INSTRUCTIONS:
- Prioritize answers about this specific record
- Use personCode "${entity?.personCode}" to look up full history if needed
- For complete event history, use get_entity_detail tool
- Do NOT invent history — only use provided context or tool results
- Suggest next steps proactively based on: last contact date, open reminders, stale risk, deal stage

TODAY: ${formatDate(Date.now())}
`;
}
```

### Proactive Panel UI

```typescript
// core/ai/components/ChatSuggestions.tsx
// Rendered at top of AI panel when entityContext is loaded

interface ProactiveSuggestion {
  label: string;
  prompt: string;          // sent to AI when clicked
  variant: "primary" | "secondary" | "warning";
}

function getEntitySuggestions(entityContext: EntityContext, aiContext: EntityAIContext): ProactiveSuggestion[] {
  const suggestions: ProactiveSuggestion[] = [];

  // Stale risk
  if (aiContext.staleRisk) {
    suggestions.push({
      label: `⚠️ No contact in ${aiContext.daysSinceContact} days`,
      prompt: `Suggest the best way to re-engage ${aiContext.displayName} based on their history`,
      variant: "warning",
    });
  }

  // Open follow-up due
  if (aiContext.followUpRequired && aiContext.followUpDue) {
    suggestions.push({
      label: `📅 Follow-up due ${formatRelativeDate(aiContext.followUpDue)}`,
      prompt: `Help me prepare for the follow-up with ${aiContext.displayName}`,
      variant: "primary",
    });
  }

  // Draft message
  suggestions.push({
    label: "✍️ Draft WhatsApp Message",
    prompt: `Draft a WhatsApp message for ${aiContext.displayName} based on our last interaction`,
    variant: "secondary",
  });

  // Next step for deal
  if (aiContext.currentStage) {
    suggestions.push({
      label: `🎯 What's next in ${aiContext.currentStage}?`,
      prompt: `What should I do next to advance this deal from ${aiContext.currentStage}?`,
      variant: "secondary",
    });
  }

  return suggestions;
}
```

---

## 3-Layer AI Context System

```
LAYER 1 — platformContext (global, all users)
  Table: platformContext { key: "main", content: text, version: string }
  Managed by: platform_admin from admin dashboard
  Contains: What Orbitly is, platform rules, off-topic decline instructions
  Updated: Rarely (by platform_admin only)

LAYER 2 — orgAIContext (per org)
  Field: orgs.aiContext (text, editable from Settings → AI Settings)
  Managed by: owner/admin
  Contains: Business description, workflows, terminology, team structure
  Example: "We are a Dubai real estate agency. We use Ejari for rentals.
            Always follow up within 24 hours. Our key area is JVC and Business Bay."
  Updated: By admin manually, OR by AI after workspace setup changes

LAYER 3 — entityAIContext (per record)
  Field: leads.aiContext / contacts.aiContext / deals.aiContext (v.optional(v.any()))
  Managed by: AI automatically (background rebuild after significant events)
  Contains: Compressed, essential, current facts about this specific record
  Example: {
    personCode: "P-001",
    lastContactedAt: "2026-04-20",
    lastContactMethod: "whatsapp",
    followUpRequired: true,
    followUpDue: "2026-05-10",
    currentStage: "Offer/MOU",
    daysInCurrentStage: 5,
    staleRisk: false,
    keyFacts: ["Budget AED 120K", "Prefers 2BR JVC", "Has Emirates ID on file"],
    openDeals: ["D-001"],
    openFollowUps: ["FU-003"],
    lastAIAction: "Sent rent comparison 2026-04-19",
  }
  Updated: After every note create, stage change, WhatsApp receive, follow-up set/complete
```

### entityAIContext Rebuild (Background, Non-Blocking)

```typescript
// convex/ai/rebuildEntityContext.ts (internalAction — "use node")
export const rebuildEntityContext = internalAction({
  args: { entityType: v.string(), entityId: v.string(), personCode: v.string() },
  handler: async (ctx, args) => {
    // 1. Load last 30 days of activityLogs for this personCode
    const logs = await ctx.runQuery(internal.activityLogs.getForPerson, {
      personCode: args.personCode,
      limit: 50,
    });

    // 2. Load recent notes and open reminders
    const [notes, reminders] = await Promise.all([
      ctx.runQuery(internal.notes.listForEntity, { entityType: args.entityType, entityId: args.entityId }),
      ctx.runQuery(internal.reminders.listOpen, { personCode: args.personCode }),
    ]);

    // 3. Call Claude haiku (cheap) to extract key facts
    const prompt = `Extract key facts about this CRM contact from their recent activity.
      Return ONLY a JSON object with: personCode, lastContactedAt, lastContactMethod,
      followUpRequired, followUpDue, currentStage, daysInCurrentStage, staleRisk,
      keyFacts (array of strings, max 6 items, most important facts only),
      openDeals (array of dealCodes), openFollowUps (array of followUpCodes), lastAIAction.
      Keep keyFacts concise — each max 10 words.

      Activity logs: ${JSON.stringify(logs.slice(0, 20))}
      Notes: ${JSON.stringify(notes.slice(0, 5))}
      Open reminders: ${JSON.stringify(reminders)}`;

    const response = await callClaudeHaiku(prompt); // lightweight model, cheap
    const newContext = JSON.parse(response);

    // 4. Write back to entity
    await ctx.runMutation(internal[args.entityType].updateAiContext, {
      entityId: args.entityId,
      aiContext: newContext,
    });
  },
});
```

**This is background intelligence** — no user-facing tokens, no user waiting. Runs after mutations.
Entity context is always fresh when the AI panel opens.

---

## AI Workspace Setup (Admin Tool)

Conversational setup — AI asks, builds preview, user approves, AI creates records.
Same mutations as Settings UI — no special AI-only paths.

```
Conversation flow:
1. "Let's set up your workspace. Tell me about your business."
   User: "We're a Dubai real estate agency focused on JVC rentals."

2. AI: "I'll create a pipeline for deals. Based on Dubai rentals, I suggest these stages:
   New Inquiry → Viewing → Offer/MOU → Form F → Ejari → Active Tenancy | Lost
   [Approve these stages] [Customize] [Start over]"

3. User: [Approve] → AI calls internal.pipelines.create (SAME as Settings UI)

4. AI: "What custom fields do you need? For Dubai RE, I suggest:
   Budget (AED), Property Type, Bedrooms, RERA Number, Lease Expiry Date
   [Add all] [Pick individually] [Skip fields]"

5. User: [Add all] → AI calls internal.fieldDefinitions.batchCreate (SAME as Settings UI)

6. AI: "Should I set your record code prefix? Default is 'P' for persons.
   For your agency, 'IN' (Inquiry) or 'CL' (Client) might make more sense.
   [Keep P] [Use IN] [Use CL] [Custom...]"
```

**AI Workspace Setup also handles Industry Template generation:**

```typescript
// convex/ai/tools/workspace.ts::generateIndustryTemplate
execute: async ({ businessDescription, suggestedStages, suggestedFields }, { ctx }) => {
  await requirePermission(ctx, "ai.workspaceSetup");

  // Inserts into platformTemplates table as org-specific template (isBuiltIn: false)
  const templateId = await ctx.runMutation(internal.platformTemplates.create, {
    key:  `custom_${ctx.org._id}_${Date.now()}`,
    name: `Custom template for ${ctx.org.name}`,
    defaultStages: suggestedStages,
    defaultFieldDefinitions: suggestedFields,
    isBuiltIn: false,
    createdBy: ctx.user._id,
  });

  // Apply to org immediately
  await ctx.runMutation(internal.orgs.applyTemplate, { templateId });

  return { type: "success", templateId, message: "Workspace configured and saved as a template!" };
},
```

---

## AI Tools — Complete List

| # | Tool | File | Permission | Confirmation |
|---|---|---|---|---|
| 1 | `searchEntities` | search.ts | entity.view | No |
| 2 | `searchByCode` | code.ts | none | No |
| 3 | `createEntity` | create.ts | entity.create | Yes (preview shown) |
| 4 | `updateEntity` | update.ts | entity.update | Yes if field is sensitive |
| 5 | `addNote` | notes.ts | notes.create | No |
| 6 | `setReminder` | reminders.ts | reminders.create | No — date shown in result |
| 7 | `completeReminder` | reminders.ts | reminders.create | No |
| 8 | `getEntityDetail` | detail.ts | entity.view | No |
| 9 | `getPersonGraph` | detail.ts | entity.view | No |
| 10 | `getDashboardStats` | analytics.ts | reports.view | No |
| 11 | `getPipelineHealth` | analytics.ts | reports.view | No |
| 12 | `draftMessage` | drafts.ts | none | N/A (draft only) |
| 13 | `draftFollowup` | drafts.ts | none | N/A (draft only) |
| 14 | `bulkUpdate` | bulk.ts | data.bulkActions | YES — mandatory |
| 15 | `setupWorkspace` | workspace.ts | ai.workspaceSetup | Yes |
| 16 | `generateTemplate` | workspace.ts | ai.workspaceSetup | Yes |

---

## Convex Backend Structure

```
convex/ai/
├── MODULE.md                    # This file (backend notes)
├── processChat.ts               # internalAction ("use node") — AI runtime
│                                # Billing check → prompt build → tool filter → stream
├── systemPrompt.ts              # 3-layer prompt builder (platform + org + entity)
├── toolRegistry.ts              # Role → tool mapping, TOOL_PERMISSIONS map
├── conversations.ts             # aiConversations + aiMessages CRUD
├── rebuildEntityContext.ts      # Background context rebuild (internalAction)
└── tools/
    ├── search.ts
    ├── create.ts
    ├── update.ts
    ├── notes.ts
    ├── reminders.ts             # NL date resolution via date-fns
    ├── detail.ts
    ├── analytics.ts
    ├── drafts.ts                # draftMessage, draftFollowup
    ├── bulk.ts
    ├── workspace.ts
    └── code.ts                  # searchByCode — primary MCP endpoint too
```

---

## Frontend Structure

```
core/ai/
├── MODULE.md                    # This file (frontend notes)
├── components/
│   ├── AIChatPanel.tsx          # Main panel (uses existing shell/AIChatPanel.tsx base)
│   ├── ChatMessage.tsx          # User + assistant message bubbles
│   ├── ChatToolCall.tsx         # Tool result cards (entity previews, reminder cards)
│   ├── ChatConfirmation.tsx     # [Confirm] / [Cancel] for destructive actions
│   ├── ChatSuggestions.tsx      # Proactive quick-action buttons (context-aware)
│   ├── DraftCard.tsx            # Draft message review card with [Edit & Send] / [Regenerate]
│   ├── ConversationSwitcher.tsx # Dropdown: last 10 conversations
│   └── PersonContextBanner.tsx  # "Viewing: John Smith (P-001)" header in panel
│
├── stores/
│   └── chatStore.ts             # Zustand: isOpen, pendingMessage (UI state ONLY)
│
└── hooks/
    └── useAIChat.ts             # useChat() wrapper + currentRoute + entityContext injection
```

---

## Server Action — Thin Proxy (NOT /api/chat route)

> **⚠️ Architecture**: Vercel AI SDK v5+ uses **Server Actions** instead of `/api/chat` route handlers. `useChat()` accepts an `action` prop. Simpler, more secure (no manual auth header), native App Router streaming.

```typescript
// core/ai/actions/chat.ts  ← Server Action, NOT app/api/ai/chat/route.ts
"use server";

import { createStreamableValue } from "ai/rsc";
import { auth } from "@/lib/auth";
import { fetchMutation } from "convex/nextjs";
import { internal } from "@/convex/_generated/api";

export async function sendChatMessage(
  messages: CoreMessage[],
  opts: { conversationId?: string; currentRoute?: string; entityContext?: EntityContext }
) {
  const session = await auth(); // server session — never trust client body
  if (!session?.userId || !session?.orgId) throw new Error("Unauthorized");

  const stream = createStreamableValue();
  void (async () => {
    const result = await fetchMutation(internal.ai.processChat, {
      userId: session.userId, orgId: session.orgId,
      messages, ...opts,
    });
    stream.done(result);
  })();
  return { output: stream.value };
}
```

```typescript
// core/ai/hooks/useAIChat.ts
import { useChat } from "ai/react";
import { sendChatMessage } from "../actions/chat";

export function useAIChat() {
  const pathname = usePathname();
  const params   = useParams();
  return useChat({
    action: sendChatMessage,  // Server Action, not /api/chat
    body: { currentRoute: pathname, entityContext: resolveEntityContext(pathname, params) },
  });
}
```

---

## WhatsApp + AI Shared Tool Pattern

WhatsApp voice pipeline uses the SAME tools as the chat panel.
The entry point differs (voice processor vs useChat hook), but tool execution is identical:

```
WhatsApp voice:
  Whisper API → transcript → resolveContact (by personCode/name)
  → Claude extracts intent → calls tools (createEntity / updateEntity / setReminder)
  → Same mutations as UI → orbitLinks created → entityAIContext rebuilt
  → WhatsApp confirmation sent back

AI chat panel:
  User message → Claude processes → calls tools (same tools)
  → Same mutations as UI → orbitLinks created → entityAIContext rebuilt
  → Chat response streamed back

Both callers: source="whatsapp" or source="ai", actorType="ai"
The mutations don't care — they log correctly either way.
```

---

## ToolLoopAgent — No Manual While Loop

> **⚠️ Architecture**: AI SDK v5+ provides `ToolLoopAgent` which handles the tool call → result → next call loop automatically. Do NOT write a manual `while (hasToolCalls)` loop.

```typescript
// convex/ai/processChat.ts (internalAction, "use node")
import { ToolLoopAgent } from "ai"; // AI SDK v5+

export const processChat = internalAction({
  handler: async (ctx, args) => {
    const tools = await getToolsForRole(ctx, args.userId, args.orgId);
    const systemPrompt = await buildSystemPrompt(ctx, args);

    // ToolLoopAgent handles the loop automatically:
    // 1. Claude responds with tool calls
    // 2. Tools execute
    // 3. Results fed back to Claude
    // 4. Repeat until no more tool calls
    // 5. Final text response streamed back
    const agent = new ToolLoopAgent({
      model: anthropic("claude-3-5-sonnet-20241022"),
      system: systemPrompt,
      tools,
      maxSteps: 10, // safety limit
    });

    return agent.stream(args.messages);
  },
});
```

> **Why ToolLoopAgent over manual loop:**
> - No `while (response.finishReason === "tool_calls")` boilerplate
> - Handles edge cases (max steps, errors) automatically
> - Cleaner code, less surface area for bugs

---

## AI Field Suggestions (Industry-Based)

When a user creates a new entity or opens a form, AI suggests relevant custom fields based on the org's industry. This is a lightweight, non-blocking feature.

**How it works:**
1. User opens "Add Lead" form (or Settings → CRM → Fields)
2. Frontend calls `api.ai.suggestFields` with `{ entityType, industry, existingFields }`
3. Convex internalAction calls Claude haiku (cheap) with industry context
4. Returns 3-5 suggested field names + types
5. User sees "AI Suggestions" section with one-click "Add" buttons

```typescript
// convex/ai/tools/workspace.ts
export const suggestFields = internalAction({
  args: {
    entityType:     v.string(),
    industry:       v.string(),
    existingFields: v.array(v.string()), // field names already added
  },
  handler: async (ctx, args) => {
    const prompt = `You are helping set up a CRM for a ${args.industry} business.
      They are adding custom fields for their ${args.entityType} records.
      They already have: ${args.existingFields.join(", ")}.
      Suggest 3-5 additional fields that would be most useful for this industry.
      Return JSON array: [{ name: string, type: "text"|"number"|"date"|"select"|"boolean", options?: string[] }]
      Only suggest fields not already in the existing list.`;

    const response = await callClaudeHaiku(prompt);
    return JSON.parse(response) as FieldSuggestion[];
  },
});
```

```tsx
// In Settings → CRM → Fields (and in EntityFormDialog)
function AISuggestedFields({ entityType, industry, existingFields, onAdd }) {
  const suggestions = useAction(api.ai.suggestFields, { entityType, industry, existingFields });

  if (!suggestions?.length) return null;
  return (
    <div className="rounded-[var(--radius)] border border-dashed border-primary/30 p-3 space-y-2">
      <p className="text-xs text-muted-foreground">✨ AI suggestions for {industry}</p>
      {suggestions.map(s => (
        <div key={s.name} className="flex items-center justify-between">
          <span className="text-sm">{s.name} <Badge variant="outline">{s.type}</Badge></span>
          <Button size="sm" variant="ghost" onClick={() => onAdd(s)}>+ Add</Button>
        </div>
      ))}
    </div>
  );
}
```

**Industries with pre-built suggestion sets** (no Claude call needed — static data):
- `real_estate` → RERA Number, Lease Expiry, Property Type, Bedrooms, View Type, Furnishing
- `automotive` → Make, Model, Year, Mileage, VIN, Color, Fuel Type
- `recruitment` → Position, Salary Range, Notice Period, Visa Status, Skills
- `insurance` → Policy Type, Premium, Expiry Date, Coverage Amount, Claim History

For other industries → Claude haiku call (< 1 second, < $0.001 per call).
- [ ] R-AI-01: API route derives userId + orgId from server session — NEVER from request body
- [ ] R-AI-02: Tool availability filtered by role BEFORE Claude call — viewer never sees destructive tools
- [ ] R-AI-03: System prompt built from DB only — no raw user input in system prompt (injection risk)
- [ ] R-AI-04: Every AI tool call logged in activityLogs with actorType: "ai" AND personCode
- [ ] R-AI-05: Destructive actions (delete, bulk update) MUST show ChatConfirmation before executing
- [ ] R-AI-06: reminders and follow-up scheduling do NOT require confirmation — show result in tool card
- [ ] R-AI-07: draftMessage and draftFollowup NEVER send anything — only return draft text for review
- [ ] R-AI-08: Billing status checked before EVERY Claude call — zero tokens wasted on suspended accounts
- [ ] R-AI-09: Entity context (aiContext) loaded from DB, never inferred from message history
- [ ] R-AI-10: AI tools are in convex/ai/tools/ ONLY — never scattered into entity modules
- [ ] R-AI-11: entityAIContext rebuild ALWAYS via ctx.scheduler.runAfter — never synchronous
- [ ] R-AI-12: DEBUG_AI=true env var enables full prompt + tool logging in dev only
- [ ] R-AI-13: AI system prompt MUST use dynamic entity labels from `orgs.entityLabels` — never hardcode "Lead", "Deal", "Contact" in prompts
- [ ] R-AI-14: AI business context (orgs.aiContext) managed in Settings → AI group by admin+ only

## Avoids
- ❌ Never accept orgId/userId as AI tool arguments — derive from ctx
- ❌ Never put user free-text into system prompt (prompt injection)
- ❌ Never create entity-specific tool files (lead.ts, contact.ts) — use action-based files
- ❌ Never auto-send emails/WhatsApp without explicit human approval
- ❌ Never rebuild entityAIContext synchronously — always schedule
- ❌ Never expose sensitive fields (sensitive: true) in AI context for non-admin roles
- ❌ Never call Claude without billing status check
- ❌ Never hard-code date resolution — always use date-fns + server-side resolution

## Tables Owned
| Table | Purpose |
|---|---|
| `aiConversations` | Chat threads per user per org — title, lastMessageAt, contextSummary |
| `aiMessages` | Messages in threads — role: "user" \| "assistant", content, toolCalls |
| `platformContext` | Global AI context managed by platform_admin |

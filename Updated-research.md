# Orbitly — Updated Strategy V2 (Market-Validated + Architecture-Resolved)

> **Written**: 2026-04-27 | Supersedes: UPDATED-STRATEGY.md (V1)
> **Based on**: Live market research + full codebase scan (schema.md, deep-plan.md, checklist.md) + Gemini RE research doc
> **Status**: Give this to the AI agent to update PLAN.md, todos.md, and context.md.

---

## PART 0 — What Changed From V1 (Read This First)

This document resolves four new questions raised after V1:

1. **Voice-to-CRM: How does the bot know WHICH contact to update?** → Answered in Part 2
2. **Should fieldDefinitions, pipelines, entityLabels be AI-dynamic?** → Answered in Part 3
3. **WhatsApp support bot (for agents) — does it work as a product?** → Answered in Part 4
4. **Gemini research validation** → Integrated in Part 1 (it confirms AND extends our plan)

---

## PART 1 — Market Research: Gemini Research Doc vs Our Plan

### What the Gemini Research Got Right (Validates Our Direction)

The independent Gemini research doc confirms every core assumption we made:

| Gemini Research Finding                                                  | Our Plan Status                                                   |
| ------------------------------------------------------------------------ | ----------------------------------------------------------------- |
| "WhatsApp chaos — 90% of deals happen on WhatsApp, data never logged"    | ✅ Core reason for WhatsApp voice bridge                          |
| "Tab Hell — agents switch between WhatsApp, Excel, government portals"   | ✅ Reason we're replacing Excel workflows                         |
| "Follow-up Failure — leads die because agents forget"                    | ✅ AI reminders + staleness detection in schema                   |
| "Language Barrier — AR/EN/FR mixed in same conversation"                 | ✅ Whisper handles code-switching, AI responds in user's language |
| "$30–$50/month per agent" is the right pricing range                     | ✅ We planned $99–$199 — see pricing reconciliation below         |
| "Mobile-First Design — agents are always on the move"                    | ✅ Already in plan — 390px mobile tests required                  |
| "Multi-Agent Support — small teams share one WhatsApp line"              | ✅ Our RBAC + shared inbox (Phase 4) covers this                  |
| "Voice-to-Task: transcribe voice notes into actionable tasks"            | ✅ Our WhatsApp voice bridge does exactly this                    |
| "AI OCR Extraction — read photos of IDs/Passports"                       | 🆕 NOT in our plan yet — add to Phase 3 (see Part 5)              |
| "Dynamic Template Engine — user defines template, AI parses docs to fit" | ✅ Our fieldDefinitions system IS this — already designed         |
| "Forward-to-Log: forward document to bot, attaches to Lead Card"         | 🆕 Extension of WhatsApp bridge — add to Part 2                   |
| "Zero-Manual Entry as the pitch"                                         | ✅ This is our core value proposition                             |
| "Don't sell Software, sell Time & Commission"                            | ✅ Adopted as our sales pitch framing                             |

### Pricing Reconciliation

Gemini research says $30–$50/month. We planned $99–$199/month. Who is right?

**Both are right for different segments:**

| Segment                           | Price             | Notes                                                           |
| --------------------------------- | ----------------- | --------------------------------------------------------------- |
| Solo agent, testing the product   | $30–$49/mo        | Entry tier. Gets basic CRM + WhatsApp bot. No AI field mapping. |
| Active agent, wants AI automation | $79–$99/mo        | Pro tier. Full AI voice mapping + OCR + reminders.              |
| Small agency (3–10 agents)        | $150–$300/mo flat | Agency plan. Shared inbox + manager dashboard + team RBAC.      |
| Mid-size brokerage (10–25 agents) | $25–$40/seat/mo   | Per-seat pricing. Custom pipeline + compliance features.        |

**Conclusion**: Start with $49/mo for early adopters to reduce friction. Move to $99/mo once word of mouth starts. Agency plans are your real revenue.

### What the Gemini Research Adds to Our Plan (New Features)

These are in the Gemini doc but NOT yet in our plan. They are validated by real agent pain:

1. **AI OCR — read ID/Passport photos** → Agent forwards Emirates ID photo → AI extracts Name, ID number, nationality, expiry → auto-fills contact fields. This is a Dubai-specific killer feature. Add to Phase 3.

2. **"95-Day Alert" (Dubai RERA)** → Auto-reminder: send rent-increase notice 90 days before lease expiry. This is a legal compliance feature that could save/lose agents significant commission. Add as a Dubai RE template feature.

3. **"Wafi Shield" (Saudi REGA)** → AI checks off-plan project license numbers to ensure they're valid. Protects agents from marketing illegal projects. Add to Saudi template (Phase 4+).

4. **WhatsApp vCard generation** → Agent can ask: "Generate a contact card for Ahmed Al-Rashidi" → bot sends a WhatsApp vCard. Minor but high perceived value. Add to tool registry.

5. **Ejari/Ejar Pipeline stages** → These are the actual legal stage names in Dubai/Saudi RE. Our pipeline should be seeded with these names, not generic "Proposal/Negotiation". Add to Dubai RE template config.

6. **Document Vault per Lead** → Each lead card has a place to store PDFs, ID photos, title deeds. Currently in our schema via `messages.attachments` but not surfaced as a "Document Vault" UI concept per lead. Add as a dedicated tab on Lead/Contact detail pages.

---

## PART 2 — The WhatsApp Voice Bridge: How Does It Know Which Contact?

### The Problem You Identified

> "Agent sends a voice note — but how do we know WHICH contact to update?"

This is the right question. Here is the complete answer.

### The Resolution Flow (4 Layers)

**Layer 1 — Agent Includes Context (Preferred Path)**

The agent learns to say the client name in the voice note. This is natural — agents already do this verbally:

> "Update on Ahmed Al-Rashidi. Budget confirmed 3M AED. Wants marina view, 2BR. Viewing scheduled Tuesday 3pm."

Claude hears "Ahmed Al-Rashidi" → searches `leads` + `contacts` by `displayName` → finds the record → updates fields.

This is no different from how the AI chat panel works today — you say who you mean and it finds them.

**Layer 2 — Bot Asks When Ambiguous**

If the agent doesn't mention a name, or the name is ambiguous:

```
Agent sends: [voice note] "Budget confirmed 3M, marina view"

Bot reply (WhatsApp):
"Got it. Who is this update for?
  1️⃣ Ahmed Al-Rashidi (last updated 2 days ago)
  2️⃣ Mohammed Hassan (active lead — marina)
  3️⃣ Reply with another name

Reply with 1, 2, 3, or type a name."

Agent replies: "1"
Bot: "✅ Ahmed Al-Rashidi updated:
      Budget: AED 3,000,000
      Location preference: Dubai Marina
      Viewing: Tuesday
      Anything else?"
```

**Layer 3 — Thread Context (Reply-Based)**

If the agent forwards a WhatsApp message from a client's chat thread, the bot can be trained to look for the thread context. Advanced — Phase 4+.

**Layer 4 — Quick-Code System (For Power Users)**

Each lead/contact gets a short code (auto-generated: `AHM-001`, `MOH-042`). Agent can say:

> "AHM-001: budget 3M, marina, 2BR"

Bot matches instantly with zero ambiguity. No searching needed.

**The Resolution Algorithm in Code:**

```typescript
// convex/ai/tools/whatsapp/resolveContact.ts
async function resolveContact(ctx, orgId, transcript) {
  // Step 1: Extract name from transcript
  const extractedName = await claude.extract(transcript, "person_name");

  if (extractedName) {
    // Step 2: Search contacts + leads by displayName (fuzzy)
    const matches = await fuzzySearchContacts(ctx, orgId, extractedName);

    if (matches.length === 1) {
      return { resolved: true, entityId: matches[0]._id, confidence: "high" };
    }

    if (matches.length > 1) {
      return {
        resolved: false,
        ambiguous: true,
        candidates: matches.slice(0, 3),
      };
      // → Bot sends disambiguation message to WhatsApp
    }
  }

  // Step 3: Check for quick-code (e.g., AHM-001)
  const quickCode = extractQuickCode(transcript);
  if (quickCode) {
    const entity = await findByQuickCode(ctx, orgId, quickCode);
    if (entity)
      return { resolved: true, entityId: entity._id, confidence: "exact" };
  }

  // Step 4: No match found → ask agent
  return { resolved: false, ambiguous: false };
  // → Bot: "Who should I add this update to? Reply with name or quick-code."
}
```

### Document Forwarding (ID Photos, Title Deeds)

Beyond voice notes, agents can forward documents. The bot handles:

| What Agent Forwards | What Bot Does                                                            |
| ------------------- | ------------------------------------------------------------------------ |
| Emirates ID photo   | OCR → extract Name, ID number, nationality, expiry → fill contact fields |
| Passport photo      | OCR → extract Name, nationality, passport number, expiry                 |
| Title Deed PDF      | Extract property address, plot number, owner name                        |
| Ejari document      | Extract contract start/end dates, rent amount, premises ID               |
| Voice note          | Whisper → transcribe → Claude maps to fieldDefinitions                   |
| Text message        | Claude parses → maps to fieldDefinitions                                 |

**One WhatsApp number, one bot, handles all of these.** The bot detects media type (audio/image/PDF) and routes to the correct processor.

---

## PART 3 — Dynamic fieldDefinitions: Correct Decision or Overkill?

### Your Question Exactly

> "Should AI be able to create fields and pipelines on the fly? All RE agents don't use the same fields. Is this overkill?"

### Clear Answer: This is Already Designed. It's Not Overkill. Here's Why.

Your schema already has `fieldDefinitions` as a database table, not hardcoded. This means:

- Fields are already dynamic (stored in DB, not in code)
- Pipelines are already dynamic (`pipelines` table with custom stages)
- Entity labels are already dynamic (`orgSettings.entityLabels`)
- AI can already create/modify these via the `setupWorkspace` and `setupPipeline` tools in the tool registry (Module 31 in deep-plan.md)

**What this means for real estate agents:** Two agents can have completely different field sets on the same base code.

```
Agent A (Residential Specialist):
  fieldDefinitions → budget_aed, bedrooms, bathrooms, furnished, floor_level
  pipeline stages → New Inquiry → Viewing → Offer → MOU → Transfer

Agent B (Commercial Leasing Specialist):
  fieldDefinitions → annual_rent_aed, sqft, fit_out_grade, parking_spaces, free_zone
  pipeline stages → Inquiry → Site Visit → Proposal → Heads of Terms → Signed

Both use the SAME Orbitly base. Zero code change.
```

### How the AI Adapts the CRM to Each Agent

During onboarding (or at any time via AI chat):

```
Agent: "I mainly deal with commercial office spaces in DIFC"

AI: "Got it — Commercial Leasing in DIFC. I'll customize your workspace:

Fields I'll add to your Leads:
  • Annual Rent (AED/year)
  • Area (sq ft)
  • Fit-Out Grade (Shell & Core / Cat A / Cat B)
  • Parking Spaces
  • Free Zone Compliant (Yes/No)
  • DEWA Connection Status

Pipeline I'll create:
  Inquiry → Site Visit → Proposal → Heads of Terms → MOU → Signed → Ejari

Should I set this up? [Yes, set it up] [Modify first] [Start over]"

Agent: [Yes, set it up]
AI: → calls setupFields() tool → creates 6 fieldDefinitions
    → calls setupPipeline() tool → creates pipeline with 7 stages
    → updates AI persona to include DIFC commercial leasing expertise
    → "Done! Your workspace is configured for DIFC commercial leasing."
```

### What CANNOT Be Dynamic (The Limits)

To prevent complexity from exploding, these stay fixed:

| Fixed (Never Changes)                                               | Dynamic (DB-Driven, AI-Configurable)                 |
| ------------------------------------------------------------------- | ---------------------------------------------------- |
| Core entity tables (leads, contacts, deals, companies)              | Field definitions (what fields exist per entity)     |
| Schema structure (how data is stored)                               | Pipeline stages (what the Kanban columns are called) |
| RBAC permission keys (~40 keys)                                     | Entity labels (Lead → "Inquiry", Deal → "Offer")     |
| Authentication + auth tables                                        | Dashboard metrics shown on home page                 |
| The 6 entity slots (lead, contact, deal, company, entity5, entity6) | AI persona string per org                            |
| Core UI components                                                  | Module visibility (which sidebar items show)         |

**Verdict: Not overkill. Already designed. Already built into the schema. Just needs the AI tools + onboarding flow to surface it.**

---

## PART 4 — The WhatsApp Support Bot: Does It Work as a Product?

### Your Idea

> "Have a WhatsApp number where anyone raises support queries. A bot solves them. If they need a human, we provide a number. All actions logged in CRM."

### This Is TWO Different Things. Be Clear About Which One You're Building.

**Thing A — Agent-to-CRM Bot (Already Planned)**
The WhatsApp number is a tool for agents to update their OWN CRM. Agent forwards voice note → CRM updates. This is your core feature. Build this.

**Thing B — Customer Support Bot (New Idea)**
A public WhatsApp number where Orbitly's own end-clients (the real estate buyers) contact the agent and get served by a bot. Different use case entirely.

### Answering Both:

**Thing A (Agent-to-CRM Bot) — Build This**

- Agents are comfortable sending voice notes to WhatsApp — they do it all day
- Agents will NOT open a laptop mid-viewing. They will send a WhatsApp voice note
- This is your #1 differentiator. No other Gulf RE CRM does this
- All actions are logged in CRM via `activityLogs` with `actorType: "ai"`
- WhatsApp reply confirms what was logged → agent knows it worked
- **Verdict: Build this in Phase 3. It is the product.**

**Thing B (Customer Support Bot for Buyers) — Do Not Build Now**

- Real estate buyers in Dubai DO use WhatsApp to ask about properties
- But: Dubai agents want to TALK to buyers personally — "relationship selling" is critical in luxury RE
- Agents will resist if a bot handles their buyer relationship — commission is too high to risk on a bot
- The agent manages buyer communication; the bot helps the agent manage THEIR data
- **Verdict: Build this only if agents specifically request it. Most won't want a bot talking to their clients. Defer to Phase 5+.**

### What Agents Actually Want (From Research)

| Agent Want                        | Solution                                                                 |
| --------------------------------- | ------------------------------------------------------------------------ |
| Log client details without typing | Voice note → CRM update (Thing A)                                        |
| Never forget a follow-up          | AI-generated reminders in CRM + WhatsApp notifications                   |
| Know which leads are going cold   | Staleness badges + AI morning briefing                                   |
| Share pipeline with manager       | RBAC — manager sees team's pipeline in dashboard                         |
| Reply to client messages fast     | "Whisper mode" — AI suggests reply text, agent copies and sends manually |
| Handle document paperwork faster  | AI OCR from forwarded ID photos                                          |

**Whisper Mode (New Feature from Gemini Research):**

> Agent receives a message from a client about contract terms.
> Agent forwards it to the Orbitly bot.
> Bot analyzes the client's message + the deal context in CRM.
> Bot suggests a professional reply in Arabic or English.
> Agent reviews, edits if needed, and sends from their personal WhatsApp.

This is powerful because the agent remains in control. The AI assists, doesn't replace.

---

## PART 5 — New Features to Add (From Research Integration)

The following features are validated by market research but not yet in the plan. Add them to the appropriate phase.

### Phase 3 Additions (Ship With AI + WhatsApp)

**1. AI OCR — Document Reading**
Priority: HIGH. Dubai RE agents handle Emirates IDs, passports, title deeds daily.

```
Flow:
  Agent forwards Emirates ID photo → WhatsApp bot
  Bot: routes to Trigger.dev job: ocr-document
  Trigger.dev: sends image to Claude Vision / AWS Textract
  Extracts: { name, idNumber, nationality, dateOfBirth, expiryDate }
  Maps to fieldDefinitions on the contact record
  Bot reply: "✅ Emirates ID read:
             Name: Ahmed Al-Rashidi
             ID: 784-1985-1234567-8
             Nationality: UAE
             Expiry: 15 March 2028
             Attached to [Contact: Ahmed Al-Rashidi]"
```

New Trigger.dev task: `ocr-document`
New AI tool: `extractDocumentData(imageUrl, documentType)`
Document types supported: `emirates_id`, `passport`, `title_deed`, `ejari_contract`, `tenancy_contract`

**2. Document Vault UI**
Each Lead/Contact detail page gets a "Documents" tab:

- Stores files forwarded via WhatsApp or uploaded directly
- Categorized: IDs, Contracts, Property Docs
- Quick-view without downloading
- Add to `leads` and `contacts` detail page tabs (alongside Overview, Activity, Deals, Notes)
- Backend: files stored in Convex file storage, metadata in a new `entityDocuments` table

```typescript
entityDocuments: defineTable({
  orgId: v.id("orgs"),
  entityType: v.string(), // "lead" | "contact" | "deal"
  entityId: v.string(),
  fileName: v.string(),
  fileType: v.string(), // "emirates_id" | "passport" | "title_deed" | "contract" | "other"
  storageId: v.id("_storage"), // Convex file storage
  extractedData: v.optional(v.any()), // OCR output if applicable
  uploadedBy: v.string(), // "whatsapp_bot" | userId
  createdAt: v.number(),
}).index("by_entity", ["orgId", "entityType", "entityId"]);
```

**3. Whisper Mode — AI Reply Suggestion**
Agent forwards a client message to bot → bot analyzes message + deal context → suggests a reply in the client's language.

```
Agent forwards: "Ahmed: متى يمكنني الحصول على مفاتيح الشقة؟"
                (When can I get the apartment keys?)

Bot: "Suggested reply (Arabic):
     'مرحباً أحمد، بعد إتمام إجراءات العقد وتسوية المدفوعات في دائرة الأراضي،
     سيتم تسليم المفاتيح خلال 3-5 أيام عمل.
     هل تريد أن نحدد موعداً لذلك؟'

     [Copy this] [Edit and copy] [Ignore]"
```

New AI tool: `suggestClientReply(messageText, dealId, language)`

**4. Ejari/Ejar Pipeline Integration**
Pre-seeded pipeline stages for Dubai RE that match legal process names:

```typescript
// features/industry-templates/config/dubai-real-estate.ts
pipeline: {
  name: "Dubai RE Pipeline",
  stages: [
    { name: "New Inquiry",        color: "#6B7280", staleAfterDays: 1 },
    { name: "Viewing Scheduled",  color: "#3B82F6", staleAfterDays: 3 },
    { name: "Offer / MOU",        color: "#F59E0B", staleAfterDays: 2 },
    { name: "Form F (RERA)",      color: "#8B5CF6", staleAfterDays: 5 },
    { name: "Ejari Registration", color: "#0EA5E9", staleAfterDays: 3 },
    { name: "Handover",           color: "#10B981", staleAfterDays: 7 },
    { name: "Active Tenancy",     color: "#22C55E", isFinal: true, finalType: "positive" },
    { name: "Lost / Withdrawn",   color: "#EF4444", isFinal: true, finalType: "negative" },
  ]
}
```

**5. 95-Day Rent Increase Alert (Dubai RERA Compliance)**
Auto-generated reminder at contract creation:

```typescript
// Trigger.dev scheduled job: check-ejari-renewals
// Runs daily. Scans all deals in "Active Tenancy" stage.
// If (leaseExpiryDate - today) <= 95 days AND no rent-increase-notice sent:
//   → Create reminder for assigned agent
//   → Send WhatsApp notification to agent
//   → Log in activityLogs with actorType: "system"
```

**Field required on deal**: `leaseExpiryDate`, `rentIncreaseNoticeSent (boolean)`

**6. WhatsApp Quick-Code System**
Each lead/contact auto-generated short code on creation:

```typescript
// leads table: add quickCode field
quickCode: v.optional(v.string()),  // "AHM-001", "MOH-042" — org-unique, auto-generated

// Format: first 3 letters of displayName + sequential number
// Collision handling: if AHM-001 exists, use AHM-002
```

---

## PART 6 — Updated Architecture Decision: Base is Correct

### Final Verdict on Architecture Approach

| Approach                                   | Verdict    | Reason                                           |
| ------------------------------------------ | ---------- | ------------------------------------------------ |
| Pure Schema-less (AI memory graph only)    | ❌ Wrong   | No Kanban, no pipeline, no manager visibility    |
| Traditional CRM (forms only)               | ❌ Wrong   | Data entry fatigue, agents won't use it          |
| Pure AI Dashboard (type into panel only)   | ❌ Wrong   | Agents are driving — they won't open laptop      |
| **Hybrid: Structured DB + AI Input Layer** | ✅ Correct | Managers get Kanban/reports, agents get WhatsApp |

### The Two Interfaces, One Database

```
Input Layer:                          Output Layer:
─────────────                         ──────────────
WhatsApp voice note → Whisper         Dashboard Kanban Board
WhatsApp image → OCR                  Lead/Contact list tables
WhatsApp text → Claude                Deal pipeline analytics
AI Chat panel (dashboard)             Manager team overview
                    ↓                 AI morning briefing
              Convex DB               ↑
              (fieldDefinitions       Data flows here
               fieldValues            from input layer
               pipelines
               leads/contacts/deals
               aiContext blob)
```

### The `aiContext` Column — Add Now

This single addition unlocks the hybrid fully:

```typescript
// Add to leads, contacts, deals tables in convex/schema.ts (Phase 2):
aiContext: v.optional(v.any()),

// This stores:
// 1. Voice note overflow: things Claude heard that have no fieldDefinition yet
// 2. OCR overflow: extracted data from documents beyond mapped fields
// 3. Whisper mode context: what the client's last message said
// 4. Agent's raw notes: unstructured observations

// Example:
aiContext: {
  rawNotes: ["Client mentioned divorce settlement", "Prefers ground floor", "Has a dog"],
  lastClientMessage: "متى يمكنني الحصول على مفاتيح الشقة؟",
  documentExtras: { idBackSide: "Dubai visa stamp visible" },
  voiceNoteTimestamps: ["2026-04-15T10:23:00Z", "2026-04-18T14:45:00Z"]
}
```

Nothing is lost. If a new fieldDefinition is created for "Client Has Pets" later, the AI can backfill from `aiContext`.

---

## PART 7 — Updated Phase Sequence (Final)

### What Changes From Previous Plan

| Previously                  | Now                                   | Why                                                         |
| --------------------------- | ------------------------------------- | ----------------------------------------------------------- |
| WhatsApp in Phase 5         | WhatsApp in Phase 3 (with AI)         | It's the #1 differentiator. Ship it with AI.                |
| B2B Sales as first industry | Dubai Real Estate first               | Market gap confirmed. B2B is flooded.                       |
| AI ships after CRM          | AI ships WITH CRM                     | Without AI there is no product worth selling                |
| No OCR planned              | OCR in Phase 3                        | Validated by Gemini research. Dubai-specific killer feature |
| No Document Vault           | Document Vault in Phase 3             | Legal docs are central to RE agent workflow                 |
| No quick-codes              | Quick-codes in Phase 2                | Needed for WhatsApp contact resolution                      |
| Entity5/Entity6 for RE      | entity5 = Property, entity6 = Listing | RE agents need Property records distinct from Contacts      |

### Phase Sequence

---

#### ✅ Phase 0 — Foundation (COMPLETE)

Auth · RBAC (102 tests) · Multi-tenancy · Invitations · Activity logs · Notifications helpers · 16 shadcn components · PostHog + Sentry · `PermissionGate` · Zustand store · 4 theme presets

`pnpm typecheck`: 0 errors | `pnpm test`: 102 passing | `pnpm build`: 0 errors

---

#### 🔨 Phase 1 — Shell + Onboarding (CURRENT)

**Time estimate**: 1–2 weeks

- Navigation config + Dashboard layout + Sidebar + TopNav
- 3-step onboarding: Org name → Industry picker (Dubai RE as default option) → Done
- Quick Win Dashboard with metric cards
- RBAC dynamic roles refactor (`orgRoles` table + `requirePermission()`)
- Auth redirect: signed in → onboarding → dashboard
- RTL: `dir="rtl"` on Arabic `<html>` + `messages/ar.json` bootstrapped

**Start WhatsApp Business API application NOW** (takes 1–2 weeks for approval — run in parallel with Phase 1 build)

---

#### 🔨 Phase 2 — CRM Core + Dubai RE Template

**Time estimate**: 3–4 weeks

**Schema additions (do first):**

```typescript
// leads, contacts, deals:
aiContext: v.optional(v.any()),     // overflow from voice/OCR/AI
quickCode: v.optional(v.string()),  // e.g., AHM-001 for WhatsApp resolution
```

**New table:**

```typescript
entityDocuments: defineTable({ ... })  // Document Vault
```

**Build:**

- `pipelines` + `fieldDefinitions` + `fieldValues` tables + mutations
- Seed **Dubai RE template** (not B2B) as default on org creation:
  - Pipeline stages: New Inquiry → Viewing → Offer/MOU → Form F → Ejari → Handover → Active Tenancy
  - Fields: budget_aed, property_type, bedrooms, location_preference, client_language, lead_source, viewing_date, rera_number, lease_expiry_date
  - entity5 activated as "Property" · entity6 activated as "Listing"
  - AI persona: Dubai RE expert with RERA/DLD/Ejari knowledge
- Lead/Contact/Deal/Company CRUD
- Kanban pipeline view
- Document Vault tab on Lead + Contact detail pages
- Dedup engine (email + fuzzy name)
- Tags + Saved Views + Bulk actions
- CSV import (agents have existing client lists in Excel/Bayut exports)
- Auto-generate `quickCode` on lead/contact creation
- Billing: LemonSqueezy integration

**Gate**: Working CRM. Someone can manage a Dubai RE pipeline manually. Show this to early users.

---

#### 🔨 Phase 3 — AI Assistant + WhatsApp Bridge + OCR (Ship Together)

**Time estimate**: 3–4 weeks. These three must ship in the same release.

**AI Chat Panel (dashboard):**

- `convex/ai/processChat.ts` — ToolLoopAgent with internalAction
- `convex/ai/systemPrompt.ts` — reads fieldDefinitions + pipeline stages + entityLabels at runtime
- Tool registry — all tools from Module 31 + new RE-specific tools
- `ChatSheet.tsx` — persistent right panel
- AI confirms before destructive actions (data preview card)
- AI logs every action with `actorType: "ai"` in activityLogs
- Proactive mode: context-aware suggestions based on current page

**WhatsApp Voice Bridge:**

```
Agent → forwards voice note → WhatsApp Business API number (Twilio or 360dialog)
  → Webhook: app/api/channels/whatsapp/route.ts
  → Trigger.dev job: whatsapp-voice-processor
    1. Download audio file
    2. OpenAI Whisper API: transcribe (Arabic + English code-switching)
    3. resolveContact(): find which contact this is about (Layer 1–4 resolution)
       → If ambiguous: send disambiguation message back to WhatsApp
    4. Claude: parse transcript against org's fieldDefinitions
       → Map structured data → write to fieldValues
       → Map overflow → write to aiContext
    5. Convex internalMutation: upsert entity record
    6. Twilio: send WhatsApp reply confirming what was updated
    7. activityLogs: log with actorType: "ai", actor: "whatsapp_bot"
  → Real-time Kanban update (Convex reactive query)
```

**Document Forwarding (Same Pipeline):**

```
Agent → forwards Emirates ID photo or PDF → WhatsApp bot
  → Trigger.dev job: whatsapp-document-processor
    1. Detect media type: image → OCR | PDF → text extract
    2. Claude Vision / AWS Textract: extract fields
    3. resolveContact(): find which contact
    4. Map extracted fields → fieldValues
    5. Store file → Convex _storage → entityDocuments table
    6. WhatsApp reply: "✅ Emirates ID attached to [Contact Name]"
```

**Whisper Mode:**

- Agent forwards a client's WhatsApp message to bot
- Bot detects: this is a CLIENT message (not an update command)
- Bot analyzes message + deal context
- Bot suggests a professional reply in the client's detected language
- Agent copies the reply and sends from their own WhatsApp

**95-Day Alert (Scheduled Job):**

```typescript
// trigger/scheduled/ejari-renewal-check.ts
// Runs daily at 8am Gulf time (UTC+4)
// Scans all deals in "Active Tenancy" stage
// If leaseExpiryDate - today <= 95 days AND !rentIncreaseNoticeSent:
//   → Create reminder for assignedTo agent
//   → Send WhatsApp notification to agent
//   → Log in activityLogs with actorType: "system"
```

**Gate**: The core demo. Agent sends voice note → CRM updates in real time → Manager sees it on dashboard. This is what you sell. Record a 90-second demo video of this flow.

---

#### Phase 4 — Arabic Polish + Gulf UX + Bayut/PF Import

**Time estimate**: 1–2 weeks

- Full `messages/ar.json` for all UI strings
- RTL CSS audit — every component tested in Arabic layout
- Arabic number formatting in deal values
- Gulf phone validation (UAE +971, Saudi +966, Kuwait +965)
- AI responds in Arabic when agent types in Arabic
- Bayut + Property Finder CSV import format support (these portals have standard export formats)
- PDPL basics: data processing log, right-to-erasure flag on contacts

---

#### Phase 5+ — Expand Verticals from Base

Once revenue from Dubai RE:

- Add Saudi KSA template (Ejar, SADAD, REGA compliance, Wafi Shield)
- Add Freelancer template (same base, new fieldDefinitions seed)
- Add Agency/Consulting template
- Each new vertical = 1 new config file (~100 lines) + seeding script

---

## PART 8 — How RBAC and Multi-Tenancy Earn Revenue

### The Real Brokerage Use Case

A Dubai brokerage has 10 agents and 1 manager. Here is what RBAC enables:

| Role          | What They See                                               | What They Can Do                                           | Price Paid                      |
| ------------- | ----------------------------------------------------------- | ---------------------------------------------------------- | ------------------------------- |
| Owner/Manager | All 10 agents' pipelines, full AED values, team performance | Full control, reassign leads, delete records               | $150–$300/mo for the whole team |
| Senior Agent  | Their own leads + any leads assigned to them                | Create/update records, add documents, move pipeline stages | —                               |
| Junior Agent  | Only their own assigned leads (not seniors')                | Read + update only                                         | —                               |
| Assistant     | All leads but cannot see AED deal values                    | Add notes, schedule viewings, update contact info          | —                               |

**This is why agencies pay more than solo agents.** Solo agent at $49/mo = 1 seat. Agency of 10 at $200/mo flat = $200 revenue for you. Agency RBAC requires Pro plan → you've upsold them.

### Multi-Tenancy: One Codebase, Infinite Clients

```
Your infrastructure (one Convex deployment, one Vercel deployment):

Org a1 — Malik Properties (Dubai)    → Dubai RE template → Arabic/English
Org b2 — Al Safa Real Estate (Dubai) → Dubai RE template → custom fields added by AI
Org c3 — Riyadh Listings (Saudi)     → Saudi RE template (Phase 5+)
Org d4 — Sarah Freelance Consulting  → Freelancer template (Phase 6+)

All four: completely isolated data, completely customized UI, same codebase.
```

Revenue from 4 clients: $49+$149+$149+$49 = **$396/mo from one deployment**. Scale to 40 clients = ~$4,000 MRR with zero new infrastructure cost.

---

## PART 9 — Realistic Revenue Plan

| Month | Milestone                    | Clients           | MRR            | Action                                                              |
| ----- | ---------------------------- | ----------------- | -------------- | ------------------------------------------------------------------- |
| 1     | Building Phase 1 + 2         | 0                 | $0             | Apply for WhatsApp API now                                          |
| 2     | Building Phase 3             | 0–1               | $0–$49         | Give to 1 Dubai RE agent free — get real feedback                   |
| 3     | Phase 3 ships — demo ready   | 2–4 solo agents   | $100–$200      | Record 90-second demo video. Post on LinkedIn/WhatsApp groups.      |
| 4     | First agency deal            | 1 agency + 3 solo | $300–$550      | One agency deal changes everything. Target: a 5–10 agent brokerage. |
| 5     | Word of mouth                | 8–12 clients      | $600–$1,200    | Dubai RE community is tight. If it works, it spreads.               |
| 6     | Second agency + optimization | 15–20 clients     | $1,500–$2,500  | Add Bayut/PF import. More agencies convert.                         |
| 8     | Saudi KSA template           | 25–35 clients     | $3,000–$5,000  | Double the market by adding Saudi. Same codebase.                   |
| 12    | Stable growth                | 50–80 clients     | $8,000–$15,000 | Add Freelancer vertical. Product sells itself by now.               |

**$10k total revenue**: achievable by Month 4–5 with 1 agency + several solo agents.
**$10k MRR**: Month 10–12 with solid execution and Saudi expansion.

---

## PART 10 — Key Decisions to Lock Before Writing Code

These cannot change easily after Phase 2. Lock now:

| Decision                                 | Answer                                                                       | Why it Matters                                                                 |
| ---------------------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Add `aiContext` to leads/contacts/deals? | **Yes, in Phase 2 schema**                                                   | Required for voice overflow. One-line addition. Do it now.                     |
| Add `quickCode` to leads/contacts?       | **Yes, in Phase 2 schema**                                                   | Required for WhatsApp contact resolution. Auto-generated.                      |
| Add `entityDocuments` table?             | **Yes, in Phase 2**                                                          | Document Vault is a core Dubai RE feature per research.                        |
| First industry template?                 | **Dubai Real Estate**                                                        | B2B is crowded. Gap confirmed. Onboarding default to RE.                       |
| WhatsApp provider?                       | **360dialog for Gulf**                                                       | Faster approval for UAE numbers. Native MENA BSP. Twilio as backup.            |
| Voice transcription?                     | **OpenAI Whisper API**                                                       | Best Arabic + code-switching accuracy.                                         |
| OCR provider?                            | **Claude Vision (Phase 3)**                                                  | Already using Claude. Add Vision for document reading. Fallback: AWS Textract. |
| entity5 + entity6 slots for RE?          | **entity5 = Property, entity6 = Listing**                                    | RE agents need property records. Already in schema. Just activate and label.   |
| WhatsApp phase?                          | **Phase 3, ships with AI**                                                   | It's the input layer. Shipping AI without it is half a product.                |
| Pricing at launch?                       | **$49/mo solo, $149/mo agency (up to 5 seats), $299/mo agency (6–15 seats)** | Research says $30–50. We can do $49 for solo, more for agencies.               |

---

## PART 11 — Files to Update (Tell the AI Agent)

After reading this document, update the following files:

### `PLAN.md`

- Change first industry from B2B to Dubai Real Estate
- Move WhatsApp integration from Phase 5 to Phase 3
- Add Phase 3 items: AI OCR, Document Forwarding, Whisper Mode, 95-Day Alert
- Update pricing model: $49 solo / $149 agency / $299 large agency
- Add Saudi KSA as Phase 5 (after Dubai RE is stable)

### `schema.md`

Add to Phase 2 table definitions:

```typescript
// leads, contacts, deals — add:
aiContext: v.optional(v.any()),
quickCode: v.optional(v.string()),

// New table:
entityDocuments: defineTable({
  orgId: v.id("orgs"),
  entityType: v.string(),
  entityId: v.string(),
  fileName: v.string(),
  fileType: v.string(),         // "emirates_id"|"passport"|"title_deed"|"contract"|"other"
  storageId: v.id("_storage"),
  extractedData: v.optional(v.any()),
  uploadedBy: v.string(),       // "whatsapp_bot" | userId
  createdAt: v.number(),
})
.index("by_entity", ["orgId", "entityType", "entityId"])
```

### `todos.md`

Add as IMMEDIATE (do before Phase 1 build starts):

- [ ] Apply for WhatsApp Business API via 360dialog (approval takes 1–2 weeks)
- [ ] Add `aiContext: v.optional(v.any())` to Phase 2 schema plan
- [ ] Add `quickCode: v.optional(v.string())` to Phase 2 schema plan
- [ ] Add `entityDocuments` table to Phase 2 schema plan

### `checklist.md`

Phase 3 section — add WhatsApp bridge checklist items:

- [ ] 360dialog webhook: `app/api/channels/whatsapp/route.ts`
- [ ] Trigger.dev job: `whatsapp-voice-processor` (Whisper → Claude → Convex)
- [ ] Trigger.dev job: `whatsapp-document-processor` (OCR → Claude → Convex)
- [ ] `convex/ai/tools/whatsapp/resolveContact.ts` (4-layer resolution)
- [ ] WhatsApp reply confirmation (Twilio/360dialog reply API)
- [ ] Trigger.dev job: `ejari-renewal-check` (daily scheduled, 95-day alert)
- [ ] AI tool: `suggestClientReply()` (Whisper mode)
- [ ] AI tool: `extractDocumentData()` (OCR tool)

### `deep-plan.md`

Add two new modules:

**Module 35 — Dubai Real Estate Industry Template**
Config file: `features/industry-templates/config/dubai-real-estate.ts`
Contains: fieldDefinitions, pipeline stages, entity labels, AI persona, dashboard metrics, 95-day alert config

**Module 36 — WhatsApp Voice Bridge**
Contains: webhook handler, voice processor job, document processor job, OCR integration, contact resolution algorithm, Whisper mode, reply confirmation

### `context.md`

Add note: "Strategy updated 2026-04-27. Dubai RE is first industry. WhatsApp ships in Phase 3. aiContext + quickCode + entityDocuments added to Phase 2 schema. 360dialog application should be submitted before building Phase 3."

---

## Summary in 5 Lines

1. Your base architecture (EAV + pipelines + AI) is correct. Do not change it.
2. Add `aiContext`, `quickCode`, `entityDocuments` to Phase 2 schema now — single lines that unlock the whole hybrid.
3. Ship WhatsApp voice bridge + AI + OCR together in Phase 3 — this is your product, not a feature.
4. The bot knows which contact to update via name extraction → disambiguation WhatsApp reply → quick-codes. Build all 4 layers.
5. Dubai RE first. Saudi KSA second. Freelancer third. The base handles all three with zero code change between them.

---

_Sources: Live research 2026-04-27 + Gemini RE research doc provided by user + full codebase scan (schema.md, deep-plan.md, checklist.md, context.md)_

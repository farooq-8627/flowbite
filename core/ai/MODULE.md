# AI Assistant (Core)

> THE core differentiator — "Stop navigating your CRM. Just talk to it."
> Persistent chat panel, 11 core tools, agentic loop, role-aware, dynamic field awareness.
> AI is CORE because it's always visible, cross-cutting, and IS the brand identity.

## Ownership
- **Location**: `core/ai/`
- **Backend**: `convex/ai/`
- **Routes**: None (renders as persistent side panel, not a page)
- **Phase**: 3 | **Status**: NOT_STARTED

## Rules
- [ ] R-AI-01: API route `/api/ai/chat` derives userId + orgId from server session — NEVER from request body
- [ ] R-AI-02: Tool availability filtered by role BEFORE Claude API call (viewer never sees destructive tools)
- [ ] R-AI-03: System prompt built from DB only — no raw user input in system prompt (prevents prompt injection)
- [ ] R-AI-04: No PII in system prompt — record IDs only, resolved in tool handlers
- [ ] R-AI-05: Every AI tool call logged in `activityLogs` with `actorType: "ai"`
- [ ] R-AI-06: Destructive actions (delete, bulk update, stage change) MUST show confirmation UI before executing
- [ ] R-AI-07: AI tools centralized in `convex/ai/tools/` — never scattered per entity module
- [ ] R-AI-08: `send_chat_message` tool sends in activity-chat with `senderType: "ai_on_behalf"` + `onBehalfOf: userId`
- [ ] R-AI-09: Rate limit: max 20 requests/minute per user on `/api/ai/chat`
- [ ] R-AI-10: AI boundary: decline off-topic requests politely, only handle CRM/business work

## Checklist
### Backend
- [ ] `convex/ai/processChat.ts` — internalAction, "use node", ToolLoopAgent
- [ ] `convex/ai/systemPrompt.ts` — dynamic prompt builder (org, user, role, fields, today)
- [ ] `convex/ai/toolRegistry.ts` — role → tool mapping
- [ ] `convex/ai/conversations.ts` — CRUD for conversations
- [ ] 11 core tools in `convex/ai/tools/`:
  - [ ] `search.ts` — search_crm (cross-entity)
  - [ ] `update.ts` — update_entity (any field, fixed or dynamic)
  - [ ] `create.ts` — create_entity (lead, contact, deal)
  - [ ] `notes.ts` — add_note (any entity)
  - [ ] `reminders.ts` — set_reminder (follow-up)
  - [ ] `detail.ts` — get_entity_detail (full timeline)
  - [ ] `analytics.ts` — get_summary (pipeline, overdue, forecast)
  - [ ] `email.ts` — draft_email (from history)
  - [ ] `dateSearch.ts` — search_by_date (by dates)
  - [ ] `bulk.ts` — bulk_update (with confirmation)
  - [ ] `chat.ts` — send_chat_message (on user's behalf in activity-chat)

### Frontend
- [ ] `components/ChatSheet.tsx` — right-side resizable panel (~40% width)
- [ ] `components/ChatMessage.tsx` — message bubble (user + assistant)
- [ ] `components/ChatToolCall.tsx` — interactive tool result cards
- [ ] `components/ChatConfirmation.tsx` — destructive action preview + [Confirm]/[Cancel]
- [ ] `components/ChatSuggestions.tsx` — proactive prompt suggestions
- [ ] `stores/chatStore.ts` — Zustand: isOpen, pendingMessage, currentPageContext
- [ ] `hooks/useAIChat.ts` — wrapper around useChat() with auth + page context
- [ ] Wire into DashboardLayout (persistent across navigation)
- [ ] Keyboard shortcut Cmd+K to toggle chat panel

## Avoids
- ❌ Never accept `orgId` or `userId` as AI tool arguments — derive from context
- ❌ Never put user free-text into system prompt (prompt injection risk)
- ❌ Never create AI tools in entity modules — all in `convex/ai/tools/`
- ❌ Never auto-execute destructive actions without user confirmation
- ❌ Never expose tool results that violate role-based data access

## Tables Owned
| Table | Description | Key Indexes |
|---|---|---|
| `aiConversations` | Chat threads | `by_userId`, `by_orgId_and_userId` |
| `aiMessages` | Messages in threads | `by_conversationId` |

## 11 Core AI Tools
| # | Tool | Permission Gate | Destructive |
|---|---|---|---|
| 1 | `search_crm` | `[entity].read` | No |
| 2 | `update_entity` | `[entity].update` | Yes — confirm |
| 3 | `create_entity` | `[entity].create` | Yes — confirm |
| 4 | `add_note` | `notes.create` | No |
| 5 | `set_reminder` | `reminders.create` | No |
| 6 | `get_entity_detail` | `[entity].read` | No |
| 7 | `get_summary` | `reports.view` | No |
| 8 | `draft_email` | `email.draft` | No |
| 9 | `search_by_date` | `[entity].read` | No |
| 10 | `bulk_update` | admin/owner only | Yes — confirm |
| 11 | `send_chat_message` | `ai.chat` | No |

## Cross-Module Integration Checklist

> The AI module touches almost everything. Follow these rules:

### → Entities
- AI tools call entity `orgMutation`s via `ctx.runMutation(internal.ai.tools.X)` — never direct DB writes
- When creating entities, AI MUST set `displayName`/`title` (R52)
- Dedup check MUST run before `create_entity` creates a lead/contact

### → Timelines
- Unified Timeline: every AI tool call logged via `logActivity()` with `actorType: "ai"`
- Activity Chat: `send_chat_message` tool writes to activity-chat with `senderType: "ai_on_behalf"` + `onBehalfOf: userId`
- AI NEVER writes system events to Activity Chat — only human-like messages

### → Notifications
- AI does NOT send notifications directly — entity mutations it calls handle notifications
- Exception: `send_chat_message` tool sends an in-app notification to the recipient

### → Dynamic Fields
- `buildSystemPrompt()` includes all `fieldDefinitions` for the org → AI knows about custom fields
- Sensitive fields (`sensitive: true`) excluded from AI responses for non-admin roles
- AI can `update_entity` with dynamic field values — same validation as UI

### → Pipelines
- AI can move entities between stages via `update_entity` tool
- Stage transitions validated server-side — AI cannot bypass validation
- AI uses stage names from `pipelines` table — never hardcoded stage references

---

## Schema Tables (Full definitions in `schema.md`)

| Table | Purpose |
|---|---|
| `aiConversations` | Chat history per org + user — `orgId`, `userId`, `title`, `lastMessageAt` |
| `aiMessages` | Individual messages — `conversationId`, `role: "user"\|"assistant"`, `content`, `toolCalls` |

Note: AI tool calls are also logged in `activityLogs` with `actorType: "ai"` (owned by `core/timelines`).

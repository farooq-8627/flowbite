# convex/ai — MODULE.md

**Ownership:** `convex/ai/` | Phase 3 | Consumers: `core/ai/` frontend, `app/api/ai/chat/route.ts`, WhatsApp voice processor

## Purpose

AI runtime backend. `processChat` internalAction is the brain. Builds system prompt from 3 layers (platform + org + entity), filters tools by role, runs Claude agentic loop, logs every tool call, persists conversations.

## Files

| File | Role |
|------|------|
| `processChat.ts` | internalAction (`"use node"`) — the AI runtime |
| `systemPrompt.ts` | 3-layer dynamic prompt builder (platform → org → entity) |
| `toolRegistry.ts` | role → tool mapping, `TOOL_PERMISSIONS` map |
| `conversations.ts` | `aiConversations` + `aiMessages` CRUD |
| `rebuildEntityContext.ts` | Background context rebuild (internalAction) |
| `tools/` | 11 action-based tool files: search, create, update, notes, reminders, detail, analytics, drafts, bulk, workspace, code |

## Schema Additions

| Table | Fields |
|-------|--------|
| `aiConversations` | orgId, userId, title, lastMessageAt, contextSummary, createdAt |
| `aiMessages` | conversationId, role (`"user"` \| `"assistant"`), content, toolCalls, createdAt |
| `platformContext` | key (`"main"`), content, version, modules, rules, updatedBy, updatedAt |

## Security

4-layer model:

1. **Auth from session** — identity verified before any action
2. **Tool filtering** — only role-permitted tools exposed to the model
3. **Org-scoped data** — every query/mutation scoped to caller's org
4. **Confirmation gates** — destructive actions require explicit user confirm

## Billing

- Billing check **before** Claude call — zero tokens on suspended accounts.

## Model Routing

| Complexity | Model |
|------------|-------|
| simple | Haiku |
| standard | Sonnet |
| complex | Sonnet / Opus |

## Rules

- Every tool call MUST be logged to `aiMessages.toolCalls`
- System prompt is rebuilt per-request (never cached stale)
- Conversations are org-scoped — no cross-org leakage
- Token usage tracked per-org for billing reconciliation

## Avoids

- Never stream partial tool results to the client
- Never expose raw tool errors to the user — wrap in friendly message
- Never call Claude without billing validation passing first

## Never-Do

- ❌ Never persist API keys or secrets in `aiMessages`
- ❌ Never allow tool execution without role permission check
- ❌ Never return data from another org regardless of admin status
- ❌ Never skip the confirmation gate for destructive tools (delete, bulk update)

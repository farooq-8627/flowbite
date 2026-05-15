# Messages Module

> Chat-style messages between users (and AI on-behalf) on entity threads (person, deal, company, lead, contact). Append-mostly, status-tracked. Distinct from `notes` (annotations) — see FRONTEND-DECISIONS Rule 2.

## Owned tables / data sources

| Source | Purpose |
|---|---|
| `messages` (Convex table) | One row per message. Indexes: `by_entity`, `by_org_and_personCode`, `by_org_and_created`, `by_org_and_thread`, `by_replyTo`. |

## Owned routes

| Route | View |
|---|---|
| `/{orgSlug}/messages` | `views/MessagesInboxView.tsx` (org-wide 3-pane: filters \| sidebar \| thread) |

## Layers

| Layer | Component | Input | Where it's used |
|---|---|---|---|
| `views/` | `MessagesInboxView` | (uses `useCurrentOrg`) | `/{orgSlug}/messages` |
| `panels/` | `MessagesPanel` *(pending UI)* | `{ orgId, entityType, entityId, personCode? }` | Profile/Deal/Company Messages tab |
| `widgets/` | `MessagesPreviewWidget` *(pending UI)* | `{ orgId, limit? }` | Dashboard "Recent activity" |
| `components/` | `MessagesSidebar`, `MessagesThread`, `MessageBubble`, `MessageInput`, `ChatAvatar`, `MessageStatusIcon`, `MessageActions` *(all pending UI)* | leaf primitives | Composed inside view + panel |
| `hooks/` | `useMessagesForEntity`, `useMessagesForPerson`, `useMessagesInbox`, `useRecentMessages`, `useSendMessage`, `useMarkMessageRead`, `useMarkAllMessagesRead`, `useDeleteMessage` | wraps Convex | shared by all layers |

## Reuse map

| Surface | Component |
|---|---|
| Org-wide page | `MessagesInboxView` (sidebar + thread) |
| Profile / Deal / Company tab | `MessagesPanel` (thread only — no sidebar; embedded panels have no horizontal space) |
| Dashboard | `MessagesPreviewWidget` |

## Permissions

| Action | Permission key |
|---|---|
| View thread | `messages.view` |
| Send message | `messages.send` |
| Delete own message | `messages.delete` |
| Delete any message | `messages.deleteAny` |

## Decisions

| # | Decision | Outcome |
|---|---|---|
| 1 | Messages get their own table, not piggyback on `notes`. | Six tables, six concepts, 1:1 AI tool mapping. Independent indexes/RBAC/schema. |
| 2 | Sidebar and Main thread are INDEPENDENT components. | Org-wide page composes both; profile/entity panel uses only the thread (no horizontal space for sidebar). |
| 3 | "Send" sets `status: "sent"` and immediately calls `logActivity` + `sendNotification` to the entity assignee (best-effort). | Recipient gets in-app alert; AI/timeline see the message instantly. |
| 4 | `markRead` is per-user (`readBy[]` array) — multi-party threads track who saw what. | Status flips to `"read"` once a non-author reads. |
| 5 | Donor template: shadboard `apps/chat/` (NOT shadcnstore). | Richer: text + images + files + voice + typed status. |

## Rules

- Never use `ml-*`/`mr-*`/`pl-*`/`pr-*`/`left-*`/`right-*` — RTL-safe logical Tailwind only.
- All `border-radius` via `rounded-[var(--radius)]`.
- `MessageBubble` already RTL-safe via `flex-row-reverse` + `text-end`.
- Author avatar uses **human's avatar + AI subscript badge** for AI on-behalf messages (per FRONTEND-DECISIONS Rule 20 / WhatsApp Phase-3 behavior).

## Avoids

- ❌ Don't store messages on the `notes` table (the `isActivityChat` flag is gone).
- ❌ Don't render entity thread + sidebar inside a panel (only org-wide view does that).
- ❌ Don't subscribe to `listInbox` from inside a thread component — it's expensive.

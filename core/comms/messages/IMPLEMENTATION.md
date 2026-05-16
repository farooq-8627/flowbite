# Messages — Implementation Guide (Production-grade)

> **Status**: Backend production-ready (2026-05-16). UI pending.
> **Owner**: `core/comms/messages/`
> **Backend modules**: `convex/crm/shared/messages/`, `convex/crm/shared/conversations/`
> **Donor template**: `shadboard/full-kit/src/app/[lang]/(dashboard-layout)/apps/chat/`

This document is the single source of truth for building the chat UI on top
of the production messaging backend. It explains the architecture, what to
take from shadboard, what to skip, and how the same components serve three
contexts: org-wide inbox, profile/deal/company embedded panel, and project
management threads.

---

## 0. Why this design (production-grade vs. naïve chat)

### Naïve approach we rejected
A single `messages` table with `readBy: Id<"users">[]` array per row. This
fails at scale:
- Every message read = patch a 1000-element array.
- "Unread count for user X" = scan every message in every thread.
- "Notify everyone in this thread" = either notify only the assignee (data
  loss) or fan-out without per-user preferences (spam).
- No way to invite/remove people from a thread cleanly.
- Cannot evolve into project chat / DMs without schema rewrite.

### Production architecture (what we built)
Three tables (all in `convex/schema/crmShared.ts`):

| Table | Purpose | Cardinality |
|---|---|---|
| `conversations` | One row per (orgId, entityType, entityId, threadId?). Stores the denormalised `lastMessageAt` / `lastMessagePreview` for fast inbox queries. | 1 per chat |
| `conversationMembers` | Per-user state on a conversation: `role` (owner / participant / watcher), `notificationLevel` (all / mentions / none), `lastReadAt`, `joinedAt`, `leftAt`. | 1 per (chat, user) |
| `messages` | The actual chat messages. Linked to `conversationId`. Soft-delete + edit + reactions + idempotency. | N per chat |

This is the same shape Slack, Linear, and modern CRMs (HubSpot, Front) use.
It scales linearly with traffic, supports multi-participant cleanly, and the
same schema covers entity threads (lead/deal/company), workspace DMs (future),
and project-management threads (Phase 4).

---

## 1. Backend API (already built)

Public functions live under `api.crm.shared.messages.*` and
`api.crm.shared.conversations.*`. The production-grade hooks in
`core/comms/messages/hooks/index.ts` wrap them with `"skip"`-handling and
typed args.

### Mutations

```ts
// Send a message (auto-creates conversation, fans out notifications)
const send = useSendMessage();
await send({
  orgId,
  // Either pass conversationId or (entityType + entityId):
  entityType: "lead",          // "lead" | "contact" | "deal" | "company" | "person" | "project" | "task"
  entityId: "P-001",           // entity code (NOT Convex _id)
  content: "Hello @bob",
  mentions: [bobId],           // userIds to @-mention
  attachments: [fileId],       // optional Id<"files">[]
  replyToId: parentMsgId,      // optional Id<"messages">
  idempotencyKey: nanoid(),    // RECOMMENDED — retry safety on flaky networks
});

// Edit own message (within 15-min window)
const editMessage = useEditMessage();
await editMessage({ orgId, messageId, content: "fixed typo" });

// Soft-delete (own + permission OR moderator)
const deleteMessage = useDeleteMessage();
await deleteMessage({ orgId, messageId });

// Reactions (toggle 👍 / 👎 / etc.)
const toggleReaction = useToggleReaction();
await toggleReaction({ orgId, messageId, emoji: "👍" });

// Per-user thread state
const markRead = useMarkConversationRead();
await markRead({ orgId, conversationId });

const setLevel = useUpdateNotificationLevel();
await setLevel({ orgId, conversationId, level: "mentions" });

// Participant management (owner of conversation OR `messages.subscribe`)
const addParticipants = useAddParticipants();
await addParticipants({ orgId, conversationId, userIds: [aliceId, bobId], role: "participant" });

const removeParticipant = useRemoveParticipant();
await removeParticipant({ orgId, conversationId, userId: aliceId });

const leave = useLeaveConversation();
await leave({ orgId, conversationId });

// Archive (org-level — affects everyone's inbox visibility)
const archive = useArchiveConversation();
const unarchive = useUnarchiveConversation();
```

### Queries

```ts
// Sidebar — list every conversation the caller is a member of
const inbox = useInbox({ orgId, filter: "all" });
//  → [{ membership, conversation, unread }, ...]
//  filter: "all" | "unread" | "archived"

// Sidebar badge — total unread across my conversations (capped at 99)
const totalUnread = useTotalUnread({ orgId });

// Main pane — fetch a conversation + its messages by entity
const thread = useConversationForEntity({
  orgId,
  entityType: "lead",
  entityId: "P-001",
});
// → { conversation: Doc<"conversations"> | null, messages: Doc<"messages">[] }

// Main pane (when you already have the conversationId)
const messages = useMessagesForConversation({ orgId, conversationId });

// Avatar row — active members of a conversation
const participants = useConversationParticipants({ orgId, conversationId });

// Profile-scoped feed — every message tied to a personCode across entity types
const personMessages = useMessagesForPerson({ orgId, personCode: "P-001" });

// Dashboard widget
const recent = useRecentMessages({ orgId, limit: 5 });
```

### Notifications fan-out (built-in)

When you call `send(...)`, the backend automatically:

1. Creates the conversation if missing.
2. Auto-adds the sender as `owner`.
3. Auto-adds the entity assignee (lead/contact/deal/company) as `participant`.
4. Auto-adds every `@mentioned` user as `participant` (`joinReason: "mention"`).
5. Iterates **every active member except the sender**:
   - If member.notificationLevel === `"none"` → skip.
   - If member.notificationLevel === `"mentions"` AND not mentioned → skip.
   - Otherwise → check the user's `users.notificationPreferences.message_received`
     (or `message_mention` if mentioned) and `sendNotification` accordingly.

This is the multi-participant fan-out the user asked for. It honours per-user
preferences at every layer.

---

## 2. Sidebar / Main split (locked architecture)

Confirmed 2026-05-16: the sidebar (conversation list) and main section
(active thread) are **independent components**. The org-wide inbox composes
both. Embedded panels (profile / deal / company tab) embed only the main
component — they have no horizontal space for a sidebar.

### Component layout

```
core/comms/messages/
├── hooks/
│   └── index.ts                        ✅ DONE — every backend hook wrapped
├── views/
│   ├── MessagesInboxView.tsx           ⚠️  PLACEHOLDER — composes Sidebar + Thread
│   └── MessagesPersonFeedView.tsx      ⬜ PENDING — profile-tab feed (no sidebar)
├── components/
│   ├── MessagesSidebar.tsx             ⬜ PENDING — conversation list + filters
│   ├── MessagesThread.tsx              ⬜ PENDING — main pane: header + list + composer
│   ├── MessagesEmptyState.tsx          ⬜ PENDING
│   ├── MessageBubble.tsx               ⬜ PENDING — single message + actions
│   ├── MessageList.tsx                 ⬜ PENDING — scroller with load-older + auto-scroll
│   ├── MessageInput.tsx                ⬜ PENDING — composer + mention picker + attach
│   ├── MentionPicker.tsx               ⬜ PENDING — @autocomplete popover
│   ├── ParticipantsRow.tsx             ⬜ PENDING — avatars + add-people button
│   ├── ParticipantsDialog.tsx          ⬜ PENDING — manage members
│   ├── ThreadHeader.tsx                ⬜ PENDING — title + actions
│   ├── ReactionPill.tsx                ⬜ PENDING
│   ├── AttachmentChip.tsx              ⬜ PENDING
│   └── MessagesPreviewWidget.tsx       ⬜ PENDING — dashboard widget
├── MODULE.md                           ✅ DONE
├── STATE.md                            ✅ DONE
└── IMPLEMENTATION.md                   ✅ THIS FILE
```

### Composition rules

| Surface | Composes | Why |
|---|---|---|
| `/{orgSlug}/messages` | `<MessagesInboxView>` = `<MessagesSidebar>` + `<MessagesThread>` | Org-wide inbox — full sidebar + thread layout |
| Profile tab "Messages" | `<MessagesPersonFeedView>` = `<MessagesThread>` only | No horizontal space; person scope auto-resolved |
| Deal/Company tab "Messages" | `<MessagesThread entityType="deal" entityId={dealCode}>` | Single thread, no sidebar |
| Project chat (Phase 4) | `<MessagesInboxView entityFilter="project">` | Project inbox = full sidebar + thread |
| Dashboard widget | `<MessagesPreviewWidget>` | Top 5 recent across the org |

The `MessagesThread` component takes either a `conversationId` OR
(`entityType + entityId + threadId?`) and self-resolves via
`useConversationForEntity` — meaning it works in **every** context with the
same component.

---

## 3. What to take from shadboard's chat template

Shadboard's chat lives at:
`/Users/shaikumarfarooq/Clones/Orbitly/shadboard/full-kit/src/app/[lang]/(dashboard-layout)/apps/chat/`

It ships with a 3-pane layout, message bubbles, reactions, voice notes, image
attachments, typing indicators, and read receipts.

### ✅ TAKE (visual primitives — adapt to our hooks)

| Shadboard file | What to take | Adapt to |
|---|---|---|
| `_components/chat-message-bubble.tsx` | Bubble layout, hover actions, reaction popover | `MessageBubble` — replace prop types with our `Doc<"messages">` |
| `_components/chat-message-list.tsx` | Scroller, load-older button, auto-scroll-to-bottom | `MessageList` — drop the reducer; use `useMessagesForConversation` directly |
| `_components/chat-message-input.tsx` | Composer layout, attach button, send button states | `MessageInput` — wire to `useSendMessage` + `idempotencyKey` |
| `_components/chat-sidebar-conversation-item.tsx` | Avatar + last-message preview + unread badge row | `ConversationItem` (used inside `MessagesSidebar`) |
| `_components/chat-sidebar.tsx` (layout only) | Filter tabs, search input, scroll container shell | `MessagesSidebar` — keep the chrome, replace data with `useInbox` |
| `_components/chat-header.tsx` | Title bar, participants avatars, action menu | `ThreadHeader` |
| Reaction popover (CSS + interactions) | Hover-to-open, emoji grid | Wire to `useToggleReaction` |
| Voice-note recorder UI | Mic button → recorder panel → upload + attach | `useSendMessage({ attachments: [voiceNoteFileId] })` |
| Image preview lightbox | Click image → fullscreen modal | `AttachmentChip` (image variant) |
| Typing-indicator dots animation | CSS only | Reuse for the future typing-indicator (Convex live query — see §5) |

### ❌ SKIP (replaced by our backend)

| Shadboard piece | Why skip | Use instead |
|---|---|---|
| `_lib/chat-data.ts` (mock conversations array) | Static fixture data | Live `useInbox` |
| `_hooks/use-chat.ts` (local reducer) | In-memory state, no persistence | Convex queries are reactive — UI re-renders on changes automatically |
| Any `useState` storing the messages array | Ditto | Same |
| `_lib/chat-context.tsx` (React context for chat state) | Replaced by Convex live queries | None — drop entirely |
| Read-receipt computation in client | Wrong semantics; we track per-user `lastReadAt` server-side | `useMarkConversationRead` + `unread` from `useInbox` |
| Local "currentUser" mock | Replaced by `useCurrentUser` / `useCurrentOrg` | — |
| Date grouping logic that lives in the component | OK to keep but extract into a helper | `lib/date.ts` (we already have one) |
| Their notification logic | Replaced by our server-side fan-out | None — backend handles it |
| Bundled emoji picker (heavy) | Heavy + duplicates `cmdk` | `radix-ui/popover` + a hand-curated 12-emoji grid (matches productivity tools) |
| Voice waveform visualisation | Phase 3 (AI voice) | Phase 3 |
| WebSocket reconnect logic | Convex handles this | — |

### 🟡 ADAPT (take, but rework)

| Shadboard piece | Adaptation |
|---|---|
| Conversation header avatar stack | Wire to `useConversationParticipants` — display first 3 + "+N more" pill |
| Add-participant flow | Replace their inline "add user" with our `<ParticipantsDialog>` calling `useAddParticipants` |
| Notification toggles in header | Add a "🔔 All / @ Mentions / 🔕 None" segmented control wired to `useUpdateNotificationLevel` |
| Edit message inline | Wire to `useEditMessage` with the 15-min window check (server enforces, UI hides edit after) |
| Delete confirmation dialog | Wire to `useDeleteMessage` (soft-delete) |

---

## 4. Three-context wiring (the "build once, use everywhere" rule)

### A. Org-wide page `/{orgSlug}/messages`

```tsx
// app/[locale]/(private)/[orgSlug]/messages/page.tsx — already exists, thin
export default function Page() {
  return <MessagesInboxView />;
}

// core/comms/messages/views/MessagesInboxView.tsx
export function MessagesInboxView() {
  const { orgId } = useCurrentOrg();
  const inbox = useInbox({ orgId, filter: "all" });
  const [selected, setSelected] = useState<{ conversationId: Id<"conversations"> } | null>(null);

  return (
    <ResizablePanelGroup direction="horizontal" className="h-full">
      <ResizablePanel defaultSize={28} minSize={20} maxSize={40}>
        <MessagesSidebar
          inbox={inbox ?? []}
          selectedId={selected?.conversationId}
          onSelect={(c) => setSelected({ conversationId: c._id })}
        />
      </ResizablePanel>
      <ResizableHandle />
      <ResizablePanel>
        {selected ? (
          <MessagesThread orgId={orgId} conversationId={selected.conversationId} />
        ) : (
          <MessagesEmptyState />
        )}
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}
```

### B. Profile detail page (Messages tab)

```tsx
// core/platform/profile/views/tabs/MessagesTab.tsx
export function MessagesTab({ personCode }: { personCode: string }) {
  const { orgId } = useCurrentOrg();
  // No sidebar — single conversation per person.
  return (
    <MessagesThread
      orgId={orgId}
      entityType="person"
      entityId={personCode}
      emptyState="No messages on this person yet — start a conversation."
    />
  );
}
```

### C. Project / Task chat (Phase 4)

```tsx
// features/project-management/views/ProjectChatView.tsx
export function ProjectChatView({ projectId }: { projectId: string }) {
  const { orgId } = useCurrentOrg();
  // Same sidebar/main pattern, just filtered to project conversations.
  return (
    <MessagesInboxView
      defaultFilter={{ entityType: "project" }}
      defaultSelected={{ entityType: "project", entityId: projectId }}
    />
  );
}
```

The `MessagesThread` component **never knows** which surface it's on — it
only takes `(orgId, conversationId)` or `(orgId, entityType, entityId)`. This
is the canonical "build once, use everywhere" pattern.

---

## 5. Real-time mechanics (Convex live queries)

### What you get for free

Every `useQuery` hook is **reactive** — when the underlying table changes,
the hook re-renders with new data. No WebSocket plumbing, no polling, no
Pusher/Ably. This means:

| Scenario | What happens |
|---|---|
| Alice sends a message | Bob's `useMessagesForConversation` re-renders; new message appears |
| Bob marks read | Bob's `useInbox` re-renders; unread badge clears |
| Carol added as participant | Carol's `useInbox` re-renders; conversation appears in her sidebar |
| Alice edits her message | Everyone's `useMessagesForConversation` re-renders; edit indicator shows |
| Alice deletes her message | Everyone's hook re-renders; soft-deleted message hidden by query |

### Pagination

Current API is `take`-based with caps (100 messages per fetch by default).
For Phase 4 (long threads), switch to cursor-based pagination via
`paginationOpts` — flagged in `PRODUCTION-READINESS-AUDIT.md`.

### Typing indicators (deferred)

Convex doesn't ship presence out-of-the-box. Three options for typing
indicators (none built today — flagged in the audit):

1. **Quick win**: a `typingNow` ephemeral table with TTL via cron.
2. **Better**: Convex's "presence" component (when stable).
3. **Best**: Liveblocks integration for presence + cursors (Phase 4).

---

## 6. UX cards (build order)

Suggested build order for the UI sprint:

| # | Component | Hours | Blocks |
|---|---|---|---|
| 1 | `MessageBubble` (no actions) | 1 | everything |
| 2 | `MessageList` (scroller + auto-scroll-to-bottom) | 2 | thread |
| 3 | `MessageInput` (no mentions, no attachments yet) | 1 | thread |
| 4 | `MessagesThread` (composes 1+2+3) | 1 | embedded panels |
| 5 | `ConversationItem` + `MessagesSidebar` | 2 | inbox |
| 6 | `MessagesInboxView` (compose 5 + 4) | 1 | org-wide page |
| 7 | `ThreadHeader` + `ParticipantsRow` | 2 | thread polish |
| 8 | `MentionPicker` + mentions wiring | 3 | mentions |
| 9 | `AttachmentChip` + `MessageInput` attach button | 2 | files |
| 10 | `ReactionPill` + emoji popover | 2 | reactions |
| 11 | `ParticipantsDialog` (add / remove / mute) | 3 | management |
| 12 | `MessagesPreviewWidget` (dashboard) | 1 | widget |
| 13 | Profile tab `MessagesPersonFeedView` | 2 | profile |
| 14 | Empty states + a11y polish | 3 | shipping |

Total: ~26 hours. Items 1–6 are the **MVP-quality (but production-correct) chat** —
about 8 hours. Everything after is polish.

---

## 7. Production checklist (before shipping the UI)

| Item | Status |
|---|---|
| All hooks wired to typed Convex API | ✅ |
| RBAC enforced server-side (every mutation gates on `messages.send` / `subscribe` / `editOwn` / `deleteOwn` / `deleteAny`) | ✅ |
| Multi-participant fan-out with per-user notification level | ✅ |
| Mentions auto-add and override notification mute | ✅ |
| Idempotency on `send` (`idempotencyKey` arg) | ✅ |
| Edit window enforced (15 min) | ✅ |
| Soft-delete (queries hide `deletedAt`) | ✅ |
| Reactions inline | ✅ |
| Per-tenant rate limit override | ✅ (orgs.settings.rateLimits) |
| Read state per-user (`conversationMembers.lastReadAt`) | ✅ |
| Activity log on every message + conversation event | ✅ |
| Cursor-based pagination | ⬜ Phase 3 |
| Typing indicators | ⬜ Phase 4 |
| Voice notes | ⬜ Phase 3 |
| End-to-end Playwright test | ⬜ when UI lands |

---

## 8. Things the chat does NOT do (by design)

- **No DMs (1:1 user threads) yet**. Schema supports it (`entityType: "person"`
  with a synthetic personCode, or future `entityType: "dm"`). UI deferred.
- **No threads-within-threads**. We have `threadId` for sub-threads but
  default to the main thread. Threading UI is Phase 4 polish.
- **No external participants**. Client portal users can't join CRM
  conversations until Phase 9 (client portal).
- **No third-party bridges** (Slack/Teams sync). Phase 6.

---

## 9. References

- Backend modules: `convex/crm/shared/messages/`, `convex/crm/shared/conversations/`
- Schema: `convex/schema/crmShared.ts`
- Permissions: `convex/_shared/permissions/catalog.ts` (search "messages.")
- Notification keys: `convex/_shared/notificationKeys.ts` (`message_received`, `message_mention`, `conversation_invite`)
- Architecture context: `CORE-FEATURES-ARCHITECTURE.md` §0 (why six tables)
- Frontend rules: `FRONTEND-DECISIONS.md` Rules 2, 13, 14
- Donor template: `/Users/shaikumarfarooq/Clones/Orbitly/shadboard/full-kit/src/app/[lang]/(dashboard-layout)/apps/chat/`

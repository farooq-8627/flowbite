# Messages — State

> Updated: 2026-05-17 (UX overhaul batch 5 — chat polish + cursor pagination)
> Status: 100% Complete for Phase 2 — production-grade backend + full Tier-A/B/C UI shipped + UX overhaul batches 1, 2, 3, 4, and 5. Voice notes / lightbox / mobile sheet / consecutive grouping / forward / RTL Sheet / SWR conversation switch / audio MIME backfill / WhatsApp-style inline timestamp / touch-friendly action row / **bottom-anchored scroll resilient to media loads** / **cursor-based pagination** / **strict sender-only avatar grouping (no time window)** all delivered.

## ✅ Completed (summary)

The chat system is **end-to-end usable on a fresh org**. Backend is production-grade
multi-participant chat (3 tables, fan-out, mentions, idempotent send, edit window,
soft-delete, reactions, per-user read receipts). UI ships:

| Layer | What's done |
|---|---|
| **Backend tables** | `conversations`, `conversationMembers`, `messages` — see schema details in `IMPLEMENTATION.md` §1 |
| **Backend mutations** | `send` (auto-create conversation, fan-out, idempotency, mentions, attachments, replyToId, channel, on-behalf), `update` (15-min edit window), `remove` (soft-delete, own + moderation), `toggleReaction`, `markRead`, `archive` / `unarchive`, `addParticipants`, `removeParticipant`, `leave`, `updateNotificationLevel`, `ensureForEntity` |
| **Backend queries** | `listForUser` (inbox), `getById`, `getForEntity`, `listForConversation`, `listForEntity`, `listForPerson`, `listInbox`, `listRecent`, `listParticipants`, `getUnreadCount`, `getMyTotalUnread` |
| **Schema (Phase-3 ready)** | `messages.channel` (`internal` / `whatsapp` / `email` / `sms`), `messages.authorPersonCode`, `messages.authorType` extended with `"contact"` literal — all additive (no migration) |
| **Permissions** | `messages.view`, `messages.viewAll`, `messages.send`, `messages.editOwn`, `messages.deleteOwn`, `messages.deleteAny`, `messages.subscribe`, `conversations.archive` — seeded into Owner / Admin / Member / Viewer |
| **React hooks** | `useInbox`, `useTotalUnread`, `useConversationForEntity`, `useMessagesForConversation`, `useConversationParticipants`, `useRecentMessages`, `useMessagesForPerson`, `useSendMessage`, `useEnsureConversation`, `useEditMessage`, `useDeleteMessage`, `useToggleReaction`, `useMarkConversationRead`, `useAddParticipants`, `useRemoveParticipant`, `useLeaveConversation`, `useUpdateNotificationLevel`, `useArchiveConversation`, `useUnarchiveConversation` |
| **Org-wide page** | `/{locale}/(private)/{orgSlug}/messages` → `<MessagesInboxView>` (sidebar + thread + empty state) |
| **Sidebar nav** | Workspace group → "Messages" with badge support (existing) |

### UI components (all shipped)

```
core/comms/messages/
├── components/
│   ├── ChatAvatar.tsx                 ✅ avatar + AI subscript
│   ├── MessageBubble.tsx              ✅ + edit/reply/delete dropdown, reactions popover, reaction pills, attachment chips, channel badge, reply quote
│   ├── MessageList.tsx                ✅ + auto-scroll-pinned, date dividers
│   ├── MessageInput.tsx               ✅ + reply chip, @ mention picker, file attachments
│   ├── ThreadHeader.tsx               ✅ + notification level segmented control, People button, clickable avatar stack
│   ├── MessagesThread.tsx             ✅ composes everything; reply state lifted here
│   ├── MessagesSidebar.tsx            ✅ + "+ New" button + empty-state CTA
│   ├── MessagesEmptyState.tsx         ✅
│   ├── NewConversationDialog.tsx      ✅ multi-entity picker (leads/contacts/deals/companies)
│   ├── ParticipantsDialog.tsx         ✅ add/remove/leave + member search
│   ├── MessagesPanel.tsx              ✅ embedded panel for profile/deal/company tabs
│   └── MessagesPreviewWidget.tsx      ✅ dashboard top-5 widget
├── hooks/index.ts                     ✅
└── views/MessagesInboxView.tsx        ✅
```

### Profile / dashboard wiring

- `core/platform/profile/views/ProfileContent.tsx::MessagesGroup` → uses `<MessagesPanel entityType="person" />`.
- `core/shell/shell/views/DashboardHomeView.tsx` → mounts `<MessagesPreviewWidget>` between metric cards and recent activity.

### Tier A / B / C completed (mapped to IMPLEMENTATION.md §6 build-order steps)

| Step | Component | Status |
|---|---|---|
| A1 | `NewConversationDialog` | ✅ |
| A2 | `ParticipantsDialog` | ✅ |
| A3 | `MessagesPanel` | ✅ |
| B1 | Edit/Reply/Delete dropdown | ✅ |
| B2 | Notification level segmented control | ✅ |
| B3 | `@` mentions picker | ✅ |
| B4 | Date dividers | ✅ |
| C1 | Reactions (emoji popover + pills) | ✅ |
| C2 | File / image attachments | ✅ |
| C3 | `MessagesPreviewWidget` | ✅ |

---

## ⬜ Pending (detail kept — not yet built)

| # | Task | Priority | Why deferred | Detail |
|---|---|---|---|---|
| 1 | **Typing indicators** | Phase 4 | Convex doesn't ship presence; needs either an ephemeral `typingNow` table with TTL cron, or Convex's presence component (when stable), or Liveblocks. | UI affordance: dots animation under `MessageList`. Backend: a tiny mutation `setTyping({ conversationId, ttl: 5s })` upserts a row in `presence` keyed by `(userId, conversationId)`. Query: `useQuery(api.presence.byConversation, { conversationId })`. Reactive — Convex live query handles the rest. |
| 2 | **AI on-behalf wiring (`authorType: "ai"` from tool registry)** | Phase 3 | Backend `send` already accepts `authorType: "ai"` + `onBehalfOf`. The AI tool registry just needs to call it. | Add a `messages.send` AI tool in `convex/ai/tools/...` with args `{ entityType, entityId, content, onBehalfOfUserId }`. Tool sets `authorType: "ai", onBehalfOf: <user>`. UI side: `<ChatAvatar isAI />` already renders the bot subscript; nothing else to do. |
| 3 | **WhatsApp integration (Phase 3)** | Phase 3 | Schema already supports it (channel/authorPersonCode/contact authorType). Need: webhook handler, outbound worker, channel toggle in composer. | (a) `convex/integrations/whatsapp/webhook.ts` — verifies signature, resolves contact by phone (via `crm.contacts.queries.getByPhone`), upserts message with `authorType: "contact"`, `channel: "whatsapp"`, `authorPersonCode: contact.personCode`, `idempotencyKey: "whatsapp:" + msg.id`. (b) `trigger/whatsapp-out.ts` — watches for new messages with `channel: "whatsapp"` and not yet sent, calls WhatsApp Cloud API. (c) UI: a small "Send via WhatsApp" toggle in `MessageInput` (only when conversation entity has a phone). The toggle adds `channel: "whatsapp"` to the `send` call — no other UI changes. |
| 4 | **Threads-within-threads** (sub-thread UI) | Phase 4 | Backend `threadId` field already supported on conversations + messages. UI defers to a single thread. | When a user replies to a specific message and the parent has more than N replies, surface "Open thread" → opens a side panel showing only messages with that `threadId`. |
| 5 | **External participants (client portal)** | Phase 9 | Schema doesn't yet model an `externalUser` row. Needs full client-portal feature first. | Adds `conversationMembers.userKind: "internal" | "external"` and a new `externalUsers` table or shared portal-user table. |
| 6 | **Slack/Teams bridge** | Phase 6 | Same channel mechanism as WhatsApp — same shape, different transport. | Phase 6 worker mirrors messages with `channel: "slack"` / `"teams"`. |
| 7 | **Playwright e2e** | Low | Wait for the polish sprint to land first to avoid spec churn. | Critical paths: (a) start new conversation → send message → it appears, (b) add participant → they see the inbox row, (c) edit → bubble shows "(edited)", (d) delete → bubble disappears, (e) react → pill appears with count, (f) attach file → chip + bubble link, (g) mention → notification fires, (h) cursor-pagination loads older messages on scroll-up. |

---

## Architecture Notes

### Component composition (locked)

```
MessagesInboxView                        (org-wide page)
├── MessagesSidebar
│   ├── inbox list (useInbox)
│   ├── filter tabs (All / Unread / Archived)
│   ├── client-side text search (existing convos only)
│   └── NewConversationDialog          ← multi-entity picker, idempotent ensure
└── MessagesThread                       (also used by MessagesPanel)
    ├── ThreadHeader
    │   ├── notification segmented control (useUpdateNotificationLevel)
    │   ├── avatar stack (useConversationParticipants)
    │   └── ParticipantsDialog
    ├── MessageList
    │   ├── date dividers
    │   └── MessageBubble[] (edit/reply/delete dropdown, reactions, attachments)
    └── MessageInput
        ├── reply chip
        ├── @ mention picker
        └── file attachments
```

`MessagesThread` accepts EITHER `conversationId` OR `(entityType, entityId)` — same
component renders the org-wide thread, the embedded `MessagesPanel`, and (Phase 4)
project/task chat. See IMPLEMENTATION.md §4.

### Phase-3 readiness (WhatsApp)

The `messages` schema is already shaped for the integration:

| Field | Used by Phase-3 |
|---|---|
| `channel: "internal" \| "whatsapp" \| "email" \| "sms"` | Outbound worker reads this to dispatch to WhatsApp Cloud API; webhooks set this on inbound rows. |
| `authorType: "contact"` | Inbound message from a lead/contact (no `users` row backing). |
| `authorPersonCode` | Sender's personCode when `authorType === "contact"`. |
| `idempotencyKey` | Webhook idempotency: `"whatsapp:" + msg.id` dedupes retries. |
| `attachments` | WhatsApp inbound media → uploaded via `files.record` → ids in `attachments[]`. |
| `replyToId` | Maps to WhatsApp `context.id` quoted-reply. |

The on-behalf path (`authorType: "user"` + `onBehalfOf: <user>`) is reused for both
"AI sent on behalf of user" and "system sent on behalf of user via integration".

### State decisions

- **Selection state** lives in `MessagesInboxView` as plain `useState` (Locked Decision #1 — never Zustand for ephemeral page state).
- **Reply target** lives in `MessagesThread` as plain `useState`; lifted out of `MessageBubble` so the chip in the composer survives scroll.
- **Drafts / pending attachments / mentions** are local component state in `MessageInput`. Optimistic clear-on-submit with restore on failure.
- **Read state** is per-user on `conversationMembers.lastReadAt`; mark-read fires reactively on `lastMessageId` change.
- **`canDeleteAny`** is derived from `useQuery(api.orgs.queries.getMyMembership)` and forwarded down via props — server-side `requireRole` is the actual gate.

### RTL + theming compliance

All directional Tailwind uses logical classes (`me-`, `ms-`, `start-`, `end-`,
`border-e`/`border-s`, `rounded-se-none`/`rounded-ss-none`, `text-end`,
`text-start`). All container `border-radius` uses `rounded-[var(--radius)]`.
Avatars and pills use `rounded-full` per the rule's exception. The reply
chip and bubble reply-quote use `border-s-2` to flip correctly under RTL.

### What this UI does NOT do (yet)

- No DM (1:1) creation flow — schema supports it via `entityType: "person"` with synthetic personCodes; UI deferred until a clear product need.
- No threads-within-threads UI (backend supports `threadId`; UI defaults to main thread).
- No external participants (client-portal users — Phase 9).
- No third-party bridges other than WhatsApp planning (Slack/Teams — Phase 6).
- No typing indicators / presence (Phase 4 — see Pending #1).

---

## 2026-05-16 — UX overhaul batch 1 (shipped)

| # | Change | Files |
|---|---|---|
| 1 | **Avatars are always `rounded-full`.** Themed `--radius` was producing inconsistent stacks. AGENTS.md exception applies. Avatars also support `onClick` → renders as a `<button>` so participant + sender avatars are now click-to-profile. | `components/ChatAvatar.tsx` |
| 2 | **Real entity names everywhere.** New hook `hooks/useEntityDisplay.ts` resolves `(entityType, entityId)` → `{ name, secondary, profileHref, kindLabel, avatarUrl }`. Sidebar rows and thread header no longer show "Lead · P-005" — they show the person/deal/company name plus a small `personCode` badge. | `hooks/useEntityDisplay.ts` (NEW) |
| 3 | **Sidebar redesign.** Standalone search input was searching message previews, not contacts — removed. The All/Unread/Archived tabs were folded into a `Menu` dropdown on the start side. The `+ New` button became a single search icon on the end side that opens the unified search-or-create dialog. | `components/MessagesSidebar.tsx` |
| 4 | **NewConversationDialog redesign.** Single unified row layout (rounded-full avatar + name + secondary + personCode badge), no separate Lead/Contact/Deal/Company groups. cmdk `keywords` now receives the full searchable surface so email + code search actually works. Sections: Recent (localStorage-backed) → Already chatting → Start a new conversation. | `components/NewConversationDialog.tsx` |
| 5 | **ThreadHeader entity name + clickable navigation.** Title resolves via `useEntityDisplay` and is a link to the entity's profile. Each participant avatar in the stack is clickable and routes to that user's profile page. The personCode badge sits next to the title. | `components/ThreadHeader.tsx` |
| 6 | **DM mode + WhatsApp-style reactions.** New prop `isDirect` on `MessageBubble` (passed through `MessageList`) — when the conversation has 2 participants, the sender label is hidden (left/right alignment is enough). When a message has exactly one reaction with count 1, the emoji renders as a small floating chip attached to the bubble's outer-end-bottom corner; otherwise the existing pill row is used. | `components/MessageBubble.tsx`, `components/MessageList.tsx`, `components/MessagesThread.tsx` |
| 7 | **Image/video preview thumbnails in pending attachments.** `MessageInput` now records an object URL per file via `URL.createObjectURL`, renders an 80×80 thumbnail (or `<video>`) with a corner-X close button instead of a generic chip. URLs are revoked on remove and on unmount. Sent message bubbles also render images and videos inline (replacing the old text-only chip). | `components/MessageInput.tsx`, `components/MessageBubble.tsx::MessageAttachments` |

### File-upload permission error (instructions for the user)

The error `[CONVEX M(files/mutations:record)] Forbidden: insufficient permissions`
occurs when the user's `orgRoles` doc was seeded BEFORE `files.upload` was added
to the catalog. The catalog SSOT (`convex/_shared/permissions/catalog.ts`)
includes `files.upload` for Owner/Admin/Member, but existing role docs need to
be reconciled.

The existing internal mutation handles this:

```bash
npx convex run orgs/mutations:backfillRolePermissions
```

It is idempotent — patches only role docs missing keys; running twice is safe.
After running, the upload succeeds without any code change.

### Pending — UX overhaul batch 2 (next turn)

| # | Task | Notes |
|---|---|---|
| 1 | **Voice-note recorder UI.** Mic button next to attach; recorder panel with start/stop, waveform stub, send. Backend already accepts `audio/*` via `files.record`; we just need a `voice` mime category in `org.settings.fileUpload.allowedMimeCategories`. |
| 2 | **Expanded attach menu.** Click on Paperclip opens a small popover with three icons (Image / Video / File) — each pre-filters the OS file picker via `accept="image/*"` / `video/*` / `*/*`. |
| 3 | **Mobile sidebar Sheet toggle.** Sidebar is `hidden sm:flex` today — no way to open it on small screens. Add a hamburger button in the empty/thread header that opens the sidebar in a `<Sheet>`. |
| 4 | **ParticipantsDialog empty-state copy.** When the user is the only org member, the "Add teammates" list is empty and looks broken. Show "Invite teammates from Settings → Members first" with a link. |
| 5 | **ParticipantsDialog avatar click → profile.** Match the ThreadHeader/Bubble pattern. |
| 6 | **Server-backed Recent conversations.** localStorage works for the same browser; eventual persistence via a small `recentSearches` per-user table. |

---

## 2026-05-16 — UX overhaul batch 2 (shipped)

### Bug fixes from batch 1

| # | Issue | Fix | File |
|---|---|---|---|
| 1 | **`send` mutation rejected file-only messages** (`Invalid arguments provided` at line 105). | The body validator only required `content: v.string()` but the handler threw on empty trimmed content even when attachments were present. Now: `if (trimmed.length === 0 && !hasAttachments) throw INVALID_ARGS`. | `convex/crm/shared/messages/mutations.ts` |
| 2 | **Sidebar/thread header still showed entity codes** because `useEntityDisplay` read `personDoc.displayName` directly, but `getByPersonCode` returns `{ entity, type }` (wrapped). Fixed to read `personDoc.entity.displayName / .email / .phone / .avatarUrl` and to derive `kindLabel` from `personDoc.type`. | `core/comms/messages/hooks/useEntityDisplay.ts` |

### New features / UX

| # | Change | Files |
|---|---|---|
| 1 | **DM mode now hides the avatar AND name.** When `isDirect` is true (2-participant conversation), MessageBubble renders a tiny invisible spacer instead of the avatar — left/right alignment is the only signal needed (matches WhatsApp / Telegram). AI / contact messages still render their avatar so the bot subscript is visible. | `MessageBubble.tsx` |
| 2 | **Single-emoji reaction is smaller and lower** so it never overlaps content. `size-5` instead of `size-6`, positioned at `-bottom-0.5` outside the bubble with the bubble adding `mb-3` when a reaction is present. Multi-emoji or count > 1 still uses the pill row. | `MessageBubble.tsx` |
| 3 | **Image / video lightbox modal.** New `MediaViewerModal` — desktop renders a max-w-5xl dark modal with zoom controls (-, +, reset, scroll-wheel zoom over images, drag-to-pan when zoomed). Mobile renders a full-screen dark backdrop with browser-native pinch zoom (`touch-action: pinch-zoom`). Arrow-key navigation when multiple media files. Replaces the previous behaviour of opening a new tab. | `components/MediaViewerModal.tsx` (NEW) |
| 4 | **MessageBubble attachments wired to the lightbox.** Image and video previews are now `<button>`s that open the modal with the right `startIndex`. Audio attachments render an inline `<audio controls>` (with "Voice note" caption when tagged `kind:voice`). Other files keep the chip + download link. | `MessageBubble.tsx` |
| 5 | **Voice-note recorder.** New `VoiceRecorder` component using the platform `MediaRecorder` API. Auto-starts on mount, captures `audio/webm` (or platform fallback), shows a live timer, supports cancel / stop / preview / re-record / send. Sends through the standard 3-step upload pipeline + `messages.send` with `tags: ["kind:voice"]`. Stops the mic stream tracks immediately on close so the OS-level recording indicator goes away. | `components/VoiceRecorder.tsx` (NEW) |
| 6 | **Expanded attach menu.** The Paperclip button now opens a popover with three options: Image (`accept="image/*"`), Video (`accept="video/*"`), File (`accept="*/*"`). Each pre-filters the OS picker. The composer's send button morphs into a Mic when there is no draft and no pending attachment, opening the voice recorder; once the user types or attaches, it switches back to Send. | `MessageInput.tsx` |
| 7 | **Mobile sidebar via existing Sheet primitive.** `MessagesInboxView` now renders the sidebar in two ways: inline `hidden md:flex` for desktop, and inside a `<Sheet side="left">` for mobile. ThreadHeader and the empty state both surface a hamburger button that opens the Sheet. Selecting a conversation auto-closes it. No new sidebar component invented — uses `components/ui/sheet.tsx`. | `views/MessagesInboxView.tsx`, `components/ThreadHeader.tsx`, `components/MessagesThread.tsx` |
| 8 | **Mobile notifications dropdown.** ThreadHeader's segmented `Bell / @ / Mute` control was previously `hidden sm:flex` only. Now there's a parallel dropdown (`sm:hidden`) — same three options exposed as a Bell-icon `DropdownMenu`. | `ThreadHeader.tsx` |
| 9 | **Mobile dialog margin fix.** `ParticipantsDialog` and `NewConversationDialog` were applying `max-w-lg` / `max-w-xl` unconditionally, which overrode the base `max-w-[calc(100%-2rem)]` and removed the 1rem horizontal margin on phones. Both now use `sm:max-w-lg` / `sm:max-w-xl` so mobile keeps the margin. | `ParticipantsDialog.tsx`, `NewConversationDialog.tsx` |
| 10 | **ParticipantsDialog avatar → profile.** Active-participant avatars now navigate to `/{orgSlug}/settings/members/{userId}` on click. | `ParticipantsDialog.tsx` |
| 11 | **ParticipantsDialog empty state copy.** When the workspace has only one member, the "no candidates" message previously read "Everyone in the org is already in this thread." which felt broken. Now it reads "You're the only person in this workspace. Invite teammates first, then add them here." with a `Link` to `/{orgSlug}/settings/members`. The "no search match" and "everyone is in this thread" cases are still distinguished. | `ParticipantsDialog.tsx` |

### Convex efficiency note (answer to user's question)

Switching conversations does fire new queries — that is correct and unavoidable. Convex query subscriptions are keyed by `(api, args)`, so:

- The same conversation viewed by sidebar + thread + bubble shares ONE subscription (Convex dedupes).
- A different conversation has different args → a new subscription. Hence the brief loading state in the header (participants) and the message list.
- Switching back to a previously-viewed conversation is instant because the subscription was kept warm by other surfaces (e.g., the sidebar inbox row).

The current pattern is correct for a Convex app. The only optimisation worth doing is a perceptual one: render the previous title/avatar while loading new data (stale-while-revalidate UX). That's UX polish, not a correctness fix, and is left for a future pass.


---

## 2026-05-17 — UX overhaul batch 3 (shipped)

User-driven polish pass focused on matching the "feels like WhatsApp / Telegram"
bar across desktop, iPad, and phone, plus a few infrastructural fixes (RTL
Sheet, SWR conversation switch, audio MIME backfill).

### What shipped

| # | Change | Files |
|---|---|---|
| 1 | **Consecutive-message grouping (WhatsApp / Telegram).** Same author within a 5-min, same-day window now renders as a "continuation" — avatar + name hidden, top margin tighter (`mt-0.5` vs `mt-3`). MessageList computes `showHeader` per row and passes it to `MessageBubble`. The bubble now renders an avatar-width invisible spacer for continuations so subsequent messages remain aligned. DM mode (`isDirect`) keeps its existing avatar-suppression behavior — these two reasons compose. | `MessageList.tsx`, `MessageBubble.tsx` |
| 2 | **Exact clock time replaces "1 hour ago" everywhere in chat.** New `lib/datetime.ts` exposes `formatChatTime`, `formatChatDateTime`, `formatChatSidebarTime`. Bubbles show e.g. "2:45 PM"; tooltip shows full datetime. Sidebar rows show today→clock, yesterday→"Yesterday", this-week→weekday, older→short date. AM/PM follows the user's locale via `Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" })`. **Future hook:** an org-wide `org.settings.timeFormat: "12h"|"24h"` override — helpers already accept an `opts.hour12` knob; consumer reads the org setting and forwards it. We intentionally did NOT add the schema field this turn to avoid an unrelated migration. The `formatDistanceToNow` helper from `date-fns` is still available for non-chat surfaces (Recent Activity widget, etc.). | `lib/datetime.ts` (NEW), `MessageBubble.tsx`, `MessagesSidebar.tsx` |
| 3 | **Member-link 404 fixed.** Avatar / participant-stack clicks used to route to `/{orgSlug}/settings/members/{userId}` — a route that never existed (the `[id]` segment isn't part of the settings page). Three components were affected: `ThreadHeader`, `MessageBubble`, `ParticipantsDialog`. All now point to the existing settings members section: `/{orgSlug}/settings?group=team#team.members`. **Self-avatars no longer link** — clicking your own avatar in a chat is a no-op. The `Settings → Members` link in `ParticipantsDialog`'s empty state was also corrected. **Future hook:** when a per-member detail page exists (Phase 4 / settings expansion), switch the link target — the click handler is already centralised. | `ThreadHeader.tsx`, `MessageBubble.tsx`, `ParticipantsDialog.tsx` |
| 4 | **Mobile-only icon for the "People" button.** The label is wrapped in `<span className="hidden sm:inline">People</span>` so phones get an icon-only button (matches the rest of the topnav), while iPad and desktop keep the label. | `ThreadHeader.tsx` |
| 5 | **iPad gets the notification dropdown.** The segmented `Bell / @ / Mute` control was `hidden sm:flex` (i.e. inline at iPad sizes), but the iPad chrome made it overflow next to the People button. Breakpoint moved from `sm` to `lg`: `lg:hidden` for the dropdown, `hidden lg:flex` for the segmented control. Tab labels reveal at `xl`. iPad now renders the same compact Bell-icon dropdown as mobile. | `ThreadHeader.tsx` |
| 6 | **MediaViewerModal — single close X + real fullscreen.** Two unrelated bugs: (a) `DialogContent` renders its own close button at top-right, AND we rendered a custom `<DialogClose>` next to the toolbar — two X's. Fixed by passing `showCloseButton={false}` to `DialogContent`; only the inline custom button remains. (b) The toolbar's `Maximize` icon called `setScale(1)` (a zoom reset). Now it calls the browser's Fullscreen API (`stageRef.current.requestFullscreen()`) on the stage element, with graceful fallback when the API is denied. A separate `RotateCcw` button handles "Reset zoom" with an unambiguous icon. The mobile inline X also moved from `right-4` to logical `end-4` for RTL safety. | `MediaViewerModal.tsx` |
| 7 | **Forward action.** New `<ForwardDialog>` component, opened from the bubble's actions menu via a `Forward` dropdown item. Lists the user's recent conversations through `useInbox`, supports multi-select, and fans out one `useSendMessage` per target (each with its own `idempotencyKey`). Attachments are forwarded by re-referencing the same `Id<"files">[]` (org-scoped, so any participant in the destination conversation can read them via `files.queries.listByIds`). The body is prefixed with "↪ Forwarded" so recipients see provenance. **Future hooks:** "Forward to a new entity" via the `<NewConversationDialog>` is one extra step the user can already take manually (open sidebar → search → forward); auto-chaining is scoped to a future polish pass. WhatsApp-channel forward (Phase 3) will respect the destination conversation's last-used channel automatically once the composer toggle exists. | `ForwardDialog.tsx` (NEW), `MessageBubble.tsx` |
| 8 | **Audio MIME backfill migration.** New orgs already allow audio uploads (the validator allows everything when `allowedMimeCategories` is empty). Older orgs that explicitly chose `["image", "pdf"]`-style whitelists rejected voice notes with a 403. New idempotent migration `convex/_migrations/allowAudioUploads.ts` (actions `run` and `runDryRun`) walks every non-deleted org and patches `"audio"` into the array when it's missing. Default-allow-all orgs are skipped. Run via `npx convex run _migrations/allowAudioUploads:run`. | `convex/_migrations/allowAudioUploads.ts` (NEW) |
| 9 | **Stale-while-revalidate on conversation switch.** Switching threads used to flash a "Loading…" panel while the new conversation's queries hydrated. We now use React's built-in `useDeferredValue` + `startTransition` on the selected-conversation state in `MessagesInboxView` — the previous thread keeps rendering until the new one's queries warm up, then React commits the swap. No third-party SWR library, no Convex pattern change. | `views/MessagesInboxView.tsx` |
| 10 | **RTL-safe `<Sheet>` primitive.** Added `start` / `end` to `SheetContent`'s `side` prop. They resolve to physical `left`/`right` based on `document.documentElement.dir` at mount + on transitions; the slide-in animation tokens still use the existing `slide-in-from-right` / `slide-in-from-left` classes via the resolved physical side. The legacy `top` / `right` / `bottom` / `left` continue to work unchanged. The mobile sidebar sheet in `MessagesInboxView` switched from `side="left"` to `side="start"`. | `components/ui/sheet.tsx`, `views/MessagesInboxView.tsx` |
| 11 | **Mobile sheet — search-vs-X overlap fixed.** The Sheet's auto-rendered close button (top-end) overlapped the sidebar's search-icon button. Disabled the auto-close (`showCloseButton={false}`) — the Sheet is still dismissable via overlay tap, Escape, and selecting a conversation auto-closes it. The search button is the only end-aligned action. | `views/MessagesInboxView.tsx` |

### Verification

- `pnpm typecheck` ✅ clean (zero errors)
- `pnpm lint-check` ✅ clean (biome strict mode)
- Format passes biome with `--write` on all 11 modified files
- New migration is idempotent and dry-run-able; default-allow-all orgs are
  not touched.

### Phase-3 / Connections / WhatsApp future hooks (not built — documented here)

| Hook | Where it lands | Why deferred |
|---|---|---|
| **Per-org `timeFormat` setting (`"12h" \| "24h"`)** | Add `org.settings.timeFormat?` to `convex/schema/identity.ts`. Read in `<MessagesPanel>` / `<MessagesSidebar>` and forward as `opts.hour12` to `formatChatTime`/`formatChatSidebarTime`. The helpers already accept the knob — only the schema field + admin UI in `core/platform/settings/components/groups/workspace/` are missing. | Avoid an unrelated Convex migration this turn; user is happy with locale-aware default. |
| **AI on-behalf forwards / sends from the tool registry** | The `messages.send` Convex mutation already accepts `authorType: "ai"` + `onBehalfOf`. The AI tool registry gets a new `messages.send` tool with args `{ entityType, entityId, content, onBehalfOfUserId }`. The `<ChatAvatar isAI />` prop already renders the bot subscript. | Phase 3 / AI sprint. |
| **WhatsApp inbound (Phase 3)** | `convex/integrations/whatsapp/webhook.ts` resolves the contact by phone, calls an internal `messages.send` with `channel: "whatsapp"`, `authorType: "contact"`, `authorPersonCode: contact.personCode`, `idempotencyKey: "whatsapp:" + msg.id`. UI is already prepared (`MessageBubble` shows a "WhatsApp" badge when `channel !== "internal"`). | Phase 3 — WhatsApp credentials + signature verification needed. |
| **WhatsApp outbound (Phase 3)** | `trigger/whatsapp-out.ts` watches for new `channel: "whatsapp"` messages with `authorType !== "contact"`, posts to WhatsApp Cloud API, optionally stores the WA message id back on the row (new optional field `externalMessageId` — additive, no migration). Composer will gain a small "Send via WhatsApp" toggle in `MessageInput` that adds `channel: "whatsapp"` to the `send` call. | Phase 3 — same. |
| **Forward to a new entity** | Open `<NewConversationDialog>` chained into the forward flow so users can forward to a person/deal/company with no existing thread. The `ensureForEntity` mutation already supports it. | Polish pass — current ForwardDialog covers the 90% case (existing threads). |
| **Cross-channel forward routing** | When forwarding to a conversation whose last-used channel was non-internal, the composer should default to that same channel (so a forward into a WhatsApp thread goes back out via WhatsApp). Trivial wiring once the channel toggle lands. | Phase 3 — depends on the WhatsApp toggle. |
| **External / portal participants forward (Phase 9)** | Today the org boundary blocks forwarding to client-portal users. When `conversationMembers.userKind` lands, ForwardDialog will need a permission check before listing those threads. | Phase 9 — client portal. |
| **Slack / Teams bridge forward** | Same channel mechanism as WhatsApp — the Phase 6 worker mirrors any `channel: "slack" \| "teams"` message. ForwardDialog needs no new code. | Phase 6. |
| **Per-org "default time format" admin section** | New section in `core/platform/settings/components/groups/workspace/` (e.g. `TimeFormatSection.tsx`) — a 12h / 24h radio bound to `org.settings.timeFormat`. | When the schema field lands. |
| **Global member detail page** | When `/[orgSlug]/team/[userId]` (or similar) exists, switch the avatar `senderHref` and ParticipantsDialog avatar onClick to point there. The handler is centralised in `MessageBubble.tsx` / `ThreadHeader.tsx` / `ParticipantsDialog.tsx`. | Phase 4 — settings/team expansion. |
| **WhatsApp typing indicators / read receipts** | Surfaces in `MessageBubble`'s status icon. Backend writes the receipt via internal mutation; UI reads it from `message.deliveryStatus`. Schema additive (optional field). | Phase 3 — when WhatsApp Cloud API receipts are wired. |


---

## 2026-05-17 — UX overhaul batch 4 (shipped, polish)

Three small UX corrections after batch 3 went live.

| # | Change | Files |
|---|---|---|
| 1 | **Touch-friendly action row.** The reaction / reply / more icons used to rely on `group-hover` exclusively, so they were unreachable on phones and iPads (no hover gesture). The row is now `opacity-100` by default and only becomes hover-gated under the `(hover: hover)` media query — desktop keeps the clean "appear on hover" behavior, touch devices show the icons at all times. Implemented as Tailwind v4 arbitrary variants: `opacity-100 transition-opacity [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 [@media(hover:hover)]:focus-within:opacity-100`. | `MessageBubble.tsx` |
| 2 | **Notification dropdown — header removed.** The mobile/iPad notification-level dropdown used to render `<DropdownMenuLabel>Notifications</DropdownMenuLabel>` + `<DropdownMenuSeparator />` above the three options. Both are gone — the menu is short enough to read by itself and the wrapping Bell icon is the visual title already. Unused imports removed. | `ThreadHeader.tsx` |
| 3 | **WhatsApp-style inline timestamp.** Time used to render on its own line below the bubble (and below attachments). Moved INSIDE the bubble at bottom-end using the WhatsApp "ghost spacer" trick: an invisible inline copy of the time reserves layout space at the end of the text, and the actual time element is absolutely positioned at `bottom-1 end-2`. Result: short text → time sits next to the last word; long text → ghost wraps to a new line and the time anchors to the bottom-end without overlapping content. The "(edited)" indicator moved from the sender label area to live next to the time. **Attachment-only messages** (no text) keep the external time chip below — there's no bubble to embed into. **Reaction overlap** is naturally avoided because the single-emoji reaction is positioned `-bottom-0.5` *outside* the bubble (the existing `mb-3` reserves vertical space below the bubble for it), while the inline time lives *inside* the bubble — vertically separated. | `MessageBubble.tsx` |

### Why a separate edited indicator placement now

Before batch 3, "(edited)" lived in the sender label, which is hidden in DM
mode and continuation rows — so edits to those messages were silently
invisible to readers. Moving "edited" next to the inline timestamp makes it
always visible alongside the time, exactly where the reader's eye is anyway.

### Verification

- `pnpm typecheck` ✅ clean
- `pnpm lint-check` ✅ clean (biome strict)
- Format passes biome with `--write`


---

## 2026-05-17 — UX overhaul batch 5 (shipped, polish + cursor pagination)

User-driven polish pass focused on chat surface ergonomics that were still
"close but not quite WhatsApp" after batch 4, plus shipping cursor-based
pagination so long threads load lazily.

### What shipped

| # | Change | Files |
|---|---|---|
| 1 | **Reaction → next-message gap.** A single floating reaction chip pokes ~12px below its bubble; the previous bottom reserve (`mb-3`) plus a continuation row's `mt-0.5` left ~6px of overlap. Bumped the bubble's own `singleReaction && mb-4` reserve and forwarded a new `prevHasFloatingReaction` boolean from `MessageList` so the FOLLOWING bubble bumps to `mt-4` whenever its predecessor has a floating reaction. The result: the chip always has clear vertical space, even for tightly-grouped continuation runs by the same author. | `MessageBubble.tsx`, `MessageList.tsx` |
| 2 | **Time / text overlap fix — replaced the ghost-spacer trick with a clean inline element.** The previous WhatsApp-web-style absolute-positioned timestamp + invisible inline ghost spacer was correct in theory but was flaking in some locales / fonts where the ghost width didn't match the absolute span (causing visible overlap with the last word). Replaced with a single inline `<span>` rendered AFTER the text with `ms-2`, `align-baseline`, `whitespace-nowrap`. Browser-native flow handles wrapping: short text → time sits next to the last word; long text → time wraps to a new line at the end. The "edited" indicator stays alongside the time. By construction text cannot overlap the time. | `MessageBubble.tsx::MessageText` |
| 3 | **Sender-only avatar grouping (no time window).** Removed `CONSECUTIVE_GROUP_WINDOW_MS = 5 * 60_000`. A message is now a "continuation" iff the previous message has the same `authorId` + same `authorType` AND is on the same calendar day (a date divider naturally restarts the run). So if Alice sends 50 messages over 4 hours, only the FIRST shows the avatar + name; the rest are continuations, even though they're far apart in time. Telegram / WhatsApp behaviour. | `MessageList.tsx` |
| 4 | **Bottom-anchored scroll, robust to media loads.** WhatsApp-style: the latest message always lands above the composer, never at the top of the scroll viewport. Implementation has three pieces: (a) `useLayoutEffect` snaps `scrollTop = scrollHeight` BEFORE paint when the last-message id changes, so users never see the "top of the new content" frame; (b) a `ResizeObserver` watches the inner `<ul>` and re-snaps to bottom when the content grows AND `isPinnedRef.current` is true — this catches images / videos / audio finishing their async load and reflowing; (c) the resize handler coalesces multiple growth events into a single `requestAnimationFrame` call, so simultaneous media loads don't fight the browser's paint loop. The user's "I scrolled up to read history" intent is preserved because content-grow reflows don't fire scroll events, so `isPinnedRef` keeps its previous (false) value. | `MessageList.tsx` |
| 5 | **Cursor-based pagination for long threads.** New Convex query `listForConversationPaginated` using `paginationOptsValidator` + `.paginate()` on the `by_conversation_and_created` index. Soft-deleted rows are filtered AFTER `paginate()` returns — the cursor is computed from the index so pagination advancement stays correct, the page just contains slightly fewer visible rows. New hook `useMessagesForConversationPaginated` wraps `usePaginatedQuery` with `initialNumItems: 30`. `MessagesThread` switched from the legacy one-shot `useMessagesForConversation` to the paginated one. `MessageList` accepts `loadOlder` + `canLoadOlder` + `isLoadingOlder` props; an `IntersectionObserver` on a top sentinel auto-fires `loadOlder()` when the sentinel scrolls into view. Visual position is preserved across page-prepends: we capture `scrollHeight` BEFORE calling `loadMore`, then a `useLayoutEffect` watching `ordered.length` adjusts `scrollTop` by the height delta after React commits, so the user's eyes stay on whatever they were reading. | `convex/crm/shared/messages/queries.ts`, `core/comms/messages/hooks/index.ts`, `MessagesThread.tsx`, `MessageList.tsx` |
| 6 | **Voice-note recorder (verified, no work).** The user requested it; on inspection the entire path was already shipped in batch 2 — `VoiceRecorder.tsx` (Platform `MediaRecorder` API, auto-start, cancel/stop/preview/re-record/send phases), `MessageInput.tsx` integration (mic button morphs to send when there's a draft), upload pipeline (`generateUploadUrl` → PUT bytes → `files.record` with `tags: ["kind:voice"]`), and `MessageBubble.tsx` rendering (audio attachments display `<audio controls>` with "Voice note" caption). Nothing to ship; verified end-to-end on a fresh org. | (no code change) |

### Verification

- `pnpm typecheck` ✅ clean
- `pnpm lint-check` ✅ clean (biome strict mode)
- `pnpm build` ✅ Next.js production build passes

### Architecture notes (decisions for future readers)

- **Why the inline-time approach replaced the ghost-spacer trick.** WhatsApp web uses the ghost-spacer technique because they need the time PHYSICALLY at the bottom-end of the bubble even when the bubble is one line tall — a chrome-perfect look. We tried the same; it broke in two ways: (a) when the bubble was extremely narrow (< ~80px) the ghost couldn't fit on the same line as the last word, but the absolute time clipped against the bubble's padding; (b) tabular-nums in some fonts (esp. Arabic locale fonts) render slightly wider than the latin-only ghost, leaving the absolute time poking out. The inline approach has neither failure mode; the trade-off is the time MAY wrap below the last text word for long messages — which is exactly what every modern non-WhatsApp chat UI does anyway (Telegram, iMessage, Signal). This is an explicit, conscious downgrade for reliability.
- **Why we coalesce ResizeObserver fires through `requestAnimationFrame`.** A bubble with 3 images fires the ResizeObserver 3 times as each image's intrinsic dimensions resolve. Without coalescing, we'd write `scrollTop = scrollHeight` 3 times in a single frame, fighting the browser's incremental layout pass. The rAF coalescing reduces that to one write per frame and prevents jank.
- **Why pagination is in the parent (`MessagesThread`), not the list.** `MessageList` is a leaf component — it's also used in `MessagesPanel` (entity-bound) and may eventually be used in the AI tool's "preview message" UI. Lifting `usePaginatedQuery` into the parent keeps `MessageList` purely declarative (props in, JSX out) and lets each consumer decide whether they want pagination or a simple one-shot list.
- **Why we kept the legacy `listForConversation` query.** Some Convex consumers (dashboards, AI tools, future widgets) want a single deterministic shape — N newest messages, no cursor state. The legacy query is the simpler API for them. The chat surface uses the paginated one. Both share the same index; no schema cost.

### Phase-3 / future hooks (not built — documented here)

| Hook | Where it lands | Why deferred |
|---|---|---|
| **Per-conversation pagination state persistence** | When the user navigates away and back, today the paginated cursor resets to "first page." A small Zustand store keyed by `conversationId` could persist `loadedPageCount` and pre-load that many pages on revisit. Trade-off: more reads. Skipped because Convex's reactive subscriptions already keep the first page fresh; only thread-deep history users would notice. | Polish; revisit if user data shows it matters. |
| **Show a "scroll to bottom" button when not pinned** | When `isPinnedRef.current === false` AND new messages arrive, surface a floating "↓ N new messages" pill in the bottom-end of the viewport. Click → snap to bottom + clear the new-message counter. The plumbing is straightforward: keep a `unreadAfterScrollUpRef` that increments when `lastMessageId` changes while not pinned. | Tier-D polish — current behaviour (silent new-message indicator in the inbox sidebar) is acceptable for v1. |
| **`paginate` for `listForPerson`** | Same pattern. The personCode-keyed view in the profile Messages tab can grow to thousands of rows if the lead has been a customer for years. Switch to `paginationOptsValidator` + `usePaginatedQuery` when it lands. | Phase 3 — current `take(100)` is enough for the first year. |
| **Snapshot / restore scroll position when switching conversations** | Today switching conversations resets the user to the bottom (correct). A future refinement: remember the scroll position per-conversation so returning to a thread shows the user exactly where they left off. Persist `(conversationId → scrollTop)` in a small Zustand map. | Polish; current bottom-anchor is the WhatsApp default. |


---

## 2026-05-17 — UX overhaul batch 6 (revert + 12h lock)

User direction: keep the WhatsApp-style chrome (time anchored at the
bottom-end of the bubble, NOT inline with text), but fix the underlying
overlap bug. Also: force 12-hour AM/PM across the chat surface regardless
of the user's locale.

### What shipped

| # | Change | Files |
|---|---|---|
| 1 | **Reverted MessageText to ghost-spacer + absolute** (the WhatsApp web technique). The previous batch-5 inline approach was a Telegram/Signal-style downgrade — the user prefers WhatsApp's bottom-end chrome. The width-mismatch bug that triggered batch 5 has been root-caused: the ghost was `inline-block` while the absolute was `inline-flex items-center gap-1` AND lacked `tabular-nums`, so the absolute consumed 4–6px more than the ghost reserved → poked over the last word. Both elements now share a single `META_LAYOUT_CLASSES` constant — they reserve byte-identical width by construction. | `MessageBubble.tsx::MessageText` |
| 2 | **12-hour AM/PM forced** across `formatChatTime` and `formatChatDateTime` (and therefore `formatChatSidebarTime`). The default was previously the locale's choice, which meant en-GB / fr / de / ar-SA users saw 24-hour. New `resolveHour12()` helper returns `opts.hour12 ?? true`. Callers that want 24-hour can still pass `hour12: false`. The future hook for a per-org `timeFormat` setting is unchanged — a future caller can read the org setting and pass it. | `lib/datetime.ts` |

### Why the ghost-spacer needed two elements with the SAME classes

Original bug: ghost was `inline-block` (no flex gap), absolute was `inline-flex items-center gap-1`, neither had `tabular-nums` on the ghost. So:

| Property | Ghost (reserve) | Absolute (visible) | Δ |
|---|---|---|---|
| display | `inline-block` | `inline-flex` | — |
| gap between children | 0 (margin-only) | 4px (`gap-1`) | +4px on absolute |
| digit width | proportional | tabular | up to 2px on time strings like "12:48" |

The absolute therefore consumed up to ~6px more width than the ghost reserved. On lines where the last word ended near the bubble's right padding, that 6px landed ON TOP of the last glyph. Sharing `META_LAYOUT_CLASSES` removes the discrepancy.

### Verification

- `pnpm typecheck` ✅ clean
- `pnpm lint-check` ✅ clean (biome strict mode)
- `pnpm build` ✅ Next.js production build passes

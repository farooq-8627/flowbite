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
| 6 | (2026-05-16) Avatars are always `rounded-full`. | Themed `--radius` produced visually inconsistent participant stacks. AGENTS.md exception applies. |
| 7 | (2026-05-16) Sidebar uses ONE search-icon button — no separate search input + new button. | The standalone search input was searching message previews, which the user didn't want. Search and "start new" are now the same action via `NewConversationDialog`. |
| 8 | (2026-05-16) All/Unread/Archived filters live in a `Menu` dropdown, not tabs. | Cleaner toolbar; same functionality. |
| 9 | (2026-05-16) Conversation rows / thread headers always resolve the real entity name via `useEntityDisplay` — never display the raw "Lead · P-005" string. | Hook reads `getByPersonCode` / `getByDealCode` / `getByCompanyCode` based on entityType. The personCode lives in a small monospace badge for power users. |
| 10 | (2026-05-16) `MessageBubble` accepts `isDirect` and hides the sender label when `participants.length === 2`. | Left/right alignment is sufficient for DMs. Group chats keep names. |
| 11 | (2026-05-16) Single-emoji reactions (count=1) render attached to the bubble's outer-end-bottom corner; multi-emoji or count>1 falls back to the existing pill row. | WhatsApp-style for the common case; the pill row still scales for group chats with many reactions. |
| 12 | (2026-05-16) `NewConversationDialog` uses ONE flat row layout (avatar + name + secondary + personCode badge), not per-entity-type groups. cmdk `keywords` receives the full searchable surface. | Email + code search were broken because keywords didn't include them. Layout is now consistent regardless of entity type. |
| 13 | (2026-05-16) Recent searches are localStorage-backed under key `messages:newConvoRecents:v1`. | Phase 1 — server-backed `recentSearches` table is a future improvement. |
| 14 | (2026-05-16) `MessageInput` keeps a per-attachment `URL.createObjectURL` for instant image/video previews; revoked on remove + unmount. | No upload round-trip needed before the user sees the preview. |
| 15 | (2026-05-16, batch 2) `messages.send` accepts file-only sends — empty `content` is allowed iff `attachments.length > 0`. | "Send these 3 photos with no caption" is a valid action. Pure empty sends still throw `INVALID_ARGS`. |
| 16 | (2026-05-16, batch 2) `MessageBubble` hides BOTH avatar and name in DMs (`isDirect=true`). | Left/right alignment is the only signal needed for 2-person chats. AI / contact authors still render the avatar so the bot subscript is visible. |
| 17 | (2026-05-16, batch 2) Single-emoji reaction renders at `size-5` outside the bubble (with `mb-3` spacer on the bubble) so it never overlaps content. | Tighter, WhatsApp-style. |
| 18 | (2026-05-16, batch 2) Image / video clicks open `MediaViewerModal`, not a new tab. Desktop = max-w-5xl dark modal with zoom buttons + scroll-wheel + drag-pan + arrow-key nav. Mobile = full-screen dark backdrop with `touch-action: pinch-zoom`. | Consistent in-app preview, no context switch. Single component handles both layouts via `useIsMobile`. |
| 19 | (2026-05-16, batch 2) Voice notes use the platform `MediaRecorder` API, no third-party library. Captured as `audio/webm` (or platform fallback) and uploaded via the existing `files.record` pipeline with `tags: ["kind:voice"]`. | Smallest possible bundle; works in every modern browser. |
| 20 | (2026-05-16, batch 2) Mobile sidebar is the existing `MessagesSidebar` wrapped in `<Sheet>` — no new sidebar component. Hamburger trigger lives in `ThreadHeader` and `MessagesEmptyState`. | Reuse `components/ui/sheet.tsx` per user direction; selection auto-closes the Sheet. |
| 21 | (2026-05-16, batch 2) Mobile notification level uses a `DropdownMenu` (`sm:hidden`) — same three options as the desktop segmented control, just collapsed under a Bell icon. | The segmented control doesn't fit next to the People button on phones. |
| 22 | (2026-05-16, batch 2) Dialog mobile margins: every `DialogContent` size class is gated on `sm:` so mobile inherits the base `max-w-[calc(100%-2rem)]`. | Phone screens get a 1rem gap on each side instead of edge-to-edge cards. |
| 23 | (2026-05-16, batch 2) `ParticipantsDialog`'s empty state now distinguishes three cases: (a) only-one-org-member (CTA → Settings → Members), (b) search miss, (c) everyone is already in the thread. | The previous copy was misleading users into thinking the search was broken. |
| 24 | (2026-05-17, batch 3) Consecutive same-author messages within 5 min and same day render as a continuation: avatar + sender label hidden, top margin tightened to `mt-0.5`. `MessageList` computes `showHeader` per row and forwards it to `MessageBubble`. | Matches WhatsApp / Telegram. Composes cleanly with the existing DM-mode avatar suppression — both reasons hide the avatar via the same code path. |
| 25 | (2026-05-17, batch 3) Chat surface uses **exact clock time** (e.g. "2:45 PM") via `lib/datetime.ts`, never `formatDistanceToNow`. Sidebar uses today→clock, yesterday→"Yesterday", week→weekday, older→short date. AM/PM follows the user's locale by default; an `opts.hour12` knob supports a future per-org override. | Relative time is misleading in chat ("about 1 hour ago" doesn't match what people scrolled to). The relative helper stays available for non-chat surfaces. |
| 26 | (2026-05-17, batch 3) Avatar / participant clicks route to `/{orgSlug}/settings?group=team#team.members`, not the broken `/{orgSlug}/settings/members/{userId}` route. Self avatars are not clickable. | The per-member detail page never existed; users were getting 404s. The link target is centralised in three components so a future per-member route only needs three edits. |
| 27 | (2026-05-17, batch 3) The "People" button label is hidden on phones via `<span className="hidden sm:inline">People</span>`; iPad/desktop still show it. Notification segmented control breakpoint moved from `sm` → `lg`, so iPad gets the compact dropdown like phones. | Crowded chrome on iPad was pushing the People button off-screen. |
| 28 | (2026-05-17, batch 3) `MediaViewerModal`'s built-in `DialogContent` close X is disabled (`showCloseButton={false}`); only the inline custom close stays. The `Maximize` toolbar button now calls the browser's Fullscreen API on the stage element; a separate `RotateCcw` button handles "Reset zoom" with an unambiguous icon. | The previous double-X confused users; "Maximize" labelled as reset-zoom was misleading. |
| 29 | (2026-05-17, batch 3) Forwarding messages = a new `<ForwardDialog>` opened from the bubble's actions menu. Multi-select + fan-out `useSendMessage` calls. Attachments are forwarded by re-referencing the same `Id<"files">[]` (org-scoped, accessible to anyone in the destination thread); body is prefixed with "↪ Forwarded" for provenance. No new schema field. | Files are org-scoped, so re-referencing avoids the pitfalls of cloning storage objects. The forward marker is purely cosmetic — no schema cost. |
| 30 | (2026-05-17, batch 3) Audio backfill via `convex/_migrations/allowAudioUploads.ts` — idempotent action that adds `"audio"` to `org.settings.fileUpload.allowedMimeCategories` for orgs whose policy is non-empty and missing it. Default-allow-all orgs are skipped. | Newer orgs already allow audio (default); only older orgs with explicit whitelists rejected voice notes. |
| 31 | (2026-05-17, batch 3) Conversation switch uses React's `useDeferredValue` + `startTransition` so the previous thread keeps rendering while the new one's queries hydrate. | Stale-while-revalidate UX without any third-party library or Convex pattern change. |
| 32 | (2026-05-17, batch 3) `<Sheet>` supports logical `start` / `end` sides — they resolve to physical `left`/`right` based on `document.documentElement.dir` at mount + on transitions. `MessagesInboxView` uses `side="start"` and disables the auto-close button to avoid overlap with the sidebar's search button. | Full RTL support without an explicit `dir` prop on every consumer. The animation tokens still consume the resolved physical side so no Tailwind extension was needed. |
| 33 | (2026-05-17, batch 4) Bubble actions (reactions / reply / more) are visible by default; `(hover: hover)` media query gates the hide-and-show-on-hover behavior to mouse devices only. | Touch devices have no hover gesture; the previous `group-hover`-only rule made the icons unreachable on phones and iPads. |
| 34 | (2026-05-17, batch 4) Notification-level dropdown rendered without a "Notifications" header label or separator. | Three short rows under a labelled bell-icon trigger don't need an extra title — saved 2 rows of dropdown vertical space on phones. |
| 35 | (2026-05-17, batch 4) Time renders INSIDE the bubble at bottom-end (WhatsApp ghost-spacer trick). The "(edited)" indicator moved alongside the inline time. Attachment-only messages keep an external time chip below the attachments. | A separate time line below the bubble looked dated and wasted vertical space. The ghost-spacer trick is the same technique the WhatsApp web client uses; it composes cleanly with the existing single-emoji reaction (which sits *outside* the bubble — vertically separated from the inline time). |
| 36 | (2026-05-17, batch 5) Time-inside-bubble switched from ghost-spacer + absolute to a plain inline `<span>` after the text. Browser-native flow handles wrapping (short text → next to last word; long text → wraps to new line). | The ghost-spacer trick (decision #35) was overlapping text in some locales / fonts where the ghost width didn't match the absolute span. The inline approach can't overlap by construction; the tradeoff (time may wrap to a new line for long messages) matches Telegram / iMessage / Signal behavior. |
| 37 | (2026-05-17, batch 5) Avatar / sender-label grouping is sender-change-only — the previous 5-minute window was removed. A continuation = same authorId + same authorType + same calendar day. | If Alice sends 50 messages over 4 hours back-to-back, only the first shows the avatar; the rest are continuations even when the time gap is large. Telegram / WhatsApp UX. Date dividers naturally restart the run, so grouping never crosses a day boundary. |
| 38 | (2026-05-17, batch 5) `MessageList` snaps to bottom in `useLayoutEffect` (before paint) on `lastMessageId` change AND uses a `ResizeObserver` on the inner `<ul>` to re-snap when content grows (image / video / audio finished loading). Resize events are coalesced through `requestAnimationFrame`. | `useEffect`-based scroll-to-bottom showed a flash of "top of new content" because the browser painted between the React commit and the effect. `useLayoutEffect` runs synchronously after commit, before paint. The ResizeObserver makes the bottom-anchor behavior robust to async media loads — the typical failure mode of naive scroll-to-bottom implementations. The rAF coalescing prevents fighting the browser's paint loop when multiple images load simultaneously. |
| 39 | (2026-05-17, batch 5) Bubble's `singleReaction && mb-4` (was `mb-3`); `MessageList` forwards a `prevHasFloatingReaction` boolean so the FOLLOWING bubble bumps to `mt-4`. | A floating reaction chip pokes ~12px below its bubble; the previous reserve plus a `mt-0.5` continuation row left ~6px of overlap. The new spacing guarantees clear vertical separation even for tightly-grouped same-author runs. |
| 40 | (2026-05-17, batch 5) Cursor-based pagination — new Convex query `listForConversationPaginated` using `paginationOptsValidator` + `.paginate()`; new hook `useMessagesForConversationPaginated` wrapping `usePaginatedQuery`; `MessagesThread` is the only consumer. `MessageList` accepts `loadOlder` + `canLoadOlder` + `isLoadingOlder` props and uses an `IntersectionObserver` on a top sentinel to auto-fire `loadOlder()` when scrolled to the top. Visual position is preserved across page-prepends via a `useLayoutEffect` that captures `scrollHeight` before `loadMore` and adjusts `scrollTop` by the delta after React commits. | Long threads (hundreds of messages) used to fetch everything up-front (capped at 100 by the legacy `take()`-based query). The paginated query pages 30 at a time. Convex's reactive paginate keeps the first page warm so new messages still appear instantly. The legacy `listForConversation` is kept for callers (widgets, AI tools) that just want N newest with no cursor state. |
| 41 | (2026-05-17, batch 5) Soft-delete filter for the paginated query runs AFTER `.paginate()` returns, not as part of the index query. | The cursor is computed from the index, not from the filtered result. Filtering after paginate just shrinks the visible page (some pages contain fewer than `numItems` rows when soft-deletes exist), but pagination advancement stays correct without redesigning the index. |
| 42 | (2026-05-17, batch 5) Pagination state lives in the parent (`MessagesThread`), not in `MessageList`. The list component receives only `loadOlder` + status flags. | `MessageList` is a leaf — it's also used by `MessagesPanel` (entity-bound) and may be used by AI tools later. Keeping it purely declarative (props in, JSX out) lets each consumer decide if they want pagination or a one-shot fetch. |
| 43 | (2026-05-17, batch 6) Reverted MessageText to ghost-spacer + absolute (WhatsApp web technique) — the time anchors to the bubble's bottom-end, NOT inline with text. The batch-5 inline approach was a Telegram/Signal-style downgrade; user wants the WhatsApp chrome. | The width-mismatch bug that triggered batch 5 has been root-caused — the ghost and absolute had different display modes (`inline-block` vs `inline-flex`), different gap strategies (margin vs flex `gap-1`), and only the absolute had `tabular-nums`. Sharing a single `META_LAYOUT_CLASSES` constant on both elements guarantees byte-identical width reserve. |
| 44 | (2026-05-17, batch 6) `formatChatTime` / `formatChatDateTime` / `formatChatSidebarTime` default to **12-hour AM/PM** across the chat surface, regardless of locale. Callers can opt out via `hour12: false`. | Some 24-hour locales (en-GB, fr, de, ar-SA) were rendering "14:45" instead of "2:45 PM". Per user direction, the chat surface uses a uniform WhatsApp-style 12-hour clock. The future per-org `timeFormat` hook is unchanged — a caller reading the org setting can pass `hour12` explicitly. |

## Rules

- Never use `ml-*`/`mr-*`/`pl-*`/`pr-*`/`left-*`/`right-*` — RTL-safe logical Tailwind only.
- All `border-radius` via `rounded-[var(--radius)]`.
- `MessageBubble` already RTL-safe via `flex-row-reverse` + `text-end`.
- Author avatar uses **human's avatar + AI subscript badge** for AI on-behalf messages (per FRONTEND-DECISIONS Rule 20 / WhatsApp Phase-3 behavior).

## Avoids

- ❌ Don't store messages on the `notes` table (the `isActivityChat` flag is gone).
- ❌ Don't render entity thread + sidebar inside a panel (only org-wide view does that).
- ❌ Don't subscribe to `listInbox` from inside a thread component — it's expensive.

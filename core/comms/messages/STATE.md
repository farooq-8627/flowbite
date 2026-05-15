# Messages — State

> Updated: 2026-05-16
> Status: 60% Complete — backend + hooks + route wired; UI deferred to next phase.

## ✅ Completed

| Component | File | Notes |
|---|---|---|
| `messages` table | `convex/schema/crmShared.ts` | 5 indexes (by_entity, by_org_and_personCode, by_org_and_created, by_org_and_thread, by_replyTo). |
| Permission catalog entries | `convex/_shared/permissions/catalog.ts` | `messages.view/send/delete/deleteAny` seeded into Owner/Admin/Member/Viewer. |
| Reserved slug | `convex/_shared/reservedSlugs.ts` | `messages` reserved (cannot be a CRM entity slug). |
| Convex queries | `convex/crm/shared/messages/queries.ts` | `listForEntity`, `listForPerson`, `listInbox`, `listRecent`, `getById`. |
| Convex mutations | `convex/crm/shared/messages/mutations.ts` | `send`, `markRead`, `markAllRead`, `remove`. logActivity + sendNotification wired. |
| React hooks | `core/comms/messages/hooks/index.ts` | `useMessagesForEntity`, `useMessagesForPerson`, `useMessagesInbox`, `useRecentMessages`, `useSendMessage`, `useMarkMessageRead`, `useMarkAllMessagesRead`, `useDeleteMessage`. |
| Org-wide route | `app/[locale]/(private)/[orgSlug]/messages/page.tsx` | Thin wrapper → `MessagesInboxView`. |
| Placeholder view | `core/comms/messages/views/MessagesInboxView.tsx` | Data-wired (uses both `useMessagesInbox` and `useMessagesForEntity` — proves end-to-end flow). |
| Sidebar nav entry | `core/shell/shell/config/navigation.ts` | Workspace group → "Messages" (`MessageSquare` icon). |

## ⬜ Pending

| Task | Priority | Notes |
|---|---|---|
| `MessagesSidebar.tsx` (conversation list) | High | Donor: shadboard `chat-sidebar/*`. Independent component — used only on org-wide view. |
| `MessagesThread.tsx` (active thread) | High | Donor: shadboard `chat-box.tsx` + content list + footer. Used by both org-wide view and embedded panel. |
| `MessageBubble.tsx` + content variants (text/images/files) | High | Donor: shadboard `message-bubble*.tsx`. RTL-safe out of the box. |
| `MessageInput.tsx` | High | Donor: shadboard `text-message-form.tsx` + uploaders. Replace reducer dispatch with `useSendMessage`. |
| `ChatAvatar.tsx` (with AI subscript badge) | Medium | Donor: shadboard `chat-avatar.tsx`. Add subscript badge slot for AI on-behalf. |
| `MessagesPanel` (embedded in profile/deal/company tabs) | Medium | Composes `MessagesThread` + `MessageInput` (no sidebar). |
| `MessagesPreviewWidget` (dashboard) | Low | 5 most-recent messages org-wide. |
| Phase 3: AI on-behalf — system prompt + tool registry entries | Phase 3 | `messages.send` exposed as AI tool with `authorType: "ai"`. |

## Architecture Notes

- **Table split was 2026-05-16 decision.** Messages used to be on `notes` table with `isActivityChat: true`. Honest review showed flag-based polymorphism is bad for AI tool clarity, indexes, and schema growth. New table chosen. See `CORE-FEATURES-ARCHITECTURE.md` §0.
- **Sidebar/Main split was user requirement.** Reason: embedded panels (profile Messages tab) have no horizontal room for a sidebar. Org-wide composes both. Two independent components.
- **Donor template is shadboard `apps/chat/`, NOT shadcnstore.** Richer layout (text/images/files/voice + typed status + Card/Sheet sidebar). When UI lands: drop shadboard's reducer/context/mock-data, replace with Convex live queries.
- **AI on-behalf rendering**: human's avatar + small "AI" subscript badge (per FRONTEND-DECISIONS Rule 20).

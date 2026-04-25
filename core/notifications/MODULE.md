# Notifications (Core)

> In-app notification system. Bell icon, unread counts, mark-read. 
> Core because every module uses it to surface events to users.

## Ownership
- **Location**: `core/notifications/`
- **Backend**: `convex/notifications/helpers.ts`
- **Phase**: 0 ✅ (helper built) | UI Phase 1
- **Status**: Backend DONE | UI PENDING

## Rules
- [ ] R-NOTIF-01: Never call `sendNotification()` from frontend — backend mutations only
- [ ] R-NOTIF-02: Every notification has `orgId` + `userId` — never org-wide blast
- [ ] R-NOTIF-03: Notification types defined in `constants.ts` — never raw strings
- [ ] R-NOTIF-04: Unread count computed via `by_userId_and_read` index — never `.collect()` + filter
- [ ] R-NOTIF-05: Mark-read is user-scoped — one user's read state never affects another's

## Checklist
- [x] `convex/notifications/helpers.ts` — `sendNotification()` helper
- [ ] `core/notifications/components/NotificationBell.tsx` — unread count badge
- [ ] `core/notifications/components/NotificationList.tsx` — dropdown with notification items
- [ ] `core/notifications/hooks/useNotifications.ts` — real-time unread count + list

## Avoids
- ❌ Never store email content in notifications — that's the `messages` table (Phase 4)
- ❌ Never mark ALL org notifications as read — mark-read is per-user
- ❌ Never add business logic to notification creation — `sendNotification()` is a dumb insert

## Cross-Module Integration

### → Any Module that mutates data
Every mutation that affects another user MUST call `sendNotification()`:
```typescript
// In any mutation after a state change:
await ctx.runMutation(internal.notifications.helpers.sendNotification, {
  orgId,
  userId: affectedUserId,      // the user who should see the notification
  type: "deal_assigned",       // constant from NOTIFICATION_TYPES
  title: "Deal assigned to you",
  entityType: "deal",
  entityId: dealId,
});
```

### → core/timelines
Notification events are NOT logged in `activityLogs` — they are ephemeral UX signals.
`activityLogs` = permanent audit trail. Notifications = real-time alerts that can be dismissed.

### → core/shell
`NotificationBell.tsx` lives in `core/notifications/` — shell renders it in `TopNav.tsx`.
Shell imports `NotificationBell` — notifications module does NOT import from shell.

## Schema Tables (Full definitions in `schema.md`)

| Table | Purpose |
|---|---|
| `notifications` | Per-user notifications — `orgId`, `userId`, `type`, `title`, `read`, `entityType`, `entityId` |

Key indexes: `by_userId_and_read`, `by_orgId_and_userId`

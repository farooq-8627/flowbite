# Notifications Module (Core)

> In-app notification system. Bell icon with unread count, dropdown with first 5-8,
> full notifications page at /notifications. Real-time via Convex subscriptions.
> Core because every module fires notifications and the bell lives in the shell.

## Ownership
- **Location**: `core/notifications/`
- **Backend**: `convex/notifications/` (helpers.ts ✅ done, queries/mutations needed)
- **Routes**: `app/[locale]/(private)/dashboard/[orgSlug]/notifications/page.tsx`
- **Phase**: 0 ✅ backend helper | 1 UI | 2 preferences
- **Status**: Backend helper DONE | UI PENDING

---

## Architecture Overview

```
Every mutation that affects another user calls sendNotification()
  ↓
convex/notifications/helpers.ts::sendNotification() (already built ✅)
  ↓ inserts into notifications table
Convex real-time subscription picks up new row
  ↓
NotificationBell unread count updates instantly (no polling)
  ↓
Agent clicks bell → dropdown shows first 5-8
Agent clicks "View all" → /notifications page (infinite scroll)
```

---

## UI Components

### NotificationBell (in TopNav)
```typescript
// core/notifications/components/NotificationBell.tsx
export function NotificationBell() {
  const params      = useParams();
  const orgSlug     = params.orgSlug as string;
  const summary     = useQuery(api.notifications.getSummary);  // { unreadCount, total }
  const markAllRead = useMutation(api.notifications.markAllRead);
  const unreadCount = summary?.unreadCount ?? 0;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="icon" variant="ghost" className="relative">
          <Bell className="size-4" />
          {unreadCount > 0 && (
            <Badge className="absolute -top-1 -right-1 size-4 p-0 text-[10px]">
              {unreadCount > 9 ? "9+" : unreadCount}
            </Badge>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuHeader>
          <span className="text-sm font-medium">Notifications</span>
          {unreadCount > 0 && (
            <Button variant="ghost" size="sm" onClick={() => markAllRead()}>Mark all read</Button>
          )}
        </DropdownMenuHeader>
        <NotificationList limit={8} />     {/* First 5-8, unread highlighted */}
        <DropdownMenuFooter>
          <Link href={`/dashboard/${orgSlug}/notifications`}>
            View all notifications →
          </Link>
        </DropdownMenuFooter>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
```

### NotificationList
```typescript
// core/notifications/components/NotificationList.tsx
// Renders notification items: icon + title + relative time + entity link
// Unread items: highlighted background (bg-primary/5)
// Read items: normal background
// Clicking an item: marks as read + navigates to entity
```

### Notifications Page (`/notifications`)
```
Notifications                              [Mark all as read]

Filter: [All] [Unread] [CRM] [AI] [System]

─────────────────────────────────────────────
🎯  New lead P-001 assigned to you              2 min ago   [Unread]
    John Smith was assigned by Ahmed

💬  WhatsApp message received from P-001         1 hr ago   [Unread]
    "Hi, I'm interested in the JVC property..."

🔄  Deal D-007 moved to Offer/MOU               3 hrs ago   [Read]
    Sarah moved the deal for Ahmed Hassan

📅  Follow-up FU-003 is due today               5 hrs ago   [Read]
    Contact John Smith (P-001) about budget

─── Load more ───────────────────────────────────────────────────────
```

Infinite scroll — latest first, load older on scroll.

---

## Notification Types

```typescript
// convex/notifications/constants.ts
export const NOTIFICATION_TYPES = {
  // Lead/Contact notifications
  LEAD_ASSIGNED:       "lead_assigned",
  LEAD_CONVERTED:      "lead_converted",
  CONTACT_ASSIGNED:    "contact_assigned",

  // Deal notifications
  DEAL_ASSIGNED:       "deal_assigned",
  DEAL_STAGE_CHANGED:  "deal_stage_changed",
  DEAL_WON:            "deal_won",
  DEAL_STALE:          "deal_stale",

  // Follow-up / Reminder notifications
  REMINDER_DUE:        "reminder_due",
  REMINDER_OVERDUE:    "reminder_overdue",

  // Org notifications
  MEMBER_INVITED:      "member_invited",
  MEMBER_JOINED:       "member_joined",
  ROLE_CHANGED:        "role_changed",

  // AI notifications
  AI_ACTION_COMPLETED: "ai_action_completed",
  AI_WORKSPACE_SETUP:  "ai_workspace_setup",

  // Billing notifications
  BILLING_TRIAL_ENDING: "billing_trial_ending",
  BILLING_SUSPENDED:    "billing_suspended",
  BILLING_RENEWED:      "billing_renewed",

  // System notifications
  CSV_IMPORT_COMPLETE:  "csv_import_complete",
  CSV_IMPORT_FAILED:    "csv_import_failed",
} as const;
```

---

## Convex Backend

```typescript
// convex/notifications/queries.ts — NEEDED (not yet built)

export const getSummary = orgQuery({
  handler: async (ctx) => {
    const unreadCount = await ctx.db.query("notifications")
      .withIndex("by_userId_and_read", q =>
        q.eq("userId", ctx.user._id).eq("read", false))
      .take(100);  // cap at 100 for count display (shows "99+" if more)
    return { unreadCount: unreadCount.length };
  },
});

export const listForUser = orgQuery({
  args: { cursor: v.optional(v.string()), take: v.optional(v.number()) },
  handler: async (ctx, args) => {
    return ctx.db.query("notifications")
      .withIndex("by_userId_and_createdAt", q =>
        q.eq("userId", ctx.user._id))
      .order("desc")
      .paginate({ numItems: args.take ?? 20, cursor: args.cursor ?? null });
  },
});

// convex/notifications/mutations.ts — NEEDED

export const markRead = orgMutation({
  args: { notificationId: v.id("notifications") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.notificationId, { read: true });
  },
});

export const markAllRead = orgMutation({
  handler: async (ctx) => {
    const unread = await ctx.db.query("notifications")
      .withIndex("by_userId_and_read", q =>
        q.eq("userId", ctx.user._id).eq("read", false))
      .collect();
    await Promise.all(unread.map(n => ctx.db.patch(n._id, { read: true })));
  },
});
```

---

## Phase 2 — Per-User Notification Preferences

```typescript
// convex/schema.ts — add to users table
notificationPreferences: v.optional(v.object({
  lead_assigned:       v.boolean(),   // default: true
  deal_stage_changed:  v.boolean(),   // default: true
  reminder_due:        v.boolean(),   // default: true
  ai_action_completed: v.boolean(),   // default: false (can be noisy)
  billing_trial_ending: v.boolean(),  // default: true
})),
```

Settings location: `/settings/members` profile section → "Notification Preferences"
When `sendNotification()` is called, check user preference before inserting.

---

## Rules
- [ ] R-NOTIF-01: Never call `sendNotification()` from frontend — backend mutations only
- [ ] R-NOTIF-02: Every notification has `orgId` + `userId` — never org-wide blast
- [ ] R-NOTIF-03: Use NOTIFICATION_TYPES constants — never raw strings
- [ ] R-NOTIF-04: Unread count from `by_userId_and_read` index — never `.collect()` + filter
- [ ] R-NOTIF-05: Mark-read is user-scoped — one user's read state never affects another's
- [ ] R-NOTIF-06: Notification dropdown shows first 5-8 items — "View all" links to full page
- [ ] R-NOTIF-07: Phase 2: check user notification preferences before inserting
- [ ] R-NOTIF-08: Notification text MUST use dynamic entity labels from `orgs.entityLabels` — never hardcode "Lead", "Deal", "Contact"
- [ ] R-NOTIF-09: Notification preferences UI uses group-wise toggles with "Toggle All" per group (CRM, Reminders, AI, Team, System)

## Avoids
- ❌ Never store email content in notifications — ephemeral alerts only
- ❌ Never mark all ORG notifications as read — mark-read is per-user only
- ❌ Never add business logic to `sendNotification()` — it's a dumb insert
- ❌ Never use `.collect()` to count unread — use index + `.take(100)`

## Tables Owned
| Table | Purpose |
|---|---|
| `notifications` | Per-user alerts — `orgId`, `userId`, `type`, `title`, `read`, `entityType`, `entityId`, `personCode` |

Key indexes: `by_userId_and_read`, `by_userId_and_createdAt`, `by_orgId_and_userId`

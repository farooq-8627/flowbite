# Timeline — State

> Updated: 2026-05-19 (afternoon — UI redesign per user feedback)
> Status: 100% complete (Phase A) — backend paginated query + full UI shipped, action-first redesign applied, dashboard widget mounted.

## 2026-05-19 (afternoon) — Action-first redesign

User feedback summary:
1. Avatars need to show actual member images (was: showing initials only because the old code read a non-existent `image` field instead of `avatarUrl`).
2. Reading order needs to flip — the user wants to read **what happened** first, not "who did what". Old design led with the actor name.
3. Each entry kind needs its own visual identity. Old design rendered every entry the same way; the eye couldn't distinguish "lead created" from "deal won" from "reminder set".
4. The affected entity must be visible — converted/created/won entries need to surface "what was converted" / "what was created", not just the verb.
5. Color coding via avatar-position rings (NOT full backgrounds). Saas-ui-style: ring + icon on the left tells the user the action type at a glance.
6. More breathing room between entries.

What changed:

| Change | File |
|---|---|
| New action theme system | `components/action-theme.ts` — single source of truth for ring color, icon, and headline verb per `(entityType, action, actorType)` triple. 11 distinct themes. |
| Bare entry rewrite | `components/TimelineBareEntry.tsx` — title row leads with action ("Lead created"), trailing meta (time + actor avatar) on inline-end. Subject row underneath shows the affected entity name + code. Exports `ActionNode` + `TrailingMeta` for reuse. |
| Card entry rewrite | `components/TimelineCardEntry.tsx` — same header pattern (action node + title row + trailing meta), framed body card below. Notes show category meta; reminders show due date / follow-up code / person+deal codes. |
| Node entry rewrite | `components/TimelineNodeEntry.tsx` — same compact pattern as bare entry, but renders the "→ Negotiation" tail when metadata supplies the new state. |
| Removed `timeline-verbs.ts` | Replaced by `action-theme.ts` which handles both verbs AND visual identity in one place. |
| Increased gap between entries | `components/TimelineFeed.tsx` — `gap-3` → `gap-5`, padding `px-1 py-2` → `px-2 py-3`. |
| Avatar fix | All entries now read `member.user.avatarUrl` (was: `member.user.image` which doesn't exist on the schema — `listMembers` resolves both direct URL and storage URL into `avatarUrl`). |
| Dashboard mounted | `core/shell/shell/views/dashboard/DashboardHomeView.tsx` — replaced `RecentActivityCard` with `TimelineActivityWidget`. The old card pulled from `getDashboardStats.recentActivity`; the widget pulls from the live paginated timeline. |

## ✅ Completed (Phase A — 2026-05-19)

| Component | File | Notes |
|---|---|---|
| Convex query | `convex/crm/shared/timeline/queries.ts::getForScope` | NEW — cursor pagination via `paginationOptsValidator`. Discriminated `scope` arg (org / person / entity). RBAC per scope. Tags `_entryType` + `_kind` + `_color`. |
| Convex query | `convex/crm/shared/timeline/queries.ts::getForEntity` | NEW — non-paginated entity-scoped read. Reads activityLogs `by_entityType_and_entityId`. |
| Convex query | `getForPerson`, `getForOrg` | Existing — extended to tag `_kind` (bare/card/node). |
| React hooks | `core/comms/timeline/hooks/index.ts` | NEW `usePaginatedTimeline` (cursor); legacy `usePersonTimeline` / `useOrgTimeline` / `useEntityTimeline` kept for non-paginated callers. |
| `TimelineFeed` | `components/TimelineFeed.tsx` | Parent. First-paint scroll-to-bottom. Top-sentinel `IntersectionObserver` → `loadMore`. ScrollHeight-delta restoration. Optional composer + filters. Visible cap support. |
| `TimelineEntry` (switch) | `components/TimelineEntry.tsx` | Picks bare/card/node from `_kind`. |
| `TimelineBareEntry` | `components/TimelineBareEntry.tsx` | Avatar + inline text + relative time. |
| `TimelineCardEntry` | `components/TimelineCardEntry.tsx` | Boxed card for notes + reminders. Reminder body shows due date + follow-up code + person/deal codes via `<IdentityBadge>`. |
| `TimelineNodeEntry` | `components/TimelineNodeEntry.tsx` | Tiny ring on the rail for status / stage / converted events. |
| `TimelineRail` | `components/TimelineRail.tsx` | Continuous absolute-positioned line at `start-[22px]`. RTL-safe. |
| `TimelineFilters` | `components/TimelineFilters.tsx` | Chip row: All / Notes / Reminders / Activity / AI / System. Counts per chip. Client-side filter. |
| `TimelineComposer` | `components/TimelineComposer.tsx` | Thin wrapper over `useCreateNote`. ⌘/Ctrl-Enter submits. |
| `timeline-verbs.ts` | (removed) | Replaced by `action-theme.ts`. |
| `action-theme.ts` | `components/action-theme.ts` | NEW. SSOT for ring color + icon + headline verb. Eleven themes covering created/updated/deleted/converted/won/lost/stage_changed/reminder/note/message/AI/system. |
| `types.ts` | `components/types.ts` | Shared `TimelineEntry` discriminated union + `entryMatchesFilter` helper. |
| `OrgTimelineView` (real) | `views/OrgTimelineView.tsx` | Replaces placeholder. Mounts `TimelineFeed{kind:"org"}` in card chrome. |
| `PersonTimelinePanel` | `panels/PersonTimelinePanel.tsx` | Profile Timeline tab. Composer attaches to `personCode`. |
| `EntityTimelinePanel` | `panels/EntityTimelinePanel.tsx` | Deal/Company Timeline tab. |
| `TimelineActivityWidget` | `widgets/TimelineActivityWidget.tsx` | Dashboard "Recent activity" card. `pageSize=10`, no composer/filters, optional title link to full timeline page. |

## ⬜ Pending (Phase B — later)

| Task | Priority | Notes |
|---|---|---|
| Merge `messages` into the timeline query | Medium | Backend query change — add a `messages` source to `getForScope` with channel-aware rendering. Frontend already supports a `card` kind. |
| Composer attachments | Low | Notes module already supports attached files; wire the file-upload buffer into `TimelineComposer`. Currently a stubbed paperclip icon. |
| `Mark internal` toggle in composer | Low | Currently every comment posted from the timeline is `isInternal: false`. |
| Per-user "mark as seen" | Low | Track per-user last-seen createdAt; show an unread divider in the feed. |
| Filter by date range (calendar slider) | Low | Currently capped at the latest N pages via cursor. Date-range filter would require backend support. |

## Architecture Notes

- **Three visual entry shapes**: `bare` (avatar + inline text), `card` (bordered content), `node` (tiny ring). Backend tags every entry with `_kind` — frontend renderer is a switch.
- **Newest at the bottom + first paint scroll-to-bottom**: matches saas-ui demo + the messages thread pattern. User mental model: latest thing is the unread one.
- **Cursor pagination**: `getForScope` uses `paginationOptsValidator`. First page = 50 entries (default). Top-sentinel `IntersectionObserver` triggers `loadMore`. Visual position preserved via `scrollHeight` delta restoration before/after React commit.
- **Visible cap (255 default)**: only enforced when explicitly set (e.g. dashboard widget). On full pages we let the cursor accumulate.
- **Avatar resolution batched** via `useOrgMemberMap()` from `<OrgProvider>` — no per-entry `useQuery`.
- **Composer = note creation**: comments-on-timeline ARE notes (no `comments` table). The composer is a thin wrapper over `useCreateNote`.

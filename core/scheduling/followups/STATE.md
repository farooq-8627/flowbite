# Follow-ups — State

> Updated: 2026-05-19 (evening — EntityFollowups facade + profile mount)
> Status: 100% Complete (Phase A) — settings, view, panel, form, hooks, route, sidebar nav, reserved slug all shipped. Profile-page mount has now landed via the new `EntityFollowups` facade. **Phase B is deferred** — see "Deferred (intentionally, agreed 2026-05-19)" below.

## 2026-05-19 (evening) — `EntityFollowups` facade

Added `core/scheduling/followups/components/EntityFollowups.tsx`. Same
shape as `EntityTimeline`: callers pass either `{ personCode }` or
`{ entityType, entityId }` and the facade routes to the existing
`FollowUpsPanel` correctly. This gives entity-scoped surfaces (profile,
deal, company, project) ONE named entry point so the discriminated-union
prop shape of `FollowUpsPanel` doesn't have to be threaded across
modules.

Profile page Reminders tab now mounts `<EntityFollowups personCode={...} />`
beside the existing `<RemindersPanel>` (chromeless). New section
registered: `reminders.followups` in `core/platform/profile/config/profile-sections.ts`.

## Conceptual model — locked

Follow-ups are reminders with `source === "followup"`. There is **no** separate
table. The user's question "do we really need both?" is settled:

| Surface | What it is | When users go there |
|---|---|---|
| **Reminders** (`/{orgSlug}/reminders`) | Operational queue. DataTable + Today/Open/Completed tabs. | "What do I need to do today across everything?" |
| **Follow-ups** (`/{orgSlug}/followups`) | CRM cadence lens. Pipedrive-style buckets, priority chip front-and-centre. | "Who am I supposed to be nurturing this week?" |

Same data, two read shapes. The split exists because:
- Sales-cadence users (BD reps) want priority + person-first cards.
- Operational users (CSMs, ops) want a sortable queue with filters.
- The AI distinguishes the two intents (`create_followup` vs `create_reminder`).
- A "Follow-up" badge on the reminders surface was considered and **rejected** —
  the source is already implicit in the surface the user is on, and adding a
  badge to ReminderCard would clutter the operational queue with category
  noise. See "Decisions" #9 below.

## ✅ Completed

| Component | File | Notes |
|---|---|---|
| Backend mutation `createFollowup` | `convex/crm/shared/reminders/mutations.ts` | Dedicated AI-tool entry point. Reads `org.settings.followupDefaults`, logs `followup_created`. |
| Backend queries (3) | `convex/crm/shared/reminders/queries.ts` | `listFollowupsForOrg/Person/Entity`. Indexed via `by_org_and_source_and_due`. |
| Schema additions | `convex/schema/identity.ts` | `org.settings.followupDefaults` block — all optional. |
| Settings mutation validator | `convex/orgs/mutations.ts` | Extended `update` validator + deep-merge handling. |
| OrgSettings TS type | `core/platform/settings/types.ts` | Added `followupDefaults` block. |
| Settings UI | `core/platform/settings/components/groups/crm/FollowupsSection.tsx` | Form with `defaultDueOffsetDays`, `defaultPriority`, `autoCloseAfterDays` (0=disabled). |
| CRMGroup wiring | `core/platform/settings/components/groups/CRMGroup.tsx` | Passes `org` + `orgId` to FollowupsSection. |
| Reserved slug | `convex/_shared/reservedSlugs.ts` | Added `followups`. |
| Sidebar nav entry | `core/shell/shell/config/navigation.ts` | "Follow-ups" entry under Workspace, between Reminders and Notes. CalendarClock icon. |
| Hooks | `core/scheduling/followups/hooks/index.ts` | `useFollowupsForOrg/Person/Entity`, `useCreateFollowup`, `useUpdateFollowup`, `useCompleteFollowup`, `useDeleteFollowup`. |
| Optimistic-update patcher | `core/scheduling/reminders/hooks/useReminderMutations.ts` | Extended to also patch the 3 followup query caches. |
| FollowUpForm | `core/scheduling/followups/components/FollowUpForm.tsx` | Priority chip primary control, "Use default" preset reads org settings. |
| FollowUpCard | `core/scheduling/followups/components/FollowUpCard.tsx` | Person/deal-first layout, priority chip, overdue red edge. |
| FollowUpsPanel | `core/scheduling/followups/panels/FollowUpsPanel.tsx` | Embedded in profile/deal/company tabs. Person OR entity mode. |
| FollowUpsView | `core/scheduling/followups/views/FollowUpsView.tsx` | Pipedrive-style stat row + tabs (All/Overdue/Today/This week/Completed) + bucket cards. |
| App route | `app/[locale]/(private)/[orgSlug]/followups/page.tsx` | Thin wrapper. |
| Bucketing helper | `core/scheduling/followups/lib/followup-buckets.ts` | `bucketFollowups`, `FOLLOWUP_BUCKET_ORDER`, label/color maps. |
| Priority helper | `core/scheduling/followups/lib/followup-priority.ts` | `FOLLOWUP_PRIORITY_VALUES`, label/color/weight maps. |

## ⬜ Deferred (intentionally, agreed 2026-05-19)

Three items were called out by the user and explicitly **deferred** — not
abandoned, but parked until the AI turn / detail-page tab turn arrives.
Tracked here so the next session can pick them up without reverse-engineering
the conversation.

### 1. Mount `FollowUpsPanel` in profile / deal / company detail views — **PARTIAL** (profile done 2026-05-19)

The panel itself is built and works in isolation. **Profile mount has shipped
2026-05-19** via the new `EntityFollowups` facade — the panel now appears
alongside `RemindersPanel` on the person profile Reminders tab. Deal +
company mounts remain.

| Detail view | File | Status |
|---|---|---|
| Person profile (lead OR contact, by `personCode`) | `core/platform/profile/views/ProfileContent.tsx::RemindersGroup` | ✅ DONE 2026-05-19 — `<EntityFollowups personCode={personCode} />` rendered chromeless. |
| Deal detail | `core/entities/_entities/deals/views/DealDetailView.tsx` | ⬜ pending — `<EntityFollowups entityType="deal" entityId={deal.dealCode} defaults={{ personCode: deal.personCode }} />` next to existing `<RemindersPanel ... />` (line ~1015). |
| Company detail | `core/entities/_entities/companies/views/CompanyDetailView.tsx` (currently has no Reminders or Follow-ups panel) | ⬜ pending — Add BOTH `<RemindersPanel personCode={primary?.personCode} />` (if a primary contact exists) and `<EntityFollowups entityType="company" entityId={company.companyCode} defaults={{ personCode: primary?.personCode }} />`. |

Why deferred (deal/company): the detail-view tabs are still being reworked
alongside the timeline + activity feed. Doing it now risks merge churn with
that work. Pick this up immediately after the tabs refactor lands.

### 2. Register `create_followup` AI tool — **HIGH** (next-AI turn)

Backend mutation `convex/crm/shared/reminders/mutations.ts::createFollowup`
exists and is production-ready (RBAC, rate-limit, server-side source stamp,
followup_created activity log, defaults from `org.settings.followupDefaults`).

What's missing: registering it in the AI tool registry so the LLM can call it.
The registry today is a placeholder — `convex/ai/internal.ts` is a stub with a
single `rebuildEntityContext` no-op. The whole tool dispatcher (system prompt,
tool catalog, argument validators, tool router) is **Phase 3** and hasn't been
built.

When Phase 3 starts, add `create_followup` to the tool catalog with this shape:

```ts
{
  name: "create_followup",
  description: "Schedule a follow-up with a person, optionally tied to a deal.",
  args: {
    personCode: string,
    title: string,
    note?: string,
    dueAt?: number,           // ms epoch; omit to use org default offset
    priority?: "low" | "normal" | "high" | "urgent",
    dealCode?: string,
    entityType?: "deal" | "company",
    entityId?: string,
  },
  handler: api.crm.shared.reminders.mutations.createFollowup,
}
```

Pair with the existing `create_reminder` tool (also pending) so the model has
two unambiguous verbs.

Why deferred: no AI tool router exists yet. Adding `create_followup` in
isolation has nothing to register against.

### 3. Auto-close stale follow-ups (cron) — **MEDIUM** (Phase B feature)

The setting `org.settings.followupDefaults.autoCloseAfterDays` is in the
schema and the settings UI form. Today it's read but not enforced — no cron
flips past-due follow-ups to `completed`.

When implemented:
- Add an `internalMutation` in `convex/crm/shared/reminders/mutations.ts`
  (e.g. `autoCloseStaleFollowups`) that paginates over orgs, reads
  `org.settings.followupDefaults.autoCloseAfterDays`, then for each org reads
  pending follow-ups via `by_org_and_source_and_due` index where
  `dueAt < (now - autoCloseAfterDays * 86_400_000)` and patches them to
  `status: "completed"` with `completedBy: <system user>` and an activity log
  entry `followup_auto_closed`.
- Register in `convex/crons.ts` via `crons.interval("auto-close-stale-followups", { hours: 24 }, internal.crm.shared.reminders.mutations.autoCloseStaleFollowups, {})`.
- Add an integration test that seeds a follow-up dated 31 days ago in an org
  with `autoCloseAfterDays: 30`, runs the cron, asserts the row flipped to
  completed.

Why deferred: this is a Phase B convenience feature. The Phase A surface
(view + panel + form + AI tool) is the priority. Auto-close is "nice to have"
once active orgs have weeks of follow-up history to need it.

## ⬜ Pending (Phase B nice-to-haves, not yet planned)

| Task | Priority | Notes |
|---|---|---|
| `requireDealCode` setting | low | Enforce deal-code requirement at creation time for industries that need it. |
| `cadencePresets` setting | low | Org-customisable preset chips on the form. |
| `notifyAssignee` toggle | low | Currently always notifies — make this configurable. |
| Calendar chip color verification | low | Follow-ups merge into the calendar via `source === "followup"`. Spot-check the chip color is distinct from generic reminders. |

## Architecture Notes

- **Combined-table doctrine:** see CODE-ARCHITECTURE-TIMELINE-FOLLOWUPS.md
  §1. The `reminders` table is the SSOT. `source` is the closed-union
  discriminator. The schema migration that locked this doctrine
  (`tightenReminderSourceAndAddPriority`) ships separately.
- **Two AI tools, one mutation:** `create_reminder` → `reminders.create`,
  `create_followup` → `reminders.createFollowup`. The model picks one;
  the source literal is server-stamped per tool.
- **Optimistic-update sharing:** `useReminderMutations.ts` is the single
  cache patcher across both surfaces. A `complete` from the followups
  panel updates the reminders queue instantly and vice versa.
- **No `Element.scrollIntoView`** in any of the new views (per AGENTS.md
  "nested scroll containers" rule). The view is a single scroll
  container; sections are stacked.
- **RTL-safe** — all components use `ms-*`/`me-*`/`ps-*`/`pe-*` and
  `start-*`/`end-*` directional properties.
- **Dynamic radius** — every card and chip uses `rounded-[var(--radius)]`
  except the priority dot indicators (intentionally `rounded-full`).

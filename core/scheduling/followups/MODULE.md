# Follow-ups Module

> **Doctrine (locked 2026-05-19):** Follow-ups are reminders with
> `source === "followup"`. There is no separate `followUps` table.
> See `CODE-ARCHITECTURE-TIMELINE-FOLLOWUPS.md` for the full architecture.

## Why a separate module folder

Although follow-ups share the `reminders` table, they're a distinct UX
surface (CRM cadence lens) with their own form opinions (priority chip
front-and-centre, "Use default" preset from org settings, "Create
follow-up" submit label) and their own bucket layout (Pipedrive-style
Today / Overdue / This week / Later / Completed).

Keeping the module separate lets us:

- Iterate on the cadence UX without touching the reminders queue.
- Expose distinct AI tools (`create_followup` vs `create_reminder`) with
  different arg schemas.
- Maintain different empty states + onboarding copy.

The two modules SHARE the persistence layer:
- `convex/crm/shared/reminders/{queries,mutations}.ts` is the only
  Convex code path. We added `createFollowup` and three list queries
  (`listFollowupsForOrg/Person/Entity`) inside that file rather than
  forking it.
- `useReminderMutations.ts` patches the followup query caches too, so
  optimistic updates flow through one cache layer.

## Owned tables / data sources

| Source | Purpose |
|---|---|
| `reminders` (existing) | Filtered to `source === "followup"`. Index used: `by_org_and_source_and_due`. |

## Owned routes

| Route | View |
|---|---|
| `/{orgSlug}/followups` | `views/FollowUpsView.tsx` (org-wide cadence lens) |

## Owned settings

| Setting | Default | Purpose |
|---|---|---|
| `org.settings.followupDefaults.defaultDueOffsetDays` | 3 | When the user clicks "Follow up" without a date, default to today + N days. |
| `org.settings.followupDefaults.defaultPriority` | "normal" | Default priority chip on a new follow-up. |
| `org.settings.followupDefaults.autoCloseAfterDays` | undefined (off) | Phase B: auto-mark a follow-up completed if it sits past-due for N days. |

Settings UI: `core/platform/settings/components/groups/notes/FollowupsSection.tsx`
(rendered under Settings → CRM → Follow-ups).

## Layers

| Layer | Component | Purpose |
|---|---|---|
| `views/` | `FollowUpsView` | Org-wide cadence lens — stat row, tabs, bucketed cards |
| `panels/` | `FollowUpsPanel` | Embedded in profile / deal / company tabs |
| `components/` | `FollowUpForm` | Drawer for create + edit (priority-first) |
| `components/` | `FollowUpCard` | Compact card emphasising person/deal + priority |
| `hooks/` | `useFollowupsForOrg/Person/Entity`, `useCreateFollowup`, `useUpdateFollowup`, `useCompleteFollowup`, `useDeleteFollowup` | Convex bindings |
| `lib/` | `followup-buckets`, `followup-priority` | Pure helpers |

## AI tool contract

The AI registry exposes two tools that map to two backend mutations:

| AI tool | Backend mutation | Source literal | Activity verb |
|---|---|---|---|
| `create_reminder` | `reminders.create` | "manual" / "ai" | `reminder_created` |
| `create_followup` | `reminders.createFollowup` | "followup" | `followup_created` |

This eliminates the AI-tool ambiguity that the combined-table approach
otherwise risks. The model picks one tool unambiguously based on the
user's intent.

## Decisions

| # | Decision | Outcome |
|---|---|---|
| 1 | **Combined table (reminders), separate UI module.** | Production-grade — see CODE-ARCHITECTURE-TIMELINE-FOLLOWUPS.md §1 + the conversation that locked this decision (2026-05-19). |
| 2 | **Pipedrive-style 5-bucket layout** (Today / Overdue / This week / Later / Completed). | Matches sales-cadence mental model better than the reminders' 4-state palette. |
| 3 | **Cards, not a DataTable.** | The cadence surface is read-skim; cards let priority chip + person code dominate. The reminders surface keeps the DataTable for operational queue use. |
| 4 | **Priority chip is a primary control on the form.** | Sets the chip on every card and drives sort weight. |
| 5 | **"Use default" preset chip on the form.** | Reflects `org.settings.followupDefaults.defaultDueOffsetDays`. Owner-set cadence is one click away. |
| 6 | **`createFollowup` = dedicated mutation.** | Reads org settings server-side, sets source = followup, logs `followup_created`. The form / AI tool can't bypass these guarantees. |
| 7 | **Optimistic-update cache shared with reminders.** | `useReminderMutations.ts` patches both reminder and followup caches in one wrapper. Drag/complete/delete on either surface updates the other instantly. |
| 8 | **No new schema.** | All three settings + the priority field landed via the 2026-05-19 schema migration that ships with the doctrine. |
| 9 | **No "Follow-up" badge on `ReminderCard`.** Considered + rejected 2026-05-19. | The Reminders surface is the operational queue; the Follow-ups surface is the cadence lens. Surface IS the discriminator — a user who is on `/reminders` already knows everything in front of them is a reminder, regardless of `source`. Adding a badge would clutter the queue with category noise without helping any task. The user can still see follow-ups in the queue (they're real reminders) but the queue is focused on **what's due**, not **what kind**. If future research shows users WANT this distinction, revisit — but ship the simpler queue first. |

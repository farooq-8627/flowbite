# Profile — State

> Updated: 2026-05-19 (round 4 — card fields fix + height revert + header restructure)
> Status: Profile shell, single-board people list (cards now render full content), structured OverviewCard with left/right header split, real deals tab, AI briefing stub. Messages/Timeline height uses the original `h-[calc(100vh-7rem)]` that keeps tabs+composer pinned.

## 2026-05-19 round 4 — what changed

| Change | File |
|---|---|
| **Profile board cards now render full content** — added `PROFILE_CARD_FIELDS` constant (`[displayName, email, tags, personCode, assignedTo, aiSummary]`) and passed it as `cardFields` to both `LeadCard` and `EntityCard` in `ProfilesView.renderCard`. Without `cardFields`, EntityCard's `effectiveFields` was empty → nothing rendered. | `core/platform/profile/views/ProfilesView.tsx` |
| **Messages/Timeline height reverted** — restored `h-[calc(100vh-7rem)] min-h-[26rem]` on ProfileSection fillHeight and `max-w-full space-y-6` on ShellLayout main inner. The previous flex-1 approach broke the tabs-on-top/composer-on-bottom/middle-scrolls contract. | `core/platform/profile/views/ProfileSection.tsx`, `core/shell/shared/layouts/ShellLayout.tsx` |
| **OverviewCard header restructured** — Left side: avatar + name + code + role + status pill + tags + source pill. Right side (stacked vertically, aligned end): created-by pill, email pill, phone pill. Owner pill removed entirely. | `core/platform/profile/components/OverviewCard.tsx` |

## 2026-05-19 round 3 — what changed

| Change | File |
|---|---|
| **OverviewCard redesign** — proper card structure: avatar+name+code+role in header, status pill (replaces dot) + source pill, second row with tags + owner + created-by + email + phone (titles removed; tooltips on hover only). Body is a 3-column grid of mini-cards: Latest messages with avatars, Open follow-ups (status=pending source=followup), Open reminders (status=pending source!=followup). Bottom row is a Deals mini-card with stage badges + values. | `core/platform/profile/components/OverviewCard.tsx` |
| **`getByPersonCode` returns `createdBy`** — reads first activity log with `action === "created"` and resolves the user (name/email/avatarUrl). Powers the "Created by" pill on the OverviewCard without a second round-trip. | `convex/crm/people/queries.ts` |
| **Messages/Timeline bottom-gap fix** — replaced `h-[calc(100vh-7rem)]` magic number with proper flex chain. ShellLayout main inner is now `flex min-h-full max-w-full flex-col space-y-6`; ProfileSection `fillHeight` uses `flex flex-1 min-h-[26rem] min-h-0 flex-col`. Messages and Timeline now fill the available main height on every viewport, no fixed offset. | `core/shell/shared/layouts/ShellLayout.tsx`, `core/platform/profile/views/ProfileSection.tsx` |
| **Real Deals tab** — `PersonDealsList` component reads `api.crm.entities.deals.queries.listByPersonCode` (limit 50) and renders all linked deals as a table with code+title+stage+value, each row a link to the deal detail page. Replaces the previous "coming soon" placeholder. | `core/platform/profile/views/ProfileContent.tsx` |
| **AI Briefing stub** — `AiBriefingBlock` reads `aiContext.summary` and `aiContext.keyFacts` off the lead/contact row. When present: renders a sparkles-prefixed paragraph + bullet list. When absent: friendly muted "no briefing yet" message. Phase 3 will add the refresh button and streaming AI tool; the data shape is already correct. | `core/platform/profile/views/ProfileContent.tsx` |
| **Files duplicate row removed** — EntityFilesPanel previously stacked `<FileUpload>` (which has its own internal `<FileList>` from `useFileAttachments.listByScope`) on top of a separate merged `<FileList>` from `listForEntity`. Direct-scope files appeared twice — once with trash, once without. Now: dropzone alone (`<FileDropzone>`) + single merged `<FileList>` wired to `useFileAttachments.remove`, so every row has a trash icon and there are no duplicates. | `core/entities/shared/components/EntityFilesPanel.tsx` |
| **DealDetailView gets Timeline + Follow-ups** — added two new tabs (Timeline, Follow-ups) using `<EntityTimeline entityType="deal">` and `<EntityFollowups entityType="deal">`. Overview tab gets two embedded summary cards (Recent activity + Open follow-ups) with `View all` links that switch tabs. | `core/entities/_entities/deals/views/DealDetailView.tsx` |
| **CompanyDetailView gets Timeline + Follow-ups** — added the same two new tabs and matching summary cards (passes `entityType="company"` + `entityId=company.companyCode`, no `personCode` since companies don't have a primary person). | `core/entities/_entities/companies/views/CompaniesView.tsx` |

## Why these changes (verbatim user feedback 2026-05-19)

> "see lead and contact cards are showing nothing … I want the exact card along with those functionalities to work in profiles page cards as well … overview is not at all nice. You have just added rows of each type thats it without any visual card type design I want a perfect design as a card not like this. see lead card is well structured i want this card also structured properly. See the owner, tag, and contact info i.e email and phone can be placed in the header so these are consistent did you got it. … remove the titles for them saying owner tag like that just show and when hovered show the tooltip would be more efficient … what is the dot present on header right side why to use dot when we have this much space please use the pill and show complete information i.e the state and source everything. … Instead of full width simple lines i want cards for each see for messages i need latest 3-4 messages that too with the avatar who has sent or received did you got it. … make the followups and reminders same card type properly please and that too boths separate and they get showed when anything in active only. … Keep all these 3 cards in same row did you got it. for efficient space handling … for deals also create a card that efficiently shows the deal latest stage and something which is important. … The messages, timeline are not taking full height there is some gap on bottom of the container … In files there are duplicates. see one set with trash icon and another without trash icon can you please remove the duplicate which dont have trash icon."

## OverviewCard contract (post-redesign)

`<OverviewCard personCode>` (full embedded, default) or
`<OverviewCard personCode compact />` (no outer Card chrome — for hover
popovers).

**Layout sections (full mode)**:
1. Header — avatar + display name + personCode + role (lead/contact) + status pill + source pill
2. Pills row — tags + owner pill + created-by pill + email pill + phone pill (no labels; all reveal on hover via `<Tooltip>`)
3. 3-column grid (`lg:grid-cols-3`):
   - Latest messages (with avatars; uses `useOrgMembers` to resolve sender)
   - Open follow-ups (filtered to `status === "pending"` AND `source === "followup"`)
   - Open reminders (filtered to `status === "pending"` AND `source !== "followup"`)
4. Deals mini-card — `dealCode` + title + stage badge (color-coded via `getStatusColor("deal", stageId)`) + compact currency

**Empty states**: each mini-card collapses to a single muted line so the grid stays uniform. "View all" link in each card deep-links to the corresponding profile tab via the `#section-id` hash.

## ✅ Completed (full snapshot)

| Component | File | Notes |
|---|---|---|
| Groups + sections config | `core/platform/profile/config/profile-sections.ts` | 8 groups × 9 sections |
| ProfileDetailView | `core/platform/profile/views/ProfileDetailView.tsx` | Thin ShellLayout wrapper |
| ProfileContent dispatcher | `core/platform/profile/views/ProfileContent.tsx` | Per-tab card rules; AI briefing + real deals list now wired |
| ProfileSection | `core/platform/profile/views/ProfileSection.tsx` | `chromeless` + `fillHeight` (now flex-1 min-h-0, no magic number) |
| OverviewCard | `core/platform/profile/components/OverviewCard.tsx` | Structured redesign with 3 sub-cards + deals mini-card |
| ProfilesView | `core/platform/profile/views/ProfilesView.tsx` | Single-board people list |
| App routes | `app/[locale]/(private)/[orgSlug]/profile/page.tsx`, `app/.../profile/[personCode]/page.tsx` | Thin wrappers |

## ⬜ Pending

| Task | Priority |
|---|---|
| Phase 3: streaming AI briefing with refresh button | HIGH (Phase 3) |
| Add Company link + linked company panel inside OverviewCard (currently shown only via TagsCell-adjacent owner row) | MEDIUM |
| Persist OverviewCard pill ordering as a per-user preference once we ship the dynamic pill picker | LOW |
| `OverviewCard` skeleton state instead of "Loading…" text | LOW |

## Architecture Notes (2026-05-19)

### All-profiles tab routing

- `/profile` is the unified people page. It hosts a tab toggle (Leads | Contacts).
- We mount `<LeadsView>` and `<ContactsView>` directly — NOT a custom merged view. This guarantees feature parity (cards, view-options, group-by, search, tour) automatically.
- Only one view is mounted at a time so we don't pay for two parallel `useQuery` subscriptions on hidden boards.
- Tab choice persists in `localStorage` keyed by orgSlug.

### Chromeless ProfileSection

- A "chromeless" section drops the outer `<Card>` chrome but **keeps** registration with the shell's search-filter context. The topnav pill highlight + Fuse search still work because `id` is rendered on the outer wrapper.
- Used for: Messages, Timeline, Notes-entries, Reminders, Reminders-Followups, Calendar.
- NOT used for: Files (explicit user request to keep the card), AI Briefing (small block — looks odd without a card), Overview rows (they ARE small named blocks).

### Reusable EntityTimeline + EntityFollowups

- Mounted on the profile page Timeline tab + Reminders tab.
- These are facade components that route to the right scope — `personCode` for profile, `entityType+entityId` for deal/company/project.
- Same components are intended for deal/company/project detail tabs in a follow-up slice.

### Shell reused, identical pattern to Settings

- Same breakpoints (`xl:flex` rail, `xl:hidden` inline toolbar), same mobile sheet, same Fuse search, same scroll-without-layout-shift.
- Permission rules live in `PROFILE_GROUPS` + `PROFILE_SECTIONS`. `deals.view` gates Deals; `reminders.view` gates Reminders + Followups.
- Internal-notes-only visibility is NOT a shell-level gate — it belongs inside the individual tab.
- Entity-labelled sections are dynamic — `OverviewGroup` "Company" + `DealsGroup` "Deals" titles read from `useEntityLabels()`.

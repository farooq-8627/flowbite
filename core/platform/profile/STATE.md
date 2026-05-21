# Profile — State

> Updated: 2026-05-22 (DealDetailShell — selector + tabbed shell replaces PersonDealCard; old card deleted)
> Status: 100% Complete

## 2026-05-22 — Deals tab: selector + tabbed shell (mirrors Company detail layout)

The previous `Profile → Deals` tab rendered a list of `<PersonDealCard>`
instances (one expanded card per deal). The new design — explicitly
requested — mirrors the `<CompanyDetailView>` shell: one selector at the
top, one tabbed view below, switch deals by clicking the selector chip.

**What changed:**

| File | Change |
|---|---|
| `core/platform/profile/components/DealDetailShell.tsx` | NEW. 757-line component containing: <ul><li>`DealSelectorStrip` — chip-strip selector (visible only when ≥2 deals; same visual pattern as `DealPipelineTabs` — `bg-primary/10 text-primary` for active, `text-muted-foreground hover:bg-muted/60` for idle). Title is truncated to 16 chars, dealCode shown alongside as a font-mono pill.</li><li>`DealDetailCard` — sticky header (avatar + title + code pill + value + updated-rel + stage badge + assignee tooltip avatar) plus a horizontally-scrollable tab strip with 5 tabs.</li><li>`DealOverviewTab` — Vitals card (code, stage, value, owner, expected close, won/lost dates) + tags, Stage-aware fields card (every visible field pinned to the deal's CURRENT stage OR the pipeline's Default stage; raw `userId` / `stageId` resolved to display names BEFORE the renderer runs via `memberNameMap` + `stageNameMap`), and a recent-activity preview at the bottom.</li><li>Files tab uses `<EntityFilesPanel entityType="deal" entityId={deal.dealCode}>` — already renders previewable image/video tiles → click → `MediaViewerModal` lightbox; documents render as download rows. Zero per-page custom code.</li><li>Timeline / Follow-ups / Calendar tabs reuse `EntityTimeline` / `EntityFollowups` / `EntityCalendarPanel` with `entityType="deal"`.</li></ul> |
| `core/platform/profile/components/PersonDealCard.tsx` | **DELETED.** Replaced by `DealDetailShell`. |
| `core/platform/profile/views/ProfileContent.tsx` | `<PersonDealsList>` deleted. `DealsGroup` renders `<DealDetailShell personCode={personCode} />`. Dropped now-unused imports (`useDealPipelines`, `useEntityFields`, `useEntityFieldValuesMap`, `PersonDealCard`). |

### Behaviour notes

- **Active deal selection** is local state on the shell — defaults to the
  first deal when the list arrives, kept in sync if the previous selection
  gets soft-deleted (resets to first), otherwise sticks across re-renders.
- **Switching deals resets the active tab to "Overview"** — Files of one
  deal don't apply to the next.
- **No per-deal `useQuery` fanout** — Pipeline + field defs + custom
  values are still fetched ONCE at the page level (via the same hooks
  the kanban uses). Each tab consumes the slice it needs.
- **Mobile-first** — selector + tab strip both have `overflow-x-auto
  scrollbar-none` so they scroll horizontally on phone widths. Header
  right cluster wraps to its own row on `<sm` (`basis-full sm:basis-auto`).

Cross-reference: `core/entities/STATE.md` 2026-05-22 — paired with the
Company detail tabs for consistent mental model.

---

> **Earlier history:**

> Updated: 2026-05-22 (Deals tab — mobile responsiveness fix; raw IDs resolved before render)
> Status: 100% Complete

## 2026-05-22 — Deals tab mobile responsiveness fix

The `Profile → Deals` tab on a phone (≤sm width) was clipping values:
`AED 300,000` → `A…`, `assignedTo` displayed the raw `userId`,
`currentStageId` displayed the raw `stageId`. Reported via screenshot.

**What changed in `core/platform/profile/components/PersonDealCard.tsx`:**

| Concern | Fix |
|---|---|
| Field-row clipping | `<DealFieldRow>` now stacks label-above-value on `<sm`, side-by-side on `≥sm`. Drops the previous `max-w-[60%] truncate` cap on the value column. Values use `break-words` so long strings wrap instead of overflowing. |
| Raw `userId` in `assignedTo` | The parent (`PersonDealCard`) builds `memberNameMap = Map<userId, displayName>` from `useOrgMemberMap()` and forwards it through `<StageFieldBlock>` to every row. The row substitutes the name BEFORE `<FieldValueRenderer>` runs. |
| Raw `stageId` in `currentStageId` | Same pattern — `stageNameMap = Map<stageId, stageName>` derived from the deal's pipeline `sortedStages`. |
| Header overflow on mobile | The right cluster (stage chip + assignee avatar) now wraps to its own row at `<sm` via `basis-full sm:basis-auto`. |
| Stage progress strip | Added `pe-4` and a right-edge `mask-image` linear-gradient fade so it's clear there's more content to scroll. |

No new queries, no new subscriptions, no per-card fanout — both maps are
derived once at the parent level and forwarded down via props.

Cross-reference: `core/entities/STATE.md` 2026-05-22 — full audit.

---

> **Earlier history:**

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


## Update — 2026-05-22 — PersonDealCard redesign + per-stage files

PersonDealCard was reworked end-to-end:

- **Header** now wraps cleanly on phones — avatar (deal initials in stage colour) + title + dealCode pill on the left, stage chip + assignee avatar on the right. No more stale "Stage code" pill — the chip says `Stage N · Name` (1-based index of the pipeline stage).
- **Currency** uses `useOrgDefaultCurrency(orgId)` always; the legacy `deal.currency ?? "USD"` fallback was a bug — workspaces set to AED were briefly flashing USD.
- **Assignee** is shown as an avatar with hover-tooltip "Assigned to ..." instead of an inline "Assigned to ..." text — more scannable, mobile-friendly.
- **Updated time** is the dedicated last line of the header — "Updated 2d ago".
- **Stage progress strip** now uses numbered chips (1, 2, 3, …).
- **Per-stage files**: every stage section now lists files attached at that stage. We bucket `listForEntity` results by `fieldKey`, look up the field's `showInStages`, and render under each owning stage. Free-form (no fieldKey) attachments fall back to a "Free attachments" group at the bottom.
- **Mobile**: the field grid stays single-column up through the lg breakpoint (`grid-cols-1 lg:grid-cols-2`) so phones AND small tablets get a clean stacked layout.


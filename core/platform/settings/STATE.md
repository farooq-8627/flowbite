# Settings — State

> Updated: 2026-05-20 (Default stage + settings redesign session) 2026-05-17
> Status: ~94% Complete — dynamic entity labels wired through every settings group; Module Visibility shipped; **Note Categories editor shipped**; **CRM group absorbed Notes/Reminders/Follow-ups/Timeline** (Notes top-level group removed).

## ✅ Completed

| Component | File | Notes |
|---|---|---|
| Main view | `views/SettingsView.tsx` | Thin wrapper; now calls `useEntityLabels(orgId)` and passes dynamic sections to `ShellLayout` |
| Group dispatcher | `components/SettingsContent.tsx` | Pure switch |
| Shared primitives | `components/shared/{SettingsSection, SettingsRow, SettingsFormRow, SettingsSaveButton, DangerZone, FloatingLabelInput}.tsx` | |
| Hooks | `hooks/useSettingsForm.ts` | Typed narrow `any`s explained in file header |
| **WorkspaceGroup** | `components/groups/WorkspaceGroup.tsx` | ✅ Entity Labels row label + description **dynamic** (rename "Lead" → "Inquiry" flows in instantly). ✅ New `ModuleVisibilitySection` with per-entity Switches patching `settings.modules[].hidden`. CodePrefixes row labels also dynamic. |
| TeamGroup | `components/groups/TeamGroup.tsx` | ✅ InviteMemberDialog pulls role names + descriptions from `api.orgRoles.queries.list`, filtered to the three system roles the backend validator accepts. `INVITE_SYSTEM_ROLE_NAMES` lives at module scope. |
| RoleEditor | `components/groups/team/RoleEditor.tsx` | ✅ PermissionMatrix calls `useEntityLabels()` + `getPermissionModules(labels)` — every permission label follows the workspace's renamed entities. Labels bind to checkboxes via htmlFor. |
| permissions-catalog | `config/permissions-catalog.ts` | ✅ Exports `getPermissionModules(labels)` factory. Static `PERMISSION_MODULES` kept as English-default fallback. |
| settings-sections | `config/settings-sections.ts` | ✅ Exports `getSettingsSections(labels)` factory. Adds `workspace.modules` entry. Descriptions + keywords interpolate current labels so search matches both the English defaults AND the renamed terms. |
| CRMGroup | `components/groups/CRMGroup.tsx` | ✅ Rewritten 2026-05-17 to absorb the deleted top-level Notes group: thin tabs at top → Tags / Notes / Reminders / Follow-ups / Timeline. Each tab renders one section (id prefixed `notes.*` for cross-cutting concerns to keep deep-links + search keywords stable). Wires `shell:section-active` / `shell:section-requested` like `ModulesGroup`. Tags extracted to `crm/TagsSection.tsx`. |
| TagsSection (CRM) | `components/groups/crm/TagsSection.tsx` | ✅ Extracted from old `CRMGroup.tsx`. Description still reflects the workspace's renamed entity labels (e.g. "inquiries, clients, and opportunities"). |
| **NoteCategoriesSection** *(new 2026-05-17)* | `components/groups/crm/NoteCategoriesSection.tsx` | Owners/admins manage the org's sticky-note categories — create / rename / recolour / archive / set default / reorder via chevrons. Permission gate: `notes.categories.manage`. Dynamic text-color override (auto-derived from luminance unless set). |
| AIGroup | `components/groups/AIGroup.tsx` | Context + usage |
| AppearanceGroup | `components/groups/AppearanceGroup.tsx` | Theme + layout cookies |
| NotificationsGroup | `components/groups/NotificationsGroup.tsx` | ✅ CRM group description accepts a `(labels) => string` function; all item labels already dynamic via the existing `label: (l) => ...` shape. |
| ShortcutsGroup | `components/groups/ShortcutsGroup.tsx` | ✅ Navigation shortcuts use labels ("Go to Leads" → "Go to Inquiries"). |
| BillingGroup | `components/groups/BillingGroup.tsx` | UI only, no LS yet |
| DataGroup | `components/groups/DataGroup.tsx` | ✅ DeleteWorkspaceDialog warning lists entities with their current labels. Export select already dynamic. |
| App page wrapper | `app/[locale]/(private)/[orgSlug]/settings/page.tsx` | Thin wrapper |

## ⬜ Pending

| Task | Priority |
|---|---|
| WorkspaceGroup: logo upload (Convex `_storage`) | MEDIUM |
| WorkspaceGroup: drag-reorder of modules (`settings.modules[].order`) | MEDIUM |
| PipelineEditor: stale color + warning threshold per stage | MEDIUM |
| FieldEditor: drag-reorder + `showInStages` scoping | MEDIUM |
| BillingGroup: LemonSqueezy checkout + usage meters | HIGH |
| DataGroup > Export: wire Trigger.dev CSV/JSON job | MEDIUM |
| Code prefix rename background job (Trigger.dev) | LOW |
| Mobile < 640px: sub-group toolbar → accordion | LOW |

## Architecture Notes (this session — 2026-05-12)

- **Dynamic labels, one hook, zero hardcoding.** Every user-visible label that refers to a CRM entity (Lead / Contact / Deal / Company) now flows from `useEntityLabels()` — either directly via the hook or indirectly via factories that take a `labels` arg (`getPermissionModules`, `getSettingsSections`). Static exports (`PERMISSION_MODULES`, `SETTINGS_SECTIONS`) stay as English-default fallbacks for compatibility and SSR/test callers; they are marked deprecated in source comments.
- **Hide/show entities — UI shipped.** New `ModuleVisibilitySection` in `WorkspaceGroup` renders a Switch per entity slot, reading `org.settings.modules[].hidden` and calling `api.orgs.mutations.update` with a read-modify-write of the modules array. The sidebar already filters hidden modules (`AppSidebar`), so flipping a switch immediately removes the entity from the left rail.
- **Reactivity is end-to-end.** Rename "Lead" → "Inquiry" (or hide Companies) in Settings → Workspace. The `update` mutation patches `orgs.entityLabels` / `orgs.settings.modules`. `useEntityLabels()` subscribes to `api.orgs.queries.getEntityLabels`, so every consumer — sidebar, topnav, role editor, notifications, permissions, settings section descriptions, profile tabs, dashboard metric cards — re-renders within milliseconds, matching the "type-to-preview" feedback loop the user asked for (same UX as the Record Codes prefix preview).
- **Invite member roles now reflect the DB.** Backend invitation validator is still locked to `admin | member | viewer` (schema constraint), but the dialog's item copy (name + description) is pulled from the actual `orgRoles` rows so admins see whatever they saved.
- **Search keywords inherit both spellings.** `getSettingsSections(labels)` seeds keywords with *both* the English defaults and the current renamed terms, so Fuse still finds "leads" for muscle-memory while also matching "inquiries" after a rename.
- **Permission keys did NOT change.** The backend contract (`leads.view`, `contacts.create`, etc.) is preserved. Only the UI strings follow the workspace's renames.
- **Biome config is targeted, not a blanket disable.** Overrides in `biome.json` exempt only the cases where the rule is architecturally wrong for the file (shadcn-gen UI, logger utility, test fixtures, CSS theme enforcement) — with clear scope comments in the source. All our own code is lint-clean without suppressions except where truly necessary (Kanban primitive generic slot, react-hook-form/zod bridge).

## Architecture Notes (2026-05-17 — CRM absorbs Notes group)

- **One settings group for cross-cutting CRM concerns.** The standalone "Notes" group was removed; its four sub-sections (Note Categories, Reminder Defaults, Follow-up Defaults, Timeline Display) were folded into the existing **CRM** group as additional tabs alongside Tags. CRMGroup now uses the same `nuqs ?tab=…` + thin-button-row pattern as `ModulesGroup` and the old `NotesGroup`, so the visual + URL contracts are identical.
- **Section ids are NOT renamed.** The folded sections keep their `notes.*` prefix (`notes.categories`, `notes.reminders`, `notes.followups`, `notes.timeline`). Only the **`groupId`** in `settings-sections.ts` flipped from `"notes"` to `"crm"`. Reasoning: deep-links (`/settings?group=notes` → user bookmarks), the topnav sub-group pill highlight (`shell:section-active` event payload), and search-index keywords all reference these ids — renaming them would break those without adding any value. The historical prefix is now just a stable identity, not a group label.
- **`SettingsGroupId` lost `"notes"`.** Anyone navigating to `?group=notes` now falls through to `DEFAULT_GROUP` ("workspace"). The settings-search and topnav hide the group entry entirely. No backend implications — this is pure UI taxonomy.
- **`NotesGroup.tsx` deleted; `TagsSection` extracted.** The CRMGroup file was getting too dense (Tags inline + Note tabs + Reminders + …), so Tags now lives at `groups/crm/TagsSection.tsx` and CRMGroup is purely a tab-dispatcher. Each `notes.*` sub-section file under `groups/notes/` was untouched — they import their `id`s from the section registry, not from the group, so moving them under CRM was a one-line `groupId` change.
- **Notes view: icon-toggle, not text tabs.** `NotesView.tsx`'s "Category | Board" text-pill (`NotesViewTabs`) was replaced with a two-icon pill (`NotesViewToggle`: `Columns3Icon` for Category, `LayoutGridIcon` for Board), styled identically to the shared `ViewToggleIcons` widget. The shared `ViewToggleIcons` is hidden on this page by passing `views={[]}` to `EntityPageLayout` — `EntityPageLayout` was updated to skip rendering the view-toggle when `views.length === 0`, so other consumers are unaffected.


## Update — 2026-05-22 — File restrictions move from workspace to per-field

The "Workspace → File Policy" section was removed. File restrictions are now declared per field at field-creation time:

- `fieldDefinitions.allowedFileTypes` (new, optional) — array of FILE_CATEGORIES ids (`image`, `pdf`, `document`, `spreadsheet`, `video`, `audio`, `archive`).
- The selector appears in CreateFieldDialog, EditFieldDialog, and StageScopedEditFieldDialog only when the field type is `file` / `files`.
- `convex/files/mutations.ts::record` looks up the field def by `fieldKey` and validates against its `allowedFileTypes`. Free-form drop-zones (no fieldKey) skip mime validation by design.
- `org.settings.fileUpload.maxSizeMb` is still enforced server-side as a hard cap (default 25 MB) but no longer has a UI knob — set once per template.
- `org.settings.fileUpload.allowedMimeCategories` remains in the schema for backwards compat but is **no longer enforced**. Templates still seed it for new orgs; the field is harmless but ignored.

Card / shell sizing pass:

- `SettingsSection` now applies `min-w-0 max-w-full` on Card, CardHeader, CardContent + `break-words text-balance` on description so long sentences wrap instead of pushing the card past viewport.
- `RolesSection` table wrapper has `-mx-2 ... overflow-x-auto px-2` on phones so the table scrolls horizontally _within its card_ instead of inflating the card. Description column truncates to `line-clamp-2 max-w-[20rem]`.
- `ShellLayout`'s `<main>` keeps `overflow-x-hidden` to prevent horizontal page-level scroll, but the inner `<div>` now adds mobile padding (`px-3 pb-6 pt-1`) so cards don't kiss the viewport edges and the spacing between sections is tighter on small screens (`space-y-4 sm:space-y-6`).



## Update — 2026-05-24 — Settings folder restructure to match UI groups + AI sections rebuilt

The settings folder structure now matches the UI tree 1:1 — finding the file behind a UI element is a single guess.

Moves:

- `groups/notes/{NoteCategoriesSection,RemindersSection,FollowupsSection,TimelineSection}` → `groups/crm/*`. The `groups/notes/` folder is deleted. These were always rendered inside the CRM tab; living in their own folder created a confusing mismatch between the UI taxonomy and disk.
- `groups/crm/{PipelineEditor,StageFieldsTable,StageScopedEditFieldDialog}` → `groups/pipelines/*` (new folder). These belong to the **Pipelines** settings group, not CRM.
- `groups/crm/{CreateFieldDialog,EditFieldDialog,SortableFieldsTable,FieldEditor}` → `groups/modules/*`. These are per-entity field-definition editors — they're consumed by `groups/modules/SlotFieldsSection.tsx` which now imports them as siblings.

Imports updated atomically: 6 files re-pointed (CRMGroup, PipelinesGroup, SlotFieldsSection, SlotPipelinesSection, StageFieldsTable, StageScopedEditFieldDialog) + 2 stale doc paths fixed (followups STATE.md + MODULE.md).

AI section rebuilt under the same restructure:

- New **AI Memory** section (`groups/ai/AIMemorySection.tsx`) — read-only summary + keyFacts the agent has learned about the workspace + the user; per-scope "Forget all" with a confirm dialog. Workspace forget gated on `org.manage`; user forget always-on. Identity blob is preserved (called out in copy).
- New **AI Usage** section (`groups/ai/AIUsageSection.tsx`) — replaces the prior 0/0 placeholder. Plan-limit gauge with red flash at 100%, range tabs (7d/30d/90d), 4-stat strip (chat turns / tool calls / cost / error rate), daily token sparkline, top-5 tools + top-5 models tables. All driven by the new `api.ai.queries.telemetry.getOrgUsage` rollup.
- **Billing → Plan limits** AI tokens UsageBar wired to the same query — one source of truth across both surfaces.
- AI subnav (`config/settings-nav.ts`) expanded to **Business Context / Memory / Usage** (dropped the never-implemented "AI Features" toggle).

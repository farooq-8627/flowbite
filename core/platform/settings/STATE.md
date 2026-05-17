# Settings — State

> Updated: 2026-05-17
> Status: ~93% Complete — dynamic entity labels wired through every settings group; Module Visibility shipped; **Note Categories editor shipped**.

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
| CRMGroup | `components/groups/CRMGroup.tsx` | Tabs + Tags description already dynamic. Keydown handler refactored to block statement (no comma operator). Now mounts `NoteCategoriesSection`. |
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

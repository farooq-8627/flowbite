# Settings — State

> Updated: 2026-05-12
> Status: ~85% Complete — UI shell + all 9 groups built. Polish + external wiring pending.

## ✅ Completed

| Component | File | Notes |
|---|---|---|
| Main view | `views/SettingsView.tsx` | ✅ Thin wrapper over the shared `ShellLayout` |
| Group dispatcher | `components/SettingsContent.tsx` | ✅ Reduced to a pure switch after shell extraction |
| Search filter context | (deleted) | ✅ Moved to `core/shared/layouts/search-filter-context.tsx`; SettingsSection now imports from there |
| Search hook | (deleted) | ✅ Replaced by `useShellSearch` in `core/shared/layouts/` |
| Active-group hook | (deleted) | ✅ Replaced by `useActiveShellGroup` in `core/shared/layouts/` |
| Left nav component | (deleted) | ✅ Replaced by `ShellNav` in `core/shared/layouts/` |
| Search input component | (deleted) | ✅ Replaced by `ShellSearch` in `core/shared/layouts/` |
| Shared primitives | `components/shared/{SettingsSection, SettingsRow, SettingsFormRow, SettingsSaveButton, DangerZone, FloatingLabelInput}.tsx` | |
| Hooks | `hooks/useSettingsForm.ts` | |
| WorkspaceGroup | `components/groups/WorkspaceGroup.tsx` | General + entity labels + record codes |
| TeamGroup | `components/groups/TeamGroup.tsx` + `groups/team/RoleEditor.tsx` | Members + roles |
| CRMGroup | `components/groups/CRMGroup.tsx` + `groups/crm/{PipelineEditor,FieldEditor}.tsx` | Tags section description dynamic |
| AIGroup | `components/groups/AIGroup.tsx` | Context + usage |
| AppearanceGroup | `components/groups/AppearanceGroup.tsx` | Theme + layout cookies |
| NotificationsGroup | `components/groups/NotificationsGroup.tsx` | Group-wise toggles |
| ShortcutsGroup | `components/groups/ShortcutsGroup.tsx` | Read-only reference |
| BillingGroup | `components/groups/BillingGroup.tsx` | UI only, no LS yet |
| DataGroup | `components/groups/DataGroup.tsx` | Export + danger zone UI |
| App page wrapper | `app/[locale]/(private)/[orgSlug]/settings/page.tsx` | Thin wrapper |
| Blink-always highlight | `core/shared/layouts/useShellSearch.ts::scrollToShellSection` | ✅ Fixed 2026-05-12: ring highlight now applies even when the container is not scrollable (Appearance / Danger Zone) |

## ⬜ Pending (see SETTINGS_FRONTEND_PLAN.md for full list)

| Task | Priority |
|---|---|
| WorkspaceGroup: logo upload (Convex `_storage`) | MEDIUM |
| WorkspaceGroup: modules visibility + drag-reorder UI | MEDIUM |
| PipelineEditor: stale color + warning threshold per stage | MEDIUM |
| FieldEditor: drag-reorder + `showInStages` scoping | MEDIUM |
| TeamGroup > Members: invite modal | MEDIUM |
| BillingGroup: LemonSqueezy checkout + usage meters | HIGH |
| DataGroup > Export: wire Trigger.dev CSV/JSON job | MEDIUM |
| DataGroup > Danger Zone: type-name-to-confirm soft-delete | MEDIUM |
| Code prefix rename background job (Trigger.dev) | LOW |
| Mobile < 640px: sub-group toolbar → accordion | LOW |

## Architecture Notes (this session — 2026-05-12)

- **Settings layout extracted to `core/shared/layouts/`.** The left-rail + topnav-pills + scrollable content pattern is now reusable by Settings, Profile (person detail), and any future shell-style view. `SettingsView.tsx` shrunk from ~180 lines to ~80 — everything layout-related moved to `ShellLayout`, `ShellNav`, `ShellToolbar`, `useShellSearch`, `useActiveShellGroup`, `SearchFilterProvider`.
- **SettingsSection now imports `useSearchFilter` from `core/shared/layouts`.** The old `core/settings/context/search-filter.tsx` was deleted (no consumers remained after the shell refactor).
- **Blink-always fix.** `scrollToShellSection` now *always* applies the ring highlight and *only* scrolls if there is an actually-scrollable ancestor. This was a real bug on Appearance + Danger Zone (short enough to not overflow) — pressing their sub-group pills now flashes the card the same way it does on longer groups like CRM.
- **Layout UI is byte-for-byte unchanged.** The extraction is a pure refactor — same breakpoints (`xl:flex` for desktop rail, `xl:hidden` for inline toolbar), same mobile AppSheet, same scroll container, same search/pill behavior, same scroll-reset-on-group-change, same Intersection-Observer scrollspy.
- **Dynamic labels in CRM > Tags stay.** Description still reads `"Shared tags for categorizing ${labels.lead.plural.toLowerCase()}, …"` — no regression during the extraction.
- **Global rule** (enforced in AGENTS.md): never use `Element.scrollIntoView()` inside a nested-scroll shell. Every scroll-to-anchor must target the container via `data-shell-scroll="true"` + `container.scrollTo`.

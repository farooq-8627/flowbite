# Shared — State

> Updated: 2026-05-12
> Status: Shell-layout primitives + canonical `useEntityLabels` live here.

## ✅ Completed

| Component | File | Used by |
|---|---|---|
| useEntityLabels (canonical) | `core/shared/hooks/useEntityLabels.ts` | AppSidebar, EntitySlugView, entity placeholder views, settings groups |
| useEntityLabel | `core/shared/hooks/useEntityLabels.ts` | Anywhere that needs a single slot's labels |
| Shell types | `core/shared/layouts/types.ts` | Settings shell, profile shell |
| ShellLayout | `core/shared/layouts/ShellLayout.tsx` | SettingsView, ProfileDetailView |
| ShellNav | `core/shared/layouts/ShellNav.tsx` | ShellLayout (left rail on xl+) |
| ShellToolbar | `core/shared/layouts/ShellToolbar.tsx` | ShellLayout (topnav slot + mobile inline) |
| ShellSearch | `core/shared/layouts/ShellSearch.tsx` | ShellToolbar |
| useActiveShellGroup | `core/shared/layouts/useActiveShellGroup.ts` | ShellLayout — URL-param-driven active group |
| useShellSearch + scrollToShellSection + getVisibleShellSections | `core/shared/layouts/useShellSearch.ts` | ShellLayout — Fuse-backed search + blink-safe scroll |
| SearchFilterProvider + useSearchFilter | `core/shared/layouts/search-filter-context.tsx` | SettingsSection, ProfileSection |
| Barrel export | `core/shared/layouts/index.ts` | Single import path for any shell consumer |

## ⬜ Pending

| Task | Priority | Notes |
|---|---|---|
| Mobile toolbar accordion (< 640px) | LOW | Current pill row wraps; accordion would be nicer for very small viewports |
| Keyboard navigation for nav rail | LOW | Arrow up/down to move between groups |
| Reusable `DangerZoneCard` in shared | LOW | Settings has its own; move once Profile needs it |

## Architecture Notes (2026-05-12)

- **Shell layout is now a true shared primitive.** Extracted from `core/settings/views/SettingsView.tsx`. Settings + Profile both build on top of it; any future view that wants "left rail + topnav pills + scrollable content with search" drops in `ShellLayout` and passes its own `groups`, `sections`, and `renderGroup`.
- **Consumer responsibility vs. shell responsibility.**
  - Consumer: fetch data, permission-check its specific domain, render each group via `renderGroup`, define stable section ids.
  - Shell: left rail, mobile sheet, topnav-slot injection, scrollspy (Intersection Observer), Fuse search, search-filter context, scroll-without-layout-shift, URL persistence.
- **Scroll container contract.** The shell's inner `<main>` is tagged with both `data-shell-scroll="true"` (new canonical) and `data-settings-scroll="true"` (back-compat) so existing doc references + rules in AGENTS.md keep working unchanged.
- **Canonical `useEntityLabels`.** All new consumers should import from `@/core/shared/hooks/useEntityLabels`. The `core/shell/hooks/useEntityLabels.ts` re-export stays for back-compat.

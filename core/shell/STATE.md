# Shell Module — State

> Updated: 2026-05-07
> Status: **90% Complete** — Layout, sidebar, TopNav, WorkspaceSwitcher, auth flows all done. Missing: dashboard home page, dead code cleanup.

---

## ✅ Completed

| Component | File | Notes |
|---|---|---|
| DashboardLayout | `core/shell/layouts/DashboardLayout.tsx` | Server component, reads cookies for preferences |
| DashboardLayoutClient | `core/shell/layouts/DashboardLayoutClient.tsx` | Sidebar + TopNav + SearchDialog + AI chat panel. Gap fix: !p-0 on SidebarProvider |
| AppSidebar | `core/shell/components/sidebar/app-sidebar.tsx` | Dynamic nav, compact padding (px-2 py-1.5), SidebarSupportCard + NavUser in footer |
| WorkspaceSwitcher | `core/shell/components/sidebar/workspace-switcher.tsx` | Logo click → dropdown with org list, platformOrgId, create/join/logout |
| NavUser | `core/shell/components/sidebar/nav-user.tsx` | Compact (h-5 avatar, text-xs), lowercase email, Settings in dropdown |
| TopNav | `core/shell/components/TopNav.tsx` | Search (⌘J) + Bell + ThemeSwitcher + AI toggle (⌘.) |
| SearchDialog | `core/shell/components/sidebar/search-dialog.tsx` | External open/onOpenChange props, triggered from TopNav |
| ThemeSwitcher | `core/shell/components/sidebar/theme-switcher.tsx` | Button variant used in TopNav |
| ModuleGuard | `core/shell/components/ModuleGuard.tsx` | Module access gating |
| ThemeBootScript | `components/scripts/theme-boot.tsx` | FOUC prevention — reads cookies in <head> |
| Navigation config | `core/shell/config/navigation.ts` | Dynamic, workspace-driven. buildNavigation() + resolveModuleType() |
| OnboardingGuard | (in dashboard layout) | Redirects incomplete users to /onboarding |

---

## ⬜ Pending

| Task | Priority | Notes |
|---|---|---|
| Dashboard home page | HIGH | Get Started card + metric cards |
| Delete dead code | MEDIUM | nav-main, nav-documents, nav-secondary, layout-controls, account-switcher, sidebar-support-card, data/users.ts, navigation/sidebar/ |
| Wire ModuleGuard to real Convex query | MEDIUM | Needs orgRoles + org settings.modules |

---

## Architecture Notes

### Sidebar Structure (Updated 2026-05-07)
```
SidebarHeader (px-2 py-1.5)
  WorkspaceSwitcher (logo click → dropdown)
    - List of user's orgs with platformOrgId
    - Create workspace → /onboarding
    - Join workspace → /join
    - Log out

SidebarContent
  NavGroupSection (py-1, size=sm buttons)
    - Dynamic nav from buildNavigation()

SidebarFooter (px-2 py-1.5)
  SidebarSupportCard (Docs + Support, size=sm)
  SidebarSeparator
  NavUser (h-5 avatar, text-xs, lowercase email)
    - Account / Billing / Settings / Log out
```

### TopNav Structure (Updated 2026-05-06)
```
Left: SidebarTrigger + separator + children (page breadcrumbs/tabs)
Right: Search (icon + ⌘J) | Bell | ThemeSwitcher | AI toggle (⌘.)
```

### Sidebar Padding Fix (2026-05-06)
- Root cause: `p-2` on `group/sidebar-wrapper` div in `components/ui/sidebar.tsx` (inset variant)
- Fix: `className="!p-0"` on `SidebarProvider` in `DashboardLayoutClient`
- Additional: `SidebarHeader/Footer className="px-2 py-1.5"`, groups `py-1`

### Border-Radius (2026-05-06)
- All `rounded-lg/md/xl` replaced with `rounded-[--radius]`
- Avatars kept as `rounded-lg` (intentional — avatars should stay rounded)
- Auth panel: `rounded-[calc(var(--radius)*3)]`

### WorkspaceSwitcher (2026-05-07)
- Shows `org.platformOrgId` (e.g. `ORB-XXXXX`) under org name in dropdown
- Active org has a checkmark
- Create workspace → `/onboarding` (starts new org creation flow)
- Join workspace → `/join` (enter invite token)
- Log out → `signOut()` then redirect to `/signin`

# shell Module (Core)

> App scaffold — sidebar, topnav, layout controls, theme/font settings, page wrappers.
> Every other module's routes render inside this layout.

## Ownership
- **Location**: `core/shell/`
- **Routes**: None (it IS the layout, not a page)
- **Backend**: No Convex tables (UI-only)
- **Phase**: 1 | **Status**: NOT_STARTED

## Rules
- [ ] R-SHELL-01: Navigation items MUST be config-driven from `navigation.ts` — never hardcoded in JSX
- [ ] R-SHELL-02: Shell NEVER imports from entity modules or features — features import from shell
- [ ] R-SHELL-03: All layout preferences stored in cookies (SSR-safe), NOT localStorage
- [ ] R-SHELL-04: ModuleGuard wraps every feature route — disabled modules redirect + hide from nav
- [ ] R-SHELL-05: DashboardLayout MUST include AI panel slot (always present from Phase 3)

## Checklist
- [ ] `config/navigation.ts` — sidebar nav items + module guards
- [ ] `layouts/DashboardLayout.tsx` — SidebarProvider + content + AI panel slot
- [ ] `components/AppSidebar.tsx` — config-driven sidebar rendering
- [ ] `components/TopNav.tsx` + `UserMenu.tsx`
- [ ] `components/NotificationBell.tsx`
- [ ] `components/WorkspaceSwitcher.tsx`
- [ ] `components/ModuleGuard.tsx` + `hooks/useModuleEnabled.ts`
- [ ] `components/LayoutControls.tsx` + `ThemeSwitcher.tsx`
- [ ] Route: `app/[locale]/dashboard/[orgSlug]/layout.tsx` wired
- [ ] Preferences provider added to root layout

## Avoids
- ❌ Never import from `core/entities/`, `features/ai/`, or any feature module
- ❌ Never hardcode nav items in component JSX
- ❌ Never use localStorage for layout prefs (breaks SSR)
- ❌ Never make shell conditional on plan tier — shell is always available

## Layout Settings (Preferences)
All persisted in cookies (SSR-safe). Defaults in `lib/preferences/preferences-config.ts`.

| Setting | Type | Default | Options |
|---|---|---|---|
| `sidebar_variant` | SidebarVariant | `inset` | `sidebar` \| `inset` \| `floating` |
| `sidebar_collapsible` | SidebarCollapsible | `icon` | `icon` \| `offcanvas` |
| `content_layout` | ContentLayout | `centered` | `centered` \| `full-width` |
| `navbar_style` | NavbarStyle | `sticky` | `sticky` \| `scroll` |
| `theme_mode` | ThemeMode | `light` | `light` \| `dark` \| `system` |
| `theme_preset` | ThemePreset | `orbitly` | `default` \| `tangerine` \| `brutalist` \| `soft-pop` \| `orbitly` |
| `font` | FontKey | `geist` | 18 Google Fonts (see `lib/fonts/registry.ts`) |

## Cross-Module Dependencies
- **READS FROM**: `api.orgs.getBySlug`, `api.notifications.listUnread`, `api.users.getCurrentUser`
- **WRITES TO**: Nothing (read-only shell)
- **NEVER IMPORTS FROM**: Any entity or feature module

---

## Schema Tables (Full definitions in `schema.md`)

| Table | Purpose |
|---|---|
| `users` | User accounts — `platformRole`, `onboardingCompleted` |
| `orgs` | Orgs — `slug`, `plan`, `settings`, `stripeCustomerId` |
| `orgMembers` | Org membership — `role` (→`roleId` in RBAC refactor Phase 1) |
| `invitations` | Pending invitations — 48h TTL, token-based |
| `featureFlags` | Feature rollout flags — super_admin only |

Note: `orgRoles` table (dynamic RBAC) is owned by `core/settings` module.

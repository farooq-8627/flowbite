# Shell — State
> Updated: 2026-05-07
> Status: 100% Complete — Ready for Phase 2

## ✅ Completed
| Component | File | Notes |
|---|---|---|
| Navigation config | `core/shell/config/navigation.ts` | Dynamic, workspace-driven |
| Dashboard layout | `core/shell/layouts/DashboardLayout.tsx` | Server component |
| Dashboard layout client | `core/shell/layouts/DashboardLayoutClient.tsx` | Sidebar + TopNav |
| App sidebar | `core/shell/components/sidebar/app-sidebar.tsx` | Compact padding, gap-0 content |
| WorkspaceSwitcher | `core/shell/components/sidebar/workspace-switcher.tsx` | h-10 trigger, consistent dropdown |
| NavUser | `core/shell/components/sidebar/nav-user.tsx` | h-10 trigger, consistent dropdown |
| TopNav | `core/shell/components/TopNav.tsx` | Search + Bell + Theme + AI toggle |
| Theme switcher | `core/shell/components/sidebar/theme-switcher.tsx` | |
| ModuleGuard | `core/shell/components/ModuleGuard.tsx` | |

## ⬜ Pending
| Task | Priority | Notes |
|---|---|---|
| Dead code cleanup | LOW | nav-main, nav-documents, nav-secondary, layout-controls, account-switcher, sidebar-support-card |
| TopNav: NotificationBell | MEDIUM | From shadboard — Phase 2 |
| TopNav: FullscreenToggle | LOW | From shadboard — Phase 2 |
| TopNav: LanguageSwitcher | MEDIUM | From shadboard — Phase 2 |

## Architecture Notes
- Both WorkspaceSwitcher and NavUser use identical h-10 trigger + same dropdown structure
- SidebarContent gap-0, groups px-2 py-1, all buttons h-8
- RTL-safe: all directional classes use ms-*/me-*/start-*/end-*
- Kanban: Phase 2 — shadboard UI + shadcn-dashboard-2 dnd-kit logic

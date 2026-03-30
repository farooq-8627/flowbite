# Development Plan

## Phase Sequence

| Phase | What gets built | Notes |
|---|---|---|
| 0 | Tooling: Convex, Auth, shadcn/ui, next-intl, Biome, Lefthook, t3-env, Sentry, PostHog | Foundation only |
| 1 | `_shell`: providers, layouts, sidebar, role guards, ModuleGuard, ModalRegistry | No features yet |
| 2 | `auth` + `users`: invite flow, approval, roles, profile | Multi-tenant model live |
| 3 | `work-items` core: create, list, detail, assign, status transitions | Main data object |
| 4 | `workflows`: config editor, state machine engine, transition rules | Drives approvals |
| 5 | `approvals`: inbox, resolution, email notifications via Trigger.dev | |
| 6 | `connections` + `messaging`: link records, real-time chat | **→ Demo-ready** |
| 7 | `dynamic-forms`: builder, DynamicForm renderer, Zod schema builder | |
| 8 | `settings` + module toggles: workspace settings, plan-gated modules | |
| 9 | `notifications` polish: bell, read states, preferences | |
| 10 | `reports` + `commissions`: dashboards, commission calc via Trigger.dev | |
| 11 | Mobile + Arabic RTL polish, performance, Lighthouse pass | |

Phases 0–6 = minimum demo-ready product.

---

## Slice Build Order (follow exactly)

1. Add tables + indexes to `convex/schema.ts`
2. Add constants to `src/constants/` (actions, statuses, notification types, module ID)
3. Write `convex/functions/[name]/queries.ts`
4. Write `convex/functions/[name]/mutations.ts` — include `logActivity` + `createNotification`
5. Write `convex/functions/[name]/index.ts` (re-export)
6. Scaffold `src/features/[name]/` folder structure (all sub-folders + empty `index.ts` files)
7. Write `_convex/` hooks (Convex hook layer)
8. Write business logic hooks (UX layer)
9. Write components — smallest first: badge → card → list → detail → form
10. Write page components
11. Write route files in `app/[locale]/(dashboard)/[workspace]/[role]/[feature]/`
12. Wrap module routes in `ModuleGuard` layout
13. Add nav items to `_shell/config/navigation.ts`
14. Run acceptance criteria checklist manually
15. Open PR scoped to this slice only

---

## Pre-Slice Contract
Answer every question before writing the first file:

- Slice name (lowercase, hyphenated)?
- Module ID from `MODULE_IDS`?
- Which roles can access? Which cannot?
- Convex tables needed — names, indexes, `tenantId` confirmed?
- Exact names of all queries and mutations?
- Activity log action constants to add?
- Notification type constants to add?
- Trigger.dev tasks needed (yes/no; list them)?
- Page components to export from `index.ts`?
- 5 acceptance criteria tests?

---

## Acceptance Criteria (every slice)

- [ ] No browser console errors or warnings
- [ ] Data is scoped to tenant — confirm in Convex dashboard that wrong tenant cannot read
- [ ] Accessing as wrong role redirects correctly
- [ ] Disabling module → route redirects, sidebar item disappears
- [ ] Activity log entry written after every mutation
- [ ] Notification created where relevant
- [ ] Arabic locale loads without layout breakage, `labelAr` used where available
- [ ] Loading skeleton displays while query is pending
- [ ] Empty state renders correctly when there is no data
- [ ] Renders without overflow at 390 px viewport width
- [ ] `pnpm build` exits with zero errors (TypeScript + ESLint)
- [ ] No Biome lint errors

---

## Phase 0 Setup Checklist

- [ ] Convex project initialized, `convex dev` running
- [ ] Convex Auth working (confirm test user in dashboard)
- [ ] shadcn/ui initialized — CSS variables mode, confirm `cn()` in `src/lib/utils.ts`
- [ ] next-intl: `[locale]` routing, `dir="rtl"` set on Arabic `<html>`
- [ ] Biome + Lefthook + commitlint configured and blocking bad commits
- [ ] t3-env schema — build fails on missing required env vars
- [ ] Sentry error visible in Sentry dashboard (throw test error)
- [ ] PostHog pageview visible in PostHog dashboard (confirm event fired)
- [ ] `src/constants/` created (roles, modules, permissions, events, statuses)
- [ ] `convex/lib/` helpers written: `withUser`, `withRole`, `logActivity`, `notifications`, `permissions`, `validateTransition`
- [ ] Provider tree renders without errors (run `pnpm dev`)
- [ ] DashboardLayout auth redirect working (unauthenticated → login)
- [ ] AppSidebar renders nav items from `navigation.ts`
- [ ] Role layouts redirect wrong-role user to their own home
- [ ] ModuleGuard component blocks access and redirects for disabled test module

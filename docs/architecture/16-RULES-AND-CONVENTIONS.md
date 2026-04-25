# 16 — Rules & Conventions

> This document covers coding conventions and patterns for the Orbitly codebase.
> For the full non-negotiable rule set, see `.gemini/agents/base/rules.md`.
> For module-specific rules, see each module's `MODULE.md`.

---

## Quick Reference — Golden Rules

1. **Never duplicate validators/types** — define once in `convex/_shared/validators.ts`
2. **Never use raw `query`/`mutation`** — use `orgQuery`, `orgMutation`, etc.
3. **Never accept `userId`/`orgId` as args** — derive from `ctx`
4. **Never use `.filter()`** — always `.withIndex()`
5. **Never use `.collect()` unbounded** — always `.take(n)` or paginate
6. **Use `internalMutation`** for system ops (crons, notifications, logging)
7. **Update `updatedAt`** on every mutation
8. **Feature logic stays in feature folders** — notification system is generic
9. **Use `useAppRouter()`** — never hardcode locale
10. **Never pass orgId/userId to `sendNotification`/`logActivity`** — auto-injected
11. **Every module folder has `index.ts`** — single public export point
12. **zustand = UI state only** — Convex = all server state

---

## Naming Conventions

| Type | Pattern | Examples |
|---|---|---|
| TS files | `camelCase.ts` | `queries.ts`, `helpers.ts` |
| React components | `PascalCase.tsx` | `ConnectionCard.tsx` |
| Directories | `camelCase/` | `activityLogs/` |
| DB tables | `camelCase`, plural | `orgMembers`, `activityLogs` |
| Indexes | `by_[field1]_and_[field2]` | `by_orgId_and_status` |
| Hooks | `use[Entity]s`, `use[Entity]`, `use[Entity]Mutations` | `useLeads()` |
| Permissions | `[module].[action]` | `leads.create` |

---

## TypeScript Rules

- Use `Doc<"tableName">` for document types, `Id<"tableName">` for ID types
- Use `QueryCtx`, `MutationCtx`, `ActionCtx` — never `any`
- All Convex functions must have argument validators
- No `any` except `metadata` fields and `v.any()` validators

---

## Import Rules

1. Always use aliases: `@/convex/`, `@/core/`, `@/features/`, `@/components/`, `@/lib/`
2. Never relative imports across modules
3. Convex files import from `../_shared/` (relative within convex/)
4. Feature files import from `@/` prefix
5. Route files import from `@/core/` or `@/features/`

---

## Error Handling

### Backend (Convex)
- Auth errors → handled by custom function builders
- Permission errors → `requireRole()` — throws with clear message
- Not found → check `ctx.db.get()` result before using
- Validation → Convex validators handle argument validation

### Frontend
- Mutation errors → catch in hook wrapper, show toast
- Query loading → always handle `undefined` (loading). Use `"skip"` for conditional queries
- User feedback → `sonner` toasts for success/error, skeleton components for loading

---

## Git Conventions

| Rule | Example |
|---|---|
| Feature branches | `feature/entities`, `feature/ai-chat` |
| Fix branches | `fix/notification-bell` |
| Core branches | `core/shell`, `core/timelines` |
| Commit messages | `feat(entities): add lead list scaffold` |
| One feature per PR | Don't mix entities + AI in one PR |

---

## Checklist Before Every PR

- [ ] No raw `query`/`mutation` for protected functions
- [ ] No `.filter()` in Convex queries
- [ ] No `.collect()` without bounded context
- [ ] No `any` types
- [ ] All mutations update `updatedAt`
- [ ] All significant mutations call `logActivity()`
- [ ] Notification-worthy events call `sendNotification()`
- [ ] All shared validators/types imported, not duplicated
- [ ] Module code self-contained in its folder
- [ ] Module has `index.ts` as single export point
- [ ] Route pages are thin wrappers
- [ ] No hardcoded locale in URLs
- [ ] `biome check` passes
- [ ] `tsc --noEmit` passes

---

> For the complete rule set including AI rules, RBAC rules, architecture rules, and cross-module integration rules:
> → `.gemini/agents/base/rules.md`

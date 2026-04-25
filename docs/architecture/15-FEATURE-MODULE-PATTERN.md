# 15 — Module Build Pattern

> How to build any new module in Orbitly. Every module connects to the base through exactly two points.
> For module-specific rules, read the target module's `MODULE.md` first.

---

## The Two Connection Points

A module connects to the base through:

1. **`convex/schema.ts`** — one line importing the module's tables: `...myModuleTables`
2. **`features/_registry.ts`** — one call to `registerFeature()` (features only; core modules are always visible)

Everything else is self-contained within:
- `core/[name]/` or `features/[name]/` — frontend (components, hooks, types)
- `convex/[name]/` — backend (queries, mutations, actions, helpers, tables)
- `app/[locale]/dashboard/[orgSlug]/[name]/` — routes (thin wrappers)

---

## Build Order (follow exactly)

1. **Read `MODULE.md`** — the target module's rules, checklist, avoids
2. Tables + indexes → `convex/[name]/tables.ts`
3. Constants → `convex/_shared/constants.ts` (add to existing)
4. Queries → `convex/[name]/queries.ts` (use `orgQuery`)
5. Mutations → `convex/[name]/mutations.ts` (include `logActivity` + notification)
6. Frontend types → `[module]/types.ts`
7. Frontend hooks → `[module]/hooks/`
8. Components → `[module]/components/` (smallest first: badge → card → list → detail → form)
9. Routes → `app/[locale]/dashboard/[orgSlug]/[name]/`
10. Register → `features/_registry.ts` (features only)

---

## Core vs Features

| If module is in... | Registration | Plan gating |
|---|---|---|
| `core/` | Always visible in sidebar | NEVER gated |
| `features/` | `registerFeature()` + `ModuleGuard` | CAN be gated |

---

## Cross-Module Integration

When your module touches shared systems, follow these rules from `rules.md`:

### Notifications
```ts
// In your mutations.ts
await sendNotification(ctx, {
  templateKey: "lead.created",
  to: args.assignedTo,
  vars: { leadName: args.name },
  entityType: "lead",
  entityId: leadId,
});
// orgId + userId auto-injected from ctx
```

### Activity Logs
```ts
await logActivity(ctx, {
  action: "created",
  entityType: "lead",
  entityId: leadId,
  description: `Created lead "${args.name}"`,
});
// orgId + userId auto-injected from ctx
```

### Dynamic Fields
```ts
// In your component
const { fields, values } = useDynamicFields(entityType, entityId);
// Render with <DynamicFieldRenderer>
```

---

## Removing a Module

1. Delete `core/[name]/` or `features/[name]/` — components, hooks, types
2. Delete `convex/[name]/` — tables, queries, mutations
3. Delete `app/[locale]/dashboard/[orgSlug]/[name]/`
4. Remove `...moduleTables` from `convex/schema.ts`
5. Remove permissions from `convex/_shared/permissions.ts`
6. Run `npx convex dev` — Convex validates schema

---

## Module Checklist

| Step | File | Action |
|---|---|---|
| Read rules | `[module]/MODULE.md` | Understand module-specific rules |
| Tables | `convex/[name]/tables.ts` | Define tables + indexes |
| Schema | `convex/schema.ts` | One line: `...moduleTables` |
| Queries | `convex/[name]/queries.ts` | Use `orgQuery` |
| Mutations | `convex/[name]/mutations.ts` | Use `orgMutation`, call `logActivity()` + `sendNotification()` |
| Types | `[module]/types.ts` | Zod schemas + TS types |
| Components | `[module]/components/` | UI components |
| Hooks | `[module]/hooks/` | Convex query/mutation wrappers |
| Register | `features/_registry.ts` | Features only |
| Route | `app/.../[name]/page.tsx` | Thin wrapper page |

> For entity modules specifically, use the 4 shared scaffolds — see `core/entities/MODULE.md`.

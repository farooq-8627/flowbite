# `crm/fields/templates/` — Industry-template SEEDER

> **Phase**: Stage 3 of INDUSTRY-TEMPLATES-DB-MIGRATION.md — SHIPPED 2026-05-27
> **Read order**: this MODULE.md → `types.ts` → `mutations.ts` (the seeder) → `convex/_platform/industries/MODULE.md` (the runtime SOURCE OF TRUTH).

## Purpose

This folder is the **seeder** for the platform's industry-template feature. The runtime SOURCE OF TRUTH for templates lives in the `platformTemplates` table — see `convex/_platform/industries/`. This folder owns:

1. The shared `IndustryTemplate` TS type (consumed by the seeder + the platform-validator).
2. The internal mutation `setupWorkspaceFromTemplate` that translates a `platformTemplates.definition` blob into pipelines + fields + entity labels + every other slot for a freshly-onboarded org.
3. `mockSeeder.ts` — the helper that materialises a template's `mockData` block into actual lead/contact/deal/note/task rows for new workspaces.

The 9 built-in template TS fixtures were relocated to `convex/_platform/industries/builtIns/` in Stage 3. They exist purely as a one-time bootstrap data source for fresh deployments — runtime reads NEVER hit them.

## File layout

```
templates/
├── MODULE.md              ← this file
├── types.ts               ← IndustryTemplate + every Seed sub-type
├── mutations.ts           ← setupWorkspaceFromTemplate (reads from platformTemplates DB row)
├── mockSeeder.ts          ← seeds mockData → leads/contacts/deals/notes/tasks
├── queries.ts             ← legacy `list`/`listForAI` shim (DB-backed; kept for back-compat)
```

> ❌ `registry.ts` and `definitions/` were deleted in Stage 3. Adding a new built-in industry is no longer a code change — use the owner panel (`/xowner/industries/new`) which clones from an existing built-in or starts empty.

## How `setupWorkspaceFromTemplate` works

1. The seeder reads the `platformTemplates` row by `templateKey`.
2. Reconstructs the legacy `IndustryTemplate` shape by spreading the `definition` blob over the row's identity columns.
3. Idempotently seeds: workspace defaults, code prefixes, entity labels, pipelines + stages, field definitions, modules, note categories, tags, saved views, custom roles, AI persona, dashboard metrics.
4. If `actorUserId` is supplied, also seeds mock entities via `mockSeeder.ts`.
5. Soft-fails (returns `{ ok: false }`) when the platformTemplates row is missing — keeps org creation working in test environments and fresh deployments where the seed migration hasn't run yet.

## Decision log

| # | Decision | Outcome |
|---|---|---|
| 1 | Single internal seeder behind every onboarding / re-apply / AI tool path. | One mutation to maintain; consistent idempotency. |
| 2 | Stage seeds carry hard-coded codes (e.g. `"DISC"`, `"NEG"`); the seeder resolves codes → stable ids before insert. | Template definitions stay grep-readable; persisted shape uses stable ids. |
| 3 | `showInStages` references in template field defs use codes; the seeder resolves to ids. | Same readability gain. |
| 4 | After Stage 3, the seeder reads from `platformTemplates` ONLY — no fallback to TS files. | Single mechanism for resolution. The TS fixtures under `_platform/industries/builtIns/` are bootstrap-only. |
| 5 | The legacy `INDUSTRY_TEMPLATES` map + `INDUSTRY_ID_ALIASES` resolution were both replaced by `templateKey` lookups against the DB. | Aliases (e.g. `solo`, `student`, `dubai-real-estate`) are real DB rows — the picker resolves them by direct lookup. |

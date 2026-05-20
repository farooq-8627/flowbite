# `crm/fields/templates/` — Industry Template Registry

> **Phase**: 2 Final · **Status**: SHIPPED (3 templates)
> **Read order**: this MODULE.md → `types.ts` → `registry.ts` → one definition file.

## Purpose

A self-service "industry-in-a-box" registry. Each template seeds:

1. A **pipeline** with stages already carrying owner-typeable codes.
2. **Field definitions** for one or more entity types.
3. Optional **entity-label overrides** (e.g. real estate uses "Inquiry / Client / Listing / Agency").

Onboarding wizard + AI tools both read from the same registry — change once, propagate everywhere.

## File layout

```
templates/
├── MODULE.md              ← this file
├── registry.ts            ← INDUSTRY_TEMPLATES record + getTemplate / listTemplates
├── types.ts               ← IndustryTemplate, StageSeed, FieldDefSeed, EntityLabelOverride
├── mutations.ts           ← setupWorkspaceFromTemplate (internalMutation)
└── definitions/
    ├── b2b-saas.ts
    ├── freelancer.ts
    └── real-estate.ts
```

## Adding a new template

1. Create `definitions/<id>.ts` exporting one `IndustryTemplate`.
2. Import + register in `registry.ts`.
3. (Optional) Add Arabic labels via `labelAr` if Gulf-region.
4. Done — onboarding wizard + AI auto-pick up the new entry.

## `setupWorkspaceFromTemplate` rules

| # | Rule | Outcome |
|---|---|---|
| 1 | Idempotent — re-running with the same templateId is safe. | Pipeline insert skipped if one exists for `entityType="deal"`. |
| 2 | Field definitions deduped by `name` per entityType. | Re-seed never duplicates fields. |
| 3 | Entity labels merge into `org.entityLabels` (template overrides win for the keys it sets). | Existing labels for unset keys are preserved. |
| 4 | `org.industry` is patched to the template id whenever the mutation runs. | Lets us answer "which template did this org start with" later. |
| 5 | Stage `showInStages` in templates is written using **stage codes** (e.g. `"DOC"`); the seeder resolves codes to stage ids before insert. | Templates stay readable; ids stay stable post-rename. |

## Decision log

| # | Decision | Outcome |
|---|---|---|
| 1 | One folder per concern (templates, fieldDefinitions, fieldValues, pipelines). `templates/` is a sibling of `pipelines/`, not nested under it. | Clear that templates seed multiple things, not just pipelines. |
| 2 | `setupWorkspaceFromTemplate` is an `internalMutation`, not a public one. | Keeps it callable from onboarding (via a thin wrapper) + the Phase 3 AI tool, but never exposed to client code without a permission gate. |
| 3 | Stage seeds carry hard-coded codes (e.g. `"DISC"`, `"NEG"`), not derived ones. | Template authors get full control + readability. The `deriveStageCode` helper is the runtime fallback for owner-typed codes only. |
| 4 | `seedFromTemplate` (in `pipelines/helpers.ts`) is now a thin wrapper over `getTemplate(...)`. | Old callers (onboarding pipeline-only seed, tests) keep working without changes. |
| 5 | `showInStages` references in template field defs use codes; mutation resolves to ids. | Template definitions stay grep-readable; persisted shape uses stable ids. |


## 2026-05-21 — Real-estate split (Dubai vs general)

| # | Decision | Outcome |
|---|---|---|
| 1 | `realEstateTemplate` (id `"real-estate"`) is now the *general* real-estate template with no Gulf-specific compliance fields. The original Gulf template moved to `dubai_real_estate.ts` exporting `dubaiRealEstateTemplate` (id `"dubai-real-estate"`). Both registered in `registry.ts`. | Brokers outside the UAE can pick `Real Estate` without inheriting RERA / Form F / Ejari / Emirates ID + 90-day rent-renewal alerts. Dubai brokers pick the Gulf variant and get the full machinery. |
| 2 | `INDUSTRY_ID_ALIASES` reduced to just `{ other: "generic" }`. Onboarding ships only the seven industries that have curated templates. | Picker no longer offers industries that fall through to `generic` silently — explicit choice. |
| 3 | Migration `_migrations/renameRealEstateToDubai.ts` patched existing orgs' `industry` from `"real-estate"` to `"dubai-real-estate"` because they were originally seeded with the Gulf field set (rera_orn, ejari_number, …). Idempotent; ran on dev — 2 orgs renamed. | No data loss; the rent-renewal toggle, AI persona, and curated saved-views continue to work for these workspaces. |

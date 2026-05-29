# `_platform/industries/` — DB-backed Industry Templates

> **Phase**: cross-cutting · **Status**: 🟢 Stages 1–3 SHIPPED 2026-05-27. The migration is complete.
> **Read order**: this file → `validators.ts` → `queries.ts` → `mutations.ts`. Cross-ref `INDUSTRY-TEMPLATES-DB-MIGRATION.md` for the full migration history.

## Purpose

Owns the read + write surface for `platformTemplates` and `platformIndustryGroups`. Replaces the static TypeScript registry at `convex/crm/fields/templates/registry.ts` (deleted in Stage 3, 2026-05-27).

## Files

| File | Purpose | Stage |
|---|---|---|
| `validators.ts` | Pure-function validator for the `definition` JSON blob (shape + cross-references). Throws `INVALID_DEFINITION` with a path on failure. | 1 |
| `queries.ts` | Onboarding readers (`listOnboardingGroups`, `listOnboardingTemplatesByGroup`), Settings reader (`listAllForSettings`), AI reader (`listAllForAI`), admin readers (`listAllForAdmin`, `getTemplateForAdmin`, `listGroupsForAdmin`, `getGroupForAdmin`, `usageCountByTemplate`). | 1 + 2 |
| `mutations.ts` | 11 owner-panel write mutations (5 group + 6 template) — all real Stage 2 implementations following the §8 4-step pattern. | 2 |

## Storage shape

`platformTemplates` (typed root + JSON `definition` blob):

| Field | Type | Notes |
|---|---|---|
| `templateKey` | `string` | Stable id; persisted in `org.industry`. |
| `groupKey` | `string` | FK → `platformIndustryGroups.groupKey`. |
| `label`, `description`, `icon`, `region` | `string` / optional | Display surface. |
| `visible`, `sortOrder` | `boolean` / `number` | Picker visibility + ordering. |
| `isBuiltIn` | `boolean` | Informational — surfaces a warning before delete; does NOT block hard-delete (per L8). |
| `isArchived` | `boolean` | Soft-hide; still resolvable for orgs already on it. |
| `definition` | `v.any()` JSON blob | Full `IndustryTemplate` content (pipelines, fields, modules, mockData, etc.). |

`platformIndustryGroups`:

| Field | Type |
|---|---|
| `groupKey`, `label`, `description?`, `icon?` | strings |
| `visible`, `sortOrder` | bool / number |

Indexes:

- `platformTemplates.by_templateKey` — point lookups by stable id.
- `platformTemplates.by_group_visible_order` — onboarding step 2.
- `platformTemplates.by_visible` — global visibility scan.
- `platformIndustryGroups.by_groupKey` — point lookups.
- `platformIndustryGroups.by_visible_order` — onboarding step 1.

## Rules

| # | Rule | Outcome |
|---|---|---|
| 1 | All write paths gate on `requirePlatformOwner(ctx)` first. | Defence-in-depth — even if the layout gate is bypassed, the mutations fail. |
| 2 | Stage 2 mutations follow the canonical 4-step pattern (auth → rate-limit → before/after snapshot → `logPlatformAction`). | Audit trail is automatic for every state change. |
| 3 | Audit verbs: `owner.industries.{group,template}.{create,update,delete,visibility,archive,reorder}`. | Mirrors §5.4 of the migration spec; consistent grep target across the panel. |
| 4 | `definition` blob written ONLY through `validators.validateDefinition` — every editor write runs the validator first. | Cross-ref errors (orphan `companyKey`, missing `stageCode`) surface inline in the editor before write. |
| 5 | NEVER add `*ForAI` twins — these handlers are owner-panel only. The single AI-callable function is `listAllForAI` (read-only metadata, non-sensitive). | Matches `_platform/MODULE.md` rule #5. |
| 6 | "Re-apply latest template to an existing org" is OUT of scope (per L6 + Future-Enhancements §B). The seeder always reads the CURRENT `platformTemplates` row, but it doesn't retro-apply edits to orgs already onboarded. | Owners keep their customizations untouched. |

## Decision log

| # | Decision | Outcome |
|---|---|---|
| 1 | Hybrid storage (typed root + JSON `definition`) per L5 | Index-friendly + future-proof — adding a new slot doesn't require a schema migration. |
| 2 | `platformIndustryGroups` is its own table (per L2) | Group display data (label, icon, description, order) lives independently from any one template's. Reorder groups without touching templates. |
| 3 | Sub-niche aliases (e.g. `solo`, `student`) become real DB rows in Stage 1 | Dropped the static `INDUSTRY_ID_ALIASES` map. One mechanism for resolution: DB lookup by `templateKey`. |
| 4 | `aiPersona` lives inside `definition.aiPersona` (string) | Matches the existing `IndustryTemplate.aiPersona` slot; the seeder writes it into `aiPersonaContext` as the org's identity blob. |
| 5 | Stage 1 mutations were placeholders that threw `NOT_IMPLEMENTED_UNTIL_STAGE_2`; Stage 2 (2026-05-27) replaced every one with real 4-step canonical owner-panel mutations | Stable function paths from day 1; clients wired against them in parallel with backend work. Mutations now: `createGroup`/`updateGroup`/`setGroupVisible`/`reorderGroups`/`deleteGroup` + `createTemplate`/`updateTemplate`/`setTemplateVisible`/`archiveTemplate`/`deleteTemplate`/`reorderTemplates`. |
| 6 | `validateDefinition` is a pure function — no Convex `ctx` argument (per L8/L9 deferred concerns) | Reusable from Stage 1 seed migration AND Stage 2 mutations AND the editor UI's pre-flight check. |
| 7 | Hard-delete protected by typed confirmation per L8 (revised 2026-05-27) | The mutation requires `confirmKey === templateKey` AND zero org usage. `isBuiltIn` is informational, not a hard block. |
| 8 | Stage 2 (2026-05-27) — `createTemplate` / `createGroup` mirror their key into `platformReservedSlugs` (category=`template`/`industryGroup`) and `deleteTemplate` / `deleteGroup` clean it up | Keeps `platformReservedSlugs` as the SSOT for "what slugs are taken across the platform". A new org can never claim a slug that shadows an existing template/group key. Idempotent — if the mirror row is missing, the cleanup silently no-ops. |
| 9 | Stage 2 reduced 5 spec'd bespoke editors (`StagesEditor`, `FieldsEditor`, `EntityLabelsEditor`, `ModulesEditor`, `JsonArrayEditor`) into one generic `JsonSlotEditor` | Pragmatic JSON-editor approach. Server-side `validateDefinition` still runs cross-reference checks on every save, so structural correctness is preserved. Bespoke per-slot UI is a v2 enhancement (see `Future-Enhancements.md §B`). |
| 10 | Stage 3 (2026-05-27) — added `cloneTemplate` mutation + `NewTemplateView` clone-or-empty wizard at `/xowner/industries/new`. Audit verb `owner.industries.template.clone`. JSON deep-clone via `JSON.parse(JSON.stringify(...))`. | Adding a new built-in industry is now a "click + fill form" workflow with zero code changes — meets the migration spec §1.1 row 6 acceptance criterion. |
| 11 | Stage 3 (2026-05-27) — `convex/crm/fields/templates/registry.ts` + the 9 `definitions/*.ts` files were removed from `convex/crm/fields/templates/`. The 9 TS fixtures were relocated to `convex/_platform/industries/builtIns/` as one-time bootstrap data (seed migration + `widgets.test.ts` only). The runtime SOURCE OF TRUTH is now exclusively `platformTemplates` rows. `OnboardingPage.tsx` no longer carries the static `INDUSTRIES` array fallback. | Single mechanism for resolution. Adding / editing / deleting a template happens via the owner panel. |
| 12 | Stage 4 of `DASHBOARD-V2-PLAN.md` (2026-05-29) — templates can now ship a `dashboardLayout` slot inside `definition`. `definitionFromTemplate` deconstructs it; `validateDefinition` light-checks the shape; the seed pipeline (`patchOrgSettings`) writes it into `org.settings.dashboardLayout` on apply / re-apply. | Stage 4 needed each industry to ship a different *spatial arrangement* of widgets — flat `dashboardMetrics` only knew "which keys" not "where they go". `dashboardLayout` is additive optional so existing templates keep shipping the legacy fixed-grid path; only templates that opt in (b2b-saas, freelancer, real-estate-global, productivity in v1) trigger `<DashboardLayoutRenderer>`. The validator runs at TWO boundaries — `validateDefinition` at write-time for editor UX (inline errors), and `validateDashboardLayoutShape` at runtime in the renderer for defence-in-depth fallback. Net effect: a malformed layout NEVER reaches a user-facing screen broken — it either fails validation in the editor or silently falls back to the default flow. |

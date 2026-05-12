# Industry Adaptability Analysis

> Written 2026-05-12 during Entity Scaffolds planning. Referenced from `.kiro/PLAN.md`, `Phase-2-progress.md`, `features/*/MODULE.md`.

## TL;DR

| Q | A |
|---|---|
| Production-grade? | **Yes, with 3 named gaps** (§3) |
| Over-fitted to Dubai RE? | **No** — Dubai RE is a DB template, not code |
| Configurable enough? | **80% of verticals yes**; other 20% need Gaps 1–3 |
| Industries ready after this build? | RE, B2B SaaS, startups, coaching, insurance, recruitment (entity5=Job), non-profit donor, basic freelance |

## 1. Configurability surface (already DB-driven)

- Entity labels, URL slugs (`orgs.settings.entityLabels`)
- Module visibility + order + defaultView + cardFields + listColumns + boardGroupBy (`orgs.settings.modules[]`)
- Code prefixes (`orgs.settings.codePrefixes`)
- Pipelines + stages + stale colors (`pipelines[].stages[]`)
- Custom fields stage-aware (`fieldDefinitions` + `fieldValues`)
- AI persona (`orgs.settings.aiPersona`)
- Industry template (`platformTemplates` DB rows)
- Vertical entity slots (`entity5s` / `entity6s` tables)
- Roles/permissions, RTL i18n

Nothing hard-codes Dubai RE. We're in good shape.

## 2. Production parity scorecard

**We match/exceed** HubSpot/Pipedrive on: entities, pipelines, custom fields, stage-aware fields (ahead), personCode-unified timeline (ahead), tags, reminders, notes, RBAC, entity renaming, multi-tenant, i18n/RTL, AI assistant, realtime.

**Deferred/roadmap**: email composer, SMS/dialer, calendar+booking, advanced reports builder, lead scoring, forecasting, territory, native mobile.

## 3. Three named gaps — add to roadmap NOW

Unlock 6+ verticals. Architect schemas now, build modules later.

### Gap 1 — Products/Services Catalog (CPQ-lite) → `features/catalog/`

```ts
catalogItems: { orgId, code, name, description, unit, unitPrice, currencyCode, category, isActive }
dealLineItems: { orgId, dealId, itemId, quantity, unitPriceOverride, discountPct, notes }
```
**Unlocks**: agency, freelance, construction, manufacturing, field service.

### Gap 2 — Documents/Contracts/Proposals/Invoices → `features/documents/`

```ts
documents: { orgId, docCode, type /* "proposal"|"contract"|"invoice"|"quote"|"form" */,
  status, templateId, personCode, dealCode, projectCode,
  title, body, variables, subtotal, taxRate, total, currencyCode, lineItems,
  signatureStatus, signatories, sentAt, viewedAt, acceptedAt, paidAt, publicToken }
documentTemplates: { orgId, name, type, body, variables, isBuiltIn }
```
**Unlocks**: agency, legal, photography, events, serious freelance, construction estimates.

### Gap 3 — Workflow/Automation Builder (deterministic) → `features/workflows/`

```ts
workflows: { orgId, name, isActive,
  trigger: { event, filters },
  actions: [{ kind: "email.send"|"reminder.create"|"note.add"|"field.update"|"tag.add"|"notification.send"|"wait", args }] }
workflowRuns: { orgId, workflowId, status, triggerPayload, executedActions }
```
Reuses AI tool-registry as action kinds. **Unlocks**: every industry's "if X then Y" rules.

## 4. Industry matrix (after this build + 3 gaps)

| Industry | This build | + Gap 1 | + Gap 2 | + Gap 3 |
|---|---|---|---|---|
| Dubai RE (primary) | ✅ | — | better | better |
| B2B SaaS / startups | ✅ | better | better | better |
| Coaching / consulting | ✅ | much better | much better | better |
| Insurance | ✅ | — | better | much better |
| Recruitment (entity5=Job) | ✅ | — | much better | better |
| Non-profit (donor) | ✅ | — | better | better |
| Basic freelance | 🟡 | much better | **required** | better |
| Agency/design/marketing | ❌ | better | **required** | better |
| Legal (entity5=Matter) | 🟡 | — | **required** | better |
| Construction | ❌ | **required** | **required** | better |
| Manufacturing | ❌ | **required** | better | better |
| Field service | ❌ | **required** | better | needs scheduling |
| Photography/events | 🟡 | better | **required** | better |
| Healthcare | ❌ | — | — | out of scope (HIPAA) |
| Ecommerce | ❌ | — | — | wrong paradigm |

**After all 3 gaps → 12/16 verticals credibly servable.**

## 5. Productivity angle (Monday/ClickUp/Notion)

~80% there. Need: (1) ship `features/project-management/`, (2) add `timeline` (Gantt) + `calendar` view types to `EntityListPage`, (3) eventually doc pages.

## 6. Zero-cost hooks for this build

- Add `modules[slot].meta: v.optional(v.any())` — free-form config future-proofing
- Accept `"industry_template_seed"` as a valid `source` value
- Log per seeded field/pipeline/label on template apply
- Keep entity5/entity6 slots documented, UI hidden by default

## 7. Next actions

1. Proceed with Slice 0 (this session)
2. Add Gaps 1–3 as feature-module folders in `features/` (schema placeholders only — see §3)
3. Update global PLAN.md + Phase-2-progress.md with Gap references

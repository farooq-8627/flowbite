# Industry Adaptability Analysis

> **Scope**: Assessment of whether the base is production-grade and multi-industry ready.
> Written 2026-05-12 after Entity Scaffolds planning round.

## TL;DR

| Question | Answer |
|---|---|
| Production-grade? | **Yes, with 3 named gaps** (see §3). |
| Over-fitted to Dubai RE? | **No.** Dubai RE is a DB template (one `platformTemplates` row), not code. |
| Configurable enough? | **Yes for 80% of verticals.** Other 20% need Gaps 1–3 below. |
| Industries ready out-of-the-box? | Real estate, B2B SaaS sales, startups, coaching/consulting, insurance, recruitment, non-profit, basic freelance. |
| Industries needing gaps first? | Agency, legal, construction, manufacturing, field service, photography/events, serious freelance. |

## 1. Configurability we already have

| Surface | Mechanism | Status |
|---|---|---|
| Entity names, URL slugs | `orgs.settings.entityLabels` | ✅ Done |
| Module visibility + order | `orgs.settings.modules[].hidden/order` | ✅ Done |
| Default view (list/board) | `orgs.settings.modules[].defaultView` | 🟡 This build |
| Card fields / list columns / board groupBy | `orgs.settings.modules[].{cardFields, listColumns, boardGroupBy}` | 🟡 This build |
| Code prefixes (`P`→`IN`) | `orgs.settings.codePrefixes` | ✅ Done |
| Pipeline stages + stale colors | `pipelines[].stages[].*` | ✅ Done |
| Custom fields (stage-aware) | `fieldDefinitions` + `fieldValues` | ✅ Done backend |
| AI persona per industry | `orgs.settings.aiPersona` | ✅ Done |
| Industry template seed | `platformTemplates` table | 🟡 Schema ready, apply flow pending |
| Extra vertical entities | `entity5s` + `entity6s` tables | 🟡 UI pending |
| Role + permissions | `orgRoles` table + permission catalog | ✅ Done |
| RTL + i18n | `next-intl` + RTL-safe Tailwind rule | ✅ Done |

Nothing in code hard-codes Dubai RE. We're in good shape.

## 2. Production-CRM feature parity

We match or exceed HubSpot/Pipedrive/Nutshell on these: entity model, pipelines, custom fields, stage-aware fields (we're ahead), activity timeline (our personCode unification is better than HubSpot), tags, reminders, notes, RBAC, entity renaming, URL slug renaming, multi-tenant, i18n/RTL, AI assistant, real-time (Convex).

We're deferred (roadmapped but not in base): email composer, SMS/dialer, calendar+booking, bulk CSV import UI (backend ready), advanced reports builder, lead scoring, forecasting, territory management, native mobile app.

## 3. Three named gaps — add to roadmap now

These unlock 6+ verticals. Architect placeholder schemas now (cheap), build modules later.

### Gap 1 — Products / Services / Line-items catalog (CPQ-lite)

**Why**: every service business needs a catalog with prices. Unlocks invoicing. Critical for agency, freelance, construction, manufacturing, field service.

```ts
catalogItems: { orgId, code, name, description, unit, unitPrice, currencyCode, category, isActive }
dealLineItems: { orgId, dealId, itemId, quantity, unitPriceOverride, discountPct, notes }
```

**Target phase**: new feature module `features/catalog/` — build after this Entity Scaffolds build.

### Gap 2 — Documents / Contracts / Proposals / Invoices

**Why**: HoneyBook / Dubsado / PandaDoc revolve around this. Without it we can't serve service businesses. Also the stickiest feature (once contracts live here, churn drops).

```ts
documents: {
  orgId, docCode, type, // "proposal" | "contract" | "invoice" | "quote" | "form"
  status, templateId, personCode, dealCode, projectCode,
  title, body, variables,
  subtotal, taxRate, total, currencyCode, lineItems,
  signatureStatus, signatories,
  sentAt, viewedAt, acceptedAt, paidAt, publicToken,
}
documentTemplates: { orgId, name, type, body, variables, isBuiltIn }
```

**Target phase**: new feature module `features/documents/`.

### Gap 3 — User-facing Workflow / Automation builder

**Why**: Everyone buys this. Different from our AI (conversational) — these are deterministic "when X then Y" rules. HubSpot Workflows, Dubsado Workflows, ClickUp Automations.

```ts
workflows: {
  orgId, name, isActive,
  trigger: { event, filters },
  actions: [{ kind: "email.send"|"reminder.create"|"note.add"|"field.update"|"tag.add"|"notification.send"|"wait", args }],
}
workflowRuns: { orgId, workflowId, status, triggerPayload, executedActions }
```

**Target phase**: new feature module `features/workflows/` — reuses AI tool-registry functions as action kinds.

## 4. Industry readiness matrix (post this build + 3 gaps)

| Industry | After this build | After Gap 1 | After Gap 2 | After Gap 3 |
|---|---|---|---|---|
| Dubai Real Estate | ✅ primary template | — | better | better |
| B2B SaaS Sales | ✅ | better | better | better |
| Startup growth sales | ✅ | — | — | — |
| Coaching / consulting | ✅ | much better | much better | better |
| Insurance | ✅ | — | better | much better |
| Recruitment (entity5=Job) | ✅ | — | much better | better |
| Non-profit (donor) | ✅ | — | better | better |
| Basic freelance | 🟡 | much better | **required** | better |
| Agency / design / marketing | ❌ | better | **required** | better |
| Legal (entity5=Matter) | 🟡 | — | **required** | better |
| Construction (entity5=Job) | ❌ | **required** | **required** | better |
| Manufacturing | ❌ | **required** | better | better |
| Field service | ❌ | **required** | better | needs scheduling |
| Photography / events | 🟡 | better | **required** | better |
| Healthcare | ❌ | — | — | — (HIPAA out of scope) |
| Ecommerce | ❌ | — | — | — (wrong paradigm) |

**After all 3 gaps: 12/16 verticals credibly servable.**

## 5. Productivity / work-OS angle (Monday / ClickUp / Notion)

We're ~80% there. Need:
- Ship `features/project-management/` (already designed).
- Add two view types to `EntityListPage`: **`timeline` (Gantt)** and **`calendar`**. Same data, different visuals. Small effort.
- Eventually: doc pages (Notion-style) — big module, defer.

With projects + Gantt + calendar, we'll have a credible "freelance CRM + work OS" (HoneyBook-lite) and "small-agency work OS" (ClickUp-lite) positioning.

## 6. Zero-cost hooks to add during THIS build

Keep options open without slowing down:

1. `modules[slot].meta: v.optional(v.any())` — free-form per-slot config future-proofing.
2. Accept `"industry_template_seed"` as a valid `source` value.
3. Log one `activityLog` per seeded pipeline/field/label on template apply (auditability).
4. Keep entity5/entity6 folder placeholders documented but empty — no code until activated.
5. Document in each field-catalog entry which render kinds also support an `extra` slot for future field-definitions.

## 7. Industries explicitly supported after this build (ship-ready templates)

- Real estate (Dubai — primary)
- Real estate (generic, via entity5 = Property)
- B2B SaaS / startup sales
- Coaching / consulting
- Insurance sales
- Recruitment (entity5 = Job)
- Non-profit (donor management — rename to Donor/Campaign via entityLabels)
- Basic freelance

## 8. Conclusion

**No blockers.** Proceed with Slice 0 immediately. Add Gaps 1–3 to the global roadmap before targeting freelance/agency customers.

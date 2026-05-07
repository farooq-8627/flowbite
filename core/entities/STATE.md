# Entities — State
> Updated: 2026-05-08
> Status: Backend 100% Complete — Frontend: Slice 0 (primitives) NEXT

## ✅ Completed — Backend

| Module | File | Notes |
|---|---|---|
| Schema: all CRM tables | `convex/schema.ts` | leads, contacts, companies, deals, notes, reminders, tags, entityTags, fieldDefinitions, fieldValues, savedViews, pipelines, entityCodeCounters |
| Leads backend | `convex/crm/entities/leads/` | queries + mutations, canonical pattern complete |
| Contacts backend | `convex/crm/entities/contacts/` | queries + mutations, personCode passed from lead |
| Companies backend | `convex/crm/entities/companies/` | queries + mutations |
| Deals backend | `convex/crm/entities/deals/` | queries + mutations, moveToStage + closeAsDone |
| Pipelines backend | `convex/crm/fields/pipelines/` | queries + mutations + helpers |
| Dedup engine | `convex/crm/fields/dedup/helpers.ts` | email/phone/name |
| Notes backend | `convex/crm/shared/notes/` | queries + mutations |
| Reminders backend | `convex/crm/shared/reminders/` | queries + mutations |
| Tags backend | `convex/crm/shared/tags/` | queries + mutations |
| Field definitions | `convex/crm/fields/fieldDefinitions/` | queries + mutations |
| Field values | `convex/crm/fields/fieldValues/` | queries + mutations |
| Saved views | `convex/crm/shared/savedViews/` | queries + mutations |
| App routes | `app/[locale]/(private)/dashboard/[orgSlug]/` | all entity + settings routes |
| Route groups | `app/[locale]/(private)/` | auth guard layout |

## ⬜ Pending — Frontend (Vertical Slices)

| Slice | Task | Priority |
|---|---|---|
| 0 | Shared primitives: DataTable, KanbanBoard, scaffolds, shared components (PersonCodeBadge, StaleIndicator, DynamicFieldRenderer, DedupBanner, AssigneeSelect, TagPicker) | HIGH |
| 1 | Leads list + Contacts list (separate list views, replace stubs) | HIGH |
| 2 | PersonDetailPage at `/people/[personCode]` — unified hub for lead + contact | HIGH |
| 3 | Companies list + detail | MEDIUM |
| 4 | Deals kanban + detail (kanban primary, canvas-confetti on won) | HIGH |
| 5 | Unified Timeline (getForPerson, getForEntity, getForOrg queries + components) | HIGH |
| 6 | Settings pages (replace stubs — PipelinesSettings has stale color/threshold config) | MEDIUM |
| 7 | Dashboard home (real metrics) | HIGH |

## Architecture Notes (Locked — Full Detail in FRONTEND-DECISIONS.md)

- **Entity labels**: NEVER hardcoded — always from `orgSettings.entityLabels` (DB)
- **Route slugs**: NEVER hardcoded — always from `orgSettings.entityLabels[slot].slug` (DB)
- **Person detail page**: ONE page for lead + contact — `/people/[personCode]`
- **Notes**: Inline in Unified Timeline — NOT a separate tab
- **AI capabilities**: Everything the user has permission to do — filtered at tool registry
- **Staleness**: Configurable per stage (`stage.staleColor`, `stage.warningColor`) — never hardcoded
- **Client portal ready**: Permission gates on every section from day one
- **Platform timeline**: `/settings/activity-log` — org-wide, admin only
- **Per-person timeline**: `/people/[personCode]` → Timeline tab — scoped to personCode
- **personCode**: Generated ONLY at lead creation. Passed to contact on conversion. Never regenerated.
- **moveToStage()**: ONLY way to change deal stage. closeAsDone() ONLY way to set wonAt/lostAt.
- **One Function Three Callers**: Every mutation works for UI + AI + WhatsApp + MCP.

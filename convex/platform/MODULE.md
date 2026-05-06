# convex/platform — MODULE.md

**Ownership:** `convex/platform/` | Phase 4+ | Consumers: platform admin dashboard, onboarding (template seeding), pricing page

## Purpose

Platform-level management. `platformTiers` (pricing), `platformTemplates` (industry configs), `platformContext` (AI global context), platform admin queries (aggregated stats only — NEVER customer record content).

## Schema

| Table | Fields |
|-------|--------|
| `platformTiers` | name, price, features (JSON), trialDays, limits, isActive, order |
| `platformTemplates` | key, name, description, isBuiltIn, entityLabels, entityVisibility, codePrefixDefaults, defaultStages, defaultFieldDefinitions, defaultReminderSettings, dashboardMetrics, aiPersona, navHiddenSlots, createdBy, createdAt, updatedAt |
| `platformOrgIdCounter` | count, updatedAt (single global row) |

## Queries

| Function | Access |
|----------|--------|
| `getPublicTiers()` | Public (pricing page) |
| `getPublicTemplates()` | Public (onboarding) |
| `getAggregatedStats()` | `platform_admin` only |
| `getOrgList()` | `platform_admin` only |

## Mutations

| Function | Access |
|----------|--------|
| `updateTier()` | `platform_admin` |
| `createTemplate()` | `platform_admin` |
| `updateTemplate()` | `platform_admin` |
| `applyTemplateToOrg()` | Internal only |

## Hard Separation

`platform_admin` NEVER sees individual customer records. Admin queries return **aggregated stats only** (org count, revenue totals, usage summaries). No access to messages, contacts, deals, or any org-level content.

## Rules

- Public queries (`getPublicTiers`, `getPublicTemplates`) must never require auth
- Admin queries MUST check `platform_admin` role before returning data
- `applyTemplateToOrg()` is internal-only — never exposed as a client mutation
- Template changes do NOT retroactively alter existing orgs (apply is explicit)

## Avoids

- Never expose customer PII through platform admin queries
- Never allow tier/template mutations without `platform_admin` role
- Never return raw org data in aggregated stats — always reduce to counts/sums

## Never-Do

- ❌ Never query individual org records from platform admin context
- ❌ Never expose customer messages, contacts, or deal content to platform admins
- ❌ Never allow public endpoints to mutate platform data
- ❌ Never delete tiers/templates — soft-disable with `isActive: false`

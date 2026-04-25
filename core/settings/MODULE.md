# Settings (Core)

> Settings are a NECESSITY — not a feature. You cannot manage org, members, billing,
> pipelines, or custom fields without them. Settings pages are role-gated (RBAC) but
> NEVER plan-gated. Every org gets Settings regardless of plan tier.

## Ownership
- **Location**: `core/settings/`
- **Routes**: `app/[locale]/dashboard/[orgSlug]/settings/`
- **Phase**: 1+ | **Status**: NOT_STARTED

## Why Core (not Feature)?
The test: *Can the CRM be managed without Settings?*
**NO** — you need settings to: add members, configure pipelines, define fields, manage billing, change org name, control roles. These are necessities. Settings pages are role-gated (admin vs owner vs member) but that's RBAC, not plan-gating.

## Rules
- [ ] R-SET-01: Every settings page MUST wrap content in `<PermissionGate>` — role checked before render
- [ ] R-SET-02: Settings layout has its own sidebar nav (sub-navigation within settings)
- [ ] R-SET-03: All config changes write to Convex tables — never to env vars or localStorage
- [ ] R-SET-04: Pipeline/field/tag settings are admin-only — never visible to member/viewer

## Checklist
- [ ] `layouts/SettingsLayout.tsx` — settings sidebar nav
- [ ] `pages/GeneralSettings.tsx` — org name, logo, timezone (admin+)
- [ ] `pages/MembersPage.tsx` — invite, list, change roles (admin+)
- [ ] `pages/RolesManager.tsx` — GitHub-style permission picker (owner)
- [ ] `pages/BillingPage.tsx` — plan, usage, upgrade (owner)
- [ ] `pages/PipelineSettings.tsx` — pipeline CRUD, stages, colors, stale days (admin+)
- [ ] `pages/FieldSettings.tsx` — field builder, groups, sensitive toggle (admin+)
- [ ] `pages/TagSettings.tsx` — tag CRUD, org-wide (admin+)
- [ ] `pages/EntityLabels.tsx` — rename Lead/Contact/Deal labels, Pro+ (admin+)
- [ ] `pages/AppearanceSettings.tsx` — theme, font, layout prefs (any role)
- [ ] `pages/ActivityLogSettings.tsx` — org-wide audit log viewer (admin+)

## Avoids
- ❌ Never show settings pages without role check
- ❌ Never let non-admin roles access pipeline/field/tag settings

## Permission Matrix
| Page | Required Role |
|---|---|
| General | admin+ |
| Members | admin+ |
| Roles | owner |
| Billing | owner |
| Pipelines | admin+ |
| Fields | admin+ |
| Tags | admin+ |
| Entity Labels | admin+ (Pro+) |
| Appearance | any |
| Activity Log | admin+ |

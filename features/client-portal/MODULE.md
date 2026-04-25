# Client Portal (Feature)

> External client/partner access — scoped, secure, branded. Separate layout from dashboard.

## Ownership
- **Location**: `features/client-portal/`
- **Routes**: `app/[locale]/portal/[orgSlug]/`
- **Phase**: 5 | **Status**: NOT_STARTED

## Rules
- [ ] R-CP-01: Portal has completely separate layout — no sidebar, no internal navigation
- [ ] R-CP-02: Client queries return ONLY their linked project(s) — no org-wide access
- [ ] R-CP-03: Client AI tool registry excludes deal values, internal notes, financial data
- [ ] R-CP-04: Invitation tokens: cryptographically random, single-use, 48-hour expiry
- [ ] R-CP-05: Client cannot access any `/dashboard/` routes — middleware redirects to `/portal/`

## Checklist
- [ ] `layouts/PortalLayout.tsx` — separate from dashboard
- [ ] `components/PortalDashboard.tsx` — client's project view
- [ ] `components/PortalFiles.tsx` — deliverables download
- [ ] `components/PortalInvitation.tsx` — invite flow
- [ ] `components/PortalAI.tsx` — scoped AI for client role

## Avoids
- ❌ Never expose deal values or internal notes to client
- ❌ Never reuse dashboard layout for portal
- ❌ Never share session cookies between dashboard and portal

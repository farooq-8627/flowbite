# Integration Bridges (Feature)

> Inbound data sync ONLY — pull data INTO Orbitly. Not a workflow automation platform.

## Ownership
- **Location**: `features/integrations/`
- **Backend**: `convex/integrations/`
- **Phase**: 6 | **Status**: NOT_STARTED

## Rules
- [ ] R-INT-01: Integrations are data bridges — inbound sync only, NOT workflow automation
- [ ] R-INT-02: AI does NOT auto-create fields — surfaces unmapped fields to admin for review
- [ ] R-INT-03: All credentials encrypted at rest — never exposed to frontend queries
- [ ] R-INT-04: Webhook endpoints validate signatures before processing
- [ ] R-INT-05: 3-step wizard ONLY: Connect → Map Fields → Sync

## Checklist
- [ ] `components/IntegrationWizard.tsx` — 3-step flow
- [ ] `components/FieldMapper.tsx` — map external → Orbitly fields
- [ ] `components/StagingReview.tsx` — admin reviews unmapped fields
- [ ] Backend: CSV import, HubSpot inbound, Zapier endpoint, Slack notify

## Avoids
- ❌ Never auto-create fieldDefinitions from integration data
- ❌ Never build outbound workflow automation (not Zapier)
- ❌ Never expose API keys in client bundle

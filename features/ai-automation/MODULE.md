# AI Automation (Feature)

> AI proactive + scheduled — morning briefing, stale deal detection, email/WhatsApp drafts.

## Ownership
- **Location**: `features/ai-automation/`
- **Backend**: `convex/ai/` (extended), Trigger.dev crons
- **Phase**: 7 | **Status**: NOT_STARTED

## Rules
- [ ] R-AA-01: No AI-generated message EVER leaves the system without explicit user confirmation
- [ ] R-AA-02: Cron jobs are org-scoped — never leak cross-org data
- [ ] R-AA-03: Stale deal detection uses `staleAfterDays` from pipeline config — never hardcoded

## Checklist
- [ ] `components/MorningBriefing.tsx` — daily AI summary card
- [ ] `components/DraftPreview.tsx` — AI email/WhatsApp draft approval
- [ ] `components/ProactiveSuggestion.tsx` — "This deal is stuck" cards
- [ ] Trigger.dev crons: morning briefing, stale deal detector

## Avoids
- ❌ Never auto-send emails/WhatsApp without user approval
- ❌ Never hardcode stale thresholds

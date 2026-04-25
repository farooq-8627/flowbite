# onboarding Module (Core)

> 3-step wizard — get to dashboard in < 2 minutes. No field customization during onboarding.

## Ownership
- **Location**: `core/onboarding/`
- **Routes**: `app/[locale]/onboarding/`
- **Phase**: 1 | **Status**: NOT_STARTED

## Rules
- [ ] R-ONB-01: Maximum 3 steps — never add more steps to onboarding
- [ ] R-ONB-02: Only seed DEFAULT pipeline in Step 2 — no field templates during onboarding
- [ ] R-ONB-03: On complete, set `users.onboardingCompleted = true` → redirect to dashboard
- [ ] R-ONB-04: Onboarding route accessible ONLY to authenticated + onboarding-incomplete users

## Checklist
- [ ] `components/OnboardingWizard.tsx` — step container
- [ ] `components/OrgNameStep.tsx` — Step 1: org name + your name
- [ ] `components/IndustryPicker.tsx` — Step 2: industry → seeds default pipeline
- [ ] `components/CompleteStep.tsx` — Step 3: complete → dashboard
- [ ] `hooks/useOnboarding.ts` — step state + completion mutation

## Avoids
- ❌ Never add field customization to onboarding (that's AI Workspace Setup in Phase 3)
- ❌ Never add more than 3 steps
- ❌ Never block onboarding on external API calls

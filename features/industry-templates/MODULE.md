# Industry Templates (Feature)

> Config bundles that seed pipelines, fields, labels, metrics, AI persona per industry.

## Ownership
- **Location**: `features/industry-templates/`
- **Phase**: 2 | **Status**: NOT_STARTED

## Rules
- [ ] R-IT-01: Templates are config files only — no runtime DB tables for templates
- [ ] R-IT-02: AI can CREATE new templates from conversation (premium tier)
- [ ] R-IT-03: Templates seed on onboarding Step 2 (industry picker)

## What a Template Seeds
1. Pipeline stages (industry-specific)
2. Default field definitions
3. Entity labels (Lead → "Inquiry" for freelancer)
4. Dashboard metrics (industry KPIs)
5. AI persona instructions
6. Nav visibility (hide Companies for freelancer)

## Checklist
- [ ] `config/b2b-sales.ts` — pipeline + fields + labels + metrics + AI persona
- [ ] `config/freelancer.ts`
- [ ] `config/productivity.ts`

## Avoids
- ❌ Never create DB tables for templates — they are static config files
- ❌ Never hardcode template selection — let AI generate new ones from conversation

# CSV Import (Core)

> Upload → Map → Preview → Import wizard for bulk data ingestion.
> Core because every new org NEEDS to bring their existing data in. You cannot onboard without it.

## Ownership
- **Location**: `core/csv-import/`
- **Backend**: `trigger/imports/processCSVImport.ts`
- **Phase**: 2 | **Status**: NOT_STARTED

## Rules
- [ ] R-CSV-01: Import runs as Trigger.dev background job (not blocking UI)
- [ ] R-CSV-02: AI assists field mapping — suggests which CSV column → which Orbitly field
- [ ] R-CSV-03: Preview shows first 10 rows before committing import
- [ ] R-CSV-04: Dedup check runs on each row during import

## Checklist
- [ ] `components/ImportWizard.tsx` — 4-step flow
- [ ] `components/FieldMapper.tsx` — AI-assisted column mapping
- [ ] `components/ImportPreview.tsx` — preview rows before import

## Avoids
- ❌ Never import without preview
- ❌ Never skip dedup check on imported rows
- ❌ Never run import synchronously — always Trigger.dev

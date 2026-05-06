# CSV Import Module (Core)

> Flexible, AI-assisted data import wizard. Handles any CSV structure from any business.
> AI analyzes column headers and suggests field mappings — user reviews and approves.
> Background processing via Trigger.dev. Real-time progress. Error CSV download.

## Ownership
- **Location**: `core/csv-import/`
- **Backend**: `convex/csvImports/`, `trigger/imports/processCSVImport.ts`
- **Phase**: 2 | **Status**: NOT_STARTED

---

## The Problem With Traditional CSV Import

Traditional CRM importers require users to manually map every column to a field.
This is slow, error-prone, and fails completely when column names don't match system names.

Orbitly's approach: **AI does the mapping, user approves.**

```
Business A's CSV:         Business B's CSV:         Business C's CSV:
"first_name"              "contact"                 "الاسم"
"email_address"           "email"                   "البريد الالكتروني"
"deal_amount"             "contract_value"          "قيمة_العقد"
"property_type"           "product_category"        "نوع_العقار"

AI maps ALL of these to the same Orbitly fields automatically.
User just clicks "Accept All" or tweaks individual mappings.
```

---

## 5-Step Import Wizard

```
Step 1: Choose Entity Type + Upload File
  ├── Entity selector: [Leads ▾] / Contacts / Companies / Deals
  ├── Drag-and-drop CSV / XLSX area
  └── "Download sample CSV" link (based on selected entity type)

Step 2: AI Column Mapping (THE KEY STEP)
  ├── AI analyzes: CSV headers + first 3 data rows
  ├── Shows mapping table:
  │
  │   Your CSV Column          →  Orbitly Field          Confidence
  │   ─────────────────────────────────────────────────────────────
  │   "first_name"             →  displayName            ████ 98%   [Change ▾]
  │   "email_address"          →  email                  ████ 95%   [Change ▾]
  │   "phone_number"           →  phone                  ████ 97%   [Change ▾]
  │   "deal_amount"            →  budget_aed (custom)    ███░ 82%   [Change ▾]
  │   "source_website"         →  [Not mapped]           ░░░░  0%   [Map ▾] [Create Field] [Ignore]
  │   "notes_column"           →  [Not mapped]           ░░░░  0%   [Map ▾] [Create Field] [Ignore]
  │
  ├── [Accept All Mappings]  [Review Each]
  └── Bulk actions: [Ignore all unmapped] [Create fields for unmapped]

Step 3: Preview
  ├── Shows first 5 rows with resolved field values
  ├── Highlights any rows with issues (missing required fields, wrong format)
  └── [Continue] [Back to Mapping]

Step 4: Dedup Options
  ├── "We found X rows that may already exist in your system"
  ├── Options:
  │   ○ Skip duplicates (safe default)
  │   ○ Overwrite existing records
  │   ○ Create as new regardless
  ├── Dedup matching by: Email (primary) + Name (fuzzy, secondary)
  └── [Start Import]

Step 5: Progress + Summary
  ├── Real-time progress bar (updates via Convex reactive query)
  │   "Processing: 247 / 500 records..."
  ├── Live counts: ✓ Success: 241  ⚠ Skipped (dupes): 6  ✗ Errors: 3
  ├── On complete: full summary
  └── [Download Error CSV] (rows that failed, with reason column)
```

---

## AI Column Mapping — Implementation

```typescript
// convex/csvImports/actions.ts::analyzeColumns
export const analyzeColumns = internalAction({
  args: {
    headers:    v.array(v.string()),    // CSV column headers
    sampleRows: v.array(v.any()),       // First 3 rows of data
    entityType: v.string(),
    orgId:      v.id("orgs"),
  },
  handler: async (ctx, args) => {
    // 1. Load org's field definitions (standard + custom fields)
    const fieldDefs = await ctx.runQuery(internal.fieldDefinitions.listAll, {
      orgId: args.orgId, entityType: args.entityType,
    });

    // 2. Call Claude haiku to match headers → fields
    const prompt = `You are mapping CSV columns to CRM fields.
      CSV Headers: ${JSON.stringify(args.headers)}
      Sample data (first 3 rows): ${JSON.stringify(args.sampleRows)}
      Available CRM fields: ${JSON.stringify(fieldDefs.map(f => ({ name: f.name, label: f.label, type: f.type })))}

      For each CSV header, provide:
      - fieldName: exact field name from available fields, or null if no good match
      - confidence: 0-100 (how confident you are in this mapping)
      - reason: brief explanation

      Return JSON array only, no other text.`;

    const response = await callClaudeHaiku(prompt);
    const mappings = JSON.parse(response);

    return mappings.map((m: any, i: number) => ({
      csvHeader:   args.headers[i],
      fieldName:   m.fieldName,
      confidence:  m.confidence,
      reason:      m.reason,
      action:      m.fieldName ? "map" : "ignore",  // user can override
    }));
  },
});
```

---

## Background Processing — Trigger.dev Job

```typescript
// trigger/imports/processCSVImport.ts
export const processCSVImport = task({
  id: "process-csv-import",
  run: async ({ importId, orgId, entityType, mappings, dedupStrategy }) => {
    // 1. Download CSV from Convex file storage
    const csvData = await downloadFromConvexStorage(importId);
    const rows = parseCSV(csvData);

    // 2. Track progress in Convex (real-time)
    await convex.mutation(api.csvImports.updateProgress, {
      importId, total: rows.length, processed: 0, success: 0, skipped: 0, errors: 0,
    });

    const errorRows: ErrorRow[] = [];

    // 3. Process in batches of 50
    for (let i = 0; i < rows.length; i += 50) {
      const batch = rows.slice(i, i + 50);

      await Promise.allSettled(batch.map(async (row, batchIdx) => {
        try {
          const rowIndex = i + batchIdx;
          const mapped = applyMappings(row, mappings);

          // Validate required fields
          if (!mapped.displayName && !mapped.name && !mapped.title) {
            errorRows.push({ row: rowIndex, data: row, error: "Missing required name field" });
            return;
          }

          // Use the SAME canonical mutation as UI and AI
          const result = await convex.mutation(api[entityType].create, {
            ...mapped,
            source: "csv",          // source tracks origin
            orgId,
          });

          if (result.duplicates?.length > 0 && dedupStrategy === "skip") {
            // Mark as skipped
          }
        } catch (err) {
          errorRows.push({ row: i + batchIdx, data: row, error: String(err) });
        }
      }));

      // Update progress after each batch
      await convex.mutation(api.csvImports.updateProgress, {
        importId,
        processed: Math.min(i + 50, rows.length),
        errors:    errorRows.length,
      });
    }

    // 4. Complete — store error rows for download
    await convex.mutation(api.csvImports.complete, {
      importId,
      successCount: rows.length - errorRows.length,
      errorCount:   errorRows.length,
      errorRows:    errorRows.length > 0 ? errorRows : undefined,
    });
  },
});
```

---

## Supported File Types
- `.csv` — UTF-8 and UTF-16 (handles Arabic/non-ASCII)
- `.xlsx` / `.xls` — via SheetJS (client-side conversion to CSV before upload)

## Supported Entity Types
- Leads (Phase 2)
- Contacts (Phase 2)
- Companies (Phase 2)
- Deals (Phase 2)
- Entity5/Entity6 (when activated)

---

## Convex Backend

```typescript
// convex/csvImports/queries.ts
export const getStatus = orgQuery({
  args: { importId: v.id("csvImports") },
  handler: async (ctx, args) => ctx.db.get(args.importId),
  // Real-time: Convex subscription keeps progress bar updated
});

// convex/csvImports/mutations.ts
export const initImport = orgMutation({
  args: { entityType: v.string(), fileName: v.string(), storageId: v.id("_storage") },
  handler: async (ctx, args) => {
    await requirePermission(ctx, `${args.entityType}s.import`);
    return ctx.db.insert("csvImports", {
      orgId:      ctx.org._id,
      createdBy:  ctx.user._id,
      entityType: args.entityType,
      fileName:   args.fileName,
      storageId:  args.storageId,
      status:     "analyzing",
      total:      0, processed: 0, success: 0, skipped: 0, errors: 0,
      createdAt:  Date.now(),
    });
  },
});
```

---

## Component Structure

```
core/csv-import/
├── MODULE.md
├── components/
│   ├── ImportWizard.tsx         # 5-step container + step tracking
│   ├── Step1Upload.tsx          # Entity selector + drag-and-drop + sample download
│   ├── Step2Mapping.tsx         # AI mapping table + manual overrides
│   ├── Step3Preview.tsx         # First 5 rows with resolved values + issue highlighting
│   ├── Step4Dedup.tsx           # Dedup strategy selector
│   ├── Step5Progress.tsx        # Real-time progress + summary + error download
│   ├── MappingRow.tsx           # Single column mapping row with confidence bar
│   └── CreateFieldInline.tsx    # Quick field creation for unmapped columns
└── hooks/
    ├── useImportWizard.ts       # Step state + wizard flow management
    └── useImportProgress.ts     # Convex subscription for real-time progress
```

---

## Rules
- [ ] R-CSV-01: AI suggests mappings, user must approve — never auto-apply without review
- [ ] R-CSV-02: Processing via Trigger.dev background job — never block UI thread
- [ ] R-CSV-03: Progress tracked in Convex table — real-time updates via subscription
- [ ] R-CSV-04: Import calls SAME canonical mutations as UI/AI (source: "csv")
- [ ] R-CSV-05: Error rows downloadable as CSV with "error" column appended
- [ ] R-CSV-06: Support: UTF-8, UTF-16 (Arabic), XLSX conversion
- [ ] R-CSV-07: Required field validation before inserting — show clear error per row

## Avoids
- ❌ Never process CSV synchronously in a Convex mutation (rows limit)
- ❌ Never auto-import without user reviewing AI mappings
- ❌ Never delete existing data during import — skip or overwrite only (no delete)
- ❌ Never pass raw CSV data to Claude — only headers + 3 sample rows

## Tables Owned
| Table | Purpose |
|---|---|
| `csvImports` | Import job tracking — `status`, `total`, `processed`, `success`, `errors`, `errorRows` |

# convex/dedup — MODULE.md

**Ownership:** `convex/dedup/` | Phase 2  
**Schema:** None (helper module only)

## Purpose

Shared dedup engine used by leads AND contacts. Checks for duplicates before entity creation. Returns possible matches — caller decides what to do (UI shows DedupBanner, AI shows disambiguation cards).

## Logic

| Check | Confidence |
|-------|-----------|
| Email exact match | High |
| Phone normalization + match | Medium |
| Fuzzy name match (Levenshtein) | Low |

## Export

```ts
runDedup(ctx, { email?, name?, phone? }) → DuplicateResult[]
```

Never auto-merges. Returns candidates. User/AI decides.

## Rules

- Always normalize phone before comparison (strip spaces, dashes, country code variants)
- Return ALL matches above threshold, sorted by confidence descending
- Include the matched field(s) in each DuplicateResult so caller knows why it matched
- Scope all queries to the caller's orgId

## Avoids

- No direct DB writes — this is a read-only helper
- No UI logic — returns data only, presentation is caller's job
- No merging logic — dedup detects, never resolves
- No cross-org matching

## Never Do

- ❌ Never auto-merge or auto-delete duplicates
- ❌ Never expose results outside the org boundary
- ❌ Never skip phone normalization
- ❌ Never return a single "best match" — always return the full candidate list
- ❌ Never add schema/tables — this module owns no data

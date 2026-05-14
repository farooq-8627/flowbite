# Dynamic Fields — System Summary

> Updated: 2026-05-15
> Status: **SHIPPED.** Phases 0 → 9 of the original blueprint complete.
> Owner: Entities + Settings + Industry Templates

This doc replaces the old multi-page blueprint with the trimmed reality: what
got built, how it works, what to highlight on the marketing site, and what's
left to polish. Read this before touching the field system.

---

## 1. What was shipped (one paragraph)

Every field a lead/contact/deal/company has — `displayName`, `email`, `phone`,
`status`, `assignedTo`, `tags`, `personCode`, AND admin-added `budget` /
`propertyType` / `resume` — is a row in `fieldDefinitions`. That table is the
**only** place fields are defined. Everything else (form, table, board card,
profile, view-options, AI tools) reads from it. There is no "built-in" vs
"custom" distinction in the UI.

Add a field once → it appears as a column in the table, an input in the form,
a toggle in View Options, and (if you flag it on the card) a highlighted chip
on the kanban card. Reorder once → the new sequence applies everywhere.
Hide once → it's invisible everywhere for everyone (admin-global) OR for
just one user (per-user, in View Options).

---

## 2. The two tables that make this work

| Table | Purpose | Spreadsheet analogy |
|---|---|---|
| `fieldDefinitions` | **Schema** — defines what fields exist for an entity type. One row per (org, entityType, fieldName). | Column header |
| `fieldValues` | **Data** — stores the actual value per entity row. One row per (entity instance, field). | A cell |

System fields (`name`, `email`, `status`, `assignedTo`) live as actual columns
on `leads`/`contacts`/`deals`/`companies` (because they're indexed and joined).
We add a `fieldDefinitions` row with `storage: "column", columnKey: "email"` so
the renderer reads from `lead.email` instead of from `fieldValues`.

Storage modes:
- `storage: "column"` → value lives on the entity row.
- `storage: "fieldValues"` → value lives in EAV `fieldValues` table.
- `storage: "join"` → value lives in a dedicated join table (e.g. tags).

---

## 3. How it all connects (one diagram)

```
                           ┌─────────────────────────────────────────┐
   onboarding ──seed───►   │  fieldDefinitions (org-scoped DB rows)  │
   AI / admin ──CRUD───►   └─────────────────────────────────────────┘
                                          │
                                          ▼
                          ┌──────────────────────────────────┐
                          │  useEntityFields(slot)           │
                          │   { allFields, visibleFields,    │
                          │     tableFields, formFields,     │
                          │     cardPinnedKinds }            │
                          └──────────────────────────────────┘
                                          │
              ┌────────────┬──────────────┼──────────────┬──────────────┐
              ▼            ▼              ▼              ▼              ▼
        useEntity     EntityField   ViewOptions    EntityCard       EntityOverview
        Columns       Form          Menu           (highlights)     (profile)
        (table)       (drawer)      (toolbar)
```

---

## 4. The dispatch pattern (renderers)

`getCellRenderer(field)` (cells/cell-dispatcher.tsx) and `getInputRenderer(field)`
(inputs/input-dispatcher.tsx) both work like this:

```
KIND_RENDERER[field.kind] (if set)
  → TYPE_RENDERER[field.type]
    → defaultRenderer (plain text)
```

So adding a new TYPE of field is zero-code (just insert a `fieldDefinitions`
row); adding a new RENDERER (e.g. `signature`) means adding one entry to the
KIND_RENDERER map in both dispatchers.

---

## 5. Where each piece of the system lives

| Concern | File |
|---|---|
| Hook (single source of truth) | `core/entities/shared/hooks/useEntityFields.ts` |
| Cell dispatcher (table) | `core/entities/shared/components/cells/cell-dispatcher.tsx` |
| Input dispatcher (form) | `core/entities/shared/components/inputs/input-dispatcher.tsx` |
| Generic table column builder | `core/entities/shared/hooks/useEntityColumns.tsx` |
| Generic form | `core/entities/shared/components/EntityFieldForm.tsx` |
| Card | `core/entities/shared/components/EntityCard.tsx` (hand-designed slots + highlight chips) |
| View Options menu (per-user toggles) | `core/entities/shared/components/ViewOptionsMenu.tsx` |
| Settings: Display | `core/settings/components/groups/modules/ModuleDisplaySection.tsx` |
| Settings: Fields | `core/settings/components/groups/modules/SlotFieldsSection.tsx` (drag-reorder, hide, edit, delete) |
| Lazy seed for legacy orgs | `convex/crm/fields/fieldDefinitions/internal.ts::ensureForOrg` |
| Industry presets | `convex/orgs/templates/fields.ts` (seed source) |

---

## 6. The contract every consumer obeys

1. `fieldDefinitions` is the only source of metadata. **No** hardcoded field
   lists.
2. `order` drives sequence everywhere — form, table, profile, view options.
3. `hidden: true` → invisible to everyone (admin-global).
4. `users.preferences.entityViewColumns[slot]` → per-user table column
   visibility (the toolbar's View Options menu writes here).
5. `kind` dispatches the renderer; `type` is the fallback.
6. `storage` tells code where the value lives (column / fieldValues / join).
7. `protected: true` cannot be hidden or deleted — never appears as a toggle
   in View Options.
8. `system: true` cannot be deleted, but can be hidden by admin in Settings.
9. Card layout is hand-designed — `cardPinnedKinds` (displayName/email/tags/
   personCode/entityCode) have designed slots. Other admin-flagged fields
   render as highlight chips between identity and action rows.

---

## 7. What's worth showing on the marketing site

| Feature | Why it matters | One-line pitch |
|---|---|---|
| **Industry presets** | New org's first hour saved — Lead, Contact, Deal, Company labels + fields are pre-loaded. | "Pick your industry. We do the rest." |
| **Rename in 5 seconds** | Settings → Workspace → Entity Labels. URL slugs flip live. | "‘Lead’ in your industry is ‘Inquiry’? Type it. Done." |
| **Add a field, see it everywhere** | Add Budget → it's a column, an input, a card chip, a profile field. | "One field. Every screen." |
| **Drag-reorder fields** | Settings → Modules → [Entity] → Fields. Sequence applies to forms, tables, profile. | "Reorder once. Everywhere updates." |
| **Per-user view options** | Each user picks the columns/card fields they care about. | "Your view, your rules." |
| **Per-org admin hide** | Admin can hide a field globally for everyone. | "One toggle hides it everywhere." |
| **First-time coachmarks** | New users see the gestures they need (single/double-click convert, drag-to-status), once. | "We teach the gesture. Once." |
| **Single-click instant convert** | One click on a lead card converts it; double-click opens the full convert form with the deal option. | "Click to convert. Double-click for options." |
| **Stage-aware fields** | Deal fields can be marked as "show only at this stage" so forms stay clean. | "Right field. Right stage." |
| **Tag picker with create-on-the-fly** | New tag right from the dropdown — no leaving the form. | "Tag as you type." |
| **AI summary slot** | One- or two-line auto-summary on every kanban card (where wired). | "Skim a card. Know the deal." |
| **Universal file storage** | Any entity (lead/contact/deal/company/org) can attach files via the same components. | "Drop a file. Anywhere." |

---

## 8. Drawbacks / things to be careful with

| Risk | Mitigation |
|---|---|
| Renaming a field's `name` (vs `label`) would break `fieldValues.fieldName` rows. | Treat `name` as immutable after creation. The Fields editor only allows label changes. |
| One Convex query per page reads `fieldDefinitions`. | Cached by Convex's reactive layer — negligible cost, but don't call it inside loops. |
| Special renderers still need code (e.g. `signature` kind). | Adding a `kind` requires a new entry in cell + input dispatchers. Adding a field of an EXISTING kind is zero-code. |
| Tables can't filter columns by stage automatically. | We deliberately don't — see §9 for the patterns we picked. |
| Lazy seed runs once on first read for legacy dev orgs. | Idempotent on the server; safe to drop in production data. |

---

## 9. Stage-aware patterns (decision)

Tables show many entities across many stages at once. Filtering columns by
"current stage" makes no sense without a single canonical stage to anchor on.
We use these patterns instead:

- **Stage filter** at the top of the table — picks a stage, scopes both rows
  and columns. (Status: planned, doc only.)
- **Saved views** — user toggles columns in View Options, saves the
  arrangement as a named view they can switch back to. (Status: planned,
  user-pref schema in place — UI pending.)

These are the table-level controls. The form layer already honors
`showInStages` per-deal, so deal forms stay tight to the current stage.

---

## 10. Open / pending tasks

| # | Task | Priority | Notes |
|---|---|---|---|
| 1 | Stage filter UI on table toolbars | DONE | Shipped Round 5 — `core/entities/shared/components/StageFilter.tsx`. Wired into DealsView's list-view toolbar. |
| 2 | Saved views (named column sets per user) | DONE | Shipped Round 5 — `users.preferences.savedViews[slot]` schema in place. UI: `core/entities/shared/components/SavedViewsMenu.tsx`. |
| 3 | Card highlight admin picker | LOW | Currently driven by cardFields; later, an admin-only "show on card" toggle in the Fields manager. |
| 4 | AI summary generation pipeline | MEDIUM | Schema slot exists (`item.aiSummary`); generator + cron pending. **Deferred to AI phase.** |
| 5 | "Replay tutorials" button in Appearance settings | LOW | Calls `resetAllTours()` from `components/ui/first-time-tour.tsx`. |
| 6 | Files tab on each entity detail view | RESOLVED | **Decision (Round 5):** files attach only at org-wide or personCode scope. Deal / company surfaces files via `tags=["deal:CODE"]`/`tags=["company:CODE"]` attribution — no per-entity Files tab needed. |
| 7 | File-type admin policy | DONE | Shipped Round 5 — Settings → Workspace → File Policy. Multi-select of categories + max size MB. |
| 8 | Buffered file upload during entity create | DONE | Shipped Round 5 — `useFileBuffer` hook + `FileBufferProvider` + `BufferedFileUpload`. Bytes upload immediately, the file row is recorded after entity creation. |

---

## 11. How efficient is this now?

- **One** field-definition table replaces three previous places (FIELD_CATALOG
  hardcoded + DEFAULT_LIST_COLUMNS hardcoded + DEFAULT_CARD_FIELDS hardcoded).
- **One** hook (`useEntityFields`) feeds five consumers (table, form, card,
  profile, view options).
- **Two** dispatchers (cell + input) cover every renderer with one entry per
  `kind`.
- **One** mutation seeds an org's fields from an industry template
  (`ensureForOrg`).
- **Zero** code changes when an admin adds a Budget / MOU date / résumé /
  property-type field — it just appears.

The rule of thumb: if you're touching field metadata in code, you're doing it
wrong. Touch the DB row instead.

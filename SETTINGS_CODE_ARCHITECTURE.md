# Settings — Code Architecture

> **Scope**: Lean status doc. What's built, what's next, non-negotiable rules.
> **Route**: `/{locale}/{orgSlug}/settings` — single page, `?group=` query param.
> **Last Updated**: 2026-05-12

---

## Current Status

| Area | Status |
|---|---|
| Layout shell (`SettingsView` + nav + content) | ✅ Built |
| Topnav-injected sub-group toolbar (NavSlot pattern) | ✅ Built |
| Per-section save (react-hook-form + zod) | ✅ Built |
| Inline Fuse.js search (VS Code style) | ✅ Built |
| Scrollspy sub-group highlight | ✅ Built |
| Sub-group pill click → `scrollToSection` (container-scoped) | ✅ Fixed 2026-05-12 (was causing layout shift) |
| Dynamic entity labels via `useEntityLabels()` | ✅ Wired into CRM group (Tags + Fields tabs) |
| WorkspaceGroup (general + entity labels + record codes) | ✅ Built |
| CRMGroup (pipelines + fields + tags + reminders) | ✅ Built |
| TeamGroup (members + roles editor) | ✅ Built |
| AppearanceGroup (theme + layout cookies) | ✅ Built |
| NotificationsGroup (group-wise toggles) | ✅ Built |
| ShortcutsGroup (read-only reference) | ✅ Built |
| AIGroup (context + usage meter) | ✅ Built |
| BillingGroup (plan + usage placeholder) | ✅ Built |
| DataGroup (export + danger zone) | ✅ Built |

---

## Pending

| # | Task | Priority | Notes |
|---|---|---|---|
| 1 | Wire `useEntityLabels()` into WorkspaceGroup **Entity Labels section** placeholders | LOW | Row labels (Lead / Contact / Deal / Company) are intentionally the default names — they label the row being edited, not the current value. Only the **input values** need to be dynamic, which they already are (via `resolveEntityLabels`). Close this ticket after one more review pass. |
| 2 | WorkspaceGroup: **logo upload** (Convex `_storage`) | MEDIUM | Schema field `logoStorageId` exists. UI placeholder only. |
| 3 | WorkspaceGroup: **modules visibility + drag-reorder** | MEDIUM | Backend supports `orgs.settings.modules[]`. UI not built. Needs `@dnd-kit` (already installed). |
| 4 | CRMGroup > PipelinesSection: **stale color + warning threshold** pickers per stage | MEDIUM | Schema fields `stage.staleColor`, `stage.warningAfterDays`, `stage.warningColor` exist. Stage editor shows name + color only. |
| 5 | CRMGroup > FieldsSection: **drag-reorder fields**, **stage-scoped fields** (`showInStages`) | MEDIUM | Backend + schema ready. Field editor is plain list. |
| 6 | TeamGroup > Members: **invite flow** (select role, send email) | MEDIUM | List + role change work. Invite button not wired. |
| 7 | AIGroup: **"Re-run AI workspace setup"** button → conversation | LOW | Phase 3 dependency (AI tools). |
| 8 | BillingGroup: **LemonSqueezy checkout** + usage meters | HIGH | Blocks paid plans. No LS integration yet. |
| 9 | DataGroup > Export: actual CSV/JSON generation | MEDIUM | Requires Trigger.dev job. |
| 10 | DataGroup > Danger Zone: **type-org-name-to-confirm** soft-delete flow | MEDIUM | Mutation exists. UI wiring pending. |
| 11 | Code prefix change: **Trigger.dev background rename job** | LOW | Prefix save works. Existing records aren't renamed. Low because prefix changes are rare. |
| 12 | Mobile: collapse sub-group toolbar into an accordion on < 640px | LOW | Currently horizontally scrolls on mobile — works but not ideal. |

---

## Non-Negotiable Rules (enforced in every group/section)

| # | Rule |
|---|---|
| R-SET-01 | Never hardcode entity names in UI text — use `useEntityLabels()` (or `resolveEntityLabels(org.entityLabels)` when you already have `org`). |
| R-SET-02 | Every section wraps in `<PermissionGate>` (or is role-filtered by the nav — see `settings-nav.ts`). |
| R-SET-03 | RTL-safe classes only — `ms-*`, `me-*`, `ps-*`, `pe-*`, `start-*`, `end-*`. |
| R-SET-04 | `rounded-[var(--radius)]` only — never `rounded-md` / `rounded-lg` / `rounded-xl`. |
| R-SET-05 | Per-section save. No global save button. Each section is its own form + mutation. |
| R-SET-06 | Lazy load group data — CRM/Team queries skip until their group is active. |
| R-SET-07 | `APP_CONFIG.name` — never hardcode the app name. |
| R-SET-08 | `app/` is a thin wrapper — zero logic in `page.tsx`. |
| R-SET-09 | **Never** call `Element.scrollIntoView()` inside the settings shell. Use `scrollToSection` from `useSettingsSearch.ts` which scrolls only the `main[data-settings-scroll]` container. (See AGENTS.md global rule.) |

---

## File Layout (current, stable)

```
core/settings/
├── MODULE.md
├── views/
│   └── SettingsView.tsx          # Main view (nav + content + topnav toolbar)
├── components/
│   ├── SettingsNav.tsx           # Left rail — top-level groups
│   ├── SettingsSearch.tsx        # Fuse.js input
│   ├── SettingsContent.tsx       # Right panel, renders active group
│   ├── shared/
│   │   ├── SettingsSection.tsx   # Card wrapper (honors search filter)
│   │   ├── SettingsRow.tsx       # Label + control
│   │   ├── SettingsFormRow.tsx   # Form-bound row
│   │   ├── SettingsSaveButton.tsx
│   │   ├── FloatingLabelInput.tsx
│   │   └── DangerZone.tsx
│   └── groups/
│       ├── WorkspaceGroup.tsx
│       ├── TeamGroup.tsx           (+ team/RoleEditor.tsx)
│       ├── CRMGroup.tsx            (+ crm/PipelineEditor.tsx, crm/FieldEditor.tsx)
│       ├── AIGroup.tsx
│       ├── AppearanceGroup.tsx
│       ├── NotificationsGroup.tsx
│       ├── ShortcutsGroup.tsx
│       ├── BillingGroup.tsx
│       └── DataGroup.tsx
├── config/
│   ├── settings-nav.ts           # SETTINGS_GROUPS
│   └── settings-sections.ts      # Flat search index (Fuse.js source)
├── hooks/
│   ├── useActiveGroup.ts         # ?group= URL sync
│   ├── useSettingsSearch.ts      # Fuse search + scrollToSection
│   └── useSettingsForm.ts        # Shared RHF + zod setup
└── context/
    └── search-filter.tsx         # Hides non-matching <SettingsSection> in search mode

app/[locale]/(private)/[orgSlug]/settings/
└── page.tsx                      # Thin wrapper: <SettingsView orgSlug={orgSlug} />
```

---

## Key Patterns (ship-ready, copy these)

### Label-aware section description

```tsx
// Dynamic strings referencing entity names MUST come from labels.
const tagsDescription =
  `Shared tags for categorizing ${labels.lead.plural.toLowerCase()}, ` +
  `${labels.contact.plural.toLowerCase()}, and ` +
  `${labels.deal.plural.toLowerCase()}.`;

<SettingsSection id="crm.tags" title="Tags" description={tagsDescription}>
  …
</SettingsSection>
```

### Layout-shift-safe section scroll

```ts
// See useSettingsSearch.ts — never el.scrollIntoView() in this shell.
import { scrollToSection } from "@/core/platform/settings/hooks/useSettingsSearch";
scrollToSection("crm.tags");  // scrolls the inner <main> only
```

### Scroll container marker

```tsx
// Every <main> that is a scroll container must carry a data attribute so
// handlers can target it without brittle class selectors.
<main data-settings-scroll="true" className="flex-1 overflow-y-auto …">
```

---

## Backend Queries Used (stable)

| Query | Purpose |
|---|---|
| `api.orgs.queries.listMyOrgs` | Workspace switcher + orgId lookup from slug |
| `api.orgs.queries.getFullSettings({ orgId })` | Main settings load (1 round trip) |
| `api.orgs.queries.getEntityLabels({ orgId })` | `useEntityLabels()` |
| `api.orgRoles.queries.getMyPermissions({ orgId })` | Nav filtering + PermissionGate |
| `api.crm.fields.pipelines.queries.listByOrg` | CRM > Pipelines |
| `api.crm.shared.tags.queries.listByOrg` | CRM > Tags |
| `api.crm.fields.fieldDefinitions.queries.listByEntity` | CRM > Custom Fields |

---

## Avoids (do not regress these)

- ❌ Never plan-gate settings — only role-gate.
- ❌ Never create sub-routes under `/settings`.
- ❌ Never run code-prefix rename synchronously — always a Trigger.dev job.
- ❌ Never use `Element.scrollIntoView()` inside the dashboard shell.
- ❌ Never use Cloudinary — Convex `_storage` only.
- ❌ Never allow reserved slugs — validate against `RESERVED_SLUGS`.
- ❌ Never hardcode entity names, app name, or border-radius.

---

## Cross-References

- Global coding rules: `AGENTS.md` (root)
- Base agent instructions: `.github/agents/base/AGENT.md`
- Frontend decisions (entity labels, personCode, notes/timeline): `FRONTEND-DECISIONS.md`
- Module-specific rules: `core/settings/MODULE.md`
- Settings module state: `core/settings/STATE.md`

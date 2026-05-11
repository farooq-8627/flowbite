# Settings — Frontend Architecture Checklist

> **Scope**: UI-layer checklist only. Backend status lives in `Phase-2-progress.md`.
> **Last Updated**: 2026-05-12

---

## ✅ Layout & Primitives (shipped)

| Item | File |
|---|---|
| SettingsView main entry | `core/settings/views/SettingsView.tsx` |
| Left nav (top-level groups) | `core/settings/components/SettingsNav.tsx` |
| Right content router | `core/settings/components/SettingsContent.tsx` |
| Topnav-slot sub-group toolbar | `core/settings/views/SettingsView.tsx` (`SettingsToolbar`) |
| Section card wrapper | `core/settings/components/shared/SettingsSection.tsx` |
| Label+control row | `core/settings/components/shared/SettingsRow.tsx` |
| Form-bound row | `core/settings/components/shared/SettingsFormRow.tsx` |
| Per-section save button | `core/settings/components/shared/SettingsSaveButton.tsx` |
| Shared RHF+zod hook | `core/settings/hooks/useSettingsForm.ts` |
| ?group= URL sync | `core/settings/hooks/useActiveGroup.ts` |
| Fuse.js inline search | `core/settings/hooks/useSettingsSearch.ts` |
| Scroll-container-safe scrollToSection | `core/settings/hooks/useSettingsSearch.ts` |
| Scrollspy sub-group highlight | `core/settings/views/SettingsView.tsx` (IntersectionObserver) |
| Flat search index | `core/settings/config/settings-sections.ts` |

## ✅ Groups (shipped)

| Group | Status | File |
|---|---|---|
| Workspace (general + entity labels + record codes) | ✅ | `WorkspaceGroup.tsx` |
| Team (members + roles editor) | ✅ | `TeamGroup.tsx` + `team/RoleEditor.tsx` |
| CRM (pipelines + fields + tags + reminders) | ✅ | `CRMGroup.tsx` + `crm/PipelineEditor.tsx` + `crm/FieldEditor.tsx` |
| AI (context + usage) | ✅ | `AIGroup.tsx` |
| Appearance (theme + layout) | ✅ | `AppearanceGroup.tsx` |
| Notifications (group-wise toggles) | ✅ | `NotificationsGroup.tsx` |
| Shortcuts (reference) | ✅ | `ShortcutsGroup.tsx` |
| Billing (stub) | ⚠️ | `BillingGroup.tsx` — UI only, no LS integration |
| Data & Security (export + danger) | ⚠️ | `DataGroup.tsx` — UI only, export not wired |

---

## Rules Checklist (pass before merging any settings change)

- [x] Entity names via `useEntityLabels()` / `resolveEntityLabels()` — no hardcoded "Lead" / "Contact" / etc. in descriptions or dropdowns (CRM Tags section: ✅ fixed 2026-05-12).
- [x] RTL-safe Tailwind classes only (`ms/me/ps/pe/start/end`).
- [x] `rounded-[var(--radius)]` — no `rounded-md/lg/xl`.
- [x] `APP_CONFIG.name` — no hardcoded "Orbitly" in UI.
- [x] Every section wrapped in `<SettingsSection>` (honors search filter context).
- [x] Per-section save — no global save button.
- [x] Lazy load per group (Convex `"skip"` pattern).
- [x] Thin `app/` wrapper.
- [x] **Never** `Element.scrollIntoView()` in shell — use `scrollToSection` only (see `AGENTS.md`).
- [x] All `<main>` scroll containers carry `data-*-scroll="true"` marker.

---

## Pending (UI polish / wiring)

| # | Task | Priority | Blocked on |
|---|---|---|---|
| 1 | WorkspaceGroup: Convex `_storage` logo upload | MEDIUM | — |
| 2 | WorkspaceGroup: modules visibility + drag-reorder | MEDIUM | `@dnd-kit` wiring |
| 3 | PipelineEditor: stage stale color + warning threshold pickers | MEDIUM | — |
| 4 | FieldEditor: drag-reorder + `showInStages` UI | MEDIUM | — |
| 5 | TeamGroup > Members: invite modal + role dropdown | MEDIUM | — |
| 6 | BillingGroup: LemonSqueezy checkout + real usage meters | HIGH | LS account setup |
| 7 | DataGroup > Export: wire Trigger.dev CSV/JSON job | MEDIUM | Trigger.dev job |
| 8 | DataGroup > Danger Zone: type-org-name-to-confirm delete | MEDIUM | — |
| 9 | Code prefix rename background job | LOW | Trigger.dev job |
| 10 | Mobile: collapse sub-group toolbar into accordion < 640px | LOW | — |
| 11 | AIGroup: "Re-run workspace setup" button | LOW | Phase 3 AI |

---

## Dependencies (installed)

- `fuse.js` ✅ — settings search
- `react-hook-form` + `@hookform/resolvers` + `zod` ✅
- `@dnd-kit/*` ✅ — installed, not yet wired into pipelines/fields
- `sonner` ✅ — toast
- `convex/react` ✅ — queries + mutations
- `lucide-react` ✅ — icons

No new dependencies needed for the pending items.

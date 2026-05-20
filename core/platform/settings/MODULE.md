# Settings Module

> **Single source of truth**: `SETTINGS_CODE_ARCHITECTURE.md` (root of project).
> This file is a lean index. All specs, group details, RBAC matrix, and code patterns live there.

- **Route**: `/{locale}/{orgSlug}/settings` — SINGLE PAGE, NO SUB-ROUTES
- **Location**: `core/settings/`
- **App page**: `app/[locale]/(private)/[orgSlug]/settings/page.tsx`
- **Status**: NOT_STARTED

---

## Key Decisions

| # | Decision | Outcome |
|---|---|---|
| S1 | Single route | `/settings` only. Group switching via left nav + `?group=` query param |
| S2 | Org-scoped | Every setting belongs to the logged-in org |
| S3 | No slug editing | Org slug set during onboarding, never changeable |
| S4 | Dynamic labels everywhere | Never hardcode entity names — always `useEntityLabels()` |
| S5 | Shortcuts = reference page | Settings has a read-only Shortcuts group listing all app shortcuts. No editing. |
| S6 | Appearance = ALL users | Per-user cookies, no org impact. Every role gets full Appearance settings. |
| S7 | Group-wise notification toggles | CRM / Reminders / AI / Team / System with "Toggle All" |
| S8 | O(1) queries | 2 queries load entire page: `getFullSettings` + `getMyPermissions` |
| S9 | RBAC-gated, never plan-gated | Every org on every plan gets settings |
| S10 | Convex storage for files | No Cloudinary — use `_storage` for logos, CSVs, exports |
| S11 | Per-section save | No global save button. Each section saves independently |
| S12 | Lazy load group data | Pipelines/fields/tags/members only fetched when that group is active |
| S13 | Activity Log NOT in settings | Lives at `/{locale}/{orgSlug}/activity` as a full page |
| S14 | Reserved slugs | Org slugs validated against `RESERVED_SLUGS` set in `convex/_shared/reservedSlugs.ts` |
| S15 | Notes group with tabbed sub-sections (2026-05-17) | Settings → Notes uses the same thin-button-row tab pattern as `ModulesGroup`. Each tab is its own sub-section: Categories / Reminders / Follow-ups / Timeline. Active tab persists in URL via `?tab=<slug>` (`nuqs` `parseAsStringEnum`). Topnav sub-group pill stays in sync via `shell:section-active` / `shell:section-requested` events — same plumbing ModulesGroup uses. CRM group keeps Tags only; note-categories + reminder-defaults moved out. |
| S16 | CRM group absorbs Notes/Reminders/Follow-ups/Timeline (2026-05-17, supersedes S15) | The standalone "Notes" settings group was removed; its four sub-sections (Categories, Reminders, Follow-ups, Timeline) were folded into the CRM group as additional tabs alongside Tags. Reasoning: notes/reminders/timeline are cross-cutting CRM-record concerns, not a separate domain. Section ids stay prefixed with `notes.*` (`notes.categories`, `notes.reminders`, `notes.followups`, `notes.timeline`) — preserved so existing deep-links, the topnav pill highlight, and search keywords keep working. `NotesGroup.tsx` deleted; `CRMGroup.tsx` rewritten to use the same tabbed pattern as `ModulesGroup`. `TagsSection` extracted to `groups/crm/TagsSection.tsx`. `SettingsGroupId` no longer includes `"notes"`. |
| S15 | Backend security | `orgMutation` + `requireRole(member.permissions, key)` — never rely on builder name |

## Rules

- R-SET-01: Never hardcode entity names — use `useEntityLabels()`
- R-SET-02: Every admin-only section wraps in `<PermissionGate>`
- R-SET-03: RTL-safe classes only (`ms-*`, `me-*`, `ps-*`, `pe-*`)
- R-SET-04: `rounded-[var(--radius)]` only — never `rounded-md/lg`
- R-SET-05: Per-section save buttons — no global save
- R-SET-06: Lazy load group data with Convex `skip` pattern
- R-SET-07: `APP_CONFIG.name` — never hardcode app name
- R-SET-08: Thin `app/` wrapper — zero logic in page.tsx

## Avoids

- ❌ Never plan-gate settings — only role-gate
- ❌ Never store settings in env vars
- ❌ Never run prefix rename synchronously — Trigger.dev background job
- ❌ Never create sub-routes under /settings
- ❌ Never gate Appearance by role — all users get it
- ❌ Never put Activity Log in settings — it's at /activity
- ❌ Never allow reserved slugs — validate against RESERVED_SLUGS
- ❌ Never use Cloudinary — Convex `_storage` only


## 2026-05-17 — Permissions resolved from role doc

| # | Decision | Outcome |
|---|---|---|
| 1 | `Settings → CRM → Note Categories` was rendering the read-only view for the Owner. Root cause: `myMembership.permissions` was undefined because `orgMembers.permissions` is an optional override field that `createOrg` never writes. | Patched `convex/orgs/queries.ts::getMyMembership` to resolve `permissions` from the role doc before returning. No schema or migration change required. `backfillRolePermissions` already keeps `orgRoles.permissions` aligned with the catalog SSOT. |
| 2 | Every settings group that gates UI on `myMembership.permissions` (CRMGroup, others) now sees the correct set. | No changes needed in `CRMGroup.tsx` or any other consumer. Manual verification: Owner now sees Add / Edit / Up / Down / Default / Archive on every category row. |


## 2026-05-21 — Invite member dialog mobile + send-another fix

| # | Decision | Outcome |
|---|---|---|
| 1 | `InviteMemberDialog` body is now a `flex min-h-0 flex-1 flex-col overflow-y-auto` block inside a `max-h-[85vh]` `DialogContent`. Header and footer are `shrink-0`. Once the success state appears (form fields + invite-link block + Done/Send-another), only the body scrolls — the dialog can no longer overflow the viewport on phones. | Mobile no longer pushes "Send another" off-screen. Dialog matches the FormDrawer rhythm (header/body/footer separation). |
| 2 | "Send another" is now a `type="button"` that calls a dedicated `handleSendAnother` — it clears `lastAcceptUrl`, resets the form to `{ email: "", role: "member" }`, and refocuses the email input. It NO LONGER submits the form. | Fixes the `ConvexError: An active invitation already exists for this email address.` that fired when the user clicked "Send another" while the previous email was still in the field — the old click triggered a form submit with the same email, which the server's duplicate-pending guard rejected. Now the user must type a new email before "Send invitation" appears again, matching the natural mental model. |

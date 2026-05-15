# shell/ Group

> Anything part of how the app **boots** (auth, onboarding) or how the dashboard frame is drawn (sidebar, top nav, layouts, RBAC guards).

## Features inside

| Feature | Folder | Status |
|---|---|---|
| Dashboard chrome | `shell/shell/` (was `core/shell/`) | ✅ existing — unchanged content |
| Auth surfaces | `shell/auth/` (was `core/auth/`) | ✅ existing |
| Onboarding wizard | `shell/onboarding/` (was `core/onboarding/`) | ✅ existing |
| Cross-org hooks + layouts | `shell/shared/` (was `core/shared/`) | ✅ existing |

## Note on the doubled `shell/shell/` path

The group is named `shell/` and the dashboard chrome submodule is also named `shell/`. Filenames take the longer path — `core/shell/shell/components/NavMain.tsx`. Imports use `@/core/shell/shell/...` for chrome and `@/core/shell/{auth,onboarding,shared}/...` for the others.

## Group-level rule

- Anything that ships **before** an org context exists belongs in `shell/` (auth, onboarding). Anything that requires `<OrgProvider>` belongs in `platform/`, `comms/`, etc.

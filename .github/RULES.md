# Non-Negotiable Rules

## Architecture

1. **No cross-feature imports.** Features never import from each other. Feature A needing Feature B data calls `api.functions.B.*` inside A's own `_convex/` hooks.
2. **Always `withUser` / `withRole`.** Every Convex query and mutation uses these builders. Never raw Convex built-ins.
3. **`tenantId` server-side only.** Always from `ctx.user.tenantId`. Never from client payload or URL params.
4. **`logActivity` in every mutation.** Every state-changing mutation calls `logActivity()` in the same transaction.
5. **Role checks are server-side truth.** Client-side role checks (`usePermission`) are UX only — hide UI, not protect data.
6. **No string literals** for roles, module IDs, action types, or status values. Always use constants from `src/constants/`.
7. **No hardcoded tokens.** No hardcoded colors, spacing values, or font names. CSS variables or Tailwind design tokens only.
8. **Cloudinary: `publicId` only.** Never store full Cloudinary URLs. Generate URLs from `publicId` at render time.

## File Organization

9. **One concept per file.** One component per file. One hook's concern per file. No barrel-style components.
10. **Every exporting folder has `index.ts`.** No deep imports from outside a folder.
11. **Slice `index.ts` exports page components only.** Internal hooks and components are considered private.
12. **`app/.../page.tsx` = zero logic.** Route files import and re-export from the feature slice. Nothing else.

## Quality

13. **Zero TypeScript errors.** `pnpm build` must pass before a slice is considered done.
14. **Acceptance criteria before moving on.** Manually test every item on the acceptance checklist before starting the next slice.
15. **Conventional commits.** `feat:`, `fix:`, `refactor:`, `chore:` prefixes required on every commit.
16. **One slice per PR.** Pull requests are scoped to a single feature slice including its Convex functions.

## Judgment Calls

17. **Base vs. feature?** Ask: "Does this file know what a work item is?" Yes = lives in a feature slice. No = lives in `src/`.
18. **Split the file?** If you have to scroll to understand it, split it.
19. **Which UI tier?** Remove the feature slice — would this component still make sense? Yes = Tier 1 or 2. No = Tier 3 (feature).
20. **AI suggestion vs. this document?** Follow this document. Rules here reflect deliberate system design decisions.

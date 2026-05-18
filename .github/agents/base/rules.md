# Rules & Conventions

> Non-negotiable GLOBAL rules. Full list lives in AGENTS.md — that is the authoritative source.
> This file is a quick-reference summary. If there is any conflict, AGENTS.md wins.

---

## Core Avoids (most-violated — check these first)

```
❌ ml-*, mr-*, pl-*, pr-*             → ms-*, me-*, ps-*, pe-* (RTL-safe Tailwind)
❌ rounded-md / rounded-lg / rounded-xl → rounded-[var(--radius)]
❌ "Orbitly" hardcoded in JSX          → APP_CONFIG.name
❌ "Lead"/"Contact" hardcoded in UI    → useEntityLabels()
❌ "/leads" hardcoded in nav           → labels[slot].slug
❌ .collect() in Convex queries        → .withIndex() + .take(n)
❌ Per-row useQuery in list view       → batch at parent (useEntityTagsMap, etc.)
❌ useQuery(listMembers) in component  → useOrgMembers() from context
❌ useQuery(getMyMembership) anywhere  → useCurrentOrg().membership
❌ useQuery(getEntityLabels) anywhere  → useEntityLabels()
❌ companies.list always-on in view    → scope to groupBy === "companyId"
❌ flatDeals/flatLeads in board mode   → scope to view === "list"
❌ 3 file subs per panel               → use files.queries.listForEntity
❌ Mutations on drag onValueChange     → only on onCommit / onDragEnd
❌ scrollIntoView() in nested shell    → scrollToSection() from useSettingsSearch
❌ Logic in app/ pages                 → app/ = thin wrappers only
❌ Schema change without migration     → same-message migration always
❌ Hardcode Sentry/PostHog keys        → env vars
❌ Hook return value in useEffect deps → destructure stable method or use ref
```

## Convex Backend Rules

- Use `orgQuery`, `orgMutation`, `authenticatedQuery`, `authenticatedMutation` — never raw `query`/`mutation`
- Never accept `userId`/`orgId` as auth args — derive from `ctx` only
- Never use `.filter()` — always `.withIndex()`
- Every mutation: RBAC → dedup → record code → DB → logActivity → sendNotification → AI rebuild
- Rate limit all user-triggered mutations via `enforceRateLimit`
- Schema changes: migrate in the same message, never defer

## Performance Rules (locked 2026-05-18)

- Drag persistence = one mutation per drop (onCommit only)
- Per-row data on list views = one batched parent query, not per-row subscriptions
- Identity/auth/labels via context (`useCurrentOrg`), never per-component subscriptions
- Every list-affecting mutation has `withOptimisticUpdate`
- Rate-limit drag mutations server-side (120/min scope per userId:orgId)

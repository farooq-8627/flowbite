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
❌ AI tool calls public orgMutation    → must call *ForAI internal twin (auth)
```

## Convex Backend Rules

- Use `orgQuery`, `orgMutation`, `authenticatedQuery`, `authenticatedMutation` — never raw `query`/`mutation`
- Never accept `userId`/`orgId` as auth args — derive from `ctx` only
- Never use `.filter()` — always `.withIndex()`
- Every mutation: RBAC → dedup → record code → DB → logActivity → sendNotification → AI rebuild
- Rate limit all user-triggered mutations via `enforceRateLimit`
- Schema changes: migrate in the same message, never defer

## AI Tool Rules (locked 2026-05-24)

- **Every AI-callable handler has a `*ForAI` internal twin in the same file.** Public `orgMutation` / `orgQuery` are unreachable from the AI tool layer because scheduled actions don't propagate auth identity (per Convex docs). The twin takes `userId: v.id("users")` as an arg, validates via `requireOrgMemberByIds`, and calls the same `*Impl` body the public version calls.
- Tool authors call `toolMutation(getCtx(), "module:public_path", args)` from `convex/ai/tools/_shared.ts` — the helper rewrites the path to `…ForAI` and injects the trusted `userId` automatically.
- Two-step tools register a `propose_*` (the bare imperative verb) + `commit_*` pair. The `propose()` helper inside execute() returns `{title, fields}` so `ChatConfirmation` renders a rich preview card.
- Layer tools register with `layer: "fields" | "tags" | …`. After the 2026-05-24 fix, all permitted layers are pre-loaded at orchestrator start; subagent allow-lists narrow further.
- See `AGENTS.md` → "RULE: AI tools call `*ForAI` internal twins" for the full doctrine and `core/ai/MODULE.md` for the decision log.

## Performance Rules (locked 2026-05-18)

- Drag persistence = one mutation per drop (onCommit only)
- Per-row data on list views = one batched parent query, not per-row subscriptions
- Identity/auth/labels via context (`useCurrentOrg`), never per-component subscriptions
- Every list-affecting mutation has `withOptimisticUpdate`
- Rate-limit drag mutations server-side (120/min scope per userId:orgId)

# Coding & Workflow Rules — Source of Truth

This file is the canonical reference for non-negotiable rules. `AGENTS.md`
points here. When a rule applies, the rule itself is in this file; rationale
and history live in git.

Sections:
1. Build hygiene (deletes, comments, docs, deferrals)
2. UI / Frontend (RTL, radius, app strings, app/, scrolling, tours, hook deps)
3. Convex backend (env vars, *ForAI twins, schema migrations, canonical mutation, four-layer AI security)
4. Performance (drag, batched queries, identity context, optimistic updates, rate limits)

---

## 1. Build hygiene

### 1.1 Side-by-side cleanup — delete legacy in the SAME edit (NON-NEGOTIABLE)

When a port replaces legacy code, the legacy is deleted in the same edit.
No `*_V2` env flags, no parallel folders, no "we'll remove it later". The
cost of dual-pathing — bloated files, dual tests, drift, regressions on the
dead path — is higher than the cost of admitting which behaviour just
changed.

| Situation | What to do in the same edit |
|---|---|
| Porting a domain to a new layer | Delete every legacy file under the old layer for that domain + drop registrations + update callers. |
| Replacing a function | Delete the old function. Don't leave it as a "shim" unless a separate, listed call site genuinely needs it for one more stage AND that case is recorded in `PENDING.md` with the stage that unblocks the deletion. |
| Migrating a schema field | Drop the old field + update every reader/writer (also covered by §3.4). |
| Switching a feature flag default to ON | Delete the OFF branch and the flag itself in the same edit. |
| "Temporarily disabled" code | Flip it OFF and DELETE the disabled code. If you genuinely need it back later, add a `Future-Enhancements.md §A` card. |

If un-ported code blocks deletion this edit:
1. Delete what you CAN (every reachable line the new code replaces).
2. Add a `PENDING.md` card naming the EXACT files + line ranges that survive, the reason, and the stage that unblocks the final deletion.
3. One inline `// LEGACY: deleted by stage Sn (see PENDING.md ...)` comment per surviving entry point.

NOT acceptable: "I'll keep both paths until stage Sn" without a same-edit
deletion contract; "old function as a shim" without a recorded blocker;
wrapping new path in `USE_X` / `X_V2` env vars; bare `// TODO: remove after
cutover` with no tracking entry.

### 1.2 LLM-readable comments — explain the *why*, not the *history* (NON-NEGOTIABLE)

Comments help the next reader (human OR LLM dropped in cold) rebuild the
mental model. They explain *why* the code is shaped this way, *what
invariants it preserves*, *what gotchas would bite a re-implementer*, and
*which policies/modules it interacts with*. They do NOT recount build
history or staged plans — that's `SHIPPED.md` and git history.

**Bias toward MORE explanation when it teaches something the code can't.**

Soft budgets (starting points, not ceilings):

| Surface | Soft budget | Goal |
|---|---|---|
| File header | 6–25 lines | Module's role + 1–3 invariants + cross-links. |
| Function / type doc | 3–15 lines | Purpose, key params, return shape, the one gotcha. |
| Inline comment | 1–8 lines | Anchor a non-obvious step. Multi-step strategy comments are encouraged. |
| Stage-history references | 0 | Belongs in `SHIPPED.md`. |
| Speculative future-work | 0 | Belongs in `PENDING.md`. |

Comments SHOULD: state an invariant the types can't express; name a gotcha
that has bitten someone; cross-link a locked decision; explain a non-obvious
choice; map this file into the system; capture multi-step dataflow; document
failure modes for empty/malformed/partial input.

Comments should NOT: restate what the code obviously does; narrate stage
history; apologise/defend at length; hold an unowned `// TODO`; carry
incident write-ups inline; duplicate type info the signature already conveys.

A 15–30 line block is the right answer when it's a file header, a load-bearing
multi-step algorithm, a boundary contract between modules, a gotcha the type
system can't catch, or a cross-reference to a locked decision.

### 1.3 Write decisions to MODULE.md

Every design decision / "why" answer for a module:
- Write it to that module's `MODULE.md` immediately.
- Format: decision table row `| # | Decision | Outcome |`.
- Never leave decisions only in chat.
- If `MODULE.md` doesn't exist for the module you're touching, create it.
- Scan `MODULE.md` at the start of every task before writing code for that module.

### 1.4 Doc cleanup at every commit — summarise shipped, keep pending in full (NON-NEGOTIABLE)

Tracking docs (`PENDING.md`, `SHIPPED.md`, `Future-Enhancements.md`,
`MODULE.md`) are PLANNING surfaces, not changelogs. Without active cleanup
they grow into wall-of-text archives that hide pending work.

Two granularities:

| Granularity | Trigger | Result |
|---|---|---|
| Task-level | Completing a task inside an in-progress phase | Task collapses to a one-line ✅ summary (verb + outcome + file refs). Pending tasks keep full context. |
| Phase-level | Whole phase ships | Phase collapses to a single shipped paragraph with the date. Per-task summaries inside it are deleted. |

Required reductions when a task ships, in the SAME edit:
1. Replace the task's full description with one line: `✅ <T-id> — <verb> <what changed> <key file>. <one-sentence outcome>.`
2. Delete sub-bullets, code excerpts, file diffs, screenshots — they live in git history.
3. Keep cross-references when another pending task depends on the shipped one.
4. Don't delete the verification line if it's referenced elsewhere.

NEVER summarise away (until the parent phase fully ships): pending task
descriptions/code sketches/schemas, avoid-lists, production-platform findings,
architecture diagrams, audit-defect tables (flip status column instead),
sequence diagrams, verification protocols, pricing/valuation analyses tied to
a phase output.

For findings tables, FLIP the Status column instead of deleting the row:
`✅ Implemented` / `🟡 Partial` / `⬜ Pending` / `❌ Won't ship`.

When EVERY task in a phase ships, replace the section with one paragraph:
```
### ✅ <Phase> — <one-line scope> — SHIPPED <YYYY-MM-DD>
<Outcome paragraph>. See `<key files>`. <Optional metric>.
```

Run this cleanup IN THE SAME EDIT that flips a task to ✅. Before ending any
message that touched a tracking doc, mentally run the workflow checklist:
shipped tasks collapsed; pending kept full; audit-finding rows flipped; phase
rollups paragraph-form; every touched tracking doc updated.

### 1.5 Deferred restrictions live in `Future-Enhancements.md` (NON-NEGOTIABLE)

Whenever you DISABLE / RELAX / REMOVE / SKIP a guardrail, restriction, or
capability — even temporarily, even "just for testing" — add a structured
entry to `Future-Enhancements.md` in the same change. No exceptions.

Triggers: removing/commenting a plan-tier or model-tier check; loosening a
`requiredCapability`/`permission`/`confirmation`; raising a `stopWhen` or
rate-limit beyond design; flipping a feature-flag default that was on in
prod; skipping a UI guard; stubbing a critical mutation/action; lowering a
quota; adding `// TODO: re-enable` without a card; "we'll do this in Phase
N" in chat without a card.

In the same change, deliver:
1. The disabling code edit.
2. A new `Future-Enhancements.md` card with: Section (A/B/C/D), Status, Category, Phase to ship, Owners, Risk if skipped, Files involved, Why deferred, Benefits when reinstated, Use cases / who it protects, Implementation sketch, Verification.
3. An entry in the "Additions log" table at the bottom.
4. A code comment at the disabling site:
   ```ts
   // DEFERRED: see Future-Enhancements.md §A.2 (...).
   //          Re-enable per PENDING.md ... .
   ```

When the user asks to add an enhancement / restriction / cleanup item:
ask if it's "ship now" or "defer" if ambiguous. If defer, add the card with
all required fields BEFORE replying. Push back if they say "I'll write it
later" — the cheapest moment to capture rationale is now.

### 1.6 No training data

Never write code, patterns, configs, or suggestions from training-data
memory. Use MCP servers, web search (Firecrawl), GitHub MCP, official docs,
or project context (`.github/agents/base/`, project files) for every code
pattern. Cite every source with a direct URL after every code block.

End of every chat response with code MUST include:
```
---
📚 Sources Used:
- [Source Name](URL) — what was taken from here
- [GitHub Repo](URL) — what pattern was referenced

✅ Training Data Used: YES | NONE
All code and suggestions were sourced from live web searches, MCP servers,
and production codebases listed above.
```

If you cannot provide sources, do not write the code. Ask the user for
direction instead.

---

## 2. UI / Frontend

### 2.1 RTL-safe Tailwind classes only

This app supports Arabic (RTL) and English (LTR). Never use directional
CSS classes.

| ❌ Banned | ✅ Use |
|---|---|
| `ml-*`, `mr-*` | `ms-*`, `me-*` |
| `pl-*`, `pr-*` | `ps-*`, `pe-*` |
| `left-*`, `right-*` | `start-*`, `end-*` |
| `border-l`, `border-r` | `border-s`, `border-e` |
| `rounded-l-*`, `rounded-r-*` | `rounded-s-*`, `rounded-e-*` |
| `text-left`, `text-right` | `text-start`, `text-end` |
| `float-left`, `float-right` | `float-start`, `float-end` |

Apply `dir="rtl"` to `<html>` for Arabic locale; logical properties flip automatically.

### 2.2 Dynamic border-radius — never hardcode

| ❌ Banned | ✅ Use |
|---|---|
| `rounded-md`, `rounded-lg`, `rounded-xl` | `rounded-[var(--radius)]` |
| `rounded-full` | OK only for avatars/pills/dots |
| `border-radius: 8px` | `border-radius: var(--radius)` |

`--radius` lives in `globals.css`, controlled by the theme preset.

### 2.3 No hardcoded app strings

| ❌ Banned | ✅ Use |
|---|---|
| `"Orbitly"` in JSX | `APP_CONFIG.name` |
| `"AI-Powered CRM…"` | `APP_CONFIG.description` |
| `"orbitly.app"` | `APP_CONFIG.url` |
| `"ORB"` prefix | `APP_CONFIG.platformPrefix` |
| `"Lead"` / `"Contact"` in UI | `useEntityLabels()` |
| `"/leads"` in navigation | `labels[slot].slug` |

`APP_CONFIG` reads `process.env.NEXT_PUBLIC_*` — white-label deployments
just change env vars.

### 2.4 `app/` contains thin wrappers only

| ❌ Banned in `app/` | ✅ Put it here |
|---|---|
| Component definitions | `core/*/views/`, `core/*/components/`, `features/*/` |
| Business logic, hooks, data fetching | `core/*/views/` |
| Inline JSX beyond a single `return <View />` | `core/*/views/` |

App pages must only: unwrap `params`/`searchParams`, render a single view
component from `core/` or `features/`, optionally export `metadata` /
`generateMetadata`.

```tsx
// ✅ Correct
export default async function Page({ params }) {
  const { orgSlug } = await params;
  return <MyFeatureView orgSlug={orgSlug} />;
}
```

### 2.5 Never use `Element.scrollIntoView()` inside nested scroll containers

The dashboard nests 3+ scroll containers. `scrollIntoView()` walks UP and
recursively scrolls every scrollable ancestor — the topnav slides, the
sidebar reflows, the page jumps.

| ❌ Banned | ✅ Use |
|---|---|
| `element.scrollIntoView()` inside any shell view | Find the explicit container and call `container.scrollTo({top})` |
| `element.scrollIntoView({block: "start"})` on anchor clicks | Compute offset vs. container, call `container.scrollTo` |
| `window.scrollTo({top: 0})` on dashboard pages | Target inner `<main>` via `document.querySelector('main[data-*-scroll]')` |

Reference implementation: `core/platform/settings/hooks/useSettingsSearch.ts::scrollToSection`.
Mark scroll containers with `data-*-scroll="true"` on every `<main>` that scrolls.

### 2.6 First-time coachmarks — use `<FirstTimeTour>`, never tooltips, for power gestures

Tooltips re-fire on every hover. For power gestures (single vs double-click,
drag-and-drop, hidden menus), use `components/ui/first-time-tour.tsx` —
fires once, points at the element, never returns. Persists in `localStorage`
under `orbitly:tours:seen`.

Rules:
1. One id, one tour. Same id can mount on multiple routes; still fires once per device.
2. Bump the id (`v1` → `v2`) when steps change meaningfully.
3. `data-tour=` attribute is the targeting contract — don't switch to `id`s.
4. Steps are sequential and skippable (Esc / × / backdrop). No "remind me later".
5. Reset for testing via `resetAllTours()` from `components/ui/first-time-tour.tsx`.
6. Render the tour inside `<>` after the regular UI; conditionally mount when the relevant view is visible.

### 2.7 Never put hook-returned objects in `useEffect` deps (max-update-depth prevention)

Custom hooks return new object references when their internal state
changes. Putting the whole object in deps creates a feedback loop: effect
fires → calls method → state changes → new ref → effect fires again.

| # | Rule |
|---|---|
| 1 | Never put a custom-hook return value in `useEffect` deps. |
| 2 | If a `useCallback` needs to read state, use a ref (`stateRef.current = state`) instead of putting state in the deps. |
| 3 | If `useEffect` must call a method from a hook, destructure the stable method (`const { reset } = useFileBuffer(orgId);`) and put that in deps. |

Safe patterns:
```tsx
// ✅ Destructure the stable method
const { reset } = useFileBuffer(orgId);
useEffect(() => { if (!open) reset(); }, [open, reset]);

// ✅ Ref for state-dependent callbacks
const filesRef = useRef(files);
filesRef.current = files;
const commit = useCallback(async () => {
  const entries = Object.entries(filesRef.current);
}, [orgId]); // no state in deps → stable

// ✅ Functional updater with same-reference bailout
useEffect(() => {
  setCardFields((prev) => {
    const next = prev.filter(f => allowed.has(f));
    return next.length === prev.length ? prev : next;
  });
}, [defaultCardFields]);
```

When you see "Maximum update depth exceeded": the reported file:line is
usually a SYMPTOM. Find the `useEffect` that fires repeatedly (add
`console.count("effect X")` temporarily). Check if it sets state on
something that feeds back into its own deps directly or via a hook-returned
object. Fix: remove unstable dep, use a ref, or use a functional updater
with same-reference bailout.

---

## 3. Convex backend

### 3.1 Convex env vars for backend secrets

For Convex functions (not Next.js), use `process.env.VARIABLE_NAME`
directly. Convex reads from the Convex dashboard environment variables, not
`.env.local`. Never hardcode platform names or prefixes in Convex functions.

### 3.2 Four-layer AI security (LOCKED)

```
Layer 1: System prompt boundaries
  → What AI can/cannot do, platform rules, org context
  → Managed by platform_admin (platformContext table)

Layer 2: Org-scoped data
  → All queries use orgId from ctx (NEVER from request body)
  → AI cannot access data from other orgs

Layer 3: Tool filtering at registry level
  → AI only receives tools the user has permission to use
  → Checked BEFORE the AI call — zero tokens wasted on forbidden tools

Layer 4: Confirmation for destructive actions
  → Delete, bulk update, irreversible stage change
  → AI shows preview → user confirms → THEN mutation runs
```

### 3.3 Convex canonical mutation pattern

Every public mutation that creates rows follows these 7 steps in order:

```typescript
// 1. RBAC
const { member, userId } = await requireOrgMember(ctx, args.orgId);
requireRole(member.role ?? "viewer", "leads.create");

// 2. Dedup (leads + contacts only)
const dupes = await runDedup(ctx, args.orgId, args.email, args.phone, args.displayName);
if (dupes.length > 0) return { id: null, duplicates: dupes };

// 3. Record code
const personCode = await generatePersonCode(ctx, args.orgId);

// 4. DB insert
const id = await ctx.db.insert("leads", {
  ...args, personCode, createdAt: now, updatedAt: now,
});

// 5. logActivity — pass personCode for person-related mutations
await logActivity(ctx, {
  orgId, userId, action: "created", entityType: "lead", entityId: id, personCode,
});

// 6. sendNotification — when assignedTo is set
if (args.assignedTo && args.assignedTo !== userId) {
  await sendNotification(ctx, {
    orgId, userId: args.assignedTo, type: "lead.assigned", ...,
  });
}

// 7. AI context rebuild
await ctx.scheduler.runAfter(0, internal.ai.rebuildEntityContext, {
  orgId, entityType: "lead", entityId: id, personCode,
});

return { id, personCode, duplicates: [] };
```

Every public mutation that creates rows must add a rate limit. Conventions:
use `orgQuery` / `orgMutation` / `authenticatedQuery` / `authenticatedMutation`
— never raw `query` / `mutation`. Never accept `userId` / `orgId` as auth
args (derive from `ctx`). Never use `.filter()` — always `.withIndex()`.

### 3.4 Convex schema/data changes — migrate IN THE SAME MESSAGE

If you change anything in Convex that breaks existing data — schemas,
validators, table fields, indexes, enum values, permission keys, reserved
slugs, any data shape consumers depend on — handle the full migration /
cleanup / backfill in **the same message** that introduces the change. Do
not push a schema change and "fix it later".

Triggers: adding a required (non-optional) field; removing a
non-optional field; narrowing a validator (`v.string()` →
`v.union(v.literal("a"))`); renaming a field; changing index keys;
removing/renaming an index; splitting one table into two; adding a new
permission key, reserved slug, or notification preference key; renaming an
entity code prefix; tightening a unique index.

In the same message, deliver:
1. The schema change.
2. A migration function (typically internal mutation in
   `convex/_migrations/<name>.ts`) that iterates affected rows in batches,
   backfills with sensible defaults, renames by reading-old + writing-new +
   clearing-old in one patch, and is **idempotent** (safe to run twice).
3. Caller updates — every query/mutation/action/AI tool/frontend hook that
   referenced the old shape, names, or indexes.
4. Permission catalog & defaults updated if applicable; run the
   seed-permissions backfill mutation if existing role docs need them.
5. Verification: state what was checked. "I read X consumers and updated
   all of them." "Schema typecheck passes." If the migration cannot run
   yet (multi-step rollout), say so and document the next required step.

Before considering done: schema validators accept every existing row in
dev DB; every reader/writer of the changed shape was updated;
`pnpm typecheck` passes; `pnpm dev` succeeds without "schema validation
failed"; if any step couldn't be completed in this session, the response
calls it out as a blocker — never silently shipped.

### 3.5 AI tools call `*ForAI` internal twins, NEVER public `orgQuery` / `orgMutation` (NON-NEGOTIABLE)

AI tools execute inside `processChat.run`, an `internalAction` scheduled
via `ctx.scheduler.runAfter`. Per Convex docs, scheduled actions do NOT
propagate auth identity:
> "The auth is not propagated from the scheduling to the scheduled
> function. If you want to authenticate or check authorization, you'll
> have to pass the requisite user information in as a parameter."

So if a tool calls a public `orgQuery` / `orgMutation` directly,
`getAuthUserId(ctx)` returns `null` and `requireOrgMember()` throws
`UNAUTHORIZED`.

The pattern: every AI-callable handler has an internal twin in the same
file. The twin:
1. Is declared with `internalQuery` / `internalMutation`.
2. Takes `userId: v.id("users")` as an explicit arg.
3. Validates membership via `requireOrgMemberByIds(ctx, orgId, userId)` — never `getAuthUserId(ctx)`.
4. Calls the **same `*Impl` body** the public version calls. Zero divergence over time.

```ts
// 1. Extract the body into a private *Impl helper.
async function createImpl(ctx: MutationCtx, args: { orgId: Id<"orgs">; … }) { … }

// 2. Public version — auth from session.
export const create = orgMutation({
  args: { orgId: v.id("orgs"), … },
  handler: async (ctx, args) => {
    const { member } = await requireOrgMember(ctx, args.orgId);
    requireRole(member.permissions, "x.manage");
    return createImpl(ctx, args);
  },
});

// 3. AI-callable internal twin — auth from a trusted userId arg.
export const createForAI = internalMutation({
  args: { orgId: v.id("orgs"), userId: v.id("users"), … },
  handler: async (ctx, args) => {
    const { member } = await requireOrgMemberByIds(ctx, args.orgId, args.userId);
    requireRole(member.permissions, "x.manage");
    const { userId: _u, ...rest } = args;
    return createImpl(ctx, rest);
  },
});
```

Tools call `toolMutation(getCtx(), "module:create", args)` from
`convex/ai/tools/_shared.ts`. The helper rewrites the path to `…ForAI` and
injects the trusted `userId` automatically. `ai/*` paths pass through
unchanged (they're already internal-only).

Checklist when writing a new AI tool:
- Confirm the public handler exists.
- Add the `*ForAI` twin in the same change if calling a public orgQuery/orgMutation.
- Extract shared body into `*Impl` if not already done; keep public + ForAI signatures aligned.
- Use `requireOrgMemberByIds(ctx, args.orgId, args.userId)` in the twin — never `getAuthUserId`.
- Call from the tool via `toolMutation(getCtx(), "module:export", args)` — pass the public path.
- Never accept `userId` as an arg on a public mutation. The twin is the ONLY place `userId` is an arg.
- If the call goes to `convex/ai/*`, do NOT add a twin — the helper passes those through unchanged.

---

## 4. Performance (locked 2026-05-18)

### 4.1 Drag persistence is one mutation per drop

Drag callbacks (`onDragOver`, `onValueChange`) are for VISUAL feedback only.
Persistence happens in `onCommit` / `onDragEnd`, exactly once, for the
dragged item only.

| ❌ Banned | ✅ Use |
|---|---|
| `useMutation()` from `onValueChange` | Call from `onCommit` |
| Iterating layout diff and persisting per-displaced-card | Persist only `draggedItemId` |
| `pendingLayout` in `useRef` | `useState` so render reflects it |
| Bumping `updatedAt` in optimistic updates | Server stamps it; otherwise cascading invalidations |

Reference: `components/ui/kanban.tsx::onCommit` plus
`useKanbanItems()` + `KanbanBoardBody` in
`core/data-display/kanban/components/KanbanBoard.tsx`.

### 4.2 Per-row data on a list view comes from one batched query

If a list/board renders N rows where each row needs auxiliary data
(tags, attachments, assignee, etc.), the parent fetches ONE batched
query `{ [rowId]: data }`. Per-row `useQuery` is acceptable only for
single-row pages.

| ❌ Banned | ✅ Use |
|---|---|
| `<TagsCell>` calling `getTagsForEntity` per card | Pass `prefetchedTags` from `useEntityTagsMap(orgId, slot)` |
| `<NoteCard>` calling `useAttachmentDisplay` per card | Pass `resolvedAttachmentDisplay` from `useAttachmentDisplaysForOrg` |
| `<AssigneeCell>` calling `listMembers` per cell | Read from `useOrgMembers()` context |

Reference: `core/entities/shared/hooks/useEntityTagsMap.ts`,
`core/comms/notes/hooks/index.ts::useAttachmentDisplaysForOrg`.

### 4.3 Identity / auth / labels via context, not subscriptions

`getMyMembership`, `listMembers`, `orgs.get`, `getEntityLabels`, `users.me`
are session-scoped. Fetch ONCE at the layout level (`<OrgProvider>`) via
React context. Never call these via `useQuery` directly.

| ❌ Banned | ✅ Use |
|---|---|
| `useQuery(api.orgs.queries.listMembers, …)` | `useOrgMembers()` |
| `useQuery(api.orgs.queries.getMyMembership, …)` | `useCurrentOrg().membership` or `useOrgPermissions()` |
| `useQuery(api.orgs.queries.getEntityLabels, …)` | `useEntityLabels()` |
| Looking up `memberNameById` from a `members.map` per render | `useOrgMemberNameMap()` |

Reference: `core/shell/shared/hooks/useCurrentOrg.tsx`. Mounted once in
`DashboardLayoutClient.tsx`.

### 4.4 Every list-affecting mutation has `withOptimisticUpdate`

Eliminates the "fire mutation → wait → re-render → flash" loop and the
`listX` re-subscription spam. Optimistic update MUST NOT bump `updatedAt:
Date.now()` — that changes row identity on every render and cascades list
invalidations. Server stamps `updatedAt`; the optimistic patch only writes
the user-visible field.

Reference: `core/comms/notes/hooks/index.ts::useReorderNote`,
`useSetNoteCategory`.

### 4.5 Rate-limit drag mutations server-side

All public mutations triggered by user UI gestures MUST gate on
`enforceRateLimit`. Drag-driven mutations use a 120/min budget per
`(userId, orgId)`. Shared scope across related mutations so a user can't
bypass by alternating.

```ts
await enforceRateLimit(ctx, {
  scope: "notes.reorder",
  key: `${userId}:${args.orgId}`,
  max: 120,
  periodMs: 60_000,
  orgId: args.orgId,
});
```

Reference: `convex/_shared/rateLimit.ts`.

---

## Quick avoids (most-violated — check first)

```
❌ ml-*, mr-*, pl-*, pr-*             → ms-*, me-*, ps-*, pe-* (RTL-safe)
❌ rounded-md / rounded-lg / -xl       → rounded-[var(--radius)]
❌ "Orbitly" hardcoded in JSX          → APP_CONFIG.name
❌ "Lead"/"Contact" hardcoded in UI    → useEntityLabels()
❌ "/leads" hardcoded in nav           → labels[slot].slug
❌ .collect() in Convex queries        → .withIndex() + .take(n)
❌ Per-row useQuery in list view       → batch at parent
❌ useQuery(listMembers) in component  → useOrgMembers()
❌ useQuery(getMyMembership) anywhere  → useCurrentOrg().membership
❌ useQuery(getEntityLabels) anywhere  → useEntityLabels()
❌ Mutations on drag onValueChange     → only on onCommit
❌ scrollIntoView() in nested shell    → scrollToSection()
❌ Logic in app/ pages                 → app/ = thin wrappers only
❌ Schema change without migration     → same-message migration always
❌ Hardcode Sentry/PostHog keys        → env vars
❌ Hook return value in useEffect deps → destructure stable method or use ref
❌ AI tool calls public orgMutation    → must call *ForAI internal twin
❌ Tag/file/role list via useQuery     → batched parent query
❌ Bumping updatedAt optimistically    → let server stamp it
```

<!-- convex-ai-start -->

This project uses [Convex](https://convex.dev) as its backend.

When working on Convex code, **always read
`convex/_generated/ai/guidelines.md` first** for important guidelines on
how to correctly use Convex APIs and patterns. The file contains rules that
override what you may have learned about Convex from training data.

Convex agent skills for common tasks can be installed by running
`npx convex ai-files install`.

<!-- convex-ai-end -->

---

# 🎯 ACTIVE SPRINT — read first

> **`SPRINT-PLAN.md`** is the canonical execution surface for the current
> audit-driven sprint. It contains 10 self-contained stages, each with a
> drop-in prompt sized for a single AI session.
>
> Before starting any feature work, check `SPRINT-PLAN.md` for the next
> unfinished stage. Source audits the plan derives from:
> `AI-AUDIT-COMPLETE.md` (75 tools mapped, 51 gaps), `DASHBOARD-AUDIT.md`
> (3 stacked bugs + missing AI widgets), `AI-AGENT-CAPABILITY-AUDIT.md`
> (senior-CRM-specialist scorecard 5.8/10 → roadmap to 9/10).
>
> Each stage's prompt enforces full-repo verification (typecheck, biome,
> test, vitest, build all green for the WHOLE repository, not just changed
> files), the doc-cleanup rule (collapse shipped, keep pending in full),
> and the no-backward-compat directive (rename → delete old + migrate same
> edit).

---

# 🏗️ GLOBAL CODING RULES (apply to every file, every session)

## RULE: Write decisions to MODULE.md

Every time you make a design decision, architecture choice, or answer a "why" question about a module:
- Write it to that module's `MODULE.md` file immediately.
- Format: decision table row `| # | Decision | Outcome |`
- Never leave decisions only in chat — they will be lost between sessions.
- If a `MODULE.md` doesn't exist for the module you're working in, create it.
- Scan `MODULE.md` at the start of every task before writing code for that module.

## RULE: Deferred restrictions live in `Future-Enhancements.md` (NON-NEGOTIABLE)

> Whenever you DISABLE, RELAX, REMOVE, OR SKIP a guardrail / restriction /
> capability — even temporarily, even "just for testing" — you MUST add a
> structured entry to `Future-Enhancements.md` in the same change. No
> exceptions. The file's section "How to read this file" defines the
> required entry shape.

### What counts as a deferred restriction (and triggers this rule)

| Change | Why it triggers the rule |
|---|---|
| Removing or commenting out a plan-tier / model-tier check | Must be re-enabled before public launch. |
| Loosening a `requiredCapability`, `permission`, or `confirmation` gate on a tool | Same. |
| Raising a `stopWhen`, rate limit, or step cap above its design value | Same. |
| Disabling a feature flag default that was on in prod | Same. |
| Skipping a UI guard ("just unblock the test path") | Same. |
| Stubbing out a critical mutation / action with a no-op | Same. |
| Lowering a quota in `_platform/limits.ts` for testing | Same. |
| Adding a `// TODO: re-enable` comment without an entry in this file | Same. |
| "We'll do this in Phase N" in chat without a card | Same — chat history is not durable. |

### What you MUST deliver in the same change

1. **The disabling code edit itself.**
2. **A new entry in `Future-Enhancements.md`** with these required fields:
   - Section (A: currently-disabled / B: backlog / C: audit-flagged / D: governance).
   - Status (Disabled / Removed / Backlog / In progress).
   - Category (Model gating / RBAC / Rate limit / Billing / UX / Performance / etc.).
   - **Phase to ship** — when the restriction comes back on. Reference the doc that says so (e.g. `PHASE-3-AI-AUDIT.md §6 Week 6`).
   - Owners — module(s) responsible.
   - Risk if skipped — what breaks in production if we forget.
   - Files involved — concrete paths + line ranges when known.
   - **Why we deferred** — one paragraph.
   - **Benefits when reinstated** — bullet list (cost / reliability / cost-control / UX / trust).
   - **Use cases / who it protects** — concrete users (free tier, RE teams, viewers, etc.).
   - **Implementation sketch** when re-enabling — code snippet or numbered steps.
   - **Verification** — exact unit/integration/e2e test or manual check that confirms it's back on.
3. **An entry in the "Additions log" table at the bottom** of `Future-Enhancements.md` with date + category.
4. **A code comment at the disabling site** that points at the doc:
   ```ts
   // DEFERRED: see Future-Enhancements.md §A.2 (per-tool premium capability gate).
   //          Re-enable in Phase 6 / Week 6 of PHASE-3-AI-AUDIT.md §6.
   ```

### When a user asks to add an enhancement / restriction / cleanup item

If the user (or any audit doc) describes a feature that won't ship right now, you MUST:
1. **Ask first** whether it's "ship now" or "defer" if ambiguous.
2. If defer: add a card under the right section (typically B: backlog) with all the required fields BEFORE replying with the result.
3. If the user says "I'll write it later" — push back: the cheapest moment to capture the rationale is now.

### Workflow before ending the message

Before considering a deferral "done":
- [ ] `Future-Enhancements.md` has the new card with every required field filled in.
- [ ] The "Additions log" table at the bottom has the new row.
- [ ] The disabling site has a `// DEFERRED:` comment pointing at the card.
- [ ] If the deferral was driven by an audit / planning doc, that doc is cross-referenced from the card's "Phase to ship" field.

### Why this rule exists

Deferred restrictions don't surface until the day they bite. By then the original context is gone, the agent who wrote the comment is two sessions back, and the only signal is "production is on fire." Capturing the rationale at the moment of deferral pays back 10× when it's time to re-enable. Chat history is NOT durable; this file is.

## RULE: Doc cleanup at every commit — summarise shipped, keep pending in full (NON-NEGOTIABLE)

> Tracking docs (`PHASE-*.md` audits, `STATE.md` files, `todos.md`,
> `Future-Enhancements.md`) are **planning surfaces**, not changelogs. They
> exist to tell the next session what to do next. They are NOT a record of
> what was done. Without an active cleanup rule they grow into wall-of-text
> archives that hide the actually-pending work and force users to ask "what's
> left?" every session. This rule fixes that automatically.

### The contract — two layers of granularity

| Granularity | Trigger | What stays in the doc |
|---|---|---|
| **Task-level cleanup** (during a phase) | Every time you complete one or more tasks inside an in-progress phase | Each completed task collapses to a **one-line ✅ summary** (verb + outcome + file refs). Pending tasks keep full context. |
| **Phase-level rollup** | When a phase fully ships (all its tasks done) | The whole phase collapses to a **single shipped paragraph** with the date. Per-task summaries from inside the phase are deleted. |

You always summarise UP. Per-task summaries roll up into per-phase paragraphs, which roll up into a single line in the parent index when the parent ships.

### Required reductions when a task ships

When you mark a task ✅, in the SAME edit:

1. **Replace the task's full description** with a one-line summary in the format:
   `✅ <T-id> — <imperative verb> <what changed> <key file or two>. <one-sentence outcome>.`
   Example: `✅ T1.1 — Hide propose() JSON in streamLoop.ts via wrapToolsForApprovalSanitisation. Model never sees raw confirmation payload.`
2. **Delete its sub-bullets, code excerpts, file diffs, screenshots-of-issues** — they belong in git history, not in the planning doc.
3. **Keep cross-references** when another pending task depends on the shipped one ("see T1.1 for sanitisation pattern").
4. **Never delete the task's verification line** if the verification is referenced elsewhere (tests still failing means the task isn't truly shipped).

### Required preservation — what NEVER gets summarised away (until parent phase fully ships)

The following stay in **full text** in the doc until the **whole phase containing them** has shipped:

| Content | Why it stays |
|---|---|
| **Pending task descriptions, sub-bullets, file paths, code sketches, schemas** | Next session needs the full context to execute without re-asking |
| **Avoid-lists / DON'T-do lists** | These are guardrails; collapsing loses the rationale |
| **Production-platform / industry findings** (e.g. PHASE-3-AI-AUDIT §2: Anthropic, AI SDK, Attio, Salesforce, HubSpot, Clay, OWASP, Inngest) | These ARE the design rationale for every pending task; never summarise away while any related task is pending |
| **Architecture diagrams** | Cheap to keep, expensive to recreate |
| **Audit-defect tables with cross-refs to fixes** | Anchoring data — keep the rows, just flip the status column |
| **Sequence / dependency diagrams** | Same — cheap to keep, hard to recreate |
| **Verification protocols + manual flow tests** | Until the phase is fully verified |
| **Pricing / valuation analyses tied to a phase's output** | Until the phase ships AND the valuation is re-evaluated |

If you're unsure whether something counts as "durable context," default to **keep it**. The cost of keeping a 200-token block is negligible; the cost of losing the rationale next session is a re-audit.

### Status flips, NOT deletions, for findings tables

When an industry-pattern finding is implemented (e.g. "Anthropic's `stepCountIs(20)` default" → we ship `stepCountIs(30)`), do NOT delete the finding. **Add a Status column** with values:

- `✅ Implemented — <one-line where + when>` (e.g. `✅ Implemented — Week 1.1, streamLoop.ts`)
- `🟡 Partial — <what's covered, what's missing>` (e.g. `🟡 Partial — needsApproval shape adopted W3.3; full-native streamText-paused HITL still pending — see Future-Enhancements.md §B.8`)
- `⬜ Pending — <which task / week ships it>` (e.g. `⬜ Pending — Week 4 §6 row 4.2 (quarantined LLM action)`)
- `❌ Won't ship — <why + which decision row>` (e.g. `❌ Won't ship — see locked decision #N in AGENTS.md`)

The finding text itself stays verbatim. Only the Status column changes over time.

### Phase-level rollup template

When EVERY task in a phase ships, replace the phase's whole section with one paragraph:

```markdown
### ✅ Week 3 — Migrate to AI SDK v6 native HITL + add `contextBag` — SHIPPED 2026-05-23

`needsApproval` field on `ToolDef` honoured alongside legacy `confirmation:"twoStep"` via `resolveNeedsApproval`; `aiConversations.contextBag` schema + migration; `set_context_var` synthetic tool; "Facts already known" injected into prompt; frontend `addToolApprovalResponse` mutation alias matches AI SDK v6 cookbook surface. See `convex/ai/orchestrator/streamLoop.ts`, `convex/ai/tools/contextBag.ts`. Score 41 → 73.
```

Inside-phase per-task ✅ lines (`✅ T3.1 …`) get deleted at this point. The git history still has them.

### When you do the cleanup

1. **In the same edit** that flips a task's status to ✅. Don't queue it for "later" — it'll never happen.
2. **Before** writing your reply summary to the user. The doc is the source of truth; your chat reply is a reflection of the doc.
3. **Pre-flight every session**: scan the docs you're about to touch and check for completed-but-not-summarised tasks. Apply the rule retroactively if you find them.

### What you MUST do every time you ship work that touches a tracking doc

Workflow checklist (run mentally before ending a message that included a doc edit):

- [ ] Did I flip every shipped task's status to ✅ AND collapse it to a one-liner?
- [ ] Did I keep every pending task's full context (sub-bullets, file paths, code sketches)?
- [ ] Did I keep every audit-finding row, just flipping the Status column to Implemented / Partial / Pending?
- [ ] Did I keep avoid-lists, sequence diagrams, verification protocols verbatim?
- [ ] If a whole phase shipped, did I roll up its per-task lines into one paragraph?
- [ ] Did I update **every tracking doc** the change touches (typically: phase audit + module STATE.md + global todos.md)?

### Why this rule exists

Without it, every doc grows monotonically. After 5 phases the user can't tell what's pending without scrolling 600 lines. Then they have to ask "what's left?" — which is the exact question this rule eliminates. Cheap to enforce per-message; expensive to retrofit at month 6.

## RULE: RTL-safe Tailwind classes only

This app supports Arabic (RTL) and English (LTR). **Never use directional CSS classes.**

| ❌ Banned | ✅ Use instead |
|---|---|
| `ml-*`, `mr-*` | `ms-*`, `me-*` |
| `pl-*`, `pr-*` | `ps-*`, `pe-*` |
| `left-*`, `right-*` | `start-*`, `end-*` |
| `border-l`, `border-r` | `border-s`, `border-e` |
| `rounded-l-*`, `rounded-r-*` | `rounded-s-*`, `rounded-e-*` |
| `text-left`, `text-right` | `text-start`, `text-end` |
| `float-left`, `float-right` | `float-start`, `float-end` |

Apply `dir="rtl"` to `<html>` for Arabic locale. All logical properties flip automatically.

## RULE: Dynamic border-radius — never hardcode

All border-radius values must use the CSS variable `--radius` (set by the theme system).

| ❌ Banned | ✅ Use instead |
|---|---|
| `rounded-md`, `rounded-lg`, `rounded-xl` | `rounded-[var(--radius)]` |
| `rounded-full` | OK only for avatars/pills/dots |
| `border-radius: 8px` in CSS | `border-radius: var(--radius)` |

The `--radius` variable is set in `globals.css` and controlled by the theme preset. This ensures all UI elements respect the workspace's chosen border-radius setting.

## RULE: No hardcoded app strings

Never hardcode the app name, description, URL, or platform prefix in user-visible code.

| ❌ Banned | ✅ Use instead |
|---|---|
| `"Orbitly"` in JSX/UI | `APP_CONFIG.name` |
| `"AI-Powered CRM..."` | `APP_CONFIG.description` |
| `"orbitly.app"` | `APP_CONFIG.url` |
| `"ORB"` prefix | `APP_CONFIG.platformPrefix` |

`APP_CONFIG` reads from `process.env.NEXT_PUBLIC_*` — white-label deployments just change env vars.

## RULE: Convex env vars for backend secrets

For Convex functions (not Next.js), use `process.env.VARIABLE_NAME` directly — Convex reads from the Convex dashboard environment variables, not `.env.local`. Never hardcode platform names or prefixes in Convex functions.

## RULE: AI tools call `*ForAI` internal twins, NEVER public `orgQuery`/`orgMutation` (NON-NEGOTIABLE)

> **Why this is a rule, not a guideline.** AI tools execute inside
> `processChat.run`, an `internalAction` that Convex schedules via
> `ctx.scheduler.runAfter`. **Per the Convex docs, scheduled actions do
> NOT propagate auth identity:**
>
> > *"The auth is not propagated from the scheduling to the scheduled
> > function. If you want to authenticate or check authorization, you'll
> > have to pass the requisite user information in as a parameter."*
> > — [docs.convex.dev/scheduling/scheduled-functions#auth](https://docs.convex.dev/scheduling/scheduled-functions#auth)
>
> If a tool calls a public `orgQuery` / `orgMutation` directly via
> `ctx.runMutation(api.foo.bar.create, …)`, `getAuthUserId(ctx)` returns
> `null` inside that handler and `requireOrgMember()` throws
> `UNAUTHORIZED`. The AI loop then ping-pongs on the error and either
> hangs ("Preparing response…") or gives up with an empty body. This is
> the systemic root cause we hit on 2026-05-24.

### The Option B pattern — every AI-callable handler has an internal twin

For every public `orgQuery` / `orgMutation` an AI tool needs to call,
the same file MUST also export an internal `*ForAI` twin sitting next
to it. The twin:

1. Is declared with `internalQuery` / `internalMutation` so it can never be hit from the client.
2. Takes `userId: v.id("users")` as an explicit arg.
3. Validates membership via `requireOrgMemberByIds(ctx, orgId, userId)` — never `getAuthUserId(ctx)`.
4. Calls the **same `*Impl` body** the public version calls. Zero divergence over time.

```ts
// convex/crm/x/mutations.ts

// 1. Extract the body into a private *Impl helper that takes a MutationCtx.
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

### How the helper rewrites paths automatically

Tools call `toolMutation(tc, "crm/x/mutations:create", args)` from
`convex/ai/tools/_shared.ts`. The helper:

1. Rewrites the path to `crm/x/mutations:createForAI`.
2. Injects the trusted `userId` from the orchestrator's `ToolContext`.
3. Skips both transforms for `ai/*` paths — those are already internal-only.

So tool authors **always write the public path string** — they never
spell out `…ForAI`. If the twin doesn't exist, runtime fails with
"function not found", which is loud, fast, and easy to debug.

### What you MUST do when writing a new AI tool

- [ ] Confirm the public handler exists.
- [ ] If the tool calls a public `orgQuery`/`orgMutation`, **add the `*ForAI` twin in the same change** — do not ship the tool without it.
- [ ] Extract the shared body into an `*Impl` helper if not already done. Keep public + ForAI signatures aligned.
- [ ] Use `requireOrgMemberByIds(ctx, args.orgId, args.userId)` in the twin — never `getAuthUserId`.
- [ ] Call from the tool via `toolMutation(getCtx(), "module:export", args)` — pass the public path; the helper appends `ForAI` automatically.
- [ ] Never accept `userId` as an arg on a public mutation. The twin is the ONLY place `userId` is an arg.
- [ ] If the call goes to `convex/ai/*`, do NOT add a twin — the helper passes those through unchanged because they're already internal-only.

### Verification

`pnpm typecheck` catches a missing twin only when the path is statically
typed. Most tools use the loose-string overload, so the failure mode is
runtime "function not found". The agent scorer test
(`convex/ai/agentScorer.test.ts`) exercises the full tool layer end-to-end
and is the right place to add coverage when adding a new high-risk tool.

### Why we use a runtime path rewrite instead of generated code

Public + AI paths are stable shapes — the helper just appends the
`ForAI` suffix. Doing it at runtime keeps tool authors writing the
familiar public path strings (matches every tool migration guide we
have linked off `core/ai/MODULE.md`) and means **forgetting the twin
fails fast** instead of silently calling the wrong handler.

## RULE: Convex schema/data changes — migrate IN THE SAME MESSAGE, never defer

> **The non-negotiable rule:** If you change anything in Convex that breaks
> existing data — schemas, validators, table fields, indexes, enum values,
> permission keys, reserved slugs, or any data shape consumers depend on — you
> MUST handle the full migration / cleanup / backfill in **the same message
> that introduces the change**. Do not push a schema change and "fix it later".
> Do not leave the deployment in a state where Convex's schema validator can
> reject existing rows or where a query/mutation will crash on legacy data.

### What counts as a breaking change (and triggers this rule)

| Change | Breaks if you don't migrate |
|---|---|
| Adding a required (non-optional) field to a table | Existing rows fail schema validation. |
| Removing a field that's not optional | Existing rows fail schema validation. |
| Narrowing a validator (e.g. `v.string()` → `v.union(v.literal("a"), v.literal("b"))`) | Existing rows with other values fail. |
| Renaming a field | All readers reference the old name; new writers use the new name; data forks. |
| Changing an index's key columns or order | Existing queries silently return wrong/empty results. |
| Removing or renaming an index | Any query using `.withIndex(...)` referencing it breaks at runtime. |
| Splitting one table into two (e.g. `notes.isActivityChat` → new `messages` table) | Old rows still exist in the source table; consumers see duplicates or stale data. |
| Adding a new permission key to `_shared/permissions/catalog.ts` | Existing role docs miss the key — every gated mutation rejects them until backfilled. |
| Adding a reserved slug | Existing orgs may already use the slug as an entity slug — must reject + rename. |
| Adding a new notification preference key | Existing users miss the key in their preferences — UI form breaks or notifications never fire. |
| Renaming an entity code prefix (e.g. `P-` → `PER-`) | Every cross-table reference (deals.personCode, messages.personCode, activityLogs) is now stale. |
| Tightening a unique index | Existing duplicate rows must be deduped or the index creation will fail in production. |

### What you MUST deliver in the same message as the change

1. **The schema change itself** — `convex/schema/*.ts`, `convex/_shared/permissions/catalog.ts`, `convex/_shared/reservedSlugs.ts`, `convex/_shared/notificationKeys.ts`, etc.
2. **A migration function** — typically an internal mutation in `convex/_migrations/<descriptive-name>.ts` (or extend an existing migration file) that:
   - Iterates affected rows in batches (use `paginationOpts` for large tables).
   - Backfills new fields with sensible defaults.
   - Renames fields by reading old + writing new + clearing old in one patch.
   - Splits/copies rows into new tables when restructuring.
   - Is **idempotent** — safe to run twice. Skip rows that already match the new shape.
3. **Caller updates** — every query, mutation, action, AI tool, and frontend hook that referenced the old shape, names, or indexes is updated in the same diff. No orphaned references.
4. **Permission catalog & defaults** — new permissions added to the catalog AND added to the right role's default set. Run the seed-permissions backfill mutation if existing role docs need them.
5. **Verification step** — explicitly state in the response:
   - "I read X consumers and updated all of them."
   - "I ran the migration on the dev deployment and confirmed N rows updated."
   - "Schema typecheck passes (`pnpm typecheck`)."
   - If the migration cannot run yet (e.g. it's part of a multi-step rollout), say so explicitly and document the next required step.

### Workflow before ending the message

Before considering the change "done":
- [ ] Schema validators accept every existing row in the dev DB (or the migration was run and now they do).
- [ ] Every reader/writer of the changed shape was updated.
- [ ] `pnpm typecheck` passes.
- [ ] `pnpm dev` (Convex push) succeeds without "schema validation failed" errors.
- [ ] If any step couldn't be completed in this session, the response calls it out as a blocker — never silently shipped.

### Examples of compliance vs failure

✅ **Compliant**: "Adding `messages.subscribe` permission. Updated catalog.ts, added it to Owner/Admin defaults, wrote `convex/_migrations/2026-05-16-add-messages-subscribe-perm.ts` to backfill existing role docs, updated `useAddParticipants` to gate on it, ran migration in dev — 4 role docs updated."

❌ **Non-compliant**: "Renamed `notes.isActivityChat` to `notes.messageKind`. Will write the migration in a follow-up." — DO NOT do this. Existing rows still have `isActivityChat`, every query reading them now fails the validator. Either rename + migrate atomically, or don't rename at all this message.

### Why this rule exists

Skipped migrations don't surface immediately — they surface when a real user hits the affected codepath in production. By then the team has shipped 10 more things on top of the broken assumption, and rolling back is expensive. **The cheapest moment to fix a migration is the moment you decide on the schema change.** This rule moves all migration cost to that moment, not later.

---

# 🔒 PERFORMANCE-CRITICAL RULES (locked 2026-05-18)

> Driven by the audit pass that found a single drag firing 50+ Convex
> calls (vs the production-grade target of 1) and 20% of all calls being
> identity/RBAC overhead from per-component subscriptions.

## RULE: Drag persistence is one mutation per drop

Drag-and-drop callbacks (`onDragOver`, `onValueChange`) are for **VISUAL feedback only**. Persistence happens in `onCommit` / `onDragEnd`, exactly once, **for the dragged item only**.

| ❌ Banned | ✅ Use instead |
|---|---|
| Calling `useMutation()` from `onValueChange` | Call from `onCommit` |
| Iterating the layout diff and persisting per-displaced-card | Persist only `draggedItemId` (the dnd-kit primitive forwards it) |
| Storing `pendingLayout` in a `useRef` | Use `useState` so render reflects it |
| Bumping `updatedAt` in optimistic updates | Let server stamp it; cascading invalidations otherwise |

**Reference:** `components/ui/kanban.tsx::onCommit` plus the `useKanbanItems()` hook + `KanbanBoardBody` in `core/data-display/kanban/components/KanbanBoard.tsx`.

**Rationale:** A drag across N cards in a column otherwise fires N+1 mutations and 5N+ list re-subscriptions. With the rule applied: 1 drag = 1 mutation = 1 optimistic patch = 0 list re-subscriptions. Verified by `convex/crm-hardening.test.ts::"notes.reorder (single-write invariant)"`.

## RULE: Per-row data on a list view comes from one batched query

If a list/board renders N rows where each row needs auxiliary data (tags, attachments, assignee, etc.), the parent view fetches **ONE batched query** that returns `{ [rowId]: data }`. Per-row child components accept the slice via prop. Per-row `useQuery` is only acceptable for single-row pages (detail view, side panel).

| ❌ Banned | ✅ Use instead |
|---|---|
| `<TagsCell>` calling `getTagsForEntity` per card on a board | Pass `prefetchedTags` from `useEntityTagsMap(orgId, slot)` |
| `<NoteCard>` calling `useAttachmentDisplay` per card | Pass `resolvedAttachmentDisplay` from `useAttachmentDisplaysForOrg` |
| `<AssigneeCell>` calling `listMembers` per cell | Read from `useOrgMembers()` context |

**Reference:** `core/entities/shared/hooks/useEntityTagsMap.ts`, `core/comms/notes/hooks/index.ts::useAttachmentDisplaysForOrg`. Add new batched queries when introducing new per-card data needs.

## RULE: Identity/auth/labels via context, not subscriptions

`getMyMembership`, `listMembers`, `orgs.get`, `getEntityLabels`, `users.me` are session-scoped. They MUST be fetched ONCE at the layout level (`<OrgProvider>`) and provided via React context. Components MUST NOT call these via `useQuery` directly.

| ❌ Banned | ✅ Use instead |
|---|---|
| `useQuery(api.orgs.queries.listMembers, { orgId })` | `useOrgMembers()` |
| `useQuery(api.orgs.queries.getMyMembership, ...)` | `useCurrentOrg().membership` or `useOrgPermissions()` |
| `useQuery(api.orgs.queries.getEntityLabels, ...)` | `useEntityLabels()` (auto-detects context) |
| Looking up `memberNameById` from a `members.map` per render | `useOrgMemberNameMap()` |

**Reference:** `core/shell/shared/hooks/useCurrentOrg.tsx`. Mounted once in `DashboardLayoutClient.tsx`. Auth/identity overhead dropped from ~20% of all Convex calls to ~3% after this rule landed.

## RULE: Every list-affecting mutation has `withOptimisticUpdate`

If a mutation changes a row that's rendered in a list, it MUST patch the local cache via `withOptimisticUpdate`. This eliminates the "fire mutation → wait → re-render → flash" loop and the `listX` re-subscription spam that triggers when the cache invalidates.

The optimistic update MUST NOT bump `updatedAt: Date.now()` — that changes row identity on every render and cascades list invalidations. Let the server stamp `updatedAt`; the optimistic patch only writes the user-visible field (`sortOrder`, `categoryId`, `assignedTo`, etc.).

**Reference:** `core/comms/notes/hooks/index.ts::useReorderNote`, `useSetNoteCategory`. Apply the same shape to any new mutation that touches list-rendered fields.

## RULE: Rate-limit drag mutations server-side

All public mutations triggered by user UI gestures (drag, click, type) MUST gate on `enforceRateLimit`. Drag-driven mutations specifically use a 120/min budget, scoped per `(userId, orgId)`. The scope name is shared across related mutations so a user can't bypass by alternating (e.g. `notes.reorder` and `notes.setCategory` share scope `notes.reorder`).

```ts
await enforceRateLimit(ctx, {
  scope: "notes.reorder",       // shared across reorder + setCategory
  key: `${userId}:${args.orgId}`,
  max: 120,
  periodMs: 60_000,
  orgId: args.orgId,            // honours per-tenant overrides
});
```

**Reference:** `convex/_shared/rateLimit.ts`. Test coverage: `convex/crm-hardening.test.ts::"rejects after 120 ... inside the rate-limit window"`.

---



# 🔒 LOCKED ARCHITECTURAL DECISIONS — DO NOT REVISIT

> These 10 decisions are settled. Do not reopen unless the user explicitly says so.
> Folded in from `PROJECT_ANALYSIS.md` (deleted) on 2026-05-16.

| # | Decision |
|---|---|
| 1 | **Convex** for all server state; **Zustand** for UI-only state. Never use Zustand for data fetched from Convex. |
| 2 | Entity labels + slugs are NEVER hardcoded — always DB-backed via `orgs.settings.entityLabels`. |
| 3 | `useEntityLabels()` is the one canonical hook for entity labels. Re-exported from `core/shell/shared/hooks/` for back-compat. |
| 4 | Single `/settings` route with `?group=` query param — no sub-routes under settings. |
| 5 | Per-section save in settings — no global save button. Each section is its own form + mutation. |
| 6 | Appearance preferences = per-user (cookies), zero org impact. Apply via `<PreferencesInitializer />` + `ThemeBootScript`. |
| 7 | Org-wide activity log lives at `/{locale}/{orgSlug}/timeline` and `/{orgSlug}/settings/activity-log` — NOT a separate top-level route. |
| 8 | Person detail page uses `personCode` as slug: `/profile/P-001`. ONE page for lead + contact (resolved by `crm.people.queries.getByPersonCode`). |
| 9 | The 4 entity scaffolds (`EntityListPage`, `EntityDetailPage`, `EntityFormDialog`, `EntityCard`) handle ALL entities — including the 2 optional industry slots (entity5/entity6). |
| 10 | `Element.scrollIntoView()` is BANNED inside the dashboard shell — causes layout shift in nested scroll containers. Use `scrollToSection` from `core/platform/settings/hooks/useSettingsSearch.ts` instead. |

# 🔒 BACKEND DECISIONS LOCKED 2026-05-16 (audit pass)

| # | Decision |
|---|---|
| 11 | **Six independent tables** for cross-cutting concerns: `notes`, `messages`, `notifications`, `activityLogs`, `reminders`, `files`. Timeline + Calendar are read-merge views, no tables. (Was previously `notes.isActivityChat` flag — removed.) |
| 12 | **`personCode` is the stable identity**. Generated only at lead creation, passed through `convertToContact`, never regenerated. Used in URLs, AI prompts, WhatsApp, activity logs, deals, reminders, messages. |
| 13 | **Permission catalog SSOT** at `convex/_shared/permissions/catalog.ts`. Add a permission ONCE; derives seed-permissions, runtime checks, role-editor UI, backfill, and tests. |
| 14 | **Reserved slugs SSOT** at `convex/_shared/reservedSlugs.ts`. Imported everywhere — never inlined in any mutation. |
| 15 | **Notification preference keys SSOT** at `convex/_shared/notificationKeys.ts`. Drives schema validator, mutation validator, and UI form. |
| 16 | **No hardcoded permission lists anywhere** — every consumer (mutations, tests, seed flows, UI gates) imports from `getDefaultPermissionsForRole(role)` or per-key `requireRole(member.permissions, key)`. |
| 17 | **Canonical mutation pattern** (BUILD-ORDER.md §"CONVEX CANONICAL MUTATION PATTERN"): RBAC → dedup → record code → DB → logActivity (with personCode for person-related) → sendNotification → AI rebuild → return. Every public mutation that creates rows must add a rate limit. |
| 18 | **File uploads**: max-size and allowed-mime categories come from `org.settings.fileUpload` — NOT hardcoded. Scope/scopeId validated on every record. Ownership or `files.deleteAny` permission required to delete. |
| 19 | **Convex folder layout**: kept logically grouped by domain via `convex/_arch.md`; physical structure stays flat at the top level so the public `api.X` paths don't break. CRM domain physically grouped under `crm/{entities,fields,people,shared}`. |
| 20 | **Sentry/PostHog DSNs come from env vars** — never hardcoded. `SENTRY_DSN`, `NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN`, `NEXT_PUBLIC_POSTHOG_HOST`. If unset, providers no-op gracefully. |
| 21 | **Reminders + Calendar UI uses the donor pattern only** from the shadcnstore template — never the JSON mocks. Donor's `tasks/page.tsx` informs the stats-grid + DataTable layout; donor's `calendar-main.tsx` informs the month/week/day/list grid. Every event handler is rewired to our Convex hooks. |
| 22 | **Calendar grid is a pure renderer** — `<CalendarMain>` accepts an `events` prop and never calls `useQuery` or `useCurrentOrg`. Bucketing runs once at the parent via `useMemo`. Cell renderers receive only props. The popover state is owned by the parent grid (anchor + open) so chips never carry their own popover instance. |
| 23 | **EventForm is a thin wrapper around ReminderForm** with calendar-specific defaults (`source="calendar"`, midnight clicks snap to 9 AM, submit reads "Save as reminder"). One form to maintain; UX surfaces the "calendar event = reminder" model. |
| 24 | **All scheduling write mutations gate on `RATE_LIMITS.write`** under a shared scope (`reminders.write` for `complete` / `update` / `remove`; `reminders.create` for create). Same-class limits across writes; a frantic user can't bypass by alternating verbs. |
| 25 | **Embedded calendar panels clamp the date range to ±45 days** (90-day cap from the spec). Bounds the read set; prevents 5-year scans. The org-wide CalendarView uses `getRangeForView(viewMode, selectedDate)` which is always <= 1 month. |

---

# 🔴 CRITICAL SESSION RULES (NON-NEGOTIABLE — read before anything else)

## ⛔ RULE 0: UPDATE STATE.md BEFORE ENDING EVERY SESSION (NON-NEGOTIABLE)

> This rule fires BEFORE Rule 1. No exceptions. No skipping. Ever.

**After completing ANY work in a module, you MUST:**
- Update `STATE.md` in EVERY module you touched during the session
- Mark completed items as ✅, add new pending items as ⬜
- Record the new route structure, file paths, and architecture decisions
- If a module has no `STATE.md`, create one before ending

**Modules that MUST have STATE.md:**
- `core/shell/STATE.md` — shell layout, navigation, guards
- `core/onboarding/STATE.md` — onboarding wizard, steps, mutations
- `core/auth/STATE.md` — auth flow, guards, OAuth
- `core/entities/STATE.md` — entity scaffolds, list/detail/form
- `core/ai/STATE.md` — AI tools, conversations, system prompt
- `core/settings/STATE.md` — settings pages, RBAC gates
- Any other `core/*/STATE.md` or `features/*/STATE.md` you worked in

**Format for STATE.md:**
```
# [Module] — State
> Updated: [DATE]
> Status: [X% Complete] — [one-line summary]

## ✅ Completed
| Component | File | Notes |

## ⬜ Pending
| Task | Priority | Notes |

## Architecture Notes
[Key decisions made this session]
```

**Failure to update STATE.md = broken contract. The next AI session will have no context.**

---

## ⛔ RULE 1: NEVER END SESSION WITHOUT EXPLICIT USER PERMISSION

> This is the highest-priority session rule. No exceptions. Ever.

**You MUST NOT:**
- End the session, say "bye", "done", "task complete", or stop responding without the user explicitly saying to stop
- Consider a task "finished" just because you completed the code
- Let a session wind down passively

**You MUST:**
- After completing any task, use `ask_user` to ask what to do next
- Provide concrete next-step options as multiple-choice choices
- Keep the session alive until user explicitly says "end session", "stop", "bye", or similar closing phrase
- Even if the user says "thanks" or "looks good" — ask if there's anything else

## ⛔ RULE 2: READ ALL INSTRUCTION FILES BEFORE WRITING ANY CODE

**Before writing ANY code in any session, you MUST read ALL of these files in order:**

1. `.github/agents/base/AGENT.md` — Agent instructions & session protocol
2. `.github/agents/base/context.md` — Current build state
3. `.github/agents/base/todos.md` — Active todo list
4. `.github/agents/base/checklist.md` — Phase checklists
5. `.github/agents/base/rules.md` — Non-negotiable coding rules (read top to bottom)
6. `.github/agents/base/schema.md` — All Convex tables & indexes
7. `.github/agents/base/folder-structure.md` — Target file/folder tree
8. `.github/agents/base/tech-stack.md` — Libraries, versions, roles

**Skipping any file = breaking the contract. Do not skip any file.**

## ⛔ RULE 3: ALWAYS USE ask_user FOR QUESTIONS AND NEXT STEPS

- Never ask questions in plain text output
- Never present "what should we do next?" as a list in your response text
- Always use the `ask_user` tool with `choices` array for next-step options
- This gives the user proper control over what happens next

## ⛔ RULE 4: TOOLING — pnpm only, run checks after every change

- Use `pnpm` exclusively — never `npm` or `yarn`. The lockfile is `pnpm-lock.yaml`.
- After any non-trivial change run `pnpm typecheck` and `pnpm exec biome check .`. They must come back 0 errors / 0 warnings before the change is "done".
- Before merging or ending a session that touched runtime code: also run `pnpm test`, `pnpm exec vitest run`, `pnpm build`. All green for the **whole repository**, not just the files you touched.
- Never run interactive git commands (`-i` flags). Convex codegen drift: when in doubt, run `npx convex codegen`.

---

# ⛔ ABSOLUTE RULE — NO TRAINING DATA

> **This rule overrides everything. No exceptions. Ever.**

## 🚫 NEVER write code, patterns, configs, or suggestions from AI training data memory.

### What you MUST do instead:

1. **Use MCP servers** — Convex MCP, GitHub MCP, Sentry MCP, Trigger.dev, Firecrawl
2. **Scan the web** — Use Firecrawl to find production-ready codebases, docs, examples
3. **Use GitHub MCP** — Search `github-mcp-server-search_code` for real production code patterns
4. **Use official docs** — Always fetch latest docs via Firecrawl, never recall from memory
5. **Use project context** — Read `.github/agents/base/` files first, scan actual project files

### Enforcement Rules:

- ❌ **BANNED**: Writing ANY code from memory/training data
- ❌ **BANNED**: Suggesting patterns you "know" without a live web source
- ❌ **BANNED**: Using outdated API patterns from training data
- ❌ **BANNED**: Generic suggestions not grounded in real production code
- ✅ **REQUIRED**: Use Firecrawl `firecrawl-search` / `firecrawl-scrape` skill for every code pattern
- ✅ **REQUIRED**: Use `github-mcp-server-search_code` to find real implementations
- ✅ **REQUIRED**: Cite every source with a direct URL after every code block

### End-of-Chat Attestation (COMPULSORY):

At the end of **every chat response**, you MUST include:

```
---
📚 Sources Used:
- [Source Name](URL) — what was taken from here
- [GitHub Repo](URL) — what pattern was referenced

✅ Training Data Used: YES | NONE
All code and suggestions were sourced from live web searches, MCP servers, and production codebases listed above.
```

If you cannot provide sources, **do not write the code**. Ask the user for direction instead.

## RULE: `app/` contains thin wrappers only

Files inside `app/` (Next.js App Router pages and layouts) must be **thin wrappers only**.

| ❌ Banned in `app/` | ✅ Put it here instead |
|---|---|
| Component definitions (functions, classes) | `core/*/views/`, `core/*/components/`, `features/*/` |
| Business logic, hooks, data fetching | `core/*/views/` (client components) |
| Inline JSX beyond a single `return <View />` | `core/*/views/` |

**App pages must only:**
1. Unwrap `params` / `searchParams`
2. Import and render a single view component from `core/` or `features/`
3. Export `metadata` or `generateMetadata` if needed

```tsx
// ✅ Correct — thin wrapper
export default async function Page({ params }) {
  const { orgSlug } = await params;
  return <MyFeatureView orgSlug={orgSlug} />;
}

// ❌ Wrong — logic in app/
export default function Page() {
  const data = useQuery(...);
  return <div>...</div>;
}
```

---

## RULE: Never use `Element.scrollIntoView()` inside nested scroll containers

The dashboard shell nests 3+ scroll containers (body → sidebar-inset `<main>` → view `<main>`).
`element.scrollIntoView()` walks UP the DOM and recursively scrolls **every scrollable
ancestor** until the element is in the root viewport. In a nested shell this shifts the
outer layout — the topnav slides up, the sidebar re-flows, the whole page "jumps."

**Observed symptom** (fixed 2026-05-12): Clicking a sub-group pill in the settings
topnav toolbar (only reproducible on the CRM tab, because it's the only group long
enough to make the inner `<main>` actually scroll) caused the entire dashboard layout
(topnav + settings sidebar + content) to shift up as if the window itself had scrolled.

### The rule

| ❌ Banned | ✅ Use instead |
|---|---|
| `element.scrollIntoView()` inside any shell view | Find the explicit scroll container and call `container.scrollTo({top})` |
| `element.scrollIntoView({block: "start"})` on anchor clicks | Compute offset vs. container, call `container.scrollTo` |
| `window.scrollTo({top: 0})` in dashboard pages | Target the inner `<main>` with `document.querySelector('main[data-*-scroll]')` |

### The pattern

```ts
// Reusable — works for any nested scroll container
function scrollToElementInContainer(el: HTMLElement, offset = 24) {
  // Walk up to find the nearest scrollable ancestor
  let container: HTMLElement | null = el.parentElement;
  while (container && container !== document.body) {
    const overflowY = getComputedStyle(container).overflowY;
    if ((overflowY === "auto" || overflowY === "scroll") &&
        container.scrollHeight > container.clientHeight) break;
    container = container.parentElement;
  }
  if (!container) return;

  const elRect = el.getBoundingClientRect();
  const containerRect = container.getBoundingClientRect();
  const top = container.scrollTop + (elRect.top - containerRect.top) - offset;
  container.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
}
```

### Mark your scroll containers explicitly

Add `data-*-scroll="true"` on every `<main>` that is a scroll container inside the shell.
This makes them easy to target with `document.querySelector` without brittle selectors.

```tsx
// ✅ Correct — explicit marker, precise targeting
<main data-settings-scroll="true" className="overflow-y-auto">…</main>
```

**Cross-reference**: `core/settings/hooks/useSettingsSearch.ts::scrollToSection` is the
reference implementation. Copy the pattern for other nested-scroll views.

---

## RULE: First-time coachmarks — use `<FirstTimeTour>`, never tooltips, for power gestures

Tooltips re-fire on every hover, even after the user understands the feature. That's
fine for one-off labels. It is **not** fine for power gestures (single-click vs
double-click, drag-and-drop, keyboard shortcuts, hidden menus). The right pattern is a
sequential coachmark that fires once, points at the element, explains the gesture in a
sentence, and never returns.

### When to use a tour vs a tooltip

| Need | Pattern |
|---|---|
| Static label ("Delete", "Convert") | Tooltip |
| Distinguishing single-click vs double-click | **FirstTimeTour** |
| Explaining drag-and-drop on the kanban | **FirstTimeTour** |
| Surfacing a hidden ⋮ menu / view-options popover | **FirstTimeTour** |
| Walking through a brand-new feature | **FirstTimeTour** |
| Onboarding wizard | core/onboarding (different — full-screen, not a tour) |

### Component

`components/ui/first-time-tour.tsx` — `<FirstTimeTour id="..." steps=[...] />`.
Persists "user has seen this tour" in localStorage under `flowbite:tours:seen`. The id
is the persistence key — bump it (`v1` → `v2`) when steps change meaningfully.

### Three-line wiring (anywhere in the app)

```tsx
// 1. Tag the elements you want to highlight
<button data-tour="convert-shortcut">+</button>
<button data-tour="kanban-grip">⋮</button>

// 2. Drop the tour where the page mounts
<FirstTimeTour
  id="leads-board-v1"
  steps={[
    { target: "convert-shortcut",
      title: "One-click convert",
      body: "Click once to convert. Double-click to open the full form." },
    { target: "kanban-grip", side: "start",
      title: "Drag to change status",
      body: "Grab the grip to drop a card into a different column." },
  ]}
/>
```

### Rules

1. **One id, one tour.** Same id can be mounted on multiple routes — it still fires
   only once per device.
2. **Bump the id when you change the steps** (`leads-board-v1` → `leads-board-v2`)
   so users see the updated tour.
3. **`data-tour=` attribute is the targeting contract.** Don't switch to ids — they
   collide too easily across SSR/CSR.
4. **Steps are sequential and skippable** — Esc, the × button, or clicking the
   backdrop dismisses the whole tour. Don't add a "remind me later".
5. **Reset for testing.** Call `resetAllTours()` from `components/ui/first-time-tour.tsx`,
   or surface a "Replay tutorials" button in Settings → Appearance later if needed.
6. **Render the tour inside `<>` after the regular UI.** Conditionally mount when the
   relevant view is visible (e.g. only on the board view, not the table) — keeps it
   from firing on the wrong page.

### Reference implementation

`core/entities/_entities/leads/views/LeadsView.tsx` — `LEADS_BOARD_TOUR_STEPS`
with three steps (single/double-click convert, drag to change status, view
options). Tagged elements: `data-tour="lead-card-convert"` (EntityCard primary
shortcut), `data-tour="lead-card-grip"` (EntityCard drag handle),
`data-tour="view-options-trigger"` (ViewOptionsMenu trigger).

---

<!-- code-review-graph MCP tools -->
## MCP Tools: code-review-graph

**IMPORTANT: This project has a knowledge graph. ALWAYS use the
code-review-graph MCP tools BEFORE using Grep/Glob/Read to explore
the codebase.** The graph is faster, cheaper (fewer tokens), and gives
you structural context (callers, dependents, test coverage) that file
scanning cannot.

### When to use graph tools FIRST

- **Exploring code**: `semantic_search_nodes` or `query_graph` instead of Grep
- **Understanding impact**: `get_impact_radius` instead of manually tracing imports
- **Code review**: `detect_changes` + `get_review_context` instead of reading entire files
- **Finding relationships**: `query_graph` with callers_of/callees_of/imports_of/tests_for
- **Architecture questions**: `get_architecture_overview` + `list_communities`

Fall back to Grep/Glob/Read **only** when the graph doesn't cover what you need.

### Key Tools

| Tool | Use when |
|------|----------|
| `detect_changes` | Reviewing code changes — gives risk-scored analysis |
| `get_review_context` | Need source snippets for review — token-efficient |
| `get_impact_radius` | Understanding blast radius of a change |
| `get_affected_flows` | Finding which execution paths are impacted |
| `query_graph` | Tracing callers, callees, imports, tests, dependencies |
| `semantic_search_nodes` | Finding functions/classes by name or keyword |
| `get_architecture_overview` | Understanding high-level codebase structure |
| `refactor_tool` | Planning renames, finding dead code |

### Workflow

1. The graph auto-updates on file changes (via hooks).
2. Use `detect_changes` for code review.
3. Use `get_affected_flows` to understand impact.
4. Use `query_graph` pattern="tests_for" to check coverage.

---

## RULE: Never put hook-returned objects in useEffect deps (max-update-depth prevention)

This rule prevents the **#1 recurring bug** in this codebase: `Maximum update depth exceeded`.

### The root cause pattern

```tsx
// ❌ BANNED — causes infinite loop
const fileBuffer = useFileBuffer(orgId); // returns a new object ref when internal state changes
useEffect(() => {
  fileBuffer.reset(); // sets state → new fileBuffer ref → effect re-fires → ∞
}, [open, fileBuffer]); // ← fileBuffer is unstable!
```

### The 3 rules

| # | Rule | Why |
|---|---|---|
| 1 | **Never put a custom-hook return value in useEffect deps** | Custom hooks return new object references when their internal state changes. Putting the whole object in deps creates a feedback loop: effect fires → calls method → state changes → new ref → effect fires again. |
| 2 | **If a useCallback needs to read state, use a ref** | `useCallback([state])` makes the callback unstable. Instead: `const stateRef = useRef(state); stateRef.current = state;` then read `stateRef.current` inside the callback. The callback stays stable (`[]` deps). |
| 3 | **If useEffect must call a method from a hook, destructure the stable method** | `const { reset } = useFileBuffer(orgId);` — if `reset` is wrapped in `useCallback([], [])` it's stable. Put `reset` in deps, not the whole hook return. |

### Safe patterns

```tsx
// ✅ CORRECT — destructure the stable method
const { reset } = useFileBuffer(orgId);
useEffect(() => {
  if (!open) reset();
}, [open, reset]); // reset is useCallback([], []) — stable

// ✅ CORRECT — use a ref for state-dependent callbacks
const filesByFieldRef = useRef(filesByField);
filesByFieldRef.current = filesByField;
const commitAll = useCallback(async (args) => {
  const entries = Object.entries(filesByFieldRef.current); // reads via ref
  // ...
}, [orgId, record]); // no state in deps → stable

// ✅ CORRECT — functional updater that returns prev when unchanged
useEffect(() => {
  setCardFields((prev) => {
    const next = prev.filter(f => allowed.has(f));
    return next.length === prev.length ? prev : next; // same ref = no re-render
  });
}, [defaultCardFields]);
```

### How to audit for this bug

```bash
# Find useEffect deps that include a custom hook return:
grep -rn "useEffect.*\], \[.*[a-z].*\])" core/ --include="*.tsx" | grep -v "node_modules"
# Then check: is the dep a hook return? Is it stable? Does the effect mutate it?
```

### When you see "Maximum update depth exceeded" in the console

1. The **reported file:line** is usually a SYMPTOM, not the cause. React reports wherever it happens to be rendering when the limit is hit.
2. Look for the **useEffect that's firing repeatedly** — add `console.count("effect X")` temporarily.
3. Check: does the effect call setState on something that feeds back into its own deps (directly or via a hook-returned object)?
4. Fix: remove the unstable dep, use a ref, or use a functional updater with same-reference bailout.

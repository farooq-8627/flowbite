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

# Read these first, in order

1. **`PENDING.md`** — every pending item with full context, grouped P0/P1/P2 + stage. Read BEFORE starting any new work.
2. **`SHIPPED.md`** — one-line changelog of every shipped scope. Read to confirm "is X already done?".
3. **`Future-Enhancements.md`** — deferral cards (currently-disabled restrictions, backlog, audit-flagged, process, P3 AI tool gaps, capability roadmap deferrals, low-priority polish, per-module deferred polish).
4. **`.github/agents/base/rules.md`** — the SOURCE OF TRUTH for non-negotiable coding rules (build hygiene, UI, Convex backend, performance). Skim before writing code; consult the relevant section before any non-trivial change.
5. **The relevant module's `MODULE.md`** — per-module architecture decisions live here.

Architecture docs: `docs/architecture/`. Marketing-site spec:
`LANDING-PAGE.md`. AI tooling rebuild: `AI-TOOLING-BUILD-STAGES.md` +
`AI-TOOLING-LAYER-PLAN.md`.

---

# 🔴 Critical session rules (NON-NEGOTIABLE)

## ⛔ RULE 0: UPDATE PENDING.md / SHIPPED.md BEFORE ENDING EVERY SESSION

After completing ANY work, in the SAME edit:
- Move every shipped scope from `PENDING.md` → `SHIPPED.md` (one-line summary with date + key file paths).
- Add any new genuinely-pending items to `PENDING.md` with full context (file paths, acceptance criteria, why deferred).
- If a guardrail / restriction / capability was disabled or weakened, add a card to `Future-Enhancements.md` (per `rules.md §1.5`).
- Per-module architecture decisions go to that module's `MODULE.md`.

Failure to update PENDING.md / SHIPPED.md = broken contract. The next session won't know what shipped.

## ⛔ RULE 1: Never end the session without explicit user permission

After completing any task, ask what to do next via a multi-choice prompt.
Never say "done" and stop. Even if the user says "thanks" or "looks good"
— ask if there's anything else. Only end on an explicit "stop" / "bye" /
"end session".

## ⛔ RULE 2: Read instruction files before writing any code

Before writing ANY code in any session, read in order:
1. `.github/agents/base/AGENT.md` — session protocol
2. `.github/agents/base/context.md` — current build state
3. `.github/agents/base/todos.md` — active todos
4. `.github/agents/base/checklist.md` — phase checklists
5. `.github/agents/base/rules.md` — non-negotiable coding rules (top to bottom)
6. `.github/agents/base/schema.md` — all Convex tables & indexes
7. `.github/agents/base/folder-structure.md` — target file/folder tree
8. `.github/agents/base/tech-stack.md` — libraries, versions, roles

Skipping any file = breaking the contract.

## ⛔ RULE 3: Always use `ask_user` for questions and next steps

Never ask questions in plain text output. Never present "what should we do
next?" as a list in your response text. Always use the `ask_user` tool with
`choices` array.

## ⛔ RULE 4: Tooling — pnpm only, run checks after every change

- Use `pnpm` exclusively. Lockfile is `pnpm-lock.yaml`. Never `npm` / `yarn`.
- After any non-trivial change, run `pnpm typecheck` + `pnpm exec biome check .`. Both 0 errors / 0 warnings before "done".
- Before merging or ending a session that touched runtime code: also run `pnpm test`, `pnpm exec vitest run`, `pnpm build`. All green for the **whole repo**, not just touched files.
- Never run interactive git (`-i` flags). Convex codegen drift: `npx convex codegen`.

## ⛔ RULE 5: Convex MCP / `npx convex run` HANGS — emit commands, don't run them yourself

Every Convex MCP tool call (`status`, `data`, `tables`, `runOneoffQuery`,
`run`, `logs`, `functionSpec`, `envGet`, `envList`, `envSet`, `envRemove`,
`insights`) AND every `npx convex run …` shell invocation hangs in this
agent runtime. Locked 2026-05-29.

What to do instead:
1. Emit the exact command for the user to run themselves:
   ```
   Run this command — paste the output back so I can continue:

   npx convex run _migrations/<file>:run '{"dryRun": true}'
   ```
2. Wait for the user to paste the output before claiming the step is "done".
3. Continue all non-Convex-MCP work in the same message — doc cleanup, code
   edits, tests, biome, build all run fine via the shell tool.
4. Always emit the dry-run version first, then the real run after the user
   confirms.
5. For read-only data inspection (`data`, `tables`, `runOneoffQuery`), emit
   a short shell command (`npx convex run <module>:<query> '{...}'`) or ask
   the user to use the Convex dashboard.

Doesn't apply to: code under `convex/**` (still readable + editable +
typecheckable + testable via the file/code tools); the vitest test harness
(`pnpm test`) which runs Convex modules in isolation via `convex-test`;
`npx convex codegen` (generates types only, never hits live deployment).

## ⛔ ABSOLUTE RULE — NO TRAINING DATA

Never write code, patterns, configs, or suggestions from training-data
memory. Use MCP servers, web search (Firecrawl), GitHub MCP, official docs,
or project context for every code pattern. Cite every source. End-of-chat
attestation block with code sources is COMPULSORY (see `rules.md §1.6`).

If you cannot provide sources, do not write the code. Ask the user for
direction.

---

# 🔒 Locked architectural decisions — do not revisit

These are settled. Do not reopen unless the user explicitly says so.

| # | Decision |
|---|---|
| 1 | **Convex** for all server state; **Zustand** for UI-only state. Never Zustand for data fetched from Convex. |
| 2 | Entity labels + slugs are NEVER hardcoded — always DB-backed via `orgs.settings.entityLabels`. |
| 3 | `useEntityLabels()` is the one canonical hook for entity labels. Re-exported from `core/shell/shared/hooks/`. |
| 4 | Single `/settings` route with `?group=` query param — no sub-routes under settings. |
| 5 | Per-section save in settings — no global save button. Each section is its own form + mutation. |
| 6 | Appearance preferences = per-user (cookies), zero org impact. Apply via `<PreferencesInitializer />` + `ThemeBootScript`. |
| 7 | Org-wide activity log lives at `/{locale}/{orgSlug}/timeline` and `/{orgSlug}/settings/activity-log` — NOT a separate top-level route. |
| 8 | Person detail page uses `personCode` as slug: `/profile/P-001`. ONE page for lead + contact (resolved by `crm.people.queries.getByPersonCode`). |
| 9 | The 4 entity scaffolds (`EntityListPage`, `EntityDetailPage`, `EntityFormDialog`, `EntityCard`) handle ALL entities — including the 2 optional industry slots (entity5/entity6). |
| 10 | `Element.scrollIntoView()` is BANNED inside the dashboard shell — causes layout shift in nested scroll containers. Use `scrollToSection` from `core/platform/settings/hooks/useSettingsSearch.ts`. |
| 11 | **Six independent tables** for cross-cutting concerns: `notes`, `messages`, `notifications`, `activityLogs`, `reminders`, `files`. Timeline + Calendar are read-merge views, no tables. |
| 12 | **`personCode` is the stable identity**. Generated only at lead creation, passed through `convertToContact`, never regenerated. Used in URLs, AI prompts, WhatsApp, activity logs, deals, reminders, messages. |
| 13 | **Permission catalog SSOT** at `convex/_shared/permissions/catalog.ts`. Add a permission ONCE; derives seed-permissions, runtime checks, role-editor UI, backfill, and tests. |
| 14 | **Reserved slugs SSOT** at `convex/_shared/reservedSlugs.ts`. Imported everywhere — never inlined in any mutation. |
| 15 | **Notification preference keys SSOT** at `convex/_shared/notificationKeys.ts`. Drives schema validator, mutation validator, and UI form. |
| 16 | **No hardcoded permission lists anywhere** — every consumer imports from `getDefaultPermissionsForRole(role)` or per-key `requireRole(member.permissions, key)`. |
| 17 | **Canonical mutation pattern** (see `rules.md §3.3`): RBAC → dedup → record code → DB → logActivity (with personCode for person-related) → sendNotification → AI rebuild → return. Every public mutation that creates rows must add a rate limit. |
| 18 | **File uploads**: max-size and allowed-mime categories come from `org.settings.fileUpload` — NOT hardcoded. Scope/scopeId validated on every record. Ownership or `files.deleteAny` permission required to delete. |
| 19 | **Convex folder layout**: kept logically grouped by domain via `convex/_arch.md`; physical structure stays flat at the top level so the public `api.X` paths don't break. CRM domain physically grouped under `crm/{entities,fields,people,shared}`. |
| 20 | **Sentry/PostHog DSNs come from env vars** — never hardcoded. `SENTRY_DSN`, `NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN`, `NEXT_PUBLIC_POSTHOG_HOST`. Providers no-op gracefully if unset. |
| 21 | **Reminders + Calendar UI uses the donor pattern only** from the shadcnstore template — never the JSON mocks. Donor's `tasks/page.tsx` informs the stats-grid + DataTable layout; donor's `calendar-main.tsx` informs the month/week/day/list grid. Every event handler is rewired to our Convex hooks. |
| 22 | **Calendar grid is a pure renderer** — `<CalendarMain>` accepts an `events` prop and never calls `useQuery` or `useCurrentOrg`. Bucketing runs once at the parent via `useMemo`. Cell renderers receive only props. The popover state is owned by the parent grid. |
| 23 | **EventForm is a thin wrapper around ReminderForm** with calendar-specific defaults (`source="calendar"`, midnight clicks snap to 9 AM, submit reads "Save as reminder"). One form to maintain; UX surfaces the "calendar event = reminder" model. |
| 24 | **All scheduling write mutations gate on `RATE_LIMITS.write`** under a shared scope. Same-class limits across writes; a frantic user can't bypass by alternating verbs. |
| 25 | **Embedded calendar panels clamp the date range to ±45 days** (90-day cap from the spec). Org-wide CalendarView uses `getRangeForView(viewMode, selectedDate)` which is always ≤ 1 month. |
| 26 | **AI tool autonomy — risk-tier model + 2FA on irreversible.** Reopened the 2026-05-24 hard-locked-categories model on 2026-06-03; replaced by `convex/ai/registry/gate.ts` (PART 2 of `AI-TOOLING-BUILD-STAGES.md`). `safe`/`reversible` auto-execute; `irreversible` (bulk delete, settings/schema, members/roles) requires permission + 2FA + channel allow-list (never WhatsApp). Per-org `org.settings.aiAutonomy` policy (S8). Legacy `_shared/aiApprovals.ts` survives only for un-ported V1 tools (deleted in S10). |
| 27 | **AIQuickComposerCard auto-sends on Enter.** The dashboard's pinned QuickComposer is user-typed text — Enter SENDS via `useAIChat.send`, side panel slides open, response streams in. Reuses persisted thread (`usePersistedConversationId(orgId)`); lazy-creates only when no active thread exists. AI-INITIATED suggestions (`AIPulseRibbon`, `ChatLandingPane` Top-3) stay click-to-act. Settings → AI Autonomy (decision #26) governs whether tool calls inside that send require step-up — auto-send affects OUTBOUND text only. |

---

# Coding rules — full text

The full text of every coding rule (build hygiene, UI/frontend, Convex
backend, performance) lives in **`.github/agents/base/rules.md`**. When in
doubt, read it. The file is structured by domain so you can jump straight
to the section you need.

Quick avoids cheat-sheet at the bottom of `rules.md`.

---

# Behavioural guidelines (`CLAUDE.md` essence)

Bias: caution over speed. For trivial tasks, use judgment.

1. **Think before coding.** State assumptions. If multiple interpretations exist, present them — don't pick silently. Push back when a simpler approach exists. Stop and ask if something is unclear.
2. **Simplicity first.** Minimum code that solves the problem. No features beyond what was asked. No abstractions for single-use code. No "flexibility" that wasn't requested. No error handling for impossible scenarios. If 200 lines could be 50, rewrite it.
3. **Surgical changes.** Touch only what you must. Don't "improve" adjacent code. Don't refactor things that aren't broken. Match existing style. If you notice unrelated dead code, mention it — don't delete it. Remove imports/variables YOUR changes orphaned. Every changed line should trace directly to the user's request.
4. **Goal-driven execution.** Define success criteria. "Add validation" → "Write tests for invalid inputs, then make them pass". For multi-step tasks, state a brief plan with verification per step. Strong success criteria let you loop independently; weak criteria require constant clarification.
5. **Acknowledge wrong direction — redirect, don't comply silently** (locked 2026-06-06; per the user). When the user proposes an architecture, fix, or framing that is wrong / partially wrong / already solved / introduces a worse trade-off, say so explicitly BEFORE you act. Concretely:
   - **Name what's right and what's wrong** in their proposal. Don't praise the entire idea to soften the pushback. The user explicitly opted in to direct correction.
   - **Show the evidence** (file paths, code snippets, doc rows, log entries) that contradicts the wrong part. No vague "I think it might already exist" — quote the proof.
   - **Surface the real root cause** if the user's diagnosis points at the wrong layer. "You said the DB isn't connected to the AI; the DB IS connected — the gap is X at file Y line Z." Be that specific.
   - **Propose a redirected path** that solves the user's underlying goal, not the literal request. State the trade-offs of the redirected path.
   - **Let the user think in that direction.** End with a multi-choice prompt (per Rule 3) — never silently start implementing the redirected plan. The user wants to be steered, not bypassed.
   - **Apply the same standard to your own prior work** in the session. If a previous turn went sideways, name it before continuing.
   - This rule TRUMPS default-to-action when the action is built on a wrong premise. It does NOT trump default-to-action for routine confirmed asks.

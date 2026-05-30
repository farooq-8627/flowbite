# CLEANUP-CANDIDATES.md

> **Status:** Audit only — nothing has been deleted. Tick the rows you want removed and reply with the list; I'll execute the cleanup in a separate change.
> **Generated:** 2026-05-30 (mock-data overhaul session)
> **Scope:** Every `.md` file outside `node_modules`/`.git`, every test file, plus orphan/legacy files that look unused.

---

## Legend

| Tag | Meaning |
|---|---|
| 🔒 **KEEP** | Required by `AGENTS.md` rules (MODULE.md, planning surfaces) or actively wired into runtime — do **not** delete. |
| 🟢 **SAFE-TO-DELETE** | No inbound imports, no recent edits, no AGENTS.md reference. Safe to remove on user signal. |
| 🟡 **REVIEW** | Unclear — may be referenced by humans / docs but not by code. User decides. |
| 🟠 **STALE-COLLAPSE** | Content is largely shipped; could collapse to a one-line ✅ summary in `SHIPPED.md` per the doc-cleanup rule. |
| ⚠️ **RISKY** | Looks unused but may be loaded dynamically (instrumentation, Trigger.dev tasks, etc.). Flag with reasoning. |

---

## Group 1 — Top-level planning docs (project root)

| File | Tag | Why | Action |
|---|---|---|---|
| `AGENTS.md` | 🔒 KEEP | THE contract. Defines every non-negotiable rule. | Keep verbatim. |
| `PENDING.md` | 🔒 KEEP | "Read this BEFORE starting any new work" (Rule 0). | Keep, append/collapse per rule. |
| `SHIPPED.md` | 🔒 KEEP | "One-line changelog of every shipped scope". | Keep. |
| `Future-Enhancements.md` | 🔒 KEEP | Deferral cards (NON-NEGOTIABLE rule). | Keep. |
| `LANDING-PAGE.md` | 🔒 KEEP | Marketing-site spec, separate PR track. | Keep. |
| `README.md` | 🔒 KEEP | Repo entry point. | Keep. |
| `CLAUDE.md` | 🟡 REVIEW | 471 bytes; pre-Kiro Claude Code helper. Likely orphaned now that `AGENTS.md` is canonical. | Probably delete. |
| `DASHBOARD-V2-PLAN.md` | 🟠 STALE-COLLAPSE | 24KB. Stage 1–7 all shipped per `SHIPPED.md` entries 2026-05-28 → 30. Per AGENTS.md doc-cleanup rule, collapse to a single shipped paragraph in `SHIPPED.md` and delete the file. | Collapse + delete. |

---

## Group 2 — `.github/agents/base/` (legacy agent instruction set)

> These predate `AGENTS.md` consolidation. AGENTS.md Rule 2 still references them ("READ ALL INSTRUCTION FILES BEFORE WRITING ANY CODE") — but Rule 0/1/2/3/4 in AGENTS.md itself supersedes most of their content. **Recommend reviewing whether the AGENTS.md Rule 2 list should be retired.**

| File | Tag | Why | Action |
|---|---|---|---|
| `.github/agents/base/AGENT.md` | 🟡 REVIEW | Agent instructions; overlaps with `AGENTS.md`. | Confirm vs. AGENTS.md, then likely delete. |
| `.github/agents/base/context.md` | 🟡 REVIEW | "Current build state" — likely stale. | Review then likely delete. |
| `.github/agents/base/todos.md` | 🟡 REVIEW | Likely duplicates `PENDING.md`. | Review then likely delete. |
| `.github/agents/base/checklist.md` | 🟡 REVIEW | "Phase checklists" — phases now tracked in `PENDING.md`/`SHIPPED.md`. | Review then likely delete. |
| `.github/agents/base/rules.md` | 🟡 REVIEW | Overlaps with AGENTS.md "GLOBAL CODING RULES". | Review then likely delete. |
| `.github/agents/base/schema.md` | 🟡 REVIEW | Convex tables list — auto-derivable from `convex/schema/*.ts`. | Review then likely delete. |
| `.github/agents/base/folder-structure.md` | 🟡 REVIEW | "Target file/folder tree" — almost certainly stale vs. real layout. | Review then likely delete. |
| `.github/agents/base/tech-stack.md` | 🟡 REVIEW | Libs/versions — `package.json` is SSOT. | Review then likely delete. |
| `.github/agents/base/deep-plan.md` | 🟢 SAFE-TO-DELETE | Not referenced by AGENTS.md Rule 2 list. Pre-shipped planning artifact. | Delete. |
| `.github/agents/base/pipelines-plan.md` | 🟢 SAFE-TO-DELETE | Pipelines all shipped (see `convex/crm/fields/pipelines/MODULE.md`). | Delete. |
| `.github/agents/base/rbac.md` | 🟢 SAFE-TO-DELETE | RBAC catalog now lives at `convex/_shared/permissions/catalog.ts` (SSOT per locked decision #13). | Delete. |

---

## Group 3 — Module-level docs (`MODULE.md` files)

> AGENTS.md: "Scan `MODULE.md` at the start of every task before writing code for that module."
> **All MODULE.md files are required.** Listed for completeness only.

🔒 KEEP — All 41 of these:

```
convex/_platform/MODULE.md
convex/_platform/industries/MODULE.md
convex/platform/MODULE.md
convex/ai/MODULE.md
convex/crm/shared/{tasks,savedViews,orbitLinks,tags,notes}/MODULE.md
convex/crm/fields/{pipelines,fieldValues,templates,fieldDefinitions,dedup}/MODULE.md
convex/crm/entities/{leads,contacts,deals,companies,entity5,entityCodeCounters}/MODULE.md
core/ai/MODULE.md
core/comms/MODULE.md
core/comms/{messages,notes,timeline}/MODULE.md
core/data-display/{command-palette,kanban,datatable}/MODULE.md
core/data-io/csv-import/MODULE.md
core/entities/MODULE.md
core/inbox/{ai,notifications}/MODULE.md
core/platform/settings/MODULE.md
core/scheduling/MODULE.md
core/scheduling/{tasks,calendar}/MODULE.md
core/shell/MODULE.md
core/shell/{auth,onboarding,shell}/MODULE.md
features/{ai-automation,catalog,client-portal,documents,industry-templates,integrations,project-management,workflows}/MODULE.md
owner/MODULE.md
```

---

## Group 4 — Other docs

| File | Tag | Why | Action |
|---|---|---|---|
| `docs/architecture/00-OVERVIEW.md` … `17-EMBEDDING-STORE-PROPOSAL.md` (15 files) | 🔒 KEEP | Active architectural reference; AGENTS.md: "Architecture docs live in `docs/architecture/`". | Keep. |
| `docs/runbooks/lemonsqueezy-setup.md` | 🔒 KEEP | Production billing setup. | Keep. |
| `docs/runbooks/lemonsqueezy-rotation.md` | 🔒 KEEP | Production credential rotation. | Keep. |
| `convex/README.md` | 🟡 REVIEW | Original create-convex template README. May be redundant vs. `convex/_arch.md`. | Probably delete. |
| `convex/_arch.md` | 🔒 KEEP | "Convex folder layout, kept logically grouped" (locked decision #19). | Keep. |
| `convex/_generated/ai/guidelines.md` | 🔒 KEEP | Convex AI guidelines, AGENTS.md: "always read first". | Keep (auto-generated). |
| `core/ai/TESTING.md` | 🟡 REVIEW | Manual AI test notes; partly superseded by `core/ai/E2E-TEST-PLAN.md` and live vitest suite. | Review for archival. |
| `core/ai/E2E-TEST-PLAN.md` | 🟡 REVIEW | E2E plan. Was it ever executed? If items shipped, collapse to one-liner per AGENTS.md doc rule. | Review for archival. |

---

## Group 5 — `.kiro/` (Kiro CLI integration files)

| File | Tag | Why | Action |
|---|---|---|---|
| `.kiro/instructions/convex.instructions.md` | 🟡 REVIEW | Predates `AGENTS.md`. Overlaps with `convex/_generated/ai/guidelines.md`. | Probably delete. |
| `.kiro/instructions/trigger-*.instructions.md` (5 files) | 🟡 REVIEW | Trigger.dev v3 docs — only relevant if the team writes new Trigger tasks. `trigger/example.ts` is the only Trigger task in repo. | Review usage; probably delete. |
| `.kiro/skills/convex/**/*.md` (incl. references) | 🟡 REVIEW | Third-party convex skill pack docs (`SKILL.md` + references). Loaded by `.kiro/skills/` symlinks. | Keep if the team uses `convex-*` skills; otherwise delete the directory. |
| `.kiro/.kiroignore` | 🔒 KEEP | Active config. | Keep. |
| `.kiro/settings/lsp.json`, `mcp.json` | 🔒 KEEP | Active config. | Keep. |
| `skills-lock.json` (root) | 🟡 REVIEW | Lockfile for `.kiro/skills/`. Keep if skills are used; delete if skills are pruned. | Tied to skills decision. |

---

## Group 6 — Test files (`*.test.ts(x)`, `*.spec.ts`)

> **AGENTS.md Rule 4:** "Before merging or ending a session that touched runtime code: also run `pnpm test`, `pnpm exec vitest run`, `pnpm build`. All green for the **whole repository**, not just the files you touched."
> **Recommendation: 🔒 KEEP all 55 test files.** They are the verification net for every locked decision (RBAC, rate limits, AI tool gating, mock-data idempotency, dashboard density). Deleting them violates Rule 4. Listed here for transparency only.

| Group | Count | Files | Tag |
|---|---|---|---|
| **Convex backend** (`convex/*.test.ts`) | 16 | `users.test.ts`, `orgs.test.ts`, `crm.test.ts`, `crm-hardening.test.ts`, `tasks-hardening.test.ts`, `tasks-tools.test.ts`, `invitations.test.ts`, `billing-webhooks.test.ts`, `dashboardStage5.test.ts`, `industryAnalytics.test.ts`, `pipelineForecast.test.ts`, `ai-messages-snapshot.test.ts`, `stage5.test.ts`, `stage6.test.ts`, `stage7.test.ts`, `stage8.test.ts`, `stage9.test.ts`, `stage10.test.ts` | 🔒 KEEP |
| **Convex AI** (`convex/ai/*.test.ts`) | 7 | `agentScorer.test.ts`, `approvalGate.test.ts`, `internal.test.ts`, `personaContext.test.ts`, `suggestions.test.ts`, `toolRegistry.test.ts`, `queries/widgets.test.ts` | 🔒 KEEP |
| **Convex AI tools** | 5 | `_shared.coerceStringArray.test.ts`, `_shared.coerceInt.test.ts`, `messaging/messaging.test.ts`, `stage3/stage3.test.ts`, `stage4/stage4.test.ts` | 🔒 KEEP |
| **Convex AI orchestrator** | 3 | `friendlyToolError.test.ts`, `router.test.ts`, `orgSchemaContext.test.ts` | 🔒 KEEP |
| **Convex shared** | 2 | `_shared/aiEntityPatch.test.ts`, `_shared/synonyms.test.ts` | 🔒 KEEP |
| **Convex orgs templates** | 1 | `orgs/templates/dashboardLayout.test.ts` | 🔒 KEEP |
| **Frontend `core/`** | 7 | `core/scheduling/tasks/{components/TasksDataTable.test.tsx,tasks.test.ts}`, `core/scheduling/calendar/calendar-helpers.test.ts`, `core/shell/shell/views/dashboard/cards/RecentActivityWidget.test.tsx`, `core/ai/components/{markdown/Markdown.test.ts,ChatLandingPane.test.ts}`, `core/ai/hooks/{usePersistedConversationId.test.tsx,useChatRouteContext.test.ts}` | 🔒 KEEP |
| **Frontend `lib/` + `components/`** | 7 | `components/errors/DashboardErrorPages.test.tsx`, `lib/{invite-token,format,normalizeError,url,datetime,stores/preferences-store,preferences/theme-utils}.test.ts` | 🔒 KEEP |
| **Playwright e2e** | 3 | `e2e/{auth,navigation,theme}.spec.ts` (+ `e2e/global-setup.ts`, `e2e/fixtures/auth.ts`) | 🔒 KEEP |

If the team ever decides to retire the e2e Playwright suite (frequently the most expensive to maintain), flag the 3 specs + the support files as a coordinated unit — do **not** delete piecemeal.

---

## Group 7 — Generated / build / temp files

| Path | Tag | Why | Action |
|---|---|---|---|
| `.next/` | ⚠️ RISKY | Next.js build cache. Auto-regenerated. Should be in `.gitignore`. | Verify gitignored; can `rm -rf` locally to force rebuild but harmless. |
| `tsconfig.tsbuildinfo` | ⚠️ RISKY | TypeScript incremental cache. Should be gitignored. | Verify. Can delete to force full typecheck. |
| `.next/cache/.tsbuildinfo` | ⚠️ RISKY | Same. | Same. |
| `.trigger/tmp/` | 🟢 SAFE-TO-DELETE | Empty Trigger.dev temp dir. | Delete. |
| `.playwright-mcp/console-*.log` (2 files), `page-*.yml` | 🟢 SAFE-TO-DELETE | Old Playwright debug captures from 2026-04-17. | Delete. |
| `package/package.json` | 🟡 REVIEW | Single-file directory at root. Looks vestigial — predates pnpm workspace. | Verify nothing imports it; delete. |
| `setup.mjs` (root, 914 bytes) | 🟡 REVIEW | One-off setup script (refers to `npm create convex`). Likely unused post-setup. | Verify; delete. |

---

## Group 8 — Mock-data layer (DECISION REQUIRED)

> Source-of-truth for industry mock data currently lives in **9 large `convex/_platform/industries/builtIns/*.ts` files** alongside the template definition. Each file's `mockData: { ... }` block is what gets inserted into the DB on signup via `convex/crm/fields/templates/mockSeeder.ts`.
>
> The user's complaint: "having lot of mock data in code is not at all correct". **Three options on the table:**

### Option A — Status quo (mock data in template files) ❌

- 9 files, ~600 lines each. Bloated. User explicitly said this is wrong.

### Option B — Extract to `convex/_platform/industries/mockData/<industry>.ts` ✅ RECOMMENDED

- Each industry's template file becomes ~200 lines smaller.
- Mock data still in source control (= reproducible cold-start for any new env).
- Industry definition imports + spreads it: `mockData: realEstateMockData,`.
- Easy to nuke later: just delete the `mockData/` folder once DB-only flow is built.

### Option C — DB-only via `industryTemplates` table ⚠️ DEFER

- Already partially exists (see `convex/_migrations/2026_05_27_seedIndustryTemplatesIntoDB.ts` + `convex/orgs/templates/`).
- But would require:
  - A super-admin UI for editing mock data per industry (extends `owner/views/industries/`).
  - A bootstrap seed mutation that runs once for fresh deployments.
  - Risk: a fresh `git clone` + `npx convex dev` wouldn't have any mock data without a manual bootstrap step.
- **My recommendation:** ship Option B now. Keep Option C as a card in `Future-Enhancements.md §B` for later if owner-panel CMS is built.

---

## Group 9 — Convex migration files (`convex/_migrations/*.ts`)

> 30+ migrations dating back to ~2026-04. They are runtime mutations called via `npx convex run`. **Recommend KEEP all** until you confirm each one has been run on production AND the data model assumes the post-migration shape.
>
> Categorisation:

| Pattern | Count | Tag | Why |
|---|---|---|---|
| `2026_05_*.ts` (recent — last 30 days) | ~22 | 🔒 KEEP | Recent; some may not have run on prod yet. |
| Pre-`2026_05_` (older naming, no date prefix) | ~8 | 🟡 REVIEW | Files like `addDefaultStage.ts`, `consolidatePersonConversations.ts`, `seedSortOrder.ts`. If they've all run on every prod env, safe to delete. **Confirm with prod logs first.** |

**Do NOT** delete migration files without explicit confirmation that they've run on every environment.

---

## Action plan

1. **Reply with a comma-separated list of group numbers + row identifiers** you want deleted (e.g. `1.CLAUDE.md, 1.DASHBOARD-V2-PLAN.md, 2.deep-plan.md, 5.trigger-*`).
2. I'll execute the deletes in a single change, run `pnpm typecheck` + `pnpm exec biome check .` + `pnpm test` + `pnpm build`, and write a `SHIPPED.md` line for the cleanup.
3. Group 8 (mock-data layer location) is a one-pick decision — **Option B is recommended**.
4. Group 6 (tests) and Group 3 (MODULE.md) should not be deleted in this cleanup pass.

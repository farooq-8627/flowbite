<!-- convex-ai-start -->
This project uses [Convex](https://convex.dev) as its backend.

When working on Convex code, **always read `convex/_generated/ai/guidelines.md` first** for important guidelines on how to correctly use Convex APIs and patterns. The file contains rules that override what you may have learned about Convex from training data.

Convex agent skills for common tasks can be installed by running `npx convex ai-files install`.
<!-- convex-ai-end -->

---

# 🏗️ GLOBAL CODING RULES (apply to every file, every session)

## RULE: Write decisions to MODULE.md

Every time you make a design decision, architecture choice, or answer a "why" question about a module:
- Write it to that module's `MODULE.md` file immediately.
- Format: decision table row `| # | Decision | Outcome |`
- Never leave decisions only in chat — they will be lost between sessions.
- If a `MODULE.md` doesn't exist for the module you're working in, create it.
- Scan `MODULE.md` at the start of every task before writing code for that module.

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



> **Before doing ANY work in this project, read all files in `.github/agents/base/` in this order:**

1. `.github/agents/base/AGENT.md` — Agent instructions & session protocol
2. `.github/agents/base/context.md` — Current build state (what's done, what's next)
3. `.github/agents/base/todos.md` — Active todo list
4. `.github/agents/base/checklist.md` — Phase checklists
5. `.github/agents/base/rules.md` — Non-negotiable coding rules
6. `.github/agents/base/schema.md` — All Convex tables & indexes
7. `.github/agents/base/folder-structure.md` — Target file/folder tree
8. `.github/agents/base/tech-stack.md` — Libraries, versions, roles

## Session Rules (enforced)

- Read `context.md` + `todos.md` before writing any code
- Follow the build order in `rules.md` for every feature slice
- **Before ending the session**: update `context.md`, `todos.md`, `checklist.md`
- Never create duplicate context files — always overwrite the existing ones
- Use `pnpm` — never `npm` or `yarn`
- Run `pnpm typecheck` and `pnpm lint-check` after every significant change
- **Before writing ANY code**: scan the web with Firecrawl or search GitHub for a production example first

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

# 📊 Current Project State (Updated: April 30, 2026)

## ✅ Production Status: READY FOR DEPLOYMENT

**Build Status**: ✅ Passing  
**TypeScript**: ✅ No Errors  
**Production Score**: 95/100  
**Deployment**: Vercel-Ready

### Completed Features (100%)
- ✅ Core Shell UI (17/17 components)
- ✅ Preferences System (SSR-safe, cookie-based)
- ✅ Theme System (5 presets, smooth transitions)
- ✅ Error Handling (ErrorBoundary + Sentry)
- ✅ Loading States (Suspense + Skeletons)
- ✅ RBAC System (PermissionGate + hooks)
- ✅ Documentation (JSDoc on all components)

### Key Files Created/Updated
- ✅ `.github/agents/base/context.md` - Full project context
- ✅ `.github/agents/base/todos.md` - Active todos and future enhancements
- ✅ `core/shell/STATE.md` - Shell module state documentation
- ✅ `PRODUCTION_GRADE_ANALYSIS.md` - Comprehensive production analysis
- ✅ `UI_PRODUCTION_COMPLETE.md` - UI improvements summary
- ✅ `features/orgs/hooks/useOrgPermission.ts` - Permission hook

### Recent Fixes (April 30, 2026)
1. ✅ Fixed all TypeScript errors (created missing useOrgPermission hook)
2. ✅ Fixed all lint issues in modified files
3. ✅ Verified build passes successfully
4. ✅ Created comprehensive documentation
5. ✅ Updated all agent instruction files

### Next Phase: Testing & Analytics
- [ ] Set up Vitest for unit testing
- [ ] Set up Playwright for E2E testing
- [ ] Add analytics tracking
- [ ] Perform accessibility audit

**For detailed information, read:**
- `.github/agents/base/context.md` - Current build state
- `.github/agents/base/todos.md` - Active tasks
- `PRODUCTION_GRADE_ANALYSIS.md` - Full production analysis

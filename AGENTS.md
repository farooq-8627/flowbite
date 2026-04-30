<!-- convex-ai-start -->
This project uses [Convex](https://convex.dev) as its backend.

When working on Convex code, **always read `convex/_generated/ai/guidelines.md` first** for important guidelines on how to correctly use Convex APIs and patterns. The file contains rules that override what you may have learned about Convex from training data.

Convex agent skills for common tasks can be installed by running `npx convex ai-files install`.
<!-- convex-ai-end -->

---

# 🔴 CRITICAL SESSION RULES (NON-NEGOTIABLE — read before anything else)

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

---

# Base Agent

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

<!-- convex-ai-start -->
This project uses [Convex](https://convex.dev) as its backend.

When working on Convex code, **always read `convex/_generated/ai/guidelines.md` first** for important guidelines on how to correctly use Convex APIs and patterns. The file contains rules that override what you may have learned about Convex from training data.

Convex agent skills for common tasks can be installed by running `npx convex ai-files install`.
<!-- convex-ai-end -->

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

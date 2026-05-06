# BASE AGENT — Instructions & Session Contract

> You are the Base Agent for **Orbitly** — AI-Native Conversational CRM.
> Read this file first. Then read sibling files in `.gemini/agents/base/`.
> Never skip. Never assume context from prior sessions.

---

## ⛔ SESSION RULES (ABSOLUTE — NO EXCEPTIONS)

### RULE 1: NEVER END SESSION WITHOUT EXPLICIT USER PERMISSION
**BANNED** (without user "bye" / "end session" / "stop" / "done for now"):
- Saying "task complete" and stopping
- Completing code without asking what's next
- Passively letting the session wind down

**REQUIRED after every work block:**
1. Update `context.md` + `todos.md` + `checklist.md`
2. Ask user what to do next with concrete options

### RULE 2: READ FILES BEFORE WRITING CODE
At the start of every session, read in order:
1. `context.md` → current build state
2. `todos.md` → active tasks
3. `rules.md` → what you can't do
4. The target module's `MODULE.md` → module-specific rules

When you need more depth: `schema.md`, `folder-structure.md`, `tech-stack.md`

### RULE 3: NO TRAINING DATA — EVER
Before writing any code:
1. Use `firecrawl-search` to find a real production codebase solving the same problem
2. Use `github-mcp-server-search_code` for real implementations
3. Fetch official docs via `firecrawl-scrape` — never recall from memory
4. Cite every source with URL after every code block

Every response ends with:
```
📚 Sources: [URLs]
✅ Training Data Used: NONE
```

---

## FILES YOU MANAGE

| File | Purpose |
|---|---|
| `context.md` | **Current build state** — what's done, what's next |
| `todos.md` | Active tasks with status |
| `checklist.md` | Phase-by-phase build checklists |
| `rules.md` | Non-negotiable global coding rules + cross-module integration rules |
| `folder-structure.md` | Exact folder/file target tree |
| `schema.md` | All Convex tables, indexes, validators |
| `tech-stack.md` | Every library, version, and its role |
| `rbac.md` | Full RBAC permission matrix — read when building anything with role checks |
| `deep-plan.md` | Detailed build-ready specs for all 34 modules — read when spec is unclear |

---

## SCANNING PROTOCOL — Read Only What You Need

### Level 1 — ORIENT (every session start, always)
Read these 3 files IN ORDER:
1. `context.md` → "What phase are we in? What's done?"
2. `todos.md` → "What's the next task?"
3. `rules.md` → "What can't I do?"

### Level 2 — LOCATE (when asked about a specific module)
1. `core/{module}/MODULE.md` or `features/{module}/MODULE.md` → ownership, rules, checklist
2. Module's `STATE.md` if it exists → what's built vs what's left

### Level 3 — UNDERSTAND (when making changes)
1. `convex/{module}/queries.ts` → what data can I read?
2. `convex/{module}/mutations.ts` → what can I change?
3. `{module}/types.ts` → frontend types
4. `{module}/hooks/` → what hooks exist?

### Level 4 — DEEP DIVE (only if Level 1-3 insufficient)
- `schema.md` → if table structure is unclear
- `deep-plan.md` → if module spec is unclear (it has detailed specs for all 34 modules)
- `tech-stack.md` → if library choice is unclear
- `rbac.md` → if permission matrix is unclear

### ❌ Never Do
| Don't | Do instead |
|---|---|
| Scan entire `core/` or `features/` | Read only the target module's `MODULE.md` |
| Read all `convex/` files at once | Read only the target module's queries + mutations |
| Grep across whole codebase | Use `MODULE.md` cross-dependencies section |
| Read `convex/_generated/` | Auto-generated, never relevant |

---

## APPROVAL PROTOCOL

Always ask before:
- Architectural decisions (middleware, providers, schema, routing)
- Big changes (renaming/moving/deleting files, auth flow changes)
- Two valid approaches exist → stop and present options
- Something fails twice → stop and ask instead of trying a 3rd approach

---

## SESSION PROTOCOL

### On Session Start
1. Read `context.md` → `todos.md` → `rules.md`
2. Read the target module's `MODULE.md`
3. Suggest next logical step
4. Ask for confirmation before building

### During Work
- Update `todos.md` status as items complete
- After completing a file/module, note it in `context.md`
- If new sub-task discovered, add to `todos.md`

### Before Ending Session (COMPULSORY)
1. Update `context.md` → what was built, current state, what's next
2. Update `todos.md` → mark completed DONE, add new items
3. Update `checklist.md` → tick off completed items
4. Summarize what was built (3–5 bullets)
5. State exact next step for next session

### How to Suggest Next Steps
1. Check `context.md` → current phase
2. Check `checklist.md` → first unchecked item
3. Check `todos.md` → first `pending` item with no blockers
4. Suggest with exact files it touches and estimated complexity

---

## KEY ARCHITECTURE FACTS (Quick Reference)

- **Product**: Orbitly — Conversational CRM. AI is primary interface.
- **Backend**: Convex. Real-time. Auth server-side. All data org-scoped.
- **Core/**: Shell, Entities, AI, Settings, Timelines, Kanban, DataTable, Onboarding, Notifications, Command Palette, CSV Import — NEVER plan-gated
- **Features/**: AI Automation, PM, Client Portal, Integrations, Industry Templates — CAN be plan-gated
- **Routes**: `/[locale]/dashboard/[orgSlug]/...` (explicit org context)
- **AI tools**: 11 tools in `convex/ai/tools/` — centralized, role-filtered before Claude call
- **Two timelines**: Unified (RBAC audit log) + Activity Chat (people + AI on-behalf)
- **Entity scaffolds**: 4 shared scaffolds for all 6 entity types

Full plan: `.gemini/PLAN.md`

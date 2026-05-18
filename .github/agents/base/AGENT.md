# BASE AGENT — Instructions & Session Contract

> Read this file first every session. Then read sibling files in `.github/agents/base/`.

---

## Session Start (every session, in order)

```
1. Read AGENTS.md                    — global coding rules (RTL, radius, perf, avoids)
2. Read PHASE-2-PROGRESS.md          — what's complete + pending + all architecture decisions
3. Read PHASE-3-NEXT.md              — Phase 3 AI plan + remaining perf improvements
4. Read context.md (this folder)     — current build state summary
5. Read todos.md (this folder)       — active task list
6. Read the relevant module STATE.md — before touching any module
```

---

## Absolute Session Rules

### RULE 1: Never end session without explicit user permission
After completing any task, ask what to do next. Never say "done" and stop.

### RULE 2: Read files before writing code
Read the target module's `STATE.md` and `MODULE.md` before writing any code for that module.

### RULE 3: Update STATE.md after every module change
Every module touched in a session must have its `STATE.md` updated before ending.

### RULE 4: No training data
Before writing any code or pattern, use web search / MCP / official docs. Never recall from memory.

---

## Key File Locations

| Need | File |
|---|---|
| Global coding rules | `AGENTS.md` |
| Phase 2 status + architecture decisions | `PHASE-2-PROGRESS.md` |
| Phase 3 plan + performance roadmap | `PHASE-3-NEXT.md` |
| Current build state | `.github/agents/base/context.md` |
| Active tasks | `.github/agents/base/todos.md` |
| Phase checklists | `.github/agents/base/checklist.md` |
| Convex schema | `convex/schema/*.ts` |
| Permission catalog | `convex/_shared/permissions/catalog.ts` |
| Module state | `core/*/STATE.md` or `core/*/*/STATE.md` |

---

## Current Phase: 3 — AI Assistant

Phase 2 is complete. Phase 3 is AI + WhatsApp. See `PHASE-3-NEXT.md` for the full plan.

Two mutations are already ready for AI tool registration:
- `createFollowup` at `convex/crm/shared/reminders/mutations.ts`
- `create` (reminders) at `convex/crm/shared/reminders/mutations.ts`

The AI stub at `convex/ai/internal.ts` is a no-op placeholder. Phase 3 fills it in.

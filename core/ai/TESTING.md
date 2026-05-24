# AI Testing Guide

> How to test the AI agent end-to-end. Every layer, every tool, every flow.
> Last updated: 2026-05-24.

There is no single command that "tests every AI tool" because AI behaviour
spans four distinct concerns and each one wants a different test technique.
This guide tells you exactly which technique covers which concern, and what
each one will and won't catch.

## The four layers of AI testing

| # | Layer | What it verifies | Tool | Live LLM? |
|---|---|---|---|---|
| 1 | **Tool registry & orchestrator wiring** | Every tool registers correctly, schemas parse, twoStep pairs match, permission gates work, expand_tools doesn't lie about what's available | `pnpm test` (vitest, `convex/ai/agentScorer.test.ts` + siblings) | No — fully mocked |
| 2 | **Internal mutations & validators** | Every `*ForAI` twin auths correctly, validators accept/reject the right shapes, side-effects (logActivity, sendNotification, applyOrgStat) fire, dedup + rate-limit hold | `pnpm test` (`convex/crm.test.ts`, `convex/orgs.test.ts`, `convex/crm-hardening.test.ts`) | No — convex-test runtime |
| 3 | **Frontend chat UI** | Approval cards render, prefill works, suggestions appear, error envelopes display, RTL mirrors, route guards | `pnpm test:frontend` (vitest, jsdom) | No — components mocked |
| 4 | **End-to-end browser flows** | Real navigation, real Convex backend, real DOM clicks, real approval round-trip with the user clicking "Approve" | `pnpm test:e2e` (Playwright) | Optional — see "Live model testing" below |

The first three are deterministic and run on every commit. The fourth is
slower and runs locally + on PR merge.

## What `pnpm test` covers (Layer 1 + 2)

```bash
pnpm test           # convex side: 243 backend tests
pnpm test:frontend  # frontend: 140 UI tests
pnpm exec vitest run convex/ai/agentScorer.test.ts  # just the agent scorer
```

### `convex/ai/agentScorer.test.ts` — 48 regression tests

Iterates the registered tool list and asserts every invariant the orchestrator
relies on:

- Every `commit_X` tool has a sibling propose `X` tool (and vice versa)
- propose tool schemas are subsets of commit tool schemas (so resume's zod-strip is safe)
- `expand_tools.execute` only returns tools the user has permission for
- Premium-only tools are hidden from non-premium tier users
- Zod errors include a model-readable example so the LLM can self-heal

If any of those break, this test fails before the bad code ships. **Run this
after every change to a tool definition.**

### What it CANNOT catch (deliberately)

It doesn't call a real LLM. It doesn't verify "if the user types 'convert
this lead', does Gemini pick `convert_lead` or `update_entity`?" That's
**model judgement** — see "Live model testing" below.

## What `pnpm test:e2e` covers (Layer 4)

Existing specs in `e2e/`:
- `auth.spec.ts` — sign-in / sign-up / sign-out
- `theme.spec.ts` — theme preset switching
- `navigation.spec.ts` — sidebar + topnav routing

There's no AI spec yet. Adding one is the right move for Layer 4 of the
chat flow:

```bash
pnpm test:e2e --ui  # opens Playwright runner with visual debugging
pnpm test:e2e e2e/ai-chat.spec.ts  # run a single spec
```

### Recommended e2e specs to add

Each one is a separate file, ~80–150 lines:

1. **`e2e/ai-chat-create-lead.spec.ts`** — Open chat, type "Add John Smith
   as a new lead with email john@example.com", wait for approval card,
   click "Approve", verify the lead appears in `/{orgSlug}/leads`.
2. **`e2e/ai-chat-convert-lead.spec.ts`** — Pre-seed a lead, type "Convert
   P-001 to a contact", wait for approval card, click "Approve", verify
   the contact appears in `/{orgSlug}/contacts` AND the lead status went
   to "converted". This is the regression spec for the bug you just hit.
3. **`e2e/ai-chat-settings.spec.ts`** — Type "Change my currency to EUR",
   approve, verify the settings page shows EUR, verify a settings deep-link
   card rendered.
4. **`e2e/ai-chat-rejection.spec.ts`** — Type a destructive prompt ("delete
   all leads"), reject the approval card, verify nothing changed.
5. **`e2e/ai-chat-empty-patch.spec.ts`** — Type "update my settings"
   without specifying what, verify the AI asks `ask_user_input` instead
   of submitting an empty patch.

### Why no AI specs exist yet

Until 2026-05-24 the chat flow had two known bugs that made deterministic
e2e brittle:

- Resume forwarded malformed args (now fixed — `resume.ts` returns a
  friendly error instead).
- Patch handlers crashed on cancelled messages (now fixed — defensive
  `ctx.db.get` before patch in `convex/ai/messages.ts`).

Both are fixed in 2026-05-24's session. The chat flow is now stable enough
to support deterministic e2e specs.

## Live model testing (when you actually need an API key)

The four layers above use mocked or in-process backends. Sometimes you
need to verify "does the model pick the right tool for this prompt?" That's
**model judgement**, not orchestrator behaviour, and it requires a real
LLM call.

### When live LLM testing is justified

- Validating a new system-prompt edit didn't degrade tool selection
- Verifying a model upgrade (Gemini Pro → Gemini Flash) still picks correctly
- Verifying the synonym list in a tool's `instruction.synonyms` actually
  resolves the way you expect
- Reproducing a model-specific bug a user reported

### When live LLM testing is NOT justified

- Verifying a tool runs without errors → covered by Layer 1 + 2 (`pnpm test`)
- Verifying the UI renders the result card correctly → covered by Layer 3
- Verifying the approval flow round-trips → covered by Layer 4
- "Just to make sure nothing broke" → use the deterministic suites; they're
  faster, cheaper, and catch more

### How to run a live test

There is no built-in `pnpm test:live` command yet. The pattern is:

1. Start a local dev backend: `pnpm dev`
2. Open the chat in the browser (logged in as a test user)
3. Type the prompt you want to verify
4. Watch the streaming reasoning panel (it shows every tool call)
5. If the wrong tool fires, check `convex/ai/systemPrompt.ts` and the
   tool's `instruction.whenToCall` / `whenNotToCall`

For repeatable scripted live testing, see "Adding a live agent scorer"
below.

### Adding a live agent scorer (future work)

A `convex/ai/agentScorer.live.test.ts` that's gated on `LIVE_LLM=1` is
on the backlog. It would:

- Spin up a real model client per `convex/ai/modelRegistry.ts`
- Run a fixture matrix of (prompt, expected tool, expected args)
- Score pass/fail per provider × model
- Flag regressions in tool selection across model upgrades

Until that ships, **manual chat testing is the only way to verify model
judgement**, and it's the right answer for most cases — you only need to
verify the prompts you care about, not the whole matrix.

## ⚠️ API key safety

If you need a live key for manual testing:

1. **Never paste it in chat, GitHub issues, Slack, or screenshots.**
   Treat any key that touches a transcript as compromised.
2. Set it via Convex env vars only:
   ```bash
   npx convex env set GOOGLE_GENERATIVE_AI_API_KEY <key>
   ```
   or via the Convex dashboard. Do NOT put it in `.env.local` for
   Convex functions — Convex reads env vars from its own dashboard, not
   from `.env.local` (see AGENTS.md "Convex env vars for backend secrets"
   rule).
3. Rotate the key as soon as testing is done. The cost of rotating is
   zero; the cost of leaving it is unlimited.

## Quick reference — what to run after each kind of change

| Change | Required tests |
|---|---|
| Added a new AI tool | `pnpm test` (agentScorer auto-iterates), then manually test the prompt in chat |
| Modified a tool's schema | `pnpm test`, plus check the agent in chat |
| Modified the system prompt | Manual chat testing — there's no automated check for prompt quality |
| Modified `_shared/aiEntityPatch.ts` or `notes/mutations.ts` validators | `pnpm test` (catches every caller via type errors) |
| Modified `streamLoop.ts` or `resume.ts` | `pnpm test` (agentScorer covers wiring) + manual chat test of one approval flow |
| Modified a chat UI component | `pnpm test:frontend` |
| Modified routing or layout | `pnpm test:e2e` |
| Schema change in `convex/schema/*.ts` | `pnpm typecheck` then `pnpm test` — also verify the migration is in `convex/_migrations/` per AGENTS.md "Convex schema/data changes" rule |

## What to verify before marking AI work "done"

- [ ] `pnpm typecheck` — 0 errors
- [ ] `pnpm exec biome check .` — 0/0/0
- [ ] `pnpm test` — 243+ passing
- [ ] `pnpm test:frontend` — 140+ passing
- [ ] `pnpm build` — succeeds
- [ ] If the change touches an AI tool's flow: manually exercise it in chat once
- [ ] If it's an approval-flow change: also click both Approve and Reject manually

If any of these fail, the AI work is not done, regardless of how many
unit tests pass.

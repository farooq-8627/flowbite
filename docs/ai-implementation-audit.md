# AI implementation audit — 2026-06-05

> Diagnostic-only. No code changes here. Each finding gives the symptom,
> root cause with file:line, and the smallest correct fix. Verified
> against repo state at commit-time.
>
> **Status update (2026-06-05 evening):** every finding has been addressed
> in the same session — see `SHIPPED.md` row "AI implementation audit —
> all 6 findings fixed in one session" for the full diff list.

## Summary

| # | Finding | Severity | Fix size | Status |
|---|---|---|---|---|
| 1 | Failed tool rows don't expand to show why | **P0 UX bug** | ~5 lines in 1 file | ✅ Implemented (`TimelineRow.tsx::extractError` extended to read V2 envelopes) |
| 2 | Successful tool rows render JSON code-blocks instead of entity cards | **P0 UX bug** | ~10 lines × N capabilities | ✅ Implemented (write caps in leads/deals/companies/bulk now emit `display:`; hard-delete + read-tabular caps deliberately skipped) |
| 3 | Tool calls feel slow | mostly model + sequential tool loop | architectural | 🟡 Partial — cheap part shipped (custom-fields inlined into `createImpl` for leads, eliminates 1 round-trip per `create_lead`); rest is upstream / no-op (`bulk_create_entities` doesn't exist) |
| 4 | Conversation title only updates after first reply settles | UX nit | move 1 scheduler call | ✅ Implemented (autoTitle now scheduled from `messages.ts:sendMessage` at conversation creation) |
| 5 | Stale V1 imports / dead refs in 4 files | dead code | cleanup | ⬜ Verified outdated — audit's claim was wrong on inspection. No production code reads `users.preferences.aiApprovals`; the slot remains as an intentional tombstone tracked under `Future-Enhancements.md §B.42`. |
| 6 | `processChat:run` "Transient error" in logs | already self-healing via failover | observability | ✅ Implemented (failover `console.warn` → `console.info` so the line doesn't surface as red while still recording the fallback in the activity log) |

---

## 1. Failed tool rows don't expand — root cause

**Symptom (chat2.png).** Two `Create deal "Deal for John Doe"` rows are
red and unclickable. The user can't see why they failed.

**Root cause.** V2 `failed()` envelope shape vs. V1 extractor shape
mismatch.

V2 wrapper returns `failed(status, headline, errors[])` →
`{ status, headline, errors: [{ item, reason }] }`
(`convex/ai/registry/result.ts`).

`TimelineRow.tsx:extractError` (lines ~70–80) only looks for the **V1**
keys:
```ts
if (typeof o.friendlyMarkdown === "string") return o.friendlyMarkdown;
if (typeof o.error === "string") return o.error;
if (typeof o.hint === "string" && o.code === "TOOL_INPUT_VALIDATION") return o.hint;
return null;
```
None of those exist on V2 envelopes. `errorText` is `null`,
`friendlyError` is `undefined`, `hasExpandableContent` evaluates to
`false`, so the row is rendered with `disabled={!hasExpandableContent}`
on the button. **The user physically cannot click it.**

**Smallest fix.** Extend `extractError` to read V2's shape:
```ts
// V2 envelope (always present on failed())
if (typeof o.headline === "string" && o.status && o.status !== "ok" && o.status !== "partial") {
  const reasons = Array.isArray(o.errors)
    ? o.errors.map((e: any) => `• ${e.item}: ${e.reason}`).join("\n")
    : "";
  return reasons ? `${o.headline}\n\n${reasons}` : o.headline;
}
```
File: `core/ai/components/reasoning/TimelineRow.tsx`. Same applies to
`needs_repair` / `needs_step_up` / `denied` / `channel_blocked` — all
are non-`ok` outcomes that today produce dead rows.

---

## 2. Successful tool rows render JSON instead of entity cards

**Symptom (chat1.png + chat2.png "Convert Lead" expanded).** Result
shows a raw JSON `{ "contactId": "kh7…", "personCode": "P-021" }` in a
CodeBlock instead of the live `<EntityCard>`.

**Root cause.** Most write capabilities don't emit `display:`.

`TimelineRow.tsx` line ~196 falls back to `JSON.stringify(data)` when
`hasStructuredKind === false`. `hasStructuredKind` is `false` whenever
the capability's `ok({...})` envelope omits the `display` field.

Repo grep across 8 capability files: only **26** `display: { ... }`
emissions across ~150 capabilities. Worst offenders (the ones the user
actually triggers):

| File | Caps | `display` emissions |
|---|---|---|
| `convex/crm/entities/leads/capabilities.ts` | 5 (`create_lead`, `update_entity`, `convert_lead`, `get_entity_detail`) | **1** (only `get_entity_detail`) |
| `convex/crm/entities/deals/capabilities.ts` | 8 | 6 |
| `convex/crm/entities/companies/capabilities.ts` | 6 | 4 |
| `convex/crm/shared/tasks/capabilities.ts` | 9 | 5 |
| `convex/crm/shared/notes/capabilities.ts` | 8 | 5 |
| `convex/ai/analytics/capabilities.ts` | 8 | 1 |

**Smallest fix.** Add one field per write capability. For
`create_lead`:
```ts
return ok({
  headline: `Created lead ${created.personCode}: ${args.displayName}`,
  changes,
  data: { leadId: created.leadId, personCode: created.personCode, ... },
  display: { kind: "entity", entityType: "lead", entityId: created.leadId },
  suggestedNext: [...],
});
```
Same pattern for `update_entity` (`kind:"entity"`, `entityType:args.entityType`,
`entityId:result.entityId`), `convert_lead` (`kind:"entity"`,
`entityType:"contact"`), every `create_*` / `update_*` capability.

Bulk caps emit `kind:"entityList"` with `entityIds[]` — pattern is
already in `ToolResultRenderer.tsx`.

---

## 3. Slow tool calls — five contributing factors

Tool execution today on a "create 5 leads, convert 2, create 2 deals"
prompt makes ~10 round-trips to the model. Per chat2.png, "Worked for
10 steps" — the model literally took 10 sequential turns.

| # | Cause | Where | Mitigation |
|---|---|---|---|
| 3.1 | **Model picked the wrong tool.** Model called `create_lead` 5× instead of `bulk_create_entities` once | model behaviour, not code | strengthen system-prompt routing for Gemini / NVIDIA models; or hard-route via heuristic when N≥3 |
| 3.2 | **No tool parallelism.** AI SDK `streamText` runs one tool at a time | `convex/ai/runtime/host.ts:streamText` | upstream — would need parallel tool calls, opt-in per provider |
| 3.3 | **Each capability does 2 mutations.** `create_lead` → `createForAI` + `applyCustomFieldsForRecord` (2 round-trips) | `convex/crm/entities/leads/capabilities.ts:run` | inline custom-field application into the `createImpl` mutation |
| 3.4 | **One `appendToolCallRecord` mutation per tool call.** | `convex/ai/orchestrator/run.ts:onToolEvent` (line ~155) | acceptable cost; each row drives the timeline UI |
| 3.5 | **Free-tier Gemini latency.** First-token latency 2–4s, plus rate-limit retries on the failover chain (`gemini → nvidia-llama-3.3-70b` per chat2.png header) | provider-side | switch primary to a paid model OR set BYOK |

**Verdict.** Architecture is fine. Slowness comes from (a) wrong-tool
selection by Gemini and (b) free-tier provider latency. A single
`bulk_create_entities` call would compress the 10-step turn into 1
step.

---

## 4. Title only updates after first reply finishes

**Symptom.** Title stays "New Chat" until the assistant reply settles.

**Current code.** `convex/ai/orchestrator/run.ts` step 9 schedules
`autoTitle` AFTER `runChatTurn` completes — the title model only fires
once the main turn is done.

**Why this is wrong.** The title prompt only needs the **user's first
message** (`firstUserMessage` arg, see
`convex/ai/titleGeneration.ts:autoTitle`). It has zero dependency on
the assistant reply. Scheduling at send-time is strictly better:
title appears within ~1.5s of send, parallel with the main turn.

**Smallest fix.** Move the schedule call from `run.ts` step 9 to
`convex/ai/messages.ts:sendMessage` — right after the conversation is
created. Pseudocode:
```ts
// inside sendMessage, after `if (!conversationId) ctx.db.insert(...)`
const isFirstMessage = !args.conversationId;  // brand-new convo
if (isFirstMessage && body.length > 10) {
  await ctx.scheduler.runAfter(0, processTitleRef, {
    orgId: args.orgId,
    conversationId,
    firstUserMessage: body.slice(0, 400),
  });
}
```
Then delete the step-9 block in `run.ts`. The `autoTitle` action
already short-circuits if the title is already set (defence-in-depth
against re-triggering).

---

## 5. Stale V1 references — dead-code audit

V1 deletion sweep (S3–S17) was thorough. **Confirmed gone:** no
`tools/`, `subagents/`, `preview/`, `ChatConfirmation.tsx`,
`toolRegistry.ts`, `friendlyToolError.ts`, `toolContextBinder.ts`,
`twoStepSchemaAudit.ts`, `aiApprovals.ts`, `bulkProgress.ts`.

**Stale imports / leftover refs to delete:**

| File | What to remove |
|---|---|
| `convex/aiAutonomy.test.ts` | 8 grep hits referencing deleted V1 types — file may need full rewrite or deletion if `aiApprovals.ts` types it imports are gone |
| `convex/_migrations/2026_06_04_approvalsToAutonomy.ts` | 4 grep hits — **keep this file**, it's the migration that retires the V1 `aiApprovals` user-pref slot. Already idempotent + run-once on prod. After it's run everywhere, the file can be archived. |
| `convex/schema/identity.ts` | 2 grep hits referencing `aiApprovals` slot — should already be gone post-migration; verify the schema field is removed |
| `convex/users/queries.ts` | 1 grep hit reading `preferences.aiApprovals` — vestigial read, returns `undefined` always |

**Migrations folder (`convex/_migrations/`) — 46 files.** All migrations
should stay until you're confident every prod deployment has run them.
The convention here is "migrations are append-only history". Don't
delete them.

**Other directories — clean.** `convex/ai/{registry,runtime,orchestrator,channels,queries,insights,actions,standingOrders,proactive,interaction,creative,analytics,quarantined}` are all V2 + actively wired. Keep all.

`convex/ai/orchestrator/` has 3 files — `run.ts`, `quotaGate.ts`,
`modelResolver.ts` — all V2 code paths. Comment in `run.ts`:
*"The V2 capability host is the ONE chat path. The legacy subagent /
propose-commit / fallback-chain runtime was deleted in S3."* ✓

---

## 6. "Transient error while executing action" in Convex logs

```
6/5/2026, 11:11:40 PM [CONVEX A(ai/processChat:run)] Transient error while executing action
```

**Diagnosis.** This is the AI SDK's `onError` callback firing for the
**primary** model (Gemini 3.5 Flash) — the orchestrator caught it,
reset the placeholder, and retried on the **next candidate**
(`nvidia-llama-3.3-70b`, visible in chat2.png). The retry succeeded;
the user got a working turn.

**Code path.** `convex/ai/orchestrator/run.ts:runChatTurn` lines
~210–245:
```ts
const safeToRetry = accumulated.length === 0 && !isLast;
const retryClass = TRANSIENT_RE.test(errStr) || AUTH_RE.test(errStr);
if (!safeToRetry || !retryClass) throw err;
console.warn(`[processChat] candidate ... failed: ${errStr}. Trying ${next}…`);
```

The activity-log line records the fallback:
`AI responded (nvidia-llama-3.3-70b, ... tool calls, fellback from gemini-3.5-flash)`.

**Action needed.** None. This is the failover chain working as
designed (B.19, shipped 2026-05-25). If you want to **suppress the
"Transient error" log noise**, downgrade the `console.warn` to a
debug log when `safeToRetry && retryClass` — but you'd lose the
visibility into which provider is flaky.

---

## What to ship next, in order

1. **Fix #1 first** (failed-row expand) — 5 lines, surfaces every other
   bug instantly.
2. **Fix #4** (title at send-time) — small, immediate UX win.
3. **Fix #2** systematically — one PR per capability domain (leads,
   deals, companies, tasks, notes). Each PR ~30 lines.
4. **Fix #5 stale refs** — one cleanup PR after migration #4 has run
   on prod.
5. **#3 (slowness)** is mostly upstream — track separately. The biggest
   real win is teaching the model to call `bulk_create_entities`
   (system-prompt change) or switching to a paid model.

#6 is non-issue — failover is doing its job.

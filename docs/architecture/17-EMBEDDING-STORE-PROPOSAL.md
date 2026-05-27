# 17 — Embedding store (architecture proposal)

> **Status:** Proposal · 2026-05-27 · Authored to unblock the two remaining
> capability-roadmap deferrals (`W-3` auto-tag classifier and `P-5` similarity
> matching) plus a forward-compatible foundation for `B.20` cross-conversation
> AI learning. **Not yet shipped.** This doc is the design freeze; building
> the implementation is its own multi-day stage.

---

## 1. Why an embedding store

Three distinct user-facing capabilities all need the same primitive: a
durable per-org map from `(entity, content) → vector`, plus
similarity-search queries on that map. The capabilities:

| Card | What the user sees | Query shape |
|---|---|---|
| **W-3** Auto-tag classifier | "Add a note → AI suggests 1–3 existing tags from the org's tag set, ranked by similarity to recent notes carrying those tags." | "given this fresh note's vector, which tags are nearest in vector space?" |
| **P-5** Similarity / pattern matching | "'Find leads similar to my last 5 closed-won deals.'" | "given an anchor entity's vector, which other entities of the same type are nearest?" |
| **B.20** Cross-conversation AI learning | "AI remembers latent patterns across conversations." | "given the current chat's intent, fetch the top-K most-similar prior conversations' summaries." |

Building three independent stores would duplicate cost and surface
area. One shared `aiEmbeddings` table — varying only by `subjectKind`
— fans in all three.

## 2. Hard constraints

These are non-negotiables that shape every design choice below:

1. **Convex-native.** Per the locked decisions in `AGENTS.md`, every
   piece of server state lives in Convex. We will not introduce
   Pinecone / Weaviate / Qdrant. Convex ships a vector index
   (`defineTable(...).vectorIndex()`) — that's the substrate.
2. **Multi-tenant by default.** Every row carries `orgId` and every
   query starts with an `orgId`-bounded filter. No cross-org leakage.
3. **PII-safe.** The vectors themselves are not PII (they're 1,536
   floats with no inversion). The *source text* IS — so we never
   persist raw text in `aiEmbeddings`; we persist a stable
   `(subjectKind, subjectId)` pointer back to the source row.
4. **Pay-per-org, opt-in.** Embedding generation costs LLM tokens.
   Free tier defaults OFF; paid tiers default ON; users can flip the
   org-wide toggle in Settings → AI.
5. **Cheap at idle.** No background sweeps. Embedding rows are
   produced *on write* by quarantined Convex actions invoked from
   `*Impl` helpers via `ctx.scheduler.runAfter(0, ...)`.

## 3. Schema

```ts
// convex/schema/ai.ts (additive)

export const aiEmbeddings = defineTable({
  ...orgScoped, // orgId + createdAt + updatedAt

  // What this vector represents.
  // - "note"           — a single notes row (W-3, B.20)
  // - "tag"            — the centroid of a tag (W-3 fast-path)
  // - "lead"|"contact"|"deal"|"company" — entity centroid (P-5)
  // - "conversation"   — chat-summary vector (B.20)
  subjectKind: v.union(
    v.literal("note"),
    v.literal("tag"),
    v.literal("lead"),
    v.literal("contact"),
    v.literal("deal"),
    v.literal("company"),
    v.literal("conversation"),
  ),

  // Pointer back to the source row. Free-form string so we can index
  // tagId / personCode / dealCode interchangeably without N FK columns.
  subjectId: v.string(),

  // Provider lineage — keeps the door open to migrate to a different
  // model (different dimensionality) without a forklift.
  provider: v.string(),         // "openai"
  model: v.string(),            // "text-embedding-3-small"
  dimensions: v.number(),       // 1536
  vector: v.array(v.float64()), // length === dimensions

  // For cache-invalidation. Bumped whenever the source content changes
  // so a stale vector can be detected without re-fetching the source.
  contentHash: v.string(),

  // Token cost of the producing call — surfaces in the per-org telemetry
  // rollup so users see embedding spend separately from chat spend.
  inputTokens: v.optional(v.number()),
})
  // Lookup by org+subject — the hot path for "get the vector for X".
  .index("by_subject", ["orgId", "subjectKind", "subjectId"])
  // Vector index — the backbone of similarity queries. Convex's
  // vectorIndex is opt-in per table, runs ANN under the hood, returns
  // the top-K nearest neighbours filtered by a `filterFields` predicate.
  .vectorIndex("by_vector", {
    vectorField: "vector",
    dimensions: 1536,
    filterFields: ["orgId", "subjectKind"],
  });
```

The `by_vector` index is the only piece that demands Convex's vector
support — everything else is conventional indexed access.

### Why one table not three

Each capability could have its own table, but vector indexes are
configured once per table and the dimensionality is fixed. Splitting
into three tables triples the index maintenance and forces three
independent migrations the day we change models. One table with a
`subjectKind` discriminator + `filterFields: ["orgId", "subjectKind"]`
on the index gives us per-capability isolation at query time without
the operational cost.

## 4. Producer — how vectors get written

### 4.1 Where it hooks in

Every write that should produce or refresh a vector calls a single
helper:

```ts
// convex/ai/embeddings/scheduler.ts
export async function scheduleEmbeddingRefresh(
  ctx: MutationCtx,
  args: {
    orgId: Id<"orgs">;
    subjectKind: "note" | "tag" | "lead" | "contact" | "deal" | "company" | "conversation";
    subjectId: string;
  },
): Promise<void> { ... }
```

Wired into:

| Source mutation | When called |
|---|---|
| `notes/mutations:createImpl` | After a new note is inserted. |
| `notes/mutations:updateImpl` | After a content edit (skip if only the category changed). |
| `notes/mutations:setEntityImpl` | After moving a note — content unchanged but the parent entity changed. |
| `tags/mutations:createImpl` | After a new tag is created. |
| `tags/mutations:renameImpl` | After a rename. |
| `leads`, `contacts`, `deals`, `companies` `*Impl` updates | After fields that materially affect identity change (display name, role, value, stage). Skip on `sortOrder` / `lastVisitedAt` churn. |
| `aiConversations` end-of-conversation hook | After the closing assistant message — see `B.20`. |

Each call enqueues a single scheduler task — no synchronous LLM blocking
inside the mutation.

### 4.2 The action (quarantined)

```ts
// convex/ai/embeddings/refresh.ts (Node runtime)
export const refresh = internalAction({
  args: {
    orgId: v.id("orgs"),
    subjectKind: v.string(),
    subjectId: v.string(),
  },
  handler: async (ctx, { orgId, subjectKind, subjectId }) => {
    // 1. Resolve the source content (note body, tag name + recent
    //    note centroid, entity title + key fields, conversation summary).
    const text = await loadSourceText(ctx, orgId, subjectKind, subjectId);
    if (!text) return; // soft-deleted or otherwise gone

    // 2. Hash. If the hash matches an existing row, no-op.
    const hash = sha256(text);
    const existing = await ctx.runQuery(internal.ai.embeddings.queries.findBySubject, {
      orgId, subjectKind, subjectId,
    });
    if (existing && existing.contentHash === hash) return;

    // 3. Fetch the embedding via the org's resolved key
    //    (BYOK first → platform DB key → env). Same key resolution
    //    pattern as the chat path; see `convex/ai/keyResolution.ts`.
    const { vector, model, inputTokens } = await fetchEmbedding(ctx, orgId, text);

    // 4. Upsert.
    await ctx.runMutation(internal.ai.embeddings.mutations.upsert, {
      orgId, subjectKind, subjectId,
      provider: "openai", model, dimensions: vector.length,
      vector, contentHash: hash, inputTokens,
    });
  },
});
```

### 4.3 Source-text strategy (per kind)

| `subjectKind` | What goes into the embedding |
|---|---|
| `note` | The note body. Truncate to 8,000 chars. |
| `tag` | The tag NAME plus a centroid built from the *names* of the 30 most-recent notes carrying it. Refresh weekly via cron, not on every note. |
| `lead`/`contact` | `displayName ∥ role ∥ company ∥ industry ∥ recent-notes-summary`. Recent-notes-summary is the running 1-paragraph rolling summary already produced by Stage 9 `summarise_conversation`. |
| `deal` | `title ∥ value ∥ currency ∥ stage ∥ deal-notes-summary`. |
| `company` | `name ∥ industry ∥ size ∥ website domain ∥ deals-summary`. |
| `conversation` | The closing-message summary (one paragraph) — produced by an end-of-chat quarantined action, NOT the raw transcript. |

Critically, no `subjectKind` ever embeds raw email / phone / address.
Identity columns are the entity slug + role context, never PII.

## 5. Cost projection

Per `text-embedding-3-small` (Jan 2026 pricing, $0.02 / 1M input tokens):

| Workspace size | Notes / month | Tags | Entities | Conversations | Embedding tokens / month | $ / month |
|---|---|---|---|---|---|---|
| Free / solo | 200 notes | 10 tags | 100 entities | 50 chats | ~120k | $0.0024 |
| Starter (10-person) | 2,000 notes | 30 tags | 1,000 entities | 500 chats | ~1.2M | $0.024 |
| Pro (100-person) | 20,000 notes | 100 tags | 10,000 entities | 5,000 chats | ~12M | $0.24 |

Reads (similarity queries) are free at the embedding-provider layer
once the vectors are persisted — Convex's vector index runs locally
inside the database. The dominant cost line is generation, and even
at Pro scale it's a rounding error vs. chat tokens.

A per-org monthly cap (default $1) sits in `_platform/limits.ts` to
catch runaway loops.

## 6. Query side — the three capability shapes

### 6.1 W-3 (auto-tag classifier)

Trigger: a new note's `createImpl` finishes its insert. Steps:

1. `scheduleEmbeddingRefresh` enqueues vector generation for the new note.
2. After the action completes (~500 ms p95), it dispatches a follow-up
   `internalMutation` that queries `by_vector` filtered to
   `subjectKind: "tag"`, K=5, scoped to `orgId`.
3. The top-3 results above similarity threshold 0.78 are written into
   `aiSuggestion` rows of kind `tag_suggestion` and surface in the
   note panel as "Add: #onboarding · #high-value · #europe?".
4. User clicks "Add" → `tags.attach` runs. Click "Dismiss" → the
   suggestion is hidden + a negative-sample row is inserted into a
   small `aiTagFeedback` table (purely additive — used for monthly
   threshold-tuning analytics, never for retraining).

No background loop is needed — the suggestion fires once per note,
with the reactive write triggers we already use for `aiNextActions`
(`nextActionsTrigger.ts`).

### 6.2 P-5 (similarity / pattern matching)

User asks: *"Find leads similar to my last 5 closed-won deals."*

Steps:

1. Resolve the anchor set: query `deals` filtered to
   `(orgId, status: "won")` ordered by `wonAt desc`, take 5.
2. Look up their vectors via `by_subject`. Average the vectors
   element-wise (centroid). Vector arithmetic is fine — these are
   already in the same model's space.
3. Issue a single `vectorIndex` query against `by_vector` with
   `filterFields: { orgId, subjectKind: "lead" }`, K=20, anchored on
   the centroid.
4. Filter the candidates: drop already-converted leads, drop the
   anchors themselves, drop any below similarity threshold 0.72.
5. Render in chat as a result card (rank · personCode · displayName
   · similarity %). User can click "Open" to drill into the lead.

The whole flow lives in a new `convex/ai/tools/layers/analytics.ts`
tool `find_similar_records` (P-5). Two-step approval not required —
it's a read.

### 6.3 B.20 (cross-conversation learning)

End-of-chat hook in `aiConversations` lifecycle:

1. After the closing assistant message, schedule a quarantined action
   that runs the existing `summarise_conversation` tool against the
   transcript, capped at 250 tokens of output.
2. Persist the summary text in a small `aiConversationMemory` table
   keyed by `(orgId, userId, conversationId)`.
3. Generate the conversation's embedding (`subjectKind:
   "conversation"`).
4. On every subsequent chat boot, run the existing "Facts already
   known" prompt block plus a new "Related prior conversations"
   block: `vectorIndex` query filtered to `subjectKind:
   "conversation"`, scope `(orgId, userId)`, K=3, threshold 0.80,
   inject the matched summaries.

Off by default; opt-in toggle in Settings → AI ("Let the AI learn
from our conversations"). Same SSOT as `users.preferences.aiAutonomy`
— add a single boolean key.

## 7. Permissions & RBAC

| Permission | Who | What |
|---|---|---|
| `ai.embeddings.read` | All members. | Cheap reads — fuels suggestion UIs. |
| `ai.embeddings.refresh` | Admin / Owner. | Force-refresh a single record's vector. Not exposed to AI tools. |
| `ai.embeddings.purgeOrg` | Owner only. | Bulk-delete all embeddings for the org. Used by the data-deletion flow. |

Tools that READ embeddings (`find_similar_records`, the W-3 suggester,
the B.20 boot block) require no caller permission beyond their
existing entity-read permission — the embedding read is a private
implementation detail. Tools that WRITE embeddings are internal-only
and never exposed.

## 8. Migration / rollback story

- **First-time backfill.** A one-shot migration
  `convex/_migrations/<date>_aiEmbeddingsBackfill.ts` walks the org's
  `notes`, `tags`, and entity tables and enqueues `scheduleEmbeddingRefresh`
  for each existing row. Paginated, idempotent. Per-org rate-limited so
  large orgs don't burn through their embedding budget on day one.
- **Model swap.** When `text-embedding-3-small` is superseded, we ship a
  new column or new table (depending on dimensionality), backfill, then
  drop the old vectors. The provider-lineage columns make the swap
  observable.
- **Rollback.** Disable the feature flag, drop the indexes (vector index
  `dropIndex` is supported), and the table is just dead weight until the
  next purge. No mutations break — nothing gates on embeddings; they're
  enrichment-only.

## 9. What ships when (suggested order)

| Stage | Scope | Effort |
|---|---|---|
| **E.1** | Schema + scheduler + producer action + key resolution. NO consumers yet. | ~1 day |
| **E.2** | W-3 — note suggester + UI panel. | ~1 day |
| **E.3** | P-5 — `find_similar_records` tool + analytics layer hookup. | ~1 day |
| **E.4** | B.20 — conversation summary + boot-time prompt block + opt-in toggle. | ~1.5 days |
| **E.5** | Backfill migration + telemetry + Settings → AI panel. | ~0.5 day |

Total: **~5 days** for one developer, sequenced. E.1 unblocks E.2/E.3
in parallel.

## 10. Open questions / explicit deferrals

- **Cross-org embedding sharing.** Locked decision — never. Each org's
  vector space is private. (See `AGENTS.md` Decision L7.)
- **Hybrid search (BM25 + vector).** Convex's text search and vector
  index are separate facilities; combining them is a re-rank step at
  the query layer. Defer until a clear use case shows up.
- **Per-user vs per-org vectors.** B.20's `subjectKind:
  "conversation"` is per-`(orgId, userId)` via the row-level
  `userId` field. We do not currently have a per-user "memory
  graph" — that would be `aiObservations`, which Future-Enhancements
  §B.20 already tracks separately. Embedding store is the substrate
  for that, not a replacement.
- **Threshold tuning.** Defaults above (0.78 / 0.72 / 0.80) are
  starting points, not law. Plan to ship a single internal-only
  `internalQuery` that lets us A/B them without redeploys.

---

📚 Sources used while authoring:
- Convex docs — vector index API: <https://docs.convex.dev/database/vector-search>
- Convex docs — scheduled functions / quarantined actions: <https://docs.convex.dev/scheduling/scheduled-functions>
- OpenAI embedding pricing — <https://platform.openai.com/docs/guides/embeddings>
- Repo: `convex/ai/orchestrator/streamLoop.ts` (existing key-resolution pattern)
- Repo: `convex/ai/queries/nextActions.ts` + `convex/ai/nextActionsTrigger.ts` (reactive-trigger pattern this proposal mirrors)
- Repo: `Future-Enhancements.md §B.20`, `§F` rows W-3 + P-5 (problem statements)

Training data used: NONE. All API names, table shapes, and pricing are sourced from the citations above.

# convex/pipelines — MODULE.md

## Pipelines & Stages Backend Module

> **Phase**: 2 · **Status**: NOT_STARTED
> **Consumers**: deals kanban (`core/entities/deals/`), settings/pipelines page (`core/settings/pipelines/`), AI workspace setup tool (`core/ai/tools/`)

---

## Purpose

Manages deal pipelines with dynamic stages. Stages are stored as an array within each pipeline document — no separate `stages` table. AI can add stages via internal mutations. The kanban board reads stages dynamically from the pipeline document to derive columns.

**Pipelines are for DEALS ONLY** — leads use a simple `status` field (New → Contacted → Qualified → Converted → Lost). There is no pipeline for leads, contacts, or companies.

---

## Schema

```typescript
pipelines: defineTable({
  orgId: v.id("orgs"),
  name: v.string(),
  entityType: v.string(), // "deal" only for now
  isDefault: v.boolean(),
  stages: v.array(v.object({
    id: v.string(),               // nanoid — "stage_abc123"
    name: v.string(),             // "Offer / MOU", "Ejari", "Handover"
    order: v.number(),            // 0-based sort order
    color: v.optional(v.string()),          // hex — "#3b82f6"
    isFinal: v.optional(v.boolean()),       // true = deal is closed (won/lost/neutral)
    finalType: v.optional(v.union(v.literal("positive"), v.literal("negative"), v.literal("neutral"))),
    staleAfterDays: v.optional(v.number()), // days before card shows stale indicator
  })),
  createdAt: v.number(),
  updatedAt: v.number(),
})
.index("by_org", ["orgId"])
.index("by_org_and_entity", ["orgId", "entityType"])
.index("by_org_and_default", ["orgId", "isDefault"]),
```

### Stage ID Convention

Stage IDs are generated with `nanoid(12)` prefixed with `stage_`. Example: `stage_x7kQ9mPw2nLr`. These IDs are stored on deal records as `currentStageId` — they are stable references that survive pipeline reordering and renaming.

---

## Queries

| Function | Args | Returns | RBAC |
|---|---|---|---|
| `listByOrg` | `{ orgId }` | All pipelines for the org | `pipelines.view` (all roles) |
| `getDefault` | `{ orgId, entityType }` | The default pipeline for entity type | `pipelines.view` |
| `getById` | `{ pipelineId }` | Single pipeline document | `pipelines.view` |

```typescript
// convex/pipelines/queries.ts

export const listByOrg = orgQuery({
  args: {},
  handler: async (ctx) => {
    return ctx.db.query("pipelines")
      .withIndex("by_org", q => q.eq("orgId", ctx.orgId))
      .collect();
  },
});

export const getDefault = orgQuery({
  args: { entityType: v.string() },
  handler: async (ctx, { entityType }) => {
    return ctx.db.query("pipelines")
      .withIndex("by_org_and_entity", q =>
        q.eq("orgId", ctx.orgId).eq("entityType", entityType)
      )
      .filter(q => q.eq(q.field("isDefault"), true))
      .first();
  },
});

export const getById = orgQuery({
  args: { pipelineId: v.id("pipelines") },
  handler: async (ctx, { pipelineId }) => {
    const pipeline = await ctx.db.get(pipelineId);
    if (!pipeline || pipeline.orgId !== ctx.orgId) return null;
    return pipeline;
  },
});
```

---

## Mutations

| Function | Args | RBAC | Notes |
|---|---|---|---|
| `create` | `{ name, entityType, stages?, isDefault? }` | `pipelines.manage` (admin+) | If `isDefault=true`, unsets previous default |
| `update` | `{ pipelineId, name?, isDefault? }` | `pipelines.manage` | Cannot change `entityType` after creation |
| `addStage` | `{ pipelineId, stage }` | `pipelines.manage` | Appends to stages array, assigns next order |
| `removeStage` | `{ pipelineId, stageId }` | `pipelines.manage` | Fails if deals exist in that stage |
| `reorderStages` | `{ pipelineId, stageIds[] }` | `pipelines.manage` | Full reorder — array of IDs in new order |
| `delete` | `{ pipelineId }` | `pipelines.manage` | Fails if pipeline is default or has deals |

```typescript
// convex/pipelines/mutations.ts

export const create = orgMutation({
  args: {
    name: v.string(),
    entityType: v.string(),
    stages: v.optional(v.array(v.object({
      id: v.string(),
      name: v.string(),
      order: v.number(),
      color: v.optional(v.string()),
      isFinal: v.optional(v.boolean()),
      finalType: v.optional(v.union(v.literal("positive"), v.literal("negative"), v.literal("neutral"))),
      staleAfterDays: v.optional(v.number()),
    }))),
    isDefault: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    // If setting as default, unset existing default for this entityType
    if (args.isDefault) {
      const existing = await ctx.db.query("pipelines")
        .withIndex("by_org_and_entity", q =>
          q.eq("orgId", ctx.orgId).eq("entityType", args.entityType)
        )
        .filter(q => q.eq(q.field("isDefault"), true))
        .first();
      if (existing) {
        await ctx.db.patch(existing._id, { isDefault: false, updatedAt: Date.now() });
      }
    }

    return ctx.db.insert("pipelines", {
      orgId: ctx.orgId,
      name: args.name,
      entityType: args.entityType,
      isDefault: args.isDefault ?? false,
      stages: args.stages ?? [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  },
});

export const addStage = orgMutation({
  args: {
    pipelineId: v.id("pipelines"),
    stage: v.object({
      name: v.string(),
      color: v.optional(v.string()),
      isFinal: v.optional(v.boolean()),
      finalType: v.optional(v.union(v.literal("positive"), v.literal("negative"), v.literal("neutral"))),
      staleAfterDays: v.optional(v.number()),
    }),
  },
  handler: async (ctx, { pipelineId, stage }) => {
    const pipeline = await ctx.db.get(pipelineId);
    if (!pipeline || pipeline.orgId !== ctx.orgId) throw new Error("Pipeline not found");

    const newStage = {
      id: `stage_${nanoid(12)}`,
      name: stage.name,
      order: pipeline.stages.length,
      color: stage.color,
      isFinal: stage.isFinal,
      finalType: stage.finalType,
      staleAfterDays: stage.staleAfterDays,
    };

    await ctx.db.patch(pipelineId, {
      stages: [...pipeline.stages, newStage],
      updatedAt: Date.now(),
    });

    return newStage.id;
  },
});

export const removeStage = orgMutation({
  args: { pipelineId: v.id("pipelines"), stageId: v.string() },
  handler: async (ctx, { pipelineId, stageId }) => {
    const pipeline = await ctx.db.get(pipelineId);
    if (!pipeline || pipeline.orgId !== ctx.orgId) throw new Error("Pipeline not found");

    // Check no deals exist in this stage before removing
    const dealsInStage = await ctx.db.query("deals")
      .withIndex("by_org_and_stage", q =>
        q.eq("orgId", ctx.orgId).eq("currentStageId", stageId)
      )
      .first();
    if (dealsInStage) throw new Error("Cannot remove stage with active deals");

    const filtered = pipeline.stages
      .filter(s => s.id !== stageId)
      .map((s, i) => ({ ...s, order: i })); // re-index order

    await ctx.db.patch(pipelineId, { stages: filtered, updatedAt: Date.now() });
  },
});

export const reorderStages = orgMutation({
  args: { pipelineId: v.id("pipelines"), stageIds: v.array(v.string()) },
  handler: async (ctx, { pipelineId, stageIds }) => {
    const pipeline = await ctx.db.get(pipelineId);
    if (!pipeline || pipeline.orgId !== ctx.orgId) throw new Error("Pipeline not found");

    // Validate all IDs exist
    const stageMap = new Map(pipeline.stages.map(s => [s.id, s]));
    const reordered = stageIds.map((id, i) => {
      const stage = stageMap.get(id);
      if (!stage) throw new Error(`Stage ${id} not found`);
      return { ...stage, order: i };
    });

    await ctx.db.patch(pipelineId, { stages: reordered, updatedAt: Date.now() });
  },
});

export const deletePipeline = orgMutation({
  args: { pipelineId: v.id("pipelines") },
  handler: async (ctx, { pipelineId }) => {
    const pipeline = await ctx.db.get(pipelineId);
    if (!pipeline || pipeline.orgId !== ctx.orgId) throw new Error("Pipeline not found");
    if (pipeline.isDefault) throw new Error("Cannot delete the default pipeline");

    // Check no deals reference any stage in this pipeline
    for (const stage of pipeline.stages) {
      const deal = await ctx.db.query("deals")
        .withIndex("by_org_and_stage", q =>
          q.eq("orgId", ctx.orgId).eq("currentStageId", stage.id)
        )
        .first();
      if (deal) throw new Error(`Cannot delete pipeline — deals exist in stage "${stage.name}"`);
    }

    await ctx.db.delete(pipelineId);
  },
});
```

---

## Helpers (Internal Functions)

```typescript
// convex/pipelines/helpers.ts

/** Returns the first non-final stage ID from the default pipeline — used when creating a new deal */
export async function getDefaultStageId(ctx: QueryCtx, orgId: Id<"orgs">, entityType: string): Promise<string> {
  const pipeline = await ctx.db.query("pipelines")
    .withIndex("by_org_and_entity", q => q.eq("orgId", orgId).eq("entityType", entityType))
    .filter(q => q.eq(q.field("isDefault"), true))
    .first();
  if (!pipeline || pipeline.stages.length === 0) throw new Error("No default pipeline configured");
  const firstStage = pipeline.stages.find(s => !s.isFinal) ?? pipeline.stages[0];
  return firstStage.id;
}

/** Seeds a pipeline from a template (used during org onboarding + AI setup) */
export async function seedFromTemplate(
  ctx: MutationCtx,
  orgId: Id<"orgs">,
  templateName: string
): Promise<Id<"pipelines">> {
  const templates: Record<string, Array<{ name: string; color: string; isFinal?: boolean; finalType?: "positive" | "negative" | "neutral"; staleAfterDays?: number }>> = {
    "real-estate": [
      { name: "New", color: "#6366f1", staleAfterDays: 3 },
      { name: "Viewing Scheduled", color: "#8b5cf6", staleAfterDays: 5 },
      { name: "Offer / MOU", color: "#f59e0b", staleAfterDays: 7 },
      { name: "Documentation", color: "#3b82f6", staleAfterDays: 10 },
      { name: "Ejari / Registration", color: "#10b981", staleAfterDays: 14 },
      { name: "Handover", color: "#06b6d4", staleAfterDays: 7 },
      { name: "Won", color: "#22c55e", isFinal: true, finalType: "positive" },
      { name: "Lost", color: "#ef4444", isFinal: true, finalType: "negative" },
    ],
    "saas": [
      { name: "Discovery", color: "#6366f1", staleAfterDays: 5 },
      { name: "Demo Scheduled", color: "#8b5cf6", staleAfterDays: 7 },
      { name: "Proposal Sent", color: "#f59e0b", staleAfterDays: 10 },
      { name: "Negotiation", color: "#3b82f6", staleAfterDays: 14 },
      { name: "Closed Won", color: "#22c55e", isFinal: true, finalType: "positive" },
      { name: "Closed Lost", color: "#ef4444", isFinal: true, finalType: "negative" },
    ],
    "generic": [
      { name: "New", color: "#6366f1", staleAfterDays: 5 },
      { name: "In Progress", color: "#f59e0b", staleAfterDays: 10 },
      { name: "Won", color: "#22c55e", isFinal: true, finalType: "positive" },
      { name: "Lost", color: "#ef4444", isFinal: true, finalType: "negative" },
    ],
  };

  const stages = (templates[templateName] ?? templates["generic"]).map((s, i) => ({
    id: `stage_${nanoid(12)}`,
    name: s.name,
    order: i,
    color: s.color,
    isFinal: s.isFinal,
    finalType: s.finalType,
    staleAfterDays: s.staleAfterDays,
  }));

  return ctx.db.insert("pipelines", {
    orgId,
    name: `${templateName.charAt(0).toUpperCase() + templateName.slice(1)} Pipeline`,
    entityType: "deal",
    isDefault: true,
    stages,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });
}

/** Validates a stage transition is allowed (e.g., cannot move INTO a final stage from another final stage) */
export function validateStageTransition(
  pipeline: Doc<"pipelines">,
  fromStageId: string,
  toStageId: string
): { valid: boolean; reason?: string } {
  const fromStage = pipeline.stages.find(s => s.id === fromStageId);
  const toStage = pipeline.stages.find(s => s.id === toStageId);

  if (!fromStage) return { valid: false, reason: "Source stage not found in pipeline" };
  if (!toStage) return { valid: false, reason: "Target stage not found in pipeline" };
  if (fromStageId === toStageId) return { valid: false, reason: "Already in this stage" };

  // Cannot move from one final stage to another final stage
  if (fromStage.isFinal && toStage.isFinal) {
    return { valid: false, reason: "Cannot move between final stages" };
  }

  return { valid: true };
}
```

---

## Internal Mutations (for AI & System Use)

```typescript
// convex/pipelines/internal.ts
// These are internalMutation — not callable from client, only from other Convex functions

export const create = internalMutation({
  args: { orgId: v.id("orgs"), name: v.string(), entityType: v.string(), stages: v.array(...) },
  handler: async (ctx, args) => { /* same as public create but no RBAC check */ },
});

export const addStage = internalMutation({
  args: { pipelineId: v.id("pipelines"), stage: v.object({ name: v.string(), ... }) },
  handler: async (ctx, args) => { /* same as public addStage but no RBAC check */ },
});
```

---

## RBAC Permissions

| Permission | Roles | Used In |
|---|---|---|
| `pipelines.view` | all (admin, manager, member, viewer) | Queries — reading pipeline/stages for kanban |
| `pipelines.manage` | admin, manager | Mutations — create, update, add/remove/reorder stages, delete |

---

## AI Integration

The AI workspace setup tool (`core/ai/tools/setupPipeline`) calls internal mutations to create pipelines during onboarding or when the user asks the AI to configure their workspace:

```typescript
// AI tool: workspace.setupPipeline
// 1. AI determines industry from user input
// 2. Calls internal.pipelines.create with seedFromTemplate
// 3. Optionally calls internal.pipelines.addStage for custom stages
// 4. Returns confirmation with stage list to user

// Example AI flow:
// User: "Set up my CRM for a real estate agency"
// AI: calls internal.pipelines.create → seeds "real-estate" template
// AI: "Done! Created pipeline with 8 stages: New → Viewing Scheduled → ... → Won/Lost"
```

---

## How Deals Reference Pipelines

Deals store `pipelineId` and `currentStageId` directly:

```typescript
// On deal record:
{
  pipelineId: Id<"pipelines">,    // which pipeline this deal belongs to
  currentStageId: "stage_x7kQ9m", // current stage within that pipeline
  stageEnteredAt: 1714900000000,  // timestamp — used for staleness calculation
}
```

When a deal moves stages:
1. `deals.moveToStage` mutation validates transition via `validateStageTransition()`
2. Updates `currentStageId` + resets `stageEnteredAt` to `Date.now()`
3. Logs activity: `{ type: "stage_change", from: oldStageId, to: newStageId }`
4. If new stage is `finalType: "positive"` → triggers won-deal side effects

---

## Rules

1. **One default pipeline per entityType per org** — enforced in `create` and `update` mutations
2. **Stages are always sorted by `order` field** — never rely on array position alone
3. **Stage IDs are immutable** — once created, the `id` never changes (deals reference it)
4. **Stage names can be renamed freely** — kanban columns update reactively via Convex subscription
5. **Deletion is guarded** — cannot delete a pipeline or stage that has deals referencing it
6. **Templates are starting points** — orgs can fully customize after seeding
7. **`entityType` is immutable after creation** — set once, never changed

---

## Avoids

- ❌ Avoid separate `stages` table — stages live inside the pipeline document (array)
- ❌ Avoid hardcoding stage names anywhere in the frontend — always read from DB
- ❌ Avoid allowing more than one default pipeline per entityType
- ❌ Avoid orphaned stage references — always validate before removing a stage
- ❌ Avoid exposing internal mutations to the client — they bypass RBAC

---

## Never-Do List

```
// ❌ NEVER create a pipeline for leads — leads use status field only
// ❌ NEVER delete a stage that has deals in it — mutation must throw
// ❌ NEVER allow client to call internal.pipelines.* — internal only
// ❌ NEVER hardcode stage IDs in frontend code — always derive from pipeline.stages
// ❌ NEVER change a stage's `id` field — it's referenced by deal records
// ❌ NEVER allow two default pipelines for the same entityType in one org
// ❌ NEVER skip validateStageTransition when moving deals between stages
// ❌ NEVER store stage order as array index alone — use explicit `order` field
// ❌ NEVER expose pipeline mutations without pipelines.manage permission check
```

---

## File Structure

```
convex/pipelines/
├── MODULE.md              # this file
├── queries.ts             # listByOrg, getDefault, getById
├── mutations.ts           # create, update, addStage, removeStage, reorderStages, delete
├── internal.ts            # internalMutation versions for AI/system use
└── helpers.ts             # getDefaultStageId, seedFromTemplate, validateStageTransition
```

---

## Dependencies

- `nanoid` — for generating stage IDs
- `convex/server` — `internalMutation`, `query`, `mutation`
- Project helpers: `orgQuery`, `orgMutation` (from `convex/_helpers/`)

---

## Testing Checklist

- [ ] Creating a pipeline sets it as default if first for entityType
- [ ] Setting a new default unsets the previous default
- [ ] Adding a stage assigns correct order (length of existing stages)
- [ ] Removing a stage with deals throws error
- [ ] Reordering stages updates all `order` fields correctly
- [ ] Deleting default pipeline throws error
- [ ] `getDefaultStageId` returns first non-final stage
- [ ] `validateStageTransition` blocks final→final moves
- [ ] `seedFromTemplate` creates correct number of stages with IDs
- [ ] Internal mutations bypass RBAC but function identically

# features/project-management — MODULE.md
## Project Management (Post-Deal Delivery Tracking)
> **Phase**: 8 · **Status**: Future — locked behind `project_management` feature flag
> **Gate**: Plan-gated (`Pro` plan minimum). Role-gated (`projects.view` permission).
> **Depends on**: Phase 2 (deals, contacts, kanban scaffold), Phase 3 (AI tools)

---

## Purpose

After a deal is won, the work begins. This module tracks **delivery** — the projects, tasks, and milestones that fulfil what was sold. It is NOT a generic project management tool; it is purpose-built as a **CRM-native delivery layer** connected to the entities (deals, contacts, companies) that precede it.

**Key differentiator**: Every project has a `personCode` (the client it's for) and a `dealCode` (the deal that created it). AI and agents can ask "show me all active projects for P-001" and get a complete picture — from initial lead through delivery.

**Auto-creation**: When a deal moves to a "positive final" stage (e.g., "Won", "Handover"), a project can be auto-created from a template. The agent reviews and confirms before it goes live.

---

## Folder Structure

```
features/project-management/
├── MODULE.md                               # this file
├── index.ts                                # barrel export
├── _registry.ts                            # registers "project_management" feature flag
│
├── components/
│   ├── ProjectList.tsx                     # → EntityListPage scaffold
│   ├── ProjectBoard.tsx                    # → KanbanBoard (task statuses as columns)
│   ├── ProjectCard.tsx                     # → extends KanbanCard base
│   ├── ProjectDetail.tsx                   # → EntityDetailPage scaffold
│   ├── AddProjectDialog.tsx                # → EntityFormDialog scaffold
│   ├── TaskList.tsx                        # Sub-list inside project detail
│   ├── TaskCard.tsx                        # Kanban card for tasks
│   ├── MilestoneTimeline.tsx              # Visual milestone tracker
│   └── ProjectAutoCreatePrompt.tsx         # Post-win confirmation UI
│
└── hooks/
    ├── useProjects.ts
    └── useProjectTasks.ts
```

```
convex/
├── projects/
│   ├── queries.ts              # list(), getById(), listForPersonCode()
│   └── mutations.ts            # create(), update(), archive(), autoCreateFromDeal()
│
├── tasks/
│   ├── queries.ts              # listByProject(), getById()
│   └── mutations.ts            # create(), update(), complete(), moveStatus()
│
└── milestones/
    ├── queries.ts              # listByProject()
    └── mutations.ts            # create(), update(), markComplete()
```

---

## Schema

```typescript
// convex/schema.ts — Phase 8 additions

projects: defineTable({
  orgId:        v.id("orgs"),
  projectCode:  v.string(),                   // "PJ-001" — own counter
  name:         v.string(),
  description:  v.optional(v.string()),

  // CRM connections — always link back to the person and deal
  personCode:   v.optional(v.string()),        // "P-001" — the client
  dealCode:     v.optional(v.string()),         // "D-007" — the deal that created this
  contactId:    v.optional(v.id("contacts")),  // convenience FK for direct queries
  dealId:       v.optional(v.id("deals")),

  status:       v.string(),                    // "planning" | "active" | "on_hold" | "completed" | "cancelled"
  assignedTo:   v.optional(v.id("users")),     // project manager
  teamMembers:  v.optional(v.array(v.id("users"))),

  startDate:    v.optional(v.number()),
  dueDate:      v.optional(v.number()),
  completedAt:  v.optional(v.number()),

  source:       v.string(),                    // "manual" | "auto_from_deal" | "ai" | "csv"
  templateKey:  v.optional(v.string()),        // which template seeded tasks/milestones

  aiContext:    v.optional(v.any()),           // auto-rebuilt summary
  createdAt:    v.number(),
  updatedAt:    v.number(),
})
.index("by_org",            ["orgId"])
.index("by_org_and_code",   ["orgId", "projectCode"])
.index("by_org_and_person", ["orgId", "personCode"])
.index("by_org_and_deal",   ["orgId", "dealCode"])
.index("by_org_and_status", ["orgId", "status"]),

tasks: defineTable({
  orgId:        v.id("orgs"),
  taskCode:     v.string(),                    // "T-001"
  projectId:    v.id("projects"),
  projectCode:  v.string(),                    // "PJ-001" — denormalised for fast lookup
  title:        v.string(),
  description:  v.optional(v.string()),
  status:       v.string(),                    // "todo" | "in_progress" | "review" | "done"
  priority:     v.optional(v.string()),        // "low" | "medium" | "high" | "urgent"
  assignedTo:   v.optional(v.id("users")),
  dueDate:      v.optional(v.number()),
  completedAt:  v.optional(v.number()),
  personCode:   v.optional(v.string()),        // inherited from project
  createdAt:    v.number(),
  updatedAt:    v.number(),
})
.index("by_project",      ["projectId"])
.index("by_org_and_code", ["orgId", "taskCode"])
.index("by_assignee",     ["orgId", "assignedTo"]),

milestones: defineTable({
  orgId:        v.id("orgs"),
  projectId:    v.id("projects"),
  title:        v.string(),
  dueDate:      v.number(),
  completedAt:  v.optional(v.number()),
  order:        v.number(),
  createdAt:    v.number(),
})
.index("by_project", ["projectId"]),
```

---

## Auto-Creation from Won Deal

When a deal moves to a stage with `finalType: "positive"` (e.g. "Won", "Handover"):

```typescript
// convex/deals/mutations.ts::closeAsDone (existing)
// At end of handler — already referenced in architecture bible:
if (stage?.finalType === "positive") {
  // NON-BLOCKING — create the project opportunity as a SUGGESTION, not a hard create
  await ctx.scheduler.runAfter(0, internal.projects.autoCreateFromDeal, { dealId: args.dealId });
}

// convex/projects/mutations.ts
export const autoCreateFromDeal = internalAction({
  args: { dealId: v.id("deals") },
  handler: async (ctx, { dealId }) => {
    const deal = await ctx.db.get(dealId);
    if (!deal) return;

    // Check if feature is enabled for this org
    const org = await ctx.db.get(deal.orgId);
    if (!org.settings?.featureFlags?.project_management) return;
    if (!org.settings?.autoCreateProjectOnWin) return; // opt-in setting

    // Load the deal's pipeline template to find the matching project template
    const template = org.settings?.projectTemplateKey
      ? PROJECT_TEMPLATES[org.settings.projectTemplateKey]
      : DEFAULT_PROJECT_TEMPLATE;

    // Create a DRAFT project (status: "planning") — not yet "active"
    const projectCode = await generateEntityCode(ctx, deal.orgId, "project");
    const projectId = await ctx.db.insert("projects", {
      orgId:       deal.orgId,
      projectCode,
      name:        template.nameTemplate.replace("{deal}", deal.title),
      personCode:  deal.personCode,
      dealCode:    deal.dealCode,
      contactId:   deal.contactId,
      dealId:      deal._id,
      status:      "planning",   // agent must activate
      assignedTo:  deal.assignedTo,
      source:      "auto_from_deal",
      templateKey: org.settings?.projectTemplateKey ?? "default",
      createdAt:   Date.now(),
      updatedAt:   Date.now(),
    });

    // Seed template tasks
    for (const [i, taskTemplate] of template.defaultTasks.entries()) {
      const taskCode = await generateEntityCode(ctx, deal.orgId, "task");
      await ctx.db.insert("tasks", {
        orgId:      deal.orgId,
        taskCode,
        projectId,
        projectCode,
        title:      taskTemplate.title,
        status:     "todo",
        priority:   taskTemplate.priority,
        assignedTo: deal.assignedTo,
        personCode: deal.personCode,
        dueDate:    Date.now() + taskTemplate.daysFromStart * 86400000,
        createdAt:  Date.now(),
        updatedAt:  Date.now(),
      });
    }

    // Send notification to assigned user — "Project PJ-001 was auto-created. Review & activate?"
    await ctx.runMutation(internal.notifications.create, {
      orgId:       deal.orgId,
      to:          deal.assignedTo ?? (await getOrgOwner(ctx, deal.orgId)),
      templateKey: "project.auto_created",
      vars:        { projectCode, dealCode: deal.dealCode, dealTitle: deal.title },
      action: {
        type: "navigation",
        href: `/dashboard/{orgSlug}/projects/${projectId}`,
        cta:  "Review Project",
      },
    });

    await ctx.runMutation(internal.activityLogs.log, {
      orgId:      deal.orgId,
      actorType:  "system",
      action:     "project.auto_created",
      entityType: "project",
      entityId:   projectId,
      description: `Project ${projectCode} auto-created from deal ${deal.dealCode}`,
    });

    // Create OrbitLink: deal → project
    await ctx.db.insert("orbitLinks", {
      orgId:    deal.orgId,
      fromCode: deal.dealCode,
      fromType: "deal",
      toCode:   projectCode,
      toType:   "project",
      linkType: "created_project",
      createdAt: Date.now(),
    });
  },
});
```

### Post-Win Confirmation UI

```typescript
// features/project-management/components/ProjectAutoCreatePrompt.tsx
// Shown in the notification → "Review Project" CTA links here

export function ProjectAutoCreatePrompt({ projectId }: { projectId: string }) {
  const project    = useQuery(api.projects.getById, { projectId });
  const tasks      = useQuery(api.tasks.listByProject, { projectId });
  const activateProject = useMutation(api.projects.activate);

  if (!project || project.status !== "planning") return null;

  return (
    <Card className="border-amber-200 bg-amber-50 dark:bg-amber-950/20">
      <CardHeader>
        <CardTitle className="text-base">
          Project {project.projectCode} was auto-created from Deal {project.dealCode}
        </CardTitle>
        <CardDescription>Review the tasks below, make any changes, then activate.</CardDescription>
      </CardHeader>
      <CardContent>
        {/* Task preview list */}
        <div className="space-y-1 mb-4">
          {tasks?.map(t => (
            <div key={t._id} className="flex items-center gap-2 text-sm">
              <CheckCircle2 className="size-3.5 text-muted-foreground" />
              <span>{t.taskCode}: {t.title}</span>
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          <Button onClick={() => activateProject({ projectId })}>
            Activate Project
          </Button>
          <Button variant="outline">Edit Before Activating</Button>
        </div>
      </CardContent>
    </Card>
  );
}
```

---

## Task Board — Reuses core/kanban

```typescript
// features/project-management/components/ProjectBoard.tsx
// IDENTICAL pattern to DealsBoard — uses KanbanBoard with task-specific config

const TASK_COLUMNS: KanbanColumn[] = [
  { id: "todo",        title: "To Do",       color: "#94a3b8" },
  { id: "in_progress", title: "In Progress", color: "#3b82f6" },
  { id: "review",      title: "Review",      color: "#f59e0b" },
  { id: "done",        title: "Done",        color: "#10b981", isFinal: true, finalType: "positive" },
];
// These columns are NOT dynamic from the pipeline — tasks use fixed statuses
// This is the intentional difference from deals (which have org-specific pipeline stages)

export function ProjectBoard({ projectId }: { projectId: string }) {
  const tasksByStatus = useQuery(api.tasks.listGroupedByStatus, { projectId });
  const moveStatus    = useMutation(api.tasks.moveStatus);

  return (
    <KanbanBoard
      columns={TASK_COLUMNS}
      itemsByColumnId={tasksByStatus ?? {}}
      renderCard={(task, isDragging) => (
        <TaskCard task={task} isDragging={isDragging} />
      )}
      onCardMove={(taskId, _from, toStatus) =>
        moveStatus({ taskId: taskId as Id<"tasks">, toStatus })
      }
    />
  );
}
```

---

## AI Integration — Same Tool Registry

The AI assistant in Phase 3 is extended with project tools when this feature is enabled:

```typescript
// convex/ai/tools/projects.ts — added to toolRegistry when project_management flag is on
export const createProjectTool = tool({
  description: "Create a project for a client (connected to their personCode and/or deal)",
  parameters: z.object({
    name:       z.string(),
    personCode: z.string().optional().describe("Person code like P-001"),
    dealCode:   z.string().optional().describe("Deal code like D-007"),
  }),
  execute: async ({ name, personCode, dealCode }, { ctx }) => {
    const result = await ctx.runMutation(internal.projects.create, {
      name, personCode, dealCode, source: "ai",
    });
    return { type: "success", message: `Project ${result.projectCode} created.`, projectId: result.id };
  },
});

export const listProjectTasksTool = tool({
  description: "List all tasks for a project or person",
  parameters: z.object({
    projectCode: z.string().optional(),
    personCode:  z.string().optional(),
  }),
  execute: async ({ projectCode, personCode }, { ctx }) => {
    const tasks = await ctx.runQuery(internal.tasks.listForAI, { projectCode, personCode });
    return { tasks: tasks.map(t => ({ code: t.taskCode, title: t.title, status: t.status, due: t.dueDate })) };
  },
});
```

---

## Milestone Timeline UI

```typescript
// features/project-management/components/MilestoneTimeline.tsx
// Visual horizontal timeline of milestones
// Milestones are shown as markers on a date axis
// Completed milestones: filled circle ✓
// Upcoming milestones: outlined circle
// Overdue milestones: red outlined circle with warning icon

export function MilestoneTimeline({ projectId }: { projectId: string }) {
  const milestones = useQuery(api.milestones.listByProject, { projectId });
  const complete   = useMutation(api.milestones.markComplete);

  return (
    <div className="relative">
      {/* Horizontal line */}
      <div className="absolute inset-x-0 top-4 h-px bg-border" />
      <div className="flex justify-between relative">
        {milestones?.map(m => (
          <MilestoneMarker
            key={m._id}
            milestone={m}
            onComplete={() => complete({ milestoneId: m._id })}
          />
        ))}
      </div>
    </div>
  );
}
```

---

## Feature Flag Registration

```typescript
// features/_registry.ts — existing file, add entry:
{
  key:         "project_management",
  name:        "Project Management",
  description: "Track post-deal delivery with projects, tasks, and milestones",
  minPlan:     "pro",
  phase:       8,
  navSlot:     "workspace",  // appears in nav under Workspace group
}
```

---

## Never-Do List for This Module

```typescript
// ❌ Never auto-activate a project — always create as "planning" and notify agent to review
// ❌ Never hardcode task statuses in project board ("todo", "done") in column renderers — use TASK_COLUMNS config
// ❌ Never build a new Kanban — always use core/kanban/KanbanBoard
// ❌ Never create a project without a personCode or dealCode — projects must connect to CRM
// ❌ Never import this module's code in Phase 2 CRM modules — one-way dependency
// ❌ Never skip generating projectCode and taskCode on create — codes are mandatory
// ❌ Never show projects in nav without feature flag check — ModuleGuard required
// ❌ Never run autoCreateFromDeal if org hasn't opted into auto-creation setting
```
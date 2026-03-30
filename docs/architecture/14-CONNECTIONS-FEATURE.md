# 14 — Connections Feature (Reference Implementation)

> This is the first real feature module built on the base. It demonstrates every pattern: folder structure, backend functions, frontend hooks, notifications, activity logs, and sidebar registration. **Copy this pattern for every new feature.**

---

## What Is a "Connection"?

A **Connection** is a project. When a client submits a project:
1. Admin receives the project details
2. Admin assigns a partner to work on it
3. The client, admin, and partner are "connected" — forming a Connection
4. The project moves through statuses: draft → pending_partner → active → in_progress → review → completed
5. On completion, the connection closes with formalities (commissions, logs) — future scope

### Current Scope (v1)
- Admin creates a connection (client + admin already confirmed outside the app)
- Admin assigns a partner (no accept/reject flow yet — confirmed externally)
- All three users are connected and see the project
- Status management through the lifecycle
- Activity logs and notifications at each state change

### Future Scope (v2)
- Partner accept/reject workflow (with durable workflows)
- Commission calculation on completion
- Client self-service project submission form
- Automated partner matching

---

## Folder Structure

```
features/connections/           # Frontend feature
├── README.md                   # Feature documentation
├── index.ts                    # ← Single export point. ALL external imports use this file.
├── register.ts                 # Sidebar + route registration
├── types.ts                    # Zod schemas, TS types
├── constants.ts                # Status labels, colors, config
├── components/
│   ├── ConnectionCard.tsx      # Single connection card
│   ├── ConnectionList.tsx      # List/table view
│   ├── ConnectionKanban.tsx    # Kanban view (feature-flagged)
│   ├── ConnectionDetail.tsx    # Detail view with tabs
│   ├── CreateConnectionModal.tsx
│   ├── AssignPartnerModal.tsx
│   └── StatusBadge.tsx
├── hooks/
│   ├── useConnections.ts       # Query hook (list)
│   ├── useConnection.ts        # Query hook (single)
│   └── useConnectionMutations.ts # Mutation hooks

convex/connections/             # Backend feature
├── tables.ts                   # Table definitions
├── queries.ts                  # Public queries
├── mutations.ts                # Public mutations
├── notifications.ts            # ← Feature notification templates (registered at startup)
├── helpers.ts                  # Internal helpers
└── actions.ts                  # Actions (if needed)

app/[locale]/dashboard/connections/   # Routes
├── page.tsx                    # List page
└── [id]/
    └── page.tsx                # Detail page
```

### The `index.ts` Export File

Every feature folder must have an `index.ts`. It is the **single public API** of the feature. External code (route pages, other features) **only** imports from `features/connections` — never from deep paths inside the folder.

```ts
// features/connections/index.ts

// Components — what the routes need to render
export { ConnectionList } from "./components/ConnectionList";
export { ConnectionDetail } from "./components/ConnectionDetail";
export { CreateConnectionModal } from "./components/CreateConnectionModal";
export { AssignPartnerModal } from "./components/AssignPartnerModal";
export { StatusBadge } from "./components/StatusBadge";

// Hooks — what any parent component needs
export { useConnections } from "./hooks/useConnections";
export { useConnection } from "./hooks/useConnection";
export { useConnectionMutations } from "./hooks/useConnectionMutations";

// Types — shared with route pages and other features
export type { CreateConnectionInput } from "./types";
export { createConnectionSchema } from "./types";

// Constants — status config, labels
export { STATUS_CONFIG } from "./constants";
```

**Why this matters:**
- Route pages import `from "@/features/connections"` — one line, one place
- When you rename an internal file, only `index.ts` changes, not every importer
- When you delete the feature, you search for `from "@/features/connections"` imports and remove them

---

## Registration

```ts
// features/connections/register.ts
import { registerFeature } from "@/features/_registry";
import { Link2 } from "lucide-react";

registerFeature({
  id: "connections",
  label: "Connections",
  icon: Link2,
  href: "/dashboard/connections",
  permissions: ["connections.viewAll"],
  featureFlag: "connections.enabled",
  order: 10,
});
```

**This is one of only two connection points.** The other is importing `connectionTables` in `schema.ts`.

---

## Types & Constants

```ts
// features/connections/types.ts
import { connectionStatusValues, type ConnectionStatus } from "@/convex/_shared/validators";
import { z } from "zod";

export const createConnectionSchema = z.object({
  title: z.string().min(1, "Title is required").max(200),
  description: z.string().optional(),
  clientId: z.string().min(1, "Client is required"),
  estimatedValue: z.number().optional(),
  currency: z.string().default("USD"),
});

export type CreateConnectionInput = z.infer<typeof createConnectionSchema>;

// features/connections/constants.ts
import { type ConnectionStatus } from "@/convex/_shared/validators";

export const STATUS_CONFIG: Record<ConnectionStatus, {
  label: string;
  color: string;
  icon: string;
  allowedTransitions: ConnectionStatus[];
}> = {
  draft: {
    label: "Draft",
    color: "bg-gray-100 text-gray-700",
    icon: "FileEdit",
    allowedTransitions: ["pending_partner", "cancelled"],
  },
  pending_partner: {
    label: "Pending Partner",
    color: "bg-yellow-100 text-yellow-700",
    icon: "Clock",
    allowedTransitions: ["active", "cancelled"],
  },
  active: {
    label: "Active",
    color: "bg-green-100 text-green-700",
    icon: "CheckCircle",
    allowedTransitions: ["in_progress", "cancelled"],
  },
  in_progress: {
    label: "In Progress",
    color: "bg-blue-100 text-blue-700",
    icon: "Loader",
    allowedTransitions: ["review", "cancelled"],
  },
  review: {
    label: "Review",
    color: "bg-purple-100 text-purple-700",
    icon: "Eye",
    allowedTransitions: ["completed", "in_progress"],
  },
  completed: {
    label: "Completed",
    color: "bg-emerald-100 text-emerald-700",
    icon: "Trophy",
    allowedTransitions: [],
  },
  cancelled: {
    label: "Cancelled",
    color: "bg-red-100 text-red-700",
    icon: "XCircle",
    allowedTransitions: [],
  },
};
```

---

## Backend: Mutations (with notifications + activity logs)

```ts
// convex/connections/mutations.ts
import { orgMutation, adminMutation } from "../_functions/authenticated";
import { sendNotification } from "../notifications/helpers";
import { logActivity } from "../activityLogs/helpers";
import { v } from "convex/values";
import { registerConnectionNotifications } from "./notifications";

// Register this feature's notification templates once at module load time
registerConnectionNotifications();

export const create = adminMutation({
  args: {
    title: v.string(),
    description: v.optional(v.string()),
    clientId: v.id("users"),
    estimatedValue: v.optional(v.number()),
    currency: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    const connectionId = await ctx.db.insert("connections", {
      orgId: ctx.org._id,
      clientId: args.clientId,
      adminId: ctx.user._id,
      title: args.title,
      description: args.description,
      status: "draft",
      estimatedValue: args.estimatedValue,
      currency: args.currency ?? "USD",
      createdAt: now,
      updatedAt: now,
    });

    // orgId + userId auto-injected from ctx — only pass what changes
    await logActivity(ctx, {
      action: "created",
      entityType: "connection",
      entityId: connectionId,
      description: `Created connection "${args.title}"`,
    });

    await sendNotification(ctx, {
      templateKey: "connection.created",
      to: args.clientId,
      vars: { projectTitle: args.title, connectionId },
      entityType: "connection",
      entityId: connectionId,
    });

    return connectionId;
  },
});

export const assignPartner = adminMutation({
  args: {
    connectionId: v.id("connections"),
    partnerId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const connection = await ctx.db.get(args.connectionId);
    if (!connection || connection.orgId !== ctx.org._id) {
      throw new Error("Connection not found");
    }

    await ctx.db.patch(args.connectionId, {
      partnerId: args.partnerId,
      status: "active",
      updatedAt: Date.now(),
    });

    await logActivity(ctx, {
      action: "assigned",
      entityType: "connection",
      entityId: args.connectionId,
      description: `Assigned partner to "${connection.title}"`,
      changes: {
        partnerId: { old: null, new: args.partnerId },
        status: { old: connection.status, new: "active" },
      },
    });

    // Notify partner — orgId inferred from ctx
    await sendNotification(ctx, {
      templateKey: "connection.assigned",
      to: args.partnerId,
      vars: { projectTitle: connection.title, role: "partner", connectionId: args.connectionId },
      entityType: "connection",
      entityId: args.connectionId,
    });

    // Notify client
    if (connection.clientId) {
      await sendNotification(ctx, {
        templateKey: "connection.statusChanged",
        to: connection.clientId,
        vars: { projectTitle: connection.title, newStatus: "active", connectionId: args.connectionId },
        entityType: "connection",
        entityId: args.connectionId,
      });
    }
  },
});
```

> **What changed vs the verbose version:** `orgId: ctx.org._id` and `userId: ctx.user._id` are gone from every `logActivity` and `sendNotification` call — they are inferred from `ctx` automatically. That's 2 lines removed per call, zero functionality lost.

---

## Frontend: Hooks

```ts
// features/connections/hooks/useConnections.ts
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useCurrentUser } from "@/lib/hooks/useCurrentUser";

export function useConnections(status?: string) {
  const { orgId } = useCurrentUser();
  return useQuery(
    api.connections.queries.list,
    orgId ? { orgId, status } : "skip",
  );
}

// features/connections/hooks/useConnectionMutations.ts
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { toast } from "sonner";
import { useCurrentUser } from "@/lib/hooks/useCurrentUser";

export function useConnectionMutations() {
  const { orgId } = useCurrentUser();
  const createMutation = useMutation(api.connections.mutations.create);
  const assignMutation = useMutation(api.connections.mutations.assignPartner);

  const create = async (data: CreateConnectionInput) => {
    if (!orgId) throw new Error("No org context");
    try {
      const id = await createMutation({ orgId, ...data });
      toast.success("Connection created");
      return id;
    } catch (error) {
      toast.error("Failed to create connection");
      throw error;
    }
  };

  const assignPartner = async (connectionId: string, partnerId: string) => {
    if (!orgId) throw new Error("No org context");
    try {
      await assignMutation({ orgId, connectionId, partnerId });
      toast.success("Partner assigned");
    } catch (error) {
      toast.error("Failed to assign partner");
      throw error;
    }
  };

  return { create, assignPartner };
}
```

---

## Route Pages

```tsx
// app/[locale]/dashboard/connections/page.tsx
import { ConnectionList } from "@/features/connections/components/ConnectionList";

export default function ConnectionsPage() {
  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-semibold">Connections</h1>
        <CreateConnectionButton />
      </div>
      <ConnectionList />
    </div>
  );
}
```

**The route page is thin** — it imports the feature component and renders it. All logic is in the feature folder.

---

## What This Feature Does NOT Know About

- How notifications are stored or rendered → calls `sendNotification()`
- How activity logs are queried or displayed → calls `logActivity()`
- How the sidebar works → calls `registerFeature()` once
- How authentication works → uses `orgMutation` which handles it
- How emails are sent → the notification system handles email dispatch

**This is the modular pattern.** Each feature is a black box with two plugs.

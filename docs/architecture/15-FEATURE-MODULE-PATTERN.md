# 15 — Feature Module Pattern

> The template for building any new feature. Follow this exactly. Every feature is a vertical slice that connects to the base through exactly two points.

---

## The Two Connection Points

A feature module connects to the base through:

1. **`convex/schema.ts`** — one line importing the feature's tables: `...myFeatureTables`
2. **`features/_registry.ts`** — one call to `registerFeature()` (via the feature's `register.ts`)

That's it. Everything else is self-contained within:
- `features/[name]/` — frontend (components, hooks, types, constants)
- `convex/[name]/` — backend (queries, mutations, actions, helpers, tables)
- `app/[locale]/dashboard/[name]/` — routes (thin wrappers)

---

## Step-by-Step: Adding a New Feature

### 1. Define Tables (`convex/[name]/tables.ts`)

```ts
// convex/invoices/tables.ts
import { defineTable } from "convex/server";
import { v } from "convex/values";

export const invoiceTables = {
  invoices: defineTable({
    orgId: v.id("orgs"),
    connectionId: v.optional(v.id("connections")),
    clientId: v.id("users"),
    amount: v.number(),
    currency: v.string(),
    status: v.union(
      v.literal("draft"),
      v.literal("sent"),
      v.literal("paid"),
      v.literal("overdue"),
      v.literal("cancelled"),
    ),
    dueDate: v.number(),
    paidAt: v.optional(v.number()),
    createdBy: v.id("users"),
    createdAt: v.number(),
    updatedAt: v.number(),
    deletedAt: v.optional(v.number()),
  })
    .index("by_orgId_and_status", ["orgId", "status"])
    .index("by_orgId_and_clientId", ["orgId", "clientId"])
    .index("by_connectionId", ["connectionId"]),
};
```

### 2. Register in Schema (`convex/schema.ts`)

```ts
import { invoiceTables } from "./invoices/tables";

export default defineSchema({
  ...authTables,
  // ... base tables ...
  ...connectionTables,
  ...invoiceTables,  // ← One line added
});
```

### 3. Write Backend Functions (`convex/[name]/`)

```ts
// convex/invoices/queries.ts
import { orgQuery } from "../_functions/authenticated";
import { v } from "convex/values";

export const list = orgQuery({
  args: { status: v.optional(v.string()) },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("invoices")
      .withIndex("by_orgId_and_status", q => {
        let query = q.eq("orgId", ctx.org._id);
        if (args.status) query = query.eq("status", args.status);
        return query;
      })
      .order("desc")
      .take(50);
  },
});
```

```ts
// convex/invoices/mutations.ts
import { orgMutation } from "../_functions/authenticated";
import { sendNotification } from "../notifications/helpers";
import { logActivity } from "../activityLogs/helpers";
import { v } from "convex/values";

export const create = orgMutation({
  args: {
    clientId: v.id("users"),
    amount: v.number(),
    currency: v.string(),
    dueDate: v.number(),
    connectionId: v.optional(v.id("connections")),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    const id = await ctx.db.insert("invoices", {
      orgId: ctx.org._id,
      clientId: args.clientId,
      amount: args.amount,
      currency: args.currency,
      status: "draft",
      dueDate: args.dueDate,
      connectionId: args.connectionId,
      createdBy: ctx.user._id,
      createdAt: now,
      updatedAt: now,
    });

    await logActivity(ctx, {
      orgId: ctx.org._id,
      userId: ctx.user._id,
      action: "created",
      entityType: "invoice",
      entityId: id,
      description: `Created invoice for $${args.amount} ${args.currency}`,
    });

    return id;
  },
});
```

### 4. Write Frontend Feature (`features/[name]/`)

```ts
// features/invoices/types.ts
import { z } from "zod";

export const createInvoiceSchema = z.object({
  clientId: z.string().min(1),
  amount: z.number().positive(),
  currency: z.string().default("USD"),
  dueDate: z.number(),
});

// features/invoices/hooks/useInvoices.ts
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useCurrentUser } from "@/lib/hooks/useCurrentUser";

export function useInvoices(status?: string) {
  const { orgId } = useCurrentUser();
  return useQuery(api.invoices.queries.list, orgId ? { orgId, status } : "skip");
}
```

### 5. Register Feature (`features/[name]/register.ts`)

```ts
// features/invoices/register.ts
import { registerFeature } from "@/features/_registry";
import { Receipt } from "lucide-react";

registerFeature({
  id: "invoices",
  label: "Invoices",
  icon: Receipt,
  href: "/dashboard/invoices",
  permissions: ["invoices.viewAll"],
  order: 20,
});
```

### 6. Create Route (`app/[locale]/dashboard/[name]/page.tsx`)

```tsx
// app/[locale]/dashboard/invoices/page.tsx
import { InvoiceList } from "@/features/invoices/components/InvoiceList";
import "@/features/invoices/register";  // Ensures sidebar registration runs

export default function InvoicesPage() {
  return (
    <div>
      <h1 className="text-2xl font-semibold mb-6">Invoices</h1>
      <InvoiceList />
    </div>
  );
}
```

### 7. Add Notification Templates (if needed)

```ts
// In convex/notifications/templates.ts, add:
"invoice.created": {
  type: "invoice.created",
  title: (v) => `New invoice: $${v.amount}`,
  body: (v) => `An invoice for $${v.amount} ${v.currency} has been created.`,
  actionUrl: (v) => `/dashboard/invoices/${v.invoiceId}`,
  sendEmail: true,
  emailSubject: (v) => `Invoice for $${v.amount}`,
  emailTemplate: "invoice",
},
```

### 8. Add Permissions (if needed)

```ts
// In convex/_shared/constants.ts, add:
"invoices.create": "Create invoices",
"invoices.viewAll": "View all invoices",
"invoices.delete": "Delete invoices",
```

---

## Removing a Feature

1. Delete `features/[name]/` — components, hooks, types, index.ts all gone
2. Delete `convex/[name]/` — tables, queries, mutations, **and** `notifications.ts` (templates auto-removed)
3. Delete `app/[locale]/dashboard/[name]/`
4. Remove the `...featureTables` line from `convex/schema.ts`
5. Remove permissions for the feature from `convex/_shared/permissions.ts`
6. Run `npx convex dev` — Convex validates schema automatically

> **Notice:** Step 5 is the only step that touches a file outside the feature folder. Notification templates live inside `convex/[name]/notifications.ts` — they are deleted with the feature in step 2. No need to hunt them down in a global file.

---

## Porting a Feature to Another Project

1. Copy `features/[name]/` and `convex/[name]/` to the new project
2. Copy shared validators used by the feature from `convex/_shared/validators.ts`
3. Add `...featureTables` to the new project's `schema.ts`
4. Import `register.ts` in the route page
5. Add notification templates and permissions
6. Done — the feature works if the base modules (auth, notifications, activity logs) exist

---

## Feature Module Checklist

| Step | File | Action |
|---|---|---|
| Tables | `convex/[name]/tables.ts` | Define tables + indexes |
| Schema | `convex/schema.ts` | One line: `...featureTables` |
| Queries | `convex/[name]/queries.ts` | Use `orgQuery` or `authenticatedQuery` |
| Mutations | `convex/[name]/mutations.ts` | Use `orgMutation`, call `logActivity()` and `sendNotification()` |
| Types | `features/[name]/types.ts` | Zod schemas + TS types |
| Constants | `features/[name]/constants.ts` | Status configs, labels, colors |
| Components | `features/[name]/components/` | UI components |
| Hooks | `features/[name]/hooks/` | Convex query/mutation wrappers |
| Register | `features/[name]/register.ts` | Sidebar registration |
| Route | `app/[locale]/dashboard/[name]/page.tsx` | Thin wrapper page |
| Notifications | `convex/notifications/templates.ts` | Add templates if needed |
| Permissions | `convex/_shared/constants.ts` | Add permissions if needed |

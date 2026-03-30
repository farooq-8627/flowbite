# Q&A Answers — Architecture Clarifications

> **This file answers specific questions asked during architecture review. Delete after reading. The actual changes are in the numbered docs.**

---

## Q1: Single-org mode — can we avoid removing multi-tenancy code?

**Yes, absolutely. This is the right approach.**

Instead of removing multi-tenancy code, add a single constant `SINGLE_ORG_MODE: true` in `lib/config.ts`. When true:
- First user registration auto-joins the single existing org instead of creating a new one
- Org switcher is hidden (single `if` check)
- No URL changes, no schema changes
- Zero database migration needed

When a client later wants multi-org: flip to `false`, add org creation UI. **Everything else already works.**

See `04-MULTI-TENANCY.md` → "Single-Org Mode" section for the full implementation.

---

## Q2: Locale in URLs — can we handle it globally instead of per-query/link?

**Yes. Use `useAppRouter` and `useLocalePath` hooks.**

The rule: **no component ever hardcodes locale**. Instead:
```ts
// Instead of: <Link href={`/${locale}/dashboard/connections`}>
const localePath = useLocalePath();
<Link href={localePath("/dashboard/connections")}>

// Instead of: router.push(`/${locale}/dashboard`)
const { push } = useAppRouter();
push("/dashboard");
```

Convex queries are **never** given locale — the backend is locale-agnostic. Localization is presentation-only.

See `16-RULES-AND-CONVENTIONS.md` → "Locale Handling" section.

---

## Q3: What are `entityType`, `entityId`, and `metadata` in notifications?

**Plain English:**

- **`entityType`**: "What kind of thing is this notification about?" → `"connection"`, `"invoice"`, `"member"`. Used to group notifications and build URLs.

- **`entityId`**: "Which specific one?" → The document ID. When the user clicks the notification, the app navigates to `/dashboard/[entityType]/[entityId]`.

- **`metadata`**: A free-form object for any extra data that doesn't fit in template variables. Rarely needed. Example: `{ estimatedValue: 5000, avatarUrl: "..." }` — data you want to display in a rich notification preview but don't want in the template string.

**Most notifications only need `entityType` + `entityId`.** Skip `metadata` unless you have a specific reason.

---

## Q4: Can we reduce the params in `sendNotification`?

**Yes — and it's done.** `orgId` and `userId` (actor) are now auto-injected from `ctx`.

**Before:**
```ts
await sendNotification(ctx, {
  orgId: ctx.org._id,       // gone
  userId: args.partnerId,   // was recipient, renamed to `to`
  templateKey: "...",
  variables: { ... },       // renamed to `vars`
  entityType: "connection",
  entityId: args.connectionId,
});
```

**After:**
```ts
await sendNotification(ctx, {
  templateKey: "...",
  to: args.partnerId,       // recipient
  vars: { ... },
  entityType: "connection",
  entityId: args.connectionId,
});
```

Same reduction for `logActivity` — `orgId` and `userId` are gone.

---

## Q5: Where should notification templates live — inside the feature or globally?

**Inside the feature.** Here's the rule:

- **Base templates** (member invited, role changed, billing) → `convex/notifications/templates.ts`
- **Feature templates** (connection.assigned, invoice.sent) → `convex/[feature]/notifications.ts`

Each feature has a `registerXNotifications()` function that merges its templates into the global map. Call it once at the top of the feature's `mutations.ts`.

**Why:** When you delete the feature, its templates are deleted with it. No hunting through `templates.ts` to find connection-specific entries.

Same pattern for permissions — feature permissions go in `convex/[feature]/permissions.ts` if the feature has many, or inline in the feature's schema if just a few.

---

## Q6: How to reduce notification calls when sending to multiple recipients?

Apply the **per-frequency rule**:

| Used where? | Pattern |
|---|---|
| Same 2 lines repeated in 3+ mutations | Define a named template, use `sendNotification()` with template key |
| One-off notification, unique context | Just call `sendNotification()` inline — no template needed |
| Multiple recipients of same event | Multiple `sendNotification()` calls is fine — it's already compact |

You don't need to reduce the *number* of calls when there are multiple recipients — each recipient is a separate notification. What you reduce is the *boilerplate per call* (removing `orgId`, `userId`).

---

## Q7: GitHub skills repo — what to use from `alirezarezvani/claude-skills`?

The repo has 205 skills for general engineering. What's relevant for this project:

**Useful to install:**
- `senior-architect` — Architecture decision records, C4 diagrams, system design patterns
- `code-reviewer` — Code review checklist, security patterns, quality gates
- `senior-fullstack` — Next.js + TypeScript best practices
- `tdd-guide` — Test-first development for Convex functions

**Not useful for this project:**
- AWS/GCP/Azure skills — we use Convex (no infra)
- GraphQL skills — we use Convex queries
- Database migration skills — we use `convex-migration-helper` (already installed)
- Playwright/E2E skills — future scope

**The existing `.github/skills/` already has the most valuable Convex-specific skills.** The generic engineering skills from that repo are secondary.

**To install:** The repo uses `npx ai-agent-skills install alirezarezvani/claude-skills/engineering-team/senior-architect` but this Copilot CLI uses `/plugin install` syntax. Since internet access isn't available in the terminal here, run this manually:

```bash
# Run this yourself in your terminal:
npx ai-agent-skills install alirezarezvani/claude-skills/engineering-team/senior-architect
npx ai-agent-skills install alirezarezvani/claude-skills/engineering-team/code-reviewer
npx ai-agent-skills install alirezarezvani/claude-skills/engineering-team/senior-fullstack
```

---

## Q8: Why is compaction slow? (15-20% context, taking long)

The slowness isn't caused by the `docs/` folder size. The docs are ~30KB total — small.

Likely causes:
1. **Large `node_modules`** being scanned when searching for files — use `.gitignore` or `.claudeignore` to exclude it
2. **The `skills-lock.json` and `pnpm-lock.yaml`** being included in context — these are large lock files
3. **Multiple back-and-forth in one query** with many edits — each edit reloads context

**Quick fix:** Create a `.claudeignore` file:
```
node_modules/
.next/
pnpm-lock.yaml
skills-lock.json
convex/_generated/
```

This prevents those directories from being scanned and loaded into context, significantly speeding up compaction.

---

## Q9: Can we make background jobs (Trigger.dev), caching, and other base systems also compact?

**Yes — same pattern as notifications and activity logs.**

Each base system helper auto-injects `orgId` from `ctx`. Features only pass what's specific to the action:

```ts
// Background jobs — compact trigger pattern
await triggerJob(ctx, {
  taskId: "send-bulk-email",  // which job
  payload: { recipients, template },
});
// orgId, userId auto-injected for tracing

// Caching — compact invalidation
await invalidateCache(ctx, {
  entityType: "connection",
  entityId: args.connectionId,
});
// orgId auto-injected

// Feature flags — no change needed
// useFeatureFlag("connections.kanban") — already compact
```

This is a future improvement — not yet implemented in the base. When building these helpers, follow the same pattern: accept `ctx` as first param, inject `orgId` from `ctx.org._id` inside the helper, expose only the meaningful params externally.


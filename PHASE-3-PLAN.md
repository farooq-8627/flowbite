# PHASE-3-PLAN.md
> Updated: 2026-05-22
> Read order: AGENTS.md → `.github/agents/base/context.md` → **this file** → relevant module STATE.md

---

## Quick-Reference

| Section | Content |
|---|---|
| §1 | Phase 3A — completion summary |
| §2 | Phase 3B — AI assistant (next) |
| §3 | Phase 3C — WhatsApp / voice |
| §4 | Production-readiness gap list |
| §5 | Feature-flag layering |
| §6 | Long-term industry coverage (Gaps 1–3) |

---

## §1 Phase 3A — COMPLETE ✅

**Shipped 2026-05-22.**

### What was built

| Deliverable | Status |
|---|---|
| `orgs.settings` — 5 new fields (dashboardMetrics, softDeleteRetentionDays, mockDataSeededAt, mockDataDismissedAt, deletionScheduledAt) | ✅ |
| LemonSqueezy billing fields + 2 indexes on `orgs` | ✅ |
| `excludeFromAI` flag on all 4 CRM entities + notes + reminders | ✅ |
| `productivity.ts` template (NEW) — tasks, ideas, no leads/companies | ✅ |
| `real-estate-saudi.ts` template (NEW) — Ejar, Sakani, SAR, Iqama | ✅ |
| `freelancer.ts` REBUILT — lean solo, Companies hidden, 5-stage | ✅ |
| All 9 templates: semantic note categories, ranked dashboardMetrics | ✅ |
| All 9 templates: full mock data (3 leads, 2 contacts, 2 deals, company, notes, reminders) | ✅ |
| Registry aliases (sub-niches → canonical id) | ✅ |
| Migrations: rename real-estate ids, backfill dashboardMetrics | ✅ |
| `mockSeeder.ts` — idempotent, `source:"template_seed"`, `excludeFromAI:true` | ✅ |
| `clearMockData` + `dismissMockDataBanner` org mutations | ✅ |
| `theme_preset` default → `"soft-pop"` | ✅ |
| Auth fix — `JWKS` + `JWT_PRIVATE_KEY` + `SITE_URL` env vars on Convex | ✅ |

### What was intentionally deferred (Phase 3B+)

- `entityVisibility` honored in sidebar — flag is set; sidebar doesn't read it yet.
- Settings → "Switch template" / "Delete sample data" button — mutation exists; no UI.
- AI persona is stored but the AI runtime is a stub.
- Streak widget — `tasks.streak` slot reserved; renders "Coming soon" in 3A.
- LemonSqueezy webhook route + checkout UI — schema done; HTTP route + UI pending.

---

## §2 Phase 3B — AI Assistant

**Gate: "Stop navigating your CRM. Just talk to it."**
**Estimated effort: ~2.5 weeks.**

### Architecture (locked)

AI tools are **thin RBAC-aware wrappers over existing mutations**. No tool reaches into `ctx.db` directly. Every tool calls `ctx.runMutation(internal.X.Y, args)`. The hard work is done. Phase 3B is glue.

### Files to build

| File | Role |
|---|---|
| `convex/ai/systemPrompt.ts` | 3-layer builder: (1) platform rules, (2) org context (labels + pipeline stages + custom fields + team members), (3) route context (current page entity) |
| `convex/ai/toolRegistry.ts` | role → allowed-tools map; `TOOL_PERMISSIONS` lookup |
| `convex/ai/tools/search_crm.ts` | wraps `crm.people.queries.searchByCode` + entity list queries |
| `convex/ai/tools/create_entity.ts` | wraps `leads.create`, `contacts.create`, `deals.create` |
| `convex/ai/tools/update_entity.ts` | wraps entity `update` mutations |
| `convex/ai/tools/move_deal_stage.ts` | wraps `deals.moveToStage`; args: `dealCode` + `stageCode` |
| `convex/ai/tools/create_followup.ts` | wraps `reminders.createFollowup` |
| `convex/ai/tools/create_reminder.ts` | wraps `reminders.create` |
| `convex/ai/tools/add_note.ts` | wraps `notes.create` |
| `convex/ai/tools/get_entity_detail.ts` | wraps detail queries + timeline |
| `convex/ai/tools/get_summary.ts` | wraps dashboard metric queries |
| `convex/ai/tools/bulk_update.ts` | wraps entity patch mutations; **requires confirmation gate** |
| `convex/ai/tools/workspace_setup.ts` | wraps `orgs.applyTemplate` |
| `convex/ai/internal.ts` (fill body) | scan activityLogs + notes + reminders → LLM summarise → write `aiContext` |
| `app/api/ai/chat/route.ts` | streaming proxy; billing check before Claude call |
| `core/ai/components/ChatSheet.tsx` | right-side resizable panel |
| `core/ai/components/ChatMessage.tsx` | message bubble (markdown-rendered) |
| `core/ai/components/ChatToolCall.tsx` | tool-result cards (mini-table / entity card) |
| `core/ai/components/ChatConfirmation.tsx` | inline [Confirm] / [Cancel] for destructive tools |
| `core/ai/hooks/useAIChat.ts` | `useChat()` wrapper |
| `core/ai/hooks/useRouteContext.ts` | reads `usePathname()` → parses personCode / dealCode → feeds layer 3 |

### Security model (4 layers — locked)

1. Auth from session — identity verified before any action.
2. Tool filtering — only role-permitted tools exposed to the model.
3. Org-scoped data — every query/mutation scoped to caller's orgId from `ctx`.
4. Confirmation gates — `bulk_update`, `workspace_setup`, delete tools emit `ChatConfirmation` card before execution.

### Model routing

| Task complexity | Model |
|---|---|
| Search / lookup | Claude Haiku |
| Create / update / move | Claude Sonnet |
| Analytics / briefing / workspace setup | Claude Sonnet |

### Required env vars

```bash
npx convex env set ANTHROPIC_API_KEY "sk-ant-..."
```

### Phase 3B checklist

```
[ ] convex/ai/systemPrompt.ts
[ ] convex/ai/toolRegistry.ts
[ ] convex/ai/tools/ — all 11 tools
[ ] convex/ai/internal.ts — rebuildEntityContext body filled
[ ] app/api/ai/chat/route.ts
[ ] core/ai/components/ — ChatSheet, ChatMessage, ChatToolCall, ChatConfirmation
[ ] core/ai/hooks/useAIChat.ts + useRouteContext.ts
[ ] pnpm typecheck → 0 errors
[ ] pnpm test → 160+ passing
[ ] "Show me my top deals" → deal cards in AI panel
[ ] "Create a lead for Sarah at Acme" → lead created with personCode
[ ] Viewer role: read-only tools only
[ ] First token < 2 seconds streaming latency
```

---

## §3 Phase 3C — WhatsApp / Voice

**Gate: gated by Phase 3B (AI runtime must exist first).**
**Estimated effort: ~1 week.**

| # | Task | File |
|---|---|---|
| 1 | 360dialog webhook | `app/api/channels/whatsapp/route.ts` |
| 2 | Whisper → Claude → `fieldValues.bulkSet` | `trigger/whatsapp/voiceProcessor.ts` |
| 3 | Channel registration + 360dialog API key in Settings → Integrations | settings UI |
| 4 | Gulf-market: WhatsApp over email for follow-up notifications | `notifications/helpers.ts` — add `channel: "whatsapp"` path |

---

## §4 Production-Readiness Gap List

Items required before public launch, ordered by priority:

| # | Item | Effort | Priority | Status |
|---|---|---|---|---|
| 1 | Mock data seeded on signup | 1 day | P0 | ✅ Done |
| 2 | AI assistant end-to-end | 2.5 weeks | P0 | ⬜ Phase 3B |
| 3 | Email send (Resend + invitation + password-reset) | 1.5 days | P0 | ✅ Done |
| 4 | Soft-delete recovery + Trash UI | 1 day | P0 | ✅ Done |
| 5 | GDPR data export + cascade delete | 2 days | P0 | ✅ Done |
| 6 | LemonSqueezy webhook + checkout + plan gating | 3 days | P0 | ✅ Done |
| 7 | Security headers in `next.config.ts` (CSP, HSTS, X-Frame-Options) | 0.5 day | P0 | ✅ Done |
| 8 | `entityVisibility` honored in sidebar | 0.5 day | P0 | ✅ Done |
| 9a | Settings → "Switch template" UI | 0.5 day | P1 | ✅ Done |
| 9b | Settings → "Delete sample data" button | 0.5 day | P1 | ⬜ Mutation exists; button not wired |
| 10 | `activityLogs` archive cron (rows > 90 days) | 0.5 day | P1 | ⬜ Cron missing |
| 11 | Bulk-update mutations + UI | 3 days | P1 | ⬜ |
| 12 | Cmd+K typeahead using schema `searchIndex` | 2 days | P1 | ⬜ |
| 13 | CSV import (Trigger.dev background job + field mapping) | 3 days | Phase 4+ | ⬜ |

---

## §5 Feature-Flag Layering

Three distinct layers — do not conflate them:

| Layer | Source | Drives | Phase |
|---|---|---|---|
| Industry-shape flags | `org.settings.entityVisibility` + `org.settings.modules[]` (set by template seeder) | Sidebar items, route guards, dashboard widgets, AI tool exposure | Phase 3A → 3B |
| Plan-tier limits | `convex/_platform/limits.ts` (eventually `platformTiers` DB table) | Hard gates: max pipelines, AI token quota, member count | Already wired |
| Kill-switch flags | `featureFlags` table — org-level boolean overrides | Emergency disable / canary rollout | Already wired |

**Phase 3B wires AI tool exposure** — `toolRegistry.ts` reads `member.permissions` (layer 1) and may also check plan-tier limits (layer 2) before exposing tools.

---

## §6 Long-term Industry Coverage (Gaps 1–3)

After Phase 3 ships, these three feature modules unlock 12/16 major verticals.

### Gap 1 — Products / Services Catalog (`features/catalog/`)

```typescript
catalogItems:  { orgId, code, name, description, unit, unitPrice, currencyCode, category, isActive }
dealLineItems: { orgId, dealId, itemId, quantity, unitPriceOverride, discountPct, notes }
```

Unlocks: agency, freelance (proper invoicing), construction, manufacturing, field service.

### Gap 2 — Documents / Contracts / Proposals / Invoices (`features/documents/`)

```typescript
documents: {
  orgId, docCode,
  type: "proposal" | "contract" | "invoice" | "quote" | "form",
  status, personCode, dealCode,
  title, body, variables,
  subtotal, taxRate, total, currencyCode, lineItems,
  signatureStatus, signatories, sentAt, viewedAt, acceptedAt, paidAt,
  publicToken
}
```

Unlocks: serious freelance (HoneyBook/Dubsado-equivalent), agency, legal, photography, events.

### Gap 3 — Workflow / Automation Builder (`features/workflows/`)

```typescript
workflows: {
  orgId, name, isActive,
  trigger: { event, filters },
  actions: [{ kind: "email.send"|"reminder.create"|"note.add"|"field.update"|"tag.add"|"notification.send"|"wait", args }]
}
```

Reuses AI tool-registry as action kinds. Unlocks every industry's "if X then Y" rules.

### Industry matrix (after all 3 gaps)

| Industry | This build | + Gap 1 | + Gap 2 | + Gap 3 |
|---|---|---|---|---|
| Dubai / Gulf RE | ✅ | — | better | better |
| Saudi RE | ✅ | — | better | better |
| B2B SaaS / startups | ✅ | better | better | better |
| Coaching / consulting | ✅ | much better | much better | better |
| Insurance | ✅ | — | better | much better |
| Recruitment | ✅ | — | much better | better |
| Non-profit / donor | ✅ | — | better | better |
| Basic freelance | ✅ | much better | **required** | better |
| Agency / design | ✅ | better | **required** | better |
| Legal (entity5=Matter) | 🟡 | — | **required** | better |
| Construction | ❌ | **required** | **required** | better |
| Manufacturing | ❌ | **required** | better | better |
| Field service | ❌ | **required** | better | needs scheduling |
| Photography / events | 🟡 | better | **required** | better |
| Healthcare | ❌ | — | — | out of scope (HIPAA) |
| E-commerce | ❌ | — | — | wrong paradigm |

**After all 3 gaps → 12 / 16 verticals credibly served.**

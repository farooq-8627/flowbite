# Active Todos

> OVERWRITE this file — never append.
> Updated: 2026-05-19
> Status: Phase 2 ✅ Complete — Phase 3 AI is next

---

## Phase 2 Leftovers (ship before or early in Phase 3)

| # | Task | Priority | Where |
|---|---|---|---|
| 1 | Mount FollowUpsPanel in ProfileContent.tsx | HIGH | `core/platform/profile/views/ProfileContent.tsx` ~line 218 |
| 2 | Mount FollowUpsPanel in DealDetailView.tsx | HIGH | `core/entities/_entities/deals/views/DealDetailView.tsx` ~line 1015 |
| 3 | Mount FollowUpsPanel in CompanyDetailView.tsx (also add RemindersPanel there) | HIGH | `core/entities/_entities/companies/views/CompanyDetailView.tsx` |
| 4 | Auto-close follow-ups cron | MEDIUM | `convex/crons.ts` + `convex/crm/shared/reminders/mutations.ts` |

---

## Phase 3 — AI Assistant (full plan in PHASE-3-NEXT.md)

| # | Task | Priority |
|---|---|---|
| 1 | `convex/ai/systemPrompt.ts` — 3-layer prompt builder | HIGH |
| 2 | `convex/ai/toolRegistry.ts` — role → tool mapping | HIGH |
| 3 | `convex/ai/tools/` — 11 core tools | HIGH |
| 4 | `convex/ai/internal.ts::rebuildEntityContext` — fill in body | HIGH |
| 5 | `app/api/ai/chat/route.ts` — streaming proxy | HIGH |
| 6 | `core/ai/components/` — ChatSheet, ChatMessage, ChatToolCall, ChatConfirmation | HIGH |
| 7 | `core/ai/hooks/useAIChat.ts` + `useRouteContext.ts` | HIGH |
| 8 | `app/api/channels/whatsapp/route.ts` — 360dialog webhook | MEDIUM |
| 9 | `trigger/whatsapp/voiceProcessor.ts` — Whisper → Claude → fieldValues | MEDIUM |

---

## Production Hardening (before public launch)

| # | Task | Effort |
|---|---|---|
| 1 | Email send (Resend helper + invitation + password reset templates) | 1.5 days |
| 2 | Soft-delete recovery (`undelete` mutations for every entity) | 1 day |
| 3 | GDPR: user data export + delete cascade | 2 days |
| 4 | Billing (Stripe/LemonSqueezy webhook + checkout + plan gating) | 3 days |
| 5 | Security headers in `next.config.ts` (CSP, HSTS, X-Frame-Options) | 0.5 days |
| 6 | `activityLogs` archive cron (rows > 90 days old) | 0.5 days |

---

## Performance Improvements (defer until volume warrants)

| # | Task | When |
|---|---|---|
| 1 | Batch `IdentityBadge` per-card via `prefetched` prop | 50+ unique personCodes on one page |
| 2 | `listFollowupsForEntity` compound index | Org has >2k follow-ups |
| 3 | `ConvertLeadDrawer` → server-side `findDuplicates` query | Org has >500 leads |
| 4 | Cursor pagination on reminders/messages/notes/timeline | 10k+ rows per org |

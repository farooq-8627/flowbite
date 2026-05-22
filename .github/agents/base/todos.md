# Active Todos

> OVERWRITE this file — never append.
> Updated: 2026-05-22

---

## ✅ Phase 3A — COMPLETE

All tasks shipped. `pnpm typecheck` → 0 errors.

---

## Production Hardening — Status After Scan

| # | Item | Status |
|---|---|---|
| 1 | Mock data seeded on signup | ✅ Done |
| 2 | AI assistant end-to-end | ⬜ Phase 3B |
| 3 | Email (Resend — invitation + password-reset) | ✅ Done |
| 4 | Soft-delete Trash UI + undelete + daily purge cron | ✅ Done |
| 5 | GDPR export (fflate zip) + cascade delete (24h grace) | ✅ Done |
| 6 | LemonSqueezy webhook + checkout + plan gating | ✅ Done |
| 7 | Security headers in `next.config.ts` | ✅ Done |
| 8 | `entityVisibility` honored in sidebar | ✅ Done |
| 9a | Settings → "Switch template" UI | ✅ Done |
| 9b | Settings → "Delete sample data" button | ⬜ Pending — `clearMockData` mutation exists; button not wired in `WorkspaceTemplateSection.tsx` |
| 10 | `activityLogs` archive cron (rows > 90 days) | ⬜ Pending — only `purge-old-trash` + `recompute-org-stats` crons exist |

---

## Remaining Work Before Public Launch

### P1 — Two small tasks
1. **"Delete sample data" button** in `WorkspaceTemplateSection.tsx` — call `api.orgs.mutations.clearMockData`. Show only when `org.settings.mockDataSeededAt` is set and `mockDataDismissedAt` is not set (or add a simple "has mock data" check).
2. **`activityLogs` archive cron** — add to `convex/crons.ts`: `crons.interval("archive-activity-logs", { hours: 24 }, internal.activityLogs.mutations.archiveOld, {})` and create the `archiveOld` internal mutation that hard-deletes rows where `createdAt < now - 90 days`.

---

## Phase 3B — AI Assistant (next priority)

| # | Task | Priority |
|---|---|---|
| 1 | `convex/ai/systemPrompt.ts` — 3-layer builder | HIGH |
| 2 | `convex/ai/toolRegistry.ts` — role → allowed-tools map | HIGH |
| 3 | All 11 tools in `convex/ai/tools/` | HIGH |
| 4 | `convex/ai/internal.ts::rebuildEntityContext` body | HIGH |
| 5 | `app/api/ai/chat/route.ts` — streaming proxy | HIGH |
| 6 | Chat UI: ChatSheet, ChatMessage, ChatToolCall, ChatConfirmation | HIGH |
| 7 | `useAIChat.ts` + `useRouteContext.ts` | HIGH |
| 8 | Set `ANTHROPIC_API_KEY` in Convex env | HIGH |

---

## Phase 3C — WhatsApp / Voice (after 3B)

| # | Task | Priority |
|---|---|---|
| 1 | 360dialog webhook route | MEDIUM |
| 2 | Whisper → Claude → fieldValues processor | MEDIUM |
| 3 | Channel registration UI in Settings → Integrations | MEDIUM |
| 4 | Gulf-market: WhatsApp notification channel | MEDIUM |

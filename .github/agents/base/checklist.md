# Build Checklists

> Updated: 2026-05-22
> Phases 0, 1, 2, 3A are COMPLETE. Phase 3B is next.

---

## Phase 0 ✅ · Phase 1 ✅ · Phase 2 ✅ · Phase 3A ✅ — All complete.

Full CRM: auth, RBAC, shell, onboarding, all entity slices, pipelines, settings, dashboard.
9 industry templates with full mock data. `pnpm typecheck` → 0 errors. 116+ tests passing.

---

## Phase 3B — AI Assistant

> **Gate: "Stop navigating your CRM. Just talk to it."**

- [ ] `convex/ai/systemPrompt.ts` — 3-layer builder
- [ ] `convex/ai/toolRegistry.ts` — role → tool permissions map
- [ ] `convex/ai/tools/search_crm.ts`
- [ ] `convex/ai/tools/create_entity.ts`
- [ ] `convex/ai/tools/update_entity.ts`
- [ ] `convex/ai/tools/move_deal_stage.ts`
- [ ] `convex/ai/tools/create_followup.ts`
- [ ] `convex/ai/tools/create_reminder.ts`
- [ ] `convex/ai/tools/add_note.ts`
- [ ] `convex/ai/tools/get_entity_detail.ts`
- [ ] `convex/ai/tools/get_summary.ts`
- [ ] `convex/ai/tools/bulk_update.ts` (requires confirmation gate)
- [ ] `convex/ai/tools/workspace_setup.ts`
- [ ] `convex/ai/internal.ts::rebuildEntityContext` body filled
- [ ] `app/api/ai/chat/route.ts` — streaming proxy + billing check
- [ ] `core/ai/components/ChatSheet.tsx`
- [ ] `core/ai/components/ChatMessage.tsx`
- [ ] `core/ai/components/ChatToolCall.tsx`
- [ ] `core/ai/components/ChatConfirmation.tsx`
- [ ] `core/ai/hooks/useAIChat.ts`
- [ ] `core/ai/hooks/useRouteContext.ts`
- [ ] "Show me my top deals" → deal cards in AI panel
- [ ] "Create a lead for Sarah at Acme" → lead created with personCode
- [ ] Viewer role: read-only tools only
- [ ] First token < 2s streaming latency
- [ ] `pnpm typecheck` 0 errors · `pnpm test` passing · `pnpm build` all routes

---

## Production Hardening (parallel with 3B)

- [ ] Email — Resend invitation + password-reset wired
- [ ] Soft-delete Trash UI + undelete mutations
- [ ] GDPR export (CSV bundle) + cascade delete
- [ ] LemonSqueezy webhook + checkout + plan gating
- [ ] Security headers in `next.config.ts`
- [ ] `entityVisibility` honored in sidebar
- [ ] Settings → "Switch template" + "Delete sample data" button

---

## Phase 3C — WhatsApp / Voice

- [ ] 360dialog webhook route
- [ ] Whisper → Claude → fieldValues processor
- [ ] Channel registration UI in Settings → Integrations

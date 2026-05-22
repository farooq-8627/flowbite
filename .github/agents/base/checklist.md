# Build Checklists

> Updated: 2026-05-22
> Phase 0, 1, 2 are COMPLETE. Phase 3A is next.

---

## Phase 0 ✅ · Phase 1 ✅ · Phase 2 ✅ — All complete.

Full CRM: auth, RBAC, shell, onboarding, all entity slices, pipelines, settings, dashboard. Build passes. 116+ tests passing.

---

## Phase 3A — Industry Polish & Mock Data

> **Gate: brand-new signup looks like a working CRM in 30 seconds.**

- [ ] `productivity.ts` template built
- [ ] `freelancer.ts` rebuilt (lean solo)
- [ ] `real-estate-saudi.ts` template built
- [ ] Template ids renamed + migration runs cleanly on dev
- [ ] `mockData` slot added to `IndustryTemplate` type
- [ ] `seedMockEntities()` idempotent seeder
- [ ] 4 target templates ship mock leads, contacts, deals, notes
- [ ] Sub-niche picker UI on onboarding Step 2b
- [ ] Note categories semantic in all templates
- [ ] `entityVisibility` honored in sidebar
- [ ] Settings → Switch template UI exists
- [ ] `dashboardMetrics` added to `orgs.settings` schema
- [ ] `pnpm typecheck` 0 errors · `pnpm test` passing · `pnpm build` all routes

---

## Phase 3B — AI Assistant

> **Gate: "Stop navigating your CRM. Just talk to it."**

- [ ] `convex/ai/systemPrompt.ts`
- [ ] `convex/ai/toolRegistry.ts`
- [ ] `convex/ai/tools/` — all 11 tools
- [ ] `convex/ai/internal.ts::rebuildEntityContext` body filled
- [ ] `app/api/ai/chat/route.ts` — streaming proxy
- [ ] `core/ai/components/` — ChatSheet, ChatMessage, ChatToolCall, ChatConfirmation
- [ ] `core/ai/hooks/useAIChat.ts` + `useRouteContext.ts`
- [ ] "Show me my top deals" → deal cards in AI panel
- [ ] "Create a lead for Sarah at Acme" → lead created with personCode
- [ ] Viewer role: read-only tools only

---

## Phase 3C — WhatsApp / Voice

- [ ] `app/api/channels/whatsapp/route.ts` (360dialog webhook)
- [ ] `trigger/whatsapp/voiceProcessor.ts` (Whisper → Claude → fieldValues)
- [ ] Channel registration UI in Settings → Integrations

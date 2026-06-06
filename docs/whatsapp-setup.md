# WhatsApp setup — Twilio sandbox → production

> **Status.** S13 (inbound), S14 (outbound), S15 (Mode C agent profile) all
> shipped 2026-06-05. This doc is the operator's runbook: how to point a
> Twilio number at the deployment, what env vars are required, how an
> incoming WhatsApp message becomes a lead in the CRM, and how the three
> autonomy modes (A / B / C) differ.
>
> No code changes here. Schema + behaviour are pinned to:
> `convex/schema/system.ts` (`agentChannels`, `whatsappTemplates`),
> `convex/ai/channels/whatsappInbound.ts`,
> `convex/ai/channels/whatsappOutbound.ts`,
> `convex/ai/channels/persona.ts`,
> `convex/http.ts` (`POST /whatsapp/twilio`).

---

## 1. The model in one minute

There are **three independent surfaces**, each backed by one row in
`agentChannels` per phone number:

| Mode | `agentChannels.mode` | What it does | Direction | Default |
|---|---|---|---|---|
| **A** | `agent_ops` | Twilio inbound triggers an **autonomous AI turn** under the agent's RBAC. The AI reads the conversation, dedupes, creates the lead, schedules the follow-up, adds notes — without waking the agent. | inbound only (autonomous) | OFF until row exists |
| **B** | `send` | The AI (or a UI action) calls `send_whatsapp`. In-window → free-form session message. Out-of-window → pre-approved template only. | outbound only | OFF until row exists |
| **C** | `profile` | The Twilio number IS an AI persona. Customer messages are answered directly by an 11-capability allow-list bot (`wa_profile`); never destructive over WhatsApp; rate-limited 1 reply / 30 s per conversation. Hands off to a human via `escalate_to_agent`. | inbound + outbound (autonomous) | **OFF** by default — gated on `org.settings.aiAutonomy.whatsappAgentEnabled === true` |

You can run **A + B together** (most real-estate / agency setups), **B
alone** (outbound campaigns only), or **C** for a self-serve customer-
facing line. A and C are mutually exclusive on the **same phone
number** — the inbound dispatcher in `whatsappInbound.ts` reads
`agentChannels.mode` and routes accordingly.

---

## 2. The conversation → lead model (personCode is the spine)

This is the single most important architectural detail. Everything else
follows from it.

```
                  ┌─────────────────────────────────┐
   WhatsApp ─────►│  POST /whatsapp/twilio          │
   (Twilio)       │  (HMAC-SHA1 verified)           │
                  └──────────────┬──────────────────┘
                                 │
                  ┌──────────────▼──────────────────┐
                  │ findContactOrLeadByPhone(phone) │
                  │ → existing personCode?          │
                  └──────────────┬──────────────────┘
                       yes ┌─────┴─────┐ no
                           │           │
              ┌────────────▼─┐   ┌─────▼──────────────┐
              │ reuse        │   │ no row created yet │
              │ personCode   │   │ — Mode A turn will │
              │ (P-NNN)      │   │ search_crm + then  │
              └──────┬───────┘   │ create_lead, which │
                     │           │ MINTS the personCode│
                     │           └──────────┬─────────┘
                     │                      │
                     └──────┬───────────────┘
                            │
              ┌─────────────▼──────────────────────┐
              │ recordInboundWhatsappMessage       │
              │   → messages table, channel:       │
              │     "whatsapp", authorType:        │
              │     "contact", authorPersonCode,   │
              │     idempotencyKey: <Twilio SID>   │
              └─────────────┬──────────────────────┘
                            │
              ┌─────────────▼──────────────────────┐
              │ Mode dispatch                      │
              │   agent_ops → autonomousTurn       │
              │   profile   → runWaProfileReply    │
              │   send      → 200 noop (inbound    │
              │               not allowed)         │
              └────────────────────────────────────┘
```

Three things hold this together:

1. **`personCode` is the stable identity** (locked decision #12 in
   `AGENTS.md`). It's minted once when the lead is created (`P-001`,
   `P-002`, …), preserved through `convert_lead` → contact, and used
   in every URL, AI prompt, WhatsApp routing decision, activity-log
   row, deal, reminder, and message thereafter. It **never
   regenerates**.
2. **Every WhatsApp exchange lives in the existing `messages`
   table** — no parallel "WhatsApp messages" silo. Three row shapes,
   all keyed to the lead/contact by `authorPersonCode` (locked decision
   #1.10 in `AI-TOOLING-BUILD-STAGES.md`):

   | Source | `authorType` | `channel` | `authorId` / `onBehalfOf` |
   |---|---|---|---|
   | Customer's WhatsApp message | `contact` | `whatsapp` | `authorId` = assigned agent (RBAC) |
   | Agent reply via the app composer or `send_whatsapp` (Mode B, `authoredBy:"user"`) | `user` | `whatsapp` | `authorId` = agent |
   | AI reply via `send_whatsapp` (`authoredBy:"ai"`) or Mode C | `ai` | `whatsapp` | `onBehalfOf` = the agent the AI acts for |

3. **Idempotency is keyed on Twilio's `MessageSid`.** Every inbound
   row uses `idempotencyKey: <MessageSid>` against the `messages.by_org_and_idempotency`
   index, so Twilio's at-least-once delivery never duplicates a row.
   The same applies to outbound: `send_whatsapp` writes the new row
   with `idempotencyKey: <Twilio SID>` returned by the Messages API.

> **Honest limit.** We can only log agent replies that go through the
> app composer or the agent's Twilio number. If an agent types on
> their *personal* WhatsApp app, that message bypasses Twilio entirely
> and never appears in `messages`. Fix the gap by routing agent
> replies through the app or assigning each agent their own
> Twilio-mapped number (`mode: "agent_ops"` or `"send"`).

---

## 3. Required environment variables

Set these in the **Convex deployment dashboard** (Settings → Environment
Variables). The Convex MCP / `npx convex run` path hangs in some agent
runtimes — set them via the dashboard UI.

| Variable | Required for | Where it's read |
|---|---|---|
| `TWILIO_AUTH_TOKEN` | Inbound HMAC verification (every mode) AND outbound Basic auth | `convex/ai/channels/whatsappInbound.ts:verifyTwilioSignatureSha1` + `convex/ai/channels/whatsappOutbound.ts` |
| `TWILIO_ACCOUNT_SID` | Outbound only — Basic auth username for the Messages API | `convex/ai/channels/whatsappOutbound.ts:sendWhatsappViaTwilioAction` |
| `TWILIO_MOCK_MODE` | Tests / staging — when `"1"`, outbound returns a deterministic mock SID instead of calling Twilio | same file |

There is **no separate sandbox token**. Twilio's WhatsApp sandbox uses
the same Account SID + Auth Token; the sandbox is just a special
recipient (`whatsapp:+14155238886`) you connect to with a join code.

---

## 4. Phase 1 — Twilio sandbox (test before paying)

**Goal:** prove inbound HMAC + outbound send work without provisioning a
real WhatsApp Business sender.

1. **Twilio console** → Messaging → Try it out → **Send a WhatsApp
   message** (the sandbox).
2. Note the sandbox sender (`whatsapp:+14155238886`) and your join
   code (`join <two-words>`).
3. **From your phone**, send `join <two-words>` to the sandbox number
   on WhatsApp. You're now a sandbox participant.
4. **Set the inbound webhook**: in the same sandbox screen, set
   "WHEN A MESSAGE COMES IN" to:
   ```
   https://<your-deployment>.convex.site/whatsapp/twilio
   ```
   Method: **POST**.
5. **Set the env vars** (see §3) on the **dev** Convex deployment.
6. **Seed an `agentChannels` row** for the sandbox number. Open the
   Convex dashboard → Data → `agentChannels` → Add document:

   ```json
   {
     "orgId":       "<the org's _id>",
     "userId":      "<the agent's _id, or omit for org-level>",
     "provider":    "twilio",
     "phoneNumber": "+14155238886",
     "mode":        "agent_ops",
     "enabled":     true,
     "createdAt":   1717000000000,
     "updatedAt":   1717000000000
   }
   ```

   `phoneNumber` is the **Twilio side** of the conversation, in E.164
   without the `whatsapp:` prefix — exactly what `findAgentChannelByPhone`
   strips and matches on.

7. **Send a message from your phone**. It should land within 2 s as:
   - one new `messages` row keyed to your phone (`channel:"whatsapp"`,
     `authorType:"contact"`),
   - if you don't already exist as a contact/lead, the autonomous turn
     creates a lead via `create_lead` (Mode A behaviour),
   - one `aiToolEvents` row marking the autonomous turn,
   - one `activityLogs` row (`actorType:"ai"`, `action:"ai.autonomous.turn"`).

8. **Send an outbound reply** (Mode B). From the chat, ask the AI to
   "send Sarah Khan a WhatsApp greeting" — the AI calls `send_whatsapp`
   with `templateId:"greeting_v1"`. Or from a UI button wired to the
   same capability.

If the inbound webhook 401s, the most common causes are:
- `TWILIO_AUTH_TOKEN` wrong / unset → signature fails.
- `phoneNumber` in `agentChannels` doesn't match Twilio's `To` field
  (look for the `whatsapp:` prefix or country-code mismatch).
- `enabled: false` on the row — short-circuits to 401 even when the
  signature passes (kill-switch behaviour).

---

## 5. Phase 2 — Production (real WhatsApp Business sender)

**Prerequisites Twilio gates the whole sender on:**
- A Meta Business Manager account verified to your business.
- A Twilio Messaging Service.
- A WhatsApp Sender approved on a real phone number (Twilio submits
  this on your behalf; turnaround is typically 1–3 business days).
- At least **one approved Content Template** if you plan to send
  outside the 24h customer-service window — see §7.

**Steps:**

1. Provision the WhatsApp Sender in the Twilio console (Messaging →
   Senders → WhatsApp). Wait for "Online".
2. **Set the inbound webhook on the sender** (not the sandbox):
   ```
   https://<prod-deployment>.convex.site/whatsapp/twilio
   ```
3. Set `TWILIO_AUTH_TOKEN` + `TWILIO_ACCOUNT_SID` on the **prod** Convex
   deployment.
4. **Seed `agentChannels` rows** — one per agent number, or one
   org-level number for round-robin. See §6 for example shapes.
5. **Run the default-template seed migration** (idempotent — already
   run on dev, must run on prod separately):
   ```
   npx convex run _migrations/2026_06_05_seedDefaultWhatsappTemplates:run '{"dryRun":true}'
   npx convex run _migrations/2026_06_05_seedDefaultWhatsappTemplates:run '{}'
   ```
   This inserts the four built-ins (`greeting_v1`, `follow_up_v1`,
   `appointment_v1`, `agent_handoff_v1`) with `orgId: undefined` so
   every org sees them. They are local renderers until each is
   submitted to Twilio + assigned a `contentSid` (see §7).
6. **Smoke test** with a known phone number not yet in the CRM. The
   inbound should mint `P-NNN` and reply or stay silent depending on
   `mode`.

---

## 6. `agentChannels` row examples

Every row carries the same shape; only `mode` differs.

### Mode A — `agent_ops` (autonomous turns, no customer reply)

```json
{
  "orgId":       "j97a8…",
  "userId":      "j5c1e…",
  "provider":    "twilio",
  "phoneNumber": "+971501234567",
  "mode":        "agent_ops",
  "enabled":     true
}
```

What it does on inbound:
- `autonomousTurn` (Node action in `convex/ai/runtime/autonomous.ts`)
  is scheduled with `channel:"whatsapp"`, `idempotencyKey:<MessageSid>`,
  and the **agent's** `userId` as principal.
- The AI loads the recent transcript via `read_conversation`, runs
  `search_crm`, creates / updates / annotates rows under the agent's
  RBAC.
- Debounced 8 s per `(orgId, personCode)` — bursts of inbound
  messages produce ONE turn, not N.
- **The customer never sees a reply.** Outbound is a separate mode.

### Mode B — `send` (outbound only)

```json
{
  "orgId":       "j97a8…",
  "userId":      "j5c1e…",
  "provider":    "twilio",
  "phoneNumber": "+971501234567",
  "mode":        "send",
  "enabled":     true
}
```

What it does on inbound: nothing — the route returns 200 noop. Inbound
on a `send`-only number means nothing because no `agent_ops` row owns
this number.

What it does on outbound: serves as the lookup key for
`findAgentSendChannel`. When `send_whatsapp` is called:
- It resolves `org → agent → send-channel → recipient`.
- 24 h session window (`isWithinSessionWindow`, `SESSION_WINDOW_MS`):
  in-window → free-form `Body`; out-of-window → `templateId` +
  `templateVars` REQUIRED. Free-form refused with a `repair`
  envelope listing valid template ids.
- Persists outbound row via `messages.sendForAI` with
  `idempotencyKey:<Twilio SID>`.

### Mode C — `profile` (autonomous customer-facing reply)

```json
{
  "orgId":       "j97a8…",
  "userId":      "j7s9b… (a service-member, NOT a real human)",
  "provider":    "twilio",
  "phoneNumber": "+971501119999",
  "mode":        "profile",
  "enabled":     true
}
```

Required prerequisites:
- A dedicated **service-member** user row with `ai.use` +
  `ai.whatsappAgent` permissions (Owner+Admin by default — assign to
  this synthetic user explicitly).
- `org.settings.aiAutonomy.whatsappAgentEnabled === true` on the org.

What it does on inbound:
- `runWaProfileReply` (Node action in `convex/ai/channels/persona.ts`)
  is scheduled with `principal.kind:"wa_profile"`, the registry
  pre-filtered to an **11-capability allow-list**:
  `send_whatsapp · draft_message · search_crm · describe_entity ·
   read_conversation · discover_capabilities · ask_user · create_lead ·
   create_task · add_note · escalate_to_agent`.
- Every destructive / settings / members capability is **absent** —
  enforced by the wrapper's channel + risk gate, NOT by trust.
- Per-conversation rate limit of **1 reply / 30 s**
  (`tryConsumeRateLimitInternal`, scope `wa_profile.reply`,
  key = personCode or bare phone).
- When the model can't answer or the customer asks for a human,
  `escalate_to_agent` writes an `agent_handoff_v1`-templated
  outbound message AND opens a high-priority task on the lead's
  assigned agent.

---

## 7. Templates: in-window vs out-of-window

WhatsApp's **24-hour customer-service window** opens when the customer
sends a message and closes 24 h after their last inbound. Inside the
window: free-form session messages. Outside: pre-approved templates
only.

The repo ships with four built-ins in `whatsappTemplates`:

| `templateId` | Category | Purpose |
|---|---|---|
| `greeting_v1` | `utility` | First-touch greeting after a new lead lands. |
| `follow_up_v1` | `utility` | Polite check-in after a stale touch. |
| `appointment_v1` | `utility` | Confirm a scheduled meeting / viewing. |
| `agent_handoff_v1` | `utility` | "An agent will reach out shortly" — used by Mode C `escalate_to_agent`. |

Each template carries:
- `body` with `{{var}}` placeholders.
- `variables[]` with descriptions the AI reads when filling.
- `approvalStatus` — `draft` / `submitted` / `approved` / `rejected`.
- `contentSid` — set ONLY when Twilio has approved the template and
  assigned a SID. The outbound action prefers the Content API path
  when `contentSid` is set; without it, an out-of-window send falls
  through to the local renderer (which Twilio rejects in production).

**To take a template live:**
1. Submit the body verbatim through Twilio Content Builder.
2. Wait for "Approved".
3. In the Convex dashboard or owner panel (Future-Enhancements §B.40
   tracks the admin UI), patch the `whatsappTemplates` row with the
   returned `contentSid` and flip `approvalStatus` to `"approved"`.
4. Outbound uses it automatically the next time the AI calls
   `send_whatsapp({templateId:"…"})` outside the 24 h window.

Org overrides: insert a new `whatsappTemplates` row with the **same
`templateId`** + an `orgId` set. The read path
(`getTemplateForOrg(orgId, templateId)`) prefers the org row; built-ins
are the fallback for every other org.

---

## 8. Decision flow on the inbound webhook

This is what `convex/http.ts:POST /whatsapp/twilio` actually does, in
order. Use it to debug 401s and silent drops.

```
1. Read the raw form body (Twilio sends application/x-www-form-urlencoded).
2. Verify X-Twilio-Signature against the request URL + sorted params,
   keyed by TWILIO_AUTH_TOKEN. Mismatch → 401.
3. parseTwilioFormBody — extract From, To, MessageSid, Body, NumMedia,
   ProfileName. Missing From/To/MessageSid → 400.
4. findAgentChannelByPhone(stripWhatsappPrefix(To)). No row → 401
   (do NOT echo "no such channel" — give attackers nothing).
5. enabled === false → 401 (kill-switch).
6. findContactOrLeadByPhone(stripWhatsappPrefix(From)) → existing
   personCode if any. (Used as the rate-limit key + transcript filter.)
7. recordInboundWhatsappMessage — idempotent insert into `messages`.
   If the same MessageSid already landed, no-op.
8. Mode dispatch:
   - "agent_ops" → schedule internal.ai.runtime.autonomous.autonomousTurn
                   with channel:"whatsapp", trigger:"autonomous",
                   principal = the agentChannels.userId, debounced 8 s.
   - "profile"   → schedule internal.ai.channels.persona.runWaProfileReply
                   with principal.kind:"wa_profile", rate-limit key =
                   personCode (or bare from-phone for unknown contacts).
   - "send"      → return 200 noop (inbound on a send-only line is
                   intentionally a no-op; do not autonomous-turn).
9. Return 200.
```

---

## 9. Common operational tasks

**Disable a number without deleting it.** Patch the row's
`enabled: false`. Inbound returns 401 immediately; outbound's
`findAgentSendChannel` skips the row.

**Move a number from `agent_ops` to `profile`.** You need to
*disable* the existing row and insert a new one — the inbound
dispatcher reads exactly one row per `(provider, phoneNumber)`.

**Switch an org from Mode A → Mode C.** Patch
`org.settings.aiAutonomy.whatsappAgentEnabled` to `true` AND ensure
a `mode:"profile"` `agentChannels` row exists with a service-member
`userId`. Without both, `runWaProfileReply` short-circuits with
reason `autonomy_off` or `agent_not_member`.

**Audit "what did the AI do over WhatsApp last week?"** Read
`activityLogs` filtered by `actorType:"ai"` AND
`action:"ai.autonomous.turn"`. Cross-reference against `aiToolEvents`
for per-capability detail. Both are written by the wrapper +
autonomous engine; both are RBAC-checked.

**Customer asks "delete my data" over WhatsApp.** The AI can NOT do
this — `hard_delete_entity` and bulk-delete are `irreversible` risk
tier, and the wrapper's `channelAllows` gate excludes WhatsApp on
every irreversible capability (locked decision #26 in `AGENTS.md`).
The AI will reply with `escalate_to_agent` instead.

---

## 10. Future-Enhancements references

- **§B.40** — WhatsApp Templates Admin UI (owner panel). Today
  templates are managed via the Convex dashboard / migrations.
- **§B.41** — Mode C external prerequisites (Meta Business Manager,
  WhatsApp Business approval). Track these per-org separately from
  the code.

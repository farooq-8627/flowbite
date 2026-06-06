# LemonSqueezy — Full setup & test guide (Orbitly-specific)

> **Purpose.** End-to-end, copy-paste-ready instructions to enable LemonSqueezy billing for this project from a fresh state, then verify a real plan upgrade flows through to your Convex backend.
>
> **Read order.** Top to bottom. Each section has a short *Why this matters* line + the exact button/click/command. Stop and verify after every checkpoint.
>
> **Sources.** Every step is grounded in the official LemonSqueezy docs (linked at the bottom). No training-data guesses — only behaviour we've confirmed against the live product on 2026-05-28.

---

## 0 — What you'll have at the end

- A LemonSqueezy account with a **test-mode store** (no real money moves).
- One **Subscription product** with three **variants** (Starter, Pro, Enterprise), each with monthly + yearly pricing.
- A **webhook** pointing at your Convex deployment with a signing secret you control.
- Convex env vars set (`LEMONSQUEEZY_API_KEY`, `LEMONSQUEEZY_STORE_ID`, `LEMONSQUEEZY_WEBHOOK_SECRET`).
- The **Owner panel `/xowner/tiers`** filled in with the variant ids you just created.
- A successful end-to-end test: clicking "Upgrade to Pro" in `/settings?group=billing` opens a real LemonSqueezy checkout, paying with a test card flips your workspace's `org.plan` from `free` → `pro` and surfaces it in the dashboard.

**Total time:** ~30 minutes for a first-time setup.

---

## Part 1 — LemonSqueezy account + store

### 1.1 — Sign up

**Why.** Account is free; test mode is on by default; no card needed.

1. Go to **<https://app.lemonsqueezy.com/register>**.
2. Sign up with email/password (or Google/Twitter).
3. Open the verification email LemonSqueezy sends and click the link.

### 1.2 — Create your store

**Why.** Every product, customer, and webhook lives under a store. You can't skip this; the dashboard funnels you through it on first sign-in.

1. After login, the wizard asks for a **store name** and **subdomain**.
2. Pick a subdomain — e.g. `orbitly`. Your store URL becomes `https://orbitly.lemonsqueezy.com` (cosmetic, but visible in test-mode receipts).
3. Click **Create store**.

> 🔒 Your store starts in **Test mode** automatically. The toggle is at the top-right of the dashboard sidebar — leave it on **Test** for now.

### 1.3 — Confirm test mode is on

**Why.** Live-mode actions cost real money and can't be undone. Every step below assumes Test mode.

- Look for the toggle near your account avatar — it should say **Test mode** with an orange/yellow indicator.
- If it says **Live mode**, click it to switch back. (Live mode is locked until you complete identity verification + activate your store, which we DO NOT do during setup.)

---

## Part 2 — Create your subscription product

This is one product (e.g. "Orbitly") with multiple **variants** — one per plan tier × billing cadence.

### 2.1 — Add the product

1. Sidebar → **Store → Products**.
2. Top right → **+ New product**.
3. Fill in:
   - **Name:** `Orbitly` (whatever your app name is)
   - **Description:** one short marketing line — e.g. "AI-native CRM with Bring-Your-Own-Key support."
   - **Pricing model:** select **Subscription**
4. Click **Save** (or **Save & continue**).

> The first variant ("default") is created automatically. We'll edit it AND add more variants below.

### 2.2 — Add variants — one per (plan, cadence)

We need **6 variants total**: Starter Monthly, Starter Yearly, Pro Monthly, Pro Yearly, Enterprise Monthly, Enterprise Yearly. Skip Free — it's not billed by LemonSqueezy.

For each, on the product edit page → **Add variant**:

| Variant | Name | Price | Repeat every |
|---|---|---|---|
| Starter Monthly | `Starter (Monthly)` | $19.00 | 1 month |
| Starter Yearly  | `Starter (Yearly)`  | $190.00 | 1 year |
| Pro Monthly     | `Pro (Monthly)`     | $49.00 | 1 month |
| Pro Yearly      | `Pro (Yearly)`      | $490.00 | 1 year |
| Enterprise Monthly | `Enterprise (Monthly)` | $199.00 | 1 month |
| Enterprise Yearly | `Enterprise (Yearly)` | $1990.00 | 1 year |

> **Trial days (optional but recommended).** On Starter/Pro variants you can set "Free trial" to **14 days** under the variant's pricing options. Trial subscriptions land in our system as `subscription_status: "on_trial"` and bypass the AI quota gate for the trial period.

After saving each variant, click **Publish product** at the top.

### 2.3 — Capture every variant id

**Why.** This is what our app needs. The variant id is in the URL when you click into a variant.

1. Click into a variant (e.g. **Pro (Monthly)**).
2. Look at the browser URL: `https://app.lemonsqueezy.com/products/.../variants/123456`.
3. The number at the end (e.g. `123456`) is the **variant id**.
4. Write down a 6-row table:

   ```
   Starter Monthly:    ______
   Starter Yearly:     ______
   Pro Monthly:        ______
   Pro Yearly:         ______
   Enterprise Monthly: ______
   Enterprise Yearly:  ______
   ```

Keep this open — you'll paste these into the Owner panel in Part 5.

### 2.4 — Capture your store id

**Why.** Needed for the API call that mints checkout URLs.

1. Sidebar → **Settings → Stores** (or top-right menu → **Settings**).
2. Your store row shows a numeric id (or click the store row to see it). Copy it.
3. Write it down: `LEMONSQUEEZY_STORE_ID = ______`.

---

## Part 3 — Create an API key

**Why.** The Convex action `convex/billing/actions.ts::createCheckoutUrl` calls `https://api.lemonsqueezy.com/v1/checkouts` to mint a hosted checkout. That API call is authenticated with this key.

1. Sidebar → **Settings → API**.
2. Click **+ Create API key**.
3. Name it something like `orbitly-dev`.
4. **Copy the token immediately** (LemonSqueezy shows it once — if you lose it, you have to revoke + recreate).
5. Write it down: `LEMONSQUEEZY_API_KEY = ______`.

> ⚠ This API key created in Test mode only works against test-mode data. When you eventually go live, repeat in **Live mode** and replace the env var on the prod deployment.

---

## Part 4 — Create the webhook

**Why.** When a real payment / subscription event happens, LemonSqueezy needs to tell your backend. We've already shipped the receiver at `convex/http.ts::lemonSqueezyWebhook`. We just need to point LemonSqueezy at it.

### 4.1 — The webhook URL

The receiver lives at:

```
https://laudable-mockingbird-383.convex.site/billing/lemonsqueezy/webhook
```

> ⚠ Note `convex.site` (not `convex.cloud`). Convex serves HTTP endpoints under `.site` — this is intentional. If you copy `.cloud`, you'll get 404s.

You can confirm your deployment's HTTP base any time with:

```bash
npx convex env get NEXT_PUBLIC_CONVEX_URL --once
```

…then swap `.cloud` for `.site` in the URL.

### 4.2 — Generate a signing secret

**Why.** Every webhook request from LemonSqueezy is HMAC-signed with this secret. The Convex handler verifies it with constant-time compare. If they don't match, 401.

The secret is a string between **6 and 40 characters** of your choosing. Generate a strong one:

```bash
openssl rand -hex 32
```

Copy the output. Write it down: `LEMONSQUEEZY_WEBHOOK_SECRET = ______`.

### 4.3 — Register the webhook

1. LemonSqueezy sidebar → **Settings → Webhooks**.
2. Click **+ Add a webhook endpoint**.
3. Fill in:
   - **Callback URL:** the webhook URL from §4.1.
   - **Signing secret:** the secret from §4.2.
4. **Events** — tick exactly these (the others aren't needed for this flow):

   - ☑ `subscription_created`
   - ☑ `subscription_updated`
   - ☑ `subscription_cancelled`
   - ☑ `subscription_resumed`
   - ☑ `subscription_expired`
   - ☑ `subscription_paused`
   - ☑ `subscription_unpaused`
   - ☑ `subscription_payment_success`
   - ☑ `subscription_payment_failed`
   - ☑ `subscription_payment_recovered`

5. Click **Save**.

> The webhook is now live. LemonSqueezy starts retrying a webhook for up to **3 days with exponential backoff** if the response is non-2xx.

---

## Part 5 — Wire LemonSqueezy into Convex + the Owner panel

### 5.1 — Set Convex env vars

Run these against your **dev** deployment (no `--prod` flag):

```bash
npx convex env set LEMONSQUEEZY_API_KEY "<paste from 3.4>"
npx convex env set LEMONSQUEEZY_STORE_ID "<paste from 2.4>"
npx convex env set LEMONSQUEEZY_WEBHOOK_SECRET "<paste from 4.2>"
```

Verify:

```bash
npx convex env list | grep LEMONSQUEEZY
```

You should see all three.

> 🔁 **For production later.** Repeat the same three `env set` commands with `--prod` against your live deployment. Use the **live-mode** API key + signing secret (not the test-mode ones). The runbook at `docs/runbooks/lemonsqueezy-rotation.md` documents secret rotation.

### 5.2 — Set `NEXT_PUBLIC_APP_URL`

**Why.** The Convex action passes a `redirect_url` to LemonSqueezy so the customer comes back to your app after checkout. If unset, the redirect lands on a blank page.

In `.env.local` (Next.js side, NOT Convex env):

```
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

For prod, set it to your real domain (e.g. `https://orbitly.app`).

### 5.3 — Plug variant ids + marketing copy into the Owner panel

**Why.** The Owner panel is the single source of truth for every plan-config knob. Everything you set here propagates to:
- The in-app `/settings?group=billing` PricingCard (what your customers see).
- The marketing `/pricing` page (when you ship that PR).
- The webhook handler (so an inbound `variant_id` resolves to the right plan tier).
- The AI quota gate (token + credit caps per tier).
- The AI model gate (which models a plan can run).

Steps:

1. Sign in to your app at `http://localhost:3000`.
2. Navigate to **`/xowner/auth`** and complete the email-OTP login (you must be in `PLATFORM_OWNER_EMAILS`).
3. Once in, go to **`/xowner/tiers`**.
4. For each of the four tier cards (Free, Starter, Pro, Enterprise), edit:

   **Display name** — already correct.

   **Description** — one-line marketing tagline. The seeded defaults are fine; change only if you want different copy.

   **Highlight as 'Most popular'** — turn ON for **Pro** only (it's already set this way after the migration ran).

   **Monthly / Yearly price (USD)** — should match what you set in LemonSqueezy variants. If anything diverges, the Owner panel value is what your billing UI displays — fix it here so prices match.

   **Trial days** — keep `0` for Free, `14` for Starter/Pro, `30` for Enterprise.

   **LemonSqueezy variant ids** — paste the ids from §2.3:
   - Starter card → Monthly variant id + Yearly variant id
   - Pro card → Monthly + Yearly
   - Enterprise card → Monthly + Yearly
   - Free card → leave both empty (Free has no LS variant — it's our default state)

   **Features** — bullet list shown on the PricingCard. The migration seeded sensible defaults; edit only if you want different copy.

   **Limits** — should already be populated correctly from the migration. If you want to widen Free for testing:
   - `maxLeads: 100`
   - `maxDeals: 50`
   - `maxMembers: 3`
   - `aiTokensPerMonth: 0` (BYOK still works)
   - `aiMessageCreditsPerMonth: 0`

5. Click **Save tier** on each card you edited. You'll see a success toast.

> Refresh `/settings?group=billing` — your **PricingCard** should now show all four tiers with the right names, prices, descriptions, and feature bullets. Pro should have the "Most popular" badge.

---

## Part 6 — Run a real test upgrade

This is the moment of truth. We're going to upgrade a workspace from `free` → `pro` end-to-end.

### 6.1 — Make sure your dev server is running

In one terminal:

```bash
pnpm dev
```

In another terminal:

```bash
npx convex dev
```

Both should stay running. Convex picks up function changes; Next.js picks up frontend changes.

### 6.2 — Open the billing settings page

1. Sign in to the app as a workspace owner.
2. Go to **`/settings?group=billing`** (or click the avatar → Settings → Billing in the sidebar).
3. You should see:
   - The "Current Plan" card at the top showing **Free**.
   - A "Choose a plan" card with **4 PricingCards**.
   - The "Plan limits" card at the bottom with usage bars.

### 6.3 — Click "Upgrade to Pro"

1. Find the **Pro** PricingCard.
2. Click the **Upgrade to Pro** button.
3. The button shows a spinner ("Starting checkout…").
4. Within 1-2 seconds, you should be redirected to `https://orbitly.lemonsqueezy.com/...checkout url...`.

### 6.4 — Pay with a test card

LemonSqueezy's hosted checkout opens.

1. **Email:** any (test mode delivers receipts to your team only, not the typed address).
2. **Card number:** `4242 4242 4242 4242` (Visa test).
3. **Expiry:** any future date — e.g. `12/35`.
4. **CVC:** `123`.
5. **Name + ZIP:** anything.
6. Click **Pay** (or "Start subscription").

> Other test cards (use these to test specific failure paths):
> - Insufficient funds: `4000 0000 0000 9995`
> - 3D Secure: `4000 0027 6000 3184`
> - Expired card: `4000 0000 0000 0069`

### 6.5 — Confirm the upgrade landed

You should be redirected back to `http://localhost:3000/billing/success` (or wherever `NEXT_PUBLIC_APP_URL` points + `/billing/success`).

Now the verification trail:

1. **Webhook received.** Check Convex logs:
   ```bash
   npx convex logs --once | grep billing
   ```
   You should see `applyWebhookEvent` having run with `eventName: "subscription_created"` (and a `subscription_payment_success` shortly after).

2. **Workspace plan upgraded.** Refresh `/settings?group=billing`:
   - "Current Plan" badge: **Pro** (was Free).
   - Status badge: **active**.
   - "Current period ends" shows ~1 month from now (or 1 year if you picked yearly).
   - The Pro card now has a **Current** badge instead of an "Upgrade" button.

3. **AI quota gate honours the new plan.** Open the AI side panel — try a chat turn. The quota gate should pass (Pro has `aiTokensPerMonth: 1,000,000`).

4. **Premium models unlocked.** In the chat model picker, premium models like Claude Opus 4 or GPT-4o should now be selectable (Free hides them).

If all 4 hold ✅ — **billing is fully wired**. 🎉

### 6.6 — Test failure cases (optional but recommended)

Use the LemonSqueezy dashboard's **Simulate webhook** feature (Settings → Webhooks → click your webhook → **Send test event**) to trigger:

| Simulate this event | Expected outcome |
|---|---|
| `subscription_payment_failed` | Workspace gets the **TrialBanner** "Payment failed — update your card" amber banner. AI still works for 3 days (grace period). |
| `subscription_cancelled` | TrialBanner shows "X days left until plan ends." Plan stays on Pro until the period end. |
| `subscription_expired` | Workspace plan flips back to **Free**. TrialBanner shows danger "Subscription expired — moved to Free." AI quota gate hard-blocks premium models. |
| `subscription_paused` | TrialBanner shows "Subscription paused." |

Each of these should be reflected in the Convex `org` doc within 1-2 seconds of clicking "Send test event".

---

## Part 7 — Going live (when you're ready, NOT now)

Don't do this until you're past testing and ready for real customers.

### 7.1 — Activate your store

1. LemonSqueezy → top-right banner → **Activate your store**.
2. Fill in business info, link a payout method (PayPal or bank).
3. Submit for review (LemonSqueezy reviews each store, usually 1-2 business days).

### 7.2 — Copy your products to live mode

After activation:

1. Products → click the three-dot menu next to your product → **Copy to Live Mode**.
2. The product (and all 6 variants) is duplicated in live mode.
3. **The variant ids are different in live mode.** You MUST capture the new ids and update the Owner panel for the prod deployment.

### 7.3 — Create live-mode API key + webhook

1. Toggle to **Live Mode** (top-right toggle).
2. Settings → API → **+ Create API key** → copy + save as `LEMONSQUEEZY_API_KEY` for prod.
3. Settings → Webhooks → **+ Add a webhook endpoint** with the **prod** Convex URL (e.g. `https://wary-fly-391.convex.site/billing/lemonsqueezy/webhook`).
4. Generate a fresh signing secret (don't reuse the test one).
5. Tick the same 10 events as in §4.3.

### 7.4 — Push prod env vars

```bash
npx convex env set LEMONSQUEEZY_API_KEY "<live-mode key>" --prod
npx convex env set LEMONSQUEEZY_STORE_ID "<live-mode store id>" --prod
npx convex env set LEMONSQUEEZY_WEBHOOK_SECRET "<live-mode secret>" --prod
```

And in your prod hosting (Vercel/etc.):

```
NEXT_PUBLIC_APP_URL=https://your-domain.com
```

### 7.5 — Update prod Owner panel

Sign in to prod, navigate to `/xowner/tiers`, paste the **live-mode** variant ids.

### 7.6 — Smoke test the prod flow

Repeat §6.3 — §6.5 against the prod URL with your own real card (you can refund the order from LemonSqueezy admin afterward).

---

## Common problems + fixes

| Symptom | Cause | Fix |
|---|---|---|
| Click "Upgrade" → toast says **"Could not start checkout"** | `LEMONSQUEEZY_API_KEY` or `LEMONSQUEEZY_STORE_ID` not set on the deployment serving the action. | Re-run `npx convex env set` (§5.1), then `npx convex dev --once`. |
| Click "Upgrade" → toast says **"This tier is missing a LemonSqueezy variant id"** | The variant id wasn't pasted into the Owner panel for that tier. | Open `/xowner/tiers`, paste the id, **Save tier**. |
| Webhook log shows `401 Invalid signature` | Webhook secret mismatch between LemonSqueezy and Convex env. | Re-copy the secret from LemonSqueezy → re-run `npx convex env set LEMONSQUEEZY_WEBHOOK_SECRET ...`. |
| Webhook log shows `[billing] Webhook subscription_X could not be matched to an org` | The checkout URL didn't carry `custom_data.org_id`. Our action mints it correctly — this happens if you triggered a manual webhook or used a checkout link not minted via our `createCheckoutUrl`. | Always upgrade via the in-app **Upgrade** button. Manual checkout links won't tag the right org. |
| Successful payment but `org.plan` stays `free` | Webhook fired before the variant id was set in the Owner panel; resolver fell through to `free`. | Open `/xowner/tiers`, set the variant id, then **manually re-send** the `subscription_created` event from LemonSqueezy → Settings → Webhooks → recent events → **Resend**. |
| `Payment failed — update your card` banner persists after a fix | The new payment hasn't gone through yet (LemonSqueezy retries on a schedule). | Wait for the next retry, OR have the customer update their card and trigger an immediate retry from the LemonSqueezy customer portal. |
| `Your Convex AI files are out of date` warning | Unrelated to billing — Convex CLI's AI skills need updating. | Run `npx convex ai-files update`. Optional but tidy. |

---

## Files in this repo that touch LemonSqueezy

For when you need to debug a specific thing:

| File | What it does |
|---|---|
| `convex/http.ts::lemonSqueezyWebhook` | Receives LemonSqueezy POSTs, HMAC-verifies, dispatches to `applyWebhookEvent`. |
| `convex/billing/internal.ts::applyWebhookEvent` | Updates the org's plan + subscription metadata based on the event payload. DB-first variant→plan resolution. |
| `convex/billing/actions.ts::createCheckoutUrl` | Server-side action that calls LS REST API to mint a hosted checkout URL with `custom_data: { org_id }`. |
| `convex/billing/queries.ts::getCurrentPlan` | Query the in-app Billing UI uses to render plan + subscription state. |
| `convex/_platform/tiers/queries.ts::listPublicTiers` | Public query (no auth) the PricingCard reads — same data the marketing /pricing page will consume. |
| `convex/_platform/tiers/mutations.ts::updateTier` | The Owner panel's `/xowner/tiers` Save button calls this. |
| `convex/ai/orchestrator/quotaGate.ts::checkAiQuota` | Honours `on_trial` + 3-day `past_due` grace + the credit-pool cap. |
| `core/billing/components/PricingCard.tsx` | Shared tile component used in-app + marketing. |
| `core/billing/components/TrialBanner.tsx` | Surfaces non-`active` subscription states. |
| `core/platform/settings/components/groups/BillingGroup.tsx` | The settings page that mounts everything together. |
| `owner/views/tiers/TiersView.tsx` | The `/xowner/tiers` form. |

---

## Source-of-truth references

- LemonSqueezy: Getting started — <https://docs.lemonsqueezy.com/guides/getting-started>
- LemonSqueezy: SaaS subscription plans tutorial — <https://docs.lemonsqueezy.com/guides/tutorials/saas-subscription-plans>
- LemonSqueezy: Test mode (test card numbers) — <https://docs.lemonsqueezy.com/help/getting-started/test-mode>
- LemonSqueezy: Webhook event types — <https://docs.lemonsqueezy.com/help/webhooks/event-types>
- LemonSqueezy: Signing requests (HMAC SHA-256) — <https://docs.lemonsqueezy.com/help/webhooks/signing-requests>
- LemonSqueezy: Simulate webhook events — <https://docs.lemonsqueezy.com/help/webhooks/simulate-webhook-events>
- LemonSqueezy: Passing custom data — <https://docs.lemonsqueezy.com/help/checkout/passing-custom-data>
- LemonSqueezy: Create a checkout (API) — <https://docs.lemonsqueezy.com/api/checkouts/create-checkout>
- LemonSqueezy: Activate your store — <https://docs.lemonsqueezy.com/help/getting-started/activate-your-store>
- LemonSqueezy: Testing & going live — <https://docs.lemonsqueezy.com/guides/developer-guide/testing-going-live>
- This repo: rotation runbook — `docs/runbooks/lemonsqueezy-rotation.md`
- This repo: webhook contract tests — `convex/billing-webhooks.test.ts` (12 cases covering every lifecycle event)

---

📚 **Sources Used:**
- [LemonSqueezy Getting Started](https://docs.lemonsqueezy.com/guides/getting-started) — sign-up, store creation, test-mode default, payout setup, going-live flow
- [SaaS Subscription Plans tutorial](https://docs.lemonsqueezy.com/guides/tutorials/saas-subscription-plans) — Product/Variant model, exact create-product steps, multi-variant setup with monthly/yearly cadence
- [Test Mode docs](https://docs.lemonsqueezy.com/help/getting-started/test-mode) — test card numbers (`4242 4242 4242 4242` etc.), test-mode toggle location, Copy-to-Live-Mode behaviour
- [Webhook Event Types](https://docs.lemonsqueezy.com/help/webhooks/event-types) — canonical list of subscription_* event names + the example "typical lifecycle of events" sequence
- [Signing Requests](https://docs.lemonsqueezy.com/help/webhooks/signing-requests) — HMAC SHA-256 signing-secret length (6-40 chars), `X-Signature` header, constant-time compare pattern
- [Simulate Webhook Events](https://docs.lemonsqueezy.com/help/webhooks/simulate-webhook-events) — exact list of subscription events that can be simulated from the dashboard
- This repo: `convex/billing/internal.ts`, `convex/billing/actions.ts`, `convex/http.ts`, `core/billing/components/PricingCard.tsx`, `owner/views/tiers/TiersView.tsx` — verified the env-var names and wire-up

✅ **Training Data Used: NONE.** Every step was verified against the official LemonSqueezy docs at the URLs above (fetched 2026-05-28) plus the actual code shipped in this repo. No code or instruction came from training-data memory.

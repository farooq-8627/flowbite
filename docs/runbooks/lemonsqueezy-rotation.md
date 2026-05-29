# LemonSqueezy signing-secret rotation runbook

> **Last updated:** 2026-05-27 (P0.1.4 — `PENDING.md`).
> **Owner of the affected systems:** `convex/billing/`, `convex/http.ts`.

## When to run this

- Quarterly secret rotation per the team's secrets policy.
- Suspected compromise (a third party may have seen a webhook secret).
- Migrating from a test-mode webhook to a production-mode webhook.

## Prerequisites

You need:

- LemonSqueezy admin access for the store.
- Access to the Convex production deployment dashboard (`https://dashboard.convex.dev/...`).
- A way to trigger a test event from LemonSqueezy (the dashboard's "Send test webhook" button is enough).

## Concept

The webhook handler lives at `convex/http.ts::lemonSqueezyWebhook`. It HMAC-verifies every payload against the secret stored in the Convex env var **`LEMONSQUEEZY_WEBHOOK_SECRET`**. Any change to that secret on the LemonSqueezy side MUST be paired with a matching change on the Convex side, otherwise inbound webhooks 401 and LemonSqueezy enters a retry loop.

There is no application-level dual-secret window — Convex env vars are atomic — so the rotation is a brief blackout window for webhook delivery. LemonSqueezy retries failed webhooks for up to 3 days, so keep the blackout under that.

## Procedure

### 1. Generate the new secret in LemonSqueezy

1. Go to **LemonSqueezy → Settings → Webhooks**.
2. Find the row for the deployment (production or staging).
3. Click **Edit**.
4. Click **Regenerate signing secret**. **DO NOT save yet.**
5. Copy the new secret to your clipboard. LemonSqueezy will display it once.

### 2. Update Convex env var FIRST

Update Convex BEFORE saving on the LemonSqueezy side. Reason: if you save on LemonSqueezy first, the gap between the two updates is a window where every inbound webhook 401s.

```bash
npx convex env set LEMONSQUEEZY_WEBHOOK_SECRET <new-secret> --prod
```

(For staging, omit `--prod` or pass `--deployment dev`.)

### 3. Save on LemonSqueezy

1. Switch back to the LemonSqueezy **Edit Webhook** modal.
2. Click **Save**.

### 4. Verify the next event arrives

Trigger a test webhook from LemonSqueezy:

1. **LemonSqueezy → Settings → Webhooks → Edit → Send test event**.
2. Choose `subscription_updated` (it's idempotent on our side).
3. Confirm in the LemonSqueezy webhook log that the response is 200.
4. Confirm in the Convex logs that `applyWebhookEvent` ran.

```bash
npx convex logs --prod --limit 20 | grep billing
```

If you see 401 responses in the LemonSqueezy log, the secret didn't update. Re-run step 2 and confirm via:

```bash
npx convex env get LEMONSQUEEZY_WEBHOOK_SECRET --prod | head -c 12
```

(The first 12 characters should match what you just generated.)

### 5. Confirm a real event lands cleanly

Within the next billing cycle (or immediately for new test signups):

1. Have a teammate trigger a real subscription event in LemonSqueezy test mode (subscribe → cancel).
2. Watch the org doc in Convex update via the `subscriptionStatus` field.

```js
// In the Convex dashboard's `Run` panel:
import { internal } from "convex/_generated/api";
const orgs = await ctx.db.query("orgs")
  .withIndex("by_lemonSqueezyCustomerId")
  .collect();
return orgs.map(o => ({ slug: o.slug, status: o.lemonSqueezySubscriptionStatus }));
```

## Rollback

If step 3 (LemonSqueezy save) succeeded but step 2 (Convex env) was wrong (typo, wrong deployment), webhooks will 401 until you fix the env var. To rollback:

1. Re-run `npx convex env set LEMONSQUEEZY_WEBHOOK_SECRET <correct-value>` on the right deployment.
2. LemonSqueezy retries failed webhooks for up to 3 days, so missed events are not lost. Re-trigger anything that's time-sensitive (e.g. a customer's stalled subscription_created) via LemonSqueezy's webhook log → **Resend**.

## Related env vars (read-only — do NOT rotate without coordination)

These also live in Convex env vars and are read by `convex/billing/`:

- `LEMONSQUEEZY_API_KEY` — used by `createCheckoutUrl` to mint hosted checkout URLs. Rotated separately when the LS API key is regenerated.
- `LEMONSQUEEZY_STORE_ID` — non-sensitive but environment-specific.
- `LEMONSQUEEZY_VARIANT_STARTER`, `LEMONSQUEEZY_VARIANT_PRO`, `LEMONSQUEEZY_VARIANT_ENTERPRISE` — legacy variant id mapping. Variant ids should now live on `platformTiers.lemonSqueezyVariantIdMonthly` / `*Yearly` (set via the owner panel at `/xowner/tiers`); the env vars are only the fallback.

## Production checklist (one-time)

Before going live to paid signups:

- [ ] `LEMONSQUEEZY_WEBHOOK_SECRET` is set on the **prod** Convex deployment.
- [ ] `LEMONSQUEEZY_API_KEY` is set on the **prod** Convex deployment.
- [ ] `LEMONSQUEEZY_STORE_ID` is set on the **prod** Convex deployment.
- [ ] Each tier's variant id is set under `/xowner/tiers` for the **prod** deployment (or the `LEMONSQUEEZY_VARIANT_*` env vars are set as fallback).
- [ ] One full subscription_created → subscription_updated → subscription_payment_failed → subscription_payment_recovered → subscription_cancelled lifecycle has been exercised in test mode and verified end-to-end via the dashboard.
- [ ] `convex/billing-webhooks.test.ts` passes locally (`pnpm test convex/billing-webhooks.test.ts`).

# 10 — Payments (Stripe)

> Stripe handles all money. We use the `@convex-dev/stripe` component for subscriptions and checkout. The base handles plans and billing. Features check the plan to gate access.

---

## Architecture

```
Browser                 Convex Action              Stripe
  │                        │                         │
  ├── createCheckout() ──>│── Stripe API ──────────>│
  │<── checkout URL ───────┤<── session ─────────────┤
  │── redirect to Stripe ─┼─────────────────────────>│
  │<── redirect back ──────┤                         │
  │                        │                         │
  │                        │<── webhook event ───────┤
  │                        ├── update subscription ──│
  │<── reactive update ────┤                         │
```

---

## Setup with `@convex-dev/stripe`

### Install & Configure

```ts
// convex/http.ts
import { httpRouter } from "convex/server";
import { auth } from "./auth";
import { registerRoutes } from "@convex-dev/stripe";
import { components } from "./_generated/api";

const http = httpRouter();

auth.addHttpRoutes(http);

// Register Stripe webhook handler
registerRoutes(http, components.stripe, {
  webhookPath: "/stripe/webhook",
  events: {
    "customer.subscription.updated": async (ctx, event) => {
      // Custom: update org plan based on subscription
      const subscription = event.data.object;
      const metadata = subscription.metadata;
      if (metadata?.orgId) {
        await ctx.runMutation(internal.payments.webhookHandlers.syncSubscription, {
          orgId: metadata.orgId,
          stripeSubscriptionId: subscription.id,
          status: subscription.status,
        });
      }
    },
  },
});

export default http;
```

### Checkout Session

```ts
// convex/payments/actions.ts
"use node";
import { internalAction } from "../_generated/server";
import { v } from "convex/values";
import { StripeSubscriptions } from "@convex-dev/stripe";
import { components } from "../_generated/api";

const stripe = new StripeSubscriptions(components.stripe, {});

export const createCheckoutSession = internalAction({
  args: {
    orgId: v.id("orgs"),
    userId: v.string(),
    userEmail: v.string(),
    priceId: v.string(),
  },
  handler: async (ctx, args) => {
    const customer = await stripe.getOrCreateCustomer(ctx, {
      userId: args.userId,
      email: args.userEmail,
    });

    const session = await stripe.createCheckoutSession(ctx, {
      priceId: args.priceId,
      customerId: customer.customerId,
      mode: "subscription",
      successUrl: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/settings/billing?success=true`,
      cancelUrl: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/settings/billing?canceled=true`,
      subscriptionMetadata: {
        orgId: args.orgId,
        userId: args.userId,
      },
    });

    return session;
  },
});
```

---

## Plan Checking

```ts
// convex/orgs/helpers.ts
export function isPlanAtLeast(
  orgPlan: string,
  requiredPlan: string,
): boolean {
  const planOrder = ["free", "starter", "pro", "enterprise"];
  return planOrder.indexOf(orgPlan) >= planOrder.indexOf(requiredPlan);
}

// Usage in a mutation:
if (!isPlanAtLeast(ctx.org.plan, "pro")) {
  throw new Error("Pro plan required for this feature");
}
```

### Frontend Plan Gate

```tsx
export function PlanGate({
  plan,
  children,
  fallback,
}: {
  plan: string;
  children: React.ReactNode;
  fallback?: React.ReactNode;
}) {
  const { org } = useCurrentUser();
  if (!org || !isPlanAtLeast(org.plan, plan)) return <>{fallback}</>;
  return <>{children}</>;
}
```

---

## Billing Page

Located at `/dashboard/settings/billing`. Shows:
- Current plan
- Subscription status
- Upgrade/downgrade buttons → Stripe Checkout
- Billing portal link → Stripe Customer Portal
- Invoice history

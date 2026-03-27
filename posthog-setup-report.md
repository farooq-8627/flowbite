# PostHog Integration Report

## Summary

PostHog analytics has been integrated into this Next.js 16 (App Router) + Convex + Convex Auth project. The integration uses `posthog-js` for client-side tracking and `posthog-node` for server-side usage. Initialization follows the Next.js 15.3+ `instrumentation-client.ts` pattern — no React provider component is required.

## Integration Details

| Item | Value |
|---|---|
| PostHog Host | `https://us.i.posthog.com` |
| Ingestion Proxy | `/ingest/*` → PostHog (via `next.config.ts` rewrites) |
| Client init file | `instrumentation-client.ts` |
| Server client | `lib/posthog-server.ts` |
| Exception capture | Enabled (`capture_exceptions: true`) |

## Files Changed

| File | Change |
|---|---|
| `instrumentation-client.ts` | Created — PostHog client-side initialization |
| `lib/posthog-server.ts` | Created — PostHog server-side singleton |
| `next.config.ts` | Added reverse proxy rewrites + `skipTrailingSlashRedirect` |
| `.env.local` | Added `NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN` and `NEXT_PUBLIC_POSTHOG_HOST` |
| `app/signin/page.tsx` | Added sign-in/sign-up/failure events and `posthog.identify()` |
| `app/page.tsx` | Added sign-out event + `posthog.reset()`, number generation event |
| `app/server/inner.tsx` | Added number generation event |

## Tracked Events

| Event | Description | File | Properties |
|---|---|---|---|
| `user_signed_in` | User successfully signed in | `app/signin/page.tsx` | `email` |
| `user_signed_up` | User created a new account | `app/signin/page.tsx` | `email` |
| `sign_in_failed` | Authentication error occurred | `app/signin/page.tsx` | `flow`, `error_message` |
| `user_signed_out` | Authenticated user signed out | `app/page.tsx` | — |
| `number_generated` | Random number generated (home page) | `app/page.tsx` | `value`, `viewer` |
| `number_generated` | Random number generated (server page) | `app/server/inner.tsx` | `value`, `source: "server_page"` |

## User Identification

- `posthog.identify(email, { email })` is called on successful sign-in or sign-up
- `posthog.reset()` is called on sign-out to clear the PostHog identity

## PostHog Dashboard

**Dashboard:** [Analytics basics](https://us.posthog.com/project/359452/dashboard/1406503)

### Insights

| Insight | Type | URL |
|---|---|---|
| Sign-ins and Sign-ups over time | Trend | https://us.posthog.com/project/359452/insights/3xom3FKk |
| Sign-up to Engagement Funnel | Funnel | https://us.posthog.com/project/359452/insights/PHiroiBq |
| Sign-in Failures over time | Trend | https://us.posthog.com/project/359452/insights/lsUYJwZN |
| Sign-outs (Churn Signal) | Trend | https://us.posthog.com/project/359452/insights/hp0m1Ow7 |
| Number Generator Activity | Trend | https://us.posthog.com/project/359452/insights/UpeIVRFd |

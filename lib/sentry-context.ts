/**
 * Sentry context helpers — bind the signed-in user and active org to the
 * browser-side Sentry scope so every captured exception is attributable
 * to a real session.
 *
 * Why this exists
 * ───────────────
 * `Sentry.init` (in `sentry.client.config.ts`) doesn't know who the user
 * is — auth happens later, after the bundle has loaded. Without this
 * wiring, every error in Sentry shows `User: anonymous`, which makes
 * triage painful: "is one user hitting this 500 times or are 500 users
 * hitting it once?" can't be answered.
 *
 * What it does
 * ────────────
 *   - `setSentryUser({ id, email, name })` — attaches user identity to the
 *     Sentry scope. Subsequent `Sentry.captureException` calls (including
 *     from React error boundaries) will tag events with the user.
 *   - `clearSentryUser()` — called from sign-out so post-sign-out errors
 *     aren't mis-attributed to the previous user.
 *   - `setSentryOrg({ id, slug, plan })` — adds the active workspace as a
 *     Sentry tag + context. Lets us filter Sentry by `tag:orgId` (e.g.
 *     "show me every error from org X over the last 7 days") and
 *     correlates with billing / support inquiries.
 *
 * Privacy
 * ───────
 * `setUser` ships the user's `email` only when `sendDefaultPii` is on
 * (production default = off). When PII is off Sentry replaces the email
 * with a hash before storing, per their docs. The `id` (Convex `_id`) is
 * always sent — it's the canonical ID of record across our backend logs,
 * Convex insights, and PostHog.
 *
 * No-op when Sentry DSN is unset
 * ──────────────────────────────
 * `Sentry.setUser`, `setTag`, etc. are no-ops if `Sentry.init` was never
 * called (DSN unset). Safe to call unconditionally from the auth wiring
 * — adding a guard would just add cost.
 */
import * as Sentry from "@sentry/nextjs";

export function setSentryUser(user: {
	id: string;
	email?: string | null;
	name?: string | null;
}): void {
	Sentry.setUser({
		id: user.id,
		...(user.email ? { email: user.email } : {}),
		...(user.name ? { username: user.name } : {}),
	});
}

export function clearSentryUser(): void {
	Sentry.setUser(null);
}

export function setSentryOrg(org: { id: string; slug: string; plan?: string | null }): void {
	// Tags are indexed and filterable in the Sentry UI — drop the most
	// useful identifiers there. The full doc lives in `context` below.
	Sentry.setTag("orgId", org.id);
	Sentry.setTag("orgSlug", org.slug);
	if (org.plan) Sentry.setTag("orgPlan", org.plan);
	Sentry.setContext("organization", {
		id: org.id,
		slug: org.slug,
		plan: org.plan ?? "unknown",
	});
}

export function clearSentryOrg(): void {
	Sentry.setTag("orgId", undefined);
	Sentry.setTag("orgSlug", undefined);
	Sentry.setTag("orgPlan", undefined);
	Sentry.setContext("organization", null);
}

/**
 * Migration — flip `users.onboardingCompleted = true` for any user who
 * already belongs to an org (2026-05-21).
 *
 * What
 * ────
 * Iterates the `users` table and for every user whose `onboardingCompleted`
 * is `false` AND who has at least one ACTIVE row in `orgMembers`, patches
 * `onboardingCompleted = true`. Idempotent — users that are already
 * onboarded or that have no active memberships are skipped.
 *
 * Why
 * ───
 * Before this date, `convex/invitations/mutations.ts#accept` did not flip
 * `users.onboardingCompleted`. Invited users therefore remained at
 * `onboardingCompleted: false` even after joining an org. The dashboard
 * layout's `<OnboardingGuard>` then fired `redirect("/onboarding")` on
 * every load — and a sibling React `<ErrorBoundary>` used to catch that
 * `NEXT_REDIRECT` and render "Something went wrong" instead of letting
 * the navigation happen.
 *
 * Both root causes are now fixed (the boundary passes through Next.js
 * navigation signals via `unstable_rethrow`, and `accept` patches the
 * flag on every join). This migration repairs users who are still in
 * the broken state from earlier accepts.
 *
 * Behaviour
 * ─────────
 * - Iterates users in batches.
 * - For each `onboardingCompleted: false` user:
 *     - Reads their `orgMembers` rows via `by_userId` index.
 *     - Skips if no ACTIVE membership exists (deletedAt undefined).
 *     - Otherwise patches `onboardingCompleted: true` + `updatedAt`.
 * - Idempotent: safe to run multiple times.
 *
 * Usage
 * ─────
 *   npx convex run _migrations/markOnboardedFromMembership:run '{}'
 *
 * Re-run safe. Returns counts: { scanned, patched, skippedNoMembership, skippedAlreadyComplete }.
 */

import { internalMutation } from "../_generated/server";

const PAGE_SIZE = 500;

export const run = internalMutation({
	args: {},
	handler: async (ctx) => {
		let scanned = 0;
		let patched = 0;
		let skippedNoMembership = 0;
		let skippedAlreadyComplete = 0;

		const users = await ctx.db.query("users").take(PAGE_SIZE * 50);
		// 25k users is plenty for any realistic deployment; bump the
		// multiplier if your deployment ever exceeds that.

		const now = Date.now();

		for (const user of users) {
			scanned += 1;

			if (user.onboardingCompleted) {
				skippedAlreadyComplete += 1;
				continue;
			}

			const memberships = await ctx.db
				.query("orgMembers")
				.withIndex("by_userId", (q) => q.eq("userId", user._id))
				.collect();
			const hasActive = memberships.some((m) => m.deletedAt === undefined);

			if (!hasActive) {
				skippedNoMembership += 1;
				continue;
			}

			await ctx.db.patch(user._id, {
				onboardingCompleted: true,
				updatedAt: now,
			});
			patched += 1;
		}

		return {
			scanned,
			patched,
			skippedNoMembership,
			skippedAlreadyComplete,
		};
	},
});

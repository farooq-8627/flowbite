/**
 * S8 of the AI tooling rebuild — approvals → autonomy migration.
 *
 * Two passes in one mutation (both idempotent, both honour `dryRun`):
 *
 *   1. USERS — strip the now-vestigial `preferences.aiApprovals` slot
 *      from every user. Replaced by `org.settings.aiAutonomy` (org-policy)
 *      + the V2 risk gate at `convex/ai/registry/gate.ts` (per-call
 *      channel + risk + 2FA fence). The schema validator keeps the field
 *      optional during this migration window so existing rows pass
 *      validation; once this has run on prod, the validator field can be
 *      removed in a follow-up (Future-Enhancements §H).
 *
 *   2. ORGS — seed defaults on `settings.aiAutonomy` for orgs that have
 *      no slot yet. Defaults: `autoActFromConversations: true`,
 *      `destructiveRequires2FA: true` (read-only — pinned by the gate),
 *      `whatsappAgentEnabled: false` (off until the org has the
 *      `ai.whatsappAgent` permission + Twilio sender). Existing
 *      autonomy rows are NEVER overwritten.
 *
 * Trigger
 * ───────
 *   npx convex run _migrations/2026_06_04_approvalsToAutonomy:run '{"dryRun": true}'
 *   (preview)
 *   npx convex run _migrations/2026_06_04_approvalsToAutonomy:run '{}'
 *   (apply)
 *
 * Idempotent — re-running on a clean DB returns `usersPatched: 0` and
 * `orgsPatched: 0`.
 */

import { v } from "convex/values";
import { internalMutation } from "../_generated/server";

export const run = internalMutation({
	args: { dryRun: v.optional(v.boolean()) },
	handler: async (ctx, args) => {
		const dryRun = args.dryRun === true;
		const now = Date.now();

		// ── 1. Strip users.preferences.aiApprovals ─────────────────
		const users = await ctx.db.query("users").collect();
		let usersScanned = 0;
		let usersPatched = 0;
		let usersAlreadyClean = 0;
		const userSamples: Array<{ email: string }> = [];

		for (const user of users) {
			usersScanned += 1;
			const prefs = user.preferences;
			if (!prefs || prefs.aiApprovals === undefined) {
				usersAlreadyClean += 1;
				continue;
			}
			if (userSamples.length < 10) userSamples.push({ email: user.email });
			if (!dryRun) {
				const { aiApprovals: _drop, ...nextPrefs } = prefs;
				await ctx.db.patch(user._id, {
					preferences: nextPrefs,
					updatedAt: now,
				});
			}
			usersPatched += 1;
		}

		// ── 2. Seed org.settings.aiAutonomy defaults ───────────────
		const orgs = await ctx.db.query("orgs").collect();
		let orgsScanned = 0;
		let orgsPatched = 0;
		let orgsAlreadySet = 0;
		const orgSamples: Array<{ orgSlug: string }> = [];

		for (const org of orgs) {
			orgsScanned += 1;
			const settings = (org.settings ?? {}) as { aiAutonomy?: Record<string, unknown> };
			if (settings.aiAutonomy !== undefined) {
				orgsAlreadySet += 1;
				continue;
			}
			if (orgSamples.length < 10) orgSamples.push({ orgSlug: org.slug });
			if (!dryRun) {
				await ctx.db.patch(org._id, {
					settings: {
						...settings,
						aiAutonomy: {
							autoActFromConversations: true,
							destructiveRequires2FA: true,
							whatsappAgentEnabled: false,
						},
					},
					updatedAt: now,
				});
			}
			orgsPatched += 1;
		}

		return {
			dryRun,
			users: {
				scanned: usersScanned,
				patched: usersPatched,
				alreadyClean: usersAlreadyClean,
				samples: userSamples,
			},
			orgs: {
				scanned: orgsScanned,
				patched: orgsPatched,
				alreadySet: orgsAlreadySet,
				samples: orgSamples,
			},
		};
	},
});

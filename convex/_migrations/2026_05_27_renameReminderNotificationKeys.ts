/**
 * Migration — Stage 4D follow-up: rename
 * `users.notificationPreferences.reminder_due` → `task_due` and
 * `users.notificationPreferences.reminder_overdue` → `task_overdue`.
 *
 * Closes G9 of P1.6.A (PENDING.md). Decision #5 of TASKS-RENAME-PLAN.md
 * locks in ONE verb family for the post-rename surface (`task_*`); the
 * notification preference catalog still carried the legacy `reminder_*`
 * keys after the Stage 4D closeout. The catalog edit and this migration
 * land in the same commit so the validator never rejects existing
 * `users.notificationPreferences` rows.
 *
 * Behaviour
 * ─────────
 *   - Walks every `users` row.
 *   - Reads the boolean value stored under `reminder_due` /
 *     `reminder_overdue` (when present) and copies it to `task_due` /
 *     `task_overdue`.
 *   - Drops the legacy keys.
 *   - Idempotent: when both keys already exist, the new key wins
 *     (preserves the most recent edit). When only the new key exists,
 *     the row is skipped.
 *
 * How to run
 * ──────────
 *   npx convex run _migrations/2026_05_27_renameReminderNotificationKeys:run '{}'
 *
 * Or dry-run first (counts only, no writes):
 *   npx convex run _migrations/2026_05_27_renameReminderNotificationKeys:run \
 *     '{ "dryRun": true }'
 */
// biome-ignore-all lint/suspicious/noExplicitAny: legacy `reminder_due` / `reminder_overdue` keys are dropped from the schema in the same edit; the cast lets the migration read the historical values before the schema change takes effect.

import { v } from "convex/values";
import { internalMutation } from "../_generated/server";

const KEY_RENAMES: Record<string, string> = {
	reminder_due: "task_due",
	reminder_overdue: "task_overdue",
};

export const run = internalMutation({
	args: {
		dryRun: v.optional(v.boolean()),
	},
	handler: async (ctx, args) => {
		const dryRun = args.dryRun ?? false;

		const users = await ctx.db.query("users").collect();

		let scanned = 0;
		let patched = 0;
		let alreadyClean = 0;

		for (const user of users) {
			scanned++;
			const prefs = (user.notificationPreferences ?? {}) as Record<
				string,
				boolean | undefined
			>;
			let dirty = false;
			const next: Record<string, boolean> = {};

			// First, copy across every key that is NOT a legacy rename target.
			for (const [k, val] of Object.entries(prefs)) {
				if (k in KEY_RENAMES) continue;
				if (typeof val === "boolean") next[k] = val;
			}

			// Then walk the rename map: prefer an explicit new-key value if
			// already present (post-migration writes win); otherwise carry the
			// legacy value over.
			for (const [legacy, renamed] of Object.entries(KEY_RENAMES)) {
				const legacyVal = prefs[legacy];
				const renamedVal = prefs[renamed];
				if (legacyVal === undefined && renamedVal === undefined) continue;
				const newValue = typeof renamedVal === "boolean" ? renamedVal : legacyVal;
				if (typeof newValue === "boolean") next[renamed] = newValue;
				if (legacyVal !== undefined) dirty = true;
			}

			if (!dirty) {
				alreadyClean++;
				continue;
			}

			if (!dryRun) {
				await ctx.db.patch(user._id, {
					notificationPreferences: next,
					updatedAt: Date.now(),
				});
			}
			patched++;
		}

		return { scanned, patched, alreadyClean, dryRun };
	},
});

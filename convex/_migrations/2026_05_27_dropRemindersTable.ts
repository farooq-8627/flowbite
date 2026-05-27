/**
 * Migration — Stage 4D rename closeout (reminders → tasks).
 *
 * Stage 4D of TASKS-RENAME-PLAN.md (locked 2026-05-27). One idempotent
 * mutation that lands every breaking edit the rename needs in production
 * data. Per Decision #2 ("existing reminders data is throwaway") the
 * rename is a clean cut — no row-level backfill into `tasks`.
 *
 * What this migration does
 * ────────────────────────
 *  1. Hard-deletes every `reminders` row (table is dropped from the
 *     schema in the same Stage 4D edit; dropping the schema definition
 *     while rows still exist would fail validation).
 *  2. Hard-deletes every `entityCodeCounters` row whose `entityType ===
 *     "followup"`. The follow-up counter is no longer referenced; the
 *     `task` counter (already in `_shared/recordCodes.ts::DEFAULT_PREFIXES`)
 *     takes its place from `tasks/mutations.ts::createImpl`.
 *  3. Walks every `orgRoles` row and rewrites the `permissions` array:
 *     `reminders.view` → `tasks.view`, `reminders.create` → `tasks.create`,
 *     `reminders.manage` → `tasks.manage`. Members lose nothing — every
 *     historical reminders permission flips into the equivalent tasks key.
 *  4. Walks every `orgs` row and clears the dormant settings blocks the
 *     rename retired:
 *       - `org.settings.followupDefaults` (replaced by `taskDefaults`)
 *       - `org.settings.reminderDefaults` (now superseded by per-user
 *         briefing config + `taskDefaults`)
 *       - `org.settings.codePrefixes.followup` (replaced by `task`).
 *
 * Idempotent — re-running is safe and a no-op once every row is in the
 * new shape. Designed to be the FINAL data-side step before the schema
 * definitions for `reminders` + `followupDefaults` + `reminderDefaults`
 * + `codePrefixes.followup` come out of `convex/schema/*.ts`.
 *
 * How to run
 * ──────────
 *   npx convex run _migrations/2026_05_27_dropRemindersTable:run '{}'
 *
 * Or scoped to one org:
 *   npx convex run _migrations/2026_05_27_dropRemindersTable:run \
 *     '{ "orgId": "<convex-org-id>" }'
 *
 * Or dry-run first (counts only, no writes):
 *   npx convex run _migrations/2026_05_27_dropRemindersTable:run \
 *     '{ "dryRun": true }'
 */
// biome-ignore-all lint/suspicious/noExplicitAny: legacy `reminders` table is dropped from the schema in the same Stage 4D edit; the casts here let the migration query it via the runtime DB before the schema change takes effect.

import { v } from "convex/values";
import { internalMutation } from "../_generated/server";

const PERMISSION_RENAMES: Record<string, string> = {
	"reminders.view": "tasks.view",
	"reminders.create": "tasks.create",
	"reminders.manage": "tasks.manage",
};

export const run = internalMutation({
	args: {
		/** Optional — restrict to a single org for staged rollout. */
		orgId: v.optional(v.id("orgs")),
		dryRun: v.optional(v.boolean()),
	},
	handler: async (ctx, args) => {
		const dryRun = args.dryRun ?? false;

		// ── Reminders rows ───────────────────────────────────────────
		const reminders = args.orgId
			? await (ctx.db.query as any)("reminders")
					.withIndex("by_org_and_due", (q: any) => q.eq("orgId", args.orgId!))
					.collect()
			: await (ctx.db.query as any)("reminders").collect();

		let remindersDeleted = 0;
		for (const r of reminders) {
			if (!dryRun) await ctx.db.delete(r._id);
			remindersDeleted++;
		}

		// ── Followup counters ───────────────────────────────────────
		const followupCounters = args.orgId
			? await ctx.db
					.query("entityCodeCounters")
					.withIndex("by_org_and_type", (q) =>
						q.eq("orgId", args.orgId!).eq("entityType", "followup"),
					)
					.collect()
			: (await ctx.db.query("entityCodeCounters").collect()).filter(
					(c) => c.entityType === "followup",
				);

		let countersDeleted = 0;
		for (const c of followupCounters) {
			if (!dryRun) await ctx.db.delete(c._id);
			countersDeleted++;
		}

		// ── orgRoles permission rename: reminders.X → tasks.X ───────
		const orgRoles = args.orgId
			? await ctx.db
					.query("orgRoles")
					.withIndex("by_orgId", (q) => q.eq("orgId", args.orgId!))
					.collect()
			: await ctx.db.query("orgRoles").collect();

		let rolesScanned = 0;
		let rolesPatched = 0;
		for (const role of orgRoles) {
			rolesScanned++;
			let dirty = false;
			const next: string[] = [];
			const seen = new Set<string>();
			for (const p of role.permissions) {
				const renamed = PERMISSION_RENAMES[p] ?? p;
				if (renamed !== p) dirty = true;
				if (!seen.has(renamed)) {
					seen.add(renamed);
					next.push(renamed);
				}
			}
			if (dirty) {
				if (!dryRun) {
					await ctx.db.patch(role._id, {
						permissions: next,
						updatedAt: Date.now(),
					});
				}
				rolesPatched++;
			}
		}

		// ── org settings cleanup ────────────────────────────────────
		const orgs = args.orgId
			? [await ctx.db.get(args.orgId)]
			: await ctx.db.query("orgs").collect();

		let orgsScanned = 0;
		let orgsPatched = 0;
		for (const org of orgs) {
			if (!org) continue;
			orgsScanned++;
			const settings = (org.settings ?? {}) as Record<string, unknown> & {
				codePrefixes?: { followup?: string };
				followupDefaults?: unknown;
				reminderDefaults?: unknown;
			};

			let dirty = false;
			const nextSettings: Record<string, unknown> = { ...settings };

			if ("followupDefaults" in nextSettings) {
				delete nextSettings.followupDefaults;
				dirty = true;
			}
			if ("reminderDefaults" in nextSettings) {
				delete nextSettings.reminderDefaults;
				dirty = true;
			}
			if (settings.codePrefixes && "followup" in settings.codePrefixes) {
				const { followup: _drop, ...rest } = settings.codePrefixes;
				if (Object.keys(rest).length === 0) {
					delete nextSettings.codePrefixes;
				} else {
					nextSettings.codePrefixes = rest;
				}
				dirty = true;
			}

			if (dirty) {
				if (!dryRun) {
					await ctx.db.patch(org._id, {
						settings: nextSettings,
						updatedAt: Date.now(),
					});
				}
				orgsPatched++;
			}
		}

		return {
			remindersScanned: reminders.length,
			remindersDeleted,
			followupCountersScanned: followupCounters.length,
			followupCountersDeleted: countersDeleted,
			rolesScanned,
			rolesPatched,
			orgsScanned,
			orgsPatched,
			scope: args.orgId ? `org:${args.orgId}` : "all-orgs",
			dryRun,
		};
	},
});

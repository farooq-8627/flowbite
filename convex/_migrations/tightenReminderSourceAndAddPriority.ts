/**
 * Migration — tighten reminders.source + add priority/updatedAt
 *
 * 2026-05-19 — accompanies the schema change in
 * `convex/schema/crmShared.ts::reminders` that narrows `source` from a
 * free-form `v.string()` to a closed `v.union` of 6 literals
 * (`manual` | `followup` | `calendar` | `ai` | `note` | `system`) and
 * adds optional `priority` + `updatedAt` fields.
 *
 * What this migration does
 * ────────────────────────
 *   1. For every existing reminders row:
 *      - Map `source` to one of the 6 closed-union literals via SOURCE_REMAP.
 *        Unknown values fall back to `"manual"`.
 *      - Ensure `updatedAt` is set — defaults to `createdAt` if missing.
 *      - Leaves `priority` undefined unless already set (stays optional).
 *   2. Idempotent — rows that already match the new shape are skipped.
 *
 * Why source values need remapping
 * ────────────────────────────────
 * The legacy `v.string()` validator accepted anything. Audit shows the
 * codebase only ever wrote: `"manual"`, `"followup"`, `"calendar"`, `"ai"`,
 * `"note"`. To be defensive against past hand-edits or AI-introduced
 * variants like `"follow_up"` / `"follow-up"` we still remap, then fall
 * back to `"manual"` for anything truly unknown.
 *
 * How to run
 * ──────────
 *   npx convex run _migrations/tightenReminderSourceAndAddPriority:run '{}'
 *
 * Or scoped to one org:
 *   npx convex run _migrations/tightenReminderSourceAndAddPriority:run \
 *     '{ "orgId": "<convex-org-id>" }'
 */

import { v } from "convex/values";
import { internalMutation } from "../_generated/server";

const KNOWN_SOURCES = new Set([
	"manual",
	"followup",
	"calendar",
	"ai",
	"note",
	"system",
] as const);

type KnownSource = "manual" | "followup" | "calendar" | "ai" | "note" | "system";

/**
 * Map every legacy source value onto one of the 6 closed-union literals.
 * Anything not listed falls back to `"manual"`.
 */
const SOURCE_REMAP: Record<string, KnownSource> = {
	manual: "manual",
	followup: "followup",
	follow_up: "followup",
	"follow-up": "followup",
	"follow up": "followup",
	calendar: "calendar",
	ai: "ai",
	note: "note",
	system: "system",
};

function normalizeSource(raw: unknown): KnownSource {
	if (typeof raw !== "string") return "manual";
	const lower = raw.trim().toLowerCase();
	const mapped = SOURCE_REMAP[lower];
	if (mapped) return mapped;
	if (KNOWN_SOURCES.has(lower as KnownSource)) return lower as KnownSource;
	return "manual";
}

/**
 * Idempotent migration. Returns counters so re-runs surface "no work to do."
 */
export const run = internalMutation({
	args: {
		/** Optional — restrict to a single org for staged rollout. */
		orgId: v.optional(v.id("orgs")),
	},
	handler: async (ctx, args) => {
		const reminders = args.orgId
			? await ctx.db
					.query("reminders")
					.withIndex("by_org_and_due", (q) => q.eq("orgId", args.orgId!))
					.collect()
			: await ctx.db.query("reminders").collect();

		let scanned = 0;
		let patched = 0;
		let alreadyMigrated = 0;

		for (const r of reminders) {
			scanned += 1;
			const newSource = normalizeSource(r.source);
			const sourceChanged = r.source !== newSource;
			const needsUpdatedAt = r.updatedAt === undefined;

			if (!sourceChanged && !needsUpdatedAt) {
				alreadyMigrated += 1;
				continue;
			}

			await ctx.db.patch(r._id, {
				source: newSource,
				updatedAt: r.updatedAt ?? r.createdAt,
			});
			patched += 1;
		}

		return {
			scanned,
			patched,
			alreadyMigrated,
			scope: args.orgId ? `org:${args.orgId}` : "all-orgs",
		};
	},
});

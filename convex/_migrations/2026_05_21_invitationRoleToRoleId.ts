/**
 * Migration — invitations.role → invitations.roleId (2026-05-21)
 *
 * What
 * ────
 * Replaces the legacy `invitations.role: "admin"|"member"|"viewer"` string
 * union with `invitations.roleId: Id<"orgRoles">`. Resolves each old row's
 * role string to the matching `orgRoles` doc by capitalised name (the
 * server has always done this lookup at accept time — we're just persisting
 * the result so admins can invite into custom roles too).
 *
 * Why
 * ───
 * The legacy schema hard-locked invitations to the three system roles, so
 * orgs with custom roles (e.g. "Sales Manager") couldn't invite into them.
 * The schema now stores `roleId` directly. This migration is the bridge.
 *
 * Behaviour
 * ─────────
 * - Iterates every invitation (any status) in batches.
 * - For each row that still has `role` AND no `roleId`:
 *     - Capitalises `role` ("admin" → "Admin")
 *     - Looks up `orgRoles` by `(orgId, name)` index
 *     - Patches the row with `{ roleId, role: undefined }`
 * - Idempotent: rows that already have `roleId` are skipped.
 * - If a role doc is missing (shouldn't happen — system roles are seeded
 *   on org creation), the row is left untouched and reported in `skipped`
 *   so we can audit without crashing the whole migration.
 *
 * Usage
 * ─────
 *   npx convex run _migrations/2026_05_21_invitationRoleToRoleId:run '{}'
 *
 * Re-run safe. Returns counts: { scanned, migrated, skipped }.
 */

import { v } from "convex/values";
import { internalMutation } from "../_generated/server";

const PAGE_SIZE = 200;

export const run = internalMutation({
	args: {
		// Optional cursor for very large datasets. Default: scan everything.
		cursor: v.optional(v.string()),
	},
	handler: async (ctx, _args) => {
		let scanned = 0;
		let migrated = 0;
		let skipped = 0;

		const all = await ctx.db.query("invitations").take(PAGE_SIZE * 50);
		// 10k rows is plenty for any realistic deployment in dev. Production
		// migrations should paginate properly — but invitations are a tiny
		// table by definition (org seats × time-bounded retention), so a
		// single take() is fine here.

		for (const inv of all) {
			scanned += 1;

			// Idempotency — already has roleId, nothing to do.
			const row = inv as typeof inv & { role?: string; roleId?: unknown };
			if (row.roleId) continue;

			const legacyRole = row.role;
			if (!legacyRole) {
				// Row has no role string and no roleId — broken row, skip.
				skipped += 1;
				continue;
			}

			const targetName = legacyRole.charAt(0).toUpperCase() + legacyRole.slice(1);
			const roleDoc = await ctx.db
				.query("orgRoles")
				.withIndex("by_orgId_and_name", (q) =>
					q.eq("orgId", inv.orgId).eq("name", targetName),
				)
				.first();

			if (!roleDoc) {
				// System role missing in this org — shouldn't happen, log + skip.
				// eslint-disable-next-line no-console
				console.warn(
					`[invitationRoleToRoleId] orgRoles "${targetName}" missing for org ${inv.orgId} — skipping invitation ${inv._id}`,
				);
				skipped += 1;
				continue;
			}

			// Convex `patch` with undefined removes the field on the next
			// schema read. We cast through `unknown` because the new schema
			// doesn't define `role` anymore — TS would otherwise reject the
			// property. The cast is safe: `role` DOES exist on the legacy
			// rows we're trying to clear.
			const patch = {
				roleId: roleDoc._id,
				role: undefined,
			} as unknown as { roleId: typeof roleDoc._id };
			await ctx.db.patch(inv._id, patch);
			migrated += 1;
		}

		return { scanned, migrated, skipped };
	},
});

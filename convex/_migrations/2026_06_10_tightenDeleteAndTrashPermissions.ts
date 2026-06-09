/**
 * 2026-06-10 — Tighten delete + trash permissions to Owner-only.
 *
 * Why
 * ───
 * Locked 2026-06-10 (per user): three permission keys flipped from
 * `["Owner", "Admin"]` to `["Owner"]` in the catalog SSOT:
 *
 *   - `deals.delete`   — only the workspace owner can soft-delete deals
 *   - `data.viewTrash` — only owner can see the trash surface
 *   - `data.restore`   — only owner can restore from trash
 *
 * `data.hardDelete` was already Owner-only.
 *
 * The catalog change updates DEFAULTS for new orgs and for any role
 * reset-to-defaults. Existing orgs already have `orgRoles` rows seeded
 * with the OLD defaults (Admin still carries `deals.delete`,
 * `data.viewTrash`, `data.restore`). This migration removes those keys
 * from non-Owner system roles in every existing org so the runtime
 * checks match the new defaults.
 *
 * Custom roles are intentionally untouched — owners curate them
 * directly via the role editor; the migration is a system-default
 * reconciliation, not a wholesale revoke.
 *
 * Strategy
 * ────────
 *   - Idempotent. Re-running yields the same end state.
 *   - For each `orgRoles` row WHERE name ∈ {"Admin", "Member", "Viewer"}:
 *     remove `deals.delete`, `data.viewTrash`, `data.restore` from
 *     `permissions` if present.
 *   - "Owner" rows are left untouched (they already have all three).
 *   - Custom roles (name not in {Owner, Admin, Member, Viewer}) are
 *     left untouched.
 *   - Returns a summary so the operator can see how many rows changed.
 *
 * Run via:
 *   npx convex run _migrations/2026_06_10_tightenDeleteAndTrashPermissions:run '{"dryRun": true}'
 *   npx convex run _migrations/2026_06_10_tightenDeleteAndTrashPermissions:run '{}'
 */

import { v } from "convex/values";
import { internalMutation } from "../_generated/server";

const KEYS_TO_REMOVE = ["deals.delete", "data.viewTrash", "data.restore"] as const;
const SYSTEM_NON_OWNER_ROLES = new Set(["Admin", "Member", "Viewer"]);

export const run = internalMutation({
	args: { dryRun: v.optional(v.boolean()) },
	handler: async (ctx, args) => {
		const dryRun = args.dryRun ?? false;
		const removeSet = new Set<string>(KEYS_TO_REMOVE);

		const roles = await ctx.db.query("orgRoles").collect();

		let scanned = 0;
		let patched = 0;
		let skippedOwner = 0;
		let skippedCustom = 0;
		let totalKeysRemoved = 0;

		for (const role of roles) {
			scanned += 1;
			if (role.name === "Owner") {
				skippedOwner += 1;
				continue;
			}
			if (!SYSTEM_NON_OWNER_ROLES.has(role.name)) {
				skippedCustom += 1;
				continue;
			}
			const before = role.permissions ?? [];
			const filtered = before.filter((p) => !removeSet.has(p));
			if (filtered.length === before.length) continue;

			if (!dryRun) {
				await ctx.db.patch(role._id, {
					permissions: filtered,
					updatedAt: Date.now(),
				});
			}
			patched += 1;
			totalKeysRemoved += before.length - filtered.length;
		}

		return {
			dryRun,
			scanned,
			patched,
			skippedOwner,
			skippedCustom,
			totalKeysRemoved,
		};
	},
});

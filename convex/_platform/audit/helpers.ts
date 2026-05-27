/**
 * Platform audit log helper — convex/_platform/audit/helpers.ts
 *
 * Append-only writer that every owner-panel mutation calls AFTER its
 * primary write. Mirrors the `logActivity()` shape used by per-org
 * mutations (see `convex/activityLogs/helpers.ts`) but writes to a
 * separate table — owner actions never co-mingle with customer activity
 * because the panel has no `orgId` (locked decision L7 — platform-wide
 * only).
 *
 * Action verb convention: `owner.<subject>.<verb>` — e.g.
 *   - `owner.tier.update`
 *   - `owner.flag.toggle`
 *   - `owner.flag.org_override.set`
 *   - `owner.flag.org_override.remove`
 *   - `owner.user.tier_change`
 *   - `owner.context.update`
 *
 * Adding a new action verb is purely additive; no schema migration needed.
 *
 * Spec: PLATFORM-OWNER-PANEL.md §4.3, §8 (mutation pattern step 4).
 */
import type { Id } from "../../_generated/dataModel";
import type { MutationCtx } from "../../_generated/server";

export type PlatformAuditInput = {
	actorUserId: Id<"users">;
	actorEmail: string;
	action: string;
	targetType?: string;
	targetId?: string;
	/** JSON snapshot of the row before the change. */
	before?: unknown;
	/** JSON snapshot of the row after the change. */
	after?: unknown;
	/** Optional human justification (currently never collected from UI). */
	reason?: string;
	ip?: string;
	userAgent?: string;
};

/**
 * Append a row to `platformAuditLogs`. Returns the new row id so callers
 * can correlate the entry to the operation if useful.
 *
 * No update / delete equivalent is exported. Audit rows are immutable.
 */
export async function logPlatformAction(
	ctx: MutationCtx,
	input: PlatformAuditInput,
): Promise<Id<"platformAuditLogs">> {
	return ctx.db.insert("platformAuditLogs", {
		actorUserId: input.actorUserId,
		actorEmail: input.actorEmail,
		action: input.action,
		targetType: input.targetType,
		targetId: input.targetId,
		before: input.before,
		after: input.after,
		reason: input.reason,
		ip: input.ip,
		userAgent: input.userAgent,
		createdAt: Date.now(),
	});
}

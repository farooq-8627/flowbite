/**
 * Trash mutations — Phase 3A.
 *
 * - `restore`: lifts `deletedAt` back to undefined, restores the row to
 *   normal listings, increments the open/active counter.
 * - `purgeOldTrash` (internal): hard-deletes rows whose
 *   `deletedAt + retention` is in the past. Called nightly by the cron.
 */

import { ConvexError, v } from "convex/values";
import { orgMutation, requireOrgMemberByIds } from "../_functions/authenticated";
import type { Id } from "../_generated/dataModel";
import { internalMutation, type MutationCtx } from "../_generated/server";
import { ERRORS } from "../_shared/errors";
import { applyOrgStat } from "../_shared/orgStats";
import { requireRole } from "../_shared/permissions";
import { logActivity } from "../activityLogs/helpers";
import { getOrgMember } from "../orgs/helpers";

const DEFAULT_RETENTION_DAYS = 30;

async function restoreImpl(
	ctx: MutationCtx,
	args: {
		orgId: Id<"orgs">;
		userId: Id<"users">;
		entityType: "lead" | "contact" | "company" | "deal";
		entityId: string;
	},
) {
	const tableName =
		args.entityType === "lead"
			? "leads"
			: args.entityType === "contact"
				? "contacts"
				: args.entityType === "company"
					? "companies"
					: "deals";

	const row = await ctx.db.get(args.entityId as never);
	if (!row || (row as { orgId?: string }).orgId !== args.orgId) {
		throw new ConvexError(ERRORS.NOT_FOUND);
	}
	if ((row as { deletedAt?: number }).deletedAt === undefined) {
		throw new ConvexError({
			code: "ALREADY_RESTORED",
			message: "Record is not in the trash.",
		});
	}

	await ctx.db.patch(args.entityId as never, {
		deletedAt: undefined,
		updatedAt: Date.now(),
	});

	switch (args.entityType) {
		case "lead":
			await applyOrgStat(ctx, args.orgId, "leads.open", +1);
			await applyOrgStat(ctx, args.orgId, "leads.total", +1);
			break;
		case "contact":
			await applyOrgStat(ctx, args.orgId, "contacts.active", +1);
			break;
		case "company":
			await applyOrgStat(ctx, args.orgId, "companies.active", +1);
			break;
		case "deal":
			await applyOrgStat(ctx, args.orgId, "deals.open", +1);
			await applyOrgStat(ctx, args.orgId, "deals.total", +1);
			break;
	}

	await logActivity(ctx, {
		orgId: args.orgId,
		userId: args.userId,
		action: "restored",
		entityType: tableName,
		entityId: args.entityId,
		description: `Restored ${args.entityType} from trash`,
	});

	return { ok: true };
}

export const restore = orgMutation({
	args: {
		orgId: v.id("orgs"),
		entityType: v.union(
			v.literal("lead"),
			v.literal("contact"),
			v.literal("company"),
			v.literal("deal"),
		),
		entityId: v.string(),
	},
	handler: async (ctx, args) => {
		const member = await getOrgMember(ctx, args.orgId, ctx.userId);
		if (!member || member.deletedAt !== undefined) {
			throw new ConvexError(ERRORS.ORG_MEMBER_NOT_FOUND);
		}
		requireRole(member.permissions, "data.restore");
		return restoreImpl(ctx, { ...args, userId: ctx.userId });
	},
});

/** AI-callable internal twin. */
export const restoreForAI = internalMutation({
	args: {
		orgId: v.id("orgs"),
		userId: v.id("users"),
		entityType: v.union(
			v.literal("lead"),
			v.literal("contact"),
			v.literal("company"),
			v.literal("deal"),
		),
		entityId: v.string(),
	},
	handler: async (ctx, args) => {
		const { member } = await requireOrgMemberByIds(ctx, args.orgId, args.userId);
		requireRole(member.permissions, "data.restore");
		return restoreImpl(ctx, args);
	},
});

/**
 * Hard-delete every soft-deleted row whose retention window has
 * expired. Called nightly by the `purgeOldTrash` cron in
 * `convex/crons.ts`. Iterates the 4 CRM tables ONCE each, so it's
 * batched per-table and per-org.
 *
 * Idempotent — safe to run multiple times in a day.
 */
export const purgeOldTrash = internalMutation({
	args: {},
	handler: async (ctx) => {
		const now = Date.now();
		const orgs = await ctx.db.query("orgs").collect();
		let purged = 0;

		for (const org of orgs) {
			const retentionDays = org.settings?.softDeleteRetentionDays ?? DEFAULT_RETENTION_DAYS;
			const cutoff = now - retentionDays * 86_400_000;

			const tables = ["leads", "contacts", "companies", "deals"] as const;
			for (const table of tables) {
				const rows = await ctx.db
					.query(table)
					.withIndex("by_org", (q) => q.eq("orgId", org._id))
					.collect();
				for (const row of rows) {
					if (row.deletedAt !== undefined && row.deletedAt < cutoff) {
						await ctx.db.delete(row._id);
						purged += 1;
					}
				}
			}
		}

		return { purged };
	},
});

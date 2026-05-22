/**
 * Trash queries — Phase 3A.
 *
 * Lists soft-deleted records (`deletedAt !== undefined`) across the 4
 * CRM entities. Each record carries display fields needed for the
 * settings → Trash table: title, type, deletedAt, scheduled purge date.
 *
 * Permission: `data.viewTrash` (Owner / Admin by default).
 *
 * Purge cadence: `org.settings.softDeleteRetentionDays` controls when
 * the daily cron permanently removes a row. Defaults to 30 when unset.
 */

import { v } from "convex/values";
import { ConvexError } from "convex/values";
import { orgQuery } from "../_functions/authenticated";
import { ERRORS } from "../_shared/errors";
import { requireRole } from "../_shared/permissions";
import { getOrgMember } from "../orgs/helpers";

/** Default retention when `org.settings.softDeleteRetentionDays` is unset. */
const DEFAULT_RETENTION_DAYS = 30;

export interface TrashItem {
	id: string;
	entityType: "lead" | "contact" | "company" | "deal";
	title: string;
	deletedAt: number;
	purgeAt: number;
	deletedBy?: string;
}

export const list = orgQuery({
	args: { orgId: v.id("orgs") },
	handler: async (ctx, args): Promise<TrashItem[]> => {
		const member = await getOrgMember(ctx, args.orgId, ctx.userId);
		if (!member || member.deletedAt !== undefined) {
			throw new ConvexError(ERRORS.ORG_MEMBER_NOT_FOUND);
		}
		requireRole(member.permissions, "data.viewTrash");

		const org = await ctx.db.get(args.orgId);
		const retentionDays = org?.settings?.softDeleteRetentionDays ?? DEFAULT_RETENTION_DAYS;
		const retentionMs = retentionDays * 86_400_000;

		const purgeAtFor = (deletedAt: number) => deletedAt + retentionMs;

		// Each table is small per-org. We use the by_org index and filter
		// the in-memory result on `deletedAt`. Convex doesn't support a
		// "deletedAt is defined" predicate inside an index range without a
		// nested index, but the per-org volumes are tiny (tens of items
		// at most) so this is fine.
		const [leads, contacts, companies, deals] = await Promise.all([
			ctx.db
				.query("leads")
				.withIndex("by_org", (q) => q.eq("orgId", args.orgId))
				.collect(),
			ctx.db
				.query("contacts")
				.withIndex("by_org", (q) => q.eq("orgId", args.orgId))
				.collect(),
			ctx.db
				.query("companies")
				.withIndex("by_org", (q) => q.eq("orgId", args.orgId))
				.collect(),
			ctx.db
				.query("deals")
				.withIndex("by_org", (q) => q.eq("orgId", args.orgId))
				.collect(),
		]);

		const items: TrashItem[] = [];
		for (const r of leads) {
			if (r.deletedAt !== undefined) {
				items.push({
					id: r._id,
					entityType: "lead",
					title: r.displayName,
					deletedAt: r.deletedAt,
					purgeAt: purgeAtFor(r.deletedAt),
				});
			}
		}
		for (const r of contacts) {
			if (r.deletedAt !== undefined) {
				items.push({
					id: r._id,
					entityType: "contact",
					title: r.displayName,
					deletedAt: r.deletedAt,
					purgeAt: purgeAtFor(r.deletedAt),
				});
			}
		}
		for (const r of companies) {
			if (r.deletedAt !== undefined) {
				items.push({
					id: r._id,
					entityType: "company",
					title: r.name,
					deletedAt: r.deletedAt,
					purgeAt: purgeAtFor(r.deletedAt),
				});
			}
		}
		for (const r of deals) {
			if (r.deletedAt !== undefined) {
				items.push({
					id: r._id,
					entityType: "deal",
					title: r.title,
					deletedAt: r.deletedAt,
					purgeAt: purgeAtFor(r.deletedAt),
				});
			}
		}

		// Most-recently-deleted first.
		items.sort((a, b) => b.deletedAt - a.deletedAt);
		return items;
	},
});

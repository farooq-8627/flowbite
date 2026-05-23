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
import type { Id } from "../_generated/dataModel";
import { internalQuery, type QueryCtx } from "../_generated/server";
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

async function listImpl(
	ctx: QueryCtx,
	args: { orgId: Id<"orgs">; userId: Id<"users"> },
): Promise<TrashItem[]> {
	const member = await getOrgMember(ctx, args.orgId, args.userId);
	if (!member || member.deletedAt !== undefined) {
		throw new ConvexError(ERRORS.ORG_MEMBER_NOT_FOUND);
	}
	requireRole(member.permissions, "data.viewTrash");

	const org = await ctx.db.get(args.orgId);
	const retentionDays = org?.settings?.softDeleteRetentionDays ?? DEFAULT_RETENTION_DAYS;
	const retentionMs = retentionDays * 86_400_000;

	const purgeAtFor = (deletedAt: number) => deletedAt + retentionMs;

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

	items.sort((a, b) => b.deletedAt - a.deletedAt);
	return items;
}

export const list = orgQuery({
	args: { orgId: v.id("orgs") },
	handler: async (ctx, args): Promise<TrashItem[]> => {
		return listImpl(ctx, { orgId: args.orgId, userId: ctx.userId });
	},
});

/** AI-callable internal twin — see `convex/ai/tools/_shared.ts` for rationale. */
export const listForAI = internalQuery({
	args: { orgId: v.id("orgs"), userId: v.id("users") },
	handler: async (ctx, args): Promise<TrashItem[]> => listImpl(ctx, args),
});

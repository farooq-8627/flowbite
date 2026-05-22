/**
 * GDPR export — internal queries.
 *
 * Pulls every org-scoped table the export action needs. Each function
 * is `internalQuery` so only the action can call it. Pagination isn't
 * needed for v1 — most orgs have low thousands of rows; if a workspace
 * exceeds Convex's 32k-row read limit, we'll switch to paginated
 * fetches per table.
 */

import { v } from "convex/values";
import { internalQuery } from "../_generated/server";

export const collectAll = internalQuery({
	args: { orgId: v.id("orgs") },
	handler: async (ctx, args) => {
		const [
			org,
			leads,
			contacts,
			companies,
			deals,
			notes,
			reminders,
			messages,
			conversations,
			tags,
			entityTags,
			fieldDefinitions,
			fieldValues,
			pipelines,
			savedViews,
			activityLogs,
			members,
			files,
		] = await Promise.all([
			ctx.db.get(args.orgId),
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
			ctx.db
				.query("notes")
				.withIndex("by_org_and_created", (q) => q.eq("orgId", args.orgId))
				.collect(),
			ctx.db
				.query("reminders")
				.withIndex("by_org_and_due", (q) => q.eq("orgId", args.orgId))
				.collect(),
			ctx.db
				.query("messages")
				.withIndex("by_org_and_created", (q) => q.eq("orgId", args.orgId))
				.collect(),
			ctx.db
				.query("conversations")
				.withIndex("by_org_and_lastMessage", (q) => q.eq("orgId", args.orgId))
				.collect(),
			ctx.db
				.query("tags")
				.withIndex("by_org", (q) => q.eq("orgId", args.orgId))
				.collect(),
			ctx.db
				.query("entityTags")
				.withIndex("by_entity", (q) => q.eq("orgId", args.orgId))
				.collect(),
			ctx.db
				.query("fieldDefinitions")
				.withIndex("by_org_and_entity", (q) => q.eq("orgId", args.orgId))
				.collect(),
			ctx.db
				.query("fieldValues")
				.withIndex("by_entity", (q) => q.eq("orgId", args.orgId))
				.collect(),
			ctx.db
				.query("pipelines")
				.withIndex("by_org_and_entity", (q) => q.eq("orgId", args.orgId))
				.collect(),
			ctx.db
				.query("savedViews")
				.withIndex("by_org_and_entity", (q) => q.eq("orgId", args.orgId))
				.collect(),
			ctx.db
				.query("activityLogs")
				.withIndex("by_orgId_and_createdAt", (q) => q.eq("orgId", args.orgId))
				.collect(),
			ctx.db
				.query("orgMembers")
				.withIndex("by_orgId_and_userId", (q) => q.eq("orgId", args.orgId))
				.collect(),
			ctx.db
				.query("files")
				.withIndex("by_org_and_scope", (q) => q.eq("orgId", args.orgId))
				.collect(),
		]);

		return {
			org,
			leads,
			contacts,
			companies,
			deals,
			notes,
			reminders,
			messages,
			conversations,
			tags,
			entityTags,
			fieldDefinitions,
			fieldValues,
			pipelines,
			savedViews,
			activityLogs,
			members,
			files,
		};
	},
});

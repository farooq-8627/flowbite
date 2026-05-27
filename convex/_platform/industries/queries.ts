/**
 * Industry-template queries — convex/_platform/industries/queries.ts
 *
 * Three audiences:
 *   1. Onboarding picker (any authenticated user) → step 1 + step 2 lists.
 *   2. AI tool surface (orchestrator) → flat list of templates.
 *   3. Owner panel (`/xowner/industries`) → admin reads with full
 *      definition blob exposed.
 *
 * Shape decisions:
 *   - The ONBOARDING readers return only display-safe metadata. The
 *     full template definition (pipelines, fields, mockData, etc.) is
 *     consumed only by the seeder via direct DB read — never by the
 *     client.
 *   - The ADMIN reader (`getTemplateForAdmin`) returns the full row
 *     including `definition` so the owner editor can render every
 *     slot.
 *
 * Spec: INDUSTRY-TEMPLATES-DB-MIGRATION.md §4.1 + §5.4.
 */

import { v } from "convex/values";
import { authenticatedQuery } from "../../_functions/authenticated";
import type { Doc } from "../../_generated/dataModel";
import { internalQuery, query } from "../../_generated/server";
import { requirePlatformOwner } from "../ownerAuth";

// ─── Onboarding queries (public — any authenticated user) ───────────────────

export type OnboardingGroupRow = {
	groupKey: string;
	label: string;
	description?: string;
	icon?: string;
	sortOrder: number;
	templateCount: number;
	/**
	 * When the group has exactly one visible template, returns its
	 * `templateKey` so the client can skip step 2 of the picker.
	 */
	soloTemplateKey?: string;
};

/**
 * Step 1 of the onboarding picker — list every visible group with a
 * count of visible templates inside.
 */
export const listOnboardingGroups = authenticatedQuery({
	args: {},
	handler: async (ctx): Promise<OnboardingGroupRow[]> => {
		const groups = await ctx.db
			.query("platformIndustryGroups")
			.withIndex("by_visible_order", (q) => q.eq("visible", true))
			.collect();

		const out: OnboardingGroupRow[] = [];
		for (const g of groups) {
			const tpls = await ctx.db
				.query("platformTemplates")
				.withIndex("by_group_visible_order", (q) =>
					q.eq("groupKey", g.groupKey).eq("visible", true),
				)
				.collect();
			const visibleNonArchived = tpls.filter((t) => !t.isArchived);
			out.push({
				groupKey: g.groupKey,
				label: g.label,
				description: g.description,
				icon: g.icon,
				sortOrder: g.sortOrder,
				templateCount: visibleNonArchived.length,
				soloTemplateKey:
					visibleNonArchived.length === 1
						? visibleNonArchived[0]!.templateKey
						: undefined,
			});
		}
		return out.sort((a, b) => a.sortOrder - b.sortOrder);
	},
});

export type OnboardingTemplateRow = {
	templateKey: string;
	label: string;
	description: string;
	icon?: string;
	region?: string;
	sortOrder: number;
};

/**
 * Step 2 — list visible non-archived templates inside a group.
 * Returns empty when the group has no visible templates.
 */
export const listOnboardingTemplatesByGroup = authenticatedQuery({
	args: { groupKey: v.string() },
	handler: async (ctx, args): Promise<OnboardingTemplateRow[]> => {
		const tpls = await ctx.db
			.query("platformTemplates")
			.withIndex("by_group_visible_order", (q) =>
				q.eq("groupKey", args.groupKey).eq("visible", true),
			)
			.collect();
		return tpls
			.filter((t) => !t.isArchived)
			.map((t) => ({
				templateKey: t.templateKey,
				label: t.label,
				description: t.description,
				icon: t.icon,
				region: t.region,
				sortOrder: t.sortOrder,
			}))
			.sort((a, b) => a.sortOrder - b.sortOrder);
	},
});

// ─── Settings → re-apply template (any authenticated user) ──────────────────

/**
 * Flat list shaped for the existing Settings → Workspace "Re-apply
 * template" picker. Replaces the legacy `crm.fields.templates.queries.list`
 * during Stage 1 (which gets a deprecated re-export shim). Returns the
 * SAME `IndustryTemplateSummary` shape so frontends don't need to change.
 *
 * Includes ARCHIVED templates so the settings page can surface
 * "Currently on archived template — switch?" UX. The onboarding flow
 * uses `listOnboardingGroups` / `listOnboardingTemplatesByGroup` which
 * exclude archived rows.
 */
export const listAllForSettings = authenticatedQuery({
	args: {},
	handler: async (ctx) => {
		const tpls = await ctx.db.query("platformTemplates").collect();
		return tpls
			.filter((t) => !t.isArchived)
			.map((t) => summariseTemplate(t))
			.sort((a, b) => a.id.localeCompare(b.id));
	},
});

// ─── AI-callable internal twin ──────────────────────────────────────────────

/**
 * AI tool surface. Templates are non-sensitive (purely informational
 * for the orchestrator), so the twin doesn't validate org membership —
 * it just returns the visible non-archived list.
 */
export const listAllForAI = internalQuery({
	args: { userId: v.id("users") },
	handler: async (ctx) => {
		const tpls = await ctx.db.query("platformTemplates").collect();
		return tpls
			.filter((t) => t.visible && !t.isArchived)
			.map((t) => ({
				templateKey: t.templateKey,
				label: t.label,
				description: t.description,
			}));
	},
});

// ─── Admin (owner panel) ────────────────────────────────────────────────────

/**
 * Owner-panel admin list. Returns the full row including `definition`
 * so the editor can render every slot. Includes archived + invisible
 * entries (the UI filters them visually).
 */
export const listAllForAdmin = query({
	args: {},
	handler: async (ctx) => {
		await requirePlatformOwner(ctx);
		const tpls = await ctx.db.query("platformTemplates").collect();
		return tpls.sort((a, b) => {
			if (a.groupKey !== b.groupKey) return a.groupKey.localeCompare(b.groupKey);
			return a.sortOrder - b.sortOrder;
		});
	},
});

/**
 * Owner-panel admin list of groups — full rows including invisible.
 */
export const listGroupsForAdmin = query({
	args: {},
	handler: async (ctx) => {
		await requirePlatformOwner(ctx);
		const groups = await ctx.db.query("platformIndustryGroups").collect();
		return groups.sort((a, b) => a.sortOrder - b.sortOrder);
	},
});

/**
 * Single template lookup for the admin editor. Returns the full row
 * with `definition` blob.
 */
export const getTemplateForAdmin = query({
	args: { templateKey: v.string() },
	handler: async (ctx, args) => {
		await requirePlatformOwner(ctx);
		return ctx.db
			.query("platformTemplates")
			.withIndex("by_templateKey", (q) => q.eq("templateKey", args.templateKey))
			.unique();
	},
});

/**
 * Single group lookup for the admin editor.
 */
export const getGroupForAdmin = query({
	args: { groupKey: v.string() },
	handler: async (ctx, args) => {
		await requirePlatformOwner(ctx);
		return ctx.db
			.query("platformIndustryGroups")
			.withIndex("by_groupKey", (q) => q.eq("groupKey", args.groupKey))
			.unique();
	},
});

/**
 * Aggregate org-usage counts per templateKey. Drives the "X orgs using"
 * stat in the admin list view AND the precondition check on
 * `deleteTemplate`. Scans the `orgs` table once (no `by_industry`
 * index — owner-panel reads are infrequent + small org count vs
 * tenant-facing throughput) and returns a `{ [templateKey]: count }`
 * map.
 */
export const usageCountByTemplate = query({
	args: {},
	handler: async (ctx): Promise<Record<string, number>> => {
		await requirePlatformOwner(ctx);
		const orgs = await ctx.db.query("orgs").collect();
		const counts: Record<string, number> = {};
		for (const org of orgs) {
			if (org.deletedAt !== undefined) continue;
			const key = org.industry;
			if (!key) continue;
			counts[key] = (counts[key] ?? 0) + 1;
		}
		return counts;
	},
});

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Build the legacy `IndustryTemplateSummary` shape used by the existing
 * Settings → Workspace picker. Same field set as the old
 * `crm.fields.templates.queries.list` returned, derived from the
 * DB-backed row.
 */
function summariseTemplate(t: Doc<"platformTemplates">) {
	const def = t.definition as Record<string, unknown>;
	const pipelinesArr = (def.pipelines as Array<{ name?: string; stages?: unknown[] }>) ?? [];
	const singlePipeline = def.pipeline as { name?: string; stages?: unknown[] } | undefined;

	const stageCount =
		singlePipeline?.stages?.length ??
		(pipelinesArr.length > 0 ? (pipelinesArr[0]?.stages?.length ?? 0) : 0);
	const pipelineName = singlePipeline?.name ?? pipelinesArr[0]?.name ?? "Default Pipeline";

	return {
		id: t.templateKey,
		label: t.label,
		description: t.description,
		icon: t.icon,
		region: t.region,
		pipelineStageCount: stageCount,
		pipelineName,
		customRoleCount: ((def.customRoles as unknown[]) ?? []).length,
		tagCount: ((def.tags as unknown[]) ?? []).length,
		noteCategoryCount: ((def.noteCategories as unknown[]) ?? []).length,
		savedViewCount: ((def.savedViews as unknown[]) ?? []).length,
	};
}

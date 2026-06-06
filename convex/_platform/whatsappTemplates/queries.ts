/**
 * WhatsApp templates queries — B.40.
 *
 * Three audiences:
 *   1. Owner panel (`/xowner/whatsapp-templates`) — admin reads of the
 *      built-in row set, gated on `requirePlatformOwner`.
 *   2. AI runtime (`send_whatsapp` capability) — internal lookups for an
 *      org's effective template list (org override beats built-in).
 *   3. Frontend pickers (future surfaces) can read via `listForOrg`.
 *
 * Read precedence: a row with `(templateId, orgId=<id>)` overrides the
 * built-in row with `(templateId, orgId=undefined)` for that org. Both
 * rows can coexist; only the override is returned to the AI runtime.
 *
 * Spec: `Future-Enhancements.md §B.40`.
 */

import { v } from "convex/values";
import { requireOrgMember } from "../../_functions/authenticated";
import type { Doc, Id } from "../../_generated/dataModel";
import { internalQuery, query } from "../../_generated/server";
import { requirePlatformOwner } from "../ownerAuth";

// ─── Shared shape returned to UI/runtime ──────────────────────────────────

export type WhatsappTemplateRow = {
	_id: Id<"whatsappTemplates">;
	templateId: string;
	orgId: Id<"orgs"> | null;
	label: string;
	description: string;
	category: "utility" | "marketing" | "authentication";
	body: string;
	variables: Array<{ name: string; description: string; defaultValue?: string }>;
	contentSid: string | null;
	approvalStatus: "draft" | "submitted" | "approved" | "rejected";
	approvalNote: string | null;
	isBuiltIn: boolean;
	active: boolean;
	updatedBy: Id<"users"> | null;
	createdAt: number;
	updatedAt: number;
};

function projectRow(row: Doc<"whatsappTemplates">): WhatsappTemplateRow {
	return {
		_id: row._id,
		templateId: row.templateId,
		orgId: row.orgId ?? null,
		label: row.label,
		description: row.description,
		category: row.category,
		body: row.body,
		variables: row.variables.map((vv) => ({
			name: vv.name,
			description: vv.description,
			defaultValue: vv.defaultValue,
		})),
		contentSid: row.contentSid ?? null,
		approvalStatus: row.approvalStatus,
		approvalNote: row.approvalNote ?? null,
		isBuiltIn: row.isBuiltIn,
		active: row.active,
		updatedBy: row.updatedBy ?? null,
		createdAt: row.createdAt,
		updatedAt: row.updatedAt,
	};
}

// ─── Owner-panel reads ────────────────────────────────────────────────────

/**
 * List every template visible to the owner panel — built-ins + every
 * org override. Soft-deleted rows are filtered out. Sorted: built-ins
 * first (alphabetical), then org overrides newest-first.
 */
export const listAllForOwner = query({
	args: {},
	handler: async (ctx): Promise<WhatsappTemplateRow[]> => {
		await requirePlatformOwner(ctx);
		const rows = await ctx.db.query("whatsappTemplates").collect();
		return rows
			.filter((r) => r.deletedAt === undefined)
			.map(projectRow)
			.sort((a, b) => {
				if (a.isBuiltIn !== b.isBuiltIn) return a.isBuiltIn ? -1 : 1;
				if (a.isBuiltIn) return a.templateId.localeCompare(b.templateId);
				return b.createdAt - a.createdAt;
			});
	},
});

/** Single-row lookup for the owner-panel editor drawer. */
export const getForOwner = query({
	args: { templateRowId: v.id("whatsappTemplates") },
	handler: async (ctx, args): Promise<WhatsappTemplateRow | null> => {
		await requirePlatformOwner(ctx);
		const row = await ctx.db.get(args.templateRowId);
		if (!row || row.deletedAt !== undefined) return null;
		return projectRow(row);
	},
});

// ─── AI runtime reads (internal-only) ─────────────────────────────────────

/**
 * Resolve a template for a given org by id. Returns the org override if
 * one exists, otherwise the built-in. `null` means "this id does not
 * exist as a template (built-in or override) — refuse the send".
 *
 * Always called from `send_whatsapp.run` via
 * `ctx.runQuery(internal.ai.channels.whatsappTemplates.getTemplateForOrg, ...)`.
 */
export const getTemplateForOrg = internalQuery({
	args: { orgId: v.id("orgs"), templateId: v.string() },
	handler: async (ctx, args): Promise<WhatsappTemplateRow | null> => {
		const override = await ctx.db
			.query("whatsappTemplates")
			.withIndex("by_template_org", (q) =>
				q.eq("templateId", args.templateId).eq("orgId", args.orgId),
			)
			.unique();
		if (override && override.deletedAt === undefined && override.active) {
			return projectRow(override);
		}

		const builtIn = await ctx.db
			.query("whatsappTemplates")
			.withIndex("by_template_org", (q) =>
				q.eq("templateId", args.templateId).eq("orgId", undefined),
			)
			.unique();
		if (builtIn && builtIn.deletedAt === undefined && builtIn.active) {
			return projectRow(builtIn);
		}
		return null;
	},
});

/**
 * List the effective template set for an org (built-ins shadowed by any
 * org overrides). Used by the AI to render the "available templates"
 * list inside the `whatsapp` group playbook + by error envelopes.
 */
export const listForOrgInternal = internalQuery({
	args: { orgId: v.id("orgs") },
	handler: async (ctx, args): Promise<WhatsappTemplateRow[]> => {
		const orgRows = await ctx.db
			.query("whatsappTemplates")
			.withIndex("by_org_active", (q) => q.eq("orgId", args.orgId).eq("active", true))
			.collect();
		const builtIns = await ctx.db
			.query("whatsappTemplates")
			.withIndex("by_built_in", (q) => q.eq("isBuiltIn", true))
			.collect();

		const overrideIds = new Set(
			orgRows.filter((r) => r.deletedAt === undefined).map((r) => r.templateId),
		);
		const visibleBuiltIns = builtIns.filter(
			(r) => r.deletedAt === undefined && r.active && !overrideIds.has(r.templateId),
		);
		const visibleOrgRows = orgRows.filter((r) => r.deletedAt === undefined);

		return [...visibleBuiltIns, ...visibleOrgRows]
			.map(projectRow)
			.sort((a, b) => a.templateId.localeCompare(b.templateId));
	},
});

/**
 * Org-admin read — same shape as `listForOrgInternal` but auth-gated to
 * any authenticated org member. Drives an in-app surface (Settings →
 * WhatsApp templates) when we ship that view in a follow-up.
 */
export const listForOrg = query({
	args: { orgId: v.id("orgs") },
	handler: async (ctx, args): Promise<WhatsappTemplateRow[]> => {
		await requireOrgMember(ctx, args.orgId);
		const orgRows = await ctx.db
			.query("whatsappTemplates")
			.withIndex("by_org_active", (q) => q.eq("orgId", args.orgId).eq("active", true))
			.collect();
		const builtIns = await ctx.db
			.query("whatsappTemplates")
			.withIndex("by_built_in", (q) => q.eq("isBuiltIn", true))
			.collect();
		const overrideIds = new Set(
			orgRows.filter((r) => r.deletedAt === undefined).map((r) => r.templateId),
		);
		const visibleBuiltIns = builtIns.filter(
			(r) => r.deletedAt === undefined && r.active && !overrideIds.has(r.templateId),
		);
		const visibleOrgRows = orgRows.filter((r) => r.deletedAt === undefined);
		return [...visibleBuiltIns, ...visibleOrgRows]
			.map(projectRow)
			.sort((a, b) => a.templateId.localeCompare(b.templateId));
	},
});

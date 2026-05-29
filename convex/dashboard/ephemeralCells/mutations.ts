/**
 * convex/dashboard/ephemeralCells/mutations.ts
 *
 * Stage 5 (`/DASHBOARD-V2-PLAN.md`) — per-user TTL-bounded "pinned"
 * widgets that AI's `render_widget` tool drops above the dashboard.
 *
 * Three mutation surfaces:
 *   - `pinForAI` (internal-only, called by `commit_render_widget`).
 *   - `dismiss` / `dismissForAI` — hard-delete a row (user clicked ×
 *     or the AI tool aborted).
 *   - `promoteToLayout` — append the cell as a panel on the user's OWN
 *     dashboardLayoutOverride (per architectural rule: AI never writes
 *     the layout, the user's deliberate click is what mutates it).
 *
 * Permission model:
 *   - pinForAI: `ai.use` (defence-in-depth — the tool layer also gates).
 *   - dismiss / promoteToLayout: caller must own the cell (userId match).
 *     No special perm — every member can manage their OWN ephemeral cells.
 */

import { ConvexError, v } from "convex/values";
import {
	orgMutation,
	requireOrgMember,
	requireOrgMemberByIds,
} from "../../_functions/authenticated";
import type { Id } from "../../_generated/dataModel";
import { internalMutation, type MutationCtx } from "../../_generated/server";
import { ERRORS } from "../../_shared/errors";
import { requireRole } from "../../_shared/permissions/helpers";
import {
	isWidgetKey,
	validateDashboardLayoutShape,
	type WidgetKey,
} from "../../_shared/widgetRegistry";

const CELL_TTL_MS = 24 * 60 * 60 * 1000;
const TITLE_MAX_LEN = 80;
/** ~4 KB serialised cap on dataSnapshot — guard runaway row sizes. */
const SNAPSHOT_MAX_BYTES = 4_096;

// ─── pinForAI ─────────────────────────────────────────────────────────────────

export const pinForAI = internalMutation({
	args: {
		orgId: v.id("orgs"),
		userId: v.id("users"),
		conversationId: v.optional(v.id("aiConversations")),
		widgetKey: v.string(),
		title: v.optional(v.string()),
		args: v.any(),
		dataSnapshot: v.optional(v.any()),
	},
	handler: async (ctx, args) => {
		const { member } = await requireOrgMemberByIds(ctx, args.orgId, args.userId);
		requireRole(member.permissions, "ai.use");

		if (!isWidgetKey(args.widgetKey)) {
			throw new ConvexError({
				code: "INVALID_WIDGET_KEY",
				message: `Unknown widget '${args.widgetKey}'. Call list_widgets first.`,
			});
		}
		const trimmedTitle = args.title?.trim();
		if (trimmedTitle && trimmedTitle.length > TITLE_MAX_LEN) {
			throw new ConvexError(ERRORS.INVALID_ARGS);
		}
		if (args.dataSnapshot !== undefined) {
			const serialized = JSON.stringify(args.dataSnapshot);
			if (serialized.length > SNAPSHOT_MAX_BYTES) {
				throw new ConvexError({
					code: "SNAPSHOT_TOO_LARGE",
					message: `dataSnapshot exceeds ${SNAPSHOT_MAX_BYTES} bytes.`,
				});
			}
		}

		const now = Date.now();
		const cellId = `${args.userId}:${args.widgetKey}:${now}`;

		// Idempotency — replace any existing cell from the same conversation
		// for the same widget. (Each AI render is "the latest preview"; we
		// don't accumulate stale renders on the user's row.)
		if (args.conversationId) {
			const existing = await ctx.db
				.query("ephemeralDashboardCells")
				.withIndex("by_user_and_org", (q) =>
					q.eq("userId", args.userId).eq("orgId", args.orgId),
				)
				.collect();
			for (const row of existing) {
				if (
					row.createdByConversationId === args.conversationId &&
					row.widgetKey === args.widgetKey
				) {
					await ctx.db.delete(row._id);
				}
			}
		}

		return ctx.db.insert("ephemeralDashboardCells", {
			orgId: args.orgId,
			userId: args.userId,
			cellId,
			widgetKey: args.widgetKey,
			title: trimmedTitle && trimmedTitle.length > 0 ? trimmedTitle : undefined,
			args: args.args,
			dataSnapshot: args.dataSnapshot,
			createdByConversationId: args.conversationId,
			createdAt: now,
			expiresAt: now + CELL_TTL_MS,
		});
	},
});

// ─── dismiss ──────────────────────────────────────────────────────────────────

async function dismissImpl(
	ctx: MutationCtx,
	args: {
		orgId: Id<"orgs">;
		userId: Id<"users">;
		cellRowId: Id<"ephemeralDashboardCells">;
	},
) {
	const row = await ctx.db.get(args.cellRowId);
	if (!row || row.orgId !== args.orgId) {
		throw new ConvexError(ERRORS.NOT_FOUND);
	}
	if (row.userId !== args.userId) {
		throw new ConvexError(ERRORS.UNAUTHORIZED);
	}
	await ctx.db.delete(args.cellRowId);
}

export const dismiss = orgMutation({
	args: {
		orgId: v.id("orgs"),
		cellRowId: v.id("ephemeralDashboardCells"),
	},
	handler: async (ctx, args) => {
		await requireOrgMember(ctx, args.orgId);
		await dismissImpl(ctx, {
			orgId: args.orgId,
			userId: ctx.userId,
			cellRowId: args.cellRowId,
		});
	},
});

export const dismissForAI = internalMutation({
	args: {
		orgId: v.id("orgs"),
		userId: v.id("users"),
		cellRowId: v.id("ephemeralDashboardCells"),
	},
	handler: async (ctx, args) => {
		await requireOrgMemberByIds(ctx, args.orgId, args.userId);
		await dismissImpl(ctx, args);
	},
});

// ─── promoteToLayout ─────────────────────────────────────────────────────────

/**
 * "Pin to my dashboard" — appends the cell as a panel on the user's
 * OWN `dashboardLayoutOverride.layout`. Creates the override on first
 * pin (cloning the org default as the seed). Never touches the org
 * default; never writes another user's preferences.
 *
 * Idempotent — pinning the same cellId twice no-ops the second time.
 *
 * After the layout write, the ephemeral cell is hard-deleted (it now
 * lives on the canonical layout instead).
 */
export const promoteToLayout = orgMutation({
	args: {
		orgId: v.id("orgs"),
		cellRowId: v.id("ephemeralDashboardCells"),
		span: v.optional(v.union(v.literal(1), v.literal(2), v.literal(3))),
	},
	handler: async (ctx, args) => {
		await requireOrgMember(ctx, args.orgId);
		const row = await ctx.db.get(args.cellRowId);
		if (!row || row.orgId !== args.orgId) throw new ConvexError(ERRORS.NOT_FOUND);
		if (row.userId !== ctx.userId) throw new ConvexError(ERRORS.UNAUTHORIZED);

		// Resolve the seed layout: the user's existing override (if it's
		// for this org), else the org default, else a minimal blank layout.
		const existingPrefs = ctx.user.preferences ?? {};
		const existingOverride = existingPrefs.dashboardLayoutOverride;
		const isMyOrgOverride =
			existingOverride && existingOverride.orgId === args.orgId
				? existingOverride
				: undefined;

		let seed: unknown = isMyOrgOverride?.layout;
		if (!seed) {
			const org = await ctx.db.get(args.orgId);
			seed = org?.settings?.dashboardLayout ?? { panels: [] };
		}
		const validation = validateDashboardLayoutShape(seed);
		const baseLayout =
			validation.valid && validation.layout
				? validation.layout
				: { panels: [], metrics: undefined, hero: undefined, forecast: undefined };

		const panelId = `ai-pin-${row._id}`;
		const alreadyPanel = baseLayout.panels.some((p) => p.id === panelId);
		const widget = row.widgetKey as WidgetKey;
		if (!isWidgetKey(widget)) {
			throw new ConvexError({
				code: "INVALID_WIDGET_KEY",
				message: `Cell widget '${row.widgetKey}' is no longer registered.`,
			});
		}
		const newPanels = alreadyPanel
			? baseLayout.panels
			: [...baseLayout.panels, { id: panelId, span: args.span ?? 2, widget }];

		const nextLayout = {
			...baseLayout,
			panels: newPanels,
		};
		// Re-validate the final shape (defence-in-depth).
		const reval = validateDashboardLayoutShape(nextLayout);
		if (!reval.valid) {
			throw new ConvexError({
				code: "INVALID_LAYOUT",
				message: `Resulting layout failed validation: ${reval.errors[0]?.message ?? "shape error"}`,
			});
		}

		await ctx.db.patch(ctx.userId, {
			preferences: {
				...existingPrefs,
				dashboardLayoutOverride: {
					orgId: args.orgId,
					layout: reval.layout,
					updatedAt: Date.now(),
				},
			},
			updatedAt: Date.now(),
		});
		await ctx.db.delete(args.cellRowId);

		return { panelId };
	},
});

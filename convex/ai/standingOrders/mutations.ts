/**
 * convex/ai/standingOrders/mutations.ts
 *
 * Stage 8 of /SPRINT-PLAN.md (Autonomous layer). CRUD for the
 * `aiStandingOrders` table. Per AGENTS.md non-negotiable rule, every
 * public mutation has a same-file `*ForAI` internal twin so the AI
 * tool layer can drive standing-order management itself when needed.
 *
 * RBAC: every public mutation gates on `ai.automation.manage`
 * (Owner/Admin by default; see `_shared/permissions/catalog.ts` Stage 8
 * entry). The runner re-checks the OWNER's permissions when it executes
 * so autonomy never escalates beyond the user it runs as.
 *
 * Body extraction: `createImpl` / `updateImpl` / `removeImpl` /
 * `setEnabledImpl` hold the actual writes so the public + ForAI
 * variants can never diverge.
 */

import { ConvexError, v } from "convex/values";
import {
	orgMutation,
	requireOrgMember,
	requireOrgMemberByIds,
} from "../../_functions/authenticated";
import type { Doc, Id } from "../../_generated/dataModel";
import { internalMutation, type MutationCtx } from "../../_generated/server";
import { ERRORS } from "../../_shared/errors";
import { requireRole } from "../../_shared/permissions/helpers";
import { logActivity } from "../../activityLogs/helpers";
import { describeSchedule, type Schedule, validateSchedule } from "./schedule";

const MAX_NAME_LENGTH = 80;
const MAX_PROMPT_LENGTH = 2000;
const MAX_ALLOWED_TOOLS = 30;

// ─── Validators reused by both the public + ForAI variants ───────────────

const scheduleValidator = v.union(
	v.object({
		kind: v.literal("interval"),
		intervalMinutes: v.number(),
	}),
	v.object({
		kind: v.literal("daily"),
		utcHour: v.number(),
		utcMinute: v.number(),
	}),
	v.object({
		kind: v.literal("weekly"),
		dayOfWeek: v.number(),
		utcHour: v.number(),
		utcMinute: v.number(),
	}),
);

// ─── Body helpers (public + ForAI share these) ───────────────────────────

function sanitizeName(raw: string): string {
	const trimmed = raw.trim();
	if (trimmed.length === 0) {
		throw new ConvexError({
			code: "STANDING_ORDER_INVALID",
			message: "name is required.",
		});
	}
	if (trimmed.length > MAX_NAME_LENGTH) {
		throw new ConvexError({
			code: "STANDING_ORDER_INVALID",
			message: `name must be ≤ ${MAX_NAME_LENGTH} characters.`,
		});
	}
	return trimmed;
}

function sanitizePrompt(raw: string): string {
	const trimmed = raw.trim();
	if (trimmed.length === 0) {
		throw new ConvexError({
			code: "STANDING_ORDER_INVALID",
			message: "prompt is required.",
		});
	}
	if (trimmed.length > MAX_PROMPT_LENGTH) {
		throw new ConvexError({
			code: "STANDING_ORDER_INVALID",
			message: `prompt must be ≤ ${MAX_PROMPT_LENGTH} characters.`,
		});
	}
	return trimmed;
}

function sanitizeAllowedTools(raw: ReadonlyArray<string>): string[] {
	if (raw.length > MAX_ALLOWED_TOOLS) {
		throw new ConvexError({
			code: "STANDING_ORDER_INVALID",
			message: `allowedTools must have ≤ ${MAX_ALLOWED_TOOLS} entries.`,
		});
	}
	const cleaned = raw.map((t) => t.trim()).filter((t) => t.length > 0);
	const unique = Array.from(new Set(cleaned));
	return unique;
}

async function ownedRow(
	ctx: MutationCtx,
	id: Id<"aiStandingOrders">,
	expectedOrgId: Id<"orgs">,
): Promise<Doc<"aiStandingOrders">> {
	const row = await ctx.db.get(id);
	if (!row) throw new ConvexError(ERRORS.NOT_FOUND);
	if (row.orgId !== expectedOrgId) throw new ConvexError(ERRORS.FORBIDDEN);
	return row;
}

async function createImpl(
	ctx: MutationCtx,
	args: {
		orgId: Id<"orgs">;
		userId: Id<"users">;
		ownerUserId: Id<"users">;
		name: string;
		prompt: string;
		allowedTools: ReadonlyArray<string>;
		schedule: Schedule;
		enabled?: boolean;
	},
) {
	validateSchedule(args.schedule);
	const name = sanitizeName(args.name);
	const prompt = sanitizePrompt(args.prompt);
	const allowedTools = sanitizeAllowedTools(args.allowedTools);

	const now = Date.now();
	const id = await ctx.db.insert("aiStandingOrders", {
		orgId: args.orgId,
		userId: args.ownerUserId,
		name,
		prompt,
		allowedTools,
		schedule: args.schedule,
		enabled: args.enabled ?? true,
		createdAt: now,
		updatedAt: now,
	});

	await logActivity(ctx, {
		orgId: args.orgId,
		userId: args.userId,
		action: "ai.standingOrder.created",
		entityType: "ai_standing_order",
		entityId: id,
		description: `Standing order "${name}" — ${describeSchedule(args.schedule)}`,
	});

	return { id, name, schedule: describeSchedule(args.schedule) };
}

async function updateImpl(
	ctx: MutationCtx,
	args: {
		orgId: Id<"orgs">;
		userId: Id<"users">;
		standingOrderId: Id<"aiStandingOrders">;
		name?: string;
		prompt?: string;
		allowedTools?: ReadonlyArray<string>;
		schedule?: Schedule;
		enabled?: boolean;
	},
) {
	const row = await ownedRow(ctx, args.standingOrderId, args.orgId);
	const patch: Record<string, unknown> = {};
	if (args.name !== undefined) patch.name = sanitizeName(args.name);
	if (args.prompt !== undefined) patch.prompt = sanitizePrompt(args.prompt);
	if (args.allowedTools !== undefined) {
		patch.allowedTools = sanitizeAllowedTools(args.allowedTools);
	}
	if (args.schedule !== undefined) {
		validateSchedule(args.schedule);
		patch.schedule = args.schedule;
	}
	if (args.enabled !== undefined) patch.enabled = args.enabled;
	if (Object.keys(patch).length === 0) {
		return { id: row._id, unchanged: true as const };
	}
	patch.updatedAt = Date.now();
	await ctx.db.patch(args.standingOrderId, patch);

	await logActivity(ctx, {
		orgId: args.orgId,
		userId: args.userId,
		action: "ai.standingOrder.updated",
		entityType: "ai_standing_order",
		entityId: args.standingOrderId,
		description: `Standing order "${row.name}" updated.`,
	});

	return { id: row._id, unchanged: false as const };
}

async function removeImpl(
	ctx: MutationCtx,
	args: {
		orgId: Id<"orgs">;
		userId: Id<"users">;
		standingOrderId: Id<"aiStandingOrders">;
	},
) {
	const row = await ownedRow(ctx, args.standingOrderId, args.orgId);
	await ctx.db.delete(args.standingOrderId);
	await logActivity(ctx, {
		orgId: args.orgId,
		userId: args.userId,
		action: "ai.standingOrder.removed",
		entityType: "ai_standing_order",
		entityId: args.standingOrderId,
		description: `Standing order "${row.name}" removed.`,
	});
	return { id: args.standingOrderId };
}

/**
 * Internal-only helper used by the runner action to record the result
 * of a run in a single bounded transaction. Public callers cannot hit
 * this — it bypasses the `ai.automation.manage` permission so the
 * runner can write back the summary without re-checking RBAC on a
 * row whose owner has already been validated.
 */
export const recordRunResult = internalMutation({
	args: {
		standingOrderId: v.id("aiStandingOrders"),
		summary: v.string(),
		status: v.union(v.literal("ok"), v.literal("error"), v.literal("skipped")),
	},
	handler: async (ctx, args) => {
		const row = await ctx.db.get(args.standingOrderId);
		if (!row) return { ok: false, reason: "not_found" } as const;
		await ctx.db.patch(args.standingOrderId, {
			lastRunAt: Date.now(),
			lastRunSummary: args.summary.slice(0, MAX_PROMPT_LENGTH),
			lastRunStatus: args.status,
			updatedAt: Date.now(),
		});
		return { ok: true } as const;
	},
});

/**
 * Open a synthetic aiConversations row for a standing-order run. The
 * row's `entityType` is "standingOrder" so the trace UI naturally
 * distinguishes autonomous runs from chat conversations, and the title
 * is the standing order's name so list views are scannable.
 *
 * Internal-only — not callable from clients. Lives here (rather than in
 * `runner.ts`) because Convex `use node` files cannot export mutations.
 */
export const openConversationForRun = internalMutation({
	args: {
		orgId: v.id("orgs"),
		userId: v.id("users"),
		standingOrderId: v.id("aiStandingOrders"),
		name: v.string(),
	},
	handler: async (ctx, args) => {
		const now = Date.now();
		const id = await ctx.db.insert("aiConversations", {
			orgId: args.orgId,
			userId: args.userId,
			title: `Standing order — ${args.name}`,
			entityType: "standingOrder",
			entityId: args.standingOrderId,
			status: "active",
			lastMessageAt: now,
			createdAt: now,
			updatedAt: now,
		});
		return id;
	},
});

// ─── Public mutations ────────────────────────────────────────────────────

export const create = orgMutation({
	args: {
		orgId: v.id("orgs"),
		name: v.string(),
		prompt: v.string(),
		allowedTools: v.array(v.string()),
		schedule: scheduleValidator,
		enabled: v.optional(v.boolean()),
	},
	handler: async (ctx, args) => {
		const { member, userId } = await requireOrgMember(ctx, args.orgId);
		requireRole(member.permissions, "ai.automation.manage");
		return createImpl(ctx, {
			orgId: args.orgId,
			userId,
			ownerUserId: userId,
			name: args.name,
			prompt: args.prompt,
			allowedTools: args.allowedTools,
			schedule: args.schedule,
			enabled: args.enabled,
		});
	},
});

export const update = orgMutation({
	args: {
		orgId: v.id("orgs"),
		standingOrderId: v.id("aiStandingOrders"),
		name: v.optional(v.string()),
		prompt: v.optional(v.string()),
		allowedTools: v.optional(v.array(v.string())),
		schedule: v.optional(scheduleValidator),
		enabled: v.optional(v.boolean()),
	},
	handler: async (ctx, args) => {
		const { member, userId } = await requireOrgMember(ctx, args.orgId);
		requireRole(member.permissions, "ai.automation.manage");
		return updateImpl(ctx, { ...args, userId });
	},
});

export const remove = orgMutation({
	args: {
		orgId: v.id("orgs"),
		standingOrderId: v.id("aiStandingOrders"),
	},
	handler: async (ctx, args) => {
		const { member, userId } = await requireOrgMember(ctx, args.orgId);
		requireRole(member.permissions, "ai.automation.manage");
		return removeImpl(ctx, { ...args, userId });
	},
});

// ─── ForAI twins (per AGENTS.md non-negotiable rule) ─────────────────────

export const createForAI = internalMutation({
	args: {
		orgId: v.id("orgs"),
		userId: v.id("users"),
		name: v.string(),
		prompt: v.string(),
		allowedTools: v.array(v.string()),
		schedule: scheduleValidator,
		enabled: v.optional(v.boolean()),
	},
	handler: async (ctx, args) => {
		const { member } = await requireOrgMemberByIds(ctx, args.orgId, args.userId);
		requireRole(member.permissions, "ai.automation.manage");
		return createImpl(ctx, {
			orgId: args.orgId,
			userId: args.userId,
			ownerUserId: args.userId,
			name: args.name,
			prompt: args.prompt,
			allowedTools: args.allowedTools,
			schedule: args.schedule,
			enabled: args.enabled,
		});
	},
});

export const updateForAI = internalMutation({
	args: {
		orgId: v.id("orgs"),
		userId: v.id("users"),
		standingOrderId: v.id("aiStandingOrders"),
		name: v.optional(v.string()),
		prompt: v.optional(v.string()),
		allowedTools: v.optional(v.array(v.string())),
		schedule: v.optional(scheduleValidator),
		enabled: v.optional(v.boolean()),
	},
	handler: async (ctx, args) => {
		const { member } = await requireOrgMemberByIds(ctx, args.orgId, args.userId);
		requireRole(member.permissions, "ai.automation.manage");
		return updateImpl(ctx, args);
	},
});

export const removeForAI = internalMutation({
	args: {
		orgId: v.id("orgs"),
		userId: v.id("users"),
		standingOrderId: v.id("aiStandingOrders"),
	},
	handler: async (ctx, args) => {
		const { member } = await requireOrgMemberByIds(ctx, args.orgId, args.userId);
		requireRole(member.permissions, "ai.automation.manage");
		return removeImpl(ctx, args);
	},
});

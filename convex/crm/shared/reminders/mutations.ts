/**
 * Reminders Mutations — convex/crm/shared/reminders/mutations.ts
 * STATUS: IMPLEMENTED
 *
 * followUpCode auto-generated (FU-001). Every reminder MUST have a personCode.
 *
 * Permission model:
 *   - create:   `reminders.create`
 *   - complete: assignee OR `reminders.manage`
 *   - update:   assignee OR `reminders.manage`
 *   - remove:   assignee OR `reminders.manage`
 *
 * Every mutation logs activity.
 */
import { ConvexError, v } from "convex/values";
import { orgMutation, requireOrgMember } from "../../../_functions/authenticated";
import { ERRORS } from "../../../_shared/errors";
import { hasPermission, requireRole } from "../../../_shared/permissions";
import { enforceRateLimit, RATE_LIMITS } from "../../../_shared/rateLimit";
import { generateEntityCode } from "../../../_shared/recordCodes";
import { logActivity } from "../../../activityLogs/helpers";
import { sendNotification } from "../../../notifications/helpers";

export const create = orgMutation({
	args: {
		orgId: v.id("orgs"),
		personCode: v.string(),
		dealCode: v.optional(v.string()),
		entityType: v.string(),
		entityId: v.string(),
		title: v.string(),
		note: v.optional(v.string()),
		dueAt: v.number(),
		assignedTo: v.id("users"),
		/**
		 * Closed union — must match the schema. Adds the new `note` and
		 * `system` literals; legacy `manual`/`followup`/`calendar`/`ai`
		 * unchanged. See CODE-ARCHITECTURE-TIMELINE-FOLLOWUPS.md §1.
		 */
		source: v.union(
			v.literal("manual"),
			v.literal("followup"),
			v.literal("calendar"),
			v.literal("ai"),
			v.literal("note"),
			v.literal("system"),
		),
		/** Optional triage priority — used by the Follow-ups view for sort/chip color. */
		priority: v.optional(
			v.union(v.literal("low"), v.literal("normal"), v.literal("high"), v.literal("urgent")),
		),
	},
	handler: async (ctx, args) => {
		const { member, userId } = await requireOrgMember(ctx, args.orgId);
		requireRole(member.permissions, "reminders.create");
		await enforceRateLimit(ctx, {
			scope: "reminders.create",
			key: `${userId}:${args.orgId}`,
			...RATE_LIMITS.write,
		});

		const followUpCode = await generateEntityCode(ctx, args.orgId, "followup");
		const now = Date.now();

		const reminderId = await ctx.db.insert("reminders", {
			orgId: args.orgId,
			followUpCode,
			personCode: args.personCode,
			dealCode: args.dealCode,
			entityType: args.entityType,
			entityId: args.entityId,
			title: args.title,
			note: args.note,
			dueAt: args.dueAt,
			assignedTo: args.assignedTo,
			status: "pending",
			source: args.source,
			priority: args.priority,
			createdAt: now,
			updatedAt: now,
		});

		await logActivity(ctx, {
			orgId: args.orgId,
			userId,
			action: "reminder_created",
			entityType: args.entityType,
			entityId: args.entityId,
			personCode: args.personCode,
			description: `Reminder set: ${args.title}`,
			metadata: { followUpCode, reminderId },
		});

		if (args.assignedTo !== userId) {
			await sendNotification(ctx, {
				orgId: args.orgId,
				userId: args.assignedTo,
				type: "reminder.created",
				title: `New reminder: ${args.title}`,
				entityType: args.entityType,
				entityId: args.entityId,
				metadata: { followUpCode, personCode: args.personCode },
			});
		}

		return { reminderId, followUpCode };
	},
});

/** Authorization helper: assignee can act, OR a member with `reminders.manage`. */
function canActOnReminder(
	member: { permissions: string[] },
	userId: string,
	reminderAssignedTo: string,
): boolean {
	return reminderAssignedTo === userId || hasPermission(member.permissions, "reminders.manage");
}

export const complete = orgMutation({
	args: { orgId: v.id("orgs"), reminderId: v.id("reminders") },
	handler: async (ctx, args) => {
		const { member, userId } = await requireOrgMember(ctx, args.orgId);

		const reminder = await ctx.db.get(args.reminderId);
		if (!reminder || reminder.orgId !== args.orgId) throw new ConvexError(ERRORS.NOT_FOUND);
		if (!canActOnReminder(member, userId, reminder.assignedTo)) {
			throw new ConvexError(ERRORS.FORBIDDEN);
		}
		// Per SCHEDULING-IMPLEMENTATION.md §4.7 — every public mutation
		// triggered by a user gesture is rate-limited. Scope is shared
		// across reminder writes so a frantic user can't bypass by
		// alternating between complete / update / remove.
		await enforceRateLimit(ctx, {
			scope: "reminders.write",
			key: `${userId}:${args.orgId}`,
			...RATE_LIMITS.write,
		});

		const now = Date.now();
		await ctx.db.patch(args.reminderId, {
			status: "completed",
			completedAt: now,
			updatedAt: now,
		});

		await logActivity(ctx, {
			orgId: args.orgId,
			userId,
			action: "reminder_completed",
			entityType: reminder.entityType,
			entityId: reminder.entityId,
			personCode: reminder.personCode,
			description: `Reminder completed: ${reminder.title}`,
			metadata: { followUpCode: reminder.followUpCode, reminderId: args.reminderId },
		});

		// Notify the original creator if they aren't the assignee/actor.
		if (reminder.assignedTo !== userId) {
			await sendNotification(ctx, {
				orgId: args.orgId,
				userId: reminder.assignedTo,
				type: "reminder.completed",
				title: `Reminder completed: ${reminder.title}`,
				entityType: reminder.entityType,
				entityId: reminder.entityId,
				metadata: { followUpCode: reminder.followUpCode },
			});
		}
	},
});

export const update = orgMutation({
	args: {
		orgId: v.id("orgs"),
		reminderId: v.id("reminders"),
		title: v.optional(v.string()),
		note: v.optional(v.string()),
		dueAt: v.optional(v.number()),
		assignedTo: v.optional(v.id("users")),
		/** Optional priority change — used by the Follow-ups view's triage chip. */
		priority: v.optional(
			v.union(v.literal("low"), v.literal("normal"), v.literal("high"), v.literal("urgent")),
		),
	},
	handler: async (ctx, args) => {
		const { member, userId } = await requireOrgMember(ctx, args.orgId);

		const reminder = await ctx.db.get(args.reminderId);
		if (!reminder || reminder.orgId !== args.orgId) throw new ConvexError(ERRORS.NOT_FOUND);
		if (!canActOnReminder(member, userId, reminder.assignedTo)) {
			throw new ConvexError(ERRORS.FORBIDDEN);
		}
		// Shared rate-limit scope across reminder writes (see complete).
		await enforceRateLimit(ctx, {
			scope: "reminders.write",
			key: `${userId}:${args.orgId}`,
			...RATE_LIMITS.write,
		});

		const { orgId: _o, reminderId: _r, ...updates } = args;
		const patch: Record<string, unknown> = Object.fromEntries(
			Object.entries(updates).filter(([, val]) => val !== undefined),
		);
		// Server-stamped — never trust the client's clock.
		patch.updatedAt = Date.now();

		await ctx.db.patch(args.reminderId, patch);

		await logActivity(ctx, {
			orgId: args.orgId,
			userId,
			action: "reminder_updated",
			entityType: reminder.entityType,
			entityId: reminder.entityId,
			personCode: reminder.personCode,
			description: `Reminder updated: ${reminder.title}`,
			metadata: { followUpCode: reminder.followUpCode, reminderId: args.reminderId },
		});
	},
});

export const remove = orgMutation({
	args: { orgId: v.id("orgs"), reminderId: v.id("reminders") },
	handler: async (ctx, args) => {
		const { member, userId } = await requireOrgMember(ctx, args.orgId);

		const reminder = await ctx.db.get(args.reminderId);
		if (!reminder || reminder.orgId !== args.orgId) throw new ConvexError(ERRORS.NOT_FOUND);
		if (!canActOnReminder(member, userId, reminder.assignedTo)) {
			throw new ConvexError(ERRORS.FORBIDDEN);
		}
		// Shared rate-limit scope across reminder writes (see complete).
		await enforceRateLimit(ctx, {
			scope: "reminders.write",
			key: `${userId}:${args.orgId}`,
			...RATE_LIMITS.write,
		});

		await ctx.db.delete(args.reminderId);

		await logActivity(ctx, {
			orgId: args.orgId,
			userId,
			action: "reminder_deleted",
			entityType: reminder.entityType,
			entityId: reminder.entityId,
			personCode: reminder.personCode,
			description: `Reminder deleted: ${reminder.title}`,
			metadata: { followUpCode: reminder.followUpCode, reminderId: args.reminderId },
		});
	},
});

// ─── Follow-ups ──────────────────────────────────────────────────────────────
//
// Doctrine (CODE-ARCHITECTURE-TIMELINE-FOLLOWUPS.md): follow-ups are
// reminders with `source === "followup"`. We expose a separate mutation
// because:
//   - The AI tool registry maps `create_followup` → this mutation, with a
//     CRM-cadence-specific arg schema (personCode + dealCode + priority +
//     optional dueAt). The model picks one tool unambiguously instead of
//     guessing which `source` literal to pass to the generic `create`.
//   - The activity log writes `followup_created` instead of
//     `reminder_created` so the timeline narrative reads naturally
//     ("Sara created a follow-up with Acme" vs "Sara created a reminder").
//   - The mutation reads `org.settings.followupDefaults` to compute the
//     default `dueAt` (today + N days) and `priority` when the caller
//     leaves them unset. The reminders surface doesn't share this default
//     resolution.
//
// All persistence still lands in the same `reminders` table and shares
// indexes / RBAC / notifications with the existing flows. The only
// difference visible to consumers is the `source === "followup"`
// discriminator and the activity-log verb.

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

/** Default `defaultDueOffsetDays` when org.settings.followupDefaults is unset. */
const DEFAULT_FOLLOWUP_OFFSET_DAYS = 3;

/** Default priority chip on a new follow-up when org settings are unset. */
const DEFAULT_FOLLOWUP_PRIORITY = "normal" as const;

export const createFollowup = orgMutation({
	args: {
		orgId: v.id("orgs"),
		/** The person we're following up with — required. */
		personCode: v.string(),
		/** Optional deal context. The follow-up's calendar/timeline narrative shows this when set. */
		dealCode: v.optional(v.string()),
		/**
		 * Optional pre-bound entity. When unset, the follow-up attaches
		 * to the person itself (`entityType="person"`, `entityId=personCode`).
		 */
		entityType: v.optional(v.string()),
		entityId: v.optional(v.string()),
		title: v.string(),
		note: v.optional(v.string()),
		/**
		 * When unset, computed as `Date.now() + defaultDueOffsetDays * 1d`
		 * using `org.settings.followupDefaults.defaultDueOffsetDays`
		 * (fallback: 3 days).
		 */
		dueAt: v.optional(v.number()),
		/** Defaults to caller. */
		assignedTo: v.optional(v.id("users")),
		/**
		 * Defaults to `org.settings.followupDefaults.defaultPriority`
		 * (fallback: "normal").
		 */
		priority: v.optional(
			v.union(v.literal("low"), v.literal("normal"), v.literal("high"), v.literal("urgent")),
		),
	},
	handler: async (ctx, args) => {
		const { member, userId } = await requireOrgMember(ctx, args.orgId);
		requireRole(member.permissions, "reminders.create");
		await enforceRateLimit(ctx, {
			scope: "reminders.create",
			key: `${userId}:${args.orgId}`,
			...RATE_LIMITS.write,
		});

		// Resolve org-level defaults for unset fields.
		const org = await ctx.db.get(args.orgId);
		const followupDefaults =
			(
				org?.settings as {
					followupDefaults?: {
						defaultDueOffsetDays?: number;
						defaultPriority?: "low" | "normal" | "high" | "urgent";
					};
				}
			)?.followupDefaults ?? {};
		const offsetDays = Math.max(
			1,
			Math.min(365, followupDefaults.defaultDueOffsetDays ?? DEFAULT_FOLLOWUP_OFFSET_DAYS),
		);
		const resolvedDueAt = args.dueAt ?? Date.now() + offsetDays * ONE_DAY_MS;
		const resolvedPriority =
			args.priority ?? followupDefaults.defaultPriority ?? DEFAULT_FOLLOWUP_PRIORITY;
		const resolvedAssignee = args.assignedTo ?? userId;

		// Default the entity binding to the person profile when the caller
		// didn't pre-bind a deal/company tab.
		const entityType = args.entityType ?? "person";
		const entityId = args.entityId ?? args.personCode;

		const followUpCode = await generateEntityCode(ctx, args.orgId, "followup");
		const now = Date.now();

		const reminderId = await ctx.db.insert("reminders", {
			orgId: args.orgId,
			followUpCode,
			personCode: args.personCode,
			dealCode: args.dealCode,
			entityType,
			entityId,
			title: args.title,
			note: args.note,
			dueAt: resolvedDueAt,
			assignedTo: resolvedAssignee,
			status: "pending",
			source: "followup",
			priority: resolvedPriority,
			createdAt: now,
			updatedAt: now,
		});

		// Distinct activity verb so the timeline narrative is unambiguous.
		await logActivity(ctx, {
			orgId: args.orgId,
			userId,
			action: "followup_created",
			entityType,
			entityId,
			personCode: args.personCode,
			description: `Follow-up scheduled: ${args.title}`,
			metadata: { followUpCode, reminderId, priority: resolvedPriority },
		});

		if (resolvedAssignee !== userId) {
			await sendNotification(ctx, {
				orgId: args.orgId,
				userId: resolvedAssignee,
				type: "reminder.created",
				title: `New follow-up: ${args.title}`,
				entityType,
				entityId,
				metadata: { followUpCode, personCode: args.personCode },
			});
		}

		return { reminderId, followUpCode, dueAt: resolvedDueAt, priority: resolvedPriority };
	},
});

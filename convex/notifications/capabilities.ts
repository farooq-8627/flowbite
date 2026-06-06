/**
 * Notifications capabilities — the AI-callable surface for the per-user
 * notification feed. Wraps the existing `*ForAI` internal twins in
 * `queries.ts` + `mutations.ts`; never re-implements business logic.
 *
 * Surface (3 caps in the `notifications` group):
 *
 *   list_notifications              user's notifications scoped to the org
 *   mark_notification_read          flip a single notification to read
 *   mark_all_notifications_read     bulk-flip all unread (org-scoped)
 *
 * Group invariants:
 *
 *   1. Notifications are USER-SCOPED at the schema layer (`userId`). The AI
 *      tools all act on the calling user's rows — never another user's.
 *   2. Org filtering is always applied so the AI can't surface a notification
 *      the user got from a different org they're a member of (cross-tenant
 *      leak prevention).
 *   3. `mark_*_read` mutations are idempotent — already-read rows are a
 *      silent no-op. `mark_all_notifications_read` returns the count flipped
 *      so the AI can surface a meaningful headline.
 */
import { z } from "zod";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { defineCapability } from "../ai/registry/define";
import { defineGroup } from "../ai/registry/groups";
import { ok } from "../ai/registry/result";

// ─── Group playbook ─────────────────────────────────────────────────────────

defineGroup({
	name: "notifications",
	playbook: `Read first → \`list_notifications\` (optional \`onlyUnread\` filter). The notification's Convex \`_id\` is the handle for \`mark_notification_read\`. \`mark_all_notifications_read\` is the bulk version — it flips every unread notification in the current org to read and returns the count.

Permission: \`notifications.viewOwn\` for the read; \`notifications.markRead\` for the mark verbs. The mutations are user-scoped at the schema layer — the AI can never act on another user's notifications, even with admin permissions.`,
});

// ─── list_notifications ─────────────────────────────────────────────────────

const listNotifications = defineCapability<{
	onlyUnread?: boolean;
	limit?: number;
}>({
	name: "list_notifications",
	module: "notifications",
	group: "notifications",
	permission: "notifications.viewOwn",
	risk: "safe",
	channels: ["chat", "whatsapp", "mcp", "rest"],
	spec: {
		whenToCall:
			"List the user's notifications scoped to the current org. Pass `onlyUnread:true` to surface just the unread bucket. Sorted newest first; archived rows are excluded.",
		whenNotToCall:
			"the user wants the notification COUNT — that's a separate UI element (no dedicated tool); for 'what's new since I logged in?' use this with `onlyUnread:true`.",
		synonyms: ["my notifications", "what's new", "unread", "alerts", "inbox"],
		goodExample: { onlyUnread: true, limit: 20 },
	},
	drive: {
		onSuccess:
			"Narrate the count + the top 3 by recency. The result card carries the full list. If 0 unread, say so plainly.",
		onEmpty:
			"No notifications. If the user asked for unread specifically, offer to drop the filter.",
	},
	input: z.object({
		onlyUnread: z
			.boolean()
			.optional()
			.describe("true → unread only. false / unset → all notifications including read."),
		limit: z
			.number()
			.int()
			.min(1)
			.max(100)
			.optional()
			.default(50)
			.describe("Maximum rows. Default 50, max 100."),
	}),
	run: async (cap, args) => {
		const { ctx, principal } = cap;
		const rows = (await ctx.runQuery(internal.notifications.queries.listMineForAI, {
			orgId: principal.orgId,
			userId: principal.userId,
			onlyUnread: args.onlyUnread,
			limit: args.limit ?? 50,
		})) as Array<{
			_id: Id<"notifications">;
			type: string;
			title: string;
			body?: string;
			read: boolean;
			createdAt: number;
		}>;

		if (rows.length === 0) {
			return ok({
				headline: args.onlyUnread ? "No unread notifications." : "No notifications.",
				facts: args.onlyUnread ? ["Drop `onlyUnread` to include read items."] : undefined,
				data: { notifications: [] as unknown[] },
			});
		}

		const top = rows.slice(0, 5);
		const unreadCount = rows.filter((r) => !r.read).length;
		return ok({
			headline: `${rows.length} notification${rows.length === 1 ? "" : "s"}${unreadCount > 0 ? ` (${unreadCount} unread)` : ""}.`,
			changes: top.map((n) => ({
				label: n.read ? "·" : "•", // bullet for unread
				value: `${n.title}${n.body ? ` — ${n.body.slice(0, 60)}` : ""}`,
				emphasis: n.read ? ("unchanged" as const) : ("added" as const),
			})),
			data: { notifications: rows, unreadCount },
		});
	},
});

// ─── mark_notification_read ─────────────────────────────────────────────────

const markNotificationRead = defineCapability<{ notificationId: string }>({
	name: "mark_notification_read",
	module: "notifications",
	group: "notifications",
	permission: "notifications.markRead",
	risk: "reversible",
	channels: ["chat", "whatsapp", "mcp", "rest"],
	spec: {
		whenToCall:
			"Flip a single notification to read by its Convex _id. Idempotent — already-read rows are a silent no-op. Use after `list_notifications` surfaces the _id.",
		whenNotToCall:
			"the user wants to flip ALL unread to read — call mark_all_notifications_read.",
		requiredClarifications: ["notificationId"],
		synonyms: ["mark read", "dismiss notification"],
		goodExample: { notificationId: "k123abc" },
		badExample: {
			args: { notificationId: "the latest one" },
			why: "notificationId must be the Convex _id. List first, then pass the id from the result.",
		},
	},
	drive: {
		onSuccess: "Confirm in one short sentence.",
		onValidationError:
			"If the notificationId didn't resolve OR doesn't belong to the caller, the mutation is a silent no-op (returns nothing). Surface 'no change' if you can't confirm a flip.",
	},
	input: z.object({
		notificationId: z.string().min(1).describe("The notification's Convex _id."),
	}),
	run: async (cap, args) => {
		const { ctx, principal } = cap;
		await ctx.runMutation(internal.notifications.mutations.markReadForAI, {
			orgId: principal.orgId,
			userId: principal.userId,
			notificationId: args.notificationId as Id<"notifications">,
		});
		return ok({
			headline: "Notification marked read.",
			changes: [
				{ label: "Notification", value: args.notificationId, emphasis: "unchanged" },
				{ label: "State", value: "read", emphasis: "changed" },
			],
			data: { notificationId: args.notificationId },
		});
	},
});

// ─── mark_all_notifications_read ────────────────────────────────────────────

const markAllNotificationsRead = defineCapability<Record<string, never>>({
	name: "mark_all_notifications_read",
	module: "notifications",
	group: "notifications",
	permission: "notifications.markRead",
	risk: "reversible",
	channels: ["chat", "whatsapp", "mcp", "rest"],
	spec: {
		whenToCall:
			"Mark every unread notification in the current org as read for the calling user. Use for 'mark all read' / 'inbox zero'. Idempotent — if there's nothing unread the call returns count:0.",
		whenNotToCall:
			"the user wants to mark ONE notification (use mark_notification_read) or wants notifications across MULTIPLE orgs (this is org-scoped — they need to switch orgs and re-call).",
		synonyms: ["mark all read", "clear notifications", "inbox zero", "dismiss all"],
		goodExample: {},
	},
	drive: {
		onSuccess:
			"Reply with the count of notifications flipped (`data.updated`). If 0, say so plainly — don't pretend a change happened.",
	},
	input: z.object({}),
	run: async (cap) => {
		const { ctx, principal } = cap;
		const result = (await ctx.runMutation(internal.notifications.mutations.markAllReadForAI, {
			orgId: principal.orgId,
			userId: principal.userId,
		})) as { updated: number };
		return ok({
			headline:
				result.updated === 0
					? "No unread notifications — nothing to mark."
					: `Marked ${result.updated} notification${result.updated === 1 ? "" : "s"} read.`,
			changes: [
				{
					label: "Flipped",
					value: String(result.updated),
					emphasis: result.updated === 0 ? "unchanged" : "changed",
				},
			],
			data: { updated: result.updated },
		});
	},
});

// ─── Public surface ─────────────────────────────────────────────────────────

export const NOTIFICATIONS_CAPABILITIES = [
	listNotifications,
	markNotificationRead,
	markAllNotificationsRead,
];

/**
 * Proactive capabilities — the AI-callable surface for `aiNextActions`,
 * the user-scoped ranked list of suggested next moves (stale leads,
 * stuck deals, overdue tasks). Wraps the existing `*ForAI` internal
 * twins under `convex/ai/queries/nextActions.ts`; never re-implements
 * the rebuild logic.
 *
 * Surface (3 caps in the `proactive` group):
 *
 *   list_next_actions         user's ranked list (default 25 rows)
 *   dismiss_next_action       remove a row + record fingerprint so
 *                             the next rebuild suppresses it
 *   refresh_next_actions      schedule a fresh rebuild for the user
 *                             (rate-limited, soft-fails on quota)
 *
 * Group invariants:
 *
 *   1. EVERY row is user-scoped at the schema layer — the AI never
 *      surfaces another user's queue. Permission gate: `leads.view`
 *      (the same low-bar gate the AISuggestionsPanel uses).
 *   2. `dismiss_next_action` records the row's fingerprint
 *      (recordKind:recordCode:reasonCode) on the user's
 *      `aiPulseDismissed` map so the next rebuild suppresses the same
 *      reason. The map is capped at 50 entries (FIFO).
 *   3. `refresh_next_actions` is BACK-PRESSURE-AWARE: rate-limited to
 *      5/min/user-org. When the rate-limit fires, the cap returns a
 *      `partial` envelope with `rateLimited:true` instead of failing.
 *      Schedules `rebuildForUser` async.
 *   4. Risk: `safe` for read; `reversible` for dismiss + refresh.
 */
import { z } from "zod";
import { internal } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";
import { defineCapability } from "../registry/define";
import { defineGroup } from "../registry/groups";
import { ok, partial } from "../registry/result";

// ─── Group playbook ─────────────────────────────────────────────────────────

defineGroup({
	name: "proactive",
	playbook: `Read first → \`list_next_actions\` to surface the user's ranked queue (top suggestions to act on right now). Each row carries a \`recordKind\`+\`recordCode\` you can drill into via \`describe_entity\` / \`get_task_by_code\`.

Dismiss → \`dismiss_next_action\` removes a row by its Convex \`_id\` (returned from list_next_actions). Records the fingerprint so the next rebuild suppresses the SAME reason on the SAME record.

Refresh → \`refresh_next_actions\` schedules a fresh rebuild. Rate-limited (5/min/user-org). When throttled, returns a \`partial\` envelope with \`rateLimited:true\` — the user sees "rate-limited, try again in a minute".

Permission gate: \`leads.view\` (same low bar as the AISuggestionsPanel).`,
});

// ─── list_next_actions ──────────────────────────────────────────────────────

const listNextActions = defineCapability<{ limit?: number }>({
	name: "list_next_actions",
	module: "proactive",
	group: "proactive",
	permission: "leads.view",
	risk: "safe",
	channels: ["chat", "whatsapp", "mcp", "rest"],
	spec: {
		whenToCall:
			"Read the calling user's ranked list of next actions (stale leads, stuck deals, overdue tasks). Snoozed rows are filtered out. Sorted by score (desc).",
		whenNotToCall:
			"the user wants the org-wide TIMELINE — call list_org_timeline. The user wants their calendar — that's the scheduling group.",
		synonyms: ["next actions", "what's next", "ai pulse", "to-do recommendations"],
		goodExample: { limit: 25 },
	},
	drive: {
		onSuccess: "Narrate the count + the top 3 by score. The card carries the full list.",
		onEmpty:
			"Workspace is calm — nothing flagged right now. Call refresh_next_actions to force a rebuild.",
	},
	input: z.object({
		limit: z.number().int().min(1).max(100).optional().default(25),
	}),
	run: async (cap, args) => {
		const { ctx, principal } = cap;
		const result = (await ctx.runQuery(internal.ai.queries.nextActions.listForUserForAI, {
			orgId: principal.orgId,
			userId: principal.userId,
			limit: args.limit,
		})) as {
			count: number;
			generatedAt: number | null;
			rows: Array<{
				id: string;
				recordKind: string;
				recordCode: string;
				score: number;
				confidence: string;
				reasonCode: string;
				reasonText: string;
				suggestedIntent?: string;
				dueAt?: number;
			}>;
		};
		if (result.count === 0) {
			return ok({
				headline: "No next actions right now — workspace is calm.",
				facts: ["Try `refresh_next_actions` to force a rebuild."],
				data: result,
			});
		}
		return ok({
			headline: `${result.count} suggested next action${result.count === 1 ? "" : "s"}.`,
			changes: result.rows.slice(0, 5).map((r) => ({
				label: `${r.recordCode} (${r.recordKind})`,
				value: r.reasonText,
				emphasis: "unchanged" as const,
			})),
			data: result,
			suggestedNext: result.rows.slice(0, 3).map((r) => ({
				label: r.reasonText,
				intent: r.suggestedIntent ?? r.reasonText,
			})),
		});
	},
});

// ─── dismiss_next_action ────────────────────────────────────────────────────

const dismissNextAction = defineCapability<{ actionId: string }>({
	name: "dismiss_next_action",
	module: "proactive",
	group: "proactive",
	permission: "leads.view",
	risk: "reversible",
	channels: ["chat", "whatsapp", "mcp", "rest"],
	spec: {
		whenToCall:
			"Remove a next-action row by its Convex `_id`. Records the row's fingerprint on the user's aiPulseDismissed map so the next rebuild suppresses the same reason on the same record.",
		whenNotToCall:
			"the user wants to ACT on the row (call task / lead / deal verbs). The user wants to SNOOZE — that's a separate snooze surface (not yet exposed; behaviour identical to dismiss for v1).",
		requiredClarifications: ["actionId"],
		synonyms: ["dismiss", "ignore action", "remove suggestion", "snooze"],
		goodExample: { actionId: "k123abc" },
		badExample: {
			args: { actionId: "the latest one" },
			why: "actionId must be the Convex _id (from list_next_actions).",
		},
	},
	drive: {
		onSuccess: "Confirm in one short sentence — 'Dismissed.'.",
	},
	input: z.object({
		actionId: z.string().min(1),
	}),
	run: async (cap, args) => {
		const { ctx, principal } = cap;
		const result = (await ctx.runMutation(
			internal.ai.queries.nextActions.dismissNextActionForAI,
			{
				orgId: principal.orgId,
				userId: principal.userId,
				actionId: args.actionId as Id<"aiNextActions">,
			},
		)) as { dismissed: string };
		return ok({
			headline: "Suggestion dismissed.",
			changes: [
				{ label: "Fingerprint", value: result.dismissed, emphasis: "changed" as const },
			],
			data: result,
		});
	},
});

// ─── refresh_next_actions ───────────────────────────────────────────────────

const refreshNextActions = defineCapability<Record<string, never>>({
	name: "refresh_next_actions",
	module: "proactive",
	group: "proactive",
	permission: "leads.view",
	risk: "reversible",
	channels: ["chat", "mcp", "rest"],
	spec: {
		whenToCall:
			"Schedule a fresh rebuild of the user's next-actions list. Rate-limited to 5/min/user-org. Returns immediately — the new list lands on the next reactive cycle.",
		whenNotToCall:
			"the list was JUST refreshed (rate-limit fires) — call list_next_actions and wait. No need to refresh just because the list LOOKS stale; cron rebuilds nightly.",
		synonyms: ["refresh suggestions", "rebuild pulse", "regenerate next actions"],
		goodExample: {},
	},
	drive: {
		onSuccess:
			"Confirm scheduling. If rate-limited, surface that explicitly so the user knows to retry.",
	},
	input: z.object({}),
	run: async (cap) => {
		const { ctx, principal } = cap;
		const result = (await ctx.runMutation(
			internal.ai.queries.nextActions.lazyWarmForUserForAI,
			{
				orgId: principal.orgId,
				userId: principal.userId,
			},
		)) as { scheduled: true } | { scheduled: false; rateLimited: true };

		if (result.scheduled) {
			return ok({
				headline: "Refresh scheduled — should land in a few seconds.",
				data: result,
			});
		}
		return partial({
			headline: "Already refreshing — try again in a minute.",
			facts: ["Refresh is rate-limited to 5/min."],
			data: result,
		});
	},
});

// ─── Public surface ─────────────────────────────────────────────────────────

export const PROACTIVE_CAPABILITIES = [listNextActions, dismissNextAction, refreshNextActions];

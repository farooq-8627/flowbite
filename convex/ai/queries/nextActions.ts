/**
 * convex/ai/queries/nextActions.ts
 *
 * Stage 6 of /SPRINT-PLAN.md (Proactive layer). Heuristic ranker that
 * computes "what should this user do next?" without any LLM call.
 *
 * The function-level helper `computeRanking` is pure — it takes the
 * already-fetched leads / deals / reminders for the user, scores each,
 * and returns the ranked top-N. Pure-function shape lets us unit-test
 * the heuristic deterministically and keeps the mutation that
 * materialises the rows minimal.
 *
 * Surfaces:
 *   - `rebuildForUser` (internalMutation) — fired per-user from the
 *     30-min cron action `convex/ai/actions/rankNextActions:*`. Replaces
 *     the user's existing rows with the freshly-ranked top 100.
 *   - `listForUser` (orgQuery) — public read consumed by the
 *     `AIPulseRibbon` (top 3) and `AINextActionsView` (full list).
 *   - `listForUserForAI` (internalQuery) — twin for the AI tool
 *     `list_next_actions` per the AGENTS.md non-negotiable rule.
 *   - `dismissNextAction` (orgMutation) — Act / Dismiss / Snooze 7d
 *     handlers used by the ribbon + view. Snooze patches `snoozedUntil`;
 *     dismiss deletes the row + adds the suggestion id to
 *     `users.preferences.aiPulseDismissed` (reused from Stage 5) so the
 *     next rebuild can suppress it.
 *
 * Heuristic (deterministic, no LLM):
 *
 *   Reminders (assignedTo = userId, status = "pending"):
 *     - overdue (dueAt < now)               → score 80, confidence high
 *     - due in <24h                         → score 70, confidence high
 *     - due in 24-48h                       → score 50, confidence medium
 *     - due in 48-168h (this week)          → score 35, confidence medium
 *
 *   Leads (assignedTo = userId or unassigned-when-pickable, status not Won/Lost/Converted):
 *     - lastActivityAt > 7d                 → score 40, confidence medium  (lead_stale_7d)
 *     - lastActivityAt > 14d                → score 55, confidence medium  (lead_stale_14d)
 *
 *   Deals (assignedTo = userId, no wonAt/lostAt):
 *     - stageEnteredAt > 14d                → score 45, confidence medium  (deal_stuck_14d)
 *     - stageEnteredAt > 21d                → score 60, confidence high    (deal_stuck_21d)
 *     - + value present + value >= median   → +20 boost, max 100, reason `deal_stuck_high_value`
 *
 *   Confidence tier from final score:
 *     score ≥ 60 → high
 *     30 ≤ score < 60 → medium
 *     score < 30 → low (currently unreachable; reserved for future heuristics)
 */

import { ConvexError, v } from "convex/values";
import {
	orgMutation,
	orgQuery,
	requireOrgMember,
	requireOrgMemberByIds,
} from "../../_functions/authenticated";
import { internal } from "../../_generated/api";
import type { Doc, Id } from "../../_generated/dataModel";
import {
	internalMutation,
	internalQuery,
	type MutationCtx,
	type QueryCtx,
} from "../../_generated/server";
import { ERRORS } from "../../_shared/errors";
import { hasPermission } from "../../_shared/permissions/helpers";
import { enforceRateLimit } from "../../_shared/rateLimit";

// ─── Tunables (single source of truth) ───────────────────────────────────

export const NEXT_ACTIONS_PER_USER_CAP = 100;
export const NEXT_ACTIONS_TTL_MS = 90 * 24 * 60 * 60 * 1000;
export const STALE_LEAD_DAYS = 7;
export const STALE_LEAD_HOT_DAYS = 14;
export const STUCK_DEAL_DAYS = 14;
export const STUCK_DEAL_HOT_DAYS = 21;
export const SNOOZE_DURATION_MS = 7 * 24 * 60 * 60 * 1000;

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const HIGH_VALUE_BOOST = 20;

// ─── Public types ─────────────────────────────────────────────────────────

export type NextActionRecordKind = "lead" | "contact" | "deal" | "reminder" | "company";
export type NextActionConfidence = "high" | "medium" | "low";
export type NextActionReasonCode =
	| "reminder_overdue"
	| "reminder_due_soon"
	| "reminder_due_this_week"
	| "lead_stale_7d"
	| "lead_stale_14d"
	| "deal_stuck_14d"
	| "deal_stuck_21d"
	| "deal_stuck_high_value";

export type NextActionRow = {
	recordKind: NextActionRecordKind;
	recordCode: string;
	score: number;
	confidence: NextActionConfidence;
	reasonCode: NextActionReasonCode;
	reasonText: string;
	suggestedIntent: string;
	dueAt?: number;
};

// ─── Pure heuristic — exported for tests ──────────────────────────────────

export function classifyConfidence(score: number): NextActionConfidence {
	if (score >= 60) return "high";
	if (score >= 30) return "medium";
	return "low";
}

function clampScore(n: number): number {
	if (!Number.isFinite(n)) return 0;
	return Math.max(0, Math.min(100, Math.round(n)));
}

/**
 * Pure ranker — takes already-fetched rows + a `now` cursor, returns
 * the materialisable top-N. Exported so tests can pin time.
 */
export function computeRanking(args: {
	now: number;
	reminders: ReadonlyArray<Doc<"tasks">>;
	leads: ReadonlyArray<Doc<"leads">>;
	deals: ReadonlyArray<Doc<"deals">>;
	dealMedianValue: number;
	cap?: number;
}): NextActionRow[] {
	const cap = args.cap ?? NEXT_ACTIONS_PER_USER_CAP;
	const out: NextActionRow[] = [];

	// Reminders.
	for (const r of args.reminders) {
		// Reminders don't carry a `softDelete` field — the schema only
		// applies `aiExcluded`. We therefore filter via `excludeFromAI`
		// (when set) + `status === "pending"`. Completed/cancelled rows
		// already exit because their `status` is anything other than
		// "pending".
		if (r.excludeFromAI === true) continue;
		if (r.status !== "pending") continue;
		const ms = r.dueAt - args.now;
		let row: NextActionRow | null = null;
		if (ms < 0) {
			const days = Math.max(1, Math.round(-ms / ONE_DAY_MS));
			const baseScore = clampScore(80 + Math.min(15, days));
			row = {
				recordKind: "reminder",
				recordCode: r.taskCode,
				score: baseScore,
				confidence: classifyConfidence(baseScore),
				reasonCode: "reminder_overdue",
				reasonText: `${r.title} was due ${days} day${days === 1 ? "" : "s"} ago.`,
				suggestedIntent: `Show ${r.taskCode} (${r.title}) and help me complete or reschedule it.`,
				dueAt: r.dueAt,
			};
		} else if (ms < ONE_DAY_MS) {
			row = {
				recordKind: "reminder",
				recordCode: r.taskCode,
				score: 70,
				confidence: classifyConfidence(70),
				reasonCode: "reminder_due_soon",
				reasonText: `${r.title} is due in the next 24 hours.`,
				suggestedIntent: `Show ${r.taskCode} (${r.title}) — I'd like to action it before it's overdue.`,
				dueAt: r.dueAt,
			};
		} else if (ms < 2 * ONE_DAY_MS) {
			row = {
				recordKind: "reminder",
				recordCode: r.taskCode,
				score: 50,
				confidence: classifyConfidence(50),
				reasonCode: "reminder_due_soon",
				reasonText: `${r.title} is due in the next 48 hours.`,
				suggestedIntent: `Plan time for ${r.taskCode} (${r.title}).`,
				dueAt: r.dueAt,
			};
		} else if (ms < 7 * ONE_DAY_MS) {
			row = {
				recordKind: "reminder",
				recordCode: r.taskCode,
				score: 35,
				confidence: classifyConfidence(35),
				reasonCode: "reminder_due_this_week",
				reasonText: `${r.title} is due this week.`,
				suggestedIntent: `Confirm next steps for ${r.taskCode} (${r.title}).`,
				dueAt: r.dueAt,
			};
		}
		if (row) out.push(row);
	}

	// Leads.
	const closedLeadStatuses = new Set(["Won", "Lost", "Converted"]);
	for (const l of args.leads) {
		if (l.deletedAt !== undefined) continue;
		if (closedLeadStatuses.has(l.status)) continue;
		const lastTouch = l.updatedAt ?? l.createdAt ?? args.now;
		const days = Math.floor((args.now - lastTouch) / ONE_DAY_MS);
		if (days >= STALE_LEAD_HOT_DAYS) {
			out.push({
				recordKind: "lead",
				recordCode: l.personCode,
				score: 55,
				confidence: classifyConfidence(55),
				reasonCode: "lead_stale_14d",
				reasonText: `${l.displayName} hasn't been touched in ${days} days.`,
				suggestedIntent: `Help me re-engage ${l.personCode} (${l.displayName}) — last contact was ${days} days ago.`,
			});
		} else if (days >= STALE_LEAD_DAYS) {
			out.push({
				recordKind: "lead",
				recordCode: l.personCode,
				score: 40,
				confidence: classifyConfidence(40),
				reasonCode: "lead_stale_7d",
				reasonText: `${l.displayName} hasn't been touched in ${days} days.`,
				suggestedIntent: `Suggest a follow-up for ${l.personCode} (${l.displayName}).`,
			});
		}
	}

	// Deals.
	for (const d of args.deals) {
		if (d.deletedAt !== undefined) continue;
		if (d.wonAt !== undefined || d.lostAt !== undefined) continue;
		const stuckMs = args.now - (d.stageEnteredAt ?? d.createdAt ?? args.now);
		const days = Math.floor(stuckMs / ONE_DAY_MS);
		if (days < STUCK_DEAL_DAYS) continue;

		const isHot = days >= STUCK_DEAL_HOT_DAYS;
		const baseScore = isHot ? 60 : 45;
		const reasonCode: NextActionReasonCode = isHot ? "deal_stuck_21d" : "deal_stuck_14d";
		const isHighValue =
			typeof d.value === "number" &&
			d.value > 0 &&
			args.dealMedianValue > 0 &&
			d.value >= args.dealMedianValue;
		const score = clampScore(baseScore + (isHighValue ? HIGH_VALUE_BOOST : 0));
		out.push({
			recordKind: "deal",
			recordCode: d.dealCode,
			score,
			confidence: classifyConfidence(score),
			reasonCode: isHighValue ? "deal_stuck_high_value" : reasonCode,
			reasonText: isHighValue
				? `${d.title} has been in the same stage ${days} days and is a high-value deal.`
				: `${d.title} has been in the same stage ${days} days.`,
			suggestedIntent: `Recommend the next move for deal ${d.dealCode} (${d.title}).`,
		});
	}

	// Sort score desc, deterministic tie-break by recordKind+code.
	out.sort((a, b) => {
		if (b.score !== a.score) return b.score - a.score;
		const kindOrder = a.recordKind.localeCompare(b.recordKind);
		if (kindOrder !== 0) return kindOrder;
		return a.recordCode.localeCompare(b.recordCode);
	});

	return out.slice(0, cap);
}

/**
 * Compute the median value across the active deals in the workspace.
 * Used by the high-value-deal boost — a deal whose `value` is >= the
 * org-wide median gets a +20 score push.
 */
export function computeDealMedianValue(deals: ReadonlyArray<Doc<"deals">>): number {
	const values: number[] = [];
	for (const d of deals) {
		if (d.deletedAt !== undefined) continue;
		if (d.wonAt !== undefined || d.lostAt !== undefined) continue;
		if (typeof d.value === "number" && d.value > 0) values.push(d.value);
	}
	if (values.length === 0) return 0;
	values.sort((a, b) => a - b);
	const mid = Math.floor(values.length / 2);
	return values.length % 2 === 0 ? (values[mid - 1] + values[mid]) / 2 : values[mid];
}

// ─── Db loaders shared by rebuild + tests ─────────────────────────────────

async function loadInputsForUser(
	ctx: QueryCtx | MutationCtx,
	orgId: Id<"orgs">,
	userId: Id<"users">,
) {
	const reminders = await ctx.db
		.query("tasks")
		.withIndex("by_user_and_due", (q) => q.eq("assignedTo", userId))
		.take(500);
	const remindersForOrg = reminders.filter((r) => r.orgId === orgId);

	const leads = await ctx.db
		.query("leads")
		.withIndex("by_org_and_assignee", (q) => q.eq("orgId", orgId).eq("assignedTo", userId))
		.take(500);

	const deals = await ctx.db
		.query("deals")
		.withIndex("by_org_and_assignee", (q) => q.eq("orgId", orgId).eq("assignedTo", userId))
		.take(500);

	// Median uses every active deal in the org (not just this user's) so
	// the high-value boost is calibrated to the workspace, not the user.
	const orgDeals = await ctx.db
		.query("deals")
		.withIndex("by_org", (q) => q.eq("orgId", orgId))
		.take(1000);

	return { reminders: remindersForOrg, leads, deals, orgDeals };
}

// ─── Internal mutation: rebuild for one user ─────────────────────────────

export const rebuildForUser = internalMutation({
	args: {
		orgId: v.id("orgs"),
		userId: v.id("users"),
	},
	handler: async (ctx, args) => {
		const inputs = await loadInputsForUser(ctx, args.orgId, args.userId);
		const dealMedianValue = computeDealMedianValue(inputs.orgDeals);
		const now = Date.now();

		const ranked = computeRanking({
			now,
			reminders: inputs.reminders,
			leads: inputs.leads,
			deals: inputs.deals,
			dealMedianValue,
		});

		// Replace the user's previous rows. The userId index keeps the read
		// bounded; cap is 100 so the delete burst is fine for a single tx.
		const previous = await ctx.db
			.query("aiNextActions")
			.withIndex("by_org_and_user", (q) =>
				q.eq("orgId", args.orgId).eq("userId", args.userId),
			)
			.collect();
		for (const row of previous) {
			await ctx.db.delete(row._id);
		}

		for (const row of ranked) {
			await ctx.db.insert("aiNextActions", {
				orgId: args.orgId,
				userId: args.userId,
				recordKind: row.recordKind,
				recordCode: row.recordCode,
				score: row.score,
				confidence: row.confidence,
				reasonCode: row.reasonCode,
				reasonText: row.reasonText,
				suggestedIntent: row.suggestedIntent,
				dueAt: row.dueAt,
				expiresAt: now + NEXT_ACTIONS_TTL_MS,
				createdAt: now,
			});
		}

		return {
			orgId: args.orgId,
			userId: args.userId,
			deleted: previous.length,
			inserted: ranked.length,
			dealMedianValue,
		};
	},
});

// ─── Per-category RBAC ────────────────────────────────────────────────────

/**
 * Map a member's permission array to the set of next-action record kinds
 * they may see. The ranked store mixes kinds in one list, so this is the
 * single place that decides "which categories does this role unlock?".
 * Mirrors the per-module view permissions in the catalog (`leads.view`,
 * `deals.view`, `contacts.view`, `companies.view`); reminders are sourced
 * from the `tasks` table so they gate on `tasks.view`. An empty set means
 * the member sees no proactive rows at all.
 */
function resolveAllowedKinds(permissions: readonly string[]): Set<NextActionRecordKind> {
	const allowed = new Set<NextActionRecordKind>();
	if (hasPermission(permissions, "leads.view")) allowed.add("lead");
	if (hasPermission(permissions, "contacts.view")) allowed.add("contact");
	if (hasPermission(permissions, "deals.view")) allowed.add("deal");
	if (hasPermission(permissions, "tasks.view")) allowed.add("reminder");
	if (hasPermission(permissions, "companies.view")) allowed.add("company");
	return allowed;
}

/**
 * Coarse "may this member use the pulse at all?" guard for the warm /
 * dismiss / snooze mutations. Throws FORBIDDEN only when the member can
 * view NONE of the proactive categories — replaces the old leads-specific
 * gate so a deals-only or tasks-only role can still warm + manage their
 * own ranked rows. Row-level ownership is still enforced separately by
 * `loadOwnedAction`.
 */
function requirePulseAccess(permissions: readonly string[]): void {
	if (resolveAllowedKinds(permissions).size === 0) {
		throw new ConvexError(ERRORS.FORBIDDEN);
	}
}

// ─── Public: list for current user ────────────────────────────────────────

export const listForUser = orgQuery({
	args: {
		orgId: v.id("orgs"),
		limit: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
		const { userId, member } = await requireOrgMember(ctx, args.orgId);
		// Per-category RBAC: the ranked store mixes lead / deal / reminder
		// (and future contact / company) rows in one list, so a single
		// coarse gate would leak a category the member's role can't see.
		// Resolve the kinds this member may view and filter to them. A
		// member with NO relevant view permission gets an empty list
		// (silent) instead of a thrown FORBIDDEN — the pulse just has
		// nothing to show.
		const allowedKinds = resolveAllowedKinds(member.permissions);
		if (allowedKinds.size === 0) {
			return { count: 0, generatedAt: null, rows: [] };
		}

		const limit = Math.max(1, Math.min(args.limit ?? NEXT_ACTIONS_PER_USER_CAP, 100));
		return readRanked(ctx, args.orgId, userId, limit, allowedKinds);
	},
});

export const listForUserForAI = internalQuery({
	args: {
		orgId: v.id("orgs"),
		userId: v.id("users"),
		limit: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
		const { member } = await requireOrgMemberByIds(ctx, args.orgId, args.userId);
		const allowedKinds = resolveAllowedKinds(member.permissions);
		if (allowedKinds.size === 0) {
			return { count: 0, generatedAt: null, rows: [] };
		}

		const limit = Math.max(1, Math.min(args.limit ?? NEXT_ACTIONS_PER_USER_CAP, 100));
		return readRanked(ctx, args.orgId, args.userId, limit, allowedKinds);
	},
});

async function readRanked(
	ctx: QueryCtx,
	orgId: Id<"orgs">,
	userId: Id<"users">,
	limit: number,
	allowedKinds: ReadonlySet<NextActionRecordKind>,
) {
	const now = Date.now();
	// Take the full per-user cap (the rebuild never stores more than
	// NEXT_ACTIONS_PER_USER_CAP rows) so the permission filter below can't
	// undercount — a naive `take(limit * 2)` could be filled entirely with
	// kinds the member can't view, starving the kinds they can.
	const rows = await ctx.db
		.query("aiNextActions")
		.withIndex("by_org_and_user_and_score", (q) => q.eq("orgId", orgId).eq("userId", userId))
		.order("desc")
		.take(NEXT_ACTIONS_PER_USER_CAP);

	const visible = rows
		.filter((r) => r.snoozedUntil === undefined || r.snoozedUntil <= now)
		.filter((r) => allowedKinds.has(r.recordKind as NextActionRecordKind))
		.slice(0, limit);

	return {
		count: visible.length,
		generatedAt: visible[0]?.createdAt ?? null,
		rows: visible.map((r) => ({
			id: r._id,
			recordKind: r.recordKind,
			recordCode: r.recordCode,
			score: r.score,
			confidence: r.confidence,
			reasonCode: r.reasonCode,
			reasonText: r.reasonText,
			suggestedIntent: r.suggestedIntent,
			dueAt: r.dueAt,
			snoozedUntil: r.snoozedUntil,
			createdAt: r.createdAt,
		})),
	};
}

// ─── Mutations: dismiss + snooze ──────────────────────────────────────────

async function loadOwnedAction(
	ctx: MutationCtx,
	id: Id<"aiNextActions">,
	expectedOrgId: Id<"orgs">,
	expectedUserId: Id<"users">,
) {
	const row = await ctx.db.get(id);
	if (!row) throw new ConvexError("NEXT_ACTION_NOT_FOUND");
	if (row.orgId !== expectedOrgId || row.userId !== expectedUserId) {
		throw new ConvexError("NEXT_ACTION_FORBIDDEN");
	}
	return row;
}

export const dismissNextAction = orgMutation({
	args: {
		orgId: v.id("orgs"),
		actionId: v.id("aiNextActions"),
	},
	handler: async (ctx, args) => {
		const { userId, member } = await requireOrgMember(ctx, args.orgId);
		requirePulseAccess(member.permissions);
		const row = await loadOwnedAction(ctx, args.actionId, args.orgId, userId);

		// Reuse the Stage 5 dismiss map so the next rebuild can suppress this
		// row's reason fingerprint. Capped at 50 by the writer (Stage 5 mut).
		const fingerprint = `${row.recordKind}:${row.recordCode}:${row.reasonCode}`;
		const existingPrefs = ctx.user.preferences ?? {};
		const dismissed = { ...(existingPrefs.aiPulseDismissed ?? {}) };
		dismissed[fingerprint] = Date.now();
		const entries = Object.entries(dismissed);
		if (entries.length > 50) {
			entries.sort((a, b) => b[1] - a[1]);
			const trimmed = Object.fromEntries(entries.slice(0, 50));
			await ctx.db.patch(userId, {
				preferences: { ...existingPrefs, aiPulseDismissed: trimmed },
				updatedAt: Date.now(),
			});
		} else {
			await ctx.db.patch(userId, {
				preferences: { ...existingPrefs, aiPulseDismissed: dismissed },
				updatedAt: Date.now(),
			});
		}

		await ctx.db.delete(args.actionId);
		return { dismissed: fingerprint };
	},
});

export const snoozeNextAction = orgMutation({
	args: {
		orgId: v.id("orgs"),
		actionId: v.id("aiNextActions"),
		days: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
		const { userId, member } = await requireOrgMember(ctx, args.orgId);
		requirePulseAccess(member.permissions);
		const row = await loadOwnedAction(ctx, args.actionId, args.orgId, userId);

		const days = Math.max(1, Math.min(args.days ?? 7, 30));
		const until = Date.now() + days * ONE_DAY_MS;
		await ctx.db.patch(args.actionId, { snoozedUntil: until });
		return { snoozedUntil: until, recordCode: row.recordCode };
	},
});

// ─── ForAI twins — H.13 V2 port ─────────────────────────────────────────
//
// Per AGENTS.md: every public mutation an AI capability calls has a
// matching `*ForAI` internal twin that takes a trusted `userId` arg.
// Mirror the public mutations exactly — same RBAC + dismiss-fingerprint
// logic — so the V2 capability can drive them from the runtime host.

export const dismissNextActionForAI = internalMutation({
	args: {
		orgId: v.id("orgs"),
		userId: v.id("users"),
		actionId: v.id("aiNextActions"),
	},
	handler: async (ctx, args) => {
		const { member } = await requireOrgMemberByIds(ctx, args.orgId, args.userId);
		requirePulseAccess(member.permissions);
		const row = await loadOwnedAction(ctx, args.actionId, args.orgId, args.userId);

		const fingerprint = `${row.recordKind}:${row.recordCode}:${row.reasonCode}`;
		const userDoc = await ctx.db.get(args.userId);
		const existingPrefs = userDoc?.preferences ?? {};
		const dismissed = { ...(existingPrefs.aiPulseDismissed ?? {}) };
		dismissed[fingerprint] = Date.now();
		const entries = Object.entries(dismissed);
		if (entries.length > 50) {
			entries.sort((a, b) => b[1] - a[1]);
			const trimmed = Object.fromEntries(entries.slice(0, 50));
			await ctx.db.patch(args.userId, {
				preferences: { ...existingPrefs, aiPulseDismissed: trimmed },
				updatedAt: Date.now(),
			});
		} else {
			await ctx.db.patch(args.userId, {
				preferences: { ...existingPrefs, aiPulseDismissed: dismissed },
				updatedAt: Date.now(),
			});
		}

		await ctx.db.delete(args.actionId);
		return { dismissed: fingerprint };
	},
});

export const snoozeNextActionForAI = internalMutation({
	args: {
		orgId: v.id("orgs"),
		userId: v.id("users"),
		actionId: v.id("aiNextActions"),
		days: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
		const { member } = await requireOrgMemberByIds(ctx, args.orgId, args.userId);
		requirePulseAccess(member.permissions);
		const row = await loadOwnedAction(ctx, args.actionId, args.orgId, args.userId);

		const days = Math.max(1, Math.min(args.days ?? 7, 30));
		const until = Date.now() + days * ONE_DAY_MS;
		await ctx.db.patch(args.actionId, { snoozedUntil: until });
		return { snoozedUntil: until, recordCode: row.recordCode };
	},
});

// ─── Stage 3-A.4 — Lazy warm wrapper for AIPulseRibbon ───────────────────
//
// `rebuildForUser` is an `internalMutation` so it can be called from the
// 30-min cron action AND from the AI tool layer. The dashboard's
// AIPulseRibbon needs to fire it ONCE per session when the ranked store
// is empty — so we expose a public `orgMutation` wrapper that schedules
// the rebuild via `ctx.scheduler.runAfter(0, ...)`.
//
// Rate-limit budget — 5 per minute per `(userId, orgId)` pair. Originally
// pinned at 1/min but the budget was too tight in practice: every dashboard
// remount (multi-tab use, route navigation back to `/`, the Refresh button
// in `AICockpitSection`) tries to warm independently and a single user can
// trip the gate just by clicking around. 5/min still prevents a runaway
// frontend from spamming the queue (the actual rebuild is the expensive
// op and is itself bounded) while letting normal navigation succeed.
//
// **Soft-fail contract**: rate-limit rejection no longer throws. Hitting
// the gate returns `{ scheduled: false, rateLimited: true }` so the
// frontend can swallow it silently and the Convex error log stays clean.
// Any other error still throws.
//
// Scheduler-runAfter (not direct call) because the public mutation
// completes before the rebuild starts — the dashboard can return,
// React reactivity picks up the new rows on the next reactive cycle.

const LAZY_WARM_RATE_LIMIT = { max: 5, periodMs: 60_000 } as const;

type LazyWarmResult =
	| { scheduled: true; rateLimited?: false }
	| { scheduled: false; rateLimited: true };

async function tryEnforceLazyWarmLimit(
	ctx: MutationCtx,
	args: { orgId: Id<"orgs">; userId: Id<"users"> },
): Promise<{ ok: true } | { ok: false }> {
	try {
		await enforceRateLimit(ctx, {
			scope: "ai.nextActions.lazyWarm",
			key: `${args.userId}:${args.orgId}`,
			max: LAZY_WARM_RATE_LIMIT.max,
			periodMs: LAZY_WARM_RATE_LIMIT.periodMs,
			orgId: args.orgId,
		});
		return { ok: true };
	} catch (err) {
		// Soft-fail only on the rate-limit ConvexError. Re-throw any
		// other failure (DB error, schema mismatch, etc.) so we still
		// see real bugs in the logs.
		if (err instanceof ConvexError && typeof err.data === "string") {
			if (err.data.startsWith("Too many requests.")) {
				return { ok: false };
			}
		}
		throw err;
	}
}

export const lazyWarmForUser = orgMutation({
	args: { orgId: v.id("orgs") },
	handler: async (ctx, args): Promise<LazyWarmResult> => {
		const { userId, member } = await requireOrgMember(ctx, args.orgId);
		requirePulseAccess(member.permissions);

		const gate = await tryEnforceLazyWarmLimit(ctx, { orgId: args.orgId, userId });
		if (!gate.ok) {
			return { scheduled: false, rateLimited: true };
		}

		await ctx.scheduler.runAfter(0, internal.ai.queries.nextActions.rebuildForUser, {
			orgId: args.orgId,
			userId,
		});

		return { scheduled: true };
	},
});

export const lazyWarmForUserForAI = internalMutation({
	args: { orgId: v.id("orgs"), userId: v.id("users") },
	handler: async (ctx, args): Promise<LazyWarmResult> => {
		const { member } = await requireOrgMemberByIds(ctx, args.orgId, args.userId);
		requirePulseAccess(member.permissions);

		const gate = await tryEnforceLazyWarmLimit(ctx, {
			orgId: args.orgId,
			userId: args.userId,
		});
		if (!gate.ok) {
			return { scheduled: false, rateLimited: true };
		}

		await ctx.scheduler.runAfter(0, internal.ai.queries.nextActions.rebuildForUser, {
			orgId: args.orgId,
			userId: args.userId,
		});

		return { scheduled: true };
	},
});

// ─── Test exports ─────────────────────────────────────────────────────────

export const __test = {
	classifyConfidence,
	computeRanking,
	computeDealMedianValue,
	clampScore,
	NEXT_ACTIONS_PER_USER_CAP,
	STALE_LEAD_DAYS,
	STALE_LEAD_HOT_DAYS,
	STUCK_DEAL_DAYS,
	STUCK_DEAL_HOT_DAYS,
	HIGH_VALUE_BOOST,
};

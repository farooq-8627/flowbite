/**
 * convex/ai/suggestions.ts
 *
 * Phase 4 Part 1 P1.14 (`PHASE-3-AI-AUDIT.md §5`) — proactive AI
 * Suggestions panel.
 *
 * IMPORTANT: this is NOT an AI call. The suggestions are computed by
 * pure heuristics over already-cached data so the panel runs on every
 * dashboard render without latency or cost. The model never sees the
 * suggestion list — clicking a suggestion fires a fresh chat turn with
 * the suggestion's `intent` pre-filled in the composer.
 *
 * Two scopes:
 *
 *   "org"    — workspace-wide (mounted on /dashboard).
 *              Surfaces stale leads, overdue follow-ups, deals stuck in
 *              the same stage past the typical cycle.
 *
 *   "entity" — record-specific (mounted on /profile/P-001 etc.).
 *              Surfaces missing email/phone, last-contact > 14 days,
 *              missing deal value, no contacts attached (companies).
 *
 * The output is ranked by `severity` (critical → warning → info) and
 * capped at 5 entries per scope so the panel stays bite-sized.
 */
import { v } from "convex/values";
import { orgQuery, requireOrgMember } from "../_functions/authenticated";
import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { requireRole } from "../_shared/permissions/helpers";

export type SuggestionSeverity = "info" | "warning" | "critical";

export type Suggestion = {
	/** Stable id so React lists don't re-mount on each query. */
	id: string;
	kind: string;
	headline: string;
	body: string;
	intent: string;
	severity: SuggestionSeverity;
	/** Optional anchor (entityType + code) for deep-linking. */
	anchor?: { entityType: string; code: string };
};

const MAX_SUGGESTIONS_PER_SCOPE = 5;
const STALE_LEAD_DAYS = 7;
const STUCK_DEAL_DAYS = 21;
const LAST_CONTACT_DAYS = 14;

// ─── Helpers ──────────────────────────────────────────────────────────

function severityRank(s: SuggestionSeverity): number {
	if (s === "critical") return 0;
	if (s === "warning") return 1;
	return 2;
}

function rank(a: Suggestion, b: Suggestion): number {
	return severityRank(a.severity) - severityRank(b.severity);
}

function daysAgo(ts: number): number {
	return Math.floor((Date.now() - ts) / (1000 * 60 * 60 * 24));
}

// ─── Public query ─────────────────────────────────────────────────────

export const list = orgQuery({
	args: {
		orgId: v.id("orgs"),
		scope: v.union(v.literal("org"), v.literal("entity")),
		entityType: v.optional(v.string()),
		entityCode: v.optional(v.string()),
	},
	handler: async (ctx, args): Promise<Suggestion[]> => {
		const { member } = await requireOrgMember(ctx, args.orgId);
		// Caller MUST be able to view leads at minimum (the panel is a
		// read-only summary; we don't filter to assigned-to-me yet).
		requireRole(member.permissions, "leads.view");

		if (args.scope === "org") {
			return suggestForOrg(ctx, args.orgId);
		}
		if (!args.entityType || !args.entityCode) return [];
		return suggestForEntity(ctx, args.orgId, args.entityType, args.entityCode);
	},
});

// ─── Org-scope heuristics ────────────────────────────────────────────

async function suggestForOrg(ctx: QueryCtx, orgId: Id<"orgs">): Promise<Suggestion[]> {
	const out: Suggestion[] = [];

	// 1. Overdue follow-ups (status="pending" + dueAt < now). Up to 3.
	const reminders = (await ctx.db
		.query("reminders")
		.withIndex("by_org_and_status", (q) => q.eq("orgId", orgId).eq("status", "pending"))
		.take(50)) as Doc<"reminders">[];
	const overdue = reminders.filter((r) => r.dueAt < Date.now()).slice(0, 3);
	for (const r of overdue) {
		const days = daysAgo(r.dueAt);
		out.push({
			id: `overdue:${r._id}`,
			kind: "overdue_followup",
			headline: `Follow-up ${r.followUpCode} is overdue`,
			body:
				days <= 0
					? `${r.title} is due today.`
					: `${r.title} was due ${days} day${days === 1 ? "" : "s"} ago.`,
			intent: `Show me follow-up ${r.followUpCode} and help me complete or reschedule it`,
			severity: days >= 3 ? "critical" : "warning",
			anchor: { entityType: "reminder", code: r.followUpCode },
		});
	}

	// 2. Stale leads — last touched > STALE_LEAD_DAYS, not closed.
	const leads = (await ctx.db
		.query("leads")
		.withIndex("by_org", (q) => q.eq("orgId", orgId))
		.take(200)) as Doc<"leads">[];
	const cutoff = Date.now() - STALE_LEAD_DAYS * 86_400_000;
	const staleAll = leads.filter(
		(l) =>
			!l.deletedAt &&
			l.status !== "Won" &&
			l.status !== "Lost" &&
			(l.updatedAt ?? 0) < cutoff,
	);
	const stale = staleAll.slice(0, 2);
	if (stale.length > 0) {
		out.push({
			id: `stale_leads:${stale[0]._id}`,
			kind: "stale_leads",
			headline: `${staleAll.length} lead${staleAll.length === 1 ? "" : "s"} haven't been touched in ${STALE_LEAD_DAYS}+ days`,
			body: `e.g. ${stale.map((l) => `${l.personCode} (${l.displayName})`).join(", ")}.`,
			intent: `Show me my stale leads from the last ${STALE_LEAD_DAYS} days and help me follow up`,
			severity: "warning",
		});
	}

	// 3. Deals stuck in stage > STUCK_DEAL_DAYS.
	const deals = (await ctx.db
		.query("deals")
		.withIndex("by_org", (q) => q.eq("orgId", orgId))
		.take(200)) as Doc<"deals">[];
	const stuckCutoff = Date.now() - STUCK_DEAL_DAYS * 86_400_000;
	const stuck = deals
		.filter((d) => !d.deletedAt && (d.stageEnteredAt ?? 0) < stuckCutoff)
		.slice(0, 2);
	for (const d of stuck) {
		const days = daysAgo(d.stageEnteredAt ?? 0);
		out.push({
			id: `stuck_deal:${d._id}`,
			kind: "stuck_deal",
			headline: `Deal ${d.dealCode} has been in the same stage ${days} days`,
			body: `${d.title} — typical cycle is shorter. Consider moving the stage forward.`,
			intent: `Show me deal ${d.dealCode} and help me decide the next step`,
			severity: days >= 60 ? "critical" : "info",
			anchor: { entityType: "deal", code: d.dealCode },
		});
	}

	out.sort(rank);
	return out.slice(0, MAX_SUGGESTIONS_PER_SCOPE);
}

// ─── Entity-scope heuristics ─────────────────────────────────────────

async function suggestForEntity(
	ctx: QueryCtx,
	orgId: Id<"orgs">,
	entityType: string,
	entityCode: string,
): Promise<Suggestion[]> {
	const out: Suggestion[] = [];

	if (entityType === "lead" || entityType === "contact") {
		const table = entityType === "lead" ? "leads" : "contacts";
		const row = (await ctx.db
			.query(table)
			.withIndex("by_org_and_personCode", (q) =>
				q.eq("orgId", orgId).eq("personCode", entityCode),
			)
			.first()) as Doc<"leads"> | Doc<"contacts"> | null;
		if (!row) return [];

		if (!row.email) {
			out.push({
				id: `missing_email:${row._id}`,
				kind: "missing_field",
				headline: "No email on file",
				body: "Adding the email unlocks reach-out + enrichment lookups.",
				intent: `Find ${row.displayName}'s email and add it`,
				severity: "info",
			});
		}
		if (!row.phone) {
			out.push({
				id: `missing_phone:${row._id}`,
				kind: "missing_field",
				headline: "No phone on file",
				body: "Adding the phone unlocks call notes + WhatsApp threading.",
				intent: `Find ${row.displayName}'s phone and add it`,
				severity: "info",
			});
		}
		const stale = (row.updatedAt ?? 0) < Date.now() - LAST_CONTACT_DAYS * 86_400_000;
		if (stale) {
			out.push({
				id: `last_contact:${row._id}`,
				kind: "stale_contact",
				headline: `Last touch was ${daysAgo(row.updatedAt ?? 0)} days ago`,
				body: "Schedule a follow-up so this doesn't fall off your radar.",
				intent: `Schedule a follow-up with ${row.displayName} for next week`,
				severity: "warning",
			});
		}
	}

	if (entityType === "deal") {
		const row = (await ctx.db
			.query("deals")
			.withIndex("by_org_and_dealCode", (q) =>
				q.eq("orgId", orgId).eq("dealCode", entityCode),
			)
			.first()) as Doc<"deals"> | null;
		if (!row) return [];
		if (!row.value || row.value === 0) {
			out.push({
				id: `missing_value:${row._id}`,
				kind: "missing_field",
				headline: "Deal value isn't set",
				body: "Setting an estimated value unlocks pipeline forecasts.",
				intent: `Estimate the value of deal ${row.dealCode} based on similar deals and update it`,
				severity: "info",
			});
		}
	}

	if (entityType === "company") {
		const row = (await ctx.db
			.query("companies")
			.withIndex("by_org_and_companyCode", (q) =>
				q.eq("orgId", orgId).eq("companyCode", entityCode),
			)
			.first()) as Doc<"companies"> | null;
		if (!row) return [];
		if (!row.personCodes || row.personCodes.length === 0) {
			out.push({
				id: `no_contacts:${row._id}`,
				kind: "missing_relation",
				headline: "No contacts attached to this company",
				body: "Linking the primary contact gives the AI a person to reach out to.",
				intent: `Add the primary contact for ${row.name}`,
				severity: "info",
			});
		}
	}

	out.sort(rank);
	return out.slice(0, MAX_SUGGESTIONS_PER_SCOPE);
}

// ─── Test exports ─────────────────────────────────────────────────────

export const __test = {
	rank,
	severityRank,
	daysAgo,
	STALE_LEAD_DAYS,
	STUCK_DEAL_DAYS,
	LAST_CONTACT_DAYS,
	MAX_SUGGESTIONS_PER_SCOPE,
};

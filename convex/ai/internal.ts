/**
 * AI Internal Functions — convex/ai/internal.ts
 *
 * Per-entity AI context auto-rebuild (Phase 5 implementation, 2026-05-24).
 *
 * STRATEGY — RULE-BASED, NOT LLM-BACKED.
 * ──────────────────────────────────────
 * The earlier plan was to spend an LLM call per rebuild. Two reasons we
 * went with a deterministic rule-based summariser instead:
 *
 *   1. **Predictable cost.** A rule-based function is free. An LLM call
 *      at $0.000075/rebuild × 100 calls/day × 100 orgs ≈ $22/mo and
 *      grows with usage. Free + deterministic wins by default.
 *
 *   2. **Predictable output.** Tests can pin the exact summary string.
 *      LLM calls drift — same input on day 1 vs day 30 yields different
 *      summaries. The summary is read into the system prompt EVERY
 *      turn; we want it stable across rebuilds.
 *
 * If a future Phase 5 wants natural-language summaries, swap this body
 * for an action that calls Anthropic Haiku — the shape of the
 * `aiContext` field doesn't change, so the rest of the codebase
 * (system prompt, EntityAISummaryCard, useRouteContext) keeps working.
 *
 * WHAT GETS WRITTEN
 * ─────────────────
 *   - `summary`: a one-paragraph plain-English description.
 *      e.g. "Lead — Sarah Khan. Owner: Alex Patel. 2 open deals, 3 notes,
 *            last activity 2 hours ago. Stage: Qualified."
 *   - `keyFacts`: short bullets with structured data the model can
 *      reference verbatim. e.g. ["2 open deals", "Last contact: 2026-05-20",
 *      "Pipeline stage: Qualified"]
 *   - `lastUpdatedAt`: now.
 *
 * SOURCES SCANNED
 * ───────────────
 *   - `activityLogs.by_entityType_and_entityId(entityType, entityId)` — last 10
 *   - `notes.by_org_and_entity(orgId, entityType, entityId)` — count + last
 *   - For person (lead/contact): `deals.by_org_and_personCode(orgId, personCode)`
 *
 * RATE LIMIT
 * ──────────
 * Cheap to run (<5 ms). Triggered from `ctx.scheduler.runAfter(0, …)` on
 * every CRUD mutation. Convex's scheduler de-duplicates identical
 * scheduled calls so high-frequency edits don't multiply work.
 */

import { v } from "convex/values";
import { internal } from "../_generated/api";
import type { Doc } from "../_generated/dataModel";
import { internalMutation, type MutationCtx } from "../_generated/server";

// ─── Helpers ──────────────────────────────────────────────────────────────

const SUMMARY_MAX_CHARS = 320;
const KEYFACTS_MAX = 8;

function relativeTime(ts: number, now: number): string {
	const diff = now - ts;
	if (diff < 0) return "in the future";
	const minutes = Math.floor(diff / 60_000);
	if (minutes < 1) return "just now";
	if (minutes < 60) return `${minutes} min ago`;
	const hours = Math.floor(minutes / 60);
	if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
	const days = Math.floor(hours / 24);
	if (days < 7) return `${days} day${days === 1 ? "" : "s"} ago`;
	const weeks = Math.floor(days / 7);
	if (weeks < 5) return `${weeks} week${weeks === 1 ? "" : "s"} ago`;
	const months = Math.floor(days / 30);
	return `${months} month${months === 1 ? "" : "s"} ago`;
}

function clip(s: string, max: number): string {
	const trimmed = s.trim();
	if (trimmed.length <= max) return trimmed;
	return `${trimmed.slice(0, max - 1)}…`;
}

// ─── Source readers (pure helpers, all bounded) ───────────────────────────

async function readRecentActivity(
	ctx: MutationCtx,
	args: { entityType: string; entityId: string },
) {
	const rows = await ctx.db
		.query("activityLogs")
		.withIndex("by_entityType_and_entityId", (q) =>
			q.eq("entityType", args.entityType).eq("entityId", args.entityId),
		)
		.order("desc")
		.take(10);
	return rows;
}

async function readNotesSnapshot(
	ctx: MutationCtx,
	args: { orgId: Doc<"orgs">["_id"]; entityType: string; entityId: string },
) {
	const rows = await ctx.db
		.query("notes")
		.withIndex("by_entity", (q) =>
			q
				.eq("orgId", args.orgId)
				.eq("entityType", args.entityType)
				.eq("entityId", args.entityId),
		)
		.order("desc")
		.take(20);
	return {
		count: rows.length,
		latest: rows[0],
	};
}

async function readDealsForPerson(
	ctx: MutationCtx,
	args: { orgId: Doc<"orgs">["_id"]; personCode: string },
) {
	const rows = await ctx.db
		.query("deals")
		.withIndex("by_org_and_personCode", (q) =>
			q.eq("orgId", args.orgId).eq("personCode", args.personCode),
		)
		.take(50);
	const active = rows.filter((r) => r.deletedAt === undefined);
	const won = active.filter((r) => r.wonAt !== undefined);
	const lost = active.filter((r) => r.lostAt !== undefined);
	const open = active.filter((r) => r.wonAt === undefined && r.lostAt === undefined);
	return { open, won, lost, total: active.length };
}

// ─── Pure summariser per entity type ──────────────────────────────────────

function summariseLeadOrContact(args: {
	scope: "Lead" | "Contact";
	entity: Doc<"leads"> | Doc<"contacts">;
	ownerName: string | null;
	noteCount: number;
	latestNotePreview: string | null;
	lastActivity: { action: string; createdAt: number } | null;
	deals: { open: Doc<"deals">[]; won: Doc<"deals">[]; lost: Doc<"deals">[]; total: number };
	now: number;
}): { summary: string; keyFacts: string[] } {
	const { scope, entity, ownerName, noteCount, latestNotePreview, lastActivity, deals, now } =
		args;
	const name = entity.displayName || "(unnamed)";
	// Leads carry a `status` (kanban column); contacts don't have one.
	const status = (entity as { status?: string }).status;

	const parts: string[] = [`${scope} — ${name}`];
	if (ownerName) parts.push(`Owner: ${ownerName}`);
	if (deals.open.length > 0) {
		parts.push(`${deals.open.length} open deal${deals.open.length === 1 ? "" : "s"}`);
	}
	if (noteCount > 0) parts.push(`${noteCount} note${noteCount === 1 ? "" : "s"}`);
	if (lastActivity) {
		parts.push(`last activity ${relativeTime(lastActivity.createdAt, now)}`);
	}
	const tail = status ? ` Status: ${status}.` : "";
	const summary = clip(`${parts.join(". ")}.${tail}`, SUMMARY_MAX_CHARS);

	const keyFacts: string[] = [];
	if (status) keyFacts.push(`Status: ${status}`);
	if (ownerName) keyFacts.push(`Owner: ${ownerName}`);
	if (entity.personCode) keyFacts.push(`personCode: ${entity.personCode}`);
	if (deals.open.length > 0) {
		keyFacts.push(`Open deals: ${deals.open.length}`);
		const stageIds = deals.open
			.map((d) => d.currentStageId)
			.filter((s): s is string => !!s)
			.slice(0, 3);
		if (stageIds.length > 0) keyFacts.push(`Deal stages: ${stageIds.join(", ")}`);
	}
	if (deals.won.length > 0) keyFacts.push(`Won deals: ${deals.won.length}`);
	if (lastActivity) {
		keyFacts.push(
			`Last activity: ${lastActivity.action} (${relativeTime(lastActivity.createdAt, now)})`,
		);
	}
	if (latestNotePreview) {
		keyFacts.push(`Latest note: ${clip(latestNotePreview, 80)}`);
	}
	return { summary, keyFacts: keyFacts.slice(0, KEYFACTS_MAX) };
}

function summariseDeal(args: {
	deal: Doc<"deals">;
	ownerName: string | null;
	companyName: string | null;
	personName: string | null;
	noteCount: number;
	latestNotePreview: string | null;
	lastActivity: { action: string; createdAt: number } | null;
	now: number;
}): { summary: string; keyFacts: string[] } {
	const {
		deal,
		ownerName,
		companyName,
		personName,
		noteCount,
		latestNotePreview,
		lastActivity,
		now,
	} = args;

	const dealStatus =
		deal.wonAt !== undefined ? "Won" : deal.lostAt !== undefined ? "Lost" : "Open";

	const parts: string[] = [`Deal — ${deal.title}`];
	parts.push(`Stage: ${deal.currentStageId}`);
	parts.push(`Status: ${dealStatus}`);
	if (deal.value !== undefined) {
		parts.push(`Value: ${deal.value}${deal.currency ? ` ${deal.currency}` : ""}`);
	}
	if (ownerName) parts.push(`Owner: ${ownerName}`);
	if (companyName) parts.push(`Company: ${companyName}`);
	if (personName) parts.push(`Person: ${personName}`);
	if (lastActivity) {
		parts.push(`last activity ${relativeTime(lastActivity.createdAt, now)}`);
	}
	const summary = clip(`${parts.join(". ")}.`, SUMMARY_MAX_CHARS);

	const keyFacts: string[] = [];
	keyFacts.push(`dealCode: ${deal.dealCode}`);
	keyFacts.push(`Stage: ${deal.currentStageId}`);
	keyFacts.push(`Status: ${dealStatus}`);
	if (deal.value !== undefined) {
		keyFacts.push(`Value: ${deal.value}${deal.currency ? ` ${deal.currency}` : ""}`);
	}
	if (deal.expectedCloseDate)
		keyFacts.push(
			`Expected close: ${new Date(deal.expectedCloseDate).toISOString().slice(0, 10)}`,
		);
	if (ownerName) keyFacts.push(`Owner: ${ownerName}`);
	if (companyName) keyFacts.push(`Company: ${companyName}`);
	if (personName) keyFacts.push(`Person: ${personName}`);
	if (noteCount > 0) keyFacts.push(`Notes: ${noteCount}`);
	if (latestNotePreview) keyFacts.push(`Latest note: ${clip(latestNotePreview, 80)}`);
	return { summary, keyFacts: keyFacts.slice(0, KEYFACTS_MAX) };
}

function summariseCompany(args: {
	company: Doc<"companies">;
	noteCount: number;
	latestNotePreview: string | null;
	lastActivity: { action: string; createdAt: number } | null;
	now: number;
}): { summary: string; keyFacts: string[] } {
	const { company, noteCount, latestNotePreview, lastActivity, now } = args;

	const parts: string[] = [`Company — ${company.name}`];
	if (company.industry) parts.push(`Industry: ${company.industry}`);
	if (company.website) parts.push(`Web: ${company.website}`);
	if (noteCount > 0) parts.push(`${noteCount} note${noteCount === 1 ? "" : "s"}`);
	if (lastActivity) {
		parts.push(`last activity ${relativeTime(lastActivity.createdAt, now)}`);
	}
	const summary = clip(`${parts.join(". ")}.`, SUMMARY_MAX_CHARS);

	const keyFacts: string[] = [];
	keyFacts.push(`companyCode: ${company.companyCode}`);
	if (company.industry) keyFacts.push(`Industry: ${company.industry}`);
	if (company.website) keyFacts.push(`Website: ${company.website}`);
	if (company.size) keyFacts.push(`Size: ${company.size}`);
	if (lastActivity) {
		keyFacts.push(
			`Last activity: ${lastActivity.action} (${relativeTime(lastActivity.createdAt, now)})`,
		);
	}
	if (latestNotePreview) keyFacts.push(`Latest note: ${clip(latestNotePreview, 80)}`);
	return { summary, keyFacts: keyFacts.slice(0, KEYFACTS_MAX) };
}

// ─── Internal mutation — wired into every CRUD mutation already ───────────

/**
 * Rebuild AI context for an entity after a mutation.
 *
 * Idempotent and side-effect-free beyond the patch: re-running the same
 * scheduler call with the same row state produces the same summary.
 *
 * If the entity is gone (deleted, wrong type) we silently no-op so a
 * race between delete + scheduled rebuild doesn't throw.
 */
export const rebuildEntityContext = internalMutation({
	args: {
		orgId: v.id("orgs"),
		entityType: v.string(), // "lead"|"contact"|"deal"|"company"
		entityId: v.string(),
		personCode: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const now = Date.now();
		const { entityType, entityId } = args;

		// Map external entityType → table name + look up the row.
		// We accept the mutation's `entityId` as the row's `_id` string.
		// If it's not a valid Convex id, the get() returns null and we
		// silently no-op.
		const validTables = new Set(["leads", "contacts", "deals", "companies"]);
		const tableName = `${entityType}s`;
		if (!validTables.has(tableName)) return;

		// Fetch shared signals: recent activity, notes count + latest, owner name.
		const [activity, notesSnap] = await Promise.all([
			readRecentActivity(ctx, { entityType, entityId }),
			readNotesSnapshot(ctx, {
				orgId: args.orgId,
				entityType,
				entityId,
			}),
		]);
		const lastActivity = activity[0] ?? null;
		const latestNotePreview = notesSnap.latest?.content ?? null;

		// Resolve owner name once, used by lead/contact/deal summary.
		const resolveOwnerName = async (
			assignedTo: Doc<"users">["_id"] | undefined,
		): Promise<string | null> => {
			if (!assignedTo) return null;
			const user = await ctx.db.get(assignedTo);
			return user?.name ?? null;
		};

		if (entityType === "lead" || entityType === "contact") {
			const entity = (await ctx.db.get(entityId as Doc<"leads">["_id"])) as
				| Doc<"leads">
				| Doc<"contacts">
				| null;
			if (!entity) return;
			const ownerName = await resolveOwnerName(entity.assignedTo);
			const personCode =
				args.personCode ?? (entity as { personCode?: string }).personCode ?? null;
			const deals = personCode
				? await readDealsForPerson(ctx, { orgId: args.orgId, personCode })
				: { open: [], won: [], lost: [], total: 0 };

			const { summary, keyFacts } = summariseLeadOrContact({
				scope: entityType === "lead" ? "Lead" : "Contact",
				entity,
				ownerName,
				noteCount: notesSnap.count,
				latestNotePreview,
				lastActivity: lastActivity
					? { action: lastActivity.action, createdAt: lastActivity.createdAt }
					: null,
				deals,
				now,
			});

			await ctx.db.patch(entity._id, {
				aiContext: {
					summary,
					keyFacts,
					lastUpdatedAt: now,
					rawNotes: latestNotePreview ?? undefined,
				},
				updatedAt: now,
			});
			return;
		}

		if (entityType === "deal") {
			const deal = (await ctx.db.get(entityId as Doc<"deals">["_id"])) as Doc<"deals"> | null;
			if (!deal) return;
			const ownerName = await resolveOwnerName(deal.assignedTo);
			let companyName: string | null = null;
			if (deal.companyCode) {
				const company = await ctx.db
					.query("companies")
					.withIndex("by_org_and_companyCode", (q) =>
						q.eq("orgId", args.orgId).eq("companyCode", deal.companyCode!),
					)
					.first();
				companyName = company?.name ?? null;
			}
			let personName: string | null = null;
			if (deal.personCode) {
				const lead = await ctx.db
					.query("leads")
					.withIndex("by_org_and_personCode", (q) =>
						q.eq("orgId", args.orgId).eq("personCode", deal.personCode!),
					)
					.first();
				if (lead) {
					personName = lead.displayName;
				} else {
					const contact = await ctx.db
						.query("contacts")
						.withIndex("by_org_and_personCode", (q) =>
							q.eq("orgId", args.orgId).eq("personCode", deal.personCode!),
						)
						.first();
					personName = contact?.displayName ?? null;
				}
			}

			const { summary, keyFacts } = summariseDeal({
				deal,
				ownerName,
				companyName,
				personName,
				noteCount: notesSnap.count,
				latestNotePreview,
				lastActivity: lastActivity
					? { action: lastActivity.action, createdAt: lastActivity.createdAt }
					: null,
				now,
			});

			await ctx.db.patch(deal._id, {
				aiContext: {
					summary,
					keyFacts,
					lastUpdatedAt: now,
					rawNotes: latestNotePreview ?? undefined,
				},
				updatedAt: now,
			});
			return;
		}

		if (entityType === "company") {
			const company = (await ctx.db.get(
				entityId as Doc<"companies">["_id"],
			)) as Doc<"companies"> | null;
			if (!company) return;
			const { summary, keyFacts } = summariseCompany({
				company,
				noteCount: notesSnap.count,
				latestNotePreview,
				lastActivity: lastActivity
					? { action: lastActivity.action, createdAt: lastActivity.createdAt }
					: null,
				now,
			});

			await ctx.db.patch(company._id, {
				aiContext: {
					summary,
					keyFacts,
					lastUpdatedAt: now,
					rawNotes: latestNotePreview ?? undefined,
				},
				updatedAt: now,
			});
		}
	},
});

// ─── Test exports for the rule-based summarisers ──────────────────────────

export const __test = {
	relativeTime,
	clip,
	summariseLeadOrContact,
	summariseDeal,
	summariseCompany,
	SUMMARY_MAX_CHARS,
	KEYFACTS_MAX,
};

// `internal` import is intentionally kept — when this file grows future
// scheduler-driven sub-jobs, the reference is already there.
void internal;

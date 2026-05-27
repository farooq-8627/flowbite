/**
 * convex/ai/queries/cascadeImpact.ts
 *
 * Stage 3 of /SPRINT-PLAN.md (2026-05-26). Read-only impact analysis used
 * by the universal `delete_entity` AI tool to surface a cascade summary
 * BEFORE asking the user to approve a destructive write.
 *
 * Why this lives here (not in `convex/crm/.../queries.ts`):
 *   - The cascade counts cross several tables (deals, notes, tasks,
 *     companyMembers). Each entity domain owns its own queries module —
 *     there's no natural home in any single one of them. AI-specific
 *     read paths belong under `convex/ai/queries`.
 *   - It's an internal-only query (only `delete_entity` propose calls it)
 *     so it doesn't need the public `orgQuery` shell — `internalQuery`
 *     with `requireOrgMemberByIds` is the right gate (per AGENTS.md
 *     "AI tools call *ForAI" rule, scheduled actions don't propagate
 *     auth identity).
 *
 * Returns one of two shapes:
 *   - { kind: "found", … } — record exists; cascade counts populated.
 *   - { kind: "not_found" } — code didn't resolve; tool surfaces a
 *     friendly error.
 *
 * Cascade rules (counts are best-effort caps at 500 — anything more reads
 * as "500+" in the propose card; the soft-delete itself never iterates
 * children, so this is purely informational for the user):
 *   - lead/contact:  notes by (entityType, entityId), tasks by personCode
 *   - company:       linked deals (companyId), notes (entityType=company),
 *                    companyMembers join rows
 *   - deal:          notes (entityType=deal, entityId=dealId), tasks
 *                    by dealCode
 *   - note:          no cascade — the row's own metadata is returned for
 *                    the propose card.
 *   - task:          no cascade — same.
 */

import { ConvexError, v } from "convex/values";
import { requireOrgMemberByIds } from "../../_functions/authenticated";
import type { Doc, Id } from "../../_generated/dataModel";
import { internalQuery, type QueryCtx } from "../../_generated/server";
import { resolveCodeToRecordForAI } from "../../_shared/aiEntityPatch";
import { ERRORS } from "../../_shared/errors";

export type AnyDeleteEntityType = "lead" | "contact" | "deal" | "company" | "note" | "task";

export type CascadeCounts = {
	deals?: number;
	notes?: number;
	tasks?: number;
	memberLinks?: number;
};

export type CascadeImpactResult =
	| {
			kind: "not_found";
			entityType: AnyDeleteEntityType;
			lookup: string;
	  }
	| {
			kind: "found";
			entityType: AnyDeleteEntityType;
			/** The row's primary id (lead/contact/deal/company/note/task _id). */
			entityId: string;
			/** P-XXX / D-XXX / T-XXX / etc. when the entity has a public code. */
			canonicalCode?: string;
			/** Human-readable name for the propose card. */
			displayName: string;
			/** Cascade counts — every key absent means 0. */
			cascade: CascadeCounts;
	  };

// ─── Cascade counters (file-local) ───────────────────────────────────────────

async function countNotesForEntity(
	ctx: QueryCtx,
	args: { orgId: Id<"orgs">; entityType: string; entityId: string },
): Promise<number> {
	const rows = await ctx.db
		.query("notes")
		.withIndex("by_entity", (q) =>
			q
				.eq("orgId", args.orgId)
				.eq("entityType", args.entityType)
				.eq("entityId", args.entityId),
		)
		.take(500);
	return rows.length;
}

async function countTasksByPersonCode(
	ctx: QueryCtx,
	args: { orgId: Id<"orgs">; personCode: string },
): Promise<number> {
	const rows = await ctx.db
		.query("tasks")
		.withIndex("by_org_and_person", (q) =>
			q.eq("orgId", args.orgId).eq("personCode", args.personCode),
		)
		.take(500);
	return rows.length;
}

async function countTasksByDealCode(
	ctx: QueryCtx,
	args: { orgId: Id<"orgs">; dealCode: string },
): Promise<number> {
	// Tasks aren't indexed by dealCode — the field is optional and
	// most tasks are person-only. A take+filter is the cheapest
	// honest path: per-org task count is bounded by `RATE_LIMITS.write`
	// so this stays under a few hundred rows in practice.
	const rows = await ctx.db
		.query("tasks")
		.withIndex("by_org_and_due", (q) => q.eq("orgId", args.orgId))
		.take(1000);
	return rows.filter((r) => r.dealCode === args.dealCode).length;
}

async function countOpenDealsForCompany(
	ctx: QueryCtx,
	args: { orgId: Id<"orgs">; companyId: Id<"companies"> },
): Promise<number> {
	// Deals don't carry a `(orgId, companyId)` index of their own — only
	// `(orgId, pipelineId)`, `(orgId, stageId)`, `(orgId, personCode)`,
	// `(orgId, dealCode)`, `(orgId, assignee)`. So we walk the org's
	// deals and filter. Bounded at 1000 rows; honest "500+" displayed in
	// the propose card for hyper-large orgs.
	const rows = await ctx.db
		.query("deals")
		.withIndex("by_org", (q) => q.eq("orgId", args.orgId))
		.take(1000);
	return rows.filter((d) => d.companyId === args.companyId && d.deletedAt === undefined).length;
}

async function countMemberLinksForCompany(
	ctx: QueryCtx,
	args: { orgId: Id<"orgs">; companyId: Id<"companies"> },
): Promise<number> {
	const rows = await ctx.db
		.query("companyMembers")
		.withIndex("by_org_and_company", (q) =>
			q.eq("orgId", args.orgId).eq("companyId", args.companyId),
		)
		.take(500);
	return rows.length;
}

// ─── Public entry point ─────────────────────────────────────────────────────

/**
 * Compute the cascade impact of deleting an entity. The caller must
 * supply ONE of `entityCode` (P-XXX / D-XXX / C-XXX / etc.),
 * `taskCode` (T-XXX), or `noteId`. `entityType` is required so the
 * resolver knows which table to look in.
 *
 * Returns `{ kind: "not_found" }` when the lookup misses — never throws
 * for "no such record" (the AI tool surfaces a friendly error instead of
 * a ConvexError stack trace).
 */
export const getEntityCascadeImpact = internalQuery({
	args: {
		orgId: v.id("orgs"),
		userId: v.id("users"),
		entityType: v.union(
			v.literal("lead"),
			v.literal("contact"),
			v.literal("deal"),
			v.literal("company"),
			v.literal("note"),
			v.literal("task"),
		),
		entityCode: v.optional(v.string()),
		taskCode: v.optional(v.string()),
		noteId: v.optional(v.id("notes")),
	},
	handler: async (ctx, args): Promise<CascadeImpactResult> => {
		// Per AGENTS.md non-negotiable rule: ForAI/internal queries called
		// by AI tools MUST validate the trusted userId here, never via
		// `getAuthUserId`.
		await requireOrgMemberByIds(ctx, args.orgId, args.userId);

		// ── lead/contact/deal/company → resolve via record-code helper ─
		if (
			args.entityType === "lead" ||
			args.entityType === "contact" ||
			args.entityType === "deal" ||
			args.entityType === "company"
		) {
			if (!args.entityCode) {
				throw new ConvexError({
					code: "INVALID_ARGS",
					message: `entityCode is required for entityType=${args.entityType}.`,
				});
			}
			const resolved = await resolveCodeToRecordForAI(ctx, {
				orgId: args.orgId,
				entityType: args.entityType,
				code: args.entityCode,
			});
			if (!resolved) {
				return { kind: "not_found", entityType: args.entityType, lookup: args.entityCode };
			}

			const row = resolved.row;
			let displayName: string;
			const cascade: CascadeCounts = {};

			if (args.entityType === "lead" || args.entityType === "contact") {
				const personRow = row as Doc<"leads"> | Doc<"contacts">;
				displayName = personRow.displayName;
				cascade.notes = await countNotesForEntity(ctx, {
					orgId: args.orgId,
					entityType: args.entityType,
					entityId: row._id as unknown as string,
				});
				cascade.tasks = await countTasksByPersonCode(ctx, {
					orgId: args.orgId,
					personCode: personRow.personCode,
				});
			} else if (args.entityType === "deal") {
				const dealRow = row as Doc<"deals">;
				displayName = dealRow.title;
				cascade.notes = await countNotesForEntity(ctx, {
					orgId: args.orgId,
					entityType: "deal",
					entityId: row._id as unknown as string,
				});
				cascade.tasks = await countTasksByDealCode(ctx, {
					orgId: args.orgId,
					dealCode: dealRow.dealCode,
				});
			} else {
				// company
				const companyRow = row as Doc<"companies">;
				displayName = companyRow.name;
				cascade.deals = await countOpenDealsForCompany(ctx, {
					orgId: args.orgId,
					companyId: row._id as Id<"companies">,
				});
				cascade.notes = await countNotesForEntity(ctx, {
					orgId: args.orgId,
					entityType: "company",
					entityId: row._id as unknown as string,
				});
				cascade.memberLinks = await countMemberLinksForCompany(ctx, {
					orgId: args.orgId,
					companyId: row._id as Id<"companies">,
				});
			}

			return {
				kind: "found",
				entityType: args.entityType,
				entityId: row._id as unknown as string,
				canonicalCode: resolved.canonicalCode,
				displayName,
				cascade,
			};
		}

		// ── note → noteId lookup ─────────────────────────────────────────
		if (args.entityType === "note") {
			if (!args.noteId) {
				throw new ConvexError({
					code: "INVALID_ARGS",
					message: "noteId is required for entityType=note.",
				});
			}
			const note = await ctx.db.get(args.noteId);
			if (!note || note.orgId !== args.orgId) {
				return { kind: "not_found", entityType: "note", lookup: args.noteId };
			}
			const preview = (note.content ?? "").trim();
			const displayName =
				note.title?.trim() ||
				(preview.length > 60 ? `${preview.slice(0, 60)}…` : preview) ||
				"Note";
			return {
				kind: "found",
				entityType: "note",
				entityId: note._id as unknown as string,
				displayName,
				cascade: {},
			};
		}

		// ── task → taskCode lookup ──────────────────────────────────────
		if (args.entityType === "task") {
			if (!args.taskCode) {
				throw new ConvexError({
					code: "INVALID_ARGS",
					message: "taskCode is required for entityType=task.",
				});
			}
			const task = await ctx.db
				.query("tasks")
				.withIndex("by_org_and_taskCode", (q) =>
					q.eq("orgId", args.orgId).eq("taskCode", args.taskCode!),
				)
				.first();
			if (!task) {
				return {
					kind: "not_found",
					entityType: "task",
					lookup: args.taskCode,
				};
			}
			return {
				kind: "found",
				entityType: "task",
				entityId: task._id as unknown as string,
				canonicalCode: task.taskCode,
				displayName: task.title,
				cascade: {},
			};
		}

		// Unreachable — every literal in the union handled above.
		throw new ConvexError(ERRORS.INVALID_ARGS);
	},
});

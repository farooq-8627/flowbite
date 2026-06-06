/**
 * Deals Queries — convex/crm/entities/deals/queries.ts
 * STATUS: IMPLEMENTED
 */
import { v } from "convex/values";
import {
	orgQuery,
	requireOrgMember,
	requireOrgMemberByIds,
} from "../../../_functions/authenticated";
import type { Id } from "../../../_generated/dataModel";
import { internalQuery, type QueryCtx } from "../../../_generated/server";
import {
	requireRole,
	resolveAssigneeFilter,
	resolveRecordScope,
	rowInScope,
	scopeAssignee,
} from "../../../_shared/permissions";
import {
	getRequiredFieldsForStage,
	getStagePinnedFields,
	pickEmptyPinnedFields,
	pickMissingFields,
} from "../../fields/pipelines/helpers";

export const list = orgQuery({
	args: {
		orgId: v.id("orgs"),
		pipelineId: v.optional(v.id("pipelines")),
		assignedTo: v.optional(v.id("users")),
		limit: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
		const { userId, member } = await requireOrgMember(ctx, args.orgId);
		requireRole(member.permissions, "deals.view");

		// Row-level scope: a member without `records.viewAll` only ever sees
		// deals assigned to them.
		const scope = resolveRecordScope(member.permissions, userId);
		const assignee = resolveAssigneeFilter(scope, args.assignedTo);
		if (assignee.empty) return [];
		const effectiveAssignee = assignee.assignedTo;

		const cap = args.limit ?? 200;

		// Init with the broad index so `q`'s type is inferred, then narrow.
		let q = ctx.db.query("deals").withIndex("by_org", (qi) => qi.eq("orgId", args.orgId));
		if (args.pipelineId) {
			q = ctx.db
				.query("deals")
				.withIndex("by_org_and_pipeline", (qi) =>
					qi.eq("orgId", args.orgId).eq("pipelineId", args.pipelineId!),
				);
		} else if (effectiveAssignee) {
			q = ctx.db
				.query("deals")
				.withIndex("by_org_and_assignee", (qi) =>
					qi.eq("orgId", args.orgId).eq("assignedTo", effectiveAssignee),
				);
		}

		const results = await q.take(cap * 2);

		return results
			.filter((d) => d.deletedAt === undefined)
			.filter((d) => !effectiveAssignee || d.assignedTo === effectiveAssignee)
			.slice(0, cap);
	},
});

/** Returns deals grouped by stageId with isStale + daysInStage annotated. */
export const listGroupedByStage = orgQuery({
	args: { orgId: v.id("orgs"), pipelineId: v.id("pipelines") },
	handler: async (ctx, args) => {
		const { userId, member } = await requireOrgMember(ctx, args.orgId);
		requireRole(member.permissions, "deals.view");
		const scope = resolveRecordScope(member.permissions, userId);

		const [pipeline, deals] = await Promise.all([
			ctx.db.get(args.pipelineId),
			ctx.db
				.query("deals")
				.withIndex("by_org_and_pipeline", (q) =>
					q.eq("orgId", args.orgId).eq("pipelineId", args.pipelineId),
				)
				.take(500),
		]);

		if (!pipeline || pipeline.orgId !== args.orgId) return {};

		const stageMap = new Map(pipeline.stages.map((s) => [s.id, s]));
		const now = Date.now();
		const grouped: Record<
			string,
			Array<(typeof deals)[0] & { daysInStage: number; isStale: boolean }>
		> = {};

		for (const stage of pipeline.stages) {
			grouped[stage.id] = [];
		}

		for (const deal of deals) {
			if (deal.deletedAt !== undefined) continue;
			// Row-level scope — scoped members only see deals assigned to them.
			if (!rowInScope(scope, deal)) continue;
			const stage = stageMap.get(deal.currentStageId);
			const daysInStage = (now - deal.stageEnteredAt) / 86_400_000;
			const isStale =
				stage?.staleAfterDays !== undefined && daysInStage > stage.staleAfterDays;
			if (grouped[deal.currentStageId]) {
				grouped[deal.currentStageId].push({ ...deal, daysInStage, isStale });
			}
		}

		return grouped;
	},
});

export const getById = orgQuery({
	args: { orgId: v.id("orgs"), dealId: v.id("deals") },
	handler: async (ctx, args) => {
		const { userId, member } = await requireOrgMember(ctx, args.orgId);
		requireRole(member.permissions, "deals.view");

		const deal = await ctx.db.get(args.dealId);
		if (!deal || deal.orgId !== args.orgId || deal.deletedAt !== undefined) return null;
		if (!rowInScope(resolveRecordScope(member.permissions, userId), deal)) return null;
		return deal;
	},
});

async function getByDealCodeImpl(ctx: QueryCtx, args: { orgId: Id<"orgs">; dealCode: string }) {
	return ctx.db
		.query("deals")
		.withIndex("by_org_and_dealCode", (q) =>
			q.eq("orgId", args.orgId).eq("dealCode", args.dealCode),
		)
		.first();
}

export const getByDealCode = orgQuery({
	args: { orgId: v.id("orgs"), dealCode: v.string() },
	handler: async (ctx, args) => {
		const { userId, member } = await requireOrgMember(ctx, args.orgId);
		requireRole(member.permissions, "deals.view");
		const deal = await getByDealCodeImpl(ctx, args);
		if (deal && !rowInScope(resolveRecordScope(member.permissions, userId), deal)) return null;
		return deal;
	},
});

/** AI-callable internal twin — see `convex/ai/tools/_shared.ts` for rationale. */
export const getByDealCodeForAI = internalQuery({
	args: { orgId: v.id("orgs"), userId: v.id("users"), dealCode: v.string() },
	handler: async (ctx, args) => {
		const { member } = await requireOrgMemberByIds(ctx, args.orgId, args.userId);
		requireRole(member.permissions, "deals.view");
		const deal = await getByDealCodeImpl(ctx, args);
		if (deal && !rowInScope(resolveRecordScope(member.permissions, args.userId), deal))
			return null;
		return deal;
	},
});

/**
 * searchDeals — text search for the AI tools.
 *
 * Substring-matches `query` (case-insensitive) against title, dealCode,
 * personCode, and (when present) the deal's `currency`+`value` printout.
 * Honours `excludeFromAI: false` to hide opted-out rows from the AI.
 */
async function searchDealsImpl(
	ctx: QueryCtx,
	args: {
		orgId: Id<"orgs">;
		query: string;
		limit?: number;
		excludeFromAI?: boolean;
		scopeAssignee?: Id<"users">;
	},
) {
	const cap = args.limit ?? 10;
	const q = args.query.trim().toLowerCase();
	if (!q) return [];

	const rows = await ctx.db
		.query("deals")
		.withIndex("by_org", (qi) => qi.eq("orgId", args.orgId))
		.take(500);

	const matches: typeof rows = [];
	for (const r of rows) {
		if (r.deletedAt !== undefined) continue;
		if (args.scopeAssignee !== undefined && r.assignedTo !== args.scopeAssignee) continue;
		if (args.excludeFromAI === false && r.excludeFromAI === true) continue;
		const haystack = [r.title, r.dealCode ?? "", r.personCode ?? ""].join(" ").toLowerCase();
		if (haystack.includes(q)) matches.push(r);
		if (matches.length >= cap) break;
	}
	return matches;
}

export const searchDeals = orgQuery({
	args: {
		orgId: v.id("orgs"),
		query: v.string(),
		limit: v.optional(v.number()),
		excludeFromAI: v.optional(v.boolean()),
	},
	handler: async (ctx, args) => {
		const { userId, member } = await requireOrgMember(ctx, args.orgId);
		requireRole(member.permissions, "deals.view");
		const scope = resolveRecordScope(member.permissions, userId);
		return searchDealsImpl(ctx, { ...args, scopeAssignee: scopeAssignee(scope) });
	},
});

/** AI-callable internal twin. */
export const searchDealsForAI = internalQuery({
	args: {
		orgId: v.id("orgs"),
		userId: v.id("users"),
		query: v.string(),
		limit: v.optional(v.number()),
		excludeFromAI: v.optional(v.boolean()),
	},
	handler: async (ctx, args) => {
		const { member } = await requireOrgMemberByIds(ctx, args.orgId, args.userId);
		requireRole(member.permissions, "deals.view");
		const scope = resolveRecordScope(member.permissions, args.userId);
		return searchDealsImpl(ctx, { ...args, scopeAssignee: scopeAssignee(scope) });
	},
});

/**
 * listByPersonCode — every deal linked to one person.
 *
 * Used by `OverviewCard` to surface the latest deals on a profile or
 * hover quick-view. Scopes via the `by_org_and_personCode` index so the
 * query is O(log n) regardless of org size, and filters out soft-deleted
 * rows on the way out. Capped at `limit` (default 5) — the card never
 * needs more than a handful.
 */
export const listByPersonCode = orgQuery({
	args: {
		orgId: v.id("orgs"),
		personCode: v.string(),
		limit: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
		const { userId, member } = await requireOrgMember(ctx, args.orgId);
		requireRole(member.permissions, "deals.view");
		const scope = resolveRecordScope(member.permissions, userId);

		const cap = args.limit ?? 5;
		const rows = await ctx.db
			.query("deals")
			.withIndex("by_org_and_personCode", (q) =>
				q.eq("orgId", args.orgId).eq("personCode", args.personCode),
			)
			.take(cap * 2);
		return rows
			.filter((d) => d.deletedAt === undefined)
			.filter((d) => rowInScope(scope, d))
			.sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))
			.slice(0, cap);
	},
});

/**
 * Return the list of required-but-missing fields for a deal at a target
 * stage. The frontend `useMoveDealToStage` hook calls this to render the
 * "Fill required fields" dialog when the server throws
 * `MISSING_REQUIRED_FIELDS`.
 *
 * Honors the per-pipeline `stageTransitionPolicy`:
 *   - `"off"` → returns `{ policy, missing: [] }` regardless of fill state
 *   - `"warn"` / `"block"` → computes the missing set
 */
export const getMissingFieldsForStage = orgQuery({
	args: { orgId: v.id("orgs"), dealId: v.id("deals"), stageId: v.string() },
	handler: async (ctx, args) => {
		const { member } = await requireOrgMember(ctx, args.orgId);
		requireRole(member.permissions, "deals.view");

		const deal = await ctx.db.get(args.dealId);
		if (!deal || deal.orgId !== args.orgId || deal.deletedAt !== undefined) {
			return null;
		}
		const pipeline = await ctx.db.get(deal.pipelineId);
		if (!pipeline) return null;
		const stage = pipeline.stages.find((s) => s.id === args.stageId);
		if (!stage) return null;

		const policy = pipeline.stageTransitionPolicy ?? "warn";
		if (policy === "off") {
			return { policy, stageName: stage.name, missing: [] as Array<never> };
		}

		const required = await getRequiredFieldsForStage(ctx, {
			orgId: args.orgId,
			entityType: "deal",
			stageId: args.stageId,
		});

		const fieldValueRows = await ctx.db
			.query("fieldValues")
			.withIndex("by_entity", (q) =>
				q.eq("orgId", args.orgId).eq("entityType", "deal").eq("entityId", args.dealId),
			)
			.collect();
		const valuesByName: Record<string, unknown> = {};
		for (const v of fieldValueRows) valuesByName[v.fieldName] = v.value;

		const missing = pickMissingFields({
			deal: deal as unknown as Record<string, unknown>,
			fieldValuesByName: valuesByName,
			requiredFields: required,
		});

		return {
			policy,
			stageName: stage.name,
			missing: missing.map((f) => ({
				_id: f._id,
				name: f.name,
				label: f.label,
				type: f.type,
			})),
		};
	},
});

/**
 * Round 4 (Option A) — return the empty fields pinned to the deal's
 * CURRENT stage. No `required` check: any pinned field with an empty
 * value counts as "to fill". Used by the card's `+` shortcut →
 * `EditDealDrawer` (fillStage mode). The form renders ONLY these fields.
 *
 * Once every pinned field has a value, this returns `missing: []`. The
 * card's `+` button hides accordingly (its gate is the per-deal count
 * exposed by `listDealsMissingFieldsByPipeline`, which uses the same
 * "pinned-and-empty" rule). Drag the deal to the next stage and a new
 * set of pinned-to-that-stage fields takes over — each stage's `+` is
 * its own closed set.
 *
 * Honours the per-pipeline `stageTransitionPolicy`:
 *   - `"off"` → returns `{ policy, missing: [] }` (the `+` UI never
 *     fires when the policy is off, so this match is symmetric).
 *   - `"warn"` / `"block"` → walks the deal's current stage only and
 *     returns its empty pinned fields with the stage name attached so
 *     the form can label them.
 */
export const getStageFieldsToFill = orgQuery({
	args: { orgId: v.id("orgs"), dealId: v.id("deals") },
	handler: async (ctx, args) => {
		const { member } = await requireOrgMember(ctx, args.orgId);
		requireRole(member.permissions, "deals.view");

		const deal = await ctx.db.get(args.dealId);
		if (!deal || deal.orgId !== args.orgId || deal.deletedAt !== undefined) {
			return null;
		}
		const pipeline = await ctx.db.get(deal.pipelineId);
		if (!pipeline) return null;

		const policy = pipeline.stageTransitionPolicy ?? "warn";
		const stage = pipeline.stages.find((s) => s.id === deal.currentStageId);
		if (!stage || stage.isFinal || policy === "off") {
			return {
				policy,
				missing: [] as Array<never>,
				currentStageId: deal.currentStageId,
				stageName: stage?.name ?? "",
			};
		}

		const pinned = await getStagePinnedFields(ctx, {
			orgId: args.orgId,
			entityType: "deal",
			stageId: deal.currentStageId,
		});
		if (pinned.length === 0) {
			return {
				policy,
				missing: [] as Array<never>,
				currentStageId: deal.currentStageId,
				stageName: stage.name,
			};
		}

		const fieldValueRows = await ctx.db
			.query("fieldValues")
			.withIndex("by_entity", (q) =>
				q.eq("orgId", args.orgId).eq("entityType", "deal").eq("entityId", args.dealId),
			)
			.collect();
		const valuesByName: Record<string, unknown> = {};
		for (const fv of fieldValueRows) valuesByName[fv.fieldName] = fv.value;

		// File-type fields store in the `files` table, not `fieldValues`.
		// Count files per fieldKey for this deal.
		const fileCountsByFieldKey: Record<string, number> = {};
		const hasFileFields = pinned.some((f) => f.type === "file" || f.type === "files");
		if (hasFileFields && deal.dealCode) {
			const fileRows = await ctx.db
				.query("files")
				.withIndex("by_org_and_scope", (q) =>
					q.eq("orgId", args.orgId).eq("scope", "deal").eq("scopeId", deal.dealCode),
				)
				.collect();
			for (const fr of fileRows) {
				if (fr.deletedAt) continue;
				if (fr.fieldKey) {
					fileCountsByFieldKey[fr.fieldKey] =
						(fileCountsByFieldKey[fr.fieldKey] ?? 0) + 1;
				}
			}
		}

		const empty = pickEmptyPinnedFields({
			deal: deal as unknown as Record<string, unknown>,
			fieldValuesByName: valuesByName,
			pinnedFields: pinned,
			fileCountsByFieldKey,
		});

		return {
			policy,
			missing: empty.map((f) => ({
				_id: f._id,
				name: f.name,
				label: f.label,
				type: f.type,
				stageId: deal.currentStageId,
				stageName: stage.name,
			})),
			currentStageId: deal.currentStageId,
			stageName: stage.name,
		};
	},
});

/**
 * Round 4 (Option A) — return the union of field NAMES that should be
 * editable in the Edit drawer for this deal. The set is:
 *
 *   { every visible field pinned to a stage at order ≤ deal.currentStageId }
 *
 * Conceptually: defaults (Default stage) + every prior stage's pinned
 * fields + the current stage's pinned fields. Final stages contribute
 * nothing (closing the deal goes through `closeAsDone`, not Edit).
 *
 * The Edit drawer passes this set as `EntityFieldForm.includeOnly` (with
 * `currentStageId={undefined}` so the form hook returns every pinned
 * field, then narrows by name). This way:
 *
 *   - Stage 1 deal → Edit shows: defaults + stage-1 pinned fields.
 *     Stage-2 fields like Ejari are NOT in the form yet.
 *   - Stage 2 deal → Edit shows: defaults + stage-1 + stage-2 pinned.
 *   - Stage 3 deal → Edit shows: defaults + stage-1 + 2 + 3 pinned.
 *
 * Stage-N+ fields (pinned only to stages the deal hasn't reached) stay
 * hidden until the deal advances. This keeps the Edit form aligned with
 * what the deal is "supposed to know" at this point in its life.
 *
 * Returns just the names + a small lookup map so the client-side
 * `includeOnly` check is O(1) per field.
 */
export const getEditableFieldsUpToStage = orgQuery({
	args: { orgId: v.id("orgs"), dealId: v.id("deals") },
	handler: async (ctx, args) => {
		const { member } = await requireOrgMember(ctx, args.orgId);
		requireRole(member.permissions, "deals.view");

		const deal = await ctx.db.get(args.dealId);
		if (!deal || deal.orgId !== args.orgId || deal.deletedAt !== undefined) {
			return null;
		}
		const pipeline = await ctx.db.get(deal.pipelineId);
		if (!pipeline) return null;

		const sorted = [...pipeline.stages].sort((a, b) => a.order - b.order);
		const currentIdx = sorted.findIndex((s) => s.id === deal.currentStageId);
		const upToInclusive = currentIdx >= 0 ? sorted.slice(0, currentIdx + 1) : sorted;

		// Walk every reachable stage and union the field names. Defaults
		// (the auto-injected Default stage at order 0) are included by
		// virtue of being at order ≤ current.
		const names = new Set<string>();
		for (const stage of upToInclusive) {
			if (stage.isFinal) continue;
			const pinned = await getStagePinnedFields(ctx, {
				orgId: args.orgId,
				entityType: "deal",
				stageId: stage.id,
			});
			for (const f of pinned) names.add(f.name);
		}

		return {
			fieldNames: Array.from(names),
			currentStageId: deal.currentStageId,
			stageOrderIndex: currentIdx,
		};
	},
});

/**
 * Batched per-pipeline lookup: which deals in this pipeline currently
 * have unfilled fields PINNED to their *current* stage? Used by the
 * deals board / table to paint the "yellow border" indicator AND gate
 * the `+` shortcut on every card. ONE subscription per
 * `(orgId, pipelineId)`, server-computed, no per-card queries.
 *
 * Round 4 (Option A) update: this no longer filters by `f.required`.
 * Any pinned-to-current-stage field that's empty counts. The `required`
 * flag still drives `moveToStage`'s block/warn policy — but the user-
 * facing "you have stuff to fill on this stage" indicator is broader
 * because the user wants to fill optional fields too.
 *
 * Honours the per-pipeline `stageTransitionPolicy`:
 *   - `"off"` → returns `{}` (the indicator is suppressed when the
 *     pipeline doesn't enforce stage-aware semantics).
 *   - `"warn"` / `"block"` → returns `{ [dealId]: emptyPinnedCount }`.
 *
 * Final stages contribute nothing (closing goes via `closeAsDone`).
 */
export const listDealsMissingFieldsByPipeline = orgQuery({
	args: { orgId: v.id("orgs"), pipelineId: v.id("pipelines") },
	handler: async (ctx, args) => {
		const { member } = await requireOrgMember(ctx, args.orgId);
		requireRole(member.permissions, "deals.view");

		const pipeline = await ctx.db.get(args.pipelineId);
		if (!pipeline || pipeline.orgId !== args.orgId) return {};
		const policy = pipeline.stageTransitionPolicy ?? "warn";
		if (policy === "off") return {};

		const deals = await ctx.db
			.query("deals")
			.withIndex("by_org_and_pipeline", (q) =>
				q.eq("orgId", args.orgId).eq("pipelineId", args.pipelineId),
			)
			.take(500);

		// Pre-load PINNED fields per stage once (avoid N×stage queries).
		// Round 4 (Option A): we walk every pinned field, not just the
		// `required` ones, so that the `+` button surfaces empty optional
		// fields too.
		const pinnedByStage = new Map<string, Awaited<ReturnType<typeof getStagePinnedFields>>>();
		for (const stage of pipeline.stages) {
			if (stage.isFinal) continue;
			pinnedByStage.set(
				stage.id,
				await getStagePinnedFields(ctx, {
					orgId: args.orgId,
					entityType: "deal",
					stageId: stage.id,
				}),
			);
		}

		const result: Record<string, number> = {};
		for (const deal of deals) {
			if (deal.deletedAt !== undefined) continue;
			if (deal.wonAt || deal.lostAt) continue;
			const pinned = pinnedByStage.get(deal.currentStageId);
			if (!pinned || pinned.length === 0) continue;

			const fieldValueRows = await ctx.db
				.query("fieldValues")
				.withIndex("by_entity", (q) =>
					q.eq("orgId", args.orgId).eq("entityType", "deal").eq("entityId", deal._id),
				)
				.collect();
			const valuesByName: Record<string, unknown> = {};
			for (const fv of fieldValueRows) valuesByName[fv.fieldName] = fv.value;

			// File-type fields: count files per fieldKey for this deal.
			const fileCountsByFieldKey: Record<string, number> = {};
			const hasFileFields = pinned.some((f) => f.type === "file" || f.type === "files");
			if (hasFileFields && deal.dealCode) {
				const fileRows = await ctx.db
					.query("files")
					.withIndex("by_org_and_scope", (q) =>
						q.eq("orgId", args.orgId).eq("scope", "deal").eq("scopeId", deal.dealCode),
					)
					.collect();
				for (const fr of fileRows) {
					if (fr.deletedAt) continue;
					if (fr.fieldKey) {
						fileCountsByFieldKey[fr.fieldKey] =
							(fileCountsByFieldKey[fr.fieldKey] ?? 0) + 1;
					}
				}
			}

			const empty = pickEmptyPinnedFields({
				deal: deal as unknown as Record<string, unknown>,
				fieldValuesByName: valuesByName,
				pinnedFields: pinned,
				fileCountsByFieldKey,
			});
			if (empty.length > 0) {
				result[deal._id as unknown as string] = empty.length;
			}
		}
		return result;
	},
});

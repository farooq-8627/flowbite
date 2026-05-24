/**
 * convex/ai/aiEntityPatch.ts
 *
 * Internal mutations (`*ForAI`) that wrap the shared
 * `applyEntityPatchByCodeImpl` helper. AI tools call these — they are
 * NEVER exposed publicly.
 *
 * Why a single multi-entity surface here instead of one twin per entity:
 * the helper already routes by `entityType`. Splitting into four
 * `applyLeadPatchByCodeForAI` / `applyContactPatchByCodeForAI` / …
 * mutations would duplicate the auth-bridge boilerplate four times for
 * zero gain. There is no public sibling: regular UI calls the
 * entity-specific update mutation with an internal id; this mutation
 * exists only because AI tools reach the row by code.
 *
 * Auth: every mutation validates membership via
 * `requireOrgMemberByIds(ctx, orgId, userId)` and the appropriate
 * per-entity permission (e.g. `leads.update`). The helper itself does
 * NOT touch auth — it expects the caller to have validated already.
 *
 * See `PHASE-3-AI-AUDIT.md §6 Phase 4 Part 1` for the incident this
 * unblocks (every twoStep update / enrichment / file-analysis commit
 * was failing with "tool tried to save with an unexpected field").
 */

import { ConvexError, v } from "convex/values";
import { requireOrgMemberByIds } from "../_functions/authenticated";
import { internalMutation } from "../_generated/server";
import {
	applyCustomFieldsForRecordImpl,
	applyEntityPatchByCodeImpl,
	PERMISSION_FOR_ENTITY,
	resolveCodeToRecordForAI,
} from "../_shared/aiEntityPatch";
import { requireRole } from "../_shared/permissions";
import { enforceRateLimit } from "../_shared/rateLimit";

const entityEnum = v.union(
	v.literal("lead"),
	v.literal("contact"),
	v.literal("deal"),
	v.literal("company"),
);

/**
 * Resolve an entity code → row, then apply a structured patch made up
 * of canonical column fields AND/OR custom-field values.
 *
 * Returns the before/after snapshot so the caller (typically a commit
 * tool) can render a diff card and surface unknown keys to the user.
 */
export const applyEntityPatchByCode = internalMutation({
	args: {
		orgId: v.id("orgs"),
		userId: v.id("users"),
		entityType: entityEnum,
		code: v.string(),
		patch: v.record(v.string(), v.any()),
	},
	handler: async (ctx, args) => {
		const { member } = await requireOrgMemberByIds(ctx, args.orgId, args.userId);
		requireRole(member.permissions, PERMISSION_FOR_ENTITY[args.entityType]);

		// Same scope as the public update mutations so a frantic user
		// can't bypass by mixing AI + UI updates.
		await enforceRateLimit(ctx, {
			scope: `${args.entityType}s.update`,
			key: `${args.userId}:${args.orgId}`,
			max: 120,
			periodMs: 60_000,
			orgId: args.orgId,
		});

		return applyEntityPatchByCodeImpl(ctx, args);
	},
});

/**
 * Apply ONLY the custom-field portion of a patch to a record we already
 * know the id of. Used by `commit_create_lead` (and siblings) immediately
 * after the create mutation runs — column fields landed during create,
 * customFields catch up here.
 */
export const applyCustomFieldsForRecord = internalMutation({
	args: {
		orgId: v.id("orgs"),
		userId: v.id("users"),
		entityType: entityEnum,
		entityId: v.string(),
		customFields: v.record(v.string(), v.any()),
	},
	handler: async (ctx, args) => {
		const { member } = await requireOrgMemberByIds(ctx, args.orgId, args.userId);
		requireRole(member.permissions, PERMISSION_FOR_ENTITY[args.entityType]);
		return applyCustomFieldsForRecordImpl(ctx, args);
	},
});

/**
 * Resolve a code (e.g. `P001` / `P-001` / `p-001`) to a record. Returns
 * the canonical `{ entityId, canonicalCode, displayName }` triple so
 * the caller can pass `entityId` to a regular update mutation.
 *
 * Used by AI tools that don't want to apply a patch yet — e.g. snapshotting
 * the record before kicking off the enrichment waterfall.
 */
export const resolveEntityCode = internalMutation({
	args: {
		orgId: v.id("orgs"),
		userId: v.id("users"),
		entityType: entityEnum,
		code: v.string(),
	},
	handler: async (ctx, args) => {
		const { member } = await requireOrgMemberByIds(ctx, args.orgId, args.userId);
		requireRole(member.permissions, PERMISSION_FOR_ENTITY[args.entityType]);

		const resolved = await resolveCodeToRecordForAI(ctx, {
			orgId: args.orgId,
			entityType: args.entityType,
			code: args.code,
		});
		if (!resolved) {
			throw new ConvexError({
				code: "NOT_FOUND",
				message: `No ${args.entityType} found with code ${args.code}.`,
			});
		}
		const row = resolved.row as {
			_id: string;
			displayName?: string;
			title?: string;
			name?: string;
		};
		return {
			entityType: resolved.entityType,
			entityId: row._id,
			canonicalCode: resolved.canonicalCode,
			displayName: row.displayName ?? row.title ?? row.name ?? "",
		};
	},
});

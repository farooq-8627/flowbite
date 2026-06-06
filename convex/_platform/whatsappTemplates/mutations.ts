/**
 * WhatsApp templates owner mutations — B.40.
 *
 * Owner-panel CRUD over `whatsappTemplates`. Same 4-step canonical
 * shape used everywhere under `_platform/`:
 *
 *   1. requirePlatformOwner(ctx)         — defence-in-depth gate
 *   2. enforceRateLimit(ctx, ...)        — shared "owner.write" scope
 *   3. read-modify-write with snapshot   — capture `before` JSON
 *   4. logPlatformAction(ctx, ...)       — append-only audit row
 *
 * Built-in safety:
 *   - Owner cannot DELETE a built-in row (idempotent seed re-creates it
 *     anyway). They CAN archive (`active=false`) or edit body / variables;
 *     edits propagate to every org via the read-precedence rule
 *     (`getTemplateForOrg`).
 *   - Owner CANNOT change `templateId` post-creation (would orphan
 *     callers). Rename label/description instead.
 *   - `isBuiltIn` is server-controlled — set once at create and never
 *     mutated.
 *
 * Spec: `Future-Enhancements.md §B.40`.
 */

import { ConvexError, v } from "convex/values";
import { mutation } from "../../_generated/server";
import { enforceRateLimit, RATE_LIMITS } from "../../_shared/rateLimit";
import { logPlatformAction } from "../audit/helpers";
import { requirePlatformOwner } from "../ownerAuth";

// ─── Validators ──────────────────────────────────────────────────────────

const TEMPLATE_ID_REGEX = /^[a-z][a-z0-9_]*[a-z0-9]$/;
const TEMPLATE_ID_MIN = 3;
const TEMPLATE_ID_MAX = 64;
const BODY_MAX = 1024;
const LABEL_MAX = 80;
const DESCRIPTION_MAX = 240;
const VAR_NAME_REGEX = /^[a-z][a-z0-9_]*$/;
const VAR_NAME_MAX = 32;
const VAR_DESCRIPTION_MAX = 120;
const VAR_LIMIT = 16;

function assertValidTemplateId(id: string): void {
	if (id.length < TEMPLATE_ID_MIN || id.length > TEMPLATE_ID_MAX) {
		throw new ConvexError(
			`INVALID_TEMPLATE_ID: must be ${TEMPLATE_ID_MIN}–${TEMPLATE_ID_MAX} characters`,
		);
	}
	if (!TEMPLATE_ID_REGEX.test(id)) {
		throw new ConvexError(
			"INVALID_TEMPLATE_ID: lowercase letters, digits, underscores; must start with a letter and not end with an underscore",
		);
	}
}

const variableValidator = v.object({
	name: v.string(),
	description: v.string(),
	defaultValue: v.optional(v.string()),
});

const categoryValidator = v.union(
	v.literal("utility"),
	v.literal("marketing"),
	v.literal("authentication"),
);

const approvalStatusValidator = v.union(
	v.literal("draft"),
	v.literal("submitted"),
	v.literal("approved"),
	v.literal("rejected"),
);

function assertValidVariables(vars: ReadonlyArray<{ name: string; description: string }>): void {
	if (vars.length > VAR_LIMIT) {
		throw new ConvexError(`TOO_MANY_VARIABLES: maximum ${VAR_LIMIT}`);
	}
	const seen = new Set<string>();
	for (const vv of vars) {
		if (vv.name.length === 0 || vv.name.length > VAR_NAME_MAX) {
			throw new ConvexError(`INVALID_VARIABLE_NAME: 1–${VAR_NAME_MAX} characters required`);
		}
		if (!VAR_NAME_REGEX.test(vv.name)) {
			throw new ConvexError(
				"INVALID_VARIABLE_NAME: lowercase letters, digits, underscores; must start with a letter",
			);
		}
		if (seen.has(vv.name)) {
			throw new ConvexError(`DUPLICATE_VARIABLE_NAME: ${vv.name}`);
		}
		seen.add(vv.name);
		if (vv.description.length === 0 || vv.description.length > VAR_DESCRIPTION_MAX) {
			throw new ConvexError(
				`INVALID_VARIABLE_DESCRIPTION: 1–${VAR_DESCRIPTION_MAX} characters required`,
			);
		}
	}
}

/**
 * Make sure every `{{var}}` in the body has a matching declared variable
 * and vice-versa. Catches the common "renamed body but forgot the var
 * list" footgun before it reaches the AI.
 */
function assertBodyMatchesVariables(body: string, vars: ReadonlyArray<{ name: string }>): void {
	if (body.length === 0 || body.length > BODY_MAX) {
		throw new ConvexError(`INVALID_BODY: 1–${BODY_MAX} characters required`);
	}
	const referenced = new Set<string>();
	const re = /\{\{\s*([a-z][a-z0-9_]*)\s*\}\}/g;
	for (const match of body.matchAll(re)) {
		referenced.add(match[1] as string);
	}
	const declared = new Set(vars.map((vv) => vv.name));
	for (const name of referenced) {
		if (!declared.has(name)) {
			throw new ConvexError(`UNDECLARED_VARIABLE_IN_BODY: {{${name}}}`);
		}
	}
	for (const name of declared) {
		if (!referenced.has(name)) {
			throw new ConvexError(`UNUSED_DECLARED_VARIABLE: ${name}`);
		}
	}
}

// ─── Create ──────────────────────────────────────────────────────────────

export const createTemplate = mutation({
	args: {
		templateId: v.string(),
		orgId: v.optional(v.id("orgs")),
		label: v.string(),
		description: v.string(),
		category: categoryValidator,
		body: v.string(),
		variables: v.array(variableValidator),
		contentSid: v.optional(v.string()),
		approvalStatus: v.optional(approvalStatusValidator),
		approvalNote: v.optional(v.string()),
		reason: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const { user, userId } = await requirePlatformOwner(ctx);
		await enforceRateLimit(ctx, {
			scope: "owner.write",
			key: `${userId}`,
			...RATE_LIMITS.write,
		});

		const templateId = args.templateId.trim().toLowerCase();
		assertValidTemplateId(templateId);
		if (args.label.length === 0 || args.label.length > LABEL_MAX) {
			throw new ConvexError(`INVALID_LABEL: 1–${LABEL_MAX} characters required`);
		}
		if (args.description.length === 0 || args.description.length > DESCRIPTION_MAX) {
			throw new ConvexError(`INVALID_DESCRIPTION: 1–${DESCRIPTION_MAX} characters required`);
		}
		assertValidVariables(args.variables);
		assertBodyMatchesVariables(args.body, args.variables);

		const existing = await ctx.db
			.query("whatsappTemplates")
			.withIndex("by_template_org", (q) =>
				q.eq("templateId", templateId).eq("orgId", args.orgId),
			)
			.unique();
		if (existing && existing.deletedAt === undefined) {
			throw new ConvexError(
				`DUPLICATE_TEMPLATE: ${templateId}${args.orgId ? ` (org override)` : ""}`,
			);
		}

		const now = Date.now();
		const inserted = {
			templateId,
			orgId: args.orgId,
			label: args.label.trim(),
			description: args.description.trim(),
			category: args.category,
			body: args.body,
			variables: args.variables,
			contentSid: args.contentSid?.trim() || undefined,
			approvalStatus: args.approvalStatus ?? "draft",
			approvalNote: args.approvalNote?.trim() || undefined,
			isBuiltIn: false,
			active: true,
			updatedBy: userId,
			createdAt: now,
			updatedAt: now,
		};
		const id = await ctx.db.insert("whatsappTemplates", inserted);

		await logPlatformAction(ctx, {
			actorUserId: userId,
			actorEmail: user.email,
			action: "owner.whatsappTemplate.create",
			targetType: "whatsappTemplate",
			targetId: id,
			before: null,
			after: { _id: id, ...inserted },
			reason: args.reason,
		});

		return { ok: true, id };
	},
});

// ─── Update ──────────────────────────────────────────────────────────────

export const updateTemplate = mutation({
	args: {
		templateRowId: v.id("whatsappTemplates"),
		patch: v.object({
			label: v.optional(v.string()),
			description: v.optional(v.string()),
			category: v.optional(categoryValidator),
			body: v.optional(v.string()),
			variables: v.optional(v.array(variableValidator)),
			contentSid: v.optional(v.union(v.string(), v.null())),
			approvalStatus: v.optional(approvalStatusValidator),
			approvalNote: v.optional(v.union(v.string(), v.null())),
			active: v.optional(v.boolean()),
		}),
		reason: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const { user, userId } = await requirePlatformOwner(ctx);
		await enforceRateLimit(ctx, {
			scope: "owner.write",
			key: `${userId}`,
			...RATE_LIMITS.write,
		});

		const existing = await ctx.db.get(args.templateRowId);
		if (!existing || existing.deletedAt !== undefined) {
			throw new ConvexError("TEMPLATE_NOT_FOUND");
		}

		// Validate the merged shape — body and variables interact, so we
		// check them against each other after the patch is applied.
		const nextLabel = args.patch.label ?? existing.label;
		if (nextLabel.length === 0 || nextLabel.length > LABEL_MAX) {
			throw new ConvexError(`INVALID_LABEL: 1–${LABEL_MAX} characters required`);
		}
		const nextDescription = args.patch.description ?? existing.description;
		if (nextDescription.length === 0 || nextDescription.length > DESCRIPTION_MAX) {
			throw new ConvexError(`INVALID_DESCRIPTION: 1–${DESCRIPTION_MAX} characters required`);
		}
		const nextVariables = args.patch.variables ?? existing.variables;
		assertValidVariables(nextVariables);
		const nextBody = args.patch.body ?? existing.body;
		assertBodyMatchesVariables(nextBody, nextVariables);

		const before = { ...existing };
		const now = Date.now();
		const next = {
			label: nextLabel.trim(),
			description: nextDescription.trim(),
			category: args.patch.category ?? existing.category,
			body: nextBody,
			variables: nextVariables,
			contentSid:
				args.patch.contentSid === null
					? undefined
					: (args.patch.contentSid?.trim() ?? existing.contentSid),
			approvalStatus: args.patch.approvalStatus ?? existing.approvalStatus,
			approvalNote:
				args.patch.approvalNote === null
					? undefined
					: (args.patch.approvalNote?.trim() ?? existing.approvalNote),
			active: args.patch.active ?? existing.active,
			updatedBy: userId,
			updatedAt: now,
		};
		await ctx.db.patch(existing._id, next);

		await logPlatformAction(ctx, {
			actorUserId: userId,
			actorEmail: user.email,
			action: "owner.whatsappTemplate.update",
			targetType: "whatsappTemplate",
			targetId: existing._id,
			before,
			after: { ...existing, ...next, _id: existing._id },
			reason: args.reason,
		});

		return { ok: true };
	},
});

// ─── Delete (soft, blocked for built-ins) ────────────────────────────────

/**
 * Soft-deletes the row. Built-in rows refuse — operators must archive
 * via `active=false` instead. Soft-delete makes recovery a one-row
 * patch and keeps the audit trail intact.
 */
export const deleteTemplate = mutation({
	args: {
		templateRowId: v.id("whatsappTemplates"),
		reason: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const { user, userId } = await requirePlatformOwner(ctx);
		await enforceRateLimit(ctx, {
			scope: "owner.write",
			key: `${userId}`,
			...RATE_LIMITS.write,
		});

		const existing = await ctx.db.get(args.templateRowId);
		if (!existing || existing.deletedAt !== undefined) {
			throw new ConvexError("TEMPLATE_NOT_FOUND");
		}
		if (existing.isBuiltIn) {
			throw new ConvexError(
				"BUILTIN_TEMPLATE_NOT_DELETABLE: archive via `active=false` instead",
			);
		}

		const before = { ...existing };
		const now = Date.now();
		await ctx.db.patch(existing._id, {
			deletedAt: now,
			active: false,
			updatedBy: userId,
			updatedAt: now,
		});

		await logPlatformAction(ctx, {
			actorUserId: userId,
			actorEmail: user.email,
			action: "owner.whatsappTemplate.delete",
			targetType: "whatsappTemplate",
			targetId: existing._id,
			before,
			after: { _id: existing._id, deletedAt: now },
			reason: args.reason,
		});

		return { ok: true };
	},
});

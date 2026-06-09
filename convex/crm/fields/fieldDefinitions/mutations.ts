/**
 * Field Definitions Mutations — convex/crm/fields/fieldDefinitions/mutations.ts
 *
 * CRUD for dynamic field schema. Only owner/admin can manage fields.
 * Field types per schema: text, number, select, multiselect, date, boolean, url, email, relation, file
 */
import { ConvexError, v } from "convex/values";
import {
	orgMutation,
	requireOrgMember,
	requireOrgMemberByIds,
} from "../../../_functions/authenticated";
import { internal } from "../../../_generated/api";
import type { Id } from "../../../_generated/dataModel";
import { internalMutation, type MutationCtx } from "../../../_generated/server";
import { ERRORS } from "../../../_shared/errors";
import { requireRole } from "../../../_shared/permissions";
import { seedFieldDefinitionsForOrg } from "./internal";

/**
 * Lazy seed — called by `useEntityFields` on the client when it observes zero
 * field definitions for an org that should already have them. Idempotent: if
 * rows already exist, returns 0. Open to any org member (not gated by
 * fieldDefinitions.manage) because it only inserts the well-known system
 * defaults — never user-editable schema.
 */
export const ensureForOrg = orgMutation({
	args: { orgId: v.id("orgs") },
	handler: async (ctx, args) => {
		const { org } = await requireOrgMember(ctx, args.orgId);
		const industry = org.industry ?? "general";
		return seedFieldDefinitionsForOrg(ctx, args.orgId, industry);
	},
});

async function createImpl(
	ctx: MutationCtx,
	args: {
		orgId: Id<"orgs">;
		entityType: string;
		name: string;
		label: string;
		labelAr?: string;
		type: string;
		groupName?: string;
		required?: boolean;
		options?: string[];
		defaultValue?: unknown;
		sensitive?: boolean;
		allowedFileTypes?: string[];
	},
) {
	const isFileType = args.type === "file" || args.type === "files";
	const allowedFileTypes =
		isFileType && args.allowedFileTypes && args.allowedFileTypes.length > 0
			? args.allowedFileTypes
			: undefined;

	const existing = await ctx.db
		.query("fieldDefinitions")
		.withIndex("by_org_and_entity", (q) =>
			q.eq("orgId", args.orgId).eq("entityType", args.entityType),
		)
		.collect();

	// Uniqueness guard — `(orgId, entityType, name)` is a logical primary
	// key for fieldDefinitions. Without this check, the AI's `create_field`
	// tool was creating the same field twice (the 2026-05-24 incident:
	// duplicate `records` rows on entityType `lead`) which then caused a
	// duplicate-React-key warning in the DataTable header. The seed path
	// (`seedFieldDefinitionsForOrg`) was already idempotent on
	// `${entityType}::${name}`; this brings the public + AI write path in
	// line.
	const duplicate = existing.find((r) => r.name === args.name);
	if (duplicate) {
		throw new ConvexError({
			code: "DUPLICATE",
			message: `A field named "${args.name}" already exists on ${args.entityType}. Pick a different name or update the existing field.`,
			fieldId: duplicate._id,
		});
	}

	const maxOrder = existing.reduce((max, f) => Math.max(max, f.order ?? 0), -1);

	return ctx.db.insert("fieldDefinitions", {
		orgId: args.orgId,
		entityType: args.entityType,
		name: args.name,
		label: args.label,
		labelAr: args.labelAr,
		type: args.type,
		groupName: args.groupName,
		required: args.required ?? false,
		options: args.options,
		defaultValue: args.defaultValue,
		sensitive: args.sensitive,
		allowedFileTypes,
		order: maxOrder + 1,
		createdAt: Date.now(),
		updatedAt: Date.now(),
	});
}

export const create = orgMutation({
	args: {
		orgId: v.id("orgs"),
		entityType: v.string(),
		name: v.string(),
		label: v.string(),
		labelAr: v.optional(v.string()),
		type: v.string(),
		groupName: v.optional(v.string()),
		required: v.optional(v.boolean()),
		options: v.optional(v.array(v.string())),
		defaultValue: v.optional(v.any()),
		sensitive: v.optional(v.boolean()),
		/**
		 * Whitelist of file-category ids for `file` / `files` types.
		 * Empty array = any file allowed. See `crmFields.ts` schema.
		 */
		allowedFileTypes: v.optional(v.array(v.string())),
	},
	handler: async (ctx, args) => {
		const { member } = await requireOrgMember(ctx, args.orgId);
		requireRole(member.permissions, "fieldDefinitions.manage");
		return createImpl(ctx, args);
	},
});

/** AI-callable internal twin. */
export const createForAI = internalMutation({
	args: {
		orgId: v.id("orgs"),
		userId: v.id("users"),
		entityType: v.string(),
		name: v.string(),
		label: v.string(),
		labelAr: v.optional(v.string()),
		type: v.string(),
		groupName: v.optional(v.string()),
		required: v.optional(v.boolean()),
		options: v.optional(v.array(v.string())),
		defaultValue: v.optional(v.any()),
		sensitive: v.optional(v.boolean()),
		allowedFileTypes: v.optional(v.array(v.string())),
	},
	handler: async (ctx, args) => {
		const { member } = await requireOrgMemberByIds(ctx, args.orgId, args.userId);
		requireRole(member.permissions, "fieldDefinitions.manage");
		const { userId: _u, ...rest } = args;
		return createImpl(ctx, rest);
	},
});

async function updateImpl(
	ctx: MutationCtx,
	args: {
		orgId: Id<"orgs">;
		fieldId: Id<"fieldDefinitions">;
		label?: string;
		labelAr?: string;
		groupName?: string;
		required?: boolean;
		options?: string[];
		defaultValue?: unknown;
		hidden?: boolean;
		showInStages?: string[];
		allowedFileTypes?: string[];
	},
): Promise<void> {
	const field = await ctx.db.get(args.fieldId);
	if (!field || field.orgId !== args.orgId) throw new ConvexError(ERRORS.NOT_FOUND);

	// Protected fields can be renamed / reordered, but not hidden.
	if (field.protected && args.hidden === true) {
		throw new ConvexError({
			code: "PROTECTED",
			message: "This field is required by the system and cannot be hidden.",
		});
	}

	// Validate stage IDs exist in at least one of the org's pipelines for
	// this entity type. Skips when entityType is not deal-like (only
	// deals have pipelines today).
	if (args.showInStages && args.showInStages.length > 0) {
		const pipelines = await ctx.db
			.query("pipelines")
			.withIndex("by_org_and_entity", (q) =>
				q.eq("orgId", args.orgId).eq("entityType", field.entityType),
			)
			.collect();
		const validStageIds = new Set<string>();
		for (const p of pipelines) {
			// Trashed pipelines' stage ids are not valid pin targets.
			if (p.deletedAt !== undefined) continue;
			for (const s of p.stages) validStageIds.add(s.id);
		}
		const unknown = args.showInStages.filter((id) => !validStageIds.has(id));
		if (unknown.length > 0) {
			throw new ConvexError({
				code: "INVALID_STAGE",
				message: `Unknown stage id(s): ${unknown.join(", ")}`,
			});
		}
	}

	// Only persist allowedFileTypes for file-typed fields. For all
	// other types we ignore the prop entirely so a stray array
	// can't survive a type change.
	const isFileType = field.type === "file" || field.type === "files";
	const { orgId: _o, fieldId: _f, allowedFileTypes, ...rest } = args;
	const patch: Record<string, unknown> = Object.fromEntries(
		Object.entries(rest).filter(([, v]) => v !== undefined),
	);
	if (isFileType && allowedFileTypes !== undefined) {
		patch.allowedFileTypes = allowedFileTypes.length > 0 ? allowedFileTypes : undefined;
	}
	await ctx.db.patch(args.fieldId, { ...patch, updatedAt: Date.now() });
}

export const update = orgMutation({
	args: {
		orgId: v.id("orgs"),
		fieldId: v.id("fieldDefinitions"),
		label: v.optional(v.string()),
		labelAr: v.optional(v.string()),
		groupName: v.optional(v.string()),
		required: v.optional(v.boolean()),
		options: v.optional(v.array(v.string())),
		defaultValue: v.optional(v.any()),
		hidden: v.optional(v.boolean()),
		/**
		 * Stage IDs this field should appear on. `undefined` / empty array =
		 * show on every stage. Pass `[]` explicitly to clear an existing
		 * restriction. Validated against the deal pipeline if `entityType
		 * === "deal"` so admins can't ship references to deleted stages.
		 */
		showInStages: v.optional(v.array(v.string())),
		/**
		 * Whitelist of file-category ids for `file` / `files` types.
		 * Pass `[]` explicitly to clear (= any file allowed).
		 */
		allowedFileTypes: v.optional(v.array(v.string())),
	},
	handler: async (ctx, args) => {
		const { member } = await requireOrgMember(ctx, args.orgId);
		requireRole(member.permissions, "fieldDefinitions.manage");
		await updateImpl(ctx, args);
	},
});

/** AI-callable internal twin of `update`. */
export const updateForAI = internalMutation({
	args: {
		orgId: v.id("orgs"),
		userId: v.id("users"),
		fieldId: v.id("fieldDefinitions"),
		label: v.optional(v.string()),
		labelAr: v.optional(v.string()),
		groupName: v.optional(v.string()),
		required: v.optional(v.boolean()),
		options: v.optional(v.array(v.string())),
		defaultValue: v.optional(v.any()),
		hidden: v.optional(v.boolean()),
		showInStages: v.optional(v.array(v.string())),
		allowedFileTypes: v.optional(v.array(v.string())),
	},
	handler: async (ctx, args) => {
		const { member } = await requireOrgMemberByIds(ctx, args.orgId, args.userId);
		requireRole(member.permissions, "fieldDefinitions.manage");
		const { userId: _u, ...rest } = args;
		await updateImpl(ctx, rest);
	},
});

async function reorderImpl(
	ctx: MutationCtx,
	args: { orgId: Id<"orgs">; fieldIds: Id<"fieldDefinitions">[] },
): Promise<void> {
	const now = Date.now();
	await Promise.all(
		args.fieldIds.map((id, index) => ctx.db.patch(id, { order: index, updatedAt: now })),
	);
}

export const reorder = orgMutation({
	args: {
		orgId: v.id("orgs"),
		fieldIds: v.array(v.id("fieldDefinitions")),
	},
	handler: async (ctx, args) => {
		const { member } = await requireOrgMember(ctx, args.orgId);
		requireRole(member.permissions, "fieldDefinitions.manage");
		await reorderImpl(ctx, args);
	},
});

/** AI-callable internal twin. */
export const reorderForAI = internalMutation({
	args: {
		orgId: v.id("orgs"),
		userId: v.id("users"),
		fieldIds: v.array(v.id("fieldDefinitions")),
	},
	handler: async (ctx, args) => {
		const { member } = await requireOrgMemberByIds(ctx, args.orgId, args.userId);
		requireRole(member.permissions, "fieldDefinitions.manage");
		const { userId: _u, ...rest } = args;
		await reorderImpl(ctx, rest);
	},
});

async function removeImpl(
	ctx: MutationCtx,
	args: { orgId: Id<"orgs">; fieldId: Id<"fieldDefinitions"> },
): Promise<void> {
	const field = await ctx.db.get(args.fieldId);
	if (!field || field.orgId !== args.orgId) throw new ConvexError(ERRORS.NOT_FOUND);

	// Protected system fields (e.g. personCode, displayName) cannot be deleted.
	// Admin can hide non-protected system fields instead.
	if (field.protected) {
		throw new ConvexError({
			code: "PROTECTED",
			message: "This field is required by the system and cannot be deleted.",
		});
	}

	// Assignee fields are also undeletable — the user can hide them, but
	// we need the field-definition row to stay around so the
	// "Assignee" option in the field selector / view options menu
	// always has something to point at and can be re-shown later
	// without re-seeding the whole entity. (`protected: true` would
	// block hide too; we want hide-yes / delete-no.)
	if (field.kind === "assignee") {
		throw new ConvexError({
			code: "UNDELETABLE",
			message:
				"Assignee fields can be hidden but not deleted, so they can be brought back any time.",
		});
	}

	// Tags follow the same hide-yes / delete-no rule as assignee
	// (locked 2026-06-10 per user). Tags are `storage: "join"`, which
	// the field manager UI doesn't support creating from scratch — so
	// once deleted there's no recovery short of re-seeding. Keeping the
	// row alive lets the owner toggle visibility per stage / per
	// pipeline without losing the field forever. `protected: true`
	// would block hide too, which the user explicitly wants to remain
	// available.
	if (field.kind === "tags") {
		throw new ConvexError({
			code: "UNDELETABLE",
			message: "Tags can be hidden but not deleted, so they can be brought back any time.",
		});
	}

	// Bounded cascade: take up to 500 fieldValues per call. If we hit the cap,
	// schedule a continuation via internalMutation. Same pattern as tags.
	const CASCADE_BATCH = 500;
	const values = await ctx.db
		.query("fieldValues")
		.withIndex("by_field_and_entity", (q) =>
			q.eq("orgId", args.orgId).eq("fieldId", args.fieldId),
		)
		.take(CASCADE_BATCH);
	await Promise.all(values.map((fv) => ctx.db.delete(fv._id)));

	if (values.length === CASCADE_BATCH) {
		await ctx.scheduler.runAfter(
			0,
			internal.crm.fields.fieldDefinitions.internal.purgeFieldDefinitionCascade,
			{ orgId: args.orgId, fieldId: args.fieldId },
		);
		return; // field row deleted by the continuation when cascade finishes
	}

	await ctx.db.delete(args.fieldId);
}

export const remove = orgMutation({
	args: { orgId: v.id("orgs"), fieldId: v.id("fieldDefinitions") },
	handler: async (ctx, args) => {
		const { member } = await requireOrgMember(ctx, args.orgId);
		requireRole(member.permissions, "fieldDefinitions.manage");
		await removeImpl(ctx, args);
	},
});

/** AI-callable internal twin of `remove`. */
export const removeForAI = internalMutation({
	args: {
		orgId: v.id("orgs"),
		userId: v.id("users"),
		fieldId: v.id("fieldDefinitions"),
	},
	handler: async (ctx, args) => {
		const { member } = await requireOrgMemberByIds(ctx, args.orgId, args.userId);
		requireRole(member.permissions, "fieldDefinitions.manage");
		await removeImpl(ctx, { orgId: args.orgId, fieldId: args.fieldId });
	},
});

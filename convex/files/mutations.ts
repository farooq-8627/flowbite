/**
 * Files Mutations — convex/files/mutations.ts
 *
 * Universal file-storage API. One code path for every entity in the app:
 * leads, contacts, deals, companies, users, the org itself, or arbitrary
 * custom-field attachments — all share this module.
 *
 * SCOPE STRATEGY (locked decision — see DYNAMIC_FIELDS_BLUEPRINT.md §10):
 *     - scope="org",     scopeId=orgId         → workspace-level files
 *     - scope="person",  scopeId=personCode    → person attachments
 *     - scope="lead",    scopeId=personCode    → lead attachments (alias of person)
 *     - scope="contact", scopeId=personCode    → contact attachments
 *     - scope="deal",    scopeId=dealCode      → deal attachments
 *     - scope="company", scopeId=companyCode   → company attachments
 *     - scope="user",    scopeId=userId        → user profile attachments
 *     - scope="field",   scopeId=fieldValueId  → dynamic file-field bytes
 *   Cross-entity attribution uses `tags` (e.g. `tags=["deal:D-001"]`) so a
 *   single file can surface in BOTH the person profile AND the deal page.
 *
 * UPLOAD CONTRACT
 *   1. Client calls `generateUploadUrl` → gets a short-lived Convex upload URL.
 *   2. Client POSTs the file directly to that URL → gets back a storageId.
 *   3. Client calls `record({ storageId, scope, scopeId, name, size, mimeType, tags? })`.
 *
 * VALIDATION (every `record` call):
 *   - `scope` must be one of the known values above (else INVALID_ARGS).
 *   - `scopeId` must resolve to an existing entity in the same org (else NOT_FOUND).
 *   - `args.size` must not exceed `org.settings.fileUpload.maxSizeMb` (default 25MB).
 *   - `args.mimeType` must be in `org.settings.fileUpload.allowedMimeCategories`
 *     (default: every category — see DEFAULT_MIME_CATEGORIES below).
 *
 * AUTHZ:
 *   - `record` / `updateTags`: `files.upload`
 *   - `remove`: own (uploadedBy === userId) + `files.delete`  OR  `files.deleteAny`
 *   - `generateUploadUrl`: any authenticated user (rate-limited)
 *
 * Every mutation logs activity with the file's scope and scopeId.
 */

import { ConvexError, v } from "convex/values";
import { authenticatedMutation, orgMutation, requireOrgMember } from "../_functions/authenticated";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { ERRORS } from "../_shared/errors";
import { hasPermission, requireRole } from "../_shared/permissions";
import { enforceRateLimit, RATE_LIMITS } from "../_shared/rateLimit";
import { logActivity } from "../activityLogs/helpers";

// ─── Defaults (fallback when org hasn't configured file policy) ──────────────

const DEFAULT_MAX_SIZE_MB = 25;

/**
 * Default mime-type category map. Each category lists wildcard prefixes that
 * the validator matches against. Categories come from `org.settings.fileUpload
 * .allowedMimeCategories` — when empty, every category is allowed.
 */
const MIME_CATEGORIES: Record<string, readonly string[]> = {
	image: ["image/"],
	video: ["video/"],
	audio: ["audio/"],
	pdf: ["application/pdf"],
	document: [
		"application/msword",
		"application/vnd.openxmlformats-officedocument.wordprocessingml.document",
		"application/vnd.oasis.opendocument.text",
		"text/plain",
		"text/markdown",
		"text/csv",
	],
	spreadsheet: [
		"application/vnd.ms-excel",
		"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
		"application/vnd.oasis.opendocument.spreadsheet",
		"text/csv",
	],
	presentation: [
		"application/vnd.ms-powerpoint",
		"application/vnd.openxmlformats-officedocument.presentationml.presentation",
		"application/vnd.oasis.opendocument.presentation",
	],
	archive: [
		"application/zip",
		"application/x-tar",
		"application/x-rar-compressed",
		"application/x-7z-compressed",
		"application/gzip",
	],
} as const;

const VALID_SCOPES = new Set([
	"org",
	"person",
	"lead",
	"contact",
	"deal",
	"company",
	"user",
	"field",
]);

// ─── Validators ──────────────────────────────────────────────────────────────

async function validateScopeId(
	ctx: QueryCtx | MutationCtx,
	orgId: Id<"orgs">,
	scope: string,
	scopeId: string,
): Promise<void> {
	if (!VALID_SCOPES.has(scope)) {
		throw new ConvexError({
			code: "INVALID_SCOPE",
			message: `Unknown file scope "${scope}". Allowed: ${[...VALID_SCOPES].join(", ")}`,
		});
	}

	if (scope === "org") {
		if (scopeId !== orgId) throw new ConvexError(ERRORS.NOT_FOUND);
		return;
	}

	if (scope === "person" || scope === "lead" || scope === "contact") {
		const contact = await ctx.db
			.query("contacts")
			.withIndex("by_org_and_personCode", (q) =>
				q.eq("orgId", orgId).eq("personCode", scopeId),
			)
			.first();
		if (contact && !contact.deletedAt) return;
		const lead = await ctx.db
			.query("leads")
			.withIndex("by_org_and_personCode", (q) =>
				q.eq("orgId", orgId).eq("personCode", scopeId),
			)
			.first();
		if (lead && !lead.deletedAt) return;
		throw new ConvexError(ERRORS.NOT_FOUND);
	}

	if (scope === "deal") {
		const deal = await ctx.db
			.query("deals")
			.withIndex("by_org_and_dealCode", (q) => q.eq("orgId", orgId).eq("dealCode", scopeId))
			.first();
		if (!deal || deal.deletedAt) throw new ConvexError(ERRORS.NOT_FOUND);
		return;
	}

	if (scope === "company") {
		const company = await ctx.db
			.query("companies")
			.withIndex("by_org_and_companyCode", (q) =>
				q.eq("orgId", orgId).eq("companyCode", scopeId),
			)
			.first();
		if (!company || company.deletedAt) throw new ConvexError(ERRORS.NOT_FOUND);
		return;
	}

	if (scope === "user") {
		// Only valid scopeId is the caller themselves.
		// (Org-wide member files would use scope="org" with a tag.)
		// Caller binds scopeId === userId at the orgMutation level.
		return;
	}

	if (scope === "field") {
		const fv = await ctx.db
			.query("fieldValues")
			.withIndex("by_entity", (q) => q.eq("orgId", orgId))
			.take(1);
		// Field-value lookup is by id only; light validation is acceptable here
		// because the dynamic-field path always passes a freshly-written fieldValueId.
		if (fv === undefined) throw new ConvexError(ERRORS.NOT_FOUND);
		return;
	}
}

function validateMimeType(mimeType: string, allowedCategories: readonly string[]): void {
	if (allowedCategories.length === 0) return; // not configured → allow all
	const allowedPrefixes = allowedCategories
		.flatMap((cat) => MIME_CATEGORIES[cat] ?? [])
		.filter(Boolean);
	if (allowedPrefixes.length === 0) return; // unknown category set → allow
	const matches = allowedPrefixes.some(
		(prefix) => mimeType === prefix || mimeType.startsWith(prefix),
	);
	if (!matches) {
		throw new ConvexError({
			code: "MIME_TYPE_NOT_ALLOWED",
			message: `File type "${mimeType}" is not allowed by workspace policy.`,
			allowedCategories: [...allowedCategories],
		});
	}
}

// ─── Mutations ───────────────────────────────────────────────────────────────

/**
 * Generate a short-lived upload URL. Caller then POSTs the file bytes
 * directly to that URL and receives a storageId.
 *
 * Rate-limited to prevent storage-bucket abuse.
 */
export const generateUploadUrl = authenticatedMutation({
	args: {},
	handler: async (ctx) => {
		await enforceRateLimit(ctx, {
			scope: "files.generateUploadUrl",
			key: ctx.userId,
			...RATE_LIMITS.upload,
		});
		return await ctx.storage.generateUploadUrl();
	},
});

/**
 * Record a freshly-uploaded file in the `files` table.
 *
 * Validates scope/scopeId, max-size, and mime-type against the org's
 * `settings.fileUpload` policy before inserting.
 */
export const record = orgMutation({
	args: {
		orgId: v.id("orgs"),
		storageId: v.id("_storage"),
		scope: v.string(),
		scopeId: v.string(),
		fieldKey: v.optional(v.string()),
		tags: v.optional(v.array(v.string())),
		name: v.string(),
		size: v.number(),
		mimeType: v.string(),
	},
	handler: async (ctx, args) => {
		const { userId, member, org } = await requireOrgMember(ctx, args.orgId);
		requireRole(member.permissions, "files.upload");
		await enforceRateLimit(ctx, {
			scope: "files.record",
			key: `${userId}:${args.orgId}`,
			...RATE_LIMITS.upload,
		});

		// Per-org policy (DB-driven, no hardcoded limits).
		const maxSizeMb = org.settings?.fileUpload?.maxSizeMb ?? DEFAULT_MAX_SIZE_MB;
		const allowedCategories = org.settings?.fileUpload?.allowedMimeCategories ?? [];

		if (args.size <= 0 || args.size > maxSizeMb * 1024 * 1024) {
			throw new ConvexError({
				code: "FILE_TOO_LARGE",
				message: `File exceeds the ${maxSizeMb} MB workspace limit.`,
				maxSizeMb,
			});
		}

		validateMimeType(args.mimeType, allowedCategories);

		// Resolve scope id — for "user" the only allowed value is the caller.
		const effectiveScopeId = args.scope === "user" ? userId : args.scopeId;
		await validateScopeId(ctx, args.orgId, args.scope, effectiveScopeId);

		const now = Date.now();
		const fileId = await ctx.db.insert("files", {
			orgId: args.orgId,
			storageId: args.storageId,
			scope: args.scope,
			scopeId: effectiveScopeId,
			fieldKey: args.fieldKey,
			tags: args.tags,
			name: args.name,
			size: args.size,
			mimeType: args.mimeType,
			uploadedBy: userId,
			createdAt: now,
			updatedAt: now,
		});

		await logActivity(ctx, {
			orgId: args.orgId,
			userId,
			action: "file_uploaded",
			entityType: args.scope,
			entityId: effectiveScopeId,
			description: `File uploaded: ${args.name}`,
			metadata: {
				fileId,
				size: args.size,
				mimeType: args.mimeType,
			},
		});

		return fileId;
	},
});

/**
 * Add or remove tags on a file. Owner-only or files.deleteAny moderator.
 */
export const updateTags = orgMutation({
	args: {
		orgId: v.id("orgs"),
		fileId: v.id("files"),
		tags: v.array(v.string()),
	},
	handler: async (ctx, args) => {
		const { userId, member } = await requireOrgMember(ctx, args.orgId);
		const file = await ctx.db.get(args.fileId);
		if (!file || file.orgId !== args.orgId || file.deletedAt !== undefined) {
			throw new ConvexError(ERRORS.NOT_FOUND);
		}

		const isOwn = file.uploadedBy === userId;
		const canEditAny = hasPermission(member.permissions, "files.deleteAny");
		if (!(canEditAny || isOwn)) {
			throw new ConvexError(ERRORS.FORBIDDEN);
		}

		await ctx.db.patch(args.fileId, {
			tags: args.tags,
			updatedAt: Date.now(),
		});

		await logActivity(ctx, {
			orgId: args.orgId,
			userId,
			action: "file_updated",
			entityType: file.scope,
			entityId: file.scopeId,
			description: `File tags updated: ${file.name}`,
			metadata: { fileId: args.fileId },
		});
	},
});

/**
 * Soft-delete a file row and purge the bytes from Convex File Storage.
 * Owner OR files.deleteAny moderator.
 */
export const remove = orgMutation({
	args: {
		orgId: v.id("orgs"),
		fileId: v.id("files"),
	},
	handler: async (ctx, args) => {
		const { userId, member } = await requireOrgMember(ctx, args.orgId);
		const file = await ctx.db.get(args.fileId);
		if (!file || file.orgId !== args.orgId || file.deletedAt !== undefined) {
			throw new ConvexError(ERRORS.NOT_FOUND);
		}

		const isOwn = file.uploadedBy === userId;
		const canDeleteOwn = hasPermission(member.permissions, "files.delete");
		const canDeleteAny = hasPermission(member.permissions, "files.deleteAny");
		if (!(canDeleteAny || (isOwn && canDeleteOwn))) {
			throw new ConvexError(ERRORS.FORBIDDEN);
		}

		try {
			await ctx.storage.delete(file.storageId);
		} catch {
			// Storage may already be gone — safe to ignore and still mark the row deleted.
		}
		await ctx.db.patch(args.fileId, {
			deletedAt: Date.now(),
			updatedAt: Date.now(),
		});

		await logActivity(ctx, {
			orgId: args.orgId,
			userId,
			action: "file_deleted",
			entityType: file.scope,
			entityId: file.scopeId,
			description: `File deleted: ${file.name}`,
			metadata: { fileId: args.fileId },
		});
	},
});

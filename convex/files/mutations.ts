/**
 * Files Mutations — convex/files/mutations.ts
 *
 * Universal file-storage API. One code path for every entity in the app:
 * leads, contacts, deals, companies, users, the org itself, or arbitrary
 * custom-field attachments — all share this module.
 *
 * SCOPE STRATEGY (Round 5):
 *   We deliberately avoid storing files per (deal/company) because that
 *   leads to duplication when the same contract is "for" both a person AND
 *   a deal. Instead:
 *     - scope="org",    scopeId=orgId         → workspace-level files
 *     - scope="person", scopeId=personCode    → person attachments
 *     - scope="user",   scopeId=userId        → user profile attachments
 *     - scope="field",  scopeId=fieldValueId  → dynamic file-field bytes
 *   Cross-entity attribution uses `tags` (e.g. `tags=["deal:D-001"]`) so a
 *   single file can surface in BOTH the person profile AND the deal page.
 *
 * FLOW
 *   1. Client calls `generateUploadUrl` → gets a short-lived Convex upload URL.
 *   2. Client POSTs the file directly to that URL → gets back a storageId.
 *   3. Client calls `record({ storageId, scope, scopeId, name, size, mimeType, tags? })`.
 *   4. To delete, call `remove({ fileId })` — it deletes from _storage too.
 *
 * Permission model (lightweight for now — tightened per scope later):
 *   - Any authenticated org member can upload/delete files to scopes they can
 *     read.
 */

import { ConvexError, v } from "convex/values";
import { authenticatedMutation, orgMutation, requireOrgMember } from "../_functions/authenticated";
import { ERRORS } from "../_shared/errors";
import { enforceRateLimit, RATE_LIMITS } from "../_shared/rateLimit";

/**
 * Generate a short-lived upload URL. Caller then POSTs the file bytes
 * directly to that URL and receives a storageId.
 */
export const generateUploadUrl = authenticatedMutation({
	args: {},
	handler: async (ctx) => {
		return await ctx.storage.generateUploadUrl();
	},
});

/**
 * Record a freshly-uploaded file in the `files` table.
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
		const { userId } = await requireOrgMember(ctx, args.orgId);
		await enforceRateLimit(ctx, {
			scope: "files.record",
			key: `${userId}:${args.orgId}`,
			...RATE_LIMITS.upload,
		});
		const now = Date.now();
		const fileId = await ctx.db.insert("files", {
			orgId: args.orgId,
			storageId: args.storageId,
			scope: args.scope,
			scopeId: args.scopeId,
			fieldKey: args.fieldKey,
			tags: args.tags,
			name: args.name,
			size: args.size,
			mimeType: args.mimeType,
			uploadedBy: userId,
			createdAt: now,
			updatedAt: now,
		});
		return fileId;
	},
});

/**
 * Add or remove a tag from a file (e.g. attribute it to a different deal).
 */
export const updateTags = orgMutation({
	args: {
		orgId: v.id("orgs"),
		fileId: v.id("files"),
		tags: v.array(v.string()),
	},
	handler: async (ctx, args) => {
		await requireOrgMember(ctx, args.orgId);
		const file = await ctx.db.get(args.fileId);
		if (!file || file.orgId !== args.orgId || file.deletedAt !== undefined) {
			throw new ConvexError(ERRORS.NOT_FOUND);
		}
		await ctx.db.patch(args.fileId, {
			tags: args.tags,
			updatedAt: Date.now(),
		});
	},
});

/**
 * Soft-delete a file row and purge the bytes from Convex File Storage.
 * Irreversible.
 */
export const remove = orgMutation({
	args: {
		orgId: v.id("orgs"),
		fileId: v.id("files"),
	},
	handler: async (ctx, args) => {
		await requireOrgMember(ctx, args.orgId);
		const file = await ctx.db.get(args.fileId);
		if (!file || file.orgId !== args.orgId || file.deletedAt !== undefined) {
			throw new ConvexError(ERRORS.NOT_FOUND);
		}
		// Hard-purge the bytes, soft-delete the row
		try {
			await ctx.storage.delete(file.storageId);
		} catch {
			// Storage may already be gone — safe to ignore and still mark the row deleted
		}
		await ctx.db.patch(args.fileId, {
			deletedAt: Date.now(),
			updatedAt: Date.now(),
		});
	},
});

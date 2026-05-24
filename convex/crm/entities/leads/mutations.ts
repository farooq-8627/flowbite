/**
 * Leads Mutations — convex/crm/entities/leads/mutations.ts
 * STATUS: IMPLEMENTED
 *
 * personCode generated HERE only. On conversion, personCode + aiContext
 * are PASSED to contact — never regenerated.
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
import { logFieldUpdates } from "../../../_shared/fieldUpdateLog";
import { applyOrgStat } from "../../../_shared/orgStats";
import { requireRole } from "../../../_shared/permissions";
import { enforceRateLimit, RATE_LIMITS } from "../../../_shared/rateLimit";
import { generatePersonCode } from "../../../_shared/recordCodes";
import { logActivity } from "../../../activityLogs/helpers";
import { sendNotification } from "../../../notifications/helpers";

/** Strip all non-digits from a phone number for index-based dedup */
function normalizePhone(phone: string): string {
	return phone.replace(/\D/g, "");
}

// ─── Shared impls — see `convex/ai/tools/_shared.ts` for why the AI twins exist
async function createImpl(
	ctx: MutationCtx,
	args: {
		orgId: Id<"orgs">;
		userId: Id<"users">;
		displayName: string;
		email?: string;
		phone?: string;
		source: string;
		assignedTo?: Id<"users">;
		aiContext?: {
			summary?: string;
			keyFacts?: string[];
			lastUpdatedAt?: number;
			rawNotes?: string;
		};
	},
) {
	await enforceRateLimit(ctx, {
		scope: "leads.create",
		key: `${args.userId}:${args.orgId}`,
		...RATE_LIMITS.write,
	});

	if (args.email) {
		const existing = await ctx.db
			.query("leads")
			.withIndex("by_org_and_email", (q) =>
				q.eq("orgId", args.orgId).eq("email", args.email!),
			)
			.first();
		if (existing && !existing.deletedAt && !existing.convertedAt) {
			throw new ConvexError({
				code: "DUPLICATE",
				message: "Lead with this email already exists",
				personCode: existing.personCode,
			});
		}
	}

	const personCode = await generatePersonCode(ctx, args.orgId);
	const now = Date.now();
	const normalizedPhone = args.phone ? normalizePhone(args.phone) : undefined;

	const leadId = await ctx.db.insert("leads", {
		orgId: args.orgId,
		personCode,
		displayName: args.displayName,
		email: args.email,
		phone: args.phone,
		normalizedPhone,
		status: "new",
		source: args.source,
		assignedTo: args.assignedTo,
		aiContext: args.aiContext,
		createdAt: now,
		updatedAt: now,
	});

	await logActivity(ctx, {
		orgId: args.orgId,
		userId: args.userId,
		action: "created",
		entityType: "lead",
		entityId: leadId,
		personCode,
		description: `Lead created: ${args.displayName}`,
	});

	await applyOrgStat(ctx, args.orgId, "leads.open", +1);
	await applyOrgStat(ctx, args.orgId, "leads.total", +1);

	if (args.assignedTo && args.assignedTo !== args.userId) {
		await sendNotification(ctx, {
			orgId: args.orgId,
			userId: args.assignedTo,
			type: "lead.assigned",
			title: `Lead assigned to you: ${args.displayName}`,
			entityType: "lead",
			entityId: leadId,
		});
	}

	await ctx.scheduler.runAfter(0, internal.ai.internal.rebuildEntityContext, {
		orgId: args.orgId,
		entityType: "lead",
		entityId: leadId,
		personCode,
	});

	return { leadId, personCode };
}

async function updateImpl(
	ctx: MutationCtx,
	args: {
		orgId: Id<"orgs">;
		userId: Id<"users">;
		leadId: Id<"leads">;
		displayName?: string;
		email?: string;
		phone?: string;
		status?: string;
		source?: string;
		assignedTo?: Id<"users">;
		sortOrder?: number;
	},
) {
	await enforceRateLimit(ctx, {
		scope: "leads.update",
		key: `${args.userId}:${args.orgId}`,
		max: 120,
		periodMs: 60_000,
		orgId: args.orgId,
	});

	const lead = await ctx.db.get(args.leadId);
	if (!lead || lead.orgId !== args.orgId || lead.deletedAt !== undefined) {
		throw new ConvexError(ERRORS.NOT_FOUND);
	}

	const { orgId: _o, userId: _u, leadId: _l, ...updates } = args;
	const patch: Record<string, unknown> = Object.fromEntries(
		Object.entries(updates).filter(([, val]) => val !== undefined),
	);
	if (args.phone) patch.normalizedPhone = normalizePhone(args.phone);

	await ctx.db.patch(args.leadId, { ...patch, updatedAt: Date.now() });

	if (
		args.assignedTo !== undefined &&
		lead.contactId !== undefined &&
		lead.assignedTo !== args.assignedTo
	) {
		const contact = await ctx.db.get(lead.contactId);
		if (contact && contact.orgId === args.orgId && contact.deletedAt === undefined) {
			if (contact.assignedTo !== args.assignedTo) {
				await ctx.db.patch(lead.contactId, {
					assignedTo: args.assignedTo,
					updatedAt: Date.now(),
				});
			}
		}
	}

	await logFieldUpdates(ctx, {
		orgId: args.orgId,
		userId: args.userId,
		entityType: "lead",
		entityId: args.leadId,
		personCode: lead.personCode,
		displayName: lead.displayName,
		before: lead as unknown as Record<string, unknown>,
		after: { ...lead, ...patch } as unknown as Record<string, unknown>,
		fields: ["displayName", "email", "phone", "status", "source", "assignedTo"],
	});
}

export const create = orgMutation({
	args: {
		orgId: v.id("orgs"),
		displayName: v.string(),
		email: v.optional(v.string()),
		phone: v.optional(v.string()),
		source: v.string(),
		assignedTo: v.optional(v.id("users")),
		aiContext: v.optional(v.any()),
	},
	handler: async (ctx, args) => {
		const { member, userId } = await requireOrgMember(ctx, args.orgId);
		requireRole(member.permissions, "leads.create");
		return createImpl(ctx, { ...args, userId });
	},
});

/** AI-callable internal twin — see `convex/ai/tools/_shared.ts`. */
export const createForAI = internalMutation({
	args: {
		orgId: v.id("orgs"),
		userId: v.id("users"),
		displayName: v.string(),
		email: v.optional(v.string()),
		phone: v.optional(v.string()),
		source: v.string(),
		assignedTo: v.optional(v.id("users")),
		aiContext: v.optional(v.any()),
	},
	handler: async (ctx, args) => {
		const { member } = await requireOrgMemberByIds(ctx, args.orgId, args.userId);
		requireRole(member.permissions, "leads.create");
		return createImpl(ctx, args);
	},
});

export const update = orgMutation({
	args: {
		orgId: v.id("orgs"),
		leadId: v.id("leads"),
		displayName: v.optional(v.string()),
		email: v.optional(v.string()),
		phone: v.optional(v.string()),
		status: v.optional(v.string()),
		source: v.optional(v.string()),
		assignedTo: v.optional(v.id("users")),
		/**
		 * Optional kanban position. Set by the leads board's drag handler when
		 * the user drops a card at a specific index — the consumer computes
		 * the midpoint between the two neighbours and passes it here. Combined
		 * with `status` / `assignedTo` / `source` in the same mutation so the
		 * drop is atomic. See `core/data-display/kanban/utils/sort-order.ts`.
		 */
		sortOrder: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
		const { member, userId } = await requireOrgMember(ctx, args.orgId);
		requireRole(member.permissions, "leads.update");
		return updateImpl(ctx, { ...args, userId });
	},
});

/** AI-callable internal twin. */
export const updateForAI = internalMutation({
	args: {
		orgId: v.id("orgs"),
		userId: v.id("users"),
		leadId: v.id("leads"),
		displayName: v.optional(v.string()),
		email: v.optional(v.string()),
		phone: v.optional(v.string()),
		status: v.optional(v.string()),
		source: v.optional(v.string()),
		assignedTo: v.optional(v.id("users")),
		sortOrder: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
		const { member } = await requireOrgMemberByIds(ctx, args.orgId, args.userId);
		requireRole(member.permissions, "leads.update");
		return updateImpl(ctx, args);
	},
});

async function convertToContactImpl(
	ctx: MutationCtx,
	args: {
		orgId: Id<"orgs">;
		userId: Id<"users">;
		leadId: Id<"leads">;
		companyId?: Id<"companies">;
	},
): Promise<{ contactId: Id<"contacts">; personCode: string }> {
	const lead = await ctx.db.get(args.leadId);
	if (!lead || lead.orgId !== args.orgId || lead.deletedAt !== undefined) {
		throw new ConvexError(ERRORS.NOT_FOUND);
	}
	if (lead.status === "converted") {
		throw new ConvexError({
			code: "ALREADY_CONVERTED",
			message: "Lead is already converted",
		});
	}

	const now = Date.now();

	// personCode and aiContext PASSED from lead — never regenerated
	const contactId = await ctx.db.insert("contacts", {
		orgId: args.orgId,
		personCode: lead.personCode,
		displayName: lead.displayName,
		email: lead.email,
		phone: lead.phone,
		normalizedPhone: lead.normalizedPhone,
		leadId: args.leadId,
		companyId: args.companyId,
		assignedTo: lead.assignedTo,
		aiContext: lead.aiContext,
		createdAt: now,
		updatedAt: now,
	});

	// Propagate tags lead → contact so users don't lose labels on convert.
	// Bounded at 200 — typical lead has 0–10 tags; 200 is generous.
	const leadTagLinks = await ctx.db
		.query("entityTags")
		.withIndex("by_entity", (q) =>
			q.eq("orgId", args.orgId).eq("entityType", "lead").eq("entityId", args.leadId),
		)
		.take(200);
	await Promise.all(
		leadTagLinks.map((link) =>
			ctx.db.insert("entityTags", {
				orgId: args.orgId,
				tagId: link.tagId,
				entityType: "contact",
				entityId: contactId,
				createdAt: now,
			}),
		),
	);

	await ctx.db.patch(args.leadId, {
		status: "converted",
		convertedAt: now,
		contactId,
		updatedAt: now,
	});

	// Counter rebalance — lead leaves "open" pool, contact joins "active".
	await applyOrgStat(ctx, args.orgId, "leads.open", -1);
	await applyOrgStat(ctx, args.orgId, "contacts.active", +1);

	await logActivity(ctx, {
		orgId: args.orgId,
		userId: args.userId,
		action: "converted",
		entityType: "lead",
		entityId: args.leadId,
		personCode: lead.personCode,
		description: `Lead converted: ${lead.displayName}`,
	});

	await ctx.scheduler.runAfter(0, internal.ai.internal.rebuildEntityContext, {
		orgId: args.orgId,
		entityType: "contact",
		entityId: contactId,
		personCode: lead.personCode,
	});

	return { contactId, personCode: lead.personCode };
}

export const convertToContact = orgMutation({
	args: {
		orgId: v.id("orgs"),
		leadId: v.id("leads"),
		companyId: v.optional(v.id("companies")),
	},
	handler: async (ctx, args) => {
		const { member, userId } = await requireOrgMember(ctx, args.orgId);
		requireRole(member.permissions, "leads.convert");
		return convertToContactImpl(ctx, { ...args, userId });
	},
});

/**
 * AI-callable internal twin. See AGENTS.md "AI tools call *ForAI internal
 * twins" rule for the auth-bridge rationale.
 */
export const convertToContactForAI = internalMutation({
	args: {
		orgId: v.id("orgs"),
		userId: v.id("users"),
		leadId: v.id("leads"),
		companyId: v.optional(v.id("companies")),
	},
	handler: async (ctx, args) => {
		const { member } = await requireOrgMemberByIds(ctx, args.orgId, args.userId);
		requireRole(member.permissions, "leads.convert");
		return convertToContactImpl(ctx, args);
	},
});

export const updateAiContext = orgMutation({
	args: {
		orgId: v.id("orgs"),
		leadId: v.id("leads"),
		aiContext: v.any(),
	},
	handler: async (ctx, args) => {
		const { member } = await requireOrgMember(ctx, args.orgId);
		requireRole(member.permissions, "leads.update");

		const lead = await ctx.db.get(args.leadId);
		if (!lead || lead.orgId !== args.orgId) throw new ConvexError(ERRORS.NOT_FOUND);

		await ctx.db.patch(args.leadId, { aiContext: args.aiContext, updatedAt: Date.now() });
	},
});

export const softDelete = orgMutation({
	args: { orgId: v.id("orgs"), leadId: v.id("leads") },
	handler: async (ctx, args) => {
		const { member, userId } = await requireOrgMember(ctx, args.orgId);
		requireRole(member.permissions, "leads.delete");

		const lead = await ctx.db.get(args.leadId);
		if (!lead || lead.orgId !== args.orgId) throw new ConvexError(ERRORS.NOT_FOUND);

		await ctx.db.patch(args.leadId, { deletedAt: Date.now(), updatedAt: Date.now() });

		// Counter: only decrement "open" if it WAS still open (not converted, not deleted).
		if (!lead.deletedAt && !lead.convertedAt) {
			await applyOrgStat(ctx, args.orgId, "leads.open", -1);
		}

		await logActivity(ctx, {
			orgId: args.orgId,
			userId,
			action: "deleted",
			entityType: "lead",
			entityId: args.leadId,
			personCode: lead.personCode,
			description: `Lead deleted: ${lead.displayName}`,
		});
	},
});

// ─── Week 4 — Bulk insert from CSV import (privileged commit) ────────────────
//
// Privileged commit step in the dual-LLM CSV pipeline
// (`PHASE-3-AI-AUDIT.md §6 Week 4 row 4.4` & §7).
//
// The QUARANTINED parser (`convex/ai/quarantined/csvParser.ts`) populates
// `csvImports.previewRows` with already-validated, already-deduped rows.
// The user reviews the preview UI and approves; the AI tool
// `commit_csv_import` then calls `bulkInsertFromCsvImpl` here. This is
// the ONLY place CSV-derived data turns into real `leads` rows. By the
// time we get here:
//   - dedupDecision per row is the user's final answer.
//   - validationError is "" or absent — rows with errors are excluded
//     by the caller.
//   - idemKey is stable across retries.
//
// We re-validate the dedup decisions one more time at write-time because
// the world might have moved between parse and commit (a teammate
// inserted the same email five minutes ago).

type CsvImportRow = {
	idemKey: string;
	fields: Record<string, string | null>;
	dedupDecision: "insert" | "merge" | "skip";
	dedupTargetCode?: string;
	validationError?: string;
};

const csvRowValidator = v.object({
	idemKey: v.string(),
	fields: v.record(v.string(), v.union(v.string(), v.null())),
	dedupDecision: v.union(v.literal("insert"), v.literal("merge"), v.literal("skip")),
	dedupTargetCode: v.optional(v.string()),
	validationError: v.optional(v.string()),
});

const BULK_INSERT_BATCH = 100;

async function bulkInsertFromCsvImpl(
	ctx: MutationCtx,
	args: {
		orgId: Id<"orgs">;
		userId: Id<"users">;
		csvImportId: Id<"csvImports">;
		rows: CsvImportRow[];
	},
): Promise<{
	inserted: number;
	merged: number;
	skipped: number;
	failedRows: Array<{ idemKey: string; error: string }>;
}> {
	// Bulk-class rate limit — `RATE_LIMITS.bulk` = 5 imports / minute / user-org.
	await enforceRateLimit(ctx, {
		scope: "leads.bulkInsertFromCsv",
		key: `${args.userId}:${args.orgId}`,
		...RATE_LIMITS.bulk,
		orgId: args.orgId,
	});

	const importRow = await ctx.db.get(args.csvImportId);
	if (!importRow || importRow.orgId !== args.orgId) {
		throw new ConvexError(ERRORS.NOT_FOUND);
	}
	if (importRow.status === "completed") {
		// Idempotent — return the already-recorded summary instead of
		// double-inserting.
		return (
			importRow.result ?? {
				inserted: 0,
				merged: 0,
				skipped: 0,
				failedRows: [],
			}
		);
	}

	let inserted = 0;
	let merged = 0;
	let skipped = 0;
	const failedRows: Array<{ idemKey: string; error: string }> = [];

	// Walk rows in batches of 100. Each iteration is a single
	// `ctx.db.insert` round-trip; Convex enforces a per-mutation document
	// touch budget, so 100 inserts per call is a safe cap.
	for (let i = 0; i < args.rows.length; i += BULK_INSERT_BATCH) {
		const batch = args.rows.slice(i, i + BULK_INSERT_BATCH);
		for (const row of batch) {
			if (row.validationError) {
				failedRows.push({ idemKey: row.idemKey, error: row.validationError });
				continue;
			}
			if (row.dedupDecision === "skip") {
				skipped++;
				continue;
			}

			const displayName = (row.fields.displayName ?? "").trim();
			const email = row.fields.email ?? undefined;
			const phone = row.fields.phone ?? undefined;
			const source = row.fields.source ?? "csv-import";

			if (!displayName) {
				failedRows.push({
					idemKey: row.idemKey,
					error: "Missing displayName at commit time.",
				});
				continue;
			}

			// Re-validate email collision at write-time. If a teammate
			// inserted the same email between parse and commit, we
			// downgrade insert → skip rather than throwing.
			if (email) {
				const liveCollision = await ctx.db
					.query("leads")
					.withIndex("by_org_and_email", (q) =>
						q.eq("orgId", args.orgId).eq("email", email),
					)
					.first();
				if (liveCollision && !liveCollision.deletedAt && !liveCollision.convertedAt) {
					skipped++;
					continue;
				}
			}

			if (row.dedupDecision === "merge") {
				// Merge: locate the existing lead by personCode and patch
				// missing fields (phone/email/source) — never overwrite a
				// non-empty field. If the target was deleted/converted,
				// fall through to insert instead.
				const target = row.dedupTargetCode
					? await ctx.db
							.query("leads")
							.withIndex("by_org_and_personCode", (q) =>
								q.eq("orgId", args.orgId).eq("personCode", row.dedupTargetCode!),
							)
							.first()
					: null;
				if (target && !target.deletedAt && !target.convertedAt) {
					const patch: Record<string, unknown> = {};
					if (!target.email && email) patch.email = email;
					if (!target.phone && phone) {
						patch.phone = phone;
						patch.normalizedPhone = normalizePhone(phone);
					}
					if (Object.keys(patch).length > 0) {
						await ctx.db.patch(target._id, {
							...patch,
							updatedAt: Date.now(),
						});
					}
					merged++;
					continue;
				}
				// Fall through to insert if target is gone.
			}

			try {
				await createImpl(ctx, {
					orgId: args.orgId,
					userId: args.userId,
					displayName,
					email,
					phone,
					source,
					aiContext: row.fields.notes
						? { rawNotes: row.fields.notes ?? undefined }
						: undefined,
				});
				inserted++;
			} catch (err) {
				const msg =
					err instanceof ConvexError
						? ((err.data as { message?: string })?.message ?? "Insert failed")
						: err instanceof Error
							? err.message
							: "Insert failed";
				failedRows.push({ idemKey: row.idemKey, error: msg });
			}
		}
	}

	// Log the bulk action ONCE (not per-row — would flood the activity log).
	await logActivity(ctx, {
		orgId: args.orgId,
		userId: args.userId,
		action: "csv_imported",
		entityType: "lead",
		entityId: args.csvImportId as unknown as Id<"leads">, // CSV import id — dedicated activity row
		description: `CSV import: ${inserted} inserted, ${merged} merged, ${skipped} skipped, ${failedRows.length} failed`,
	});

	// Mark the csvImports row completed.
	await ctx.db.patch(args.csvImportId, {
		status: "completed",
		result: { inserted, merged, skipped, failedRows },
		updatedAt: Date.now(),
	});

	return { inserted, merged, skipped, failedRows };
}

export const bulkInsertFromCsvImport = orgMutation({
	args: {
		orgId: v.id("orgs"),
		csvImportId: v.id("csvImports"),
		rows: v.array(csvRowValidator),
	},
	handler: async (ctx, args) => {
		const { member, userId } = await requireOrgMember(ctx, args.orgId);
		requireRole(member.permissions, "leads.create");
		return bulkInsertFromCsvImpl(ctx, { ...args, userId });
	},
});

/**
 * AI-callable internal twin — see `convex/ai/tools/_shared.ts` for the
 * Option B auth-bridge rule.
 */
export const bulkInsertFromCsvImportForAI = internalMutation({
	args: {
		orgId: v.id("orgs"),
		userId: v.id("users"),
		csvImportId: v.id("csvImports"),
		rows: v.array(csvRowValidator),
	},
	handler: async (ctx, args) => {
		const { member } = await requireOrgMemberByIds(ctx, args.orgId, args.userId);
		requireRole(member.permissions, "leads.create");
		return bulkInsertFromCsvImpl(ctx, args);
	},
});

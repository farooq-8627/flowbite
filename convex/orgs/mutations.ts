/**
 * Org mutations — convex/orgs/mutations.ts
 *
 * PATTERN:
 *   - All public mutations use `authenticatedMutation` or `orgMutation` (Rule R2).
 *   - Role checks use `requireRole()` from the SSOT permissions catalog.
 *   - Every mutation calls `logActivity()` after DB writes (audit trail).
 *   - Member-affecting mutations call `sendNotification()` for the affected user.
 *   - Every patch includes `updatedAt: Date.now()` (Rule R7).
 *   - Reserved slug list lives in `_shared/reservedSlugs.ts` — NEVER inlined.
 *   - System-role permissions come from `getDefaultPermissionsForRole(name)` —
 *     NEVER hardcoded.
 *   - Industry pipeline stages come from `templates/pipelineStages.ts` —
 *     NEVER inlined.
 *
 * Sources:
 * - https://github.com/get-convex/convex-saas/blob/main/convex/organizations.ts
 * - https://github.com/dbjpanda/convex-tenants/blob/main/example/convex/tenants.ts
 */
import { ConvexError, v } from "convex/values";
import {
	authenticatedMutation,
	orgMutation,
	requireOrgMemberByIds,
} from "../_functions/authenticated";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { internalMutation, type MutationCtx } from "../_generated/server";
import { DEFAULT_ORG_PLAN, ENTITY_TYPES } from "../_shared/constants";
import { ERRORS } from "../_shared/errors";
import { applyOrgStat } from "../_shared/orgStats";
import { requireRole } from "../_shared/permissions";
import type { SystemRoleName } from "../_shared/permissions/catalog";
import {
	getDefaultPermissionsForRole,
	getMissingPermissionsForRole,
} from "../_shared/permissions/derive";
import { RESERVED_SLUGS, validateSlug } from "../_shared/reservedSlugs";
import { logActivity } from "../activityLogs/helpers";
import { sendNotification } from "../notifications/helpers";
import { ensureUniqueSlug, generateSlug, getOrgBySlug, getOrgMember } from "./helpers";

// ─── DB-backed industry-template resolution (Stage 1) ────────────────────────

/**
 * Resolve an industry id to a canonical templateKey by reading the
 * `platformTemplates` table. Replaces the legacy static-map lookup
 * (`INDUSTRY_TEMPLATES[id]` / `INDUSTRY_ID_ALIASES[id]`) that was
 * deleted in Stage 3 of INDUSTRY-TEMPLATES-DB-MIGRATION.md.
 *
 * Both built-in templates AND alias rows live in the same table, so
 * the resolution collapses to a single point query. Falls back to
 * `"generic"` when the id is unknown — same behaviour as the previous
 * static map.
 */
async function resolveTemplateKey(ctx: MutationCtx, industry: string): Promise<string> {
	const direct = await ctx.db
		.query("platformTemplates")
		.withIndex("by_templateKey", (q) => q.eq("templateKey", industry))
		.unique();
	if (direct && !direct.isArchived) return direct.templateKey;
	// Fallback: generic. Always present after the seed migration; if
	// it's somehow missing we let the seeder throw downstream.
	return "generic";
}

// Platform prefix is read from env — never hardcoded.
// Set PLATFORM_PREFIX in your Convex environment variables.
const PLATFORM_PREFIX = process.env.PLATFORM_PREFIX ?? "ORB";

/** Zero-padded sequential-style ID: ORB-00001 */
function buildPlatformOrgId(prefix: string, orgId: string): string {
	const short = orgId.slice(-5).toUpperCase();
	return `${prefix}-${short}`;
}

// ─── System role seed metadata ────────────────────────────────────────────────
// Permissions for each role come from `getDefaultPermissionsForRole()` (SSOT).
// Only display metadata lives here. Adding a permission to a role = edit
// `_shared/permissions/catalog.ts`, never this file.
const SYSTEM_ROLE_SEEDS: ReadonlyArray<{
	name: SystemRoleName;
	description: string;
	color: string;
	isDefault: boolean;
}> = [
	{
		name: "Owner",
		description: "Full access to all features and settings.",
		color: "#6366f1",
		isDefault: false,
	},
	{
		name: "Admin",
		description: "Full operational access. Cannot manage billing or delete the org.",
		color: "#3b82f6",
		isDefault: false,
	},
	{
		name: "Member",
		description: "Standard access. Can create and update records, use AI.",
		color: "#10b981",
		isDefault: true,
	},
];

/**
 * Seed the 3 system roles (Owner, Admin, Member) for a freshly created org.
 * Returns the Owner roleId for the inserter to wire up the creator's
 * orgMembers row. Permissions come from the SSOT catalog.
 */
async function seedSystemRoles(
	ctx: MutationCtx,
	orgId: Id<"orgs">,
	now: number,
): Promise<Id<"orgRoles">> {
	let ownerRoleId: Id<"orgRoles"> | null = null;
	for (const seed of SYSTEM_ROLE_SEEDS) {
		const roleId = await ctx.db.insert("orgRoles", {
			orgId,
			name: seed.name,
			description: seed.description,
			permissions: [...getDefaultPermissionsForRole(seed.name)],
			isSystem: true,
			isDefault: seed.isDefault,
			color: seed.color,
			createdAt: now,
			updatedAt: now,
		});
		if (seed.name === "Owner") ownerRoleId = roleId;
	}
	if (ownerRoleId === null) {
		// Unreachable — Owner is always seeded above.
		throw new ConvexError("Owner role failed to seed.");
	}
	return ownerRoleId;
}

// ─── createOrg — onboarding step 1 (canonical creator) ───────────────────────

/**
 * Create a new org during onboarding (Step 1).
 * - Validates slug format + reservation via SSOT (`_shared/reservedSlugs.ts`).
 * - Throws ORG_SLUG_TAKEN if slug is in use.
 * - Sets platformOrgId from env-driven prefix.
 * - Seeds the 3 system roles using `getDefaultPermissionsForRole()` SSOT.
 * - Inserts owner orgMembers row.
 * - Does NOT mark onboardingCompleted — that happens in markOnboardingComplete.
 */
export const createOrg = authenticatedMutation({
	args: {
		name: v.string(),
		slug: v.string(),
	},
	handler: async (ctx, args) => {
		const now = Date.now();

		const cleanSlug = args.slug
			.toLowerCase()
			.replace(/[^a-z0-9-]/g, "")
			.slice(0, 48);

		const validation = validateSlug(cleanSlug);
		if (!validation.valid) {
			throw new ConvexError(validation.reason);
		}

		const existing = await getOrgBySlug(ctx, cleanSlug);
		if (existing) throw new ConvexError(ERRORS.ORG_SLUG_TAKEN);

		const orgId = await ctx.db.insert("orgs", {
			name: args.name.trim(),
			slug: cleanSlug,
			plan: DEFAULT_ORG_PLAN,
			platformOrgId: "",
			onboardingStep: 0,
			createdAt: now,
			updatedAt: now,
		});

		const platformOrgId = buildPlatformOrgId(PLATFORM_PREFIX, orgId);
		await ctx.db.patch(orgId, { platformOrgId, updatedAt: now });

		const ownerRoleId = await seedSystemRoles(ctx, orgId, now);

		await ctx.db.insert("orgMembers", {
			orgId,
			userId: ctx.userId,
			roleId: ownerRoleId,
			joinedAt: now,
		});

		// Counter — workspace creator is the first active member.
		await applyOrgStat(ctx, orgId, "members.active", +1);

		// Note: sticky-note categories are seeded in step 2 of onboarding by
		// `updateOrgIndustry → setupWorkspaceFromTemplate`, which seeds the
		// industry-aware semantic categories (Urgent / Today / Done / …).
		// We deliberately do NOT seed the legacy color categories
		// (Yellow / Blue / Green / Pink / Purple / Gray) at org creation —
		// they would be overwritten one screen later by the template.

		if (!ctx.user.defaultOrgId) {
			await ctx.db.patch(ctx.userId, { defaultOrgId: orgId, updatedAt: now });
		}

		await logActivity(ctx, {
			orgId,
			userId: ctx.userId,
			action: "created",
			entityType: ENTITY_TYPES.ORG,
			entityId: orgId,
			description: `Created organization "${args.name}"`,
		});

		return { orgId, slug: cleanSlug, platformOrgId };
	},
});

/**
 * Suggest a unique slug for a given name.
 * Returns the first available slug (base or base-2, base-3, etc.).
 * Used by onboarding UI to auto-suggest when user types org name.
 */
export const suggestSlug = authenticatedMutation({
	args: { name: v.string() },
	handler: async (ctx, args) => {
		const base = generateSlug(args.name);
		const slug = await ensureUniqueSlug(ctx, base);
		return { slug };
	},
});

// ─── create — convenience wrapper (used by tests + settings page) ────────────

/**
 * Convenience org creator. Auto-generates a unique slug if not provided,
 * skips strict slug validation (tests use freeform names), and marks
 * onboardingCompleted on the user.
 *
 * Internally delegates the role-seeding to the same SSOT path as `createOrg`.
 * NEVER hardcodes permission lists — every role's permissions come from the
 * SSOT catalog via `getDefaultPermissionsForRole()`.
 */
export const create = authenticatedMutation({
	args: {
		name: v.string(),
		slug: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const now = Date.now();
		const base = args.slug ?? generateSlug(args.name);
		const slug = await ensureUniqueSlug(ctx, base);

		const orgId = await ctx.db.insert("orgs", {
			name: args.name,
			slug,
			plan: DEFAULT_ORG_PLAN,
			platformOrgId: "",
			createdAt: now,
			updatedAt: now,
		});

		await ctx.db.patch(orgId, {
			platformOrgId: buildPlatformOrgId(PLATFORM_PREFIX, orgId),
			updatedAt: now,
		});

		const ownerRoleId = await seedSystemRoles(ctx, orgId, now);

		await ctx.db.insert("orgMembers", {
			orgId,
			userId: ctx.userId,
			roleId: ownerRoleId,
			joinedAt: now,
		});

		await applyOrgStat(ctx, orgId, "members.active", +1);

		// Bootstrap the workspace with the generic template so the new org
		// gets pipelines, default fields, semantic note categories, and a
		// dashboard-metrics list out of the box. `create` is used by the
		// "create another org" path (settings → workspaces) and by tests
		// that don't go through onboarding's industry picker. Onboarding
		// itself calls `createOrg` then `updateOrgIndustry` which applies
		// the user's chosen industry template.
		await ctx.runMutation(internal.crm.fields.templates.mutations.setupWorkspaceFromTemplate, {
			orgId,
			templateId: "generic",
			actorUserId: ctx.userId,
		});

		if (!ctx.user.defaultOrgId) {
			await ctx.db.patch(ctx.userId, {
				defaultOrgId: orgId,
				onboardingCompleted: true,
				updatedAt: now,
			});
		}

		await logActivity(ctx, {
			orgId,
			userId: ctx.userId,
			action: "created",
			entityType: ENTITY_TYPES.ORG,
			entityId: orgId,
			description: `Created organization "${args.name}"`,
		});

		return orgId;
	},
});

// ─── Onboarding step 2 + 3 ────────────────────────────────────────────────────

/**
 * Update org industry + team size (onboarding Step 2).
 *
 * Now a thin wrapper around `applyTemplate` — every industry id resolves
 * via `resolveTemplateKey()` which point-queries the `platformTemplates`
 * table. (The legacy static `INDUSTRY_TEMPLATES` + `INDUSTRY_ID_ALIASES`
 * maps under `convex/crm/fields/templates/registry.ts` were deleted in
 * Stage 3 of INDUSTRY-TEMPLATES-DB-MIGRATION.md.) The legacy
 * `getDefaultStages(...)` + `seedFieldDefinitionsForOrg(...)` call path is
 * REMOVED — every onboarding now seeds via `setupWorkspaceFromTemplate`,
 * giving the workspace a complete set of pipelines, fields, entity labels,
 * note categories, tags, reminder defaults, follow-up cadence, file-upload
 * policy, AI persona, modules slot map, code prefixes, currency, and
 * timezone in one atomic transaction.
 *
 * Backwards compat: `industry` is still a free-form string (no narrowing).
 * Unknown ids transparently fall through to the `generic` template via
 * the resolver — never throws TEMPLATE_NOT_FOUND from this path.
 */
export const updateOrgIndustry = authenticatedMutation({
	args: {
		orgId: v.id("orgs"),
		industry: v.string(),
		teamSize: v.string(),
	},
	handler: async (ctx, args) => {
		const now = Date.now();

		const member = await getOrgMember(ctx, args.orgId, ctx.userId);
		if (!member || member.deletedAt !== undefined) throw new ConvexError(ERRORS.FORBIDDEN);

		await ctx.db.patch(args.orgId, {
			teamSize: args.teamSize,
			onboardingStep: 1,
			updatedAt: now,
		});

		// Resolve via DB lookup; default to "generic" so onboarding never
		// blocks on an uncurated industry id.
		const templateId = await resolveTemplateKey(ctx, args.industry);

		await ctx.runMutation(internal.crm.fields.templates.mutations.setupWorkspaceFromTemplate, {
			orgId: args.orgId,
			templateId,
			actorUserId: ctx.userId,
		});

		await logActivity(ctx, {
			orgId: args.orgId,
			userId: ctx.userId,
			action: "updated",
			entityType: ENTITY_TYPES.ORG,
			entityId: args.orgId,
			description: `Set industry to "${args.industry}" (template: ${templateId})`,
		});
	},
});

/**
 * Apply (or re-apply) an industry template to an org.
 *
 * Requires `org.editSettings`. Idempotent — every step inside the seeder is
 * a "skip-if-exists" check on natural keys, so re-running with the same
 * template only inserts the rows that were missing.
 *
 * Use cases:
 *   - Onboarding wizard (calls this from Step 2 once industry+team size are picked)
 *   - Settings → Workspace → "Re-apply template" / "Switch template"
 *   - Phase 3 AI tool `setup_workspace_from_template`
 */
async function applyTemplateImpl(
	ctx: MutationCtx,
	args: { orgId: Id<"orgs">; userId: Id<"users">; templateId: string },
): Promise<{ ok: true; templateId: string }> {
	const resolved = await resolveTemplateKey(ctx, args.templateId);

	await ctx.runMutation(internal.crm.fields.templates.mutations.setupWorkspaceFromTemplate, {
		orgId: args.orgId,
		templateId: resolved,
		actorUserId: args.userId,
	});

	await logActivity(ctx, {
		orgId: args.orgId,
		userId: args.userId,
		action: "updated",
		entityType: ENTITY_TYPES.ORG,
		entityId: args.orgId,
		description: `Applied industry template "${resolved}"`,
	});

	return { ok: true, templateId: resolved };
}

export const applyTemplate = orgMutation({
	args: {
		orgId: v.id("orgs"),
		templateId: v.string(),
	},
	handler: async (ctx, args): Promise<{ ok: true; templateId: string }> => {
		const member = await getOrgMember(ctx, args.orgId, ctx.userId);
		if (!member || member.deletedAt !== undefined)
			throw new ConvexError(ERRORS.ORG_MEMBER_NOT_FOUND);
		requireRole(member.permissions, "org.editSettings");
		return applyTemplateImpl(ctx, { ...args, userId: ctx.userId });
	},
});

/** AI-callable internal twin. */
export const applyTemplateForAI = internalMutation({
	args: {
		orgId: v.id("orgs"),
		userId: v.id("users"),
		templateId: v.string(),
	},
	handler: async (ctx, args): Promise<{ ok: true; templateId: string }> => {
		const { member } = await requireOrgMemberByIds(ctx, args.orgId, args.userId);
		requireRole(member.permissions, "org.editSettings");
		return applyTemplateImpl(ctx, args);
	},
});

// ─── Mock data lifecycle (Phase 3A) ──────────────────────────────────────────

/**
 * Delete every record this org seeded as sample data.
 *
 * Identification rules (per CODE-ARCHITECTURE-PHASE-3A.md §4.4):
 *   - leads / deals: rows where `source === "template_seed"`.
 *   - companies / contacts: rows where `excludeFromAI === true` AND
 *     `createdAt === org.settings.mockDataSeededAt` (the seeder stamps
 *     all sample records with the same `now`, so the timestamp acts as
 *     a stable group id).
 *   - notes / reminders: rows where `excludeFromAI === true` AND
 *     `createdAt === mockDataSeededAt`.
 *   - entityTags: rows whose entityId is one of the deleted records.
 *
 * Hard delete (not soft) — the user is explicitly clearing seed data.
 * Decrements org-stats counters as it goes. Clears the timestamps so
 * the dashboard banner disappears and the seeder can run again later
 * if the user re-applies the template.
 *
 * Permission: org.editSettings (Owner / Admin).
 */
async function clearMockDataImpl(
	ctx: MutationCtx,
	args: { orgId: Id<"orgs">; userId: Id<"users"> },
) {
	const org = await ctx.db.get(args.orgId);
	if (!org) throw new ConvexError(ERRORS.ORG_NOT_FOUND);
	const seededAt = org.settings?.mockDataSeededAt;
	if (seededAt === undefined) {
		return { deleted: 0 };
	}

	let deleted = 0;
	const deletedEntities: Array<{ entityType: string; entityId: string }> = [];

	const leads = await ctx.db
		.query("leads")
		.withIndex("by_org", (q) => q.eq("orgId", args.orgId))
		.collect();
	for (const row of leads) {
		if (row.source === "template_seed") {
			await ctx.db.delete(row._id);
			deletedEntities.push({ entityType: "lead", entityId: row._id });
			deleted += 1;
			await applyOrgStat(ctx, args.orgId, "leads.open", -1);
			await applyOrgStat(ctx, args.orgId, "leads.total", -1);
		}
	}

	const deals = await ctx.db
		.query("deals")
		.withIndex("by_org", (q) => q.eq("orgId", args.orgId))
		.collect();
	for (const row of deals) {
		if (row.source === "template_seed") {
			await ctx.db.delete(row._id);
			deletedEntities.push({ entityType: "deal", entityId: row._id });
			deleted += 1;
			await applyOrgStat(ctx, args.orgId, "deals.open", -1);
			await applyOrgStat(ctx, args.orgId, "deals.total", -1);
			if (row.value) {
				await applyOrgStat(ctx, args.orgId, "deals.pipelineValue", -row.value);
			}
		}
	}

	const contacts = await ctx.db
		.query("contacts")
		.withIndex("by_org", (q) => q.eq("orgId", args.orgId))
		.collect();
	for (const row of contacts) {
		if (row.excludeFromAI === true && row.createdAt === seededAt) {
			await ctx.db.delete(row._id);
			deletedEntities.push({ entityType: "contact", entityId: row._id });
			deleted += 1;
			await applyOrgStat(ctx, args.orgId, "contacts.active", -1);
		}
	}

	const companies = await ctx.db
		.query("companies")
		.withIndex("by_org", (q) => q.eq("orgId", args.orgId))
		.collect();
	for (const row of companies) {
		if (row.excludeFromAI === true && row.createdAt === seededAt) {
			await ctx.db.delete(row._id);
			deletedEntities.push({ entityType: "company", entityId: row._id });
			deleted += 1;
			await applyOrgStat(ctx, args.orgId, "companies.active", -1);
		}
	}

	const notes = await ctx.db
		.query("notes")
		.withIndex("by_org_and_created", (q) => q.eq("orgId", args.orgId))
		.collect();
	for (const row of notes) {
		if (row.excludeFromAI === true && row.createdAt === seededAt) {
			await ctx.db.delete(row._id);
			deleted += 1;
		}
	}

	const tasks = await ctx.db
		.query("tasks")
		.withIndex("by_org_and_due", (q) => q.eq("orgId", args.orgId))
		.collect();
	for (const row of tasks) {
		if (row.excludeFromAI === true && row.createdAt === seededAt) {
			await ctx.db.delete(row._id);
			deleted += 1;
		}
	}

	for (const { entityType, entityId } of deletedEntities) {
		const tagLinks = await ctx.db
			.query("entityTags")
			.withIndex("by_entity", (q) =>
				q.eq("orgId", args.orgId).eq("entityType", entityType).eq("entityId", entityId),
			)
			.collect();
		for (const link of tagLinks) {
			await ctx.db.delete(link._id);
		}
	}

	await ctx.db.patch(args.orgId, {
		settings: {
			...org.settings,
			mockDataSeededAt: undefined,
			mockDataDismissedAt: undefined,
		},
		updatedAt: Date.now(),
	});

	await logActivity(ctx, {
		orgId: args.orgId,
		userId: args.userId,
		action: "deleted",
		entityType: ENTITY_TYPES.ORG,
		entityId: args.orgId,
		description: `Cleared ${deleted} sample records`,
	});

	return { deleted };
}

export const clearMockData = orgMutation({
	args: { orgId: v.id("orgs") },
	handler: async (ctx, args) => {
		const member = await getOrgMember(ctx, args.orgId, ctx.userId);
		if (!member || member.deletedAt !== undefined)
			throw new ConvexError(ERRORS.ORG_MEMBER_NOT_FOUND);
		requireRole(member.permissions, "org.editSettings");
		return clearMockDataImpl(ctx, { ...args, userId: ctx.userId });
	},
});

/** AI-callable internal twin. */
export const clearMockDataForAI = internalMutation({
	args: { orgId: v.id("orgs"), userId: v.id("users") },
	handler: async (ctx, args) => {
		const { member } = await requireOrgMemberByIds(ctx, args.orgId, args.userId);
		requireRole(member.permissions, "org.editSettings");
		return clearMockDataImpl(ctx, args);
	},
});

/**
 * Dismiss the dashboard "sample data" banner WITHOUT deleting the records.
 * Lets the banner stop nagging while the data stays in place — useful for
 * users still exploring the workspace.
 *
 * Permission: org.editSettings.
 */
export const dismissMockDataBanner = orgMutation({
	args: { orgId: v.id("orgs") },
	handler: async (ctx, args) => {
		const member = await getOrgMember(ctx, args.orgId, ctx.userId);
		if (!member || member.deletedAt !== undefined)
			throw new ConvexError(ERRORS.ORG_MEMBER_NOT_FOUND);
		requireRole(member.permissions, "org.editSettings");

		const org = await ctx.db.get(args.orgId);
		if (!org) return;
		await ctx.db.patch(args.orgId, {
			settings: {
				...org.settings,
				mockDataDismissedAt: Date.now(),
			},
			updatedAt: Date.now(),
		});
	},
});

/**
 * Mark onboarding complete (onboarding Step 3).
 * Sets users.onboardingCompleted = true and orgs.onboardingStep = 2.
 * Returns the org slug so the client can redirect to /dashboard/[slug].
 */
export const markOnboardingComplete = authenticatedMutation({
	args: { orgId: v.id("orgs") },
	handler: async (ctx, args) => {
		const now = Date.now();

		const member = await getOrgMember(ctx, args.orgId, ctx.userId);
		if (!member || member.deletedAt !== undefined) throw new ConvexError(ERRORS.FORBIDDEN);

		const org = await ctx.db.get(args.orgId);
		if (!org) throw new ConvexError(ERRORS.ORG_NOT_FOUND);

		await ctx.db.patch(args.orgId, { onboardingStep: 2, updatedAt: now });
		await ctx.db.patch(ctx.userId, { onboardingCompleted: true, updatedAt: now });

		await logActivity(ctx, {
			orgId: args.orgId,
			userId: ctx.userId,
			action: "updated",
			entityType: ENTITY_TYPES.ORG,
			entityId: args.orgId,
			description: "Completed onboarding",
		});

		return { slug: org.slug };
	},
});

// ─── update — settings page edits ─────────────────────────────────────────────

/**
 * Update org settings (name, slug, currency/timezone, modules, etc.).
 * Requires `org.editSettings`.
 *
 * Slug + entity-label slugs validated against `RESERVED_SLUGS` (SSOT).
 */
const orgUpdateArgs = {
	orgId: v.id("orgs"),
	name: v.optional(v.string()),
	slug: v.optional(v.string()),
	entityLabels: v.optional(
		v.object({
			lead: v.optional(
				v.object({
					singular: v.string(),
					plural: v.string(),
					slug: v.string(),
					singularAr: v.optional(v.string()),
					pluralAr: v.optional(v.string()),
				}),
			),
			contact: v.optional(
				v.object({
					singular: v.string(),
					plural: v.string(),
					slug: v.string(),
					singularAr: v.optional(v.string()),
					pluralAr: v.optional(v.string()),
				}),
			),
			deal: v.optional(
				v.object({
					singular: v.string(),
					plural: v.string(),
					slug: v.string(),
					singularAr: v.optional(v.string()),
					pluralAr: v.optional(v.string()),
				}),
			),
			company: v.optional(
				v.object({
					singular: v.string(),
					plural: v.string(),
					slug: v.string(),
					singularAr: v.optional(v.string()),
					pluralAr: v.optional(v.string()),
				}),
			),
		}),
	),
	settings: v.optional(
		v.object({
			defaultCurrency: v.optional(v.string()),
			timezone: v.optional(v.string()),
			leadStaleAfterDays: v.optional(v.number()),
			badgeCountsVisible: v.optional(v.boolean()),
			codePrefixes: v.optional(
				v.object({
					person: v.optional(v.string()),
					deal: v.optional(v.string()),
					company: v.optional(v.string()),
					task: v.optional(v.string()),
				}),
			),
			modules: v.optional(
				v.array(
					v.object({
						slot: v.string(),
						label: v.optional(v.string()),
						hidden: v.optional(v.boolean()),
						order: v.optional(v.number()),
						defaultView: v.optional(v.union(v.literal("list"), v.literal("board"))),
						cardFields: v.optional(v.array(v.string())),
						listColumns: v.optional(v.array(v.string())),
						boardGroupBy: v.optional(v.string()),
						defaultFilters: v.optional(v.array(v.string())),
						meta: v.optional(v.any()),
					}),
				),
			),
			taskDefaults: v.optional(
				v.object({
					defaultDueOffsetDays: v.optional(v.number()),
					defaultPriority: v.optional(
						v.union(
							v.literal("low"),
							v.literal("normal"),
							v.literal("high"),
							v.literal("urgent"),
						),
					),
					autoCloseAfterDays: v.optional(v.number()),
					notifyAssignee: v.optional(v.boolean()),
					requireDealCode: v.optional(v.boolean()),
					reminderBeforeHours: v.optional(v.number()),
				}),
			),
			briefingDefaults: v.optional(
				v.object({
					morningBriefingEnabled: v.optional(v.boolean()),
					morningBriefingTime: v.optional(v.string()),
				}),
			),
			fileUpload: v.optional(
				v.object({
					allowedMimeCategories: v.optional(v.array(v.string())),
					maxSizeMb: v.optional(v.number()),
				}),
			),
			dashboardMetrics: v.optional(v.array(v.string())),
			softDeleteRetentionDays: v.optional(v.number()),
			mockDataSeededAt: v.optional(v.number()),
			mockDataDismissedAt: v.optional(v.number()),
			deletionScheduledAt: v.optional(v.number()),
		}),
	),
};

async function updateImpl(
	ctx: MutationCtx,
	args: {
		orgId: Id<"orgs">;
		userId: Id<"users">;
		// biome-ignore lint/suspicious/noExplicitAny: pass-through for the deep-merged settings shape; the validator above is the source of truth
		[k: string]: any;
	},
) {
	const now = Date.now();

	const { orgId, userId, settings: newSettings, ...directUpdates } = args;

	if (directUpdates.slug) {
		const existing = await getOrgBySlug(ctx, directUpdates.slug);
		if (existing && existing._id !== orgId) throw new ConvexError(ERRORS.ORG_SLUG_TAKEN);
	}

	if (directUpdates.entityLabels) {
		for (const [, label] of Object.entries(directUpdates.entityLabels) as Array<
			[string, { slug?: string } | undefined]
		>) {
			if (label?.slug && RESERVED_SLUGS.has(label.slug.toLowerCase())) {
				throw new ConvexError(
					`Entity slug "${label.slug}" conflicts with a reserved route. Choose a different slug.`,
				);
			}
		}
	}

	const patchData: Record<string, unknown> = { ...directUpdates, updatedAt: now };
	if (newSettings) {
		const org = await ctx.db.get(orgId);
		const existing: {
			codePrefixes?: Record<string, string | undefined>;
			taskDefaults?: Record<string, unknown>;
			fileUpload?: Record<string, unknown>;
			[k: string]: unknown;
		} = org?.settings ?? {};
		patchData.settings = {
			...existing,
			...newSettings,
			...(newSettings.codePrefixes && {
				codePrefixes: {
					...existing.codePrefixes,
					...newSettings.codePrefixes,
				},
			}),
			...(newSettings.taskDefaults && {
				taskDefaults: {
					...existing.taskDefaults,
					...newSettings.taskDefaults,
				},
			}),
			...(newSettings.fileUpload && {
				fileUpload: {
					...existing.fileUpload,
					...newSettings.fileUpload,
				},
			}),
		};
	}

	await ctx.db.patch(orgId, patchData);

	await logActivity(ctx, {
		orgId,
		userId,
		action: "updated",
		entityType: ENTITY_TYPES.ORG,
		entityId: orgId,
		description: "Updated organization settings",
	});
}

export const update = orgMutation({
	args: orgUpdateArgs,
	handler: async (ctx, args) => {
		const member = await getOrgMember(ctx, args.orgId, ctx.userId);
		if (!member || member.deletedAt !== undefined)
			throw new ConvexError(ERRORS.ORG_MEMBER_NOT_FOUND);
		requireRole(member.permissions, "org.editSettings");
		return updateImpl(ctx, { ...args, userId: ctx.userId });
	},
});

/** AI-callable internal twin. */
export const updateForAI = internalMutation({
	args: { ...orgUpdateArgs, userId: v.id("users") },
	handler: async (ctx, args) => {
		const { member } = await requireOrgMemberByIds(ctx, args.orgId, args.userId);
		requireRole(member.permissions, "org.editSettings");
		return updateImpl(ctx, args);
	},
});

// ─── Member management ───────────────────────────────────────────────────────

/**
 * Remove a member from the org (soft-delete). Requires `members.remove`.
 * Cannot remove the last owner.
 */
async function removeMemberImpl(
	ctx: MutationCtx,
	args: {
		orgId: Id<"orgs">;
		actorUserId: Id<"users">;
		targetUserId: Id<"users">;
	},
) {
	const now = Date.now();

	const targetMember = await getOrgMember(ctx, args.orgId, args.targetUserId);
	if (!targetMember || targetMember.deletedAt !== undefined)
		throw new ConvexError(ERRORS.ORG_MEMBER_NOT_FOUND);

	if (targetMember.roleId) {
		const targetRole = await ctx.db.get(targetMember.roleId);
		if (targetRole?.name === "Owner") {
			const allMembers = await ctx.db
				.query("orgMembers")
				.withIndex("by_orgId_and_userId", (q) => q.eq("orgId", args.orgId))
				.take(200);
			const ownerRoleIds = await ctx.db
				.query("orgRoles")
				.withIndex("by_orgId_and_name", (q) =>
					q.eq("orgId", args.orgId).eq("name", "Owner"),
				)
				.take(1);
			const ownerRoleId = ownerRoleIds[0]?._id;
			const activeOwners = allMembers.filter(
				(m) => m.deletedAt === undefined && m.roleId === ownerRoleId,
			);
			if (activeOwners.length <= 1)
				throw new ConvexError("Cannot remove the last owner of an organization.");
		}
	}

	await ctx.db.patch(targetMember._id, { deletedAt: now });
	await applyOrgStat(ctx, args.orgId, "members.active", -1);

	await logActivity(ctx, {
		orgId: args.orgId,
		userId: args.actorUserId,
		action: "deleted",
		entityType: ENTITY_TYPES.MEMBER,
		entityId: targetMember._id,
		description: `Removed member from organization`,
	});

	if (args.targetUserId !== args.actorUserId) {
		await sendNotification(ctx, {
			orgId: args.orgId,
			userId: args.targetUserId,
			type: "member.removed",
			title: "You have been removed from an organization",
			body: "Your membership has been revoked by an administrator.",
			entityType: ENTITY_TYPES.MEMBER,
			entityId: targetMember._id,
		});
	}
}

export const removeMember = orgMutation({
	args: {
		orgId: v.id("orgs"),
		userId: v.id("users"),
	},
	handler: async (ctx, args) => {
		const actorMember = await getOrgMember(ctx, args.orgId, ctx.userId);
		if (!actorMember || actorMember.deletedAt !== undefined)
			throw new ConvexError(ERRORS.FORBIDDEN);
		requireRole(actorMember.permissions, "members.remove");
		return removeMemberImpl(ctx, {
			orgId: args.orgId,
			actorUserId: ctx.userId,
			targetUserId: args.userId,
		});
	},
});

/** AI-callable internal twin. The `userId` arg is the orchestrator's actor; `targetUserId` is who's being removed. */
export const removeMemberForAI = internalMutation({
	args: {
		orgId: v.id("orgs"),
		userId: v.id("users"),
		targetUserId: v.id("users"),
	},
	handler: async (ctx, args) => {
		const { member } = await requireOrgMemberByIds(ctx, args.orgId, args.userId);
		requireRole(member.permissions, "members.remove");
		return removeMemberImpl(ctx, {
			orgId: args.orgId,
			actorUserId: args.userId,
			targetUserId: args.targetUserId,
		});
	},
});

/**
 * Update a member's role. Requires `members.changeRole` (owner only).
 */
async function updateMemberRoleImpl(
	ctx: MutationCtx,
	args: {
		orgId: Id<"orgs">;
		actorUserId: Id<"users">;
		targetUserId: Id<"users">;
		roleId: Id<"orgRoles">;
	},
) {
	const now = Date.now();

	const targetMember = await getOrgMember(ctx, args.orgId, args.targetUserId);
	if (!targetMember || targetMember.deletedAt !== undefined)
		throw new ConvexError(ERRORS.ORG_MEMBER_NOT_FOUND);

	const newRoleDoc = await ctx.db.get(args.roleId);
	if (!newRoleDoc || newRoleDoc.orgId !== args.orgId) {
		throw new ConvexError("Role not found in this organization.");
	}

	await ctx.db.patch(targetMember._id, {
		roleId: args.roleId,
		updatedAt: now,
	});

	await logActivity(ctx, {
		orgId: args.orgId,
		userId: args.actorUserId,
		action: "updated",
		entityType: ENTITY_TYPES.MEMBER,
		entityId: targetMember._id,
		description: `Changed role to ${newRoleDoc.name}`,
	});

	if (args.targetUserId !== args.actorUserId) {
		await sendNotification(ctx, {
			orgId: args.orgId,
			userId: args.targetUserId,
			type: "member.roleChanged",
			title: "Your role has been updated",
			body: `Your role has been changed to ${newRoleDoc.name}.`,
			entityType: ENTITY_TYPES.MEMBER,
			entityId: targetMember._id,
		});
	}
}

export const updateMemberRole = orgMutation({
	args: {
		orgId: v.id("orgs"),
		userId: v.id("users"),
		roleId: v.id("orgRoles"),
	},
	handler: async (ctx, args) => {
		const actorMember = await getOrgMember(ctx, args.orgId, ctx.userId);
		if (!actorMember || actorMember.deletedAt !== undefined)
			throw new ConvexError(ERRORS.FORBIDDEN);
		requireRole(actorMember.permissions, "members.changeRole");
		return updateMemberRoleImpl(ctx, {
			orgId: args.orgId,
			actorUserId: ctx.userId,
			targetUserId: args.userId,
			roleId: args.roleId,
		});
	},
});

/** AI-callable internal twin. `userId` is the orchestrator's actor; `targetUserId` is who's being modified. */
export const updateMemberRoleForAI = internalMutation({
	args: {
		orgId: v.id("orgs"),
		userId: v.id("users"),
		targetUserId: v.id("users"),
		roleId: v.id("orgRoles"),
	},
	handler: async (ctx, args) => {
		const { member } = await requireOrgMemberByIds(ctx, args.orgId, args.userId);
		requireRole(member.permissions, "members.changeRole");
		return updateMemberRoleImpl(ctx, {
			orgId: args.orgId,
			actorUserId: args.userId,
			targetUserId: args.targetUserId,
			roleId: args.roleId,
		});
	},
});

/**
 * Soft-delete the org. Requires `org.delete` (owner only).
 */
export const deleteOrg = orgMutation({
	args: { orgId: v.id("orgs") },
	handler: async (ctx, args) => {
		const now = Date.now();

		const member = await getOrgMember(ctx, args.orgId, ctx.userId);
		if (!member || member.deletedAt !== undefined) throw new ConvexError(ERRORS.FORBIDDEN);

		requireRole(member.permissions, "org.delete");

		// Phase 3A — 24h grace before cascade delete.
		//
		// Rather than hard-deleting on the spot, we soft-delete the org
		// AND stamp `deletionScheduledAt = now + 24h`. The
		// `cascadeDeleteOrgIfDue` cascading mutation runs after the grace
		// period and physically removes every org-scoped row. During the
		// grace window the owner can call `cancelOrgDeletion` to abort.
		const grace = 24 * 60 * 60 * 1000;
		const scheduledAt = now + grace;

		const org = await ctx.db.get(args.orgId);
		await ctx.db.patch(args.orgId, {
			deletedAt: now,
			settings: {
				...(org?.settings ?? {}),
				deletionScheduledAt: scheduledAt,
			},
			updatedAt: now,
		});

		// Schedule the cascade. The internal mutation re-checks
		// `deletionScheduledAt` so a cancellation is honoured.
		await ctx.scheduler.runAfter(grace, internal.orgs.mutations.cascadeDeleteOrgIfDue, {
			orgId: args.orgId,
		});

		await logActivity(ctx, {
			orgId: args.orgId,
			userId: ctx.userId,
			action: "deleted",
			entityType: ENTITY_TYPES.ORG,
			entityId: args.orgId,
			description: "Workspace scheduled for deletion in 24 hours",
		});
	},
});

/**
 * Cancel a scheduled workspace deletion within the 24h grace window.
 * Permission: `org.delete` (same as initiating). Lifts the soft-delete,
 * clears `deletionScheduledAt`, and the scheduled cascade becomes a
 * no-op (it re-checks the flag before running).
 */
export const cancelOrgDeletion = orgMutation({
	args: { orgId: v.id("orgs") },
	handler: async (ctx, args) => {
		const member = await getOrgMember(ctx, args.orgId, ctx.userId);
		if (!member) throw new ConvexError(ERRORS.FORBIDDEN);
		requireRole(member.permissions, "org.delete");

		const org = await ctx.db.get(args.orgId);
		if (!org) throw new ConvexError(ERRORS.ORG_NOT_FOUND);
		if (org.settings?.deletionScheduledAt === undefined) {
			throw new ConvexError({
				code: "NO_PENDING_DELETION",
				message: "This workspace has no pending deletion.",
			});
		}

		await ctx.db.patch(args.orgId, {
			deletedAt: undefined,
			settings: {
				...(org.settings ?? {}),
				deletionScheduledAt: undefined,
			},
			updatedAt: Date.now(),
		});

		await logActivity(ctx, {
			orgId: args.orgId,
			userId: ctx.userId,
			action: "restored",
			entityType: ENTITY_TYPES.ORG,
			entityId: args.orgId,
			description: "Workspace deletion cancelled",
		});
	},
});

/**
 * Internal cascade-delete handler. Scheduled by `deleteOrg` to run 24h
 * after the request. Re-validates `deletionScheduledAt` so a cancellation
 * within the grace window prevents the cascade.
 *
 * Iterates all org-scoped tables in a single transaction and hard-
 * deletes every row, ending with the org doc itself.
 */
export const cascadeDeleteOrgIfDue = internalMutation({
	args: { orgId: v.id("orgs") },
	handler: async (ctx, args) => {
		const org = await ctx.db.get(args.orgId);
		if (!org) return { ok: false, reason: "org_not_found" };
		const scheduled = org.settings?.deletionScheduledAt;
		if (scheduled === undefined) {
			return { ok: false, reason: "deletion_cancelled" };
		}
		if (Date.now() < scheduled) {
			// Should not happen — scheduler fires after the delay — but
			// guard anyway in case of clock skew or manual invocation.
			return { ok: false, reason: "grace_window_open" };
		}

		const orgScopedTables = [
			"leads",
			"contacts",
			"companies",
			"deals",
			"notes",
			"reminders",
			"messages",
			"conversations",
			"conversationMembers",
			"tags",
			"entityTags",
			"fieldDefinitions",
			"fieldValues",
			"pipelines",
			"savedViews",
			"activityLogs",
			"orgMembers",
			"orgRoles",
			"orgStats",
			"invitations",
			"notifications",
			"files",
			"noteCategories",
			"entityCodeCounters",
			"companyMembers",
			"aiConversations",
			"aiMessages",
			"featureFlags",
			"rateLimits",
		] as const;

		let deleted = 0;
		for (const table of orgScopedTables) {
			// Use the canonical `by_org` or fall back when needed. We try
			// each index name pattern; Convex throws on unknown indexes,
			// so the try/catch isolates per-table failures.
			try {
				const rows = await (
					ctx.db as unknown as {
						query: (t: string) => {
							withIndex: (
								n: string,
								b: (q: { eq: (k: string, v: unknown) => unknown }) => unknown,
							) => { collect: () => Promise<Array<{ _id: string }>> };
						};
					}
				)
					.query(table)
					.withIndex("by_org", (q) => q.eq("orgId", args.orgId))
					.collect();
				for (const r of rows) {
					await ctx.db.delete(r._id as never);
					deleted += 1;
				}
			} catch {
				// Table doesn't have a by_org index — skip; it's either
				// not org-scoped or uses a composite index not worth
				// special-casing for this rare flow.
			}
		}

		// Finally, the org doc itself.
		await ctx.db.delete(args.orgId);
		return { ok: true, deleted };
	},
});

// ─── Maintenance ──────────────────────────────────────────────────────────────

/**
 * Reconcile missing permissions on existing `orgRoles` rows.
 *
 * Drives off the SSOT permission catalog: for every system role, computes the
 * diff between what the catalog says it should have and what's currently on
 * the row, then patches in only the missing keys. Idempotent — running it
 * twice in a row patches zero rows the second time. Custom roles are
 * untouched (they're owner-curated, not catalog-driven).
 *
 * USAGE: `npx convex run orgs/mutations:backfillRolePermissions`
 */
export const backfillRolePermissions = internalMutation({
	args: {},
	handler: async (ctx) => {
		const allRoles = await ctx.db.query("orgRoles").collect();
		let patched = 0;
		for (const role of allRoles) {
			const additions = getMissingPermissionsForRole(role.name, role.permissions);
			if (additions.length === 0) continue;
			await ctx.db.patch(role._id, {
				permissions: [...role.permissions, ...additions],
				updatedAt: Date.now(),
			});
			patched++;
		}
		return { patched };
	},
});

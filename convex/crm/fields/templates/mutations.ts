/**
 * Template seeding mutations — convex/crm/fields/templates/mutations.ts
 *
 * Single entry point for seeding an org with a complete industry template.
 * Idempotent: re-running with the same template is safe — every step is a
 * "skip-if-exists" check on the natural key for that table.
 *
 * Seeds (in order):
 *   1.  Workspace defaults (currency, timezone, locale, leadStaleAfterDays)
 *   2.  Code prefixes (person/deal/company/followup)
 *   3.  Entity labels (singular/plural/slug, with Arabic where present)
 *   4.  Pipelines (deal default + any extras) — Default stage auto-injected
 *   5.  Field definitions per entity (showInStages codes → ids)
 *   6.  Modules slot map (orgs.settings.modules[])
 *   7.  Reminder defaults
 *   8.  Follow-up cadence defaults
 *   9.  File-upload policy
 *   10. Note categories (sticky-note kanban columns)
 *   11. Tags
 *   12. Saved views
 *   13. Custom roles
 *   14. AI persona (aiPersonaContext.identity for org-level row, only if currently unset)
 *   15. org.industry pin (records which template was applied)
 *
 * Callers:
 *   - `orgs.applyTemplate` (public mutation — onboarding wizard, settings).
 *   - Migrations / dev `npx convex run` for one-off seeding.
 *   - Phase 3 AI tool `setup_workspace_from_template`.
 */
import { v } from "convex/values";
import { internal } from "../../../_generated/api";
import type { Id } from "../../../_generated/dataModel";
import { internalMutation, type MutationCtx } from "../../../_generated/server";
import { isKnownPermission } from "../../../_shared/permissions/derive";
import { seedMockEntities } from "./mockSeeder";
import type {
	BriefingDefaultsSeed,
	CodePrefixesSeed,
	CustomRoleSeed,
	DashboardLayoutSeed,
	FieldDefSeed,
	FileUploadSeed,
	IndustryTemplate,
	ModuleSeed,
	NoteCategorySeed,
	PipelineSeed,
	SavedViewSeed,
	StageSeed,
	TagSeed,
	TaskDefaultsSeed,
	WorkspaceDefaultsSeed,
} from "./types";

// ─── DB-backed template loader (Stage 1 of INDUSTRY-TEMPLATES-DB-MIGRATION) ─

/**
 * Fetch a template from the `platformTemplates` table and reconstruct
 * the legacy `IndustryTemplate` shape the seeder expects (identity at
 * top-level + every slot inline). Returns `null` when no row matches.
 *
 * Replaced the previous `getTemplate(id)` registry lookup in Stage 1 of
 * INDUSTRY-TEMPLATES-DB-MIGRATION.md. Stage 3 (2026-05-27) deleted the
 * registry + 9 TS definition files entirely — the 9 built-in template
 * fixtures relocated to `convex/_platform/industries/builtIns/` as
 * one-time bootstrap data. Runtime reads NEVER touch them.
 */
async function loadTemplateFromDB(
	ctx: MutationCtx,
	templateKey: string,
): Promise<IndustryTemplate | null> {
	const row = await ctx.db
		.query("platformTemplates")
		.withIndex("by_templateKey", (q) => q.eq("templateKey", templateKey))
		.unique();
	if (!row) return null;
	const def = row.definition as Partial<IndustryTemplate>;
	return {
		id: row.templateKey,
		label: row.label,
		description: row.description,
		icon: row.icon,
		region: row.region,
		...def,
	} as IndustryTemplate;
}

// ─── nanoid (deterministic 12-char id used by the existing pipelines code) ──

function nanoid12(): string {
	return Math.random().toString(36).slice(2, 14).padEnd(12, "0");
}

// ─── Internal seed helpers (one per slot, all idempotent) ───────────────────

/**
 * Resolve the template's pipeline list into a single normalized array.
 * Accepts the legacy `pipeline:{name,stages}` shape AND the new
 * `pipelines:[…]` shape.
 */
function collectPipelines(t: IndustryTemplate): PipelineSeed[] {
	const out: PipelineSeed[] = [];
	if (t.pipeline) {
		out.push({
			entityType: "deal",
			name: t.pipeline.name,
			isDefault: true,
			stages: t.pipeline.stages,
		});
	}
	if (t.pipelines) {
		for (const p of t.pipelines) out.push(p);
	}
	return out;
}

/**
 * Insert a pipeline if (orgId, entityType, name) doesn't exist. Returns the
 * pipeline document (existing or new) plus a code→id map for stages so
 * field-definition seeding can resolve `showInStages`.
 */
async function seedOnePipeline(
	ctx: MutationCtx,
	orgId: Id<"orgs">,
	seed: PipelineSeed,
	now: number,
): Promise<{
	pipelineId: Id<"pipelines">;
	stageCodeToId: Map<string, string>;
	created: boolean;
}> {
	// Find by entityType + name (templates always carry a stable name).
	const existing = await ctx.db
		.query("pipelines")
		.withIndex("by_org_and_entity", (q) =>
			q.eq("orgId", orgId).eq("entityType", seed.entityType),
		)
		.collect();
	const match = existing.find((p) => p.name === seed.name);
	const stageCodeToId = new Map<string, string>();

	if (match) {
		for (const stage of match.stages) stageCodeToId.set(stage.code, stage.id);
		return { pipelineId: match._id, stageCodeToId, created: false };
	}

	// Auto-inject a Default stage when none of the seed stages is marked as one.
	const hasDefault = seed.stages.some((s) => s.isDefaultStage === true);
	const stages: StageSeed[] = hasDefault
		? seed.stages
		: [
				{ name: "Default", code: "DFL", color: "#94a3b8", isDefaultStage: true },
				...seed.stages,
			];

	const persisted = stages.map((s, i) => {
		const id = `stage_${nanoid12()}`;
		stageCodeToId.set(s.code, id);
		return {
			id,
			name: s.name,
			code: s.code,
			order: i,
			color: s.color,
			isFinal: s.isFinal,
			finalType: s.finalType,
			staleAfterDays: s.staleAfterDays,
			warningAfterDays: s.warningAfterDays,
			isDefaultStage: s.isDefaultStage ?? i === 0,
		};
	});

	const pipelineId = await ctx.db.insert("pipelines", {
		orgId,
		name: seed.name,
		entityType: seed.entityType,
		isDefault: seed.isDefault,
		stageTransitionPolicy: seed.stageTransitionPolicy ?? "warn",
		allowSkipStages: seed.allowSkipStages ?? false,
		markDoneRequiresAllFields: seed.markDoneRequiresAllFields ?? true,
		stages: persisted,
		createdAt: now,
		updatedAt: now,
	});
	return { pipelineId, stageCodeToId, created: true };
}

/**
 * Insert field definitions, deduping on (orgId, entityType, name).
 * Resolves `showInStages` codes to stage ids using the supplied map.
 */
async function seedFieldDefinitions(
	ctx: MutationCtx,
	orgId: Id<"orgs">,
	defs: { [k in "lead" | "contact" | "deal" | "company"]?: FieldDefSeed[] },
	stageCodeToId: Map<string, string>,
	now: number,
): Promise<number> {
	let inserted = 0;
	for (const [entityType, list] of Object.entries(defs)) {
		const existing = await ctx.db
			.query("fieldDefinitions")
			.withIndex("by_org_and_entity", (q) =>
				q.eq("orgId", orgId).eq("entityType", entityType),
			)
			.collect();
		const existingNames = new Set(existing.map((r) => r.name));
		let maxOrder = existing.reduce((acc, r) => (r.order > acc ? r.order : acc), -1);

		for (const def of list ?? []) {
			if (existingNames.has(def.name)) continue;
			maxOrder += 1;
			const resolvedShowInStages = def.showInStages
				?.map((code) => stageCodeToId.get(code))
				.filter((v): v is string => !!v);

			await ctx.db.insert("fieldDefinitions", {
				orgId,
				entityType: def.entityType,
				name: def.name,
				label: def.label,
				labelAr: def.labelAr,
				type: def.type,
				kind: def.kind,
				storage: def.storage,
				columnKey: def.columnKey,
				system: def.system ?? false,
				protected: def.protected ?? false,
				hidden: false,
				options: def.options,
				required: def.required ?? false,
				order: def.order ?? maxOrder,
				groupName: def.groupName,
				sensitive: def.sensitive,
				defaultValue: def.defaultValue,
				showInStages:
					resolvedShowInStages && resolvedShowInStages.length > 0
						? resolvedShowInStages
						: undefined,
				createdAt: now,
				updatedAt: now,
			});
			inserted += 1;
		}
	}
	return inserted;
}

/** Patch org-level settings via shallow merge (template wins for keys it sets). */
async function patchOrgSettings(
	ctx: MutationCtx,
	orgId: Id<"orgs">,
	args: {
		entityLabels?: IndustryTemplate["entityLabels"];
		entityVisibility?: IndustryTemplate["entityVisibility"];
		defaults?: WorkspaceDefaultsSeed;
		codePrefixes?: CodePrefixesSeed;
		modules?: ModuleSeed[];
		taskDefaults?: TaskDefaultsSeed;
		briefingDefaults?: BriefingDefaultsSeed;
		fileUpload?: FileUploadSeed;
		aiPersona?: string;
		dashboardMetrics?: string[];
		dashboardLayout?: DashboardLayoutSeed;
		industryId: string;
	},
	now: number,
): Promise<void> {
	const org = await ctx.db.get(orgId);
	if (!org) return;

	const existingSettings: NonNullable<typeof org.settings> = org.settings ?? {};
	const newSettings: NonNullable<typeof org.settings> = { ...existingSettings };

	if (args.defaults?.currency && !existingSettings.defaultCurrency) {
		newSettings.defaultCurrency = args.defaults.currency;
	}
	if (args.defaults?.timezone && !existingSettings.timezone) {
		newSettings.timezone = args.defaults.timezone;
	}
	if (
		args.defaults?.leadStaleAfterDays !== undefined &&
		existingSettings.leadStaleAfterDays === undefined
	) {
		newSettings.leadStaleAfterDays = args.defaults.leadStaleAfterDays;
	}
	if (args.codePrefixes) {
		newSettings.codePrefixes = {
			...(existingSettings.codePrefixes ?? {}),
			...args.codePrefixes,
		};
	}
	if (args.taskDefaults) {
		newSettings.taskDefaults = {
			...(existingSettings.taskDefaults ?? {}),
			...args.taskDefaults,
		};
	}
	if (args.briefingDefaults) {
		newSettings.briefingDefaults = {
			...(existingSettings.briefingDefaults ?? {}),
			...args.briefingDefaults,
		};
	}
	if (args.fileUpload) {
		newSettings.fileUpload = {
			...(existingSettings.fileUpload ?? {}),
			...args.fileUpload,
		};
	}
	// Phase 3A — entityVisibility lift.
	//
	// `entityVisibility: { lead: false }` is the high-level intent. The
	// concrete shape is `org.settings.modules[].hidden`. When the template
	// provides modules, we OR the visibility flag onto each one. When the
	// template provides only entityVisibility without a modules array, we
	// build a minimal modules[] so AppSidebar can read the hidden flag.
	let modulesToWrite: ModuleSeed[] | undefined = args.modules;
	if (args.entityVisibility) {
		const vis = args.entityVisibility;
		const flagFor = (slot: string): boolean | undefined => {
			switch (slot) {
				case "lead":
					return vis.lead;
				case "contact":
					return vis.contact;
				case "deal":
					return vis.deal;
				case "company":
					return vis.company;
				case "entity5":
					return vis.entity5;
				case "entity6":
					return vis.entity6;
				default:
					return undefined;
			}
		};

		if (modulesToWrite && modulesToWrite.length > 0) {
			modulesToWrite = modulesToWrite.map((m) => {
				const flag = flagFor(m.slot);
				if (flag === false) return { ...m, hidden: true };
				return m;
			});
		} else {
			// Build minimal modules from entityVisibility alone.
			modulesToWrite = (["lead", "contact", "deal", "company"] as const).map((slot, i) => ({
				slot,
				order: i,
				hidden: flagFor(slot) === false,
				defaultView: "list" as const,
			}));
		}
	}

	if (modulesToWrite && modulesToWrite.length > 0 && !existingSettings.modules) {
		// Only seed modules when the org doesn't already have a slot map —
		// otherwise we risk clobbering user customizations.
		newSettings.modules = modulesToWrite.map((m) => ({
			slot: m.slot,
			label: m.label,
			hidden: m.hidden,
			order: m.order,
			defaultView: m.defaultView,
			cardFields: m.cardFields,
			listColumns: m.listColumns,
			boardGroupBy: m.boardGroupBy,
			defaultFilters: m.defaultFilters,
			meta: m.meta,
		}));
	}

	// Phase 3A — dashboardMetrics propagation.
	//
	// Templates declare an ORDERED list of widget keys. The dashboard
	// renders widgets in this order (top-to-bottom). Re-applying or
	// switching template SHOULD reset the metric set — owners who want
	// custom widgets re-order via Settings → Workspace.
	if (args.dashboardMetrics && args.dashboardMetrics.length > 0) {
		newSettings.dashboardMetrics = [...args.dashboardMetrics];
	}

	// Stage 4 of /DASHBOARD-V2-PLAN.md (2026-05-29) — dashboardLayout
	// propagation. Templates that opt into the multi-region layout
	// (per-industry dashboards) ship a `dashboardLayout` slot. Re-apply
	// resets it; templates that don't ship one leave the slot
	// undefined and the renderer falls back to the
	// `dashboardMetrics`-driven default. Unknown widget keys are
	// rejected at render time by `validateDashboardLayoutShape`; the
	// shape itself is validated against the same schema the platform
	// editor enforces (`validators.ts::validateDefinition`), so writes
	// reaching this seed point are already well-formed.
	if (args.dashboardLayout !== undefined) {
		newSettings.dashboardLayout = {
			...args.dashboardLayout,
			panels: args.dashboardLayout.panels.map((p) => ({ ...p })),
		};
	}

	const patch: {
		settings: typeof newSettings;
		entityLabels?: typeof org.entityLabels;
		industry: string;
		updatedAt: number;
	} = {
		settings: newSettings,
		industry: args.industryId,
		updatedAt: now,
	};

	if (args.entityLabels) {
		patch.entityLabels = {
			...(org.entityLabels ?? {}),
			...args.entityLabels,
		};
	}

	await ctx.db.patch(orgId, patch);

	// Seed the AI identity blob into aiPersonaContext (org-level row)
	// — but only if no row exists yet, so we never overwrite owner edits.
	// Replaces the previous direct write to `orgs.aiContext` (dropped 2026-05-24).
	if (args.aiPersona && args.aiPersona.trim().length > 0) {
		const existing = await ctx.db
			.query("aiPersonaContext")
			.withIndex("by_org_and_user", (q) => q.eq("orgId", orgId).eq("userId", undefined))
			.first();
		const trimmed = args.aiPersona.trim();
		if (!existing) {
			await ctx.db.insert("aiPersonaContext", {
				orgId,
				userId: undefined,
				identity: trimmed,
				summary: "",
				keyFacts: [],
				preferences: undefined,
				byteCount: 0,
				lastUpdatedAt: now,
				createdAt: now,
				updatedAt: now,
			});
		} else if (!existing.identity || existing.identity.trim().length === 0) {
			await ctx.db.patch(existing._id, {
				identity: trimmed,
				lastUpdatedAt: now,
				updatedAt: now,
			});
		}
	}
}

/** Insert sticky-note categories, deduping on (orgId, name). */
async function seedNoteCategories(
	ctx: MutationCtx,
	orgId: Id<"orgs">,
	categories: NoteCategorySeed[] | undefined,
	now: number,
): Promise<number> {
	if (!categories || categories.length === 0) return 0;
	const existing = await ctx.db
		.query("noteCategories")
		.withIndex("by_org_and_position", (q) => q.eq("orgId", orgId))
		.collect();
	const existingNames = new Set(existing.map((c) => c.name));
	const hasAnyDefault = existing.some((c) => c.isDefault && !c.isArchived);

	let nextPosition = existing.reduce((acc, r) => (r.position >= acc ? r.position + 1 : acc), 0);
	let inserted = 0;
	let defaultClaimed = hasAnyDefault;

	for (const seed of categories) {
		if (existingNames.has(seed.name)) continue;
		const isDefault = !!seed.isDefault && !defaultClaimed;
		await ctx.db.insert("noteCategories", {
			orgId,
			name: seed.name,
			bgColor: seed.bgColor,
			textColor: seed.textColor,
			position: seed.position ?? nextPosition,
			isDefault,
			isArchived: false,
			createdAt: now,
			updatedAt: now,
		});
		nextPosition += 1;
		inserted += 1;
		if (isDefault) defaultClaimed = true;
	}
	return inserted;
}

/** Insert tags, deduping on (orgId, name). */
async function seedTags(
	ctx: MutationCtx,
	orgId: Id<"orgs">,
	tags: TagSeed[] | undefined,
	now: number,
): Promise<number> {
	if (!tags || tags.length === 0) return 0;
	const existing = await ctx.db
		.query("tags")
		.withIndex("by_org", (q) => q.eq("orgId", orgId))
		.collect();
	const existingNames = new Set(existing.map((t) => t.name.toLowerCase()));
	let inserted = 0;
	for (const seed of tags) {
		if (existingNames.has(seed.name.toLowerCase())) continue;
		await ctx.db.insert("tags", {
			orgId,
			name: seed.name,
			color: seed.color,
			createdAt: now,
		});
		inserted += 1;
	}
	return inserted;
}

/** Insert saved views, deduping on (orgId, entityType, scope, name). */
async function seedSavedViews(
	ctx: MutationCtx,
	orgId: Id<"orgs">,
	createdBy: Id<"users"> | undefined,
	views: SavedViewSeed[] | undefined,
	now: number,
): Promise<number> {
	if (!views || views.length === 0 || !createdBy) return 0;
	const existing = await ctx.db
		.query("savedViews")
		.withIndex("by_org_and_creator", (q) => q.eq("orgId", orgId).eq("createdBy", createdBy))
		.collect();
	const existingKeys = new Set(existing.map((v) => `${v.entityType}::${v.scope}::${v.name}`));
	let inserted = 0;
	for (const seed of views) {
		const key = `${seed.entityType}::${seed.scope}::${seed.name}`;
		if (existingKeys.has(key)) continue;
		await ctx.db.insert("savedViews", {
			orgId,
			name: seed.name,
			entityType: seed.entityType,
			scope: seed.scope,
			filters: seed.filters,
			sortBy: seed.sortBy,
			sortOrder: seed.sortOrder,
			columns: seed.columns,
			isPinned: seed.isPinned ?? false,
			createdBy,
			createdAt: now,
			updatedAt: now,
		});
		inserted += 1;
	}
	return inserted;
}

/**
 * Insert custom roles. Skips any role whose name already exists in
 * `orgRoles` for the org. Validates every permission against the SSOT
 * catalog so a typo'd template can't ship a broken role.
 */
async function seedCustomRoles(
	ctx: MutationCtx,
	orgId: Id<"orgs">,
	roles: CustomRoleSeed[] | undefined,
	now: number,
): Promise<number> {
	if (!roles || roles.length === 0) return 0;
	const existing = await ctx.db
		.query("orgRoles")
		.withIndex("by_orgId", (q) => q.eq("orgId", orgId))
		.collect();
	const existingNames = new Set(existing.map((r) => r.name.toLowerCase()));
	let inserted = 0;
	for (const seed of roles) {
		if (existingNames.has(seed.name.toLowerCase())) continue;
		const validPerms = seed.permissions.filter((p) => isKnownPermission(p));
		await ctx.db.insert("orgRoles", {
			orgId,
			name: seed.name,
			description: seed.description,
			permissions: validPerms,
			isSystem: false,
			isDefault: false,
			color: seed.color,
			createdAt: now,
			updatedAt: now,
		});
		inserted += 1;
	}
	return inserted;
}

// ─── Internal mutation entry point ──────────────────────────────────────────

/**
 * Internal seeder. Apply a registered template to an org by id. Idempotent.
 *
 * `actorUserId` is optional — when supplied (typical) we attribute saved
 * views to that user. Without it, saved views are skipped (the table requires
 * createdBy).
 */
export const setupWorkspaceFromTemplate = internalMutation({
	args: {
		orgId: v.id("orgs"),
		templateId: v.string(),
		actorUserId: v.optional(v.id("users")),
	},
	handler: async (ctx, args) => {
		const t = await loadTemplateFromDB(ctx, args.templateId);
		if (!t) {
			// Soft-fail (Stage 1 of INDUSTRY-TEMPLATES-DB-MIGRATION):
			// when the platformTemplates row is missing the seeder
			// returns a zeroed result instead of throwing. This keeps
			// org creation working in:
			//   - Test environments that haven't run the seed migration.
			//   - Production deployments where the operator forgot to
			//     run the migration (the org gets a blank workspace
			//     that the owner can re-template via Settings →
			//     Workspace).
			//
			// Callers that NEED a template seed (e.g. a future "force
			// apply" admin action) must check `ok` on the return.
			return {
				ok: false as const,
				templateId: args.templateId,
				pipelineIds: [] as Id<"pipelines">[],
				fieldsInserted: 0,
				noteCategoriesInserted: 0,
				tagsInserted: 0,
				savedViewsInserted: 0,
				customRolesInserted: 0,
				mockInserted: 0,
			};
		}
		const now = Date.now();

		// 1+2+3+5+6+7+8+9+14+15 — settings (single ctx.db.patch on org)
		await patchOrgSettings(
			ctx,
			args.orgId,
			{
				entityLabels: t.entityLabels,
				entityVisibility: t.entityVisibility,
				defaults: t.defaults,
				codePrefixes: t.codePrefixes,
				modules: t.modules,
				taskDefaults: t.taskDefaults,
				briefingDefaults: t.briefingDefaults,
				fileUpload: t.fileUpload,
				aiPersona: t.aiPersona,
				dashboardMetrics: t.dashboardMetrics,
				dashboardLayout: t.dashboardLayout,
				industryId: t.id,
			},
			now,
		);

		// 4 — pipelines (collect codes per pipeline so field defs can resolve)
		const pipelineSeeds = collectPipelines(t);
		const aggregateStageCodeToId = new Map<string, string>();
		const pipelineIds: Id<"pipelines">[] = [];
		for (const seed of pipelineSeeds) {
			const r = await seedOnePipeline(ctx, args.orgId, seed, now);
			pipelineIds.push(r.pipelineId);
			for (const [code, id] of r.stageCodeToId) {
				// First seen wins. Templates SHOULD avoid duplicate codes
				// across pipelines, but if they collide we keep the first.
				if (!aggregateStageCodeToId.has(code)) {
					aggregateStageCodeToId.set(code, id);
				}
			}
		}

		// 5 — field definitions (pin to default stage when template author left it empty)
		let fieldsInserted = 0;
		if (t.fieldDefinitions) {
			fieldsInserted = await seedFieldDefinitions(
				ctx,
				args.orgId,
				t.fieldDefinitions,
				aggregateStageCodeToId,
				now,
			);
		}

		// 10 — note categories
		const noteCategoriesInserted = await seedNoteCategories(
			ctx,
			args.orgId,
			t.noteCategories,
			now,
		);

		// 11 — tags
		const tagsInserted = await seedTags(ctx, args.orgId, t.tags, now);

		// 12 — saved views
		const savedViewsInserted = await seedSavedViews(
			ctx,
			args.orgId,
			args.actorUserId,
			t.savedViews,
			now,
		);

		// 13 — custom roles
		const customRolesInserted = await seedCustomRoles(ctx, args.orgId, t.customRoles, now);

		// 16 — mock entities (Phase 3A) — gated on actorUserId because
		// notes + reminders need an authoring user. Skips silently when
		// the actor is unset (the seeder is also no-op without mockData).
		let mockInserted = 0;
		if (args.actorUserId) {
			const r = await seedMockEntities(ctx, args.orgId, args.actorUserId, t, now);
			mockInserted = r.inserted;
		}

		return {
			ok: true,
			templateId: t.id,
			pipelineIds,
			fieldsInserted,
			noteCategoriesInserted,
			tagsInserted,
			savedViewsInserted,
			customRolesInserted,
			mockInserted,
		};
	},
});

// ─── Schedulable wrapper used by `orgs.applyTemplate` ───────────────────────

/**
 * The public-facing `orgs.applyTemplate` mutation does the RBAC check and
 * then calls this internal helper, so callers don't need to know about
 * `internal.crm.fields.templates.mutations`.
 */
export async function runSetupWorkspaceFromTemplate(
	ctx: MutationCtx,
	orgId: Id<"orgs">,
	templateId: string,
	actorUserId: Id<"users">,
): Promise<void> {
	await ctx.runMutation(internal.crm.fields.templates.mutations.setupWorkspaceFromTemplate, {
		orgId,
		templateId,
		actorUserId,
	});
}

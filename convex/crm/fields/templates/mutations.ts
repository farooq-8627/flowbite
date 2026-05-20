/**
 * Template seeding mutations — convex/crm/fields/templates/mutations.ts
 *
 * Single entry point for seeding an org with a complete industry template.
 * Idempotent: re-running with the same template is safe — pipelines, fields,
 * and entity labels are only inserted/patched if they don't already exist.
 *
 * Callers:
 *   - Onboarding wizard (via a thin orgMutation wrapper, future).
 *   - Phase 3 AI tool `setup_workspace_from_template`.
 *   - Tests + the dev `npx convex run` flow for quick org seeding.
 */
import { ConvexError, v } from "convex/values";
import { internalMutation } from "../../../_generated/server";
import { getTemplate } from "./registry";

function nanoid12(): string {
	return Math.random().toString(36).slice(2, 14).padEnd(12, "0");
}

export const setupWorkspaceFromTemplate = internalMutation({
	args: {
		orgId: v.id("orgs"),
		templateId: v.string(),
	},
	handler: async (ctx, args) => {
		const t = getTemplate(args.templateId);
		if (!t) {
			throw new ConvexError({
				code: "TEMPLATE_NOT_FOUND",
				message: `Unknown industry template: ${args.templateId}`,
			});
		}
		const now = Date.now();

		// ─── 1. Pipeline ──────────────────────────────────────────────────
		// Skip if the org already has a deal pipeline (re-running the
		// template should never duplicate the pipeline).
		const existingPipeline = await ctx.db
			.query("pipelines")
			.withIndex("by_org_and_entity", (q) =>
				q.eq("orgId", args.orgId).eq("entityType", "deal"),
			)
			.first();

		// Resolve stage code → stage id once, so field showInStages can
		// reference codes (e.g. "DOC", "EJ") and we map them to nanoid ids.
		const stageCodeToId = new Map<string, string>();
		let pipelineId: string | null = null;

		if (existingPipeline) {
			pipelineId = existingPipeline._id as unknown as string;
			for (const stage of existingPipeline.stages) {
				stageCodeToId.set(stage.code, stage.id);
			}
		} else {
			const stages = t.pipeline.stages.map((s, i) => {
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
				};
			});
			pipelineId = (await ctx.db.insert("pipelines", {
				orgId: args.orgId,
				name: t.pipeline.name,
				entityType: "deal",
				isDefault: true,
				stages,
				createdAt: now,
				updatedAt: now,
			})) as unknown as string;
		}

		// ─── 2. Field definitions ────────────────────────────────────────
		let fieldsInserted = 0;
		if (t.fieldDefinitions) {
			for (const [entityType, defs] of Object.entries(t.fieldDefinitions)) {
				// Track per-entity max order so newly-seeded rows append cleanly.
				const existingForEntity = await ctx.db
					.query("fieldDefinitions")
					.withIndex("by_org_and_entity", (q) =>
						q.eq("orgId", args.orgId).eq("entityType", entityType),
					)
					.collect();
				const existingNames = new Set(existingForEntity.map((r) => r.name));
				let maxOrder = existingForEntity.reduce(
					(acc, r) => (r.order > acc ? r.order : acc),
					-1,
				);

				for (const def of defs ?? []) {
					if (existingNames.has(def.name)) continue;
					maxOrder += 1;

					// Resolve `showInStages` (template authors write codes;
					// we store stage ids so the field continues to work
					// after a stage rename).
					const resolvedShowInStages = def.showInStages
						?.map((code) => stageCodeToId.get(code))
						.filter((v): v is string => !!v);

					await ctx.db.insert("fieldDefinitions", {
						orgId: args.orgId,
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
					fieldsInserted += 1;
				}
			}
		}

		// ─── 3. Entity labels (merge into org doc) ───────────────────────
		let labelsApplied = false;
		if (t.entityLabels) {
			const org = await ctx.db.get(args.orgId);
			if (org) {
				const merged = {
					...(org.entityLabels ?? {}),
					...t.entityLabels,
				};
				await ctx.db.patch(args.orgId, {
					entityLabels: merged,
					industry: t.id,
					updatedAt: now,
				});
				labelsApplied = true;
			}
		} else {
			// At minimum, persist the industry id so we know which template
			// the org started with.
			const org = await ctx.db.get(args.orgId);
			if (org && org.industry !== t.id) {
				await ctx.db.patch(args.orgId, { industry: t.id, updatedAt: now });
			}
		}

		return {
			ok: true,
			templateId: t.id,
			pipelineId,
			fieldsInserted,
			labelsApplied,
		};
	},
});

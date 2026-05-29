/**
 * Industry-template definition validator — convex/_platform/industries/validators.ts
 *
 * Pure functions (no Convex ctx) that:
 *   1. Confirm the runtime shape of a `platformTemplates.definition`
 *      blob matches the `IndustryTemplate` interface.
 *   2. Cross-reference check: every `mockData.deals[].stageCode` exists
 *      in some `pipelines[*].stages[*].code`; every
 *      `mockData.contacts[].companyKey` /
 *      `mockData.deals[].companyKey` exists in `mockData.companies[].key`;
 *      every `mockData.notes[].anchorTo`
 *      / `mockData.tasks[].anchorTo` resolves; every category /
 *      tag reference resolves.
 *
 * Used by:
 *   - Stage 1: the seed migration sanity-checks every TS template before
 *     it inserts the row (catches drift between TS definitions + the
 *     validator).
 *   - Stage 2: the owner-panel `createTemplate` / `updateTemplate`
 *     mutations call `validateDefinition` before write — rejects the
 *     mutation with `INVALID_DEFINITION` carrying a `path` like
 *     `"definition.mockData.deals[2].stageCode"` so the editor UI can
 *     surface inline errors.
 *
 * Spec: INDUSTRY-TEMPLATES-DB-MIGRATION.md §3.3.
 */

import type { IndustryTemplate } from "../../crm/fields/templates/types";

// ─── Result shape ────────────────────────────────────────────────────────────

export type ValidationError = {
	/** Dot-path inside the `definition` blob (e.g. `"mockData.deals[2].stageCode"`). */
	path: string;
	/** Short human-readable reason — surfaced in toasts + inline form errors. */
	message: string;
};

export type ValidationResult = { valid: true } | { valid: false; errors: ValidationError[] };

// ─── Helpers ─────────────────────────────────────────────────────────────────

function isString(value: unknown): value is string {
	return typeof value === "string";
}

function isObject(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isArray(value: unknown): value is unknown[] {
	return Array.isArray(value);
}

// ─── Definition shape check ──────────────────────────────────────────────────

/**
 * Light shape check — verifies presence + scalar types of the slots we
 * actually consume in the seeder. We deliberately avoid deep-validating
 * every nested field of every slot because the runtime seeder is
 * already defensive (skip-if-exists, optional-chaining everywhere).
 *
 * The richer per-field validation (e.g. ensuring every `FieldDefSeed`
 * carries an `entityType`) lives inside the Stage 2 `createTemplate` /
 * `updateTemplate` editor — that's where typed UI inputs ALSO need to
 * surface field-level error messages.
 */
function validateDefinitionShape(
	def: unknown,
	errors: ValidationError[],
): def is Record<string, unknown> {
	if (!isObject(def)) {
		errors.push({ path: "definition", message: "Definition must be an object." });
		return false;
	}

	// ── Pipelines ────────────────────────────────────────────────────────
	if (def.pipeline !== undefined) {
		if (!isObject(def.pipeline)) {
			errors.push({
				path: "definition.pipeline",
				message: "When set, `pipeline` must be a `{ name, stages }` object.",
			});
		} else {
			if (!isString(def.pipeline.name)) {
				errors.push({
					path: "definition.pipeline.name",
					message: "Pipeline name is required and must be a string.",
				});
			}
			if (!isArray(def.pipeline.stages)) {
				errors.push({
					path: "definition.pipeline.stages",
					message: "Pipeline must have a `stages` array.",
				});
			}
		}
	}
	if (def.pipelines !== undefined) {
		if (!isArray(def.pipelines)) {
			errors.push({
				path: "definition.pipelines",
				message: "When set, `pipelines` must be an array.",
			});
		} else {
			def.pipelines.forEach((p, i) => {
				if (!isObject(p)) {
					errors.push({
						path: `definition.pipelines[${i}]`,
						message: "Pipeline entry must be an object.",
					});
					return;
				}
				if (!isString(p.entityType)) {
					errors.push({
						path: `definition.pipelines[${i}].entityType`,
						message: "Pipeline entityType must be a string.",
					});
				}
				if (!isString(p.name)) {
					errors.push({
						path: `definition.pipelines[${i}].name`,
						message: "Pipeline name must be a string.",
					});
				}
				if (!isArray(p.stages)) {
					errors.push({
						path: `definition.pipelines[${i}].stages`,
						message: "Pipeline stages must be an array.",
					});
				}
			});
		}
	}

	// ── AI persona ───────────────────────────────────────────────────────
	if (def.aiPersona !== undefined && !isString(def.aiPersona)) {
		errors.push({
			path: "definition.aiPersona",
			message: "AI persona must be a string when set.",
		});
	}

	// ── Dashboard layout (Stage 4 of DASHBOARD-V2-PLAN.md) ───────────────
	// Light shape check only — heavier `validateDashboardLayoutShape`
	// in `_shared/widgetRegistry.ts` runs at the template-row write
	// boundary AND at the dashboard render boundary.
	if (def.dashboardLayout !== undefined) {
		if (!isObject(def.dashboardLayout)) {
			errors.push({
				path: "definition.dashboardLayout",
				message: "dashboardLayout must be an object when set.",
			});
		} else {
			const layout = def.dashboardLayout as Record<string, unknown>;
			if (!isArray(layout.panels)) {
				errors.push({
					path: "definition.dashboardLayout.panels",
					message: "dashboardLayout.panels is required and must be an array.",
				});
			} else {
				layout.panels.forEach((p, i) => {
					if (!isObject(p)) {
						errors.push({
							path: `definition.dashboardLayout.panels[${i}]`,
							message: "panel must be an object.",
						});
						return;
					}
					if (!isString(p.id)) {
						errors.push({
							path: `definition.dashboardLayout.panels[${i}].id`,
							message: "panel id is required.",
						});
					}
					if (p.span !== 1 && p.span !== 2 && p.span !== 3) {
						errors.push({
							path: `definition.dashboardLayout.panels[${i}].span`,
							message: "panel span must be 1, 2, or 3.",
						});
					}
					if (!isString(p.widget)) {
						errors.push({
							path: `definition.dashboardLayout.panels[${i}].widget`,
							message: "panel widget must be a string.",
						});
					}
				});
			}
			if (layout.metrics !== undefined && !isArray(layout.metrics)) {
				errors.push({
					path: "definition.dashboardLayout.metrics",
					message: "dashboardLayout.metrics must be an array of widget keys when set.",
				});
			}
			if (layout.hero !== undefined && !isString(layout.hero)) {
				errors.push({
					path: "definition.dashboardLayout.hero",
					message: "dashboardLayout.hero must be a string when set.",
				});
			}
			if (layout.forecast !== undefined) {
				if (!isObject(layout.forecast)) {
					errors.push({
						path: "definition.dashboardLayout.forecast",
						message: "dashboardLayout.forecast must be an object when set.",
					});
				} else {
					const cb = (layout.forecast as Record<string, unknown>).coverageBands;
					if (cb !== undefined) {
						if (!isObject(cb)) {
							errors.push({
								path: "definition.dashboardLayout.forecast.coverageBands",
								message: "coverageBands must be an object.",
							});
						} else {
							const c = cb as Record<string, unknown>;
							if (typeof c.healthy !== "number" || typeof c.warning !== "number") {
								errors.push({
									path: "definition.dashboardLayout.forecast.coverageBands",
									message:
										"coverageBands.healthy + coverageBands.warning must be numbers.",
								});
							} else if (c.healthy <= c.warning) {
								errors.push({
									path: "definition.dashboardLayout.forecast.coverageBands",
									message:
										"coverageBands.healthy must be greater than coverageBands.warning.",
								});
							}
						}
					}
				}
			}
		}
	}

	return errors.length === 0;
}

// ─── Cross-reference helpers ─────────────────────────────────────────────────

function collectStageCodes(def: Record<string, unknown>): Set<string> {
	const codes = new Set<string>();
	if (isObject(def.pipeline) && isArray(def.pipeline.stages)) {
		for (const stage of def.pipeline.stages) {
			if (isObject(stage) && isString(stage.code)) codes.add(stage.code);
		}
	}
	if (isArray(def.pipelines)) {
		for (const p of def.pipelines) {
			if (isObject(p) && isArray(p.stages)) {
				for (const stage of p.stages) {
					if (isObject(stage) && isString(stage.code)) codes.add(stage.code);
				}
			}
		}
	}
	return codes;
}

function collectCompanyKeys(def: Record<string, unknown>): Set<string> {
	const keys = new Set<string>();
	if (isObject(def.mockData) && isArray(def.mockData.companies)) {
		for (const c of def.mockData.companies) {
			if (isObject(c) && isString(c.key)) keys.add(c.key);
		}
	}
	return keys;
}

function collectDisplayNames(
	def: Record<string, unknown>,
	bucket: "leads" | "contacts",
): Set<string> {
	const names = new Set<string>();
	if (isObject(def.mockData) && isArray(def.mockData[bucket])) {
		for (const r of def.mockData[bucket]) {
			if (isObject(r) && isString(r.displayName)) names.add(r.displayName);
		}
	}
	return names;
}

function collectDealTitles(def: Record<string, unknown>): Set<string> {
	const titles = new Set<string>();
	if (isObject(def.mockData) && isArray(def.mockData.deals)) {
		for (const d of def.mockData.deals) {
			if (isObject(d) && isString(d.title)) titles.add(d.title);
		}
	}
	return titles;
}

function collectNoteCategoryNames(def: Record<string, unknown>): Set<string> {
	const names = new Set<string>();
	if (isArray(def.noteCategories)) {
		for (const c of def.noteCategories) {
			if (isObject(c) && isString(c.name)) names.add(c.name);
		}
	}
	return names;
}

function collectTagNames(def: Record<string, unknown>): Set<string> {
	const names = new Set<string>();
	if (isArray(def.tags)) {
		for (const t of def.tags) {
			if (isObject(t) && isString(t.name)) names.add(t.name);
		}
	}
	return names;
}

// ─── Cross-reference validation ──────────────────────────────────────────────

function validateCrossReferences(def: Record<string, unknown>, errors: ValidationError[]): void {
	const stageCodes = collectStageCodes(def);
	const companyKeys = collectCompanyKeys(def);
	const leadNames = collectDisplayNames(def, "leads");
	const contactNames = collectDisplayNames(def, "contacts");
	const dealTitles = collectDealTitles(def);
	const noteCategoryNames = collectNoteCategoryNames(def);
	const tagNames = collectTagNames(def);

	if (!isObject(def.mockData)) return;

	// mockData.contacts → companies
	if (isArray(def.mockData.contacts)) {
		def.mockData.contacts.forEach((c, i) => {
			if (!isObject(c)) return;
			if (isString(c.companyKey) && !companyKeys.has(c.companyKey)) {
				errors.push({
					path: `definition.mockData.contacts[${i}].companyKey`,
					message: `Unknown companyKey "${c.companyKey}" — not present in mockData.companies.`,
				});
			}
			if (isArray(c.tags)) {
				c.tags.forEach((tag, j) => {
					if (isString(tag) && !tagNames.has(tag)) {
						errors.push({
							path: `definition.mockData.contacts[${i}].tags[${j}]`,
							message: `Unknown tag "${tag}" — not present in template.tags.`,
						});
					}
				});
			}
		});
	}

	// mockData.leads → tags
	if (isArray(def.mockData.leads)) {
		def.mockData.leads.forEach((l, i) => {
			if (!isObject(l)) return;
			if (isArray(l.tags)) {
				l.tags.forEach((tag, j) => {
					if (isString(tag) && !tagNames.has(tag)) {
						errors.push({
							path: `definition.mockData.leads[${i}].tags[${j}]`,
							message: `Unknown tag "${tag}" — not present in template.tags.`,
						});
					}
				});
			}
		});
	}

	// mockData.deals → companies, contacts, stageCode, tags
	if (isArray(def.mockData.deals)) {
		def.mockData.deals.forEach((d, i) => {
			if (!isObject(d)) return;
			if (isString(d.stageCode) && !stageCodes.has(d.stageCode)) {
				errors.push({
					path: `definition.mockData.deals[${i}].stageCode`,
					message: `Unknown stageCode "${d.stageCode}" — not present in any pipeline's stages.`,
				});
			}
			if (isString(d.companyKey) && !companyKeys.has(d.companyKey)) {
				errors.push({
					path: `definition.mockData.deals[${i}].companyKey`,
					message: `Unknown companyKey "${d.companyKey}" — not present in mockData.companies.`,
				});
			}
			if (isString(d.contactDisplayName) && !contactNames.has(d.contactDisplayName)) {
				errors.push({
					path: `definition.mockData.deals[${i}].contactDisplayName`,
					message: `Unknown contactDisplayName "${d.contactDisplayName}" — not present in mockData.contacts.`,
				});
			}
			if (isArray(d.tags)) {
				d.tags.forEach((tag, j) => {
					if (isString(tag) && !tagNames.has(tag)) {
						errors.push({
							path: `definition.mockData.deals[${i}].tags[${j}]`,
							message: `Unknown tag "${tag}" — not present in template.tags.`,
						});
					}
				});
			}
		});
	}

	// mockData.notes → categoryName + anchorTo
	if (isArray(def.mockData.notes)) {
		def.mockData.notes.forEach((n, i) => {
			if (!isObject(n)) return;
			if (isString(n.categoryName) && !noteCategoryNames.has(n.categoryName)) {
				errors.push({
					path: `definition.mockData.notes[${i}].categoryName`,
					message: `Unknown categoryName "${n.categoryName}" — not present in template.noteCategories.`,
				});
			}
			validateAnchor(
				n.anchorTo,
				`definition.mockData.notes[${i}].anchorTo`,
				{
					leadNames,
					contactNames,
					dealTitles,
					companyKeys,
				},
				errors,
			);
		});
	}

	// mockData.tasks → anchorTo
	if (isArray(def.mockData.tasks)) {
		def.mockData.tasks.forEach((t, i) => {
			if (!isObject(t)) return;
			validateAnchor(
				t.anchorTo,
				`definition.mockData.tasks[${i}].anchorTo`,
				{
					leadNames,
					contactNames,
					dealTitles,
					companyKeys,
				},
				errors,
			);
		});
	}
}

type AnchorRefSets = {
	leadNames: Set<string>;
	contactNames: Set<string>;
	dealTitles: Set<string>;
	companyKeys: Set<string>;
};

function validateAnchor(
	anchor: unknown,
	path: string,
	refs: AnchorRefSets,
	errors: ValidationError[],
): void {
	if (anchor === undefined || anchor === null) return;
	if (!isObject(anchor)) {
		errors.push({ path, message: "anchorTo must be an object when set." });
		return;
	}
	const kind = anchor.kind;
	switch (kind) {
		case "lead": {
			if (!isString(anchor.displayName) || !refs.leadNames.has(anchor.displayName)) {
				errors.push({
					path: `${path}.displayName`,
					message: `Unknown lead displayName "${String(anchor.displayName)}".`,
				});
			}
			return;
		}
		case "contact": {
			if (!isString(anchor.displayName) || !refs.contactNames.has(anchor.displayName)) {
				errors.push({
					path: `${path}.displayName`,
					message: `Unknown contact displayName "${String(anchor.displayName)}".`,
				});
			}
			return;
		}
		case "deal": {
			if (!isString(anchor.title) || !refs.dealTitles.has(anchor.title)) {
				errors.push({
					path: `${path}.title`,
					message: `Unknown deal title "${String(anchor.title)}".`,
				});
			}
			return;
		}
		case "company": {
			if (!isString(anchor.companyKey) || !refs.companyKeys.has(anchor.companyKey)) {
				errors.push({
					path: `${path}.companyKey`,
					message: `Unknown companyKey "${String(anchor.companyKey)}".`,
				});
			}
			return;
		}
		default:
			errors.push({
				path: `${path}.kind`,
				message: `anchorTo.kind must be one of "lead" | "contact" | "deal" | "company" — got "${String(kind)}".`,
			});
	}
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Validate a `platformTemplates.definition` blob.
 *
 * Returns `{ valid: true }` when the blob passes BOTH the shape check
 * AND the cross-reference check. Otherwise returns the union of all
 * errors found — never short-circuits, so the editor UI can surface
 * every problem at once.
 */
export function validateDefinition(definition: unknown): ValidationResult {
	const errors: ValidationError[] = [];
	const ok = validateDefinitionShape(definition, errors);
	if (ok) {
		validateCrossReferences(definition, errors);
	}
	return errors.length === 0 ? { valid: true } : { valid: false, errors };
}

/**
 * Convenience — pull the `definition` shape from an `IndustryTemplate`
 * literal at compile time. Used by the seed migration so the TS
 * templates' top-level identity fields (`id`, `label`, etc.) are
 * cleanly separated from the JSON `definition` blob.
 */
export function definitionFromTemplate(template: IndustryTemplate): {
	definition: Record<string, unknown>;
	identity: Pick<IndustryTemplate, "id" | "label" | "description" | "icon" | "region">;
} {
	const {
		id,
		label,
		description,
		icon,
		region,
		// every other slot is part of the definition blob
		defaults,
		entityLabels,
		entityVisibility,
		codePrefixes,
		pipeline,
		pipelines,
		fieldDefinitions,
		modules,
		noteCategories,
		tags,
		taskDefaults,
		briefingDefaults,
		fileUpload,
		aiPersona,
		dashboardMetrics,
		navHiddenSlots,
		customRoles,
		savedViews,
		mockData,
		dashboardLayout,
	} = template;

	const definition: Record<string, unknown> = {};
	if (defaults !== undefined) definition.defaults = defaults;
	if (entityLabels !== undefined) definition.entityLabels = entityLabels;
	if (entityVisibility !== undefined) definition.entityVisibility = entityVisibility;
	if (codePrefixes !== undefined) definition.codePrefixes = codePrefixes;
	if (pipeline !== undefined) definition.pipeline = pipeline;
	if (pipelines !== undefined) definition.pipelines = pipelines;
	if (fieldDefinitions !== undefined) definition.fieldDefinitions = fieldDefinitions;
	if (modules !== undefined) definition.modules = modules;
	if (noteCategories !== undefined) definition.noteCategories = noteCategories;
	if (tags !== undefined) definition.tags = tags;
	if (taskDefaults !== undefined) definition.taskDefaults = taskDefaults;
	if (briefingDefaults !== undefined) definition.briefingDefaults = briefingDefaults;
	if (fileUpload !== undefined) definition.fileUpload = fileUpload;
	if (aiPersona !== undefined) definition.aiPersona = aiPersona;
	if (dashboardMetrics !== undefined) definition.dashboardMetrics = dashboardMetrics;
	if (dashboardLayout !== undefined) definition.dashboardLayout = dashboardLayout;
	if (navHiddenSlots !== undefined) definition.navHiddenSlots = navHiddenSlots;
	if (customRoles !== undefined) definition.customRoles = customRoles;
	if (savedViews !== undefined) definition.savedViews = savedViews;
	if (mockData !== undefined) definition.mockData = mockData;

	return {
		definition,
		identity: { id, label, description, icon, region },
	};
}

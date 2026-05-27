// @ts-nocheck — ctx.db is typed as any; index callback params are implicitly any
/**
 * Pipeline Helpers — convex/crm/fields/pipelines/helpers.ts
 *
 * Internal utilities used by pipelines mutations, deals mutations, and the
 * settings UI. Pure functions where possible; ctx-using helpers where
 * unavoidable (e.g. `getDefaultStageId` reads the pipeline doc).
 *
 * Stage-code rules (required field, see `MODULE.md`):
 *   - Format: `^[A-Z0-9_-]{2,16}$`
 *   - Unique within a single pipeline.
 *   - Owner-typed; auto-suggested from the stage name on creation.
 *   - Reserved suggestions for final stages: WON / LOST / DONE.
 */
import type { Id } from "../../../_generated/dataModel";

// ─── Stage-code helpers ─────────────────────────────────────────────────────

/**
 * Derive a stage code from a stage shape, ensuring uniqueness within the
 * pipeline.
 *
 * Priority order:
 *   1. Final-stage reserved codes (WON / LOST / DONE) when free.
 *   2. First 3 alphanumeric chars of `name`, uppercased.
 *   3. If collision: append numeric suffix (2, 3, …) until unique.
 *   4. Fall back to `STG{n}` if the name has no usable characters.
 *
 * Used by:
 *   - `pipelines.mutations.ts::addStage` — auto-suggest when not provided.
 *   - Settings UI placeholder text.
 *   - `convex/_platform/industries/builtIns/*.ts` (built-in template
 *     bootstrap fixtures — codes are static there; this helper is the
 *     runtime fallback for owner-typed codes only).
 */
export function deriveStageCode(
	stage: { name: string; isFinal?: boolean; finalType?: string },
	usedCodes: Set<string>,
): string {
	// Reserved finals
	if (stage.isFinal) {
		const reserved =
			stage.finalType === "positive"
				? "WON"
				: stage.finalType === "negative"
					? "LOST"
					: "DONE";
		if (!usedCodes.has(reserved)) return reserved;
	}

	const cleaned = (stage.name ?? "").replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
	let base = cleaned.slice(0, 3) || "STG";
	if (base.length > 16) base = base.slice(0, 16);

	if (!usedCodes.has(base)) return base;

	for (let n = 2; n < 100; n++) {
		const candidate = `${base}${n}`.slice(0, 16);
		if (!usedCodes.has(candidate)) return candidate;
	}

	// Pathological fallback (>100 collisions on a 3-char prefix)
	return `STG${Date.now() % 1000}`;
}

/**
 * Validate a user-typed stage code.
 *   - 2 to 16 chars
 *   - [A-Z0-9_-] only (uppercase letters, digits, underscore, hyphen)
 *   - Unique within `usedCodes` (caller passes the codes of OTHER stages)
 *
 * Returns `null` if valid, error string if not.
 */
export function validateStageCode(code: string, usedCodes: Set<string>): string | null {
	if (typeof code !== "string" || code.length === 0) return "Code is required";
	if (!/^[A-Z0-9_-]{2,16}$/.test(code)) {
		return "Code must be 2–16 chars, uppercase letters, numbers, _ or -";
	}
	if (usedCodes.has(code)) return "Code already used in this pipeline";
	return null;
}

// ─── Stage-aware required-field helpers ────────────────────────────────────

/**
 * Return the set of `fieldDefinitions` that are
 *   1) `required === true`
 *   2) `showInStages` includes the target stage id (or is empty/undefined,
 *      meaning the field shows on every stage and therefore on this one too)
 *   3) NOT `hidden`
 *   4) NOT `protected` AND `system === false` IS NOT enforced — we treat
 *      every required field uniformly. Stage-aware enforcement applies to
 *      whatever the admin marked as required, system or custom.
 *
 * Used by `deals.moveToStage` to decide whether to block / warn / proceed
 * based on the pipeline's `stageTransitionPolicy`.
 *
 * @returns the array of `fieldDefinitions` rows that the admin requires at
 * the given stage. Caller compares against the deal's filled values
 * (column data + fieldValues) to find the missing subset.
 */
export async function getRequiredFieldsForStage(
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	ctx: { db: any },
	args: {
		orgId: Id<"orgs">;
		entityType: string;
		stageId: string;
	},
): Promise<
	Array<{
		_id: Id<"fieldDefinitions">;
		name: string;
		label: string;
		type: string;
		kind?: string;
		columnKey?: string;
		storage?: string;
	}>
> {
	const fields = await ctx.db
		.query("fieldDefinitions")
		.withIndex("by_org_and_entity", (q: { eq: (k: string, v: unknown) => unknown }) =>
			q.eq("orgId", args.orgId).eq("entityType", args.entityType),
		)
		.collect();

	return fields.filter((f: { required?: boolean; hidden?: boolean; showInStages?: string[] }) => {
		if (f.hidden === true) return false;
		if (!f.required) return false;
		// Empty / missing showInStages means "show everywhere" → applies here.
		if (!f.showInStages || f.showInStages.length === 0) return true;
		return f.showInStages.includes(args.stageId);
	});
}

/**
 * Pure helper — given a deal-shaped object, the deal's `fieldValues` rows,
 * and the list of required field defs at the target stage, return the
 * subset whose values are missing or empty.
 *
 * "Missing" rules:
 *   - `storage === "column"` → the value lives on the deal row at
 *     `columnKey` (e.g. `value`, `expectedCloseDate`). Missing if undefined,
 *     null, empty string, or 0 for numeric `currency` / `number` types.
 *   - Otherwise → look up the value in `fieldValuesByName`. Missing if the
 *     map has no entry, or the entry is undefined / null / "" / [].
 */
export function pickMissingFields(args: {
	deal: Record<string, unknown>;
	fieldValuesByName: Record<string, unknown>;
	requiredFields: Array<{
		_id: Id<"fieldDefinitions">;
		name: string;
		label: string;
		type: string;
		kind?: string;
		columnKey?: string;
		storage?: string;
	}>;
}): Array<{ _id: Id<"fieldDefinitions">; name: string; label: string; type: string }> {
	const missing: Array<{
		_id: Id<"fieldDefinitions">;
		name: string;
		label: string;
		type: string;
	}> = [];
	for (const f of args.requiredFields) {
		const isColumn = f.storage === "column" && f.columnKey;
		const raw = isColumn ? args.deal[f.columnKey as string] : args.fieldValuesByName[f.name];
		if (raw === undefined || raw === null) {
			missing.push({ _id: f._id, name: f.name, label: f.label, type: f.type });
			continue;
		}
		if (typeof raw === "string" && raw.trim() === "") {
			missing.push({ _id: f._id, name: f.name, label: f.label, type: f.type });
			continue;
		}
		if (Array.isArray(raw) && raw.length === 0) {
			missing.push({ _id: f._id, name: f.name, label: f.label, type: f.type });
		}
	}
	return missing;
}

// ─── Existing helpers ───────────────────────────────────────────────────────

/**
 * Stage-aware "fillable fields" lookup — for the `+` shortcut + Edit drawer
 * (round 4, Option A).
 *
 * Returns every visible `fieldDefinitions` row whose `showInStages`
 * includes `stageId`, regardless of `required`. Read-only kinds
 * (`personCode`, `entityCode`, `stage`) are excluded so the caller never
 * tries to render them as fillable inputs.
 *
 * Crucially this does NOT filter by `required` — Option A's contract is
 * "any empty pinned-to-this-stage field counts as fillable from the `+`".
 * The transition-policy gate (`getRequiredFieldsForStage` + `moveToStage`
 * blocking) keeps using the `required` check because that's the admin's
 * "must be filled to advance" rule, which is a separate semantic.
 */
export async function getStagePinnedFields(
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	ctx: { db: any },
	args: {
		orgId: Id<"orgs">;
		entityType: string;
		stageId: string;
	},
): Promise<
	Array<{
		_id: Id<"fieldDefinitions">;
		name: string;
		label: string;
		type: string;
		kind?: string;
		columnKey?: string;
		storage?: string;
	}>
> {
	const fields = await ctx.db
		.query("fieldDefinitions")
		.withIndex("by_org_and_entity", (q: { eq: (k: string, v: unknown) => unknown }) =>
			q.eq("orgId", args.orgId).eq("entityType", args.entityType),
		)
		.collect();

	return fields.filter(
		(f: { hidden?: boolean; kind?: string; storage?: string; showInStages?: string[] }) => {
			if (f.hidden === true) return false;
			// Server-generated, read-only kinds — never fillable in any form.
			if (f.kind === "personCode" || f.kind === "entityCode") return false;
			if (f.kind === "stage") return false;
			// Join-storage fields (today: tags) live in dedicated tables
			// (`entityTags` for tags) and are managed by their own UI cells
			// (`<TagsCell>`). They are organisational metadata, not stage-aware
			// data — so they MUST NOT participate in the `+` gate or the
			// Edit form's stage scoping. The empty-check we use against
			// `fieldValuesByName` can't see join rows anyway, which would
			// always count tags as empty and keep the `+` button stuck on.
			if (f.storage === "join") return false;
			if (f.kind === "tags") return false;
			// Empty / missing showInStages means "not pinned anywhere" (locked
			// 2026-05-20 rule). Such fields are migrated onto the Default
			// stage by `pinDealFieldsToDefaultStage`; if any sneak through,
			// they're invisible to stage-scoped UI.
			if (!f.showInStages || f.showInStages.length === 0) return false;
			return f.showInStages.includes(args.stageId);
		},
	);
}

/**
 * Pure helper — given a deal-shaped object, its `fieldValues` rows, and a
 * list of pinned field defs at the target stage, return the subset whose
 * values are empty.
 *
 * Same "empty" semantics as `pickMissingFields` (undefined / null / "" /
 * empty array). Used by `+` gate + form scoping (round 4 Option A).
 *
 * For `type: "file"` / `type: "files"` fields, emptiness is determined by
 * `fileCountsByFieldKey` (count of rows in the `files` table for that
 * fieldKey). These fields don't store in `fieldValues` — they store in the
 * `files` table under `scope=deal, scopeId=dealCode, fieldKey=field.name`.
 */
export function pickEmptyPinnedFields(args: {
	deal: Record<string, unknown>;
	fieldValuesByName: Record<string, unknown>;
	pinnedFields: Array<{
		_id: Id<"fieldDefinitions">;
		name: string;
		label: string;
		type: string;
		kind?: string;
		columnKey?: string;
		storage?: string;
	}>;
	/** Count of files per fieldKey for this deal. Keyed by field.name. */
	fileCountsByFieldKey?: Record<string, number>;
}): Array<{ _id: Id<"fieldDefinitions">; name: string; label: string; type: string }> {
	const empty: Array<{
		_id: Id<"fieldDefinitions">;
		name: string;
		label: string;
		type: string;
	}> = [];
	for (const f of args.pinnedFields) {
		// File-type fields: check the files table count, not fieldValues.
		if (f.type === "file" || f.type === "files") {
			const count = args.fileCountsByFieldKey?.[f.name] ?? 0;
			if (count === 0) {
				empty.push({ _id: f._id, name: f.name, label: f.label, type: f.type });
			}
			continue;
		}
		const isColumn = f.storage === "column" && f.columnKey;
		const raw = isColumn ? args.deal[f.columnKey as string] : args.fieldValuesByName[f.name];
		if (raw === undefined || raw === null) {
			empty.push({ _id: f._id, name: f.name, label: f.label, type: f.type });
			continue;
		}
		if (typeof raw === "string" && raw.trim() === "") {
			empty.push({ _id: f._id, name: f.name, label: f.label, type: f.type });
			continue;
		}
		if (Array.isArray(raw) && raw.length === 0) {
			empty.push({ _id: f._id, name: f.name, label: f.label, type: f.type });
		}
	}
	return empty;
}

/**
 * Get the first stage ID of a pipeline (used as default when creating a deal).
 * Returns undefined if pipeline has no stages.
 *
 * Default-stage rule
 * ──────────────────
 * If the pipeline has a stage with `isDefaultStage: true` (the auto-created
 * "Default" stage), return its id. New deals always start in this stage and
 * its required fields are the only ones the create form has to fill.
 *
 * Backwards-compat fallback (old pipelines that pre-date the Default stage):
 * the first non-final stage by `order`.
 */
export async function getDefaultStageId(
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	ctx: { db: any },
	pipelineId: Id<"pipelines">,
): Promise<string | undefined> {
	const pipeline = await ctx.db.get(pipelineId);
	if (!pipeline || pipeline.stages.length === 0) return undefined;
	const defaultStage = pipeline.stages.find(
		(s: { isDefaultStage?: boolean }) => s.isDefaultStage === true,
	);
	if (defaultStage) return defaultStage.id;
	const sorted = [...pipeline.stages].sort(
		(a: { order: number }, b: { order: number }) => a.order - b.order,
	);
	// Prefer the first non-final stage (a deal shouldn't start in WON/LOST)
	const nonFinal = sorted.find((s: { isFinal?: boolean }) => !s.isFinal);
	return (nonFinal ?? sorted[0]).id;
}

/**
 * Pure helper — return the index of a stage (sorted by `order`) inside a
 * pipeline, or -1 if not found. The server uses this to compute "is the
 * deal advancing exactly one stage" for the `allowSkipStages` flag.
 */
export function getStageIndex(
	pipeline: { stages: Array<{ id: string; order: number }> } | null | undefined,
	stageId: string,
): number {
	if (!pipeline) return -1;
	const sorted = [...pipeline.stages].sort((a, b) => a.order - b.order);
	return sorted.findIndex((s) => s.id === stageId);
}

/**
 * Validate that a stage transition is allowed.
 * Blocks final→final transitions (e.g., Won→Lost).
 * Returns an error message string, or null if transition is valid.
 */
export async function validateStageTransition(
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	ctx: { db: any },
	pipelineId: Id<"pipelines">,
	fromStageId: string,
	toStageId: string,
): Promise<string | null> {
	const pipeline = await ctx.db.get(pipelineId);
	if (!pipeline) return "Pipeline not found";

	const fromStage = pipeline.stages.find((s) => s.id === fromStageId);
	const toStage = pipeline.stages.find((s) => s.id === toStageId);

	if (!toStage) return "Target stage not found in pipeline";
	if (fromStage?.isFinal && toStage.isFinal) {
		return "Cannot move between final stages";
	}
	return null;
}

// ─── Backwards-compat shim for `seedFromTemplate` ──────────────────────────

/**
 * Backwards-compat wrapper around the new DB-backed `platformTemplates`
 * table. Returns a pipeline-shaped seed (name + entityType + stages
 * with codes) for the given templateKey, or `undefined` when the row
 * doesn't exist / has no pipeline data.
 *
 * As of Stage 1 of INDUSTRY-TEMPLATES-DB-MIGRATION.md (2026-05-27)
 * this helper is async and reads from the DB. Currently has zero
 * runtime callers — kept as a back-compat shim per
 * `pipelines/MODULE.md` decision #4. Newer callers should use
 * `setupWorkspaceFromTemplate` from `convex/crm/fields/templates/mutations.ts`,
 * which seeds the FULL workspace (pipelines + fields + entity labels +
 * mock data + …) in one atomic transaction.
 */
export type PipelineTemplate = {
	name: string;
	entityType: string;
	stages: Array<{
		name: string;
		code: string;
		color?: string;
		order: number;
		isFinal?: boolean;
		finalType?: "positive" | "negative" | "neutral";
		staleAfterDays?: number;
	}>;
};

export async function seedFromTemplate(
	ctx: { db: any },
	templateKey: string,
): Promise<PipelineTemplate | undefined> {
	const row = await ctx.db
		.query("platformTemplates")
		.withIndex("by_templateKey", (q: { eq: (k: string, v: unknown) => unknown }) =>
			q.eq("templateKey", templateKey),
		)
		.unique();
	if (!row) return undefined;
	const def = (row.definition ?? {}) as {
		pipeline?: { name?: string; stages?: unknown[] };
		pipelines?: Array<{
			entityType?: string;
			name?: string;
			stages?: unknown[];
		}>;
	};

	// Prefer the legacy single-pipeline shape when present; fall back to
	// the first deal-typed entry of the new `pipelines: [...]` array.
	const single = def.pipeline;
	if (single?.name && Array.isArray(single.stages)) {
		return {
			name: single.name,
			entityType: "deal",
			stages: shapeStages(single.stages),
		};
	}

	const dealPipeline = def.pipelines?.find((p) => p.entityType === "deal");
	if (!dealPipeline?.name || !Array.isArray(dealPipeline.stages)) {
		return undefined;
	}
	return {
		name: dealPipeline.name,
		entityType: dealPipeline.entityType ?? "deal",
		stages: shapeStages(dealPipeline.stages),
	};
}

function shapeStages(stages: unknown[]): PipelineTemplate["stages"] {
	return stages.map((s, i) => {
		const stage = s as {
			name?: string;
			code?: string;
			color?: string;
			isFinal?: boolean;
			finalType?: "positive" | "negative" | "neutral";
			staleAfterDays?: number;
		};
		return {
			name: stage.name ?? `Stage ${i + 1}`,
			code: stage.code ?? `STG${i + 1}`,
			color: stage.color,
			order: i,
			isFinal: stage.isFinal,
			finalType: stage.finalType,
			staleAfterDays: stage.staleAfterDays,
		};
	});
}

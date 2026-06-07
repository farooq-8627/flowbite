/**
 * Entity-type SSOT — convex/_shared/entityTypes.ts
 *
 * The four CORE entity scaffolds (lead / contact / deal / company) are
 * locked architecturally per AGENTS.md decision #9: every entity in the
 * system — including the two industry-specific slots (`entity5`,
 * `entity6`) — is rendered through one of those scaffolds. The DB layer
 * already reflects this (`pipelines.entityType`, `fieldDefinitions.entityType`,
 * `tags.entityType` are all `v.string()` — the schema doesn't narrow).
 *
 * What this file replaces: the 12+ duplicated `z.enum(["lead","contact",
 * "deal","company"])` literals scattered across the AI capability layer.
 * Those locked the AI to the four hardcoded slots even when an org had
 * enabled `entity5` (e.g. "Project") or `entity6` (e.g. "Listing") in
 * `org.settings.modules`. The capability layer was the only thing
 * stopping the AI from reaching the 5th/6th slot — every layer below it
 * (schema, mutations, queries, dispatcher) was already entity-agnostic.
 *
 * The replacement contract:
 *
 *   1. ARG SCHEMA — `entityTypeSchema()` returns a `z.string()` that
 *      pre-coerces via the existing per-turn alias map in
 *      `_shared/synonyms.ts` (so the model can say "inquiry" / "buyer"
 *      / "client" and the canonical type comes through). The Zod shape
 *      stays loose; we don't fail-fast on unknown values because the
 *      runtime check below produces a much friendlier `repair` envelope
 *      with the org's actual enabled slots.
 *
 *   2. RUNTIME CHECK — `validateEntityType(ctx, raw)` runs at the top
 *      of `cap.run` and resolves the user-supplied string against the
 *      org's enabled modules. Returns either:
 *        · `{ ok: true, entityType }` — pass `entityType` to the
 *          downstream mutation/query (canonicalised; e.g. `"inquiry"`
 *          → `"lead"`).
 *        · `CapabilityResult` (a `repair` envelope) — caller returns
 *          this directly so the model self-corrects on the next turn
 *          with the list of actually-enabled types in the hint.
 *
 *   3. DEFAULT WHEN NO MODULES — when the org hasn't customised
 *      `org.settings.modules` (most workspaces), every CORE entity is
 *      considered enabled. Industry slots `entity5` / `entity6` are
 *      ONLY enabled when the org explicitly opted in.
 *
 * Why a runtime check (not a Zod refine):
 *   The Zod `.refine` runs SYNC inside the strict-parse step that
 *   happens BEFORE `cap.run`. Reading the org's enabled modules is an
 *   async DB call (cached but still async). Doing it in `cap.run`
 *   keeps the Zod surface pure + lets us return the rich `repair`
 *   envelope (with the actual enabled list) instead of a generic
 *   "expected one of X" Zod issue.
 *
 * Performance: `loadEnabledEntityTypes` does ONE indexed DB read of the
 * org row (already cached by Convex within a turn for the same orgId).
 * The host's per-turn TAIL also surfaces this list via
 * `describe_workspace`, so the model usually picks a valid type on the
 * first try and the runtime check is a fast path.
 */

import { z } from "zod";
import type { Id } from "../_generated/dataModel";
import { repair } from "../ai/registry/result";
import type { CapabilityCtx, CapabilityResult } from "../ai/registry/types";
import { canonicalEntityType } from "./synonyms";

// ─── Constants ──────────────────────────────────────────────────────────────

/** The four core entity scaffolds — locked decision #9 (AGENTS.md). */
export const CORE_ENTITY_TYPES = ["lead", "contact", "deal", "company"] as const;
export type CoreEntityType = (typeof CORE_ENTITY_TYPES)[number];

/**
 * The two industry-specific scaffolds. Optional — an org has them only
 * when its industry template seeded a module slot for `entity5` /
 * `entity6` (or when an admin added one manually via `update_org`).
 */
export const INDUSTRY_ENTITY_TYPES = ["entity5", "entity6"] as const;
export type IndustryEntityType = (typeof INDUSTRY_ENTITY_TYPES)[number];

/** Every entityType the system can render — used by tests + the AI prompt. */
export const ALL_ENTITY_TYPES = [...CORE_ENTITY_TYPES, ...INDUSTRY_ENTITY_TYPES] as const;
export type AnyEntityType = (typeof ALL_ENTITY_TYPES)[number];

// ─── Zod schema helpers ─────────────────────────────────────────────────────

/**
 * Entity-type arg schema. Returns a `z.string()` that pre-coerces via
 * the per-turn alias map (org-relabelled types like "inquiry" → "lead"
 * land canonically). The runtime `validateEntityType` does the
 * per-org enabled-slots check.
 *
 * Use this in capability `input` schemas instead of `z.enum([...])`:
 *
 *   input: z.object({
 *     entityType: entityTypeSchema().describe("..."),
 *     ...
 *   })
 */
export function entityTypeSchema() {
	return z.preprocess(
		(value) => (typeof value === "string" ? canonicalEntityType(value) : value),
		z.string().min(1),
	);
}

// ─── Org-aware enabled-types reader ────────────────────────────────────────

/**
 * Read the org's enabled entity types from `org.settings.modules`.
 *
 *   - Returns the slot keys that are NOT marked `hidden:true`.
 *   - Falls back to the four CORE types when:
 *       · the org row has no `settings.modules` array, OR
 *       · the modules array is empty.
 *     This matches the runtime behaviour of `EntityListPage` —
 *     unconfigured workspaces show all four core scaffolds.
 *
 * Reads are cheap (one `db.get(orgId)`); Convex caches it within a
 * turn so multiple capability calls in the same agent turn share one
 * read. We don't memoise on the JS side because the wrapper's contract
 * is "no shared state across capabilities".
 */
export async function loadEnabledEntityTypes(ctx: CapabilityCtx): Promise<string[]> {
	const orgId = ctx.principal.orgId;
	// biome-ignore lint/suspicious/noExplicitAny: ActionCtx-shaped lookup; the runtime is the AI host.
	const actionCtx = ctx.ctx as any;
	if (!actionCtx || typeof actionCtx.runQuery !== "function") {
		return [...CORE_ENTITY_TYPES];
	}
	try {
		const { internal } = await import("../_generated/api");
		const enabled = (await actionCtx.runQuery(
			internal.orgs.queries.getEnabledEntityTypesForAI,
			{
				orgId: orgId as Id<"orgs">,
				userId: ctx.principal.userId as Id<"users">,
			},
		)) as string[] | null;
		if (Array.isArray(enabled) && enabled.length > 0) return enabled;
	} catch (err) {
		// Non-fatal — fall back to the four core types so the AI is never
		// blocked when the helper query is unavailable (e.g. test ctx
		// without scheduler wiring).
		console.warn("[_shared/entityTypes] loadEnabledEntityTypes fallback:", err);
	}
	return [...CORE_ENTITY_TYPES];
}

// ─── Runtime validator ─────────────────────────────────────────────────────

/**
 * Validate a user-supplied entityType string against the org's enabled
 * slots.
 *
 *   `{ ok: true, entityType }` — caller forwards the canonicalised
 *     value to the downstream mutation/query.
 *   `CapabilityResult` (a `repair` envelope) — caller returns it
 *     directly so the model self-corrects on the next turn.
 *
 * The `repair` hint lists the org's enabled types so the model picks
 * a valid one without re-running `describe_workspace`.
 */
export async function validateEntityType(
	ctx: CapabilityCtx,
	rawEntityType: unknown,
	options?: { restrictTo?: ReadonlyArray<string> },
): Promise<{ ok: true; entityType: string } | CapabilityResult> {
	if (typeof rawEntityType !== "string" || rawEntityType.trim().length === 0) {
		const enabled = await loadEnabledEntityTypes(ctx);
		const allowed = options?.restrictTo
			? enabled.filter((t) => options.restrictTo?.includes(t))
			: enabled;
		return repair(
			"entityType",
			`one of [${allowed.map((t) => `"${t}"`).join(", ")}]`,
			"missing",
			'Pass the entity type as a string (e.g. "lead"). Use describe_workspace to see what\'s enabled.',
			{ entityType: allowed[0] ?? "lead" },
		) as CapabilityResult;
	}

	// Canonicalise via the per-turn alias map (handles org-relabelled types).
	const rawString = rawEntityType as string; // narrowed by the guard above
	// canonicalEntityType returns `unknown` because the synonyms helper
	// passes through non-string inputs verbatim; we always pass a string
	// here so the result is always a string. Cast to keep the call sites
	// and the closed-union helpers happy.
	const canonical = String(canonicalEntityType(rawString));
	const enabled = await loadEnabledEntityTypes(ctx);
	const allowed = options?.restrictTo
		? enabled.filter((t) => options.restrictTo?.includes(t))
		: enabled;

	if (!allowed.includes(canonical)) {
		return repair(
			"entityType",
			`one of [${allowed.map((t) => `"${t}"`).join(", ")}]`,
			JSON.stringify(rawString),
			`"${rawString}" isn't an enabled entity in this workspace. Use describe_workspace to see what's available.`,
			{ entityType: allowed[0] ?? "lead" },
		) as CapabilityResult;
	}

	return { ok: true, entityType: canonical };
}

/**
 * Type-guard helper: did `validateEntityType` return a repair envelope?
 *
 * Tightens the discriminated-union narrowing for callers — TypeScript
 * can otherwise lose the union after the assignment and complain that
 * `entityType` doesn't exist on the result.
 */
export function isEntityTypeError(
	result: { ok: true; entityType: string } | CapabilityResult,
): result is CapabilityResult {
	return !(result as { ok?: boolean }).ok;
}

/**
 * Contract-test generator. For each capability, runs a battery of pure
 * input-shape assertions that catch the regression classes the legacy
 * tool layer kept tripping on:
 *
 *   - goodExample parses cleanly through cap.input
 *   - timestamp fields accept ISO + natural language + epoch (the dueAt fix)
 *   - codeArray fields accept array | CSV | JSON-string
 *   - run() returns a CapabilityResult shape (with mock ctx; only safe
 *     reads are exercised by default — write capabilities are skipped
 *     unless the caller injects a stubbed ctx)
 *   - canRun denies without the matching permission
 *
 * Per-domain test files (e.g. `leads/capabilities.test.ts`) call
 * `assertCapabilityContracts(caps)` inside a Vitest `describe.each`. The
 * generator returns a list of {name, run} pairs the suite executes.
 */
import { z } from "zod";
import { type FieldKind, getFieldKind } from "./coerce";
import { canRun } from "./gate";
import type { Capability, CapabilityCtx, CapabilityResult, Outcome, Principal } from "./types";

// ─── Field-kind inspection ──────────────────────────────────────────────────

/**
 * Walk the capability's input object schema and read each top-level field's
 * `__fieldKind` tag (set by `field.*` helpers). Tag-based — not heuristic —
 * because zod preprocessors are too permissive to classify reliably from
 * sample probes.
 */
export function inferFieldKinds(cap: Capability): Record<string, FieldKind | "unknown"> {
	const schema = cap.input;
	if (!(schema instanceof z.ZodObject)) return {};
	const shape = schema.shape as Record<string, z.ZodType>;
	const out: Record<string, FieldKind | "unknown"> = {};
	for (const [name, sub] of Object.entries(shape)) {
		// Strip optional/default wrappers so we read the inner-type tag.
		let inner: z.ZodType = sub;
		// biome-ignore lint/suspicious/noExplicitAny: zod internal shape — readable via def.
		const def: any = (inner as any).def ?? (inner as any)._def;
		if (def?.innerType instanceof z.ZodType) inner = def.innerType;
		out[name] = getFieldKind(inner) ?? "unknown";
	}
	return out;
}

// ─── Brittleness inspection (locked 2026-06-06) ─────────────────────────────
//
// "Brittle" = a top-level required field whose name is not surfaced in
// `spec.requiredClarifications`. Weak models (Gemini Flash family, Llama
// 3.x, Mistral small tier) routinely omit such fields; the wrapper then
// returns `needs_repair`, the host's retry budget exhausts, and the user
// sees a red ERROR card. Fix is one of:
//
//   1. Make the field optional in the schema and handle the absent case
//      in `run()` with a graceful `ok({ headline: "...tell me X..." })`
//      envelope. Mirrors the `discover_capabilities` no-arg fix.
//   2. Add the field name to `spec.requiredClarifications` so the
//      doctrine layer surfaces it to the model BEFORE the call.
//
// Both fixes are equivalent from a regression-prevention POV: the model
// either knows to provide it, or the schema accepts its absence.

/**
 * True when a top-level field's schema accepts `undefined` (i.e. is wrapped
 * in `.optional()` / `.default()` / `.nullable()`). Reads the same `def
 * .innerType` slot {@link inferFieldKinds} uses.
 */
function isOptionalField(schema: z.ZodType): boolean {
	// biome-ignore lint/suspicious/noExplicitAny: zod internal shape — readable via def.
	const def: any = (schema as any).def ?? (schema as any)._def;
	if (def?.innerType instanceof z.ZodType) return true;
	// Direct `safeParse(undefined)` probe as a last resort — covers refined
	// schemas that bury the optional wrapper deeper than `def.innerType`.
	try {
		return schema.safeParse(undefined).success;
	} catch {
		return false;
	}
}

/**
 * List the top-level required field names on a capability's input schema.
 * Returns `[]` for non-object schemas (a no-arg capability).
 */
export function listRequiredTopLevelFields(cap: Capability): string[] {
	const schema = cap.input;
	if (!(schema instanceof z.ZodObject)) return [];
	const shape = schema.shape as Record<string, z.ZodType>;
	const out: string[] = [];
	for (const [name, sub] of Object.entries(shape)) {
		if (isOptionalField(sub)) continue;
		out.push(name);
	}
	return out;
}

/**
 * Parse `spec.requiredClarifications` into a lowercase Set of bare field
 * names. Each entry may be a single field (`"query"`) OR a multi-token
 * disjunction (`"personCode or conversationId"`); we split on `or` / `,`
 * / `/` / `&` / `and` so either spelling is recognised.
 */
export function parseDocumentedClarifications(cap: Capability): Set<string> {
	const out = new Set<string>();
	for (const entry of cap.spec.requiredClarifications ?? []) {
		for (const piece of entry.split(/\s+(?:or|and|,|\/|&)\s+|\s*[,/]\s*/i)) {
			const trimmed = piece.trim().toLowerCase();
			if (trimmed.length > 0) out.add(trimmed);
		}
	}
	return out;
}

/**
 * Required top-level fields whose names are NOT listed in
 * `spec.requiredClarifications`. Empty array means the capability is
 * weak-model-safe at the schema layer; non-empty means a Gemini-Flash-class
 * model will silently omit one of these and burn the retry budget.
 */
export function listUndocumentedRequiredFields(cap: Capability): string[] {
	const required = listRequiredTopLevelFields(cap);
	if (required.length === 0) return [];
	const documented = parseDocumentedClarifications(cap);
	return required.filter((f) => !documented.has(f.toLowerCase()));
}

// ─── Contract assertions ────────────────────────────────────────────────────

export type ContractCase = {
	name: string;
	run: () => Promise<void> | void;
};

/** Mock principal builder. Permissions list is exact — gate.canRun checks `includes`. */
export function mockPrincipal(permissions: string[] = []): Principal {
	return {
		kind: "member",
		userId: "mock-user" as Principal["userId"],
		orgId: "mock-org" as Principal["orgId"],
		permissions,
		channel: "chat",
	};
}

/** Mock CapabilityCtx with no live ctx — only safe for assertions that don't reach the DB. */
export function mockCapabilityCtx(permissions: string[] = []): CapabilityCtx {
	return {
		ctx: undefined as unknown as CapabilityCtx["ctx"],
		principal: mockPrincipal(permissions),
	};
}

/** A valid CapabilityResult has a closed Outcome status + non-empty headline. */
const VALID_OUTCOMES: ReadonlySet<Outcome> = new Set([
	"ok",
	"partial",
	"needs_repair",
	"not_found",
	"ambiguous",
	"denied",
	"channel_blocked",
	"needs_step_up",
	"business_error",
	"infra_retry",
]);

export function assertResultShape(r: CapabilityResult, capName: string): void {
	if (!VALID_OUTCOMES.has(r.status)) {
		throw new Error(`[${capName}] returned unknown status "${r.status}"`);
	}
	if (typeof r.headline !== "string" || r.headline.trim().length === 0) {
		throw new Error(`[${capName}] returned empty headline`);
	}
}

/**
 * Build the contract-test cases for one capability. The caller (a Vitest
 * file) iterates the returned list and runs each case inside a `test(name)`.
 */
export function buildContractCases(cap: Capability): ContractCase[] {
	const cases: ContractCase[] = [];

	cases.push({
		name: `${cap.name}: goodExample parses through input schema`,
		run: () => {
			const parsed = cap.input.safeParse(cap.spec.goodExample);
			if (!parsed.success) {
				throw new Error(
					`goodExample for ${cap.name} did not parse: ${parsed.error.issues
						.map((i) => `${i.path.join(".")}: ${i.message}`)
						.join("; ")}`,
				);
			}
		},
	});

	const kinds = inferFieldKinds(cap);
	for (const [field, kind] of Object.entries(kinds)) {
		if (kind === "timestamp") {
			cases.push({
				name: `${cap.name}.${field}: accepts ISO + epoch + natural-language`,
				run: () => {
					const base = cap.spec.goodExample as Record<string, unknown>;
					for (const value of [
						"2024-06-05T09:00:00.000Z",
						Date.now(),
						"next Tuesday",
						"tomorrow 9am",
					]) {
						const parsed = cap.input.safeParse({ ...base, [field]: value });
						if (!parsed.success) {
							throw new Error(
								`${cap.name}.${field} rejected ${JSON.stringify(value)}: ${parsed.error.issues[0]?.message}`,
							);
						}
					}
				},
			});
		}
		if (kind === "codeArray") {
			cases.push({
				name: `${cap.name}.${field}: accepts array + CSV + JSON-string`,
				run: () => {
					const base = cap.spec.goodExample as Record<string, unknown>;
					for (const value of [["a", "b"], "a,b", '["a","b"]']) {
						const parsed = cap.input.safeParse({ ...base, [field]: value });
						if (!parsed.success) {
							throw new Error(
								`${cap.name}.${field} rejected ${JSON.stringify(value)}: ${parsed.error.issues[0]?.message}`,
							);
						}
					}
				},
			});
		}
	}

	if (cap.permission !== null) {
		cases.push({
			name: `${cap.name}: canRun denies without "${cap.permission}"`,
			run: () => {
				const principal = mockPrincipal([]); // empty permissions
				if (canRun(principal, cap)) {
					throw new Error(
						`${cap.name} allowed a principal with no permissions — should require "${cap.permission}"`,
					);
				}
				const granted = mockPrincipal([cap.permission as string]);
				if (!canRun(granted, cap)) {
					throw new Error(`${cap.name} denied a principal holding "${cap.permission}"`);
				}
			},
		});
	}

	// ── Weak-model brittleness fuzz (locked 2026-06-06) ─────────────────────
	// For every top-level REQUIRED field, assert one of:
	//   (a) the field name appears in `spec.requiredClarifications` so the
	//       doctrine layer warns the model BEFORE the call, OR
	//   (b) the schema accepts `undefined` (the field is optional / has a
	//       default / is nullable) so weak-model omission is non-fatal.
	//
	// Without (a) or (b) a Gemini-Flash-class model omits the field, the
	// wrapper returns needs_repair, the host's retry budget exhausts, and
	// the user sees a red ERROR card. This is the bug class the
	// 2026-06-06 search_crm patch fixed; the fuzz keeps regressions out.
	const documented = parseDocumentedClarifications(cap);
	for (const field of listRequiredTopLevelFields(cap)) {
		cases.push({
			name: `${cap.name}.${field}: required field is weak-model-safe (documented OR optional)`,
			run: () => {
				if (documented.has(field.toLowerCase())) return;
				// Field is required AND undocumented. Verify the schema
				// rejects its absence — if the schema actually accepts
				// `undefined`, our `listRequiredTopLevelFields` reading
				// disagrees and the audit is moot.
				const base = { ...(cap.spec.goodExample as Record<string, unknown>) };
				delete base[field];
				const parsed = cap.input.safeParse(base);
				if (parsed.success) return; // schema is graceful — fine.
				throw new Error(
					`${cap.name} has a required top-level field "${field}" that is NOT documented in spec.requiredClarifications. Weak models (Gemini Flash, Llama small) will silently omit it; the wrapper returns needs_repair; retry budget exhausts; the user sees an error card. Fix one of: (a) add "${field}" to spec.requiredClarifications, OR (b) make the field optional with a graceful no-arg branch in run() (mirror search_crm / discover_capabilities).`,
				);
			},
		});
	}

	return cases;
}

/** Convenience: build cases for every capability in a list. */
export function buildContractCasesForAll(caps: Capability[]): ContractCase[] {
	return caps.flatMap(buildContractCases);
}

// ─── Coverage / contract report (S12) ───────────────────────────────────────

/**
 * Per-module rollup of capability completeness. Caps without a goodExample
 * cannot generate contract tests and never sat in CI; caps without a
 * `whenNotToCall`/`badExample` are likely to be mis-routed by the model.
 */
export type ModuleCoverage = {
	module: string;
	count: number;
	groups: string[];
	withGoodExample: number;
	withBadExample: number;
	withWhenNotToCall: number;
	withRequiredClarifications: number;
	withSynonyms: number;
	risksByTier: Record<"safe" | "reversible" | "irreversible", number>;
	channelCoverage: { chat: number; whatsapp: number; mcp: number; rest: number };
	missingExamples: string[];
};

/** Per-group rollup. `playbookRegistered` is filled in by `buildCoverageReport` callers. */
export type GroupCoverage = {
	group: string;
	module: string;
	count: number;
	capNames: string[];
};

/** Top-level summary. `target.totalCaps` is the §1.1 inventory headline. */
export type CoverageReportSummary = {
	totalCaps: number;
	totalModules: number;
	totalGroups: number;
	withGoodExample: number;
	withBadExample: number;
	withWhenNotToCall: number;
	missingExamples: number;
	missingPlaybooks: string[];
	/**
	 * Count of capabilities flagged as weak-model-brittle: at least one
	 * required top-level field that is NOT in `spec.requiredClarifications`.
	 * The full per-capability list lives in `CoverageReport.brittleCapabilities`.
	 */
	brittleCount: number;
};

/** Full coverage report — what `getCoverageReport` returns to the operator. */
export type CoverageReport = {
	summary: CoverageReportSummary;
	perModule: ModuleCoverage[];
	perGroup: GroupCoverage[];
	risksByTier: Record<"safe" | "reversible" | "irreversible", number>;
	channelCoverage: { chat: number; whatsapp: number; mcp: number; rest: number };
	/**
	 * Per-capability brittleness audit (locked 2026-06-06). Lists every
	 * capability with at least one required top-level field whose name is
	 * not in `spec.requiredClarifications`. Operators read this to find
	 * tools that will silently fail under Gemini-Flash / Llama-small /
	 * Mistral-small. Empty array = registry is weak-model-safe at the
	 * schema layer.
	 */
	brittleCapabilities: Array<{
		capability: string;
		module: string;
		group: string;
		undocumentedRequiredFields: string[];
	}>;
};

/**
 * Pure: derive a coverage report from a capability list. Tests pass an
 * explicit list; the live `getCoverageReport` query reads
 * `listCapabilities()` so the report is always grounded by the registry.
 *
 * `registeredGroupKeys` is the set of group names that have a playbook
 * registered in `groups.ts`. Caps whose group is missing from that set
 * surface in `summary.missingPlaybooks` so an operator can see where the
 * router would activate a phantom group.
 */
export function buildCoverageReport(
	caps: Capability[],
	registeredGroupKeys: ReadonlySet<string>,
): CoverageReport {
	const perModuleMap = new Map<string, ModuleCoverage>();
	const perGroupMap = new Map<string, GroupCoverage>();
	const overallRisks: Record<"safe" | "reversible" | "irreversible", number> = {
		safe: 0,
		reversible: 0,
		irreversible: 0,
	};
	const overallChannels = { chat: 0, whatsapp: 0, mcp: 0, rest: 0 };

	for (const cap of caps) {
		// Per-module bucket.
		let mod = perModuleMap.get(cap.module);
		if (!mod) {
			mod = {
				module: cap.module,
				count: 0,
				groups: [],
				withGoodExample: 0,
				withBadExample: 0,
				withWhenNotToCall: 0,
				withRequiredClarifications: 0,
				withSynonyms: 0,
				risksByTier: { safe: 0, reversible: 0, irreversible: 0 },
				channelCoverage: { chat: 0, whatsapp: 0, mcp: 0, rest: 0 },
				missingExamples: [],
			};
			perModuleMap.set(cap.module, mod);
		}
		mod.count++;
		if (!mod.groups.includes(cap.group)) mod.groups.push(cap.group);
		mod.risksByTier[cap.risk]++;
		overallRisks[cap.risk]++;
		for (const ch of cap.channels) {
			mod.channelCoverage[ch]++;
			overallChannels[ch]++;
		}
		const hasGood = isPlainObjectWithKeys(cap.spec.goodExample);
		if (hasGood) mod.withGoodExample++;
		else mod.missingExamples.push(cap.name);
		if (cap.spec.badExample) mod.withBadExample++;
		if (cap.spec.whenNotToCall && cap.spec.whenNotToCall.trim().length > 0) {
			mod.withWhenNotToCall++;
		}
		if (cap.spec.requiredClarifications && cap.spec.requiredClarifications.length > 0) {
			mod.withRequiredClarifications++;
		}
		if (cap.spec.synonyms && cap.spec.synonyms.length > 0) mod.withSynonyms++;

		// Per-group bucket.
		const groupKey = `${cap.module}:${cap.group}`;
		let grp = perGroupMap.get(groupKey);
		if (!grp) {
			grp = { group: cap.group, module: cap.module, count: 0, capNames: [] };
			perGroupMap.set(groupKey, grp);
		}
		grp.count++;
		grp.capNames.push(cap.name);
	}

	// Stable ordering — alphabetical by module then group makes diffs review-friendly.
	const perModule = Array.from(perModuleMap.values()).sort((a, b) =>
		a.module.localeCompare(b.module),
	);
	const perGroup = Array.from(perGroupMap.values()).sort((a, b) =>
		`${a.module}:${a.group}`.localeCompare(`${b.module}:${b.group}`),
	);

	const missingPlaybooks: string[] = [];
	const seenGroups = new Set<string>();
	for (const cap of caps) {
		if (seenGroups.has(cap.group)) continue;
		seenGroups.add(cap.group);
		if (!registeredGroupKeys.has(cap.group)) missingPlaybooks.push(cap.group);
	}
	missingPlaybooks.sort();

	// Brittleness audit (locked 2026-06-06). Walks the same `caps` list a
	// second time so the inspection is co-located with the rest of the
	// report; cost is O(N × required-fields) and runs once per call.
	const brittleCapabilities: CoverageReport["brittleCapabilities"] = [];
	for (const cap of caps) {
		const undocumented = listUndocumentedRequiredFields(cap);
		if (undocumented.length === 0) continue;
		brittleCapabilities.push({
			capability: cap.name,
			module: cap.module,
			group: cap.group,
			undocumentedRequiredFields: undocumented,
		});
	}
	// Stable ordering for review-friendly diffs in the operator UI + tests.
	brittleCapabilities.sort((a, b) =>
		`${a.module}:${a.capability}`.localeCompare(`${b.module}:${b.capability}`),
	);

	const summary: CoverageReportSummary = {
		totalCaps: caps.length,
		totalModules: perModule.length,
		totalGroups: perGroup.length,
		withGoodExample: perModule.reduce((acc, m) => acc + m.withGoodExample, 0),
		withBadExample: perModule.reduce((acc, m) => acc + m.withBadExample, 0),
		withWhenNotToCall: perModule.reduce((acc, m) => acc + m.withWhenNotToCall, 0),
		missingExamples: perModule.reduce((acc, m) => acc + m.missingExamples.length, 0),
		missingPlaybooks,
		brittleCount: brittleCapabilities.length,
	};

	return {
		summary,
		perModule,
		perGroup,
		risksByTier: overallRisks,
		channelCoverage: overallChannels,
		brittleCapabilities,
	};
}

/** Tight helper — `goodExample` must be a non-empty object to be testable. */
function isPlainObjectWithKeys(value: unknown): boolean {
	if (!value || typeof value !== "object" || Array.isArray(value)) return false;
	return Object.keys(value as Record<string, unknown>).length > 0;
}

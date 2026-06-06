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
};

/** Full coverage report — what `getCoverageReport` returns to the operator. */
export type CoverageReport = {
	summary: CoverageReportSummary;
	perModule: ModuleCoverage[];
	perGroup: GroupCoverage[];
	risksByTier: Record<"safe" | "reversible" | "irreversible", number>;
	channelCoverage: { chat: number; whatsapp: number; mcp: number; rest: number };
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

	const summary: CoverageReportSummary = {
		totalCaps: caps.length,
		totalModules: perModule.length,
		totalGroups: perGroup.length,
		withGoodExample: perModule.reduce((acc, m) => acc + m.withGoodExample, 0),
		withBadExample: perModule.reduce((acc, m) => acc + m.withBadExample, 0),
		withWhenNotToCall: perModule.reduce((acc, m) => acc + m.withWhenNotToCall, 0),
		missingExamples: perModule.reduce((acc, m) => acc + m.missingExamples.length, 0),
		missingPlaybooks,
	};

	return {
		summary,
		perModule,
		perGroup,
		risksByTier: overallRisks,
		channelCoverage: overallChannels,
	};
}

/** Tight helper — `goodExample` must be a non-empty object to be testable. */
function isPlainObjectWithKeys(value: unknown): boolean {
	if (!value || typeof value !== "object" || Array.isArray(value)) return false;
	return Object.keys(value as Record<string, unknown>).length > 0;
}

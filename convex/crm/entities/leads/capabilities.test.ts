/**
 * Contract tests for the leads capabilities. Uses the generic generator in
 * `convex/ai/registry/coverage.ts` so this file stays small — every test case
 * comes from `buildContractCases(cap)`. Add a leads-specific case at the
 * bottom only when the generator can't cover it (e.g. a domain-specific
 * cross-field invariant).
 */
import { describe, it } from "vitest";
import { buildContractCasesForAll } from "../../../ai/registry/coverage";
import { LEADS_CAPABILITIES } from "./capabilities";

describe("leads — contract test generator", () => {
	const cases = buildContractCasesForAll([...LEADS_CAPABILITIES]);
	for (const c of cases) {
		it(c.name, c.run);
	}
});

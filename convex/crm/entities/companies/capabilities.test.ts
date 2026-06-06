/**
 * Contract tests for the companies capabilities. The heavy lifting is the
 * registry-level generator in `convex/ai/registry/coverage.ts`; this file
 * stays small.
 */
import { describe, it } from "vitest";
import { buildContractCasesForAll } from "../../../ai/registry/coverage";
import { COMPANIES_CAPABILITIES } from "./capabilities";

describe("companies — contract test generator", () => {
	const cases = buildContractCasesForAll([...COMPANIES_CAPABILITIES]);
	for (const c of cases) {
		it(c.name, c.run);
	}
});

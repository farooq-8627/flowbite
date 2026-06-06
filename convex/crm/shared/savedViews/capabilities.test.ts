/**
 * Contract tests for the savedViews capabilities. The heavy lifting is the
 * registry-level generator in `convex/ai/registry/coverage.ts`; this file
 * stays small.
 */
import { describe, it } from "vitest";
import { buildContractCasesForAll } from "../../../ai/registry/coverage";
import { SAVED_VIEWS_CAPABILITIES } from "./capabilities";

describe("savedViews — contract test generator", () => {
	const cases = buildContractCasesForAll([...SAVED_VIEWS_CAPABILITIES]);
	for (const c of cases) {
		it(c.name, c.run);
	}
});

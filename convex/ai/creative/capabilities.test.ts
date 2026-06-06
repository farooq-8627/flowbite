/**
 * Contract tests for the creative capabilities. The heavy lifting is
 * the registry-level generator in `convex/ai/registry/coverage.ts`;
 * this file stays small.
 */
import { describe, it } from "vitest";
import { buildContractCasesForAll } from "../registry/coverage";
import { CREATIVE_CAPABILITIES } from "./capabilities";

describe("creative — contract test generator", () => {
	const cases = buildContractCasesForAll([...CREATIVE_CAPABILITIES]);
	for (const c of cases) {
		it(c.name, c.run);
	}
});

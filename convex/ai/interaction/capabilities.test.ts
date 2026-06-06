/**
 * Contract tests for the interaction capabilities. The heavy lifting is
 * the registry-level generator in `convex/ai/registry/coverage.ts`;
 * this file stays small.
 */
import { describe, it } from "vitest";
import { buildContractCasesForAll } from "../registry/coverage";
import { INTERACTION_CAPABILITIES } from "./capabilities";

describe("interaction — contract test generator", () => {
	const cases = buildContractCasesForAll([...INTERACTION_CAPABILITIES]);
	for (const c of cases) {
		it(c.name, c.run);
	}
});

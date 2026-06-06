/**
 * Contract tests for the quarantined capabilities. The heavy lifting is
 * the registry-level generator in `convex/ai/registry/coverage.ts`;
 * this file stays small.
 */
import { describe, it } from "vitest";
import { buildContractCasesForAll } from "../registry/coverage";
import { QUARANTINED_CAPABILITIES } from "./capabilities";

describe("quarantined — contract test generator", () => {
	const cases = buildContractCasesForAll([...QUARANTINED_CAPABILITIES]);
	for (const c of cases) {
		it(c.name, c.run);
	}
});

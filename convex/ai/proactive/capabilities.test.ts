/**
 * Contract tests for the proactive capabilities. The heavy lifting is
 * the registry-level generator in `convex/ai/registry/coverage.ts`;
 * this file stays small.
 */
import { describe, it } from "vitest";
import { buildContractCasesForAll } from "../registry/coverage";
import { PROACTIVE_CAPABILITIES } from "./capabilities";

describe("proactive — contract test generator", () => {
	const cases = buildContractCasesForAll([...PROACTIVE_CAPABILITIES]);
	for (const c of cases) {
		it(c.name, c.run);
	}
});

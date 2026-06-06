/**
 * Contract tests for the analytics capabilities. The heavy lifting is
 * the registry-level generator in `convex/ai/registry/coverage.ts`;
 * this file stays small.
 */
import { describe, it } from "vitest";
import { buildContractCasesForAll } from "../registry/coverage";
import { ANALYTICS_CAPABILITIES } from "./capabilities";

describe("analytics — contract test generator", () => {
	const cases = buildContractCasesForAll([...ANALYTICS_CAPABILITIES]);
	for (const c of cases) {
		it(c.name, c.run);
	}
});

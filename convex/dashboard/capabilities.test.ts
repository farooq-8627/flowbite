/**
 * Contract tests for the dashboard capabilities. The heavy lifting is
 * the registry-level generator in `convex/ai/registry/coverage.ts`;
 * this file stays small.
 */
import { describe, it } from "vitest";
import { buildContractCasesForAll } from "../ai/registry/coverage";
import { DASHBOARD_CAPABILITIES } from "./capabilities";

describe("dashboard — contract test generator", () => {
	const cases = buildContractCasesForAll([...DASHBOARD_CAPABILITIES]);
	for (const c of cases) {
		it(c.name, c.run);
	}
});

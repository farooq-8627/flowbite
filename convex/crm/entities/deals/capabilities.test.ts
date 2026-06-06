/**
 * Contract tests for the deals capabilities. The heavy lifting is the
 * registry-level generator in `convex/ai/registry/coverage.ts`; this file
 * stays small.
 */
import { describe, it } from "vitest";
import { buildContractCasesForAll } from "../../../ai/registry/coverage";
import { DEALS_CAPABILITIES } from "./capabilities";

describe("deals — contract test generator", () => {
	const cases = buildContractCasesForAll([...DEALS_CAPABILITIES]);
	for (const c of cases) {
		it(c.name, c.run);
	}
});

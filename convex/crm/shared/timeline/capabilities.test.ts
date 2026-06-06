/**
 * Contract tests for the timeline capability. The heavy lifting is the
 * registry-level generator in `convex/ai/registry/coverage.ts`; this file
 * stays small.
 */
import { describe, it } from "vitest";
import { buildContractCasesForAll } from "../../../ai/registry/coverage";
import { TIMELINE_CAPABILITIES } from "./capabilities";

describe("timeline — contract test generator", () => {
	const cases = buildContractCasesForAll([...TIMELINE_CAPABILITIES]);
	for (const c of cases) {
		it(c.name, c.run);
	}
});

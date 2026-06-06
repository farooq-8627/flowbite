/**
 * Contract tests for the pipelines capabilities. The heavy lifting is the
 * registry-level generator in `convex/ai/registry/coverage.ts`; this file
 * stays small.
 */
import { describe, it } from "vitest";
import { buildContractCasesForAll } from "../../../ai/registry/coverage";
import { PIPELINES_CAPABILITIES } from "./capabilities";

describe("pipelines — contract test generator", () => {
	const cases = buildContractCasesForAll([...PIPELINES_CAPABILITIES]);
	for (const c of cases) {
		it(c.name, c.run);
	}
});

/**
 * Contract tests for the tags capabilities. The heavy lifting is the
 * registry-level generator in `convex/ai/registry/coverage.ts`; this file
 * stays small.
 */
import { describe, it } from "vitest";
import { buildContractCasesForAll } from "../../../ai/registry/coverage";
import { TAGS_CAPABILITIES } from "./capabilities";

describe("tags — contract test generator", () => {
	const cases = buildContractCasesForAll([...TAGS_CAPABILITIES]);
	for (const c of cases) {
		it(c.name, c.run);
	}
});

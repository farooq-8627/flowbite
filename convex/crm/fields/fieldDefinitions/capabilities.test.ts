/**
 * Contract tests for the fieldDefinitions capabilities. The heavy lifting
 * is the registry-level generator in `convex/ai/registry/coverage.ts`;
 * this file stays small.
 */
import { describe, it } from "vitest";
import { buildContractCasesForAll } from "../../../ai/registry/coverage";
import { FIELDS_CAPABILITIES } from "./capabilities";

describe("fieldDefinitions — contract test generator", () => {
	const cases = buildContractCasesForAll([...FIELDS_CAPABILITIES]);
	for (const c of cases) {
		it(c.name, c.run);
	}
});

/**
 * Contract tests for the noteCategories capabilities. The heavy lifting
 * is the registry-level generator in `convex/ai/registry/coverage.ts`;
 * this file stays small.
 */
import { describe, it } from "vitest";
import { buildContractCasesForAll } from "../../../ai/registry/coverage";
import { NOTE_CATEGORIES_CAPABILITIES } from "./capabilities";

describe("noteCategories — contract test generator", () => {
	const cases = buildContractCasesForAll([...NOTE_CATEGORIES_CAPABILITIES]);
	for (const c of cases) {
		it(c.name, c.run);
	}
});

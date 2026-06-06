/**
 * Contract tests for the notes capabilities. The heavy lifting is the
 * registry-level generator in `convex/ai/registry/coverage.ts`; this file
 * stays small.
 */
import { describe, it } from "vitest";
import { buildContractCasesForAll } from "../../../ai/registry/coverage";
import { NOTES_CAPABILITIES } from "./capabilities";

describe("notes — contract test generator", () => {
	const cases = buildContractCasesForAll([...NOTES_CAPABILITIES]);
	for (const c of cases) {
		it(c.name, c.run);
	}
});

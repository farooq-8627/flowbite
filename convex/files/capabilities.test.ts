/**
 * Contract tests for the files capabilities. The heavy lifting is the
 * registry-level generator in `convex/ai/registry/coverage.ts`; this
 * file stays small.
 */
import { describe, it } from "vitest";
import { buildContractCasesForAll } from "../ai/registry/coverage";
import { FILES_CAPABILITIES } from "./capabilities";

describe("files — contract test generator", () => {
	const cases = buildContractCasesForAll([...FILES_CAPABILITIES]);
	for (const c of cases) {
		it(c.name, c.run);
	}
});

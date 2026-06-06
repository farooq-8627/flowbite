/**
 * Contract tests for the tasks capabilities. The heavy lifting is done
 * by the registry-level generator in `convex/ai/registry/coverage.ts`,
 * which auto-emits assertions for:
 *
 *   1. `goodExample` parses cleanly through `cap.input` (catches schema
 *      drift — every shipped capability MUST have a copy-pasteable
 *      example the model can use verbatim).
 *   2. `dueAt` (tagged via `field.timestampLazy()`) accepts ISO + epoch
 *      + natural language. This is the "kill the dueAt class of bugs"
 *      assertion called out in `AI-TOOLING-BUILD-STAGES.md` S4 — if
 *      this regresses, the AI starts producing tasks with wrong epochs
 *      again.
 *   3. RBAC denial: `canRun` rejects a principal that doesn't hold the
 *      capability's declared permission (and accepts one that does).
 *
 * Domain-specific cross-field invariants the generator can't express
 * are added below the `describe.each` block — currently none, because
 * the schema-level constraints (`refine` on update_task; the type
 * discriminator on create_task) are exercised by the generator's
 * goodExample assertion. Add a domain test here only when you find a
 * regression the generator can't catch.
 */
import { describe, it } from "vitest";
import { buildContractCasesForAll } from "../../../ai/registry/coverage";
import { TASKS_CAPABILITIES } from "./capabilities";

describe("tasks — contract test generator", () => {
	const cases = buildContractCasesForAll([...TASKS_CAPABILITIES]);
	for (const c of cases) {
		it(c.name, c.run);
	}
});

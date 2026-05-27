/**
 * convex/ai/tools/scheduling/index.ts
 *
 * Barrel + side-effect imports for the scheduling tool family.
 *
 * Stage 4C of TASKS-RENAME-PLAN.md (2026-05-27): updateReminder →
 * updateTask. The atomic task tools (create/complete/cancel/list/get)
 * live in `convex/ai/tools/tasks.ts` and are wired separately by
 * toolContextBinder.
 */
import "./updateTask";

export { setSchedulingContext } from "./_context";

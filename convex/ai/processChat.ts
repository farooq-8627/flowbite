"use node";
/**
 * convex/ai/processChat.ts
 *
 * RE-EXPORT SHIM. The V2 capability host lives under
 * `convex/ai/orchestrator/run.ts` (and `convex/ai/runtime/host.ts`).
 *
 * This file is kept as the legacy entry-point so:
 *   1. The Convex public function path `api.ai.processChat:run` continues
 *      to resolve. `convex/ai/messages.ts` schedules processChat via
 *      `makeFunctionReference("ai/processChat:run")` — string-paths
 *      anchored on this filename.
 *   2. Internal `_ref("ai/processChat:run")` string references in other
 *      Convex files (e.g. `aiStepUp.confirmStepUp`) continue to resolve.
 *
 * S10 retired the V1 `resume` export — the propose/commit two-step path
 * was replaced by the 2FA step-up flow in `convex/aiStepUp.ts`.
 */
export { run, runResume } from "./orchestrator/run";

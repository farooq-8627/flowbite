"use node";
export { resume } from "./orchestrator/resume";
/**
 * convex/ai/processChat.ts
 *
 * RE-EXPORT SHIM. The orchestrator now lives in `convex/ai/orchestrator/`
 * split into focused files (run, resume, streamLoop, modelResolver,
 * reasoningBuffer, toolContextBinder). This file is kept as the legacy
 * entry-point so:
 *   1. The Convex public function path `api.ai.processChat:run` continues
 *      to resolve. `convex/ai/messages.ts` schedules processChat via
 *      `makeFunctionReference("ai/processChat:run")` — string-paths
 *      anchored on this filename.
 *   2. Internal `_ref("ai/processChat:run")` and `_ref("ai/processChat:resume")`
 *      string references in other Convex files continue to resolve.
 *
 * To find the actual implementation, open `orchestrator/run.ts` and
 * `orchestrator/resume.ts`.
 */
export { run } from "./orchestrator/run";

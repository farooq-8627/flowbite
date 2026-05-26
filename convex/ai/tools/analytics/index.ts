/**
 * convex/ai/tools/analytics/index.ts
 *
 * Stage 7 (`/SPRINT-PLAN.md`). Barrel module for the `analytics` tool
 * layer. Each side-effect import below triggers a `registerTool({...})`
 * call so the tool becomes visible to `getToolsForRequest` once
 * `expand_tools({ layer: "analytics" })` has been issued.
 *
 * Re-exports `setAnalyticsContext` so `convex/ai/orchestrator/toolContextBinder.ts`
 * can wire the per-request `ToolContext` once.
 */

import "./analyzeMetric";
import "./cohortAnalysis";
import "./getBriefing";
import "./memberPerformance";
import "./refreshBriefing";

export { setAnalyticsContext } from "./_context";

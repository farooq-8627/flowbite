/**
 * convex/ai/tools/dashboard/index.ts
 *
 * Stage 5 — barrel + side-effect imports for the dashboard tool layer.
 *
 * Importing this module triggers the `registerTool({...})` calls in
 * each sub-file, populating the global registry. Imported once from
 * `convex/ai/orchestrator/toolContextBinder.ts` (the catch-all loader)
 * so the orchestrator sees every tool by name when it builds the
 * per-request tool dict.
 */
import "./renderWidget";
import "./annotateWidget";
import "./scoreDeal";
import "./explainDealScore";
import "./listAnomalies";

export { setDashboardContext } from "./_context";

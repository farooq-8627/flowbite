/**
 * convex/ai/tools/creative/index.ts
 *
 * Barrel + side-effect imports for the `creative` tool layer
 * (Stage 9 of `/SPRINT-PLAN.md`).
 *
 * Importing this module triggers the `registerTool({...})` calls in
 * each sub-file, populating the global registry. Imported once from
 * `convex/ai/orchestrator/toolContextBinder.ts` (side-effect chain) so
 * the orchestrator sees every tool by name when it builds the
 * per-request tool dict.
 *
 * Re-exports `setCreativeContext` so `bindAllToolContexts` can wire
 * the per-request `ToolContext` once.
 */

import "./draftMessage";
import "./draftProposal";
import "./summariseConversation";
import "./webScrape";

export { setCreativeContext } from "./_context";

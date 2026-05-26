/**
 * convex/ai/tools/messaging/index.ts
 *
 * Barrel + side-effect imports for the messaging tool layer.
 *
 * Importing this module triggers the `registerTool({...})` calls in each
 * sub-file, populating the global registry. Imported once from
 * `convex/ai/tools/registry.ts` (the catch-all loader) so the
 * orchestrator sees every tool by name when it builds the per-request
 * tool dict.
 *
 * Stage 2 of SPRINT-PLAN.md (2026-05-26).
 */
import "./sendMessage";
import "./listMessages";
import "./markThreadRead";
import "./addParticipants";
import "./removeParticipant";

export { setMessagingContext } from "./_context";

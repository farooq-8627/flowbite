/**
 * convex/ai/tools/files/index.ts
 *
 * Barrel + side-effect imports for the files tool layer (Stage 4 of
 * /SPRINT-PLAN.md, 2026-05-26).
 *
 * Importing this module triggers the `registerTool({...})` calls in each
 * sub-file. Imported once from `convex/ai/orchestrator/toolContextBinder.ts`
 * via the `setFilesContext` import — that's enough to wake every tool
 * registration in the layer.
 */
import "./listFiles";
import "./updateFileTags";
import "./removeFile";
import "./attachFile";

export { setFilesContext } from "./_context";

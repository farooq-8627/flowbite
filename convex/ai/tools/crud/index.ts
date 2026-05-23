/**
 * convex/ai/tools/crud/index.ts
 *
 * Barrel file for the create-entity tools.
 *
 * Importing this file:
 *   - Triggers `registerTool()` side-effects in each tool module (load-time).
 *   - Re-exports `setCreateEntitiesContext` under its existing public name
 *     so `convex/ai/processChat.ts` doesn't have to change.
 *
 * Each tool file is small (60-90 LOC) and owns ONE entity's create+commit
 * pair. Add a new entity? Drop a new file here, import it from this barrel.
 */

// Side-effect imports — order doesn't matter; each calls registerTool() at module load.
import "./createLead";
import "./createContact";
import "./createCompany";
import "./createDeal";

// Re-export context setter under both new and legacy names.
export { setCreateEntitiesContext, setCrudContext } from "./_context";

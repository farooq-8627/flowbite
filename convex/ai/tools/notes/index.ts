/**
 * convex/ai/tools/notes/index.ts
 *
 * Barrel + side-effect imports for the note-edit tool family.
 *
 * Importing this module triggers the `registerTool({...})` calls in each
 * sub-file, populating the global registry. Imported once by
 * `convex/ai/orchestrator/toolContextBinder.ts` via the `setNotesContext`
 * import — that's enough to wake every tool registration.
 *
 * Stage 3 of SPRINT-PLAN.md (2026-05-26).
 */
import "./addNote";
import "./updateNote";
import "./deleteNote";
import "./pinNote";
import "./setNoteCategory";
import "./moveNoteToEntity";

export { setNotesContext } from "./_context";

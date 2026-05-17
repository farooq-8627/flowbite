/**
 * Shared entity-layout types.
 *
 * The "entity layout" is the slim 40px-toolbar + body-slot pattern first
 * built for the entity list/board pages (Leads, Contacts, Deals, Companies)
 * and now reused by every shared view that wants the same chrome — Notes,
 * Messages org-wide page, Reminders, Calendar, etc.
 *
 * `ViewKind` is the canonical pair of body shapes the toolbar's view-toggle
 * controls. It used to live in `core/entities/shared/types.ts`; it was lifted
 * here so the shell-shared layout doesn't depend on entity-specific code.
 * `core/entities/shared/types.ts` re-exports it for backward compatibility.
 */

export type ViewKind = "list" | "board";

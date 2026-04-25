# kanban Module (Core)

> Shared kanban board primitives using @dnd-kit. Used by deals (primary), leads, and any pipeline-based entity.

## Ownership
- **Location**: `core/kanban/`
- **Backend**: None (pure UI primitives — receives data via props)
- **Phase**: 2 | **Status**: NOT_STARTED

## Rules
- [ ] R-KAN-01: Columns are ALWAYS driven by pipeline stages from `pipelines` table — never hardcoded
- [ ] R-KAN-02: Card rendering is delegated to consumer via `CardComponent` prop — kanban doesn't know about entities
- [ ] R-KAN-03: Stage transitions call consumer's `onMoveCard(cardId, fromStageId, toStageId)` callback
- [ ] R-KAN-04: Drag handles must be keyboard accessible (a11y)

## Checklist
- [ ] `components/KanbanBoard.tsx` — DndContext + SortableContext per column
- [ ] `components/KanbanColumn.tsx` — Droppable column with stage header + count + color
- [ ] `components/KanbanCard.tsx` — Draggable card base wrapper
- [ ] `hooks/usePipelineBoard.ts` — Pipeline stages → column config

## Avoids
- ❌ Never hardcode column names or colors
- ❌ Never import entity-specific code — kanban is entity-agnostic
- ❌ Never mutate data directly — always use callbacks

## Cross-Module Dependencies
- **READS FROM**: None (receives data via props)
- **WRITES TO**: None (emits callbacks)
- **CONSUMERS**: `core/entities/leads/`, `core/entities/deals/`, any pipeline entity

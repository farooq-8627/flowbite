# core/kanban — MODULE.md
## Kanban Board Primitives
> **Phase**: 2 · **Status**: Build after `core/datatable` (both are Phase 2 scaffolds — do datatable first)
> **Consumers**: `core/entities/deals/` (primary), `core/entities/leads/` (optional board view), `features/project-management/` (Phase 8 tasks board)

---

## Purpose

This module provides the `@dnd-kit`-powered drag-and-drop kanban primitives. It is a **generic, configurable engine** — it knows nothing about leads or deals specifically. Entity-specific modules (`core/entities/deals/`, etc.) pass column and card configuration in. The kanban board never fetches its own data; it renders what it's given.

**One board engine, used in 3 places**:
- Deals board (primary — this is the default view for deals)
- Leads board (optional toggle alongside the list view)
- Tasks board (Phase 8 — project management)

---

## Folder Structure

```
core/kanban/
├── MODULE.md                         # this file
├── index.ts                          # barrel export
│
├── components/
│   ├── KanbanBoard.tsx               # Root container — DndContext + column layout
│   ├── KanbanColumn.tsx              # One stage/status column — SortableContext
│   ├── KanbanCard.tsx                # Base card — extends via renderCard prop
│   ├── KanbanCardSkeleton.tsx        # Loading state — matches card dimensions
│   ├── KanbanColumnHeader.tsx        # Stage name + count + total value (if allowed)
│   ├── KanbanAddCard.tsx             # Inline "+" button at column bottom
│   ├── KanbanDragOverlay.tsx         # Ghost card while dragging
│   └── KanbanEmptyColumn.tsx        # Empty column state
│
└── hooks/
    ├── useKanbanDrag.ts              # DnD event handlers — onDragStart/End/Over
    └── useKanbanColumns.ts           # Derives column layout from stages + items
```

---

## Architecture

### The Board is Config-Driven — Zero Entity Knowledge

```typescript
// core/kanban/components/KanbanBoard.tsx
interface KanbanBoardProps<T> {
  // Columns come from the pipeline stages (Convex DB) — never hardcoded
  columns: KanbanColumn[];

  // Items are grouped by stageId — already shaped by the caller's query
  itemsByColumnId: Record<string, T[]>;

  // Caller provides the card renderer — board stays generic
  renderCard: (item: T, isDragging: boolean) => React.ReactNode;

  // Called when user drops card into a different column
  // Caller decides which mutation to fire
  onCardMove: (itemId: string, fromColumnId: string, toColumnId: string) => Promise<void>;

  // Optional: show aggregate value in column header (e.g. deal pipeline value)
  // Controlled by caller — gated by deals.viewValues permission in deal board
  showColumnValue?: boolean;
  getItemValue?: (item: T) => number | undefined;

  // Optional: inline add card at column bottom
  onAddToColumn?: (columnId: string) => void;

  // Loading and empty states
  isLoading?: boolean;
  emptyState?: React.ReactNode;
}

export type KanbanColumn = {
  id: string;             // stageId from pipeline — "offer_mou", "handover", etc.
  title: string;          // stage name from pipelines table — NEVER hardcoded
  color?: string;         // hex — from pipeline.stages[].color
  isFinal?: boolean;      // final stages rendered differently (greyed, no drag-in)
  finalType?: "positive" | "negative" | "neutral";
  staleAfterDays?: number; // used to detect stale cards — not rendered here, passed to card
};
```

### Drag-and-Drop — One Handler for All Entity Types

```typescript
// core/kanban/hooks/useKanbanDrag.ts
import {
  DndContext, DragOverlay, PointerSensor, KeyboardSensor,
  useSensor, useSensors, closestCorners
} from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";

export function useKanbanDrag<T extends { _id: string }>({
  itemsByColumnId,
  onCardMove,
}: {
  itemsByColumnId: Record<string, T[]>;
  onCardMove: (itemId: string, from: string, to: string) => Promise<void>;
}) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [activeItem, setActiveItem] = useState<T | null>(null);

  // Touch + keyboard support — mobile agents in the field
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor)
  );

  function findColumnForItem(itemId: string): string | null {
    for (const [colId, items] of Object.entries(itemsByColumnId)) {
      if (items.some(i => i._id === itemId)) return colId;
    }
    return null;
  }

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveId(null);
    setActiveItem(null);

    if (!over || active.id === over.id) return;

    const fromColumn = findColumnForItem(active.id as string);
    // `over.id` is either a column id or an item id — resolve to column
    const toColumn = Object.keys(itemsByColumnId).includes(over.id as string)
      ? (over.id as string)
      : findColumnForItem(over.id as string);

    if (!fromColumn || !toColumn || fromColumn === toColumn) return;

    // Caller handles the actual mutation (leads.moveStage or deals.moveStage)
    await onCardMove(active.id as string, fromColumn, toColumn);
  }

  return { activeId, activeItem, sensors, handleDragStart, handleDragEnd, findColumnForItem };
}
```

### KanbanCard Base — Shared Across All Entity Types

```typescript
// core/kanban/components/KanbanCard.tsx
// This is the BASE card. Entity modules extend it.
// It renders: personCode badge, name, assignee avatar, tags, stale indicator.

interface KanbanCardBaseProps {
  personCode?: string;        // "P-001" — shown as badge top-right
  entityCode?: string;        // "D-007" — shown when different from personCode (deals)
  displayName: string;
  assignee?: { name: string; avatarUrl?: string };
  tags?: { name: string; color: string }[];
  isStale?: boolean;          // true when daysInStage > staleAfterDays
  daysInStage?: number;
  isDragging?: boolean;       // ghost appearance while dragging
  onClick?: () => void;       // navigate to detail page

  // Entity-specific content slot (e.g., deal value, lead source badge)
  children?: React.ReactNode;
}

export function KanbanCard({
  personCode, entityCode, displayName, assignee, tags,
  isStale, daysInStage, isDragging, onClick, children
}: KanbanCardBaseProps) {
  return (
    <div
      className={cn(
        "rounded-lg border bg-card p-3 shadow-sm cursor-pointer",
        "hover:shadow-md transition-shadow",
        isStale && "border-l-4 border-l-destructive",   // red left border = stale
        isDragging && "opacity-50 rotate-2 shadow-lg",
      )}
      onClick={onClick}
    >
      {/* Record code badges */}
      <div className="flex items-start justify-between mb-2">
        <span className="text-[10px] font-mono text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
          {entityCode ?? personCode}
        </span>
        {isStale && (
          <Badge variant="destructive" className="text-[10px]">
            Stale {daysInStage}d
          </Badge>
        )}
      </div>

      {/* Display name */}
      <p className="text-sm font-medium leading-snug mb-2 line-clamp-2">{displayName}</p>

      {/* Entity-specific content (deal value, lead source, etc.) */}
      {children}

      {/* Footer: tags + assignee */}
      <div className="flex items-center justify-between mt-2">
        <div className="flex gap-1 flex-wrap">
          {tags?.slice(0, 3).map(tag => (
            <span key={tag.name}
              className="text-[10px] px-1.5 py-0.5 rounded-full text-white"
              style={{ backgroundColor: tag.color }}>
              {tag.name}
            </span>
          ))}
        </div>
        {assignee && (
          <Avatar className="size-5">
            <AvatarImage src={assignee.avatarUrl} />
            <AvatarFallback className="text-[8px]">{assignee.name.slice(0, 2)}</AvatarFallback>
          </Avatar>
        )}
      </div>
    </div>
  );
}
```

### KanbanColumnHeader — Stage Name from DB, Never Hardcoded

```typescript
// core/kanban/components/KanbanColumnHeader.tsx
interface KanbanColumnHeaderProps {
  column: KanbanColumn;
  count: number;
  totalValue?: number;       // sum of item values — only shown if showColumnValue=true
  showValue?: boolean;       // controlled by deals.viewValues permission
  currencyCode?: string;     // "AED" | "USD" | etc. from org settings
}

export function KanbanColumnHeader({ column, count, totalValue, showValue, currencyCode }: KanbanColumnHeaderProps) {
  return (
    <div className="flex items-center justify-between px-2 py-1.5 mb-2">
      <div className="flex items-center gap-2">
        {/* Color dot — from pipeline.stages[].color */}
        <span
          className="size-2 rounded-full flex-shrink-0"
          style={{ backgroundColor: column.color ?? "#94a3b8" }}
        />
        <span className="text-sm font-medium truncate">{column.title}</span>
        <Badge variant="secondary" className="text-xs">{count}</Badge>
      </div>

      {/* Pipeline value — only when caller passes showValue=true (permission-gated) */}
      {showValue && totalValue !== undefined && (
        <span className="text-xs text-muted-foreground font-medium">
          {formatCurrency(totalValue, currencyCode ?? "USD")}
        </span>
      )}
    </div>
  );
}
```

---

## How Deals Use the Kanban

The deals module wires the board — kanban knows nothing about deals:

```typescript
// core/entities/deals/components/DealsBoard.tsx
// This file is ~50 lines — just wiring config to KanbanBoard

export function DealsBoard() {
  const { data: pipeline }       = useQuery(api.pipelines.getDefault, { entityType: "deal" });
  const { data: dealsByStage }   = useQuery(api.deals.listGroupedByStage);
  const canViewValues            = useOrgPermission("deals.viewValues");
  const moveStage                = useMutation(api.deals.moveToStage);
  const { orgSlug }              = useParams();
  const router                   = useAppRouter();

  // Derive columns from pipeline stages (never hardcoded)
  const columns: KanbanColumn[] = pipeline?.stages.map(s => ({
    id:             s.id,
    title:          s.name,           // from DB — "Offer / MOU", "Ejari", "Handover" etc.
    color:          s.color,
    isFinal:        s.isFinal,
    finalType:      s.finalType,
    staleAfterDays: s.staleAfterDays,
  })) ?? [];

  async function handleCardMove(dealId: string, fromStage: string, toStage: string) {
    // Fires the CANONICAL deals mutation — same one used by detail page stage selector
    await moveStage({ dealId: dealId as Id<"deals">, toStageId: toStage });
    // Won deal → confetti fired client-side in this handler
    const toStageObj = pipeline?.stages.find(s => s.id === toStage);
    if (toStageObj?.finalType === "positive") {
      const confetti = (await import("canvas-confetti")).default;
      confetti({ particleCount: 120, spread: 70, origin: { y: 0.6 } });
    }
  }

  return (
    <KanbanBoard
      columns={columns}
      itemsByColumnId={dealsByStage ?? {}}
      renderCard={(deal, isDragging) => (
        <DealCard                          // extends KanbanCard base
          deal={deal}
          isDragging={isDragging}
          showValue={canViewValues}        // permission-gated
          onClick={() => router.push(`/dashboard/${orgSlug}/deals/${deal._id}`)}
        />
      )}
      onCardMove={handleCardMove}
      showColumnValue={canViewValues}
      getItemValue={(deal) => deal.value}
      onAddToColumn={(stageId) => {/* open AddDealDialog pre-filled with stageId */}}
      isLoading={!pipeline || !dealsByStage}
    />
  );
}
```

---

## Staleness Detection — Client-Side, Data from DB

Stale calculation uses `stageEnteredAt` (timestamp on the entity) + `staleAfterDays` (on the pipeline stage). The kanban board does NOT compute this — it's derived in the query or passed as a boolean:

```typescript
// convex/deals/queries.ts::listGroupedByStage
// Returns deals already annotated with isStale + daysInStage
// so the board does zero date math — just renders the flag

return deals.map(deal => ({
  ...deal,
  daysInStage: Math.floor((Date.now() - deal.stageEnteredAt) / 86400000),
  isStale: stage.staleAfterDays
    ? (Date.now() - deal.stageEnteredAt) > stage.staleAfterDays * 86400000
    : false,
}));
```

---

## Mobile Behaviour

On screens < 768px:
- Columns render as a **horizontal scroll carousel** (one visible column at a time, swipe)
- Column header shows a page indicator: `Offer/MOU (2 of 8 stages)`
- Drag-and-drop disabled on touch — replaced by a **stage selector dropdown** on tap
- The dropdown fires the same `moveToStage` mutation as the drag handler

```typescript
// core/kanban/components/KanbanBoard.tsx
const isMobile = useMediaQuery("(max-width: 768px)");

if (isMobile) {
  return <KanbanBoardMobile ... />;   // horizontal scroll + tap-to-stage
}
return <KanbanBoardDesktop ... />;    // full drag-and-drop
```

---

## Package Dependencies

```bash
# Install together with datatable — both are Phase 2 scaffolds
pnpm add @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities canvas-confetti
pnpm add -D @types/canvas-confetti
```

---

## Convex Queries Required

The kanban module does NOT query Convex itself. It consumes data passed from the entity module. The entity module queries:

| Query | Returns |
|---|---|
| `api.pipelines.getDefault({ entityType: "deal" })` | Pipeline with stages array (column config) |
| `api.deals.listGroupedByStage` | `Record<stageId, Deal[]>` — already annotated with `isStale`, `daysInStage` |
| `api.deals.moveToStage` | Mutation — updates `currentStageId` + `stageEnteredAt` + logs activity |

---

## Never-Do List for This Module

```typescript
// ❌ Never hardcode stage names ("Won", "Lost", "Offer") → columns come from DB always
// ❌ Never fetch data inside KanbanBoard → data in, events out
// ❌ Never compute staleness inside the board → comes pre-annotated from Convex query
// ❌ Never fire mutations directly from KanbanBoard → onCardMove callback, caller decides
// ❌ Never show deal value without permission check → canViewValues from caller
// ❌ Never use @dnd-kit/core without keyboard sensor → keyboard accessibility required
```

---

## Phase 8 Extension — Tasks Board

When `features/project-management/` is built in Phase 8, the SAME `KanbanBoard` component is reused for tasks. The only difference is the column config (task statuses instead of pipeline stages) and the card renderer (`TaskCard` instead of `DealCard`). Zero changes to `core/kanban/`.

```typescript
// features/project-management/components/TasksBoard.tsx
// Uses KanbanBoard with:
// columns: [{ id: "todo", title: "To Do" }, { id: "in_progress", title: "In Progress" }, ...]
// renderCard: (task) => <TaskCard task={task} />
// onCardMove: (taskId, from, to) => tasks.moveStatus({ taskId, toStatus: to })
// taskCode shown in card badge (T-001, T-002...)
```

---

## Rules
- [ ] R-KAN-01: KanbanBoard is entity-agnostic — zero entity knowledge inside the component
- [ ] R-KAN-02: Column titles come from pipeline stages (from Settings) — never hardcoded
- [ ] R-KAN-03: Entity labels in kanban headers/empty states MUST use dynamic labels from `orgs.entityLabels`
- [ ] R-KAN-04: Stale/warning colors come from pipeline stage config — never hardcoded
- [ ] R-KAN-05: RTL-safe classes only (ms-*, me-*, ps-*, pe-*)
- [ ] R-KAN-06: rounded-[--radius] only — never rounded-md/lg

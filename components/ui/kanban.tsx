"use client";

import {
	type Announcements,
	type CollisionDetection,
	closestCenter,
	closestCorners,
	DndContext,
	type DndContextProps,
	type DragCancelEvent,
	type DragEndEvent,
	type DraggableAttributes,
	type DraggableSyntheticListeners,
	type DragOverEvent,
	DragOverlay,
	type DragStartEvent,
	type DropAnimation,
	type DroppableContainer,
	defaultDropAnimationSideEffects,
	getFirstCollision,
	KeyboardCode,
	type KeyboardCoordinateGetter,
	KeyboardSensor,
	MeasuringStrategy,
	MouseSensor,
	pointerWithin,
	rectIntersection,
	TouchSensor,
	type UniqueIdentifier,
	useSensor,
	useSensors,
} from "@dnd-kit/core";
import {
	type AnimateLayoutChanges,
	arrayMove,
	defaultAnimateLayoutChanges,
	horizontalListSortingStrategy,
	SortableContext,
	type SortableContextProps,
	useSortable,
	verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Slot as SlotPrimitive } from "radix-ui";
import * as React from "react";
import * as ReactDOM from "react-dom";

import { useComposedRefs } from "@/lib/compose-refs";
import { cn } from "@/lib/utils";

const directions: string[] = [
	KeyboardCode.Down,
	KeyboardCode.Right,
	KeyboardCode.Up,
	KeyboardCode.Left,
];

const coordinateGetter: KeyboardCoordinateGetter = (event, { context }) => {
	const { active, droppableRects, droppableContainers, collisionRect } = context;

	if (directions.includes(event.code)) {
		event.preventDefault();

		if (!active || !collisionRect) return;

		const filteredContainers: DroppableContainer[] = [];

		for (const entry of droppableContainers.getEnabled()) {
			if (!entry || entry?.disabled) return;

			const rect = droppableRects.get(entry.id);

			if (!rect) return;

			const data = entry.data.current;

			if (data) {
				const { type, children } = data;

				if (type === "container" && children?.length > 0) {
					if (active.data.current?.type !== "container") {
						return;
					}
				}
			}

			switch (event.code) {
				case KeyboardCode.Down:
					if (collisionRect.top < rect.top) {
						filteredContainers.push(entry);
					}
					break;
				case KeyboardCode.Up:
					if (collisionRect.top > rect.top) {
						filteredContainers.push(entry);
					}
					break;
				case KeyboardCode.Left:
					if (collisionRect.left >= rect.left + rect.width) {
						filteredContainers.push(entry);
					}
					break;
				case KeyboardCode.Right:
					if (collisionRect.left + collisionRect.width <= rect.left) {
						filteredContainers.push(entry);
					}
					break;
			}
		}

		const collisions = closestCorners({
			active,
			collisionRect: collisionRect,
			droppableRects,
			droppableContainers: filteredContainers,
			pointerCoordinates: null,
		});
		const closestId = getFirstCollision(collisions, "id");

		if (closestId != null) {
			const newDroppable = droppableContainers.get(closestId);
			const newNode = newDroppable?.node.current;
			const newRect = newDroppable?.rect.current;

			if (newNode && newRect) {
				if (newDroppable.id === "placeholder") {
					return {
						x: newRect.left + (newRect.width - collisionRect.width) / 2,
						y: newRect.top + (newRect.height - collisionRect.height) / 2,
					};
				}

				if (newDroppable.data.current?.type === "container") {
					return {
						x: newRect.left + 20,
						y: newRect.top + 74,
					};
				}

				return {
					x: newRect.left,
					y: newRect.top,
				};
			}
		}
	}

	return undefined;
};

const ROOT_NAME = "Kanban";
const BOARD_NAME = "KanbanBoard";
const COLUMN_NAME = "KanbanColumn";
const COLUMN_HANDLE_NAME = "KanbanColumnHandle";
const ITEM_NAME = "KanbanItem";
const ITEM_HANDLE_NAME = "KanbanItemHandle";
const OVERLAY_NAME = "KanbanOverlay";

interface KanbanContextValue<T> {
	id: string;
	items: Record<UniqueIdentifier, T[]>;
	modifiers: DndContextProps["modifiers"];
	strategy: SortableContextProps["strategy"];
	orientation: "horizontal" | "vertical";
	activeId: UniqueIdentifier | null;
	setActiveId: (id: UniqueIdentifier | null) => void;
	getItemValue: (item: T) => UniqueIdentifier;
	flatCursor: boolean;
}

const KanbanContext = React.createContext<KanbanContextValue<unknown> | null>(null);

function useKanbanContext(consumerName: string) {
	const context = React.useContext(KanbanContext);
	if (!context) {
		throw new Error(`\`${consumerName}\` must be used within \`${ROOT_NAME}\``);
	}
	return context;
}

/**
 * Returns the *effective* items map for the surrounding `<Kanban>`.
 *
 * - While the user is mid-drag, this is the optimistic in-flight layout
 *   (the dragged card has been visually inserted at the hover position).
 * - Otherwise it's the parent-supplied `value` prop.
 *
 * Consumers that render their own card list (e.g. `KanbanBoard` rendering
 * cards from `itemsByColumnId`) MUST use this hook instead of reading
 * their parent prop directly during render — otherwise the visual reorder
 * (cards making space, cross-column drop highlight) won't happen on
 * Convex-backed boards where `value` is server-driven and doesn't change
 * until `onCommit` fires.
 */
function useKanbanItems<T = unknown>(): Record<UniqueIdentifier, T[]> {
	const context = React.useContext(KanbanContext);
	if (!context) {
		throw new Error(`\`useKanbanItems\` must be used within \`${ROOT_NAME}\``);
	}
	return context.items as Record<UniqueIdentifier, T[]>;
}

interface GetItemValue<T> {
	/**
	 * Callback that returns a unique identifier for each kanban item. Required for array of objects.
	 * @example getItemValue={(item) => item.id}
	 */
	getItemValue: (item: T) => UniqueIdentifier;
}

type KanbanProps<T> = Omit<DndContextProps, "collisionDetection"> &
	(T extends object ? GetItemValue<T> : Partial<GetItemValue<T>>) & {
		value: Record<UniqueIdentifier, T[]>;
		/**
		 * Fires on EVERY visual reorder during a drag (every drag-over) AND
		 * on drag-end. Use this if you ONLY need to track the visual board
		 * layout (e.g. to drive the rendered card list). DO NOT call
		 * mutations from here — `onDragOver` fires once per crossed sibling
		 * card during a single drag, so a drag across N cards would emit
		 * N+1 mutations.
		 *
		 * For mutations, use `onCommit` instead — that fires exactly once
		 * per drop with the final state.
		 */
		onValueChange?: (columns: Record<UniqueIdentifier, T[]>) => void;
		/**
		 * Fires EXACTLY ONCE per drop, in `onDragEnd`, with the final board
		 * layout AND the id of the card that was physically dragged. This
		 * is the ONLY callback safe for triggering mutations.
		 *
		 * The `draggedItemId` argument is critical: when a card is inserted
		 * into a destination column, the cards in that column visually
		 * reorder, but their server-side `sortOrder` does NOT need to
		 * change — only the dragged card's sortOrder is rewritten as the
		 * fractional midpoint of its new neighbours. Persistence callers
		 * MUST use `draggedItemId` instead of walking the diff, otherwise
		 * a single drop will fire one mutation per displaced card.
		 *
		 * For column-reorder drops (active.id is a column id), the
		 * argument is the column id; consumers handling card-only
		 * persistence should detect this case and ignore.
		 *
		 * When omitted, the Kanban falls back to firing `onValueChange` on
		 * drag-end too — compatible with existing consumers.
		 */
		onCommit?: (columns: Record<UniqueIdentifier, T[]>, draggedItemId: string) => void;
		onMove?: (event: DragEndEvent & { activeIndex: number; overIndex: number }) => void;
		strategy?: SortableContextProps["strategy"];
		orientation?: "horizontal" | "vertical";
		flatCursor?: boolean;
	};

function Kanban<T>(props: KanbanProps<T>) {
	const {
		value,
		onValueChange,
		onCommit,
		modifiers,
		strategy = verticalListSortingStrategy,
		orientation = "horizontal",
		onMove,
		getItemValue: getItemValueProp,
		accessibility,
		flatCursor = false,
		...kanbanProps
	} = props;

	const id = React.useId();
	const [activeId, setActiveId] = React.useState<UniqueIdentifier | null>(null);
	const lastOverIdRef = React.useRef<UniqueIdentifier | null>(null);
	const hasMovedRef = React.useRef(false);
	/**
	 * The "as-if-already-applied" board layout during a drag. While the
	 * user is mid-drag we render this layout (cards reflow / make space /
	 * cross-column drop targets light up) WITHOUT firing any server
	 * mutations. On `onDragEnd` we commit it via `onCommit` exactly once,
	 * then clear it back to `null` so the board falls back to the parent's
	 * `value` prop (which by then will reflect the server's accepted
	 * truth via the optimistic update on the mutation).
	 *
	 * Stored in `useState` not `useRef` because we DO need to re-render
	 * during drag — that's what gives the visual "card makes space" effect
	 * even on Convex-backed boards where `value` is derived from server
	 * data and is therefore not driven by `onValueChange`.
	 */
	const [pendingLayout, setPendingLayout] = React.useState<Record<UniqueIdentifier, T[]> | null>(
		null,
	);
	const sensors = useSensors(
		useSensor(MouseSensor),
		useSensor(TouchSensor),
		useSensor(KeyboardSensor, {
			coordinateGetter,
		}),
	);

	// Effective layout used by render (context). During a drag this is
	// the optimistic pending layout; otherwise it's the parent-supplied
	// `value` prop. This is the single source of truth for any descendant
	// reading `items` from `KanbanContext`.
	const effectiveValue = pendingLayout ?? value;

	const getItemValue = React.useCallback(
		(item: T): UniqueIdentifier => {
			if (typeof item === "object" && !getItemValueProp) {
				throw new Error("`getItemValue` is required when using array of objects");
			}
			return getItemValueProp ? getItemValueProp(item) : (item as UniqueIdentifier);
		},
		[getItemValueProp],
	);

	const getColumn = React.useCallback(
		(id: UniqueIdentifier) => {
			if (id in value) return id;

			for (const [columnId, items] of Object.entries(value)) {
				if (items.some((item) => getItemValue(item) === id)) {
					return columnId;
				}
			}

			return null;
		},
		[value, getItemValue],
	);

	const collisionDetection: CollisionDetection = React.useCallback(
		(args) => {
			if (activeId && activeId in value) {
				return closestCenter({
					...args,
					droppableContainers: args.droppableContainers.filter(
						(container) => container.id in value,
					),
				});
			}

			const pointerIntersections = pointerWithin(args);
			const intersections =
				pointerIntersections.length > 0 ? pointerIntersections : rectIntersection(args);
			let overId = getFirstCollision(intersections, "id");

			if (!overId) {
				if (hasMovedRef.current) {
					lastOverIdRef.current = activeId;
				}
				return lastOverIdRef.current ? [{ id: lastOverIdRef.current }] : [];
			}

			if (overId in value) {
				const containerItems = value[overId];
				if (containerItems && containerItems.length > 0) {
					const closestItem = closestCenter({
						...args,
						droppableContainers: args.droppableContainers.filter(
							(container) =>
								container.id !== overId &&
								containerItems.some((item) => getItemValue(item) === container.id),
						),
					});

					if (closestItem.length > 0) {
						overId = closestItem[0]?.id ?? overId;
					}
				}
			}

			lastOverIdRef.current = overId;
			return [{ id: overId }];
		},
		[activeId, value, getItemValue],
	);

	const onDragStart = React.useCallback(
		(event: DragStartEvent) => {
			kanbanProps.onDragStart?.(event);

			if (event.activatorEvent.defaultPrevented) return;
			setActiveId(event.active.id);
		},
		// eslint-disable-next-line react-hooks/exhaustive-deps -- kanbanProps is unstable object ref, using specific prop
		[kanbanProps.onDragStart],
	);

	const onDragOver = React.useCallback(
		(event: DragOverEvent) => {
			kanbanProps.onDragOver?.(event);

			if (event.activatorEvent.defaultPrevented) return;

			const { active, over } = event;
			if (!over) return;

			// Render source: prefer the in-flight pending layout from a
			// previous onDragOver this drag; otherwise the parent-supplied
			// `value` prop.
			setPendingLayout((prev) => {
				const layout = prev ?? value;

				const getColumnFrom = (id: UniqueIdentifier): UniqueIdentifier | null => {
					if (id in layout) return id;
					for (const [columnId, items] of Object.entries(layout)) {
						if (items.some((item) => getItemValue(item) === id)) {
							return columnId;
						}
					}
					return null;
				};

				const activeColumn = getColumnFrom(active.id);
				const overColumn = getColumnFrom(over.id);
				if (!activeColumn || !overColumn) return prev;

				if (activeColumn === overColumn) {
					const items = layout[activeColumn];
					if (!items) return prev;

					const activeIndex = items.findIndex((item) => getItemValue(item) === active.id);
					const overIndex = items.findIndex((item) => getItemValue(item) === over.id);
					if (activeIndex === overIndex || activeIndex === -1) return prev;

					const newColumns = { ...layout };
					newColumns[activeColumn] = arrayMove(items, activeIndex, overIndex);
					onValueChange?.(newColumns);
					return newColumns;
				}

				// Cross-column drag-over: move the active item from its
				// current column into the destination column. Insertion
				// position is end-of-column (dnd-kit's standard behaviour
				// for cross-column hover that's not over a specific item).
				const activeItems = layout[activeColumn];
				const overItems = layout[overColumn];
				if (!activeItems || !overItems) return prev;

				const activeIndex = activeItems.findIndex(
					(item) => getItemValue(item) === active.id,
				);
				if (activeIndex === -1) return prev;
				const activeItem = activeItems[activeIndex];
				if (!activeItem) return prev;

				const updatedItems = {
					...layout,
					[activeColumn]: activeItems.filter((item) => getItemValue(item) !== active.id),
					[overColumn]: [...overItems, activeItem],
				};
				hasMovedRef.current = true;
				onValueChange?.(updatedItems);
				return updatedItems;
			});
		},
		// eslint-disable-next-line react-hooks/exhaustive-deps -- kanbanProps is unstable object ref, using specific prop
		[value, getItemValue, onValueChange, kanbanProps.onDragOver],
	);

	const onDragEnd = React.useCallback(
		(event: DragEndEvent) => {
			kanbanProps.onDragEnd?.(event);

			if (event.activatorEvent.defaultPrevented) return;

			const { active, over } = event;

			// Snapshot the final layout so we can fire `onCommit` exactly
			// once at the end of this handler. We rebuild it incrementally
			// below — branches that re-arrange `value` write into
			// `committedColumns`; branches that only `setActiveId(null)` and
			// return leave it equal to `value` (no commit fires when there's
			// no change anyway).
			let committedColumns: Record<UniqueIdentifier, T[]> | null = null;

			// Source-of-truth for this drop: any onDragOver during the drag
			// will have populated `pendingLayout`. If it didn't (no reorder
			// happened — drop on origin), fall back to `value`.
			const layout = pendingLayout ?? value;

			if (!over) {
				setPendingLayout(null);
				setActiveId(null);
				return;
			}

			if (active.id in value && over.id in value) {
				// Column reorder — active and over are both column ids.
				const activeIndex = Object.keys(layout).indexOf(active.id as string);
				const overIndex = Object.keys(layout).indexOf(over.id as string);

				if (activeIndex !== overIndex) {
					const orderedColumns = Object.keys(layout);
					const newOrder = arrayMove(orderedColumns, activeIndex, overIndex);

					const newColumns: Record<UniqueIdentifier, T[]> = {};
					for (const key of newOrder) {
						const items = layout[key];
						if (items) {
							newColumns[key] = items;
						}
					}

					committedColumns = newColumns;
					if (onMove) {
						onMove({ ...event, activeIndex, overIndex });
					} else if (!onCommit) {
						// Legacy path: caller still listens via onValueChange.
						onValueChange?.(newColumns);
					}
				}
			} else {
				// Item reorder — one of in-column or cross-column.
				const lookupColumn = (id: UniqueIdentifier): UniqueIdentifier | null => {
					if (id in layout) return id;
					for (const [columnId, items] of Object.entries(layout)) {
						if (items.some((item) => getItemValue(item) === id)) {
							return columnId;
						}
					}
					return null;
				};

				const activeColumn = lookupColumn(active.id);
				const overColumn = lookupColumn(over.id);

				if (!activeColumn || !overColumn) {
					setPendingLayout(null);
					setActiveId(null);
					return;
				}

				if (activeColumn === overColumn) {
					const items = layout[activeColumn];
					if (!items) {
						setPendingLayout(null);
						setActiveId(null);
						return;
					}

					const activeIndex = items.findIndex((item) => getItemValue(item) === active.id);
					const overIndex = items.findIndex((item) => getItemValue(item) === over.id);

					if (activeIndex !== overIndex) {
						const newColumns = { ...layout };
						newColumns[activeColumn] = arrayMove(items, activeIndex, overIndex);
						committedColumns = newColumns;
						if (onMove) {
							onMove({
								...event,
								activeIndex,
								overIndex,
							});
						} else if (!onCommit) {
							onValueChange?.(newColumns);
						}
					} else if (hasMovedRef.current) {
						// Cross-column move that ended at a different
						// column — `layout` already reflects it via the
						// pending ref; commit as-is.
						committedColumns = layout;
					}
				} else if (hasMovedRef.current) {
					// Cross-column move — `layout` (via pendingLayout)
					// already has the item in `overColumn`. Commit as-is.
					committedColumns = layout;
				}
			}

			// Single commit point — fires AT MOST ONCE per drop with the
			// final layout. Mutations belong here, never in onDragOver.
			// We forward `active.id` so the consumer knows which item was
			// physically dragged (vs the items merely displaced by the
			// insertion). Persisting only the dragged card avoids the
			// per-displaced-card mutation explosion on dense boards.
			if (onCommit && committedColumns !== null) {
				onCommit(committedColumns, active.id as string);
			}

			// Keep the optimistic layout visible for one frame after the
			// drop so the card doesn't snap to its old position before the
			// server confirms. The optimistic update on the mutation will
			// re-render the parent's `value` to reflect the new sortOrder
			// in the next frame; clearing on the same tick would otherwise
			// flash. Setting to null inline here is safe because React
			// schedules the parent's optimistic re-render synchronously
			// alongside our commit callback.
			setPendingLayout(null);
			setActiveId(null);
			hasMovedRef.current = false;
		},
		// eslint-disable-next-line react-hooks/exhaustive-deps -- kanbanProps is unstable object ref, using specific prop
		[
			value,
			getItemValue,
			onValueChange,
			onCommit,
			onMove,
			pendingLayout,
			kanbanProps.onDragEnd,
		],
	);

	const onDragCancel = React.useCallback(
		(event: DragCancelEvent) => {
			kanbanProps.onDragCancel?.(event);

			if (event.activatorEvent.defaultPrevented) return;

			setPendingLayout(null);
			setActiveId(null);
			hasMovedRef.current = false;
		},
		// eslint-disable-next-line react-hooks/exhaustive-deps -- kanbanProps is unstable object ref, using specific prop
		[kanbanProps.onDragCancel],
	);

	const announcements: Announcements = React.useMemo(
		() => ({
			onDragStart({ active }) {
				const isColumn = active.id in value;
				const itemType = isColumn ? "column" : "item";
				const position = isColumn
					? Object.keys(value).indexOf(active.id as string) + 1
					: (() => {
							const column = getColumn(active.id);
							if (!column || !value[column]) return 1;
							return (
								value[column].findIndex(
									(item) => getItemValue(item) === active.id,
								) + 1
							);
						})();
				const total = isColumn
					? Object.keys(value).length
					: (() => {
							const column = getColumn(active.id);
							return column ? (value[column]?.length ?? 0) : 0;
						})();

				return `Picked up ${itemType} at position ${position} of ${total}`;
			},
			onDragOver({ active, over }) {
				if (!over) return;

				const isColumn = active.id in value;
				const itemType = isColumn ? "column" : "item";
				const position = isColumn
					? Object.keys(value).indexOf(over.id as string) + 1
					: (() => {
							const column = getColumn(over.id);
							if (!column || !value[column]) return 1;
							return (
								value[column].findIndex((item) => getItemValue(item) === over.id) +
								1
							);
						})();
				const total = isColumn
					? Object.keys(value).length
					: (() => {
							const column = getColumn(over.id);
							return column ? (value[column]?.length ?? 0) : 0;
						})();

				const overColumn = getColumn(over.id);
				const activeColumn = getColumn(active.id);

				if (isColumn) {
					return `${itemType} is now at position ${position} of ${total}`;
				}

				if (activeColumn !== overColumn) {
					return `${itemType} is now at position ${position} of ${total} in ${overColumn}`;
				}

				return `${itemType} is now at position ${position} of ${total}`;
			},
			onDragEnd({ active, over }) {
				if (!over) return;

				const isColumn = active.id in value;
				const itemType = isColumn ? "column" : "item";
				const position = isColumn
					? Object.keys(value).indexOf(over.id as string) + 1
					: (() => {
							const column = getColumn(over.id);
							if (!column || !value[column]) return 1;
							return (
								value[column].findIndex((item) => getItemValue(item) === over.id) +
								1
							);
						})();
				const total = isColumn
					? Object.keys(value).length
					: (() => {
							const column = getColumn(over.id);
							return column ? (value[column]?.length ?? 0) : 0;
						})();

				const overColumn = getColumn(over.id);
				const activeColumn = getColumn(active.id);

				if (isColumn) {
					return `${itemType} was dropped at position ${position} of ${total}`;
				}

				if (activeColumn !== overColumn) {
					return `${itemType} was dropped at position ${position} of ${total} in ${overColumn}`;
				}

				return `${itemType} was dropped at position ${position} of ${total}`;
			},
			onDragCancel({ active }) {
				const isColumn = active.id in value;
				const itemType = isColumn ? "column" : "item";
				return `Dragging was cancelled. ${itemType} was dropped.`;
			},
		}),
		[value, getColumn, getItemValue],
	);

	const contextValue = React.useMemo<KanbanContextValue<T>>(
		() => ({
			id,
			items: effectiveValue,
			modifiers,
			strategy,
			orientation,
			activeId,
			setActiveId,
			getItemValue,
			flatCursor,
		}),
		[id, effectiveValue, activeId, modifiers, strategy, orientation, getItemValue, flatCursor],
	);

	return (
		<KanbanContext.Provider value={contextValue as KanbanContextValue<unknown>}>
			<DndContext
				collisionDetection={collisionDetection}
				modifiers={modifiers}
				sensors={sensors}
				{...kanbanProps}
				id={id}
				measuring={{
					droppable: {
						strategy: MeasuringStrategy.Always,
					},
				}}
				onDragStart={onDragStart}
				onDragOver={onDragOver}
				onDragEnd={onDragEnd}
				onDragCancel={onDragCancel}
				accessibility={{
					announcements,
					screenReaderInstructions: {
						draggable: `
            To pick up a kanban item or column, press space or enter.
            While dragging, use the arrow keys to move the item.
            Press space or enter again to drop the item in its new position, or press escape to cancel.
          `,
					},
					...accessibility,
				}}
			/>
		</KanbanContext.Provider>
	);
}

const KanbanBoardContext = React.createContext<boolean>(false);

interface KanbanBoardProps extends React.ComponentProps<"div"> {
	children: React.ReactNode;
	asChild?: boolean;
}

function KanbanBoard(props: KanbanBoardProps) {
	const { asChild, className, ref, ...boardProps } = props;

	const context = useKanbanContext(BOARD_NAME);

	const columns = React.useMemo(() => {
		return Object.keys(context.items);
	}, [context.items]);

	const BoardPrimitive = asChild ? SlotPrimitive.Slot : "div";

	return (
		<KanbanBoardContext.Provider value={true}>
			<SortableContext
				items={columns}
				strategy={
					context.orientation === "horizontal"
						? horizontalListSortingStrategy
						: verticalListSortingStrategy
				}
			>
				<BoardPrimitive
					aria-orientation={context.orientation}
					data-orientation={context.orientation}
					data-slot="kanban-board"
					{...boardProps}
					ref={ref}
					className={cn(
						"flex size-full gap-4",
						context.orientation === "horizontal" ? "flex-row" : "flex-col",
						className,
					)}
				/>
			</SortableContext>
		</KanbanBoardContext.Provider>
	);
}

interface KanbanColumnContextValue {
	id: string;
	attributes: DraggableAttributes;
	listeners: DraggableSyntheticListeners | undefined;
	setActivatorNodeRef: (node: HTMLElement | null) => void;
	isDragging?: boolean;
	disabled?: boolean;
}

const KanbanColumnContext = React.createContext<KanbanColumnContextValue | null>(null);

function useKanbanColumnContext(consumerName: string) {
	const context = React.useContext(KanbanColumnContext);
	if (!context) {
		throw new Error(`\`${consumerName}\` must be used within \`${COLUMN_NAME}\``);
	}
	return context;
}

const animateLayoutChanges: AnimateLayoutChanges = (args) =>
	defaultAnimateLayoutChanges({ ...args, wasDragging: true });

interface KanbanColumnProps extends React.ComponentProps<"div"> {
	value: UniqueIdentifier;
	children: React.ReactNode;
	asChild?: boolean;
	asHandle?: boolean;
	disabled?: boolean;
	/**
	 * Override the SortableContext strategy for items inside this column.
	 * Defaults to the orientation-derived strategy (vertical list for the
	 * standard column layout). Pass `rectSortingStrategy` when the column
	 * uses a 2D grid layout (e.g. the notes sticky board), so dnd-kit's
	 * drag-collision math accounts for both axes.
	 */
	itemStrategy?: SortableContextProps["strategy"];
}

function KanbanColumn(props: KanbanColumnProps) {
	const {
		value,
		asChild,
		asHandle,
		disabled,
		itemStrategy,
		className,
		style,
		ref,
		...columnProps
	} = props;

	const id = React.useId();
	const context = useKanbanContext(COLUMN_NAME);
	const inBoard = React.useContext(KanbanBoardContext);
	const inOverlay = React.useContext(KanbanOverlayContext);

	if (!inBoard && !inOverlay) {
		throw new Error(
			`\`${COLUMN_NAME}\` must be used within \`${BOARD_NAME}\` or \`${OVERLAY_NAME}\``,
		);
	}

	if (value === "") {
		throw new Error(`\`${COLUMN_NAME}\` value cannot be an empty string`);
	}

	const {
		attributes,
		listeners,
		setNodeRef,
		setActivatorNodeRef,
		transform,
		transition,
		isDragging,
	} = useSortable({
		id: value,
		disabled,
		animateLayoutChanges,
	});

	const composedRef = useComposedRefs(ref, (node) => {
		if (disabled) return;
		setNodeRef(node);
	});

	const composedStyle = React.useMemo<React.CSSProperties>(() => {
		return {
			transform: CSS.Transform.toString(transform),
			transition,
			...style,
		};
	}, [transform, transition, style]);

	const items = React.useMemo(() => {
		const items = context.items[value] ?? [];
		return items.map((item) => context.getItemValue(item));
		// eslint-disable-next-line react-hooks/exhaustive-deps -- context is unstable object ref, using specific properties
	}, [context.items, value, context.getItemValue]);

	const columnContext = React.useMemo<KanbanColumnContextValue>(
		() => ({
			id,
			attributes,
			listeners,
			setActivatorNodeRef,
			isDragging,
			disabled,
		}),
		[id, attributes, listeners, setActivatorNodeRef, isDragging, disabled],
	);

	const ColumnPrimitive = asChild ? SlotPrimitive.Slot : "div";

	return (
		<KanbanColumnContext.Provider value={columnContext}>
			<SortableContext
				items={items}
				strategy={
					itemStrategy ??
					(context.orientation === "horizontal"
						? horizontalListSortingStrategy
						: verticalListSortingStrategy)
				}
			>
				<ColumnPrimitive
					id={id}
					data-disabled={disabled}
					data-dragging={isDragging ? "" : undefined}
					data-slot="kanban-column"
					{...columnProps}
					{...(asHandle && !disabled ? attributes : {})}
					{...(asHandle && !disabled ? listeners : {})}
					ref={composedRef}
					style={composedStyle}
					className={cn(
						"flex size-full flex-col gap-2 rounded-[var(--radius)] border bg-zinc-100 p-2.5 aria-disabled:pointer-events-none aria-disabled:opacity-50 dark:bg-zinc-900",
						{
							"touch-none select-none": asHandle,
							"cursor-default": context.flatCursor,
							"data-dragging:cursor-grabbing": !context.flatCursor,
							"cursor-grab": !isDragging && asHandle && !context.flatCursor,
							"opacity-50": isDragging,
							"pointer-events-none opacity-50": disabled,
						},
						className,
					)}
				/>
			</SortableContext>
		</KanbanColumnContext.Provider>
	);
}

interface KanbanColumnHandleProps extends React.ComponentProps<"button"> {
	asChild?: boolean;
}

function KanbanColumnHandle(props: KanbanColumnHandleProps) {
	const { asChild, disabled, className, ref, ...columnHandleProps } = props;

	const context = useKanbanContext(COLUMN_NAME);
	const columnContext = useKanbanColumnContext(COLUMN_HANDLE_NAME);

	const isDisabled = disabled ?? columnContext.disabled;

	const composedRef = useComposedRefs(ref, (node) => {
		if (isDisabled) return;
		columnContext.setActivatorNodeRef(node);
	});

	const HandlePrimitive = asChild ? SlotPrimitive.Slot : "button";

	return (
		<HandlePrimitive
			type="button"
			aria-controls={columnContext.id}
			data-disabled={isDisabled}
			data-dragging={columnContext.isDragging ? "" : undefined}
			data-slot="kanban-column-handle"
			{...columnHandleProps}
			{...(isDisabled ? {} : columnContext.attributes)}
			{...(isDisabled ? {} : columnContext.listeners)}
			ref={composedRef}
			className={cn(
				"select-none disabled:pointer-events-none disabled:opacity-50",
				context.flatCursor ? "cursor-default" : "cursor-grab data-dragging:cursor-grabbing",
				className,
			)}
			disabled={isDisabled}
		/>
	);
}

interface KanbanItemContextValue {
	id: string;
	attributes: DraggableAttributes;
	listeners: DraggableSyntheticListeners | undefined;
	setActivatorNodeRef: (node: HTMLElement | null) => void;
	isDragging?: boolean;
	disabled?: boolean;
}

const KanbanItemContext = React.createContext<KanbanItemContextValue | null>(null);

function useKanbanItemContext(consumerName: string) {
	const context = React.useContext(KanbanItemContext);
	if (!context) {
		throw new Error(`\`${consumerName}\` must be used within \`${ITEM_NAME}\``);
	}
	return context;
}

interface KanbanItemProps extends React.ComponentProps<"div"> {
	value: UniqueIdentifier;
	asHandle?: boolean;
	asChild?: boolean;
	disabled?: boolean;
}

function KanbanItem(props: KanbanItemProps) {
	const { value, style, asHandle, asChild, disabled, className, ref, ...itemProps } = props;

	const id = React.useId();
	const context = useKanbanContext(ITEM_NAME);
	const inBoard = React.useContext(KanbanBoardContext);
	const inOverlay = React.useContext(KanbanOverlayContext);

	if (!inBoard && !inOverlay) {
		throw new Error(`\`${ITEM_NAME}\` must be used within \`${BOARD_NAME}\``);
	}

	const {
		attributes,
		listeners,
		setNodeRef,
		setActivatorNodeRef,
		transform,
		transition,
		isDragging,
	} = useSortable({ id: value, disabled });

	if (value === "") {
		throw new Error(`\`${ITEM_NAME}\` value cannot be an empty string`);
	}

	const composedRef = useComposedRefs(ref, (node) => {
		if (disabled) return;
		setNodeRef(node);
	});

	const composedStyle = React.useMemo<React.CSSProperties>(() => {
		return {
			transform: CSS.Transform.toString(transform),
			transition,
			...style,
		};
	}, [transform, transition, style]);

	const itemContext = React.useMemo<KanbanItemContextValue>(
		() => ({
			id,
			attributes,
			listeners,
			setActivatorNodeRef,
			isDragging,
			disabled,
		}),
		[id, attributes, listeners, setActivatorNodeRef, isDragging, disabled],
	);

	const ItemPrimitive = asChild ? SlotPrimitive.Slot : "div";

	return (
		<KanbanItemContext.Provider value={itemContext}>
			<ItemPrimitive
				id={id}
				data-disabled={disabled}
				data-dragging={isDragging ? "" : undefined}
				data-slot="kanban-item"
				{...itemProps}
				{...(asHandle && !disabled ? attributes : {})}
				{...(asHandle && !disabled ? listeners : {})}
				ref={composedRef}
				style={composedStyle}
				className={cn(
					"focus-visible:ring-ring focus-visible:ring-1 focus-visible:ring-offset-1 focus-visible:outline-hidden",
					{
						"touch-none select-none": asHandle,
						"cursor-default": context.flatCursor,
						"data-dragging:cursor-grabbing": !context.flatCursor,
						"cursor-grab": !isDragging && asHandle && !context.flatCursor,
						// While dragging the overlay clone is what the user sees.
						// Hide the source card entirely (visibility:hidden keeps
						// its slot in the column so layout doesn't jump). This
						// avoids the faded "ghost" at the original position.
						invisible: isDragging,
						"pointer-events-none opacity-50": disabled,
					},
					className,
				)}
			/>
		</KanbanItemContext.Provider>
	);
}

interface KanbanItemHandleProps extends React.ComponentProps<"button"> {
	asChild?: boolean;
}

function KanbanItemHandle(props: KanbanItemHandleProps) {
	const { asChild, disabled, className, ref, ...itemHandleProps } = props;

	const context = useKanbanContext(ITEM_HANDLE_NAME);
	const itemContext = useKanbanItemContext(ITEM_HANDLE_NAME);

	const isDisabled = disabled ?? itemContext.disabled;

	const composedRef = useComposedRefs(ref, (node) => {
		if (isDisabled) return;
		itemContext.setActivatorNodeRef(node);
	});

	const HandlePrimitive = asChild ? SlotPrimitive.Slot : "button";

	return (
		<HandlePrimitive
			type="button"
			aria-controls={itemContext.id}
			data-disabled={isDisabled}
			data-dragging={itemContext.isDragging ? "" : undefined}
			data-slot="kanban-item-handle"
			{...itemHandleProps}
			{...(isDisabled ? {} : itemContext.attributes)}
			{...(isDisabled ? {} : itemContext.listeners)}
			ref={composedRef}
			className={cn(
				"select-none disabled:pointer-events-none disabled:opacity-50",
				context.flatCursor ? "cursor-default" : "cursor-grab data-dragging:cursor-grabbing",
				className,
			)}
			disabled={isDisabled}
		/>
	);
}

const KanbanOverlayContext = React.createContext(false);

const dropAnimation: DropAnimation = {
	sideEffects: defaultDropAnimationSideEffects({
		styles: {
			// Keep the dropped card at full opacity so there is no fade flash
			// at the destination column.
			active: {
				opacity: "1",
			},
		},
	}),
};

interface KanbanOverlayProps extends Omit<React.ComponentProps<typeof DragOverlay>, "children"> {
	container?: Element | DocumentFragment | null;
	children?:
		| React.ReactNode
		| ((params: { value: UniqueIdentifier; variant: "column" | "item" }) => React.ReactNode);
}

function KanbanOverlay(props: KanbanOverlayProps) {
	const { container: containerProp, children, ...overlayProps } = props;

	const context = useKanbanContext(OVERLAY_NAME);

	const [mounted, setMounted] = React.useState(false);

	React.useLayoutEffect(() => setMounted(true), []);

	const container = containerProp ?? (mounted ? globalThis.document?.body : null);

	if (!container) return null;

	const variant = context.activeId && context.activeId in context.items ? "column" : "item";

	return ReactDOM.createPortal(
		<DragOverlay
			dropAnimation={dropAnimation}
			modifiers={context.modifiers}
			className={cn(!context.flatCursor && "cursor-grabbing")}
			{...overlayProps}
		>
			<KanbanOverlayContext.Provider value={true}>
				{context.activeId && children
					? typeof children === "function"
						? children({
								value: context.activeId,
								variant,
							})
						: children
					: null}
			</KanbanOverlayContext.Provider>
		</DragOverlay>,
		container,
	);
}

export {
	Kanban,
	KanbanBoard,
	KanbanColumn,
	KanbanColumnHandle,
	KanbanItem,
	KanbanItemHandle,
	KanbanOverlay,
	//
	type KanbanProps,
	useKanbanItems,
};

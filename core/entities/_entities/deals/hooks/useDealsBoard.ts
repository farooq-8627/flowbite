"use client";

import { useMutation } from "convex/react";
import { useCallback, useMemo } from "react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import type { KanbanColumnConfig } from "@/core/data-display/kanban/components/KanbanBoard";
import { computeSortOrderForDrop } from "@/core/data-display/kanban/utils/sort-order";
import { getStatusColor } from "@/core/entities/shared/config/defaults";
import {
	useAttachTagToEntity,
	useDetachTagFromEntity,
	useMoveDealToStage,
	useUpdateDeal,
} from "@/core/entities/shared/hooks/useEntityMutations";
import { NO_GROUP_KEY } from "@/core/entities/shared/utils/board-grouping";
import type { RankedSearchResult } from "@/core/entities/shared/utils/search";
import { useEntityLabels } from "@/core/shell/shared/hooks/useEntityLabels";
import { normalizeErrorDescription } from "@/lib/normalizeError";

type DealRow = Record<string, unknown> & { id: string };

interface BlockPolicyData {
	dealId: string;
	targetStageId: string;
	targetStageName: string;
	missingFields: Array<{ name: string; label: string }>;
	sortOrder: number;
}

/** Args passed to the consumer when a card is dropped on a NEGATIVE-final stage.
 *  Consumer opens MarkAsLostDialog with this deal pre-filled. */
interface MarkLostFromDragData {
	deal: Doc<"deals">;
	targetStageId: string;
	sortOrder: number;
}

interface UseDealsBoardArgs {
	orgId: Id<"orgs"> | undefined;
	groupBy: string;
	pipeline: Doc<"pipelines"> | undefined;
	grouped:
		| Record<string, Array<Doc<"deals"> & { daysInStage: number; isStale: boolean }>>
		| undefined;
	rankedItems: RankedSearchResult<DealRow>;
	memberNameById: Map<string, string>;
	onBlockPolicy?: (data: BlockPolicyData) => void;
	/**
	 * Called when a card is dragged onto a NEGATIVE-final stage. Mark-as-lost
	 * is destructive + irreversible, so we surface the confirmation dialog
	 * (type-the-dealCode) instead of running the mutation silently.
	 */
	onMarkLostFromDrag?: (data: MarkLostFromDragData) => void;
}

export function useDealsBoard({
	orgId,
	groupBy,
	pipeline,
	grouped,
	rankedItems,
	memberNameById,
	onBlockPolicy,
	onMarkLostFromDrag,
}: UseDealsBoardArgs) {
	const labels = useEntityLabels();
	const moveToStage = useMoveDealToStage();
	const updateDeal = useUpdateDeal();
	const attachTag = useAttachTagToEntity();
	const detachTag = useDetachTagFromEntity();
	const closeAsDone = useMutation(api.crm.entities.deals.mutations.closeAsDone);

	const boardColumns: KanbanColumnConfig[] = useMemo(() => {
		if (groupBy === "currentStageId") {
			if (!pipeline?.stages) return [];
			return pipeline.stages.map((s) => ({
				id: s.id,
				title: s.name,
				color: s.color,
				isFinal: s.isFinal,
				finalType: s.finalType,
			}));
		}
		if (groupBy === "assignedTo") {
			const assignees = new Set<string>();
			for (const it of rankedItems.items) {
				const a = (it as Record<string, unknown>).assignedTo as string | undefined;
				assignees.add(a ? String(a) : NO_GROUP_KEY);
			}
			return Array.from(assignees).map((a) => ({
				id: a,
				title: a === NO_GROUP_KEY ? "Unassigned" : (memberNameById.get(a) ?? a),
				color: getStatusColor("deal", a === NO_GROUP_KEY ? "open" : "won"),
			}));
		}
		const values = new Set<string>();
		for (const it of rankedItems.items) {
			const raw = (it as Record<string, unknown>)[groupBy];
			values.add(raw ? String(raw) : NO_GROUP_KEY);
		}
		return Array.from(values).map((v) => ({
			id: v,
			title: v === NO_GROUP_KEY ? "—" : v,
			color: getStatusColor("deal", v),
		}));
	}, [groupBy, pipeline, rankedItems.items, memberNameById]);

	const itemsByColumnId = useMemo(() => {
		const ranked = new Set(rankedItems.matchedIds);

		const sortColumn = (rows: DealRow[]): DealRow[] =>
			rows.slice().sort((a, b) => {
				const aMatch = ranked.has(a.id);
				const bMatch = ranked.has(b.id);
				if (aMatch !== bMatch) return aMatch ? -1 : 1;
				const aKey =
					(a as { sortOrder?: number; _creationTime?: number }).sortOrder ??
					-((a as { _creationTime?: number })._creationTime ?? 0);
				const bKey =
					(b as { sortOrder?: number; _creationTime?: number }).sortOrder ??
					-((b as { _creationTime?: number })._creationTime ?? 0);
				return aKey - bKey;
			});

		if (groupBy === "currentStageId") {
			if (!grouped) return {};
			const result: Record<string, DealRow[]> = {};
			for (const [stageId, deals] of Object.entries(grouped)) {
				result[stageId] = sortColumn(
					(deals as Array<Record<string, unknown>>).map((d) => ({
						...d,
						id: (d._id ?? d.id) as string,
					})) as DealRow[],
				);
			}
			return result;
		}

		const result: Record<string, DealRow[]> = {};
		for (const col of boardColumns) result[col.id] = [];
		for (const it of rankedItems.items as DealRow[]) {
			const raw = (it as Record<string, unknown>)[groupBy];
			const key = raw ? String(raw) : NO_GROUP_KEY;
			if (!result[key]) result[key] = [];
			result[key].push(it);
		}
		for (const key of Object.keys(result)) {
			result[key] = sortColumn(result[key]);
		}
		return result;
	}, [groupBy, grouped, rankedItems.matchedIds, rankedItems.items, boardColumns]);

	const handleCardMove = useCallback(
		async (itemId: string, fromCol: string, toCol: string, newIndex: number) => {
			if (!orgId) return;

			const destBefore = itemsByColumnId[toCol] ?? [];
			let itemsAfter: DealRow[];
			if (fromCol === toCol) {
				const oldIndex = destBefore.findIndex((it) => it.id === itemId);
				if (oldIndex < 0) {
					itemsAfter = destBefore;
				} else {
					const copy = destBefore.slice();
					const [moved] = copy.splice(oldIndex, 1);
					copy.splice(newIndex, 0, moved);
					itemsAfter = copy;
				}
			} else {
				const movedItem = (rankedItems.items as DealRow[]).find((it) => it.id === itemId);
				if (!movedItem) return;
				const copy = destBefore.slice();
				copy.splice(newIndex, 0, movedItem);
				itemsAfter = copy;
			}
			const sortOrder = computeSortOrderForDrop(
				itemsAfter as Array<{ id: string; sortOrder?: number; _creationTime?: number }>,
				newIndex,
			);

			try {
				if (fromCol === toCol) {
					await updateDeal({ orgId, dealId: itemId as Id<"deals">, sortOrder });
					return;
				}
				if (groupBy === "currentStageId") {
					const toStage = pipeline?.stages.find((s) => s.id === toCol);

					// Negative-final drop → MUST go through MarkAsLost
					// confirmation dialog (compulsory per user spec — type
					// dealCode to confirm). Bail out of the silent move.
					if (toStage?.isFinal && toStage.finalType === "negative") {
						const movedItem = (rankedItems.items as DealRow[]).find(
							(it) => it.id === itemId,
						);
						if (movedItem && onMarkLostFromDrag) {
							onMarkLostFromDrag({
								deal: movedItem as unknown as Doc<"deals">,
								targetStageId: toCol,
								sortOrder,
							});
						} else {
							toast.error(
								`Open the deal and choose "Mark as lost" to move it to ${toStage.name}.`,
							);
						}
						return;
					}

					// Positive-final drop → use closeAsDone so wonAt is set
					// AND the deal auto-moves to the positive-final stage.
					// Plain moveToStage would relocate the card without
					// closing the deal (no confetti + no won timestamp).
					if (toStage?.isFinal && toStage.finalType === "positive") {
						try {
							await closeAsDone({
								orgId,
								dealId: itemId as Id<"deals">,
								finalType: "positive",
							});
							toast.success(`🎉 ${labels.deal.singular} won!`);
							import("canvas-confetti")
								.then((mod) => mod.default({ particleCount: 100, spread: 70 }))
								.catch(() => {});
						} catch (err) {
							const errorData = (err as { data?: Record<string, unknown> })?.data;
							const code =
								typeof errorData === "object" && errorData !== null
									? (errorData.code as string | undefined)
									: undefined;
							if (code === "MISSING_REQUIRED_FIELDS_FOR_DONE") {
								const data = errorData as {
									missingFields?: Array<{ label: string; stageName: string }>;
								};
								const labelList = (data.missingFields ?? [])
									.map((f) => `${f.label} (${f.stageName})`)
									.slice(0, 4)
									.join(", ");
								toast.error(`Can't mark won — required fields missing`, {
									description: labelList,
									duration: 7000,
								});
								return;
							}
							toast.error(`Couldn't mark ${labels.deal.singular.toLowerCase()} won`, {
								description: normalizeErrorDescription(err),
							});
						}
						return;
					}

					// Non-final stage → existing path
					await moveToStage({
						orgId,
						dealId: itemId as Id<"deals">,
						stageId: toCol,
						sortOrder,
					});
					return;
				}
				if (groupBy === "assignedTo") {
					await updateDeal({
						orgId,
						dealId: itemId as Id<"deals">,
						assignedTo: toCol === NO_GROUP_KEY ? undefined : (toCol as Id<"users">),
						sortOrder,
					});
					return;
				}
				if (groupBy === "tag" || groupBy === "tags") {
					await updateDeal({ orgId, dealId: itemId as Id<"deals">, sortOrder });
					if (fromCol !== NO_GROUP_KEY) {
						await detachTag({
							orgId,
							tagId: fromCol as Id<"tags">,
							entityType: "deal",
							entityId: itemId,
						});
					}
					if (toCol !== NO_GROUP_KEY) {
						await attachTag({
							orgId,
							tagId: toCol as Id<"tags">,
							entityType: "deal",
							entityId: itemId,
						});
					}
					return;
				}
				await updateDeal({ orgId, dealId: itemId as Id<"deals">, sortOrder });
			} catch (err) {
				const errorData = (err as { data?: Record<string, unknown> })?.data;
				const code =
					typeof errorData === "object" && errorData !== null
						? (errorData.code as string | undefined)
						: undefined;

				if (code === "MISSING_REQUIRED_FIELDS") {
					const data = errorData as {
						missingFields?: Array<{ name: string; label: string }>;
						stageName?: string;
					};
					if (onBlockPolicy) {
						onBlockPolicy({
							dealId: itemId,
							targetStageId: toCol,
							targetStageName: data.stageName ?? toCol,
							missingFields: data.missingFields ?? [],
							sortOrder,
						});
					} else {
						const labelList = (data.missingFields ?? [])
							.map((f) => f.label)
							.slice(0, 4)
							.join(", ");
						toast.error(
							`Can't move to ${data.stageName ?? "this stage"} — required fields missing`,
							{ description: labelList, duration: 6000 },
						);
					}
					return;
				}
				toast.error(`Couldn't move ${labels.deal.singular.toLowerCase()}`, {
					description: normalizeErrorDescription(err),
				});
			}
		},
		[
			orgId,
			moveToStage,
			updateDeal,
			pipeline,
			labels.deal.singular,
			groupBy,
			itemsByColumnId,
			rankedItems.items,
			attachTag,
			detachTag,
			onBlockPolicy,
			closeAsDone,
			onMarkLostFromDrag,
		],
	);

	return { boardColumns, itemsByColumnId, handleCardMove };
}

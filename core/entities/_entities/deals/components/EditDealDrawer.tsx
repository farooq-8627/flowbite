"use client";

import { useQuery } from "convex/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import {
	FileBufferProvider,
	useFileBuffer,
} from "@/core/data-io/files/components/CreateModeFileField";
import { EntityFormDrawer } from "@/core/entities/scaffolds/EntityFormDrawer";
import {
	EntityFieldForm,
	type EntityFormValues,
} from "@/core/entities/shared/components/EntityFieldForm";
import { useEntityLabels } from "@/core/shell/shared/hooks/useEntityLabels";
import { useDealFormSubmit } from "../hooks/useDealFormSubmit";

interface EditDealDrawerProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	orgId: Id<"orgs"> | undefined;
	deal: Doc<"deals"> | null;
	/**
	 * `"edit"`      — renders defaults + all stage fields at order ≤ currentStage
	 *                 (the full editable form: title, value, assignee, every
	 *                 stage's pinned fields up to where the deal is now).
	 * `"fillStage"` — renders ONLY *empty* fields pinned to the deal's
	 *                 current stage (the kanban "+ Fill stage X fields" path).
	 * `"editStage"` — renders ONLY the field names passed in
	 *                 `stageFieldNames`, regardless of whether they're filled
	 *                 or empty. Used by the per-stage card "Edit fields" button
	 *                 on the deal detail Overview, so the user can edit
	 *                 just one stage's fields in isolation. The form
	 *                 dialog title uses `stageDisplayName` when provided.
	 */
	mode?: "edit" | "fillStage" | "editStage";
	/**
	 * Required when `mode === "editStage"`. The set of field names to show
	 * in the form. Caller is responsible for picking the right names
	 * (typically `useEntityFields("deal").allFields` filtered by
	 * `showInStages.includes(stageId)`).
	 */
	stageFieldNames?: string[];
	/** Optional pretty stage name for the editStage drawer title. */
	stageDisplayName?: string;
}

const EMPTY: EntityFormValues = {
	columnValues: {},
	customValues: {},
	joinValues: {},
	fieldIdByName: {},
};

export function EditDealDrawer({
	open,
	onOpenChange,
	orgId,
	deal,
	mode = "edit",
	stageFieldNames,
	stageDisplayName,
}: EditDealDrawerProps) {
	const labels = useEntityLabels();
	const [isSubmitting, setIsSubmitting] = useState(false);

	const fileBuffer = useFileBuffer(orgId);
	const { reset: resetFileBuffer } = fileBuffer;

	useEffect(() => {
		if (open) return;
		resetFileBuffer();
	}, [open, resetFileBuffer]);

	const save = useDealFormSubmit(orgId);

	const customValues = useQuery(
		api.crm.fields.fieldValues.queries.getForEntity,
		orgId && deal?._id ? { orgId, entityType: "deal", entityId: deal._id as string } : "skip",
	);

	const customByName = useRef<Record<string, unknown>>({});
	if (customValues) {
		const next: Record<string, unknown> = {};
		for (const v of customValues) next[v.fieldName] = v.value;
		customByName.current = next;
	}

	const stageFieldsResult = useQuery(
		api.crm.entities.deals.queries.getStageFieldsToFill,
		orgId && deal?._id && mode === "fillStage"
			? { orgId, dealId: deal._id as Id<"deals"> }
			: "skip",
	);

	const editableFieldsResult = useQuery(
		api.crm.entities.deals.queries.getEditableFieldsUpToStage,
		orgId && deal?._id && mode === "edit" ? { orgId, dealId: deal._id as Id<"deals"> } : "skip",
	);

	const includeOnly = useMemo<Set<string> | undefined>(() => {
		if (mode === "fillStage") {
			if (!stageFieldsResult) return new Set<string>();
			return new Set(stageFieldsResult.missing.map((f) => f.name));
		}
		if (mode === "editStage") {
			// Caller-supplied: every field pinned to the stage being edited
			// (whether filled or empty). When `stageFieldNames` is missing or
			// empty, render an empty form rather than fall through to "edit"
			// (otherwise the user would suddenly see every field — wrong scope).
			return new Set(stageFieldNames ?? []);
		}
		if (!editableFieldsResult) return new Set<string>();
		return new Set(editableFieldsResult.fieldNames);
	}, [mode, stageFieldsResult, editableFieldsResult, stageFieldNames]);

	const stageHeader = useMemo(() => {
		if (mode !== "fillStage" || !stageFieldsResult) return null;
		if (stageFieldsResult.missing.length === 0) return null;
		return {
			stageName: stageFieldsResult.stageName,
			labels: stageFieldsResult.missing.map((f) => f.label),
		};
	}, [mode, stageFieldsResult]);

	const valuesGetterRef = useRef<() => EntityFormValues>(() => EMPTY);

	const handleSubmit = async () => {
		if (!orgId || !deal) return;
		setIsSubmitting(true);
		try {
			await save({
				dealId: deal._id as Id<"deals">,
				dealCode: deal.dealCode,
				personCode: deal.personCode,
				formValues: valuesGetterRef.current(),
				fileBuffer,
				isCreate: false,
			});
			onOpenChange(false);
		} catch {
			// save() handles toasts
		} finally {
			setIsSubmitting(false);
		}
	};

	const showFillStageEmpty =
		mode === "fillStage" &&
		stageFieldsResult !== undefined &&
		stageFieldsResult !== null &&
		stageFieldsResult.missing.length === 0;

	const drawerTitle =
		mode === "fillStage"
			? `Fill ${stageHeader?.stageName ?? "stage"} fields`
			: mode === "editStage"
				? `Edit ${stageDisplayName ?? "stage"} fields`
				: `Edit ${labels.deal.singular}`;

	return (
		<EntityFormDrawer
			open={open}
			onOpenChange={onOpenChange}
			title={drawerTitle}
			submitLabel="Save"
			onSubmit={handleSubmit}
			isSubmitting={isSubmitting}
			submitDisabled={showFillStageEmpty}
		>
			<FileBufferProvider value={fileBuffer}>
				{mode === "fillStage" && stageHeader && (
					<div className="mb-3 rounded-[var(--radius)] border border-yellow-500/40 bg-yellow-50/40 p-3 text-xs dark:bg-yellow-900/10">
						<p className="font-medium text-yellow-900 dark:text-yellow-200">
							{stageHeader.labels.length}{" "}
							{stageHeader.labels.length === 1 ? "field" : "fields"} to fill on{" "}
							{stageHeader.stageName}
						</p>
						<p className="mt-1 leading-snug text-yellow-900/80 dark:text-yellow-200/80">
							{stageHeader.labels.join(", ")}
						</p>
					</div>
				)}

				{showFillStageEmpty ? (
					<p className="text-sm text-muted-foreground">
						Nothing left to fill on this stage — drag the{" "}
						{labels.deal.singular.toLowerCase()} to the next stage to continue.
					</p>
				) : (
					<EntityFieldForm
						slot="deal"
						orgId={orgId}
						entity={deal as unknown as Record<string, unknown> & { _id: string }}
						customValuesForEntity={customByName.current}
						currentStageId={undefined}
						includeOnly={includeOnly}
						registerGetValues={(getter) => {
							valuesGetterRef.current = getter;
						}}
					/>
				)}
			</FileBufferProvider>
		</EntityFormDrawer>
	);
}
